const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;
const MAX_BODY = 16 * 1024;

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function json(body, status = 200) {
  const headers = {'cache-control':'no-store', 'x-content-type-options':'nosniff'};
  if (status === 401) headers['www-authenticate'] = 'Bearer';
  if (status === 204) return new Response(null, {status, headers});
  return Response.json(body, {status, headers});
}

function createSupabaseVerifier({url, apiKey, fetchUser = fetch}) {
  const origin = new URL(url);
  const local = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !(origin.protocol === 'https:' || (local && origin.protocol === 'http:'))) {
    throw new Error('Set SUPABASE_URL to the project origin. Use HTTPS outside loopback.');
  }
  if (!apiKey) throw new Error('Set SUPABASE_PUBLISHABLE_KEY.');
  const endpoint = new URL('/auth/v1/user', origin);
  return async function verify(token) {
    try {
      const response = await fetchUser(endpoint, {
        headers: {apikey:apiKey, authorization:`Bearer ${token}`},
        redirect:'error', signal:AbortSignal.timeout(5000), cache:'no-store'
      });
      if ([401,403,404].includes(response.status)) return null;
      if (!response.ok) throw new Error('Auth request failed');
      const user = await response.json();
      if (!UUID.test(user?.id ?? '') || user.role !== 'authenticated' || user.is_anonymous || !user.email_confirmed_at) return null;
      return user.id.toLowerCase();
    } catch {
      throw new HttpError(503, 'auth_unavailable');
    }
  };
}

function queryLimit(url) {
  const raw = url.searchParams.get('limit') ?? '30';
  if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(raw)) throw new HttpError(422, 'invalid_limit');
  return Number(raw);
}

function messageCursor(url) {
  const cursor = url.searchParams.get('after') ?? '0';
  if (!/^\d{1,19}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n) throw new HttpError(422, 'invalid_cursor');
  return cursor;
}

async function messageBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'expected_json');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new HttpError(413, 'body_too_large');
  if (!request.body) throw new HttpError(422, 'invalid_message');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let body = '', size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) throw new HttpError(413, 'body_too_large');
      body += decoder.decode(value, {stream:true});
    }
    body += decoder.decode();
    const data = JSON.parse(body);
    if (typeof data?.body !== 'string' || typeof data?.client_message_id !== 'string' ||
        Object.keys(data).some(key => !['body','client_message_id'].includes(key)) ||
        !UUID.test(data.client_message_id) || !data.body.trim() || [...data.body.trim()].length > 2000 ||
        data.body.includes('\0') || !data.body.isWellFormed()) throw new HttpError(422, 'invalid_message');
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_json');
  } finally { reader.releaseLock(); }
}

function createChatHandler({verify, db}) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const {method} = request;
      const route = url.pathname.match(/^\/v1\/(?:matches\/([^/]+)\/(messages|unmatch)|blocks\/([^/]+))$/);
      const matches = url.pathname === '/v1/matches' && method === 'GET';
      const messages = route?.[2] === 'messages' && (method === 'GET' || method === 'POST');
      const close = method === 'POST' && (route?.[2] === 'unmatch' || route?.[3]);
      if (!matches && !messages && !close) return json({error:'not_found'}, 404);
      const header = request.headers.get('authorization') ?? '';
      const token = header.length <= 8192 && JWT.exec(header)?.[1];
      if (!token) throw new HttpError(401, 'authentication_required');
      const actor = await verify(token);
      if (!UUID.test(actor ?? '')) throw new HttpError(401, 'authentication_required');
      const peer = (route?.[1] ?? route?.[3])?.toLowerCase();
      if (!matches && (!UUID.test(peer) || peer === actor.toLowerCase())) throw new HttpError(404, 'not_found');
      if (matches) {
        const after = url.searchParams.get('after');
        if (after !== null && !UUID.test(after)) throw new HttpError(422, 'invalid_cursor');
        const result = await db.query('select * from spotme_private.list_matches($1,$2,$3)', [actor, after, queryLimit(url)]);
        return json({matches:result.rows});
      }
      if (close) {
        await db.query('select spotme_private.close_pair($1,$2,$3)', [actor, peer, Boolean(route[3])]);
        return json(null, 204);
      }
      if (method === 'GET') {
        const result = await db.query(`select id::text, sender_id, body, created_at
          from spotme_private.read_messages($1,$2,$3,$4)`, [actor, peer, messageCursor(url), queryLimit(url)]);
        return json({messages:result.rows});
      }
      const data = await messageBody(request);
      const result = await db.query('select spotme_private.send_message($1,$2,$3,$4)::text as id',
        [actor, peer, data.client_message_id, data.body]);
      return json({id:result.rows[0].id}, 200);
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.code}, error.status);
      if (error?.code === '42501') return json({error:'not_found'}, 404);
      if (error?.code === '22023') return json({error:'invalid_operation'}, 422);
      if (['40001','40P01','57014'].includes(error?.code)) return json({error:'retry_request'}, 503);
      return json({error:'request_failed'}, 500);
    }
  };
}

export {createSupabaseVerifier, createChatHandler};
