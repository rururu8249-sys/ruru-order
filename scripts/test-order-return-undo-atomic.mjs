import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {sql,reset as resetCluster} from './event-custom-gift-db-fixture.mjs';
import {preparePointFixture} from './admin-points-db-fixture.mjs';
resetCluster();await preparePointFixture();
await sql('alter table customer_point_balances drop constraint customer_point_balances_current_points_check; alter table customer_point_ledger drop constraint customer_point_ledger_balance_after_check');
await sql(readFileSync('supabase/migrations/20261010120000_order_return_points_atomic.sql','utf8'));
const migration='supabase/migrations/20261010123000_order_return_undo_atomic.sql';
if(existsSync(migration)) await sql(readFileSync(migration,'utf8'));
const phone='01012345678';
const undo=group=>sql(`set role service_role;select undo_order_return_points('${phone}','${group}','','','fixture')`).then(JSON.parse);
const reset=()=>sql(`truncate customer_point_ledger,customer_point_balances;insert into customer_point_balances(customer_phone,current_points) values('${phone}',1000);insert into customer_point_ledger(customer_phone,amount,balance_after,change_type,created_by,related_order_id) values('${phone}',-100,1000,'cancel','order_return_flow','same')`);
await reset();
const same=await Promise.all(Array.from({length:20},()=>undo('same')));
assert.equal(same.filter(r=>r.refunded===100).length,1);
assert.equal(await sql('select current_points from customer_point_balances'),'1100');
assert.equal(await sql("select count(*) from customer_point_ledger where created_by='order_return_undo'"),'1');
await reset();
await sql(`insert into customer_point_ledger(customer_phone,amount,balance_after,change_type,created_by,related_order_id) select '${phone}',-100,1000,'cancel','order_return_flow','g'||n from generate_series(1,20)n`);
await Promise.all(Array.from({length:20},(_,i)=>undo('g'+(i+1))));
assert.equal(await sql('select current_points from customer_point_balances'),'3000');
await Promise.all([
  undo('same'),
  sql(`set role service_role; select reclaim_order_return_points('${phone}','new-group',250,'','','fixture')`),
  sql(`set role service_role; select admin_change_customer_points('${phone}','grant',500,'fixture','','','',true,'grant-test')`),
]);
assert.equal(await sql('select current_points from customer_point_balances'),'3350');
assert.equal((await undo('same')).refunded,0);
for(const table of ['customer_point_ledger','customer_point_balances']) {
 await reset();
 await sql(`create or replace function fixture_undo_fail() returns trigger language plpgsql as $$begin raise exception 'injected';end$$;create trigger fixture_undo_fail before ${table.endsWith('ledger')?'insert':'update'} on ${table} for each row execute function fixture_undo_fail()`);
 await assert.rejects(()=>undo('same'));
 assert.equal(await sql('select current_points from customer_point_balances'),'1000');
 assert.equal(await sql("select count(*) from customer_point_ledger where created_by='order_return_undo'"),'0');
 await sql(`drop trigger fixture_undo_fail on ${table}`);
}
await reset();await sql('truncate customer_point_balances');
assert.equal((await undo('same')).ok,false);
assert.equal(await sql('select count(*) from customer_point_balances'),'0');
for(const role of ['anon','authenticated']) await assert.rejects(()=>sql(`set role ${role};select undo_order_return_points('${phone}','same','','','')`));
console.log('PASS PostgreSQL return undo: concurrent duplicates/distinct groups, shared balance with reclaim/grant, missing balance, rollback and privileges');
