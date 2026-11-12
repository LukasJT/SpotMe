import {randomBytes} from 'node:crypto';
import {httpOrigin, HttpError, json, readJson} from './chat.mjs';

function createPasswordExchange({url, apiKey, fetchToken = fetch}) {
  const endpoint = new URL('/auth/v1/token?grant_type=password', httpOrigin(url));
  return async function exchange(email,password) {
    try {
      const response = await fetchToken(endpoint, {method:'POST', redirect:'error', signal:AbortSignal.timeout(5000),
        headers:{apikey:apiKey,'content-type':'application/json'}, body:JSON.stringify({email,password})});
      if ([400,401,403,422].includes(response.status)) return null;
      if (response.status === 429) throw new HttpError(429,'try_again_later');
      if (!response.ok) throw new Error('Auth request failed');
      const token = await response.json();
      if (typeof token.access_token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token.access_token) ||
          token.access_token.length > 8000 || !Number.isInteger(token.expires_in) || token.expires_in < 1) throw new Error('Invalid Auth response');
      return {token:token.access_token, seconds:Math.min(token.expires_in,3600)};
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503,'auth_unavailable');
    }
  };
}

function createBrowserHandler({origin, exchange, verify, chat, now = Date.now}) {
  const site = httpOrigin(origin);
  const secure = site.protocol === 'https:';
  const cookieName = secure ? '__Host-spotme' : 'spotme_local';
  const sessions = new Map();
  let attempts = 0, windowEnd = 0;

  function cookieId(request) {
    const prefix = `${cookieName}=`;
    const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
    const id = cookies.length === 1 ? cookies[0].slice(prefix.length) : '';
    return /^[\da-f]{64}$/.test(id) ? id : '';
  }
  function setCookie(response, id = '', seconds = 0) {
    response.headers.set('set-cookie', `${cookieName}=${id}; Max-Age=${seconds}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
    return response;
  }
  function requireSameOrigin(request) {
    if (request.headers.get('origin') !== site.origin) throw new HttpError(403,'origin_required');
  }
  function limitSignIn() {
    const time = now();
    if (time >= windowEnd) { attempts = 0; windowEnd = time + 60_000; }
    if (++attempts > 30) throw new HttpError(429,'try_again_later');
  }

  return async function browser(request) {
    try {
      const path = new URL(request.url).pathname;
      const signIn = request.method === 'POST' && path === '/browser/sign-in';
      const signOut = request.method === 'POST' && path === '/browser/sign-out';
      const api = path.startsWith('/v1/');
      if (api && request.headers.has('authorization')) return chat(request);
      if (!signIn && !signOut && !api) return json({error:'not_found'},404);
      if (!['GET','HEAD'].includes(request.method)) requireSameOrigin(request);
      const id = cookieId(request);
      if (signOut) {
        sessions.delete(id);
        return setCookie(json(null,204));
      }
      if (signIn) {
        limitSignIn();
        const input = await readJson(request);
        const email = typeof input?.email === 'string' ? input.email.trim() : '';
        const password = typeof input?.password === 'string' ? input.password : '';
        if (!email || email.length > 254 || !password || password.length > 1024 ||
            Object.keys(input).some(key => !['email','password'].includes(key))) throw new HttpError(422,'invalid_credentials');
        const result = await exchange(email,password);
        if (!result || !await verify(result.token)) throw new HttpError(401,'invalid_credentials');
        for (const [key, session] of sessions) if (session.expiry <= now()) sessions.delete(key);
        if (sessions.size >= 1024 && !sessions.has(id)) throw new HttpError(503,'session_capacity');
        sessions.delete(id);
        const replacement = randomBytes(32).toString('hex');
        sessions.set(replacement,{token:result.token,expiry:now()+result.seconds*1000});
        return setCookie(json(null,204),replacement,result.seconds);
      }
      const session = sessions.get(id);
      if (!session || session.expiry <= now()) {
        sessions.delete(id);
        return setCookie(json({error:'authentication_required'},401));
      }
      const headers = new Headers(request.headers);
      headers.delete('cookie');
      headers.set('authorization',`Bearer ${session.token}`);
      const response = await chat(new Request(request,{headers}));
      if (response.status === 401) {
        sessions.delete(id);
        return setCookie(response);
      }
      return response;
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.code},error.status);
      return json({error:'request_failed'},500);
    }
  };
}

export {createBrowserHandler, createPasswordExchange};
