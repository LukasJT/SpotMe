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

function httpOrigin(url) {
  const origin = new URL(url);
  const local = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !(origin.protocol === 'https:' || (local && origin.protocol === 'http:'))) {
    throw new Error('Use an HTTP origin with HTTPS outside loopback.');
  }
  return origin;
}

function createSupabaseVerifier({url, apiKey, fetchUser = fetch}) {
  const origin = httpOrigin(url);
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

async function readJson(request, maxBytes = MAX_BODY) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'expected_json');
  }
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'body_too_large');
  if (!request.body) throw new HttpError(400, 'invalid_json');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let body = '', size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new HttpError(413, 'body_too_large');
      body += decoder.decode(value, {stream:true});
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_json');
  } finally { reader.releaseLock(); }
}

async function messageBody(request) {
  const data = await readJson(request);
  if (typeof data?.body !== 'string' || typeof data?.client_message_id !== 'string' ||
      Object.keys(data).some(key => !['body','client_message_id'].includes(key)) ||
      !UUID.test(data.client_message_id) || !data.body.trim() || [...data.body.trim()].length > 2000 ||
      data.body.includes('\0') || !data.body.isWellFormed()) throw new HttpError(422, 'invalid_message');
  return data;
}

function createChatHandler({verify, db, appleBilling, stripeBilling, playBilling}) {
  const environments = new Set([appleBilling,stripeBilling,playBilling].filter(Boolean).map(x=>x.environment));
  if (environments.size > 1) throw new Error('Billing providers must use the same environment.');
  const [billingEnvironment] = environments;
  const premiumActive = async actor => {
    const {rows:[{active}]} = await db.query('select spotme_private.has_premium($1,$2) as active',[actor,billingEnvironment ?? 'Production']);
    return active;
  };
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const {method} = request;
      const route = url.pathname.match(/^\/v1\/(?:matches\/([^/]+)\/(messages|unmatch)|blocks\/([^/]+))$/);
      const matches = url.pathname === '/v1/matches' && method === 'GET';
      const billing = url.pathname === '/v1/me/apple-billing' && ['GET','POST'].includes(method);
      const external = (url.pathname === '/v1/me/premium' && method === 'GET') ||
        (url.pathname === '/v1/me/play-billing' && ['GET','POST'].includes(method)) ||
        (['/v1/me/stripe-checkout','/v1/me/stripe-portal','/v1/me/stripe-cancel-checkout'].includes(url.pathname) && method === 'POST');
      const member = (['/v1/me/profile','/v1/me/gym-search'].includes(url.pathname) && ['GET','PUT'].includes(method)) ||
        (['/v1/cities','/v1/gyms','/v1/discovery','/v1/premium/gym-cards'].includes(url.pathname) && method === 'GET') ||
        (['/v1/swipes','/v1/gym-submissions','/v1/reports'].includes(url.pathname) && method === 'POST');
      const messages = route?.[2] === 'messages' && (method === 'GET' || method === 'POST');
      const close = method === 'POST' && (route?.[2] === 'unmatch' || route?.[3]);
      if (!billing && !external && !member && !matches && !messages && !close) return json({error:'not_found'}, 404);
      const header = request.headers.get('authorization') ?? '';
      const token = header.length <= 8192 && JWT.exec(header)?.[1];
      if (!token) throw new HttpError(401, 'authentication_required');
      const actor = await verify(token);
      if (!UUID.test(actor ?? '')) throw new HttpError(401, 'authentication_required');
      if (billing) {
        if (!appleBilling) return json({enabled:false});
        if (method === 'POST') await appleBilling.claim(request,actor);
        const {rows:[{active}]} = await db.query(
          'select spotme_private.has_premium($1,$2) as active',[actor,appleBilling.environment]);
        return json({enabled:true,active,accountToken:actor});
      }
      if (external) {
        if (url.pathname === '/v1/me/premium') return json({active:await premiumActive(actor),webCheckout:Boolean(stripeBilling),webCustomer:await stripeBilling?.customerExists(actor)??false});
        if (url.pathname === '/v1/me/play-billing') {
          if (!playBilling) return json({enabled:false,active:await premiumActive(actor)});
          if (method === 'POST') {
            const data = await readJson(request);
            if (!objectWith(data,['purchaseToken'])) throw new HttpError(422,'invalid_purchase_token');
            await playBilling.claim(data.purchaseToken,actor);
          }
          return json({enabled:true,active:await premiumActive(actor),accountToken:playBilling.accountFor(actor)});
        }
        if (!stripeBilling) throw new HttpError(503,'billing_unavailable');
        if (url.pathname === '/v1/me/stripe-portal') return json({url:await stripeBilling.portal(actor)});
        if (url.pathname === '/v1/me/stripe-cancel-checkout') {
          await stripeBilling.cancelCheckout(actor);
          return json(null,204);
        }
        const data = await readJson(request);
        if (!objectWith(data,['plan']) || !['weekly','monthly'].includes(data.plan)) throw new HttpError(422,'invalid_plan');
        return json({url:await stripeBilling.checkout(actor,data.plan)});
      }
      if (member) return await memberRequest(db,request,url,actor,billingEnvironment);
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
      if (error?.code === 'P4030') return json({error:'premium_required'}, 403);
      if (error?.code === '42501') return json({error:'not_found'}, 404);
      if (error?.code === '22023') return json({error:'invalid_operation'}, 422);
      if (['22001','22003','22007','22008','22P02','23502','23503','23514'].includes(error?.code)) return json({error:'invalid_operation'},422);
      if (error?.code === 'P0001') return json({error:'try_again_later'},429);
      if (['40001','40P01','57014'].includes(error?.code)) return json({error:'retry_request'}, 503);
      return json({error:'request_failed'}, 500);
    }
  };
}

const audiences = ['private','matches','discovery'];
const identities = ['woman','man','nonbinary','another_identity'];
const cityId = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value)<=9223372036854775807n;
const isText = (value,max,min=0) => typeof value === 'string' && value.isWellFormed() && !value.includes('\0') &&
  [...value.trim()].length >= min && [...value].length <= max;
const objectWith = (value,keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key));
const validAge = value => Number.isInteger(value) && value >= 18 && value <= 99;

function profileInput(value) {
  const keys = ['name','date_of_birth','city_id','bio','intent','split','days','days_audience','gender','seeking','minimum_age','maximum_age','gyms','paused'];
  if (!objectWith(value,keys) || !isText(value.name,40,2) || !isText(value.bio,500) || !isText(value.intent,80) || !isText(value.split,80) ||
      !cityId(value.city_id) || typeof value.date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date_of_birth) ||
      !identities.includes(value.gender) || !Array.isArray(value.seeking) || !value.seeking.length || value.seeking.length>4 ||
      !value.seeking.every(item=>identities.includes(item)) || !validAge(value.minimum_age) || !validAge(value.maximum_age) || value.minimum_age>value.maximum_age ||
      !Array.isArray(value.days) || value.days.length>7 || !value.days.every(day=>Number.isInteger(day)&&day>=1&&day<=7) ||
      !audiences.includes(value.days_audience) || !Array.isArray(value.gyms) || value.gyms.length>10 ||
      !value.gyms.every(gym=>objectWith(gym,['id','audience']) && typeof gym.id==='string' && UUID.test(gym.id) && audiences.includes(gym.audience)) ||
      typeof value.paused !== 'boolean') throw new HttpError(422,'invalid_profile');
  return {...value,name:value.name.trim(),bio:value.bio.trim(),intent:value.intent.trim(),split:value.split.trim(),seeking:[...new Set(value.seeking)]};
}

async function memberRequest(db,request,url,actor,billingEnvironment) {
  const select = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const cursor = () => {
    const after=url.searchParams.get('after');
    if (after!==null && !UUID.test(after)) throw new HttpError(422,'invalid_cursor');
    return after;
  };
  switch (url.pathname) {
    case '/v1/me/profile': {
      const rows = request.method === 'GET'
        ? await select('select spotme_private.read_profile($1) as profile',[actor])
        : await select('select spotme_private.save_profile($1,$2) as profile',[actor,JSON.stringify(profileInput(await readJson(request)))]);
      return json({profile:rows[0].profile});
    }
    case '/v1/me/gym-search': {
      if (request.method === 'GET') {
        const [row] = await select('select spotme_private.gym_search_visibility($1) as visible',[actor]);
        if (row.visible === null) throw new HttpError(404,'not_found');
        return json({visible:row.visible});
      }
      const data = await readJson(request);
      if (!objectWith(data,['visible']) || typeof data.visible !== 'boolean') throw new HttpError(422,'invalid_visibility');
      const [row] = await select('select spotme_private.set_gym_search_visibility($1,$2) as visible',[actor,data.visible]);
      return json({visible:row.visible});
    }
    case '/v1/premium/gym-cards': {
      const gym = url.searchParams.get('gym');
      const min = url.searchParams.get('min_age') ?? '18';
      const max = url.searchParams.get('max_age') ?? '99';
      if (!UUID.test(gym ?? '') || !/^\d{2}$/.test(min) || !/^\d{2}$/.test(max) ||
          !validAge(Number(min)) || !validAge(Number(max)) || Number(min)>Number(max)) {
        throw new HttpError(422,'invalid_gym_search');
      }
      const args = [actor,gym,Number(min),Number(max),cursor()];
      const rows = billingEnvironment
        ? await select('select spotme_private.gym_search_cards_for_environment($1,$2,$3,$4,$5,$6) as card',
            [...args,billingEnvironment])
        : await select('select spotme_private.gym_search_cards($1,$2,$3,$4,$5) as card',args);
      return json({cards:rows.map(row=>row.card)});
    }
    case '/v1/cities': return json({cities:await select('select * from spotme_private.directory_cities()')});
    case '/v1/gyms': {
      const city=url.searchParams.get('city');
      const search=url.searchParams.get('q')??'';
      if (!cityId(city) || !isText(search,80)) throw new HttpError(422,'invalid_search');
      return json({gyms:await select('select * from spotme_private.directory_gyms($1,$2,$3)',[city,search.trim(),cursor()])});
    }
    case '/v1/discovery': return json({cards:(await select('select spotme_private.discovery_cards($1,$2) as card',[actor,cursor()])).map(row=>row.card)});
    case '/v1/swipes': {
      const data=await readJson(request);
      if (!objectWith(data,['peer_id','decision']) || typeof data.peer_id!=='string' || !UUID.test(data.peer_id) || !['like','pass'].includes(data.decision)) throw new HttpError(422,'invalid_swipe');
      const [result]=await select('select spotme_private.discovery_swipe($1,$2,$3) as matched',[actor,data.peer_id,data.decision]);
      return json(result);
    }
    case '/v1/gym-submissions': {
      const data=await readJson(request);
      if (!objectWith(data,['city_id','name','address']) || !cityId(data.city_id) || !isText(data.name,160,1) || !isText(data.address,240,1)) throw new HttpError(422,'invalid_gym');
      const [result]=await select('select spotme_private.suggest_gym($1,$2,$3,$4) as id',[actor,data.city_id,data.name,data.address]);
      return json({...result,status:'pending'},201);
    }
    case '/v1/reports': {
      const data=await readJson(request);
      if (!objectWith(data,['peer_id','client_report_id','reason','details']) || typeof data.peer_id!=='string' || !UUID.test(data.peer_id) ||
          typeof data.client_report_id!=='string' || !UUID.test(data.client_report_id) ||
          !['harassment','impersonation','underage','spam','other'].includes(data.reason) || !isText(data.details,500)) throw new HttpError(422,'invalid_report');
      const [result]=await select('select spotme_private.submit_report($1,$2,$3,$4,$5) as id',
        [actor,data.peer_id,data.client_report_id,data.reason,data.details.trim()]);
      return json(result,201);
    }
    default: return json({error:'not_found'},404);
  }
}

export {createSupabaseVerifier, createChatHandler, httpOrigin, HttpError, json, readJson};
