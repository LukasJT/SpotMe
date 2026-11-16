import {createHash, createHmac, randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {GoogleAuth, OAuth2Client} from 'google-auth-library';
import {HttpError, httpOrigin, json, readJson} from './chat.mjs';

const playPackage = 'com.spotmedating.android';
const playProduct = 'spotme_premium';
const playPlans = new Set(['weekly','monthly']);
const playToken = /^[\w.~-]{20,4096}$/;
const stripeSub = /^sub_[a-zA-Z0-9]+$/;
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const result = async (db,sql,args=[]) => (await db.query(sql,args)).rows[0];

async function readRaw(request,limit) {
  if (!request.body || Number(request.headers.get('content-length'))>limit) {
    throw new HttpError(413,'body_too_large');
  }
  let length=0;
  const chunks=[];
  for await (const chunk of request.body) {
    length+=chunk.byteLength;
    if (length>limit) throw new HttpError(413,'body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,length);
}

async function stripeCheckoutLock(db,environment,actor,work) {
  const client=await db.connect();
  try {
    await client.query('begin');
    await client.query('select spotme_private.lock_stripe_checkout($1,$2)',[environment,actor]);
    const value=await work(client);
    await client.query('commit');
    return value;
  } catch (error) {
    await client.query('rollback').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}

function createStripeBilling({environment, stripe, db, prices, webhookSecret, origin}) {
  const site=httpOrigin(origin);
  const isLive=environment==='Production';
  const home=new URL('/',site).href;
  const findCustomer=(client,actor)=>result(client,
    'select spotme_private.stripe_customer($1,$2) as id',[environment,actor]);

  async function checkout(actor,plan) {
    if (!Object.hasOwn(prices,plan)) throw new HttpError(422,'invalid_plan');
    return stripeCheckoutLock(db,environment,actor,async client=>{
      const {active}=await result(client,'select spotme_private.has_premium($1,$2) as active',[actor,environment]);
      if (active) throw new HttpError(409,'premium_already_active');
      let {id:customer}=await findCustomer(client,actor);
      if (!customer) {
        const created=await stripe.customers.create({metadata:{spotme_account:actor}},
          {idempotencyKey:`spotme-customer-${environment}-${actor}`});
        ({id:customer}=await result(client,'select spotme_private.save_stripe_customer($1,$2,$3) as id',
          [environment,actor,created.id]));
      }
      const subscriptions=await stripe.subscriptions.list({customer,status:'all',limit:100});
      if (subscriptions.has_more || subscriptions.data.some(sub=>
        !['canceled','incomplete_expired'].includes(sub.status))) {
        throw new HttpError(409,'stripe_subscription_exists');
      }
      const sessions=await stripe.checkout.sessions.list({customer,status:'open',limit:1});
      if (sessions.data[0]) {
        // Require the customer to cancel the current checkout if they want a different plan.
        if (sessions.data[0].metadata?.spotme_plan !== plan) {
          throw new HttpError(409,'checkout_plan_pending');
        }
        return sessions.data[0].url;
      }
      const session=await stripe.checkout.sessions.create({
        customer,mode:'subscription',line_items:[{price:prices[plan],quantity:1}],
        metadata:{spotme_plan:plan},
        subscription_data:{metadata:{spotme_account:actor}},
        client_reference_id:actor,
        success_url:new URL('/?premium=returned',site).href,
        cancel_url:new URL('/?premium=cancelled',site).href
      },{idempotencyKey:`spotme-checkout-${customer}-${plan}-${randomUUID()}`});
      return session.url;
    });
  }

  async function cancelCheckout(actor) {
    await stripeCheckoutLock(db,environment,actor,async client=>{
      const {id:customer}=await findCustomer(client,actor);
      if (!customer) return;
      const sessions=await stripe.checkout.sessions.list({customer,status:'open',limit:10});
      for (const session of sessions.data) await stripe.checkout.sessions.expire(session.id);
    });
  }

  async function portal(actor) {
    const {id:customer}=await findCustomer(db,actor);
    if (!customer) throw new HttpError(404,'stripe_customer_missing');
    return (await stripe.billingPortal.sessions.create({customer,return_url:home})).url;
  }

  async function webhook(request) {
    try {
      const signature=request.headers.get('stripe-signature');
      if (!signature) return json({error:'invalid_signature'},400);
      const raw=await readRaw(request,128*1024);
      let event;
      try { event=stripe.webhooks.constructEvent(raw,signature,webhookSecret); }
      catch { return json({error:'invalid_signature'},400); }
      if (event.livemode!==isLive) return json({error:'wrong_environment'},400);
      const object=event.data.object;
      let id;
      if (event.type.startsWith('customer.subscription.')) {
        id=object.id;
      } else if (event.type==='invoice.paid' || event.type==='invoice.payment_failed') {
        const subscription=object.parent?.subscription_details?.subscription ?? object.subscription;
        id=typeof subscription==='string' ? subscription : subscription?.id;
        if (!id) return json(null,204);
      } else {
        return json(null,204);
      }
      if (!stripeSub.test(id)) return json({error:'invalid_subscription'},422);
      const {ticket}=await result(db,'select spotme_private.next_apple_sync_ticket() as ticket');
      // Retrieve current status so retries and out-of-order events cannot restore stale access.
      const subscription=await stripe.subscriptions.retrieve(id);
      if (subscription.livemode!==isLive) return json({error:'wrong_environment'},400);
      const {owner}=await result(db,'select spotme_private.stripe_customer_owner($1,$2) as owner',
        [environment,subscription.customer]);
      if (!owner || subscription.metadata?.spotme_account!==owner) return json(null,204);
      const allowed=new Set(Object.values(prices));
      const line=subscription.items.data.find(item=>allowed.has(item.price.id));
      const until=subscription.status==='active' && line && Number.isSafeInteger(line.current_period_end)
        ? new Date(line.current_period_end*1000) : null;
      await db.query('select spotme_private.record_external_subscription($1,$2,$3,$4,$5,$6,$7)',
        ['stripe',environment,id,owner,until,ticket,null]);
      return json(null,204);
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.code},error.status);
      return json({error:'billing_unavailable'},503);
    }
  }

  return {environment,checkout,cancelCheckout,portal,webhook,customerExists:async actor=>Boolean((await findCustomer(db,actor)).id)};
}

function createPlayBilling({environment, db, secret, google, verifyPush}) {
  const accountFor=actor=>createHmac('sha256',secret).update(actor.toLowerCase()).digest('hex');

  async function reconcile(token, actor = null) {
    if (typeof token!=='string' || !playToken.test(token)) throw new HttpError(422,'invalid_purchase_token');
    const hashed=tokenHash(token);
    const owner=actor ?? (await result(db,'select spotme_private.external_subscription_owner($1,$2,$3) as id',
      ['play',environment,hashed])).id;
    if (!owner) return;
    const {ticket}=await result(db,'select spotme_private.next_apple_sync_ticket() as ticket');
    const purchase=await google.get(token);
    if ((purchase.testPurchase != null)!==(environment==='Sandbox')) {
      throw new HttpError(422,'wrong_environment');
    }
    if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId!==accountFor(owner)) {
      throw new HttpError(403,'subscription_account_mismatch');
    }
    const line=(purchase.lineItems??[]).find(item=>item.productId===playProduct &&
      playPlans.has(item.offerDetails?.basePlanId) && item.autoRenewingPlan);
    if (!line) throw new HttpError(422,'invalid_subscription');
    const state=purchase.subscriptionState;
    if (state==='SUBSCRIPTION_STATE_PENDING' || state==='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') return;
    const expiry=Date.parse(line.expiryTime);
    const eligible=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(state);
    const until=eligible && Number.isFinite(expiry) ? new Date(expiry) : null;
    const replaced=purchase.linkedPurchaseToken;
    const previous=typeof replaced==='string' && playToken.test(replaced) ? tokenHash(replaced) : null;
    await db.query('select spotme_private.record_external_subscription($1,$2,$3,$4,$5,$6,$7)',
      ['play',environment,hashed,owner,until,ticket,previous]);
    if (until && expiry>Date.now() && purchase.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING') {
      try { await google.acknowledge(token); }
      catch (error) {
        // A concurrent claim may already have acknowledged it.
        const reread=await google.get(token);
        if (reread.acknowledgementState!=='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') throw error;
      }
    }
  }

  async function notification(request) {
    try {
      if (!await verifyPush(request)) return json({error:'authentication_required'},401);
      const {message}=await readJson(request);
      if (typeof message?.data!=='string') return json({error:'invalid_notification'},422);
      let notice;
      try { notice=JSON.parse(Buffer.from(message.data,'base64').toString('utf8')); }
      catch { return json({error:'invalid_notification'},422); }
      if (notice.packageName!==playPackage) return json({error:'invalid_package'},422);
      const token=notice.subscriptionNotification?.purchaseToken ?? notice.voidedPurchaseNotification?.purchaseToken;
      if (token) await reconcile(token);
      return json(null,204);
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.code},error.status);
      return json({error:'billing_unavailable'},503);
    }
  }

  return {environment,accountFor,claim:reconcile,notification};
}

async function configureStripeBilling(env,db,origin,environment) {
  const stripe=new Stripe(env.SPOTME_STRIPE_SECRET_KEY,{timeout:8000,maxNetworkRetries:1});
  const prices={weekly:env.SPOTME_STRIPE_WEEKLY_PRICE,monthly:env.SPOTME_STRIPE_MONTHLY_PRICE};
  if (!env.SPOTME_STRIPE_WEBHOOK_SECRET || !prices.weekly || !prices.monthly || prices.weekly===prices.monthly) {
    throw new Error('Set the Stripe webhook secret and both price IDs.');
  }
  await Promise.all(Object.entries(prices).map(async ([name,id])=>{
    const price=await stripe.prices.retrieve(id);
    if (!price.active || price.livemode!==(environment==='Production') || price.currency!=='cad' ||
        price.unit_amount!==(name==='weekly'?400:1000) || price.recurring?.interval!==(name==='weekly'?'week':'month') ||
        price.recurring.interval_count!==1 || price.recurring.usage_type!=='licensed') {
      throw new Error('Configure matching CAD 4 weekly and CAD 10 monthly Stripe prices.');
    }
  }));
  return createStripeBilling({stripe,db,environment,origin,prices,webhookSecret:env.SPOTME_STRIPE_WEBHOOK_SECRET});
}

async function configurePlayBilling(env,db,environment) {
  const secret=env.SPOTME_PLAY_ACCOUNT_SECRET;
  const email=env.SPOTME_PLAY_PUSH_SERVICE_ACCOUNT;
  const audience=env.SPOTME_PLAY_PUSH_AUDIENCE;
  if (!secret || Buffer.byteLength(secret)<32 || !email || !audience) {
    throw new Error('Configure a stable Play account secret and authenticated Pub/Sub push.');
  }
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const client=await auth.getClient();
  const issuer=new OAuth2Client();
  const endpoint=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${playPackage}/purchases`;
  async function verifyPush(request) {
    const bearer=/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(request.headers.get('authorization')??'');
    if (!bearer) return false;
    const ticket=await issuer.verifyIdToken({idToken:bearer[1],audience}).catch(()=>null);
    const claims=ticket?.getPayload();
    return claims?.email_verified===true && claims.email===email;
  }
  const google={
    async get(token) {
      try {
        return (await client.request({url:`${endpoint}/subscriptionsv2/tokens/${encodeURIComponent(token)}`,timeout:8000})).data;
      } catch (error) {
        if (error.response?.status===404 || error.response?.status===410) throw new HttpError(422,'invalid_purchase_token');
        throw new HttpError(503,'play_unavailable');
      }
    },
    async acknowledge(token) {
      await client.request({url:`${endpoint}/subscriptions/${playProduct}/tokens/${encodeURIComponent(token)}:acknowledge`,method:'POST',data:{},timeout:8000});
    }
  };
  return createPlayBilling({environment,db,secret,google,verifyPush});
}

export {createPlayBilling,createStripeBilling,configurePlayBilling,configureStripeBilling};
