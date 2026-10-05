import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table deposits(id bigint primary key, amount bigint, depositor_name text, deposited_time time, created_at timestamptz,
 match_order_group_id text, match_customer_id bigint, match_status text, confirmed_at timestamptz, confirmed_note text);
create table orders(id bigint primary key, order_group_id text, created_at timestamptz, is_deleted boolean,
 admin_order_status_v2 text, order_manage_status text, deposit_confirmed_at timestamptz, final_amount bigint);
`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20261005143440_verified_bank_deposit_matching.sql', import.meta.url), 'utf8'));
async function reset(bankDate = '2026-10-05T14:16:28Z') {
  await db.exec('truncate orders,deposits;');
  await db.query(`insert into orders(id,order_group_id,created_at,final_amount) values (1,'group','2026-10-05T14:00:44Z',119000)`);
  await db.query(`insert into deposits(id,amount,deposited_at) values (1385,119000,$1)`, [bankDate]);
}
async function claim(snapshotAmount = 119000) {
  return (await db.query(`select confirm_verified_bank_match(array[1::bigint], 'group',1385,119000,
    $1::jsonb,$2::jsonb) as result`, [JSON.stringify([{id:1,created_at:'2026-10-05T14:00:44Z',final_amount:snapshotAmount}]),
    JSON.stringify({id:1385,amount:119000,deposited_at:(await db.query('select deposited_at from deposits where id=1385')).rows[0].deposited_at})])).rows[0].result;
}
for (const date of [null, '2026-07-22T16:11:23Z', '2099-01-01T00:00:00Z']) {
  await reset(date);
  assert.equal((await claim()).ok, false, 'Missing, historical and future bank dates must be rejected');
  assert.equal((await db.query('select deposit_confirmed_at from orders')).rows[0].deposit_confirmed_at, null);
}
await reset();
await assert.rejects(db.exec(`update orders set admin_order_status_v2='자동입금확인',order_manage_status='자동입금확인',deposit_confirmed_at=now() where id=1`), /requires a verified/, 'Older order-first route cannot bypass DB date guard');
await reset();
assert.equal((await claim(120000)).ok, false, 'Changed order amount invalidates candidate');
await reset();
await db.exec(`insert into orders(id,order_group_id,created_at,final_amount) values(2,'group','2026-10-05T14:01:00Z',1000)`);
assert.equal((await claim()).ok, false, 'Cannot confirm only part of an unpaid group');
await reset();
assert.equal((await claim()).ok, true, 'Real post-order bank deposit confirms');
assert.equal((await claim()).ok, false, 'The same deposit cannot be spent twice');
const paid = (await db.query('select deposit_confirmed_at from orders')).rows[0].deposit_confirmed_at;
assert.ok(paid);
assert.equal(String((await db.query('select confirmed_at from deposits')).rows[0].confirmed_at), String(paid));
await reset();
await db.exec(`create function fail_order_write() returns trigger language plpgsql as $$begin raise exception 'simulated storage failure'; end$$;
create trigger reject_order before update on orders for each row execute function fail_order_write();`);
await assert.rejects(claim(), /simulated storage failure/);
assert.equal((await db.query('select confirmed_at from deposits')).rows[0].confirmed_at, null, 'Order failure rolls back deposit claim too');
const grants = (await db.query(`select has_function_privilege('anon','confirm_verified_bank_match(bigint[],text,bigint,bigint,jsonb,jsonb)','execute') as allowed`)).rows[0];
assert.equal(grants.allowed, false, 'Public users cannot invoke payment confirmation');
await db.close();
console.log('PASS: verified bank date, stale snapshot, replay prevention, transactional rollback, service-only permission');
