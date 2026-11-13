import {NextRequest,NextResponse} from 'next/server';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {getServiceClient} from '@/lib/youtube';
import {readAutomationState,controlAutomation} from '@/lib/liveAutomationServer';
import {runAutomationNow} from '@/lib/liveAutomationWorker';
import {readAutoTestRows,deleteAutoTestOrders} from '@/lib/autoTestOrderServer';
import {readGeminiUsage} from '@/lib/geminiGate';
import type {AutomationFeature} from '@/lib/liveAutomation';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const fail=(message:string,status=400)=>NextResponse.json({ok:false,message},{status});
// [2026-11-13 23:06] 테스트 주문 양 적게/보통/많게 — settings 한 줄(돈·주문 무접촉)
const PACE_KEY='live_automation_order_pace';
const paceOf=(v:unknown)=>{const s=String(v??'').replace(/"/g,'').trim();return s==='low'||s==='high'?s:'normal';};
export async function GET(request:NextRequest){
 if(!await verifyAdminSessionFromRequest(request))return fail('관리자 로그인이 필요해요.',401);
 try{
   const db=getServiceClient();
   const [state,rows,gemini,paceRow]=await Promise.all([readAutomationState(db),readAutoTestRows(db,null),readGeminiUsage(db),db.from('settings').select('value').eq('key',PACE_KEY).maybeSingle()]);
   return NextResponse.json({ok:true,state,testOrders:new Set(rows.map(r=>String(r.order_group_id))).size,gemini,pace:paceOf((paceRow.data as {value?:unknown}|null)?.value)},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('실행 상태를 확인하지 못했어요.',503)}
}
export async function POST(request:NextRequest){
 if(!await verifyAdminSessionFromRequest(request))return fail('관리자 로그인이 필요해요.',401);
 if(request.headers.get('origin')!==request.nextUrl.origin)return fail('잘못된 요청이에요.',403);
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object')return fail('요청을 확인해 주세요.');
 const db=getServiceClient();
 try{
   if(body.action==='control'){
     if(!['orders','chat','viewers','all'].includes(body.feature)||typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision)||body.revision<0)return fail('실행 설정을 확인해 주세요.');
     const state=await controlAutomation(db,body.feature as AutomationFeature|'all',body.enabled,body.revision);
     return NextResponse.json({ok:true,state});
   }
   if(body.action==='pace'){
     if(!['low','normal','high'].includes(body.pace))return fail('주문 양을 확인해 주세요.');
     const saved=await db.from('settings').upsert([{key:PACE_KEY,value:body.pace}],{onConflict:'key'});
     if(saved.error)throw Error('PACE_SAVE');
     // 다음 주문이 2분보다 멀면 새 양으로 바로 다시 계획
     const camps=await db.from('live_automation_campaigns').select('id,next_order_at').eq('orders_enabled',true);
     for(const c of (camps.data||[]) as {id:string;next_order_at:string|null}[]){
       if(!c.next_order_at||Date.parse(c.next_order_at)-Date.now()>120000)await db.rpc('live_automation_plan_tempo',{p_campaign:c.id,p_quiet:false});
     }
     return NextResponse.json({ok:true,pace:body.pace,state:await readAutomationState(db)});
   }
   if(body.action==='run'){
     const result=await runAutomationNow(db,request.nextUrl.origin);
     return NextResponse.json({ok:true,result,state:await readAutomationState(db)});
   }
   if(body.action==='delete'){
     const state=await readAutomationState(db);
     if(state.orders||state.chat||state.viewers||state.manualAction)return fail('먼저 자동 실행을 중지해 주세요.',409);
     const result=await deleteAutoTestOrders(db,null);
     return NextResponse.json({ok:true,...result,state:await readAutomationState(db)});
   }
   if(['screen-plan','screen-verify','chat-after','toggle-public','toggle','toggle-chat'].includes(body.action))return fail('화면이 변경됐어요. 새로고침해 주세요.',410);
   return fail('알 수 없는 요청이에요.');
 }catch(e){
   const message=e instanceof Error?e.message:'';
   return fail(message.includes('STALE_REVISION')?'다른 관리자가 설정을 변경했어요. 최신 상태에서 다시 눌러 주세요.':message.includes('NOT_READY')?'실행 기능을 준비 중이에요.':message.includes('BROADCAST_ENDED')?'방송이 종료되어 실행을 멈췄어요.':'처리하지 못했어요. 상태를 다시 확인해 주세요.',409);
 }
}
