import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBrowserHandler, createPasswordExchange} from '../../apps/api/browser.mjs';

const site = 'https://spotme.example';
const accessToken = 'example.access.token';

function fixture() {
  let clock = 1000;
  let calls = 0;
  const exchange = createPasswordExchange({url:'https://project.example',apiKey:'sample-key',fetchToken:async (url,init)=>{
    calls++;
    assert.equal(url.href,'https://project.example/auth/v1/token?grant_type=password');
    assert.equal(init.headers.apikey,'sample-key');
    assert.equal(init.redirect,'error');
    const {email,password} = JSON.parse(init.body);
    if (password !== 'sample passphrase' || email !== 'member@example.test') return new Response(null,{status:400});
    return Response.json({access_token:accessToken,refresh_token:'private-refresh',expires_in:60});
  }});
  const app = createBrowserHandler({origin:site,exchange,verify:async token=>token === accessToken,
    chat:async request=>{
      assert.equal(request.headers.get('authorization'),`Bearer ${accessToken}`);
      assert.equal(request.headers.get('cookie'),null);
      if (request.method === 'POST') assert.deepEqual(await request.json(),{body:'test'});
      return Response.json({ok:true});
    },now:()=>clock});
  const call = (path,{method='GET',origin=site,cookie,body}={})=>{
    const headers = {origin};
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    return app(new Request(site+path,{method,headers,body:body && JSON.stringify(body)}));
  };
  const login = (params={})=>call('/browser/sign-in',{method:'POST',body:{email:'member@example.test',password:'sample passphrase'},...params});
  return {call,login,advance:amount=>{clock+=amount;},calls:()=>calls};
}

test('browser sessions use opaque cookies, rotate on sign-in, and revoke on sign-out',async()=>{
  const {call,login,advance,calls} = fixture();
  assert.equal((await call('/v1/matches')).status,401);
  assert.equal((await login({origin:'https://elsewhere.example'})).status,403);
  assert.equal(calls(),0);
  assert.equal((await login({body:{email:'member@example.test',password:'wrong'}})).status,401);
  const response = await login();
  assert.equal(response.status,204);
  assert.equal(await response.text(),'');
  const header = response.headers.get('set-cookie');
  assert.match(header,/^__Host-spotme=[\da-f]{64}; Max-Age=60; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  assert.ok(!header.includes(accessToken));
  const old = header.split(';')[0];
  const second = (await login({cookie:old})).headers.get('set-cookie').split(';')[0];
  assert.notEqual(old,second);
  assert.equal((await call('/v1/matches',{cookie:old})).status,401);
  assert.equal((await call('/v1/matches',{cookie:second})).status,200);
  assert.equal((await call('/v1/matches/test/messages',{cookie:second,method:'POST',origin:'https://elsewhere.example',body:{body:'test'}})).status,403);
  assert.equal((await call('/v1/matches/test/messages',{cookie:second,method:'POST',body:{body:'test'}})).status,200);
  const signOut = await call('/browser/sign-out',{cookie:second,method:'POST'});
  assert.equal(signOut.status,204);
  assert.match(signOut.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await call('/v1/matches',{cookie:second})).status,401);
  const third = (await login()).headers.get('set-cookie').split(';')[0];
  advance(60_001);
  assert.equal((await call('/v1/matches',{cookie:third})).status,401);
});
