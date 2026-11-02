// [2026-11-03] 「다시 챙기기」는 그 주문에 안 끝난 고객이슈가 있을 때만 — picking-workspace 라우트 시뮬
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let failTasks=false; let captured=null;
const repick=[{id:11,order_lookup_code:'RURU-ISSUE',repick_required_at:'2026-07-01'},{id:12,order_lookup_code:'RURU-OLD',repick_required_at:'2026-07-01'},{id:13,order_lookup_code:'',repick_required_at:'2026-07-01'}];
const tasks=[{body:'주문번호: RURU-ISSUE\n교환',status:'open',resolved_at:null}];
const client={from(table){const q={select(){return q;},order(){return q;},is(){return q;},gte(){return q;},eq(){return q;},not(){return q;},in(){return q;},limit(){return q;},range(){return q;},
 then(res,rej){const r=table==='admin_tasks'?(failTasks?{data:null,error:{message:'x'}}:{data:tasks,error:null}):table==='orders'?{data:repick,error:null}:{data:[],error:null};return Promise.resolve(r).then(res,rej);}};return q;}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='t';
const {POST}=createUiLoader({
 '@supabase/supabase-js':{createClient:()=>client},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>true},
 '@/components/admin-live/liveOrderAdapter':{buildAdminLiveOrderGroups:()=>[],sortLiveOrdersByCreatedDesc:x=>x,toAdminLiveOrder:x=>x},
 '@/lib/orderPickingScopeLoader':{parsePickingWorkspaceRequest:i=>({broadcastIds:i.broadcastIds}),loadPickingWorkspaceRows:async()=>[],kstDayStartIso:()=>'2026-11-03',kstDaysAgoStartIso:()=>'2026-11-02',selectAdditionalPickingRows:(a)=>{captured=a;return [];}},
})('app/api/admin-live/picking-workspace/route.ts');
const req={json:async()=>({broadcastIds:['b']})};
assert.equal((await POST(req)).status,200);
assert.deepEqual(captured.repickRows.map(r=>r.id),[11],'안 끝난 고객이슈 있는 주문만 다시 챙기기');
failTasks=true;
await POST(req);
assert.deepEqual(captured.repickRows.map(r=>r.id),[11,12,13],'고객이슈 못 읽으면 예전처럼 다 띄움');
console.log('test-picking-repick-issue-filter: ok');
