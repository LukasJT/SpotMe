import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import pg from 'pg';
import {createChatHandler, createSupabaseVerifier} from './chat.mjs';
import {createBrowserHandler, createPasswordExchange} from './browser.mjs';

const {SPOTME_DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} = process.env;
const port = Number(process.env.PORT ?? 3080);
if (!SPOTME_DATABASE_URL || !SUPABASE_URL || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set SPOTME_DATABASE_URL, SUPABASE_URL and a valid port.');
}
const databaseUrl = new URL(SPOTME_DATABASE_URL);
if (!['postgres:','postgresql:'].includes(databaseUrl.protocol) ||
    (!['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname) && databaseUrl.searchParams.get('sslmode') !== 'verify-full')) {
  throw new Error('Use a PostgreSQL URL and require sslmode=verify-full outside loopback.');
}
const verify = createSupabaseVerifier({url:SUPABASE_URL, apiKey:SUPABASE_PUBLISHABLE_KEY});
const db = new pg.Pool({connectionString:SPOTME_DATABASE_URL, max:8, connectionTimeoutMillis:5000, statement_timeout:5000});
const check = await db.query(`select pg_has_role(current_user, 'spotme_chat_api', 'usage')
  and not has_table_privilege(current_user, 'spotme_private.profiles', 'SELECT')
  and not has_table_privilege(current_user, 'spotme_private.messages', 'SELECT')
  and not has_function_privilege(current_user, 'spotme_private.record_swipe(uuid,uuid,text)', 'EXECUTE') as allowed`);
if (!check.rows[0]?.allowed) {
  await db.end();
  throw new Error('Use a dedicated login that inherits only the SpotMe chat privileges.');
}
db.on('error', () => console.error('An idle database connection failed.'));
const chat = createChatHandler({verify, db});
const handle = createBrowserHandler({origin:process.env.SPOTME_WEB_ORIGIN ?? `http://127.0.0.1:${port}`,
  exchange:createPasswordExchange({url:SUPABASE_URL,apiKey:SUPABASE_PUBLISHABLE_KEY}), verify, chat});
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
    const response = await handle(new Request(`http://localhost${target}`, init));
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
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => server.close(() => {void db.end();}));
