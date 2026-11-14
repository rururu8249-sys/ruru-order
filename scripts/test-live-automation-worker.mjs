import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-signing-secret-over-32-characters';
let W;try{W=createUiLoader()('lib/liveAutomationWorker.ts')}catch{}
assert.ok(W,'a bounded server-session worker must replace browser-per-nickname execution');
const id='00000000-0000-4000-8000-000000000001';
const c={id,broadcast_id:id,revision:2,viewers_enabled:true,chat_enabled:false,orders_enabled:false,max_active:100,next_join_at:new Date(Date.now()+600000).toISOString()};
const sessions=Array.from({length:100},(_,i)=>({id:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),actor_id:id,campaign_id:id,watching:true,stopped_at:null,leave_at:new Date(Date.now()+600000).toISOString(),last_ack_at:new Date().toISOString(),visitor_key:'live-auto:visitor-'+i,cart_key:'live-auto:cart-'+i}));
let enabled=false,calls=[],rpcCalls=[],dueActions=[];
const db={from(table){let single=false;const q={select(){return q},eq(){return q},neq(){return q},is(){return q},gt(){return q},gte(){return q},lte(){return q},in(){return q},or(){return q},order(){return q},limit(){return q},update(){return q},maybeSingle(){single=true;return q},then(resolve,reject){const rows=table==='live_automation_campaigns'?(enabled?[c]:[]):table==='live_automation_sessions'?sessions:table==='live_automation_actions'?dueActions:[];return Promise.resolve({data:single?rows[0]??null:rows,error:null,count:rows.length}).then(resolve,reject)}};return q},async rpc(name,args){rpcCalls.push(name);if(name==='live_automation_population_step')return {data:{anchor:sessions[0].id,count:100,target:100},error:null};if(name==='live_automation_tick_claim')return {data:id,error:null};if(name==='live_automation_context'){const session=sessions.find(s=>s.id===args.p_session);return {data:{campaign:c,session,actor:{id,nickname:session.visitor_key}},error:null}}return {data:null,error:null}}};
const transport=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({ok:true,lastSeenAt:new Date().toISOString()}))};
await W.runAutomationTick(db,'https://shop.test','presence',transport);
assert.equal(calls.length,0);assert.equal(rpcCalls.length,0);
enabled=true;await W.runAutomationTick(db,'https://shop.test','presence',transport);
assert.equal(calls.length,1,'100 viewer heartbeats must use one real API request');assert.equal(calls[0].body.batch,true);
assert.ok(calls.every(x=>x.url.endsWith('/api/presence')&&x.body.path.endsWith('#live')));
assert.ok(!rpcCalls.some(n=>/gemini|submit|cart/.test(n)),'viewers-only never orders or calls AI');
assert.ok(rpcCalls.includes('live_automation_tick_release'));
let chats=0;
const isolated=createUiLoader({'./liveAutomationCatalog':{readAutomationSettings:async()=>({}),loadAutomationChoices:async()=>[{}],liveCardChoices:async()=>null},'./liveAutomationConversation':{runConversations:async()=>{chats++}}})('lib/liveAutomationWorker.ts');
c.orders_enabled=true;c.chat_enabled=true;c.tempo_plan={id,at:new Date().toISOString(),offsets:[0]};
const rpc=db.rpc;db.rpc=async(name,args)=>name==='live_automation_order_admission'?{error:{message:'ORDER_HOURLY_LIMIT'}}:rpc(name,args);
await isolated.runAutomationTick(db,'https://shop.test','actions',transport);
assert.equal(chats,1,'order capacity or catalog failure must not silence independently enabled chat');
console.log('PASS all-OFF worker performs no actions; 100 viewer sessions use one authenticated real presence batch and no AI/order calls');

let orderRuns=0;chats=0;
const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
try{
 dueActions=Array.from({length:3},(_,i)=>({id:String(i),plan:{stage:i===1?'submit':'cart'},status:'pending'}));
 db.rpc=async(name,args)=>name==='live_automation_claim'?{data:dueActions.find(a=>a.id===args.p_action)}:rpc(name,args);
 const bounded=createUiLoader({
  './liveAutomationCatalog':{readAutomationSettings:async()=>({}),loadAutomationChoices:async()=>[{}],liveCardChoices:async()=>null},
  './liveAutomationTransport':{runOrderAction:async()=>{orderRuns++;clock+=21000;return {ok:true}}},
  './liveAutomationConversation':{runConversations:async()=>{chats++}},
 })('lib/liveAutomationWorker.ts');
 await bounded.runAutomationTick(db,'https://shop.test','actions',transport);
 assert.equal(orderRuns,1,'slow first request defers the remaining actions before lease expiry');
 assert.equal(chats,0,'slow order tick defers AI instead of exceeding its runtime budget');
}finally{Date.now=originalNow}

// One already-staged slow shopper must not prevent the next independent wave.
let admissions=0,plans=0;
const slow={id:'slow',kind:'order',status:'pending',plan:{stage:'submit',waveId:'old-wave'},due_at:new Date(Date.now()+64*60000).toISOString()};
const waveCampaign={...c,chat_enabled:false,tempo_plan:{id:'new-wave',at:new Date().toISOString(),offsets:[0]}};
const waveDb={from(table){let select='',waveId=null,due=null;const q={select(v){select=v;return q},eq(k,v){if(k==='plan->>waveId')waveId=v;return q},or(){return q},in(){return q},limit(){return q},order(){return q},lte(k,v){due=v;return q},then(resolve,reject){let data=table==='live_automation_campaigns'?[waveCampaign]:table==='live_automation_actions'?[slow]:[];if(waveId)data=data.filter(a=>a.plan.waveId===waveId);if(due)data=data.filter(a=>Date.parse(a.due_at)<=Date.parse(due));return Promise.resolve({data,error:null}).then(resolve,reject)}};return q},async rpc(name){if(name==='live_automation_tick_claim')return {data:id};if(name==='live_automation_order_admission'){admissions++;return {error:{message:'STOP_BEFORE_WRITING_TEST'}}}if(name==='live_automation_plan_tempo'){plans++;return {data:{id:'future-wave',at:new Date(Date.now()+15*60000).toISOString(),offsets:[0]}}}return {data:null}}};
await isolated.runAutomationTick(waveDb,'https://shop.test','actions',transport);
assert.equal(admissions,1,'a 64-minute staged cart must allow next-wave admission');
waveCampaign.tempo_plan.id='old-wave';admissions=0;
await isolated.runAutomationTick(waveDb,'https://shop.test','actions',transport);
assert.equal(plans,1);assert.equal(admissions,0,'already materialized wave gets a future schedule, never duplicate carts');
slow.plan.stage='cart';plans=0;
await isolated.runAutomationTick(waveDb,'https://shop.test','actions',transport);
assert.equal(plans,0);assert.equal(admissions,0,'unstarted wave still blocks more backlog');
console.log('PASS slow staged shopper coexists with later waves; no duplicate wave or unstarted backlog');
