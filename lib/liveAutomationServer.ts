import type {SupabaseClient} from '@supabase/supabase-js';
import {AUTOMATION_OFF,type AutomationState,type AutomationFeature} from './liveAutomation';
import type {AutomationContext} from './liveAutomationAuth';
export type Campaign=AutomationContext['campaign'];
export type Actor=AutomationContext['actor'];
export type Session=AutomationContext['session'];
export type Action={id:string;campaign_id:string;session_id:string;actor_id:string;kind:'order'|'question'|'chat'|'reply';manual:boolean;due_at:string;status:string;revision:number;lease_token:string|null;lease_until:string|null;order_group_id:string;source_message_id:number|null;asked_at:string|null;plan:Record<string,unknown>;result:Record<string,unknown>|null};
export async function automationRpc<T>(db:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T> {
  const {data,error}=await db.rpc(name,args);
  if(error) throw new Error(error.message);
  return data as T;
}
export async function activeAutomationBroadcast(db:SupabaseClient):Promise<Record<string,unknown>|null> {
  const {data,error}=await db.from('broadcasts').select('*').eq('status','ON').neq('is_deleted',true).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error(error.message);
  return data;
}
export async function readAutomationState(db:SupabaseClient):Promise<AutomationState> {
  const bc=await activeAutomationBroadcast(db);
  if(!bc) return {...AUTOMATION_OFF,ready:true};
  const [campaign,ready]=await Promise.all([
    db.from('live_automation_campaigns').select('*').eq('broadcast_id',String(bc.id)).maybeSingle(),
    db.rpc('live_automation_runtime_ready'),
  ]);
  if(campaign.error) return {...AUTOMATION_OFF,broadcastId:String(bc.id)};
  const c=campaign.data;
  if(!c) return {...AUTOMATION_OFF,ready:ready.data===true,broadcastId:String(bc.id)};
  const [sessions,manual]=await Promise.all([
    db.from('live_automation_sessions').select('id',{count:'exact',head:true}).eq('campaign_id',c.id).eq('watching',true).is('stopped_at',null).gt('leave_at',new Date().toISOString()).gte('last_ack_at',new Date(Date.now()-75_000).toISOString()),
    db.from('live_automation_actions').select('id').eq('campaign_id',c.id).eq('manual',true).in('status',['pending','claimed','uncertain']).limit(1).maybeSingle(),
  ]);
  if(sessions.error || manual.error) throw new Error('실행 상태를 확인하지 못했어요.');
  return {ready:ready.data===true,broadcastId:String(bc.id),revision:Number(c.revision),orders:c.orders_enabled,chat:c.chat_enabled,viewers:c.viewers_enabled,
    activeViewers:sessions.count||0,nextOrderAt:c.next_order_at,manualAction:manual.data?.id||null,last:c.last_result||null};
}
export async function controlAutomation(db:SupabaseClient,feature:AutomationFeature|'all',enabled:boolean,revision:number):Promise<AutomationState> {
  const bc=await activeAutomationBroadcast(db);
  if(!bc) throw new Error('방송 중에 실행할 수 있어요.');
  await automationRpc(db,'live_automation_control',{p_broadcast:bc.id,p_feature:feature,p_enabled:enabled,p_revision:revision});
  return readAutomationState(db);
}
export async function automationPublic(db:SupabaseClient,bc:string):Promise<boolean> {
  const {data,error}=await db.from('live_automation_campaigns').select('orders_enabled,chat_enabled,viewers_enabled').eq('broadcast_id',bc).maybeSingle();
  return !error && Boolean(data && (data.orders_enabled||data.chat_enabled||data.viewers_enabled));
}
