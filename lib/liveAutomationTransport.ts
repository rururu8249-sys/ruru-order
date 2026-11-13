import type {SupabaseClient} from '@supabase/supabase-js';
import {AUTOMATION_HEADER,AUTOMATION_OWNER,AUTOMATION_PHONE,type AutomationLine} from './liveAutomation';
import {signAutomationCapability,type AutomationContext,type AutomationScope} from './liveAutomationAuth';
import {automationRpc,type Action} from './liveAutomationServer';
import {buildOrderRows,choosePayment,verifySavedRows,type AutoTestSettings,type AutoTestPick} from './autoTestOrder';
import {cartDelay} from './liveAutomationTempo';
import type {ShippingGroup} from './shippingGroups';
export async function automationPost(origin:string,path:string,ctx:AutomationContext,action:Action|null,scope:AutomationScope,body:unknown,transport:typeof fetch=fetch,deadline=Date.now()+20000):Promise<Record<string,unknown>> {
 const remaining=deadline-Date.now();if(remaining<1000)throw Error('WORKER_TIME_BUDGET');
 const token=signAutomationCapability({session:ctx.session.id,action:action?.id,lease:action?.lease_token||undefined,revision:ctx.campaign.revision,scope});
 const response=await transport(new URL(path,origin).toString(),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',[AUTOMATION_HEADER]:token},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.min(20000,remaining))});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.ok!==true||result.allOk===false)throw Error(String(result?.message||result?.error||'CUSTOMER_API_FAILED'));
 return result;
}
export async function runOrderAction(db:SupabaseClient,origin:string,action:Action,settings:AutoTestSettings,transport:typeof fetch=fetch,random=Math.random,deadline=Date.now()+40000) {
 let submitting=false;
 try {
   const ctx=await automationRpc<AutomationContext>(db,'live_automation_context',{p_session:action.session_id,p_revision:action.revision,p_scope:'order'});
   const lines=action.plan.lines as AutomationLine[];
   // This happens before any public mutation; the transaction rechecks again for a stock race.
   await automationRpc(db,'live_automation_check_items',{p_broadcast:ctx.campaign.broadcast_id,p_items:lines});
   if(action.plan.stage!=='submit') {
     await automationPost(origin,'/api/cart-reservations',ctx,action,'cart',{action:'sync',sessionKey:ctx.session.cart_key,kakaoId:AUTOMATION_OWNER,phone:AUTOMATION_PHONE,nickname:ctx.actor.nickname,items:lines},transport,deadline);
     if(!action.manual) {
       const planned=Date.parse(String(action.plan.submitAt||'')),now=Date.now();
       const submitAt=Number.isFinite(planned)?Math.min(now+150000,Math.max(now+15000,planned)):now+cartDelay(random);
       await automationRpc(db,'live_automation_stage_order',{p_action:action.id,p_lease:action.lease_token,p_revision:action.revision,p_submit_at:new Date(submitAt).toISOString()});
       return {ok:true,phase:'cart'};
     }
   }
   const groups=Array.isArray(action.plan.groups)?action.plan.groups as ShippingGroup[]:[];
   const picks:AutoTestPick[]=lines.map((line,i)=>({...line,group:groups[i]||'normal'}));
   const payment=action.plan.payment==='카드결제'?'카드결제':action.plan.payment==='무통장입금'?'무통장입금':choosePayment(picks,settings,random);
   const rows=buildOrderRows({lines:picks,paymentMethod:payment,nickname:ctx.actor.nickname,groupId:action.order_group_id,
     lookupCode:'RURU-'+action.order_group_id.replace(/-/g,'').slice(0,12).toUpperCase(),
     broadcast:{id:ctx.campaign.broadcast_id,title:String(action.plan.broadcastTitle||''),subtitle:''},settings})
     .map(row=>({...row,customer_name:ctx.actor.nickname,kakao_id:AUTOMATION_OWNER,address:'서울특별시',detail_address:'직접 수령'}));
   submitting=true;
   await automationPost(origin,'/api/customer-orders/submit',ctx,action,'order',{
     orderRows:rows,kakao_id:AUTOMATION_OWNER,customer_phone:AUTOMATION_PHONE,youtube_nickname:ctx.actor.nickname,customer_name:ctx.actor.nickname,
     cart_session_key:ctx.session.cart_key,point_use_amount:0,purchase_consent_accepted:true,
   },transport,deadline);
   const saved=await db.from('orders').select('*').eq('order_group_id',action.order_group_id).eq('automation_action_id',action.id);
   if(saved.error||!saved.data?.length)throw Error('SAVE_NOT_CONFIRMED');
   const problems=verifySavedRows(rows,saved.data as Record<string,unknown>[]);
   if(problems.length)throw Error('SAVE_MISMATCH: '+problems.join(','));
   return {ok:true,phase:'submitted',groupId:action.order_group_id};
 } catch(error) {
   const message=error instanceof Error?error.message:'ACTION_FAILED';
   // Completion is conditional on the old lease. A concurrently committed submit remains succeeded.
   await automationRpc(db,'live_automation_complete',{p_action:action.id,p_lease:action.lease_token,p_status:submitting?'uncertain':'skipped',
     p_result:{ok:false,message,driver:'server'}}).catch(()=>{});
   return {ok:false,phase:submitting?'uncertain':'skipped',message};
 }
}
