import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
for(const key of ['SOLAPI_API_KEY','SOLAPI_API_SECRET','SOLAPI_PF_ID','SOLAPI_TEMPLATE_ID','SOLAPI_SENDER','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])process.env[key]='test';
let sent=[],writes=[],received=[],off=false,readError=false,blockedPhones=[],blockReadError=false;
const customers=[1,2].map(n=>({id:n,customer_phone:`0100000000${n}`,customer_name:`고객${n}`,live_alert_optin:true,live_alert_optin_at:new Date().toISOString()}));
const orders=customers.map(c=>({customer_phone:c.customer_phone,created_at:new Date().toISOString()}));
const db={from(table){let mutation=false,rows=[];const q={select(){return q},eq(){return q},gte(){return q},order(){return q},range(){return q},maybeSingle(){return Promise.resolve({data:{id:'broadcast',status:'ON'}})},upsert(value){mutation=true;rows=value;writes.push(value);return q},insert(value){writes.push(value);return Promise.resolve({error:null})},then(resolve,reject){return Promise.resolve(mutation?{data:rows.filter(r=>!received.includes(r.customer_phone)),error:null}:{data:table==='customers'?customers.map(c=>({...c,live_alert_optin:off?false:true})):table==='orders'?orders:table==='live_alert_recipients'?received.map(customer_phone=>({customer_phone})):[],error:readError?{message:'unavailable'}:null}).then(resolve,reject)}};return q}};
const {POST}=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>({sub:'admin'})},'@supabase/supabase-js':{createClient:()=>db},'@/lib/liveAlertBlockServer':{readLiveAlertBlockPhones:async()=>{if(blockReadError)throw new Error('x');return new Set(blockedPhones)}},solapi:{SolapiMessageService:class{async send(messages){sent.push(...messages);return {failedMessageList:[]}}}}})('app/api/admin-live/live-alert-send/route.ts');
async function call(body){const response=await POST({json:async()=>({broadcastId:'broadcast',mode:'priority',...body})});return {status:response.status,...await response.json()}}
const preview=await call({dryRun:true,limit:1,orderDays:90,recentDays:30});
assert.equal(preview.members?.length,2,'all opted-in unsent members are searchable, not just selected sample');
const selectedId=preview.sample[0].id;
const otherId=preview.members.find(m=>m.id!==selectedId).id;
const settings={dryRun:true,limit:1,orderDays:90,recentDays:30};
const removed=await call({...settings,selectionToken:preview.selectionToken,excludeIds:[selectedId],includeIds:[]});
assert.equal(removed.targetCount,0,'removal does not silently backfill');
const edited=await call({...settings,selectionToken:removed.selectionToken,includeIds:[otherId],excludeIds:[selectedId]});
assert.equal(edited.targetCount,1);assert.equal(edited.sample[0].id,otherId);assert.equal(edited.sample[0].manual,true);
assert.equal((await call({...settings,selectionToken:edited.selectionToken,includeIds:[otherId,selectedId]})).status,409,'adding above max does not silently evict');
const redrawn=await call({...settings,includeIds:[otherId],excludeIds:[selectedId]});
assert.equal(redrawn.sample[0].id,otherId,'pin survives redraw');
assert.equal((await call({...settings,includeIds:['forged']})).status,409);
assert.equal(sent.length,0);assert.equal(writes.length,0,'editing remains read-only');
const zeroCustomer={id:3,customer_phone:'01000000003',customer_name:'무주문',live_alert_optin:true,live_alert_optin_at:new Date().toISOString()};
customers.push(zeroCustomer);
const zeroPreview=await call({...settings,limit:20});
const zeroId=zeroPreview.members.find(m=>m.name==='무주문').id;
assert.equal((await call({...settings,selectionToken:removed.selectionToken,includeIds:[zeroId]})).status,409,'manual zero-order addition cannot override zero cap at limit 1');
const zeroPinned=await call({...settings,limit:20,includeIds:[zeroId]});
assert.equal(zeroPinned.sample.filter(m=>m.orderDays===0).length,1);
off=true;assert.equal((await call({...settings,includeIds:[otherId]})).status,409,'manual inclusion cannot override consent OFF');off=false;
received=[customers.find(c=>c.id===2).customer_phone];
const processedId=zeroPreview.members.find(m=>m.name==='고객2').id;
assert.equal((await call({...settings,includeIds:[processedId]})).status,409,'manual inclusion cannot override prior delivery');received=[];
customers.pop();
assert.equal(preview.targetCount,1);assert.equal(sent.length,0);assert.equal(writes.length,0);
assert.deepEqual(preview.selectionGroups,{frequent:0,newBuyer:1,noRecentOrders:0,noRecentOrdersMax:0});
const {sealAlertSelection}=createUiLoader()('lib/liveAlertSelection.ts');
const {readAlertSelection}=createUiLoader()('lib/liveAlertSelection.ts');
assert.equal(readAlertSelection(edited.selectionToken,'test','broadcast','admin',Date.now()).phones.length,1,'edited preview is sealed, not client-side only');
const oldToken=sealAlertSelection({broadcastId:'broadcast',actor:'admin',mode:'priority',phones:[customers[0].customer_phone],expires:Date.now()+60000},'test');
assert.equal((await call({selectionToken:oldToken})).status,409,'old uncapped selections must not survive rollout');assert.equal(sent.length,0);
assert.equal((await call({selectionToken:'invalid'})).status,409);assert.equal(sent.length,0);
off=true;assert.equal((await call({selectionToken:preview.selectionToken})).status,409);assert.equal(sent.length,0);off=false;
readError=true;assert.equal((await call({selectionToken:preview.selectionToken})).status,503);assert.equal(sent.length,0);readError=false;
const result=await call({selectionToken:edited.selectionToken});assert.equal(result.successCount,1);assert.equal(sent.length,1);assert.equal(sent[0].kakaoOptions.disableSms,true);
assert.deepEqual(sent.map(m=>m.to),readAlertSelection(edited.selectionToken,'test','broadcast','admin',Date.now()).phones,'provider receives exact edited manifest');
received=[sent[0].to];assert.equal((await call({selectionToken:edited.selectionToken})).status,409);assert.equal(sent.length,1);
assert.equal((await call({dryRun:true,limit:0,orderDays:90,recentDays:30})).status,400);
// [2026-11-01] 계속 제외 명단
received=[];
for(const mode of ['optin','all','priority']){
  blockedPhones=['01000000001'];
  const p=await call({mode,dryRun:true,limit:5,orderDays:90,recentDays:30});
  assert.equal(p.ok,true,mode);
  assert.ok(!p.sample.some(m=>m.name==='고객1'),mode+': blocked member not in send list');
  assert.ok(!p.members.some(m=>m.name==='고객1'),mode+': blocked member not addable');
  assert.equal(p.blockedCount,1,mode+': blocked count shown');
  assert.ok(p.sample.every(m=>typeof m.cid==='string'),mode+': cid for 계속 제외 button');
  blockedPhones=[];
}
{const all=await call({mode:'all',dryRun:true});
 const id1=all.sample.find(m=>m.name==='고객1').id;
 blockedPhones=['01000000001'];
 const pinned=await call({mode:'all',dryRun:true,includeIds:[id1],excludeIds:[]});
 assert.equal(pinned.ok,true,'manual include of blocked member is ignored, not an error');
 assert.ok(!pinned.sample.some(m=>m.name==='고객1'));
 const kept=await call({mode:'all',dryRun:true,selectionToken:all.selectionToken,includeIds:[],excludeIds:[]});
 assert.equal(kept.ok,true,'old token still usable after block');assert.ok(!kept.sample.some(m=>m.name==='고객1'));
 blockedPhones=[];
 const before=sent.length;
 blockedPhones=['01000000001'];
 const r=await call({mode:'all',selectionToken:all.selectionToken});
 assert.equal(r.ok,true);assert.ok(!sent.slice(before).some(m=>m.to==='01000000001'),'blocked after preview is skipped at send');
 assert.equal(sent.length-before,1,'no backfill');
 blockedPhones=[];received=[];
 blockReadError=true;const fail=await call({mode:'optin',dryRun:true});assert.equal(fail.status,503,'block list unreadable = stop');blockReadError=false;
}
// [2026-11-02] 발송 창에서 고른 템플릿 — 기존(Vercel) 고르면 그 ID, 목록에 없는 ID 는 안 보냄
{
 received=[];blockedPhones=[];
 const p=await call({mode:'optin',dryRun:true});
 const b=sent.length;
 const forged=await call({mode:'optin',selectionToken:p.selectionToken,templateId:'KA01TP_FORGED'});
 assert.equal(forged.status,400,'unknown template rejected');assert.equal(sent.length,b,'nothing sent');
 const okEnv=await call({mode:'optin',selectionToken:p.selectionToken,templateId:'test'});
 assert.equal(okEnv.ok,true);assert.ok(sent.slice(b).every(m=>m.kakaoOptions.templateId==='test'),'chosen env template used');
}
console.log('PASS API preview without sends/writes, exact recipient count, signed selection, consent recheck, fail-closed history, duplicate exclusion, SMS fallback disabled (mock provider only)');
