import type {SupabaseClient} from '@supabase/supabase-js';
import {AUTOMATION_OWNER,dwellMinutes,orderTarget,type AutomationLine} from './liveAutomation';
import type {AutomationContext} from './liveAutomationAuth';
import {automationRpc,activeAutomationBroadcast,type Campaign,type Actor,type Session,type Action} from './liveAutomationServer';
import {createPersona} from './liveAutomationPersona';
import {NICKNAME_CANDIDATES} from './liveAutomationNicknames';
import {loadAutomationChoices,readAutomationSettings} from './liveAutomationCatalog';
import {automationPost,runOrderAction} from './liveAutomationTransport';
import {pickOrderLines,type AutoTestSettings,type AutoTestPick} from './autoTestOrder';
import {runConversations} from './liveAutomationConversation';
import {interleaveOrderStages,planOrderJourney} from './liveAutomationTempo';
type Wave={id:string;mode:string;at:string;offsets:number[];planned?:boolean};
type LiveCampaign=Campaign & {tempo_plan?:Wave;next_chat_at?:string|null};
const nowIso=()=>new Date().toISOString();
async function rows<T>(query:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<T[]> {
 const result=await query;if(result.error)throw Error(result.error.message);return (result.data||[]) as T[];
}
async function ensurePool(db:SupabaseClient) {
 const existing=await db.from('live_automation_nickname_pool').select('nickname_key',{head:true,count:'exact'}).eq('status','unused');
 if(existing.error)throw Error(existing.error.message);
 if((existing.count||0)>=50)return;
 const suffix=String(Math.floor(Math.random()*90)+10);
 const extra=NICKNAME_CANDIDATES.filter(x=>x.category==='korean'||x.category==='humor').slice(0,100).map(x=>({...x,nickname:x.nickname.slice(0,12)+suffix,category:'hangul_number'}));
 await automationRpc(db,'live_automation_pool_refill',{p_candidates:[...NICKNAME_CANDIDATES,...extra]});
}
async function freshActor(db:SupabaseClient,c:LiveCampaign,target:number,minutes:number,watch:boolean):Promise<{actor:Actor;session:Session}> {
 await ensurePool(db);
 return automationRpc(db,'live_automation_pool_assign',{p_broadcast:c.broadcast_id,p_profile:createPersona(Math.floor(Math.random()*12)),p_target:target,p_minutes:minutes,p_watch:watch});
}
async function activeSessions(db:SupabaseClient,c:Campaign) {
 return rows<Session>(db.from('live_automation_sessions').select('*').eq('campaign_id',c.id).is('stopped_at',null).gt('leave_at',nowIso()));
}
async function presenceTick(db:SupabaseClient,c:LiveCampaign,origin:string,transport:typeof fetch) {
 await ensurePool(db);
 const population=await automationRpc<{anchor:string|null;count:number;target:number}>(db,'live_automation_population_step',{
   p_campaign:c.id,p_revision:c.revision,p_profiles:Array.from({length:12},(_,seed)=>createPersona(seed)),
 });
 if(!population.anchor)return [];
 const ctx=await automationRpc<AutomationContext>(db,'live_automation_context',{p_session:population.anchor,p_revision:c.revision,p_scope:'presence'});
 return Promise.allSettled([automationPost(origin,'/api/presence',ctx,null,'presence',{
   visitorKey:ctx.session.visitor_key,kakaoId:AUTOMATION_OWNER,nickname:ctx.actor.nickname,pageType:'order_form',path:'/order#live',batch:true,
 },transport)]);
}
async function orderActor(db:SupabaseClient,c:LiveCampaign,excluded:Set<string>):Promise<{actor:Actor;session:Session}> {
 const [actors,sessions,pending]=await Promise.all([
   rows<Actor>(db.from('live_automation_actors').select('*').eq('campaign_id',c.id).is('retired_at',null).limit(300)),
   activeSessions(db,c),rows<Action>(db.from('live_automation_actions').select('*').eq('campaign_id',c.id).eq('kind','order').in('status',['pending','claimed','uncertain'])),
 ]);
 const busy=new Set([...excluded,...pending.map(a=>a.actor_id)]);
 const candidates=actors.filter(a=>a.order_target>a.order_count&&!busy.has(a.id)&&(!a.next_order_after||Date.parse(a.next_order_after)<=Date.now()));
 const available=candidates.filter(a=>sessions.some(s=>s.actor_id===a.id&&Date.parse(s.leave_at)>Date.now()+180000));
 const active=available[Math.floor(Math.random()*available.length)];
 if(active)return {actor:active,session:sessions.find(s=>s.actor_id===active.id)!};
 const watch=c.viewers_enabled&&sessions.filter(s=>s.watching).length<c.max_active;
 if(candidates.length) {
   const actor=candidates[Math.floor(Math.random()*candidates.length)];
   const session=await automationRpc<Session>(db,'live_automation_reconnect',{p_actor:actor.id,p_minutes:dwellMinutes(),p_watch:watch});
   return {actor,session};
 }
 const minutes=dwellMinutes();
 return freshActor(db,c,orderTarget(minutes,6),minutes,watch);
}
function planLines(picks:AutoTestPick[]):AutomationLine[] {
 return picks.map(({productId,productName,color,size,unitPrice,qty})=>({productId,productName,color:color==='없음'?'':color,size:size==='없음'?'':size,unitPrice,qty}));
}
async function planWave(db:SupabaseClient,c:LiveCampaign,settings:AutoTestSettings) {
 const pending=await rows<Action>(db.from('live_automation_actions').select('id').eq('campaign_id',c.id).eq('kind','order').in('status',['pending','claimed','uncertain']).limit(1));
 if(pending.length)return;
 let wave=c.tempo_plan;
 if(!wave)wave=await automationRpc<Wave>(db,'live_automation_plan_tempo',{p_campaign:c.id,p_quiet:false});
 if(!wave||Date.parse(wave.at)>Date.now()+150000)return;
 const choices=await loadAutomationChoices(db,c.broadcast_id,settings),excluded=new Set<string>();
 if(!choices.length){await automationRpc(db,'live_automation_plan_tempo',{p_campaign:c.id,p_quiet:true});return;}
 // Expired schedules are replanned; resuming a worker never catches up a backlog.
 if(Date.parse(wave.at)<Date.now()-180000){await automationRpc(db,'live_automation_plan_tempo',{p_campaign:c.id,p_quiet:false});return;}
 for(const offset of wave.offsets.slice(0,8)) {
   await automationRpc(db,'live_automation_order_admission',{p_campaign:c.id,p_action:null});
   let picks:AutoTestPick[]=[];
   for(let attempt=0;attempt<5;attempt++){
     const proposed=pickOrderLines(choices);
     try{await automationRpc(db,'live_automation_check_items',{p_broadcast:c.broadcast_id,p_items:planLines(proposed)});picks=proposed;break;}catch{}
   }
   if(!picks.length)continue;
   const actor=await orderActor(db,c,excluded);excluded.add(actor.actor.id);
   const {cartAt,submitAt:plannedSubmit}=planOrderJourney(Date.now(),Date.parse(wave.at),offset);
   await automationRpc(db,'live_automation_action',{p_session:actor.session.id,p_kind:'order',p_due:new Date(cartAt).toISOString(),
     p_plan:{lines:planLines(picks),groups:picks.map(p=>p.group),submitAt:new Date(plannedSubmit).toISOString(),waveId:wave.id},p_manual:false,p_source:null,p_revision:c.revision});
 }
 if(!excluded.size)await automationRpc(db,'live_automation_plan_tempo',{p_campaign:c.id,p_quiet:true});
}
async function actionsTick(db:SupabaseClient,c:LiveCampaign,origin:string,transport:typeof fetch) {
 const deadline=Date.now()+35000;
 await automationRpc(db,'live_automation_expire',{p_campaign:c.id});
 const results:PromiseSettledResult<unknown>[]=[];
 const record=async(work:()=>Promise<unknown>)=>{try{results.push({status:'fulfilled',value:await work()})}catch(reason){results.push({status:'rejected',reason})}};
 let settings:AutoTestSettings|undefined;
 try {
   settings=await readAutomationSettings(db);
   if(c.orders_enabled)await planWave(db,c,settings);
 }catch(reason){results.push({status:'rejected',reason})}
 try {
   const due=await rows<Action>(db.from('live_automation_actions').select('*').eq('campaign_id',c.id).eq('kind','order')
     .in('status',['pending','claimed','uncertain']).lte('due_at',nowIso()).order('due_at').limit(24));
   const selected=settings?interleaveOrderStages(due):[];
   const receiptAt=Math.floor(Math.random()*(selected.length+1));
   for(let i=0;i<=selected.length;i++){
     if(c.orders_enabled&&i===receiptAt)await record(()=>automationRpc(db,'live_automation_drain_payments',{p_campaign:c.id,p_revision:c.revision}));
     const a=selected[i];if(!a)continue;
     if(deadline-Date.now()<22000)break; // Leave unclaimed work for the next tick.
     await record(async()=>{
       const claimed=await automationRpc<Action|null>(db,'live_automation_claim',{p_action:a.id,p_revision:c.revision});
       if(!claimed||claimed.status==='succeeded')return null;
       return runOrderAction(db,origin,claimed,settings!,transport,Math.random,deadline);
     });
   }
 }catch(reason){results.push({status:'rejected',reason})}
 if(c.chat_enabled&&deadline-Date.now()>=30000){
   try{await runConversations(db,c,origin,transport)}catch(reason){results.push({status:'rejected',reason})}
 }
 return results;
}
export async function runAutomationTick(db:SupabaseClient,origin:string,kind:'presence'|'actions',transport:typeof fetch=fetch) {
 const campaigns=await rows<LiveCampaign>(db.from('live_automation_campaigns').select('*').or('orders_enabled.eq.true,chat_enabled.eq.true,viewers_enabled.eq.true'));
 const results=[];
 for(const c of campaigns) {
   if(kind==='presence'&&!c.viewers_enabled||kind==='actions'&&!c.orders_enabled&&!c.chat_enabled)continue;
   const token=await automationRpc<string|null>(db,'live_automation_tick_claim',{p_campaign:c.id,p_kind:kind,p_revision:c.revision});
   if(!token)continue;
   try {results.push(kind==='presence'?await presenceTick(db,c,origin,transport):await actionsTick(db,c,origin,transport));}
   finally {await automationRpc(db,'live_automation_tick_release',{p_campaign:c.id,p_kind:kind,p_token:token});}
 }
 const failures=results.flat().filter(r=>r.status==='rejected').length;
 return {processed:results.length,failures};
}
export async function runAutomationNow(db:SupabaseClient,origin:string,transport:typeof fetch=fetch) {
 const bc=await activeAutomationBroadcast(db);if(!bc)throw Error('방송 중에 실행할 수 있어요.');
 const c=await automationRpc<LiveCampaign>(db,'live_automation_ensure_campaign',{p_broadcast:bc.id});
 const previous=await rows<Action>(db.from('live_automation_actions').select('*').eq('campaign_id',c.id).eq('manual',true).in('status',['pending','claimed','uncertain']).limit(1));
 let action=previous[0];
 const settings=await readAutomationSettings(db);
 if(!action) {
   const choices=await loadAutomationChoices(db,c.broadcast_id,settings);
   if(!choices.length)throw Error('지금 주문 가능한 상품이 없어요.');
   const picks=pickOrderLines(choices);
   await automationRpc(db,'live_automation_check_items',{p_broadcast:c.broadcast_id,p_items:planLines(picks)});
   const actor=await orderActor(db,c,new Set());
   action=await automationRpc<Action>(db,'live_automation_action',{p_session:actor.session.id,p_kind:'order',p_due:nowIso(),
     p_plan:{lines:planLines(picks),groups:picks.map(p=>p.group),broadcastTitle:String(bc.broadcast_public_title||'')},p_manual:true,p_source:null,p_revision:c.revision});
 }
 const claimed=await automationRpc<Action|null>(db,'live_automation_claim',{p_action:action.id,p_revision:c.revision});
 if(!claimed)return {ok:true,phase:'running',actionId:action.id};
 return runOrderAction(db,origin,claimed,settings,transport);
}
