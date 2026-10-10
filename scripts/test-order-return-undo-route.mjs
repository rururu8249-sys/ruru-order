import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
async function run(options={}){
 const writes=[],rpcCalls=[];
 const task={id:'issue',source:'order_return_flow',status:'open',body:'주문번호: FIXTURE',created_at:'2026-01-02'};
 const db={async rpc(name,payload){rpcCalls.push({name,payload});return options.rpcError?{data:null,error:{message:'RPC unavailable'}}:{data:{ok:true,refunded:options.duplicate?0:100,duplicate:!!options.duplicate,message:'already done'},error:null};},from(table){
  let action='select',payload,filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},gt(){filters.push(['after',true]);return q;},order(){return q;},limit(){return q;},ilike(){return q;},in(){return q;},update(p){action='update';payload=p;return q;},insert(p){action='insert';payload=p;return q;},upsert(p){action='upsert';payload=p;return q;},maybeSingle(){return execute();},then(r,j){return execute().then(r,j);}};
  async function execute(){
   if(action!=='select'){writes.push({table,payload});return {data:null,error:null};}
   if(table==='admin_tasks')return filters.some(([k])=>k==='id')?{data:task,error:null}:{data:options.siblingError?null:[task],error:options.siblingError?{message:'sibling unavailable'}:null};
   if(table==='orders')return {data:[{id:1,order_group_id:'group',order_lookup_code:'FIXTURE',customer_phone:'01012345678'}],error:null};
   if(table==='customer_point_ledger')return filters.some(([k])=>k==='after')?{data:options.historyError?null:[],error:options.historyError?{message:'history unavailable'}:null}:{data:[{id:'ledger',amount:-100,created_by:'order_return_flow',created_at:'2026-01-01'}],error:null};
   if(table==='customer_point_balances')return {data:{current_points:1000},error:null};
   throw new Error(table);
  }return q;
 }};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
 const load=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>({})},'@supabase/supabase-js':{createClient:()=>db}});
 const {POST}=load('app/api/admin-live/order-return/undo/route.ts');
 const response=await POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({taskId:'issue',preview:!!options.preview})}));
 return {status:response.status,body:await response.json(),writes,rpcCalls};
}
let failed=0;
async function test(name,fn){try{await fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
await test('undo uses only atomic point RPC then cleans issue records',async()=>{
 const r=await run();assert.equal(r.body.refunded,100);assert.equal(r.rpcCalls.length,1);assert.equal(r.rpcCalls[0].name,'undo_order_return_points');assert.equal(r.writes.some(w=>w.table.startsWith('customer_point_')),false);
});
await test('preview is read only',async()=>{const r=await run({preview:true});assert.equal(r.body.willRefund,100);assert.equal(r.writes.length,0);assert.equal(r.rpcCalls.length,0);});
for(const flag of ['historyError','siblingError','rpcError'])await test(flag+' prevents cleanup and false success',async()=>{const r=await run({[flag]:true});assert.equal(r.body.ok,false);assert.equal(r.writes.length,0);});
await test('duplicate undo is not presented as a fresh point grant',async()=>{const r=await run({duplicate:true});assert.equal(r.body.refunded,0);assert.equal(r.writes.some(w=>w.table.startsWith('customer_point_')),false);});
assert.equal(failed,0);
