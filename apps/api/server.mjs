import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import pg from 'pg';
import {createChatHandler, createSupabaseVerifier} from './chat.mjs';
import {createBrowserHandler, createPasswordExchange, createEmailRegistration} from './browser.mjs';

const {SPOTME_DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} = process.env;
const port = Number(process.env.PORT ?? 3080);
if (!SPOTME_DATABASE_URL || !SUPABASE_URL || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set SPOTME_DATABASE_URL, SUPABASE_URL and a valid port.');
}
function checkedDatabaseURL(raw) {
  const databaseUrl = new URL(raw);
  if (!['postgres:','postgresql:'].includes(databaseUrl.protocol) ||
      (!['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname) && databaseUrl.searchParams.get('sslmode') !== 'verify-full')) {
    throw new Error('Use a PostgreSQL URL and require sslmode=verify-full outside loopback.');
  }
  return raw;
}
const verify = createSupabaseVerifier({url:SUPABASE_URL, apiKey:SUPABASE_PUBLISHABLE_KEY});
const db = new pg.Pool({connectionString:checkedDatabaseURL(SPOTME_DATABASE_URL), max:8, connectionTimeoutMillis:5000, statement_timeout:5000});
const check = await db.query(`select pg_has_role(current_user, 'spotme_chat_api', 'usage')
  and not has_table_privilege(current_user, 'spotme_private.profiles', 'SELECT')
  and not has_table_privilege(current_user, 'spotme_private.messages', 'SELECT')
  and not has_function_privilege(current_user, 'spotme_private.record_swipe(uuid,uuid,text)', 'EXECUTE') as allowed`);
if (!check.rows[0]?.allowed) {
  await db.end();
  throw new Error('Use a dedicated login that inherits only the SpotMe chat privileges.');
}
db.on('error', () => console.error('An idle database connection failed.'));
let appleBilling, billingDB;
if (process.env.SPOTME_APPLE_ENVIRONMENT) {
  const {configureAppleBilling} = await import('./apple-billing.mjs');
  billingDB = new pg.Pool({
    connectionString:checkedDatabaseURL(process.env.SPOTME_APPLE_BILLING_DATABASE_URL),
    max:3,connectionTimeoutMillis:5000,statement_timeout:5000
  });
  const {rows:[{allowed}]} = await billingDB.query(`select
    pg_has_role(current_user,'spotme_apple_billing','usage')
    and not pg_has_role(current_user,'spotme_chat_api','usage')
    and not has_table_privilege(current_user,'spotme_private.apple_subscriptions','INSERT')
    and not has_table_privilege(current_user,'spotme_private.profiles','SELECT') as allowed`);
  if (!allowed) throw new Error('Use a dedicated Apple billing login.');
  billingDB.on('error', () => console.error('An idle billing database connection failed.'));
  appleBilling = await configureAppleBilling(process.env,billingDB);
}
const origin = process.env.SPOTME_WEB_ORIGIN ?? `http://127.0.0.1:${port}`;
let stripeBilling, playBilling, externalDB;
if (process.env.SPOTME_STRIPE_SECRET_KEY || process.env.SPOTME_PLAY_ENABLED === 'true') {
  const environment = process.env.SPOTME_BILLING_ENVIRONMENT;
  if (!['Sandbox','Production'].includes(environment)) throw new Error('Set SPOTME_BILLING_ENVIRONMENT to Sandbox or Production.');
  const {configureStripeBilling,configurePlayBilling} = await import('./external-billing.mjs');
  externalDB = new pg.Pool({
    connectionString:checkedDatabaseURL(process.env.SPOTME_EXTERNAL_BILLING_DATABASE_URL),
    max:4,connectionTimeoutMillis:5000,statement_timeout:5000
  });
  const {rows:[{allowed}]} = await externalDB.query(`select
    pg_has_role(current_user,'spotme_external_billing','usage')
    and not pg_has_role(current_user,'spotme_chat_api','usage')
    and not pg_has_role(current_user,'spotme_apple_billing','usage')
    and not has_table_privilege(current_user,'spotme_private.external_subscriptions','INSERT')
    and not has_table_privilege(current_user,'spotme_private.profiles','SELECT') as allowed`);
  if (!allowed) throw new Error('Use a dedicated external billing login.');
  externalDB.on('error', () => console.error('An idle external billing database connection failed.'));
  if (process.env.SPOTME_STRIPE_SECRET_KEY) stripeBilling = await configureStripeBilling(process.env,externalDB,origin,environment);
  if (process.env.SPOTME_PLAY_ENABLED === 'true') playBilling = await configurePlayBilling(process.env,externalDB,environment);
}
const chat = createChatHandler({verify, db, appleBilling,stripeBilling,playBilling});
const handle = createBrowserHandler({origin,
  exchange:createPasswordExchange({url:SUPABASE_URL,apiKey:SUPABASE_PUBLISHABLE_KEY}), verify, chat,
  register:process.env.SPOTME_SIGNUP_ENABLED === 'true' ? createEmailRegistration({url:SUPABASE_URL,apiKey:SUPABASE_PUBLISHABLE_KEY}) : undefined});
const assets = new Map(await Promise.all([
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/app.css', 'app.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8']
].map(async ([path,file,type])=>[path,{type,content:await readFile(new URL(`./web/${file}`,import.meta.url))}])));
const server = createServer({requestTimeout:15000, headersTimeout:8000}, async (req, res) => {
  try {
    const target = req.url;
    if (!target?.startsWith('/') || target.startsWith('//')) {
      res.writeHead(400, {'cache-control':'no-store'}).end();
      return;
    }
    const asset = assets.get(new URL(`http://localhost${target}`).pathname);
    if (asset && ['GET','HEAD'].includes(req.method)) {
      res.writeHead(200, {'content-type':asset.type,'cache-control':'no-store','x-content-type-options':'nosniff',
        'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'}).end(req.method === 'HEAD' ? undefined : asset.content);
      return;
    }
    const init = {method:req.method, headers:req.headers};
    if (!['GET','HEAD'].includes(req.method)) {
      init.body = Readable.toWeb(req);
      init.duplex = 'half';
    }
    const request = new Request(`http://localhost${target}`, init);
    const path = new URL(request.url).pathname;
    const callback = req.method === 'POST' && {
      '/apple/notifications': appleBilling?.receive,
      '/stripe/webhook': stripeBilling?.webhook,
      '/play/notifications': playBilling?.notification
    }[path];
    const response = callback ? await callback(request) : await handle(request);
    const headers = Object.fromEntries(response.headers);
    if (!req.complete) headers.connection = 'close';
    res.writeHead(response.status, headers);
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch {
    if (!res.headersSent) res.writeHead(500, {'cache-control':'no-store'});
    res.end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`SpotMe chat API listening on http://127.0.0.1:${port}`));
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => server.close(() => {
  void Promise.all([db.end(),billingDB?.end(),externalDB?.end()]);
}));
