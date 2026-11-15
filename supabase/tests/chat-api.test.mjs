import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createChatHandler, createSupabaseVerifier} from '../../apps/api/chat.mjs';

const alex = '00000000-0000-4000-8000-000000000001';
const maya = '00000000-0000-4000-8000-000000000002';
const sam = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000010';

test('Supabase identity controls chat permissions and request input cannot override it', async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file,migrations),'utf8'));
  }
  await db.query('insert into auth.users values ($1),($2),($3)', [alex,maya,sam]);
  await db.exec(`insert into spotme_private.cities (province,municipality_code,name) values ('ON','test-city','Kitchener');`);
  for (const [id,name] of [[alex,'Alex'],[maya,'Maya'],[sam,'Sam']]) {
    await db.query(`insert into spotme_private.profiles (user_id,date_of_birth,display_name,city_id,status)
      values ($1,'1990-01-01',$2,1,'active')`, [id,name]);
  }
  await db.query("select spotme_private.record_swipe($1,$2,'like')", [alex,maya]);
  await db.query("select spotme_private.record_swipe($1,$2,'like')", [maya,alex]);
  await db.exec('set role spotme_chat_api');
  await assert.rejects(db.query('select date_of_birth from spotme_private.profiles'), {code:'42501'});
  await assert.rejects(db.query('select * from spotme_private.messages'), {code:'42501'});
  await assert.rejects(db.query("select spotme_private.record_swipe($1,$2,'like')", [sam,alex]), {code:'42501'});
  let authCalls = 0;
  const verify = createSupabaseVerifier({url:'https://project.example',apiKey:'test-publishable-key',fetchUser:async (url,init) => {
    authCalls++;
    assert.equal(url.href,'https://project.example/auth/v1/user');
    assert.equal(init.headers.apikey,'test-publishable-key');
    assert.equal(init.redirect,'error');
    const account = init.headers.authorization.split(' ')[1];
    if (account === 'down.auth.test') return new Response(null,{status:503});
    if (account === 'pending.auth.test') return Response.json({id:alex,role:'authenticated'});
    const id = {'alex.auth.test':alex,'maya.auth.test':maya,'sam.auth.test':sam}[account];
    return id ? Response.json({id,role:'authenticated',email_confirmed_at:'2026-01-01'}) : new Response(null,{status:401});
  }});
  const handler = createChatHandler({verify,db});
  function call(path, {who, method = 'GET', body, raw} = {}) {
    const headers = {};
    if (who) headers.authorization = `Bearer ${who}.auth.test`;
    if (body || raw) headers['content-type'] = 'application/json';
    return handler(new Request(`https://spotme.example${path}`, {method,headers,body:raw ?? (body && JSON.stringify(body))}));
  }
  const conversation = `/v1/matches/${maya}/messages`;
  assert.equal((await call('/v1/matches')).status,401);
  assert.equal(authCalls,0);
  assert.equal((await call('/v1/matches',{who:'expired'})).status,401);
  assert.equal((await call('/v1/matches',{who:'pending'})).status,401);
  assert.equal((await call('/v1/matches',{who:'down'})).status,503);
  assert.deepEqual((await (await call('/v1/matches',{who:'sam'})).json()).matches,[]);
  const list = await call('/v1/matches',{who:'alex'});
  assert.equal(list.headers.get('cache-control'),'no-store');
  const [match] = (await list.json()).matches;
  assert.equal(match.peer_id,maya);
  assert.deepEqual(Object.keys(match).sort(),['display_name','matched_at','peer_id']);
  assert.deepEqual((await (await call(`/v1/matches?after=${maya}`,{who:'alex'})).json()).matches,[]);
  assert.equal((await call(conversation,{who:'sam'})).status,404);
  const payload = {client_message_id:requestId,body:'Hello!'};
  const send = (who,body) => call(conversation,{who,method:'POST',body});
  assert.equal((await send('sam',{...payload,actor_id:alex})).status,422);
  assert.equal((await send('sam',payload)).status,404);
  assert.equal((await call(conversation,{who:'alex',method:'POST',raw:'x'.repeat(17000)})).status,413);
  const first = await send('alex',payload);
  assert.equal(first.status,200);
  const saved = await first.json();
  assert.equal(typeof saved.id,'string');
  assert.deepEqual(await (await send('alex',payload)).json(),saved);
  const history = await (await call(`/v1/matches/${alex}/messages`,{who:'maya'})).json();
  assert.equal(history.messages.length,1);
  assert.equal(history.messages[0].body,'Hello!');
  assert.equal(history.messages[0].sender_id,alex);
  assert.equal((await call(`/v1/blocks/${alex}`,{who:'maya',method:'POST'})).status,204);
  assert.equal((await call(conversation,{who:'alex'})).status,404);
  assert.equal((await send('alex',payload)).status,404);
  assert.deepEqual((await (await call('/v1/matches',{who:'alex'})).json()).matches,[]);
});
