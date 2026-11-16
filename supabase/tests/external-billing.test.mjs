import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createChatHandler} from '../../apps/api/chat.mjs';
import {createBrowserHandler} from '../../apps/api/browser.mjs';
import {createPlayBilling,createStripeBilling} from '../../apps/api/external-billing.mjs';

const alex='00000000-0000-4000-8000-000000000001';
const maya='00000000-0000-4000-8000-000000000002';
const origin='https://members.example';
const verified=new Map([['alex.test.token',alex],['maya.test.token',maya]]);
const expires=new Date(Date.now()+86400000);
const purchaseToken='play-token-sample-active-aaaaaaaa';
const newToken='play-token-sample-new-bbbbbbbb';

test('Play and Stripe unlock the same account, with protected callbacks, renewal handling, and sandbox isolation', async t=>{
  const db=await PGlite.create();
  t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)');
  const migrations=new URL('../migrations/',import.meta.url);
  for (const file of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file,migrations),'utf8'));
  }
  await db.query('insert into auth.users values($1),($2)',[alex,maya]);
  const asRole=(role)=>({
    async query(...args) {
      return db.transaction(async tx=>{await tx.exec(`set local role ${role}`);return tx.query(...args);});
    }
  });
  // Stripe checkout needs one connection throughout its transaction.
  await db.exec('set role spotme_external_billing');
  await assert.rejects(db.query('select * from spotme_private.external_subscriptions'),{code:'42501'});
  await assert.rejects(db.query('select * from spotme_private.profiles'),{code:'42501'});
  await db.exec('reset role');
  const external=asRole('spotme_external_billing');
  external.connect=async()=>({
    async query(sql,args) {
      if (sql==='begin') return db.exec('begin; set local role spotme_external_billing;');
      return db.query(sql,args);
    },
    release(){}
  });
  const member=asRole('spotme_chat_api');
  const valid=async (actor, env='Sandbox')=>(await member.query(
    'select spotme_private.has_premium($1,$2) as result',[actor,env])).rows[0].result;

  let acknowledged=0;
  const purchases=new Map();
  const google={
    get:async token=>structuredClone(purchases.get(token)),
    acknowledge:async token=>{
      acknowledged++;
      purchases.get(token).acknowledgementState='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    }
  };
  const play=createPlayBilling({environment:'Sandbox',db:external,secret:'stable-fixture-key',
    google,verifyPush:async request=>request.headers.get('authorization')==='Bearer valid-push'});
  const fixture=(boundUser,extra={})=>({
    testPurchase:{},externalAccountIdentifiers:{obfuscatedExternalAccountId:play.accountFor(boundUser)},
    subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
    lineItems:[{productId:'spotme_premium',offerDetails:{basePlanId:'weekly'},autoRenewingPlan:{},expiryTime:expires.toISOString()}],
    ...extra
  });
  purchases.set(purchaseToken,fixture(alex,{subscriptionState:'SUBSCRIPTION_STATE_PENDING'}));

  let stripeCreates=0, currentSubscription=null, currentSession=null;
  const stripe=createStripeBilling({environment:'Sandbox',db:external,origin,webhookSecret:'whsec_test',
    prices:{weekly:'price_week',monthly:'price_month'},stripe:{
      customers:{create:async ({metadata})=>({id:metadata.spotme_account===alex?'cus_alex':'cus_maya'})},
      subscriptions:{list:async()=>({data:currentSubscription?[currentSubscription]:[]}),retrieve:async()=>currentSubscription},
      checkout:{sessions:{
        list:async()=>({data:currentSession?[currentSession]:[]}),
        create:async data=>{
          assert.equal(data.customer,'cus_maya');
          assert.equal(data.subscription_data.metadata.spotme_account,maya);
          stripeCreates++;
          currentSession={id:'cs_test',url:'https://checkout.stripe.com/c/pay/test',metadata:data.metadata};
          return currentSession;
        },
        expire:async()=>{currentSession=null;}
      }},
      billingPortal:{sessions:{create:async ({customer})=>{
        assert.equal(customer,'cus_maya');return {url:'https://billing.stripe.com/test'};
      }}},
      webhooks:{constructEvent(raw,signature,secret){
        if (signature!=='expected' || secret!=='whsec_test') throw new Error('invalid signature');
        return JSON.parse(raw.toString());
      }}
    }});
  const chat=createChatHandler({verify:async token=>verified.get(token),db:member,playBilling:play,stripeBilling:stripe});
  const api=(path,who='alex',data)=>chat(new Request(origin+path,{
    method:data?'POST':'GET',
    headers:{'authorization':`Bearer ${who}.test.token`,'content-type':'application/json'},
    body:data?JSON.stringify(data):undefined
  }));
  const claim=(token,who='alex')=>api('/v1/me/play-billing',who,{purchaseToken:token});
  const notice=(token,auth)=>play.notification(new Request(origin+'/play/notifications',{
    method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},
    body:JSON.stringify({message:{data:Buffer.from(JSON.stringify({packageName:'com.spotmedating.android',
      subscriptionNotification:{purchaseToken:token}})).toString('base64')}})
  }));
  const event=(status,signature='expected',livemode=false)=>stripe.webhook(new Request(origin+'/stripe/webhook',{
    method:'POST',headers:{'stripe-signature':signature},body:JSON.stringify({
      type:`customer.subscription.${status}`,livemode,data:{object:{id:'sub_maya'}}
    })
  }));
  const invoice=type=>stripe.webhook(new Request(origin+'/stripe/webhook',{
    method:'POST',headers:{'stripe-signature':'expected'},body:JSON.stringify({
      type,livemode:false,data:{object:{parent:{subscription_details:{subscription:'sub_maya'}}}}
    })
  }));

  assert.equal((await claim(purchaseToken)).status,200);
  assert.equal(await valid(alex),false);
  assert.equal(acknowledged,0);
  purchases.set(purchaseToken,fixture(alex,{testPurchase:null}));
  assert.equal((await claim(purchaseToken)).status,422);
  purchases.set(purchaseToken,fixture(alex));
  assert.equal((await claim(purchaseToken,'maya')).status,403);
  assert.equal((await notice(purchaseToken,'valid-push')).status,204);
  assert.equal(await valid(alex),false,'an unclaimed notification must not attach a subscription');
  assert.equal((await claim(purchaseToken)).status,200);
  assert.equal(await valid(alex),true);
  assert.equal(await valid(alex,'Production'),false);
  assert.equal(acknowledged,1);
  assert.equal((await claim(purchaseToken)).status,200);
  assert.equal(acknowledged,1);
  assert.equal((await api('/v1/me/stripe-checkout','alex',{plan:'monthly'})).status,409);
  assert.equal((await api('/v1/me/stripe-checkout','maya',{plan:'monthly',price:'price_forged'})).status,422);

  const browser=createBrowserHandler({origin,verify:async token=>verified.get(token),chat,
    exchange:async ()=>({token:'maya.test.token',seconds:600})});
  const login=await browser(new Request(origin+'/browser/sign-in',{method:'POST',
    headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'maya@example.test',password:'fixture'})}));
  assert.equal(login.status,204);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  async function web(path,data,selectedOrigin=origin) {
    return browser(new Request(origin+path,{method:data?'POST':'GET',
      headers:{cookie,origin:selectedOrigin,'content-type':'application/json'},body:data?JSON.stringify(data):undefined}));
  }
  assert.equal((await web('/v1/me/stripe-checkout',{plan:'monthly'},'https://elsewhere.example')).status,403);
  assert.equal((await web('/v1/me/stripe-checkout',{plan:'monthly'})).status,200);
  assert.equal((await web('/v1/me/stripe-checkout',{plan:'monthly'})).status,200);
  assert.equal(stripeCreates,1);
  assert.equal((await web('/v1/me/stripe-checkout',{plan:'weekly'})).status,409);
  assert.equal((await web('/v1/me/stripe-cancel-checkout',{})).status,204);
  assert.equal((await web('/v1/me/stripe-checkout',{plan:'monthly'})).status,200);
  assert.equal(stripeCreates,2);
  assert.equal((await (await web('/v1/me/premium')).json()).active,false,'starting checkout never grants access');

  currentSubscription={status:'active',livemode:false,customer:'cus_maya',metadata:{spotme_account:alex},
    items:{data:[{price:{id:'price_month'},current_period_end:Math.floor(expires.getTime()/1000)}]}};
  assert.equal((await event('created','forged')).status,400);
  assert.equal((await event('created','expected',true)).status,400);
  assert.equal((await event('created')).status,204);
  assert.equal(await valid(maya),false,'a customer and account metadata must agree');
  currentSubscription.metadata.spotme_account=maya;
  assert.equal((await event('updated')).status,204);
  assert.equal((await (await web('/v1/me/premium')).json()).active,true);
  assert.equal((await (await api('/v1/me/play-billing','maya')).json()).active,true);
  assert.equal(await valid(maya,'Production'),false);
  assert.equal((await web('/v1/me/stripe-portal',{})).status,200);
  currentSubscription.status='past_due';
  assert.equal((await invoice('invoice.payment_failed')).status,204);
  assert.equal(await valid(maya),false);
  currentSubscription.status='active';
  assert.equal((await invoice('invoice.paid')).status,204);
  assert.equal(await valid(maya),true);
  currentSubscription.status='canceled';
  assert.equal((await event('deleted')).status,204);
  assert.equal((await event('created')).status,204,'an out-of-order event still fetches current provider status');
  assert.equal(await valid(maya),false);

  purchases.set(newToken,fixture(alex,{linkedPurchaseToken:purchaseToken}));
  assert.equal((await claim(newToken)).status,200);
  purchases.get(newToken).subscriptionState='SUBSCRIPTION_STATE_EXPIRED';
  assert.equal((await notice(newToken,'forged')).status,401);
  assert.equal(await valid(alex),true);
  assert.equal((await notice(newToken,'valid-push')).status,204);
  assert.equal((await claim(purchaseToken)).status,200);
  assert.equal(await valid(alex),false,'a replacement tombstone blocks restoration of the preceding token');
  await db.exec('set role spotme_chat_api');
  await assert.rejects(db.query('select spotme_private.external_subscription_owner($1,$2,$3)',['play','Sandbox',purchaseToken]),{code:'42501'});
});
