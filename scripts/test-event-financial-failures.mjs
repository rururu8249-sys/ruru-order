// Actual administrator route -> real isolated PostgreSQL RPC, no production data.
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {sql} from './event-custom-gift-db-fixture.mjs';
import {preparePointFixture} from './admin-points-db-fixture.mjs';
await preparePointFixture();
const quote=x=>x===null?'null':typeof x==='boolean'?String(x):"'"+String(x).replaceAll("'","''")+"'";
let allowed=true,transportFailure=false,rpcCalls=0;
const db={from(){throw Error('POST must not use separate ledger/balance writes');},async rpc(name,p){
 rpcCalls++;assert.equal(name,'admin_change_customer_points');
 if(transportFailure)return {error:{message:'injected transport failure'}};
 try{return {data:JSON.parse(await sql(`set role service_role;select admin_change_customer_points(${[p.p_phone,p.p_action,p.p_amount,p.p_reason,p.p_admin_memo,p.p_nickname,p.p_customer_name,p.p_customer_visible,p.p_source_key].map(quote).join(',')})`))};}catch{return {error:{message:'database failure'}};}
}};
process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
const route=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>allowed},'@supabase/supabase-js':{createClient:()=>db}})('app/api/admin-live/customer-points/route.ts');
const call=(key,extra={})=>route.POST(new NextRequest('http://localhost/api/admin-live/customer-points',{method:'POST',body:JSON.stringify({phone:'01012345678',action:'grant',amount:2000,reason:'fixture',source_key:key,...extra})}));
const reset=()=>sql('truncate customer_point_ledger,customer_point_balances');
await reset();allowed=false;assert.equal((await call('no-auth')).status,400);assert.equal(rpcCalls,0);allowed=true;
assert.equal((await call('invalid',{amount:0})).status,400);assert.equal(rpcCalls,0);
const concurrent=await Promise.all([call('different-a'),call('different-b')]);assert.ok(concurrent.every(r=>r.status===200));
assert.equal(await sql('select current_points from customer_point_balances'),'4000');
assert.equal(await sql('select sum(amount) from customer_point_ledger'),'4000');
await reset();const same=await Promise.all([call('same'),call('same')]);
assert.ok(same.every(r=>r.status===200));assert.equal(await sql('select count(*) from customer_point_ledger'),'1');
assert.equal(await sql('select current_points from customer_point_balances'),'2000');
assert.equal((await call('same',{amount:3000})).status,409);
for(const table of ['customer_point_balances','customer_point_ledger']){
 await reset();await sql(`create or replace function fixture_api_point_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure';end$$;create trigger fixture_api_point_fail before ${table==='customer_point_balances'?'update':'insert'} on ${table} for each row execute function fixture_api_point_fail();`);
 assert.equal((await call('write-fail')).status,503);
 assert.equal(await sql('select count(*) from customer_point_balances'),'0');assert.equal(await sql('select count(*) from customer_point_ledger'),'0');
 await sql(`drop trigger fixture_api_point_fail on ${table}`);
}
transportFailure=true;assert.equal((await call('network')).status,503);transportFailure=false;
await call('lost-response');const retry=await call('lost-response');assert.equal((await retry.json()).duplicate,true);
assert.equal(await sql('select current_points from customer_point_balances'),'2000');
console.log('PASS real admin point route/PostgreSQL: concurrent balance=4000, exactly-once source, mismatched source rejection, both failures leave no ledger/balance, transport failure not success, lost-response retry');
