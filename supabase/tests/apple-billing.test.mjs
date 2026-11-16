import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createAppleBilling} from '../../apps/api/apple-billing.mjs';
import {createChatHandler} from '../../apps/api/chat.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const monthly = 'com.spotmedating.ios.premium.monthly';
const original = '1000000001';
const after = new Date('2099-01-01').getTime();
const claim = 'apple.claim.signature';
const current = 'apple.current.signature';
const notice = 'apple.notice.signature';
const renewal = 'apple.renewal.signature';

test('Apple access belongs to its account, follows current status, and is isolated by environment', async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)');
  const root = new URL('../migrations/',import.meta.url);
  for (const name of (await readdir(root)).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name,root),'utf8'));
  }
  await db.query('insert into auth.users values ($1),($2)',[owner,other]);
  const as = role => ({
    query(sql,args) {
      return db.transaction(async tx => {
        await tx.exec('set local role '+role);
        return tx.query(sql,args);
      });
    }
  });
  const billingDB = as('spotme_apple_billing');
  const memberDB = as('spotme_chat_api');
  const subscription = {productId:monthly,originalTransactionId:original,appAccountToken:owner,expiresDate:after};
  let status = 1;
  let outage = false;
  let dropToken = false;
  const verifier = {
    async verifyAndDecodeTransaction(value) {
      if (value === claim) return subscription;
      if (value === current) return {...subscription,appAccountToken:dropToken ? undefined : owner};
      throw new Error('Invalid signature');
    },
    async verifyAndDecodeNotification(value) {
      if (value !== notice) throw new Error('Invalid signature');
      return {notificationType:'DID_RENEW',data:{signedTransactionInfo:current}};
    },
    async verifyAndDecodeRenewalInfo(value) {
      assert.equal(value,renewal);
      return {originalTransactionId:original,gracePeriodExpiresDate:after};
    }
  };
  const apple = {
    async getAllSubscriptionStatuses(id) {
      assert.equal(id,original);
      if (outage) throw new Error('Apple unavailable');
      return {data:[{lastTransactions:[{status,originalTransactionId:original,
        signedTransactionInfo:current,signedRenewalInfo:renewal}]}]};
    }
  };
  const verify = async token => ({'test.owner.token':owner,'test.other.token':other})[token];
  const makeBilling = environment => createAppleBilling({environment,db:billingDB,verifier,apple});
  const production = makeBilling('Production');
  const sandbox = makeBilling('Sandbox');
  const productionAPI = createChatHandler({verify,db:memberDB,appleBilling:production});
  const sandboxAPI = createChatHandler({verify,db:memberDB,appleBilling:sandbox});
  function call(api, actor, signed) {
    return api(new Request('https://example.test/v1/me/apple-billing',{
      method:signed === undefined ? 'GET' : 'POST',
      headers:{authorization:`Bearer test.${actor}.token`,'content-type':'application/json'},
      body:signed === undefined ? undefined : JSON.stringify({signedTransaction:signed})
    }));
  }
  const notify = (api,signed=notice) => api.receive(new Request('https://example.test/apple/notifications',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({signedPayload:signed})
  }));

  await assert.rejects(memberDB.query('select spotme_private.next_apple_sync_ticket()'), {code:'42501'});
  await assert.rejects(memberDB.query('select * from spotme_private.apple_subscriptions'), {code:'42501'});
  await assert.rejects(billingDB.query('select * from spotme_private.apple_subscriptions'), {code:'42501'});
  assert.equal((await call(productionAPI,'owner','bad.claim.signature')).status,422);
  assert.equal((await call(productionAPI,'other',claim)).status,403);
  assert.equal((await notify(production,'bad.notice.signature')).status,422);
  assert.deepEqual(await (await call(sandboxAPI,'owner',claim)).json(),{enabled:true,active:true,accountToken:owner});
  assert.equal((await (await call(productionAPI,'owner')).json()).active,false);
  assert.equal((await (await call(productionAPI,'owner',claim)).json()).active,true);

  const {rows:[{ticket}]} = await billingDB.query('select spotme_private.next_apple_sync_ticket() as ticket');
  await assert.rejects(billingDB.query('select spotme_private.record_apple_subscription($1,$2,$3,$4,$5,$6)',
    ['Production',original,other,monthly,new Date(after),ticket]), {code:'42501'});
  outage = true;
  assert.equal((await notify(production)).status,503);
  assert.equal((await (await call(productionAPI,'owner')).json()).active,true);
  outage = false;
  status = 4;
  assert.equal((await notify(production)).status,204);
  assert.equal((await (await call(productionAPI,'owner')).json()).active,true);
  status = 5;
  dropToken = true;
  assert.equal((await notify(production)).status,204);
  assert.equal((await (await call(productionAPI,'owner')).json()).active,false);

  await billingDB.query('select spotme_private.record_apple_subscription($1,$2,$3,$4,$5,$6)',
    ['Production',original,owner,monthly,new Date(after),ticket]);
  assert.equal((await (await call(productionAPI,'owner')).json()).active,false);
});
