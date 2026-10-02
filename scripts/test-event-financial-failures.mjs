// Executes the unchanged production point route against a local PostgreSQL-backed
// Supabase transport double. No operating account or customer is contacted.
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {sql} from './event-custom-gift-db-fixture.mjs';
await sql(`create table if not exists fixture_points_ledger(id text primary key,source_key text unique,payload jsonb);create table if not exists fixture_points_balance(phone text primary key,payload jsonb);`);
let fault='',barrier=0,waiting=[],simultaneous=false;
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
function db(){return {from(table){let op='read',payload,filter;
 const q={select(){return q;},limit(){return q;},eq(key,value){filter={key,value};return q;},insert(value){op='insert';payload=value;return q;},upsert(value){op='upsert';payload=value;return q;},delete(){op='delete';return q;},maybeSingle(){return run();},single(){return run();},then(resolve,reject){return run().then(resolve,reject);}};
 async function run(){try{
  if(op==='read'){
   const result=await sql(table==='customer_point_balances'?`select payload from fixture_points_balance where phone=${quote(filter.value)}`:`select payload from fixture_points_ledger where source_key=${quote(filter.value)}`);
   if(table==='customer_point_balances'&&simultaneous){barrier++;if(barrier<2)await new Promise(r=>waiting.push(r));else{waiting.forEach(r=>r());waiting=[];}}
   return {data:result?JSON.parse(result):null,error:null};
  }
  if(op==='insert'){if(fault==='ledger')return {error:{message:'injected ledger failure'}};await sql(`insert into fixture_points_ledger values(${quote(payload.id)},${quote(payload.source_key)},${quote(JSON.stringify(payload))}::jsonb)`);return {error:null};}
  if(op==='upsert'){if(['balance','rollback'].includes(fault))return {error:{message:'injected balance failure'}};await sql(`insert into fixture_points_balance values(${quote(payload.customer_phone)},${quote(JSON.stringify(payload))}::jsonb) on conflict(phone) do update set payload=excluded.payload`);return {data:payload,error:null};}
  if(op==='delete'){if(fault==='rollback')return {error:{message:'injected rollback failure'}};await sql(`delete from fixture_points_ledger where id=${quote(filter.value)}`);return {error:null};}
 }catch(error){return {error:{message:error.message}};}}
 return q;}};}
process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
const route=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>true},'@supabase/supabase-js':{createClient:db}})('app/api/admin-live/customer-points/route.ts');
const call=key=>route.POST(new NextRequest('http://localhost/api/admin-live/customer-points',{method:'POST',body:JSON.stringify({phone:'01012345678',action:'grant',amount:2000,reason:'fixture',source_key:key})}));
async function reset(){fault='';simultaneous=false;barrier=0;waiting=[];await sql('truncate fixture_points_ledger,fixture_points_balance');}
const findings=[];
await reset();fault='ledger';assert.equal((await call('ledger-fail')).status,400);assert.equal(await sql('select count(*) from fixture_points_balance'),'0');
await reset();fault='balance';assert.equal((await call('balance-fail')).status,400);assert.equal(await sql('select count(*) from fixture_points_ledger'),'0');
await reset();fault='rollback';assert.equal((await call('rollback-fail')).status,400);
if(await sql('select count(*) from fixture_points_ledger')!=='0')findings.push('PRE-EXISTING: balance failure + rollback failure leaves ledger without balance');
await reset();simultaneous=true;const concurrent=await Promise.all([call('different-a'),call('different-b')]);assert.ok(concurrent.every(r=>r.status===200));
const balance=Number(await sql("select payload->>'current_points' from fixture_points_balance"));
if(balance!==4000)findings.push(`PRE-EXISTING: two distinct simultaneous 2000P grants report success but balance=${balance}, expected=4000`);
await reset();simultaneous=true;await Promise.all([call('same'),call('same')]);assert.equal(await sql('select count(*) from fixture_points_ledger'),'1');
console.log('PASS unchanged point route: ledger failure, compensated balance failure, same-key uniqueness');
for(const finding of findings)console.error(finding);
if(findings.length)process.exitCode=1;
