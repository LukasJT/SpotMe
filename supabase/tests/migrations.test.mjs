import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const alex = '00000000-0000-4000-8000-000000000001';
const maya = '00000000-0000-4000-8000-000000000002';
const sam = '00000000-0000-4000-8000-000000000003';
const minor = '00000000-0000-4000-8000-000000000004';
const taylor = '00000000-0000-4000-8000-000000000005';
const request = '00000000-0000-4000-8000-000000000010';
const next = '00000000-0000-4000-8000-000000000011';
const second = '00000000-0000-4000-8000-000000000012';
const gym = '00000000-0000-4000-8000-000000000020';

async function provision() {
  const db = await PGlite.create();
  try {
    // Only the roles and auth key required by the migrations. No Supabase API or JWT mock.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);`);
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

test('profile and directory privileges, visibility defaults, and review constraints', async t => {
  const db = await provision();
  t.after(() => db.close());
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from spotme_private.profiles'), {code: '42501'});
    await assert.rejects(db.query('select spotme_private.record_swipe($1,$2,$3)', [alex, maya, 'like']), {code: '42501'});
    await db.exec('reset role');
    const privileges = await db.query(`select has_function_privilege($1,
      'spotme_private.record_swipe(uuid,uuid,text)', 'execute') as execute,
      has_table_privilege($1, 'spotme_private.messages', 'select') as read`, [role]);
    assert.deepEqual(privileges.rows[0], {execute: false, read: false});
  }
  await db.query('insert into auth.users values ($1)', [alex]);
  await db.exec('set role service_role');
  await db.exec("insert into spotme_private.cities (province, municipality_code, name) values ('ON', 'test-city', 'Kitchener')");
  await db.query("insert into spotme_private.profiles (user_id,date_of_birth,display_name,city_id) values ($1,'1990-01-01','Alex',1)", [alex]);
  await db.query("insert into spotme_private.gyms (id,city_id,display_name,street_address) values ($1,1,'Demo gym','Example address')", [gym]);
  await db.query('insert into spotme_private.profile_gyms (user_id,gym_id) values ($1,$2)', [alex, gym]);
  assert.equal((await db.query('select training_days_audience from spotme_private.profiles')).rows[0].training_days_audience, 'private');
  assert.equal((await db.query('select audience from spotme_private.profile_gyms')).rows[0].audience, 'private');
  await assert.rejects(db.query(`insert into spotme_private.gym_suggestions
    (submitter_id,city_id,proposed_name,proposed_address,review_status) values ($1,1,'Demo','Example','approved')`, [alex]), {code: '23514'});
});

test('reciprocal matching, message retries, and revocation', async t => {
  const db = await provision();
  t.after(() => db.close());
  await db.query('insert into auth.users values ($1),($2),($3),($4),($5)', [alex, maya, sam, minor, taylor]);
  await db.exec('set role service_role');
  await db.exec("insert into spotme_private.cities (province, municipality_code, name) values ('ON','test-city','Kitchener')");
  for (const [id, name] of [[alex,'Alex'], [maya,'Maya'], [sam,'Sam'], [minor,'Minor'], [taylor,'Taylor']]) {
    const birth = id === minor ? '2020-01-01' : '1990-01-01';
    await db.query(`insert into spotme_private.profiles (user_id,date_of_birth,display_name,city_id,status)
      values ($1,$2,$3,1,'active')`, [id, birth, name]);
  }
  const swipe = async (actor, peer, decision = 'like') => (await db.query('select spotme_private.record_swipe($1,$2,$3) as matched', [actor, peer, decision])).rows[0].matched;
  const send = async (actor, peer, id, body) => (await db.query('select spotme_private.send_message($1,$2,$3,$4) as id', [actor, peer, id, body])).rows[0].id;
  const read = async (actor, peer, after = 0) => (await db.query('select * from spotme_private.read_messages($1,$2,$3)', [actor, peer, after])).rows;
  const close = (actor, peer, block) => db.query('select spotme_private.close_pair($1,$2,$3)', [actor, peer, block]);

  await assert.rejects(swipe(alex, minor), {code: '42501'});
  assert.equal(await swipe(alex, maya), false);
  await assert.rejects(send(alex, maya, request, 'Hi'), {code: '42501'});
  assert.equal(await swipe(maya, alex), true);
  assert.equal(await swipe(alex, maya), true);
  assert.equal((await db.query('select count(*)::int as count from spotme_private.member_pairs')).rows[0].count, 1);
  await assert.rejects(send(alex, maya, request, '\n\t '), {code: '22023'});
  const first = await send(alex, maya, request, 'Hi');
  assert.equal(await send(alex, maya, request, ' Hi '), first);
  await assert.rejects(send(alex, maya, request, 'Edited'), {code: '22023'});
  await send(maya, alex, next, 'Hey');
  assert.deepEqual((await read(maya, alex)).map(row => row.body), ['Hi','Hey']);
  assert.deepEqual((await read(alex, maya, first)).map(row => row.body), ['Hey']);
  await assert.rejects(read(sam, maya), {code: '42501'});

  await db.query("update spotme_private.profiles set status='paused' where user_id=$1", [maya]);
  await assert.rejects(swipe(sam, maya), {code: '42501'});
  await send(maya, alex, second, 'Still here');
  await db.query("update spotme_private.profiles set status='suspended' where user_id=$1", [maya]);
  await assert.rejects(read(alex, maya), {code: '42501'});
  await close(alex, maya, true);
  await db.query("update spotme_private.profiles set status='active' where user_id=$1", [maya]);
  await assert.rejects(read(maya, alex), {code: '42501'});
  await assert.rejects(send(alex, maya, request, 'Hi'), {code: '42501'});
  await assert.rejects(swipe(maya, alex), {code: '42501'});

  await close(alex, sam, true);
  await assert.rejects(swipe(sam, alex), {code: '42501'});
  assert.equal(await swipe(sam, maya, 'pass'), false);
  assert.equal(await swipe(sam, maya, 'like'), false);
  assert.equal(await swipe(maya, sam), false);
  await assert.rejects(close(sam, taylor, false), {code: '42501'});
  assert.equal(await swipe(sam, taylor), false);
  assert.equal(await swipe(taylor, sam), true);
  await close(sam, taylor, false);
  await assert.rejects(read(taylor, sam), {code: '42501'});
  await assert.rejects(swipe(taylor, sam), {code: '42501'});
});
