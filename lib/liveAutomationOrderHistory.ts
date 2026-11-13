import type {SupabaseClient} from '@supabase/supabase-js';
export type PersonaOrderRecord={id:string;at:string;deleted:boolean;lines:{name:string;color:string;size:string;qty:number}[]};
/** Successful action plans survive removal of rehearsal orders. Never return phone/address/payment credentials. */
export async function personaOrderHistory(db:SupabaseClient,actor:string,bc:string):Promise<PersonaOrderRecord[]>{
 const campaign=await db.from('live_automation_campaigns').select('id').eq('broadcast_id',bc).maybeSingle();
 if(campaign.error||!campaign.data)throw Error('NOT_ELIGIBLE');
 const actions=await db.from('live_automation_actions').select('id,order_group_id,completed_at,plan').eq('campaign_id',campaign.data.id).eq('actor_id',actor).eq('kind','order').eq('status','succeeded').order('completed_at',{ascending:false}).limit(30);
 if(actions.error)throw Error('ORDER_HISTORY_UNAVAILABLE');
 const groups=(actions.data||[]).map(a=>a.order_group_id).filter(Boolean);
 const orders=groups.length?await db.from('orders').select('order_group_id,is_deleted').eq('broadcast_id',bc).eq('automation_actor_id',actor).in('order_group_id',groups):{data:[],error:null};
 if(orders.error)throw Error('ORDER_HISTORY_UNAVAILABLE');
 return (actions.data||[]).map(a=>({id:String(a.id),at:String(a.completed_at),deleted:!(orders.data||[]).some(o=>o.order_group_id===a.order_group_id&&!o.is_deleted),lines:(Array.isArray(a.plan?.lines)?a.plan.lines:[]).map((i:Record<string,unknown>)=>({name:String(i.productName||''),color:String(i.color||''),size:String(i.size||''),qty:Number(i.qty)||1}))}));
}
