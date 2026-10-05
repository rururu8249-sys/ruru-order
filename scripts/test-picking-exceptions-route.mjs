import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let authorized=true,failLedger=false;
const calls=[];
const selected=[{id:1,broadcast_id:'b',order_lookup_code:'RURU-A',product_name:'상품',qty:1,admin_order_status_v2:'주문취소',picked_at:'2026-10-04'}];
const task={id:'last',status:'open',task_type:'환불',body:'주문번호: RURU-A\n대상상품: 상품×1\n환불 요청'};
const tasks=[...Array.from({length:1000},(_,i)=>({id:String(i),status:'done'})),task];
const client={from(table){let start=0,end=999;const query={select(columns){calls.push({table,columns});return query;},order(){return query;},is(){return query;},gte(){return query;},eq(){return query;},not(){return query;},in(){return query;},range(from,to){start=from;end=to;calls.push({table,from,to});return query;},then(resolve,reject){return Promise.resolve(table==='admin_tasks'?{data:tasks.slice(start,end+1),error:null}:table==='refund_ledger'&&failLedger?{data:null,error:{message:'ledger unavailable'}}:{data:[],error:null}).then(resolve,reject);}};return query;}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const {POST}=createUiLoader({
 '@supabase/supabase-js':{createClient:()=>client},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>authorized},
 '@/components/admin-live/liveOrderAdapter':{buildAdminLiveOrderGroups:()=>[],sortLiveOrdersByCreatedDesc:x=>x,toAdminLiveOrder:x=>x},
 '@/lib/orderPickingScopeLoader':{parsePickingWorkspaceRequest:input=>({broadcastIds:input.broadcastIds}),loadPickingWorkspaceRows:async()=>selected,kstDayStartIso:()=> '2026-10-05',kstDaysAgoStartIso:()=> '2026-10-04',selectAdditionalPickingRows:()=>[]},
})('app/api/admin-live/picking-workspace/route.ts');
const request=includeExceptions=>({json:async()=>({broadcastIds:['b'],includeExceptions})});
const response=await POST(request(true));
assert.equal(response.status,200);
const payload=await response.json();assert.equal(payload.exceptions.length,1);
assert(calls.some(call=>call.table==='admin_tasks'&&call.from===1000),'reads beyond the default 1000 rows');
assert(!JSON.stringify(payload.exceptions).includes('RURU-A'));
assert(calls.filter(call=>call.columns).every(call=>!call.columns.includes('account_number')&&!call.columns.includes('customer_phone')),'no payout credentials selected');
failLedger=true;
const failed=await POST(request(true));assert.equal(failed.status,400);
assert.equal((await failed.json()).exceptions,undefined,'failed page cannot return a partial export');
authorized=false;const count=calls.length;
assert.equal((await POST(request(true))).status,401);assert.equal(calls.length,count);
console.log('PASS export route: authenticated, complete pagination, fail-closed exceptions, no payout credentials');
