import {personaOrderHistory} from '@/lib/liveAutomationOrderHistory';
import type {ManualActor} from '@/lib/liveAutomationManualChat';
import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {sameChatOrigin} from '@/lib/liveChatSession';
import {MANUAL_UUID,manualChatOperator,manualChatFailure} from '@/lib/liveAutomationManualChat';
import {automationRpc} from '@/lib/liveAutomationServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest) {
  try {
    const db=getServiceClient(),operator=await manualChatOperator(request,db);
    if(!operator) return reply({ok:false},403);
    const bc=request.nextUrl.searchParams.get('bc')||'',client=request.nextUrl.searchParams.get('client')||'';
    if(!MANUAL_UUID.test(bc)||!MANUAL_UUID.test(client)) return reply({ok:false},400);
    const actors=await automationRpc<ManualActor[]>(db,'live_automation_manual_list',{p_broadcast:bc,p_operator:operator,p_client:client});
    const actor=request.nextUrl.searchParams.get('actor');
    if(actor){if(!MANUAL_UUID.test(actor)||!actors.some(a=>a.id===actor))return reply({ok:false},404);return reply({ok:true,orders:await personaOrderHistory(db,actor,bc)});}
    return reply({ok:true,actors:actors.map(a=>({...a,used:a.activity.used===true})),serverTime:new Date().toISOString()});
  } catch(error) {const e=manualChatFailure(error);return reply({ok:false,message:e.message},e.status);}
}
export async function POST(request:NextRequest) {
  try {
    if(!sameChatOrigin(request)) return reply({ok:false},403);
    const db=getServiceClient(),operator=await manualChatOperator(request,db);
    if(!operator) return reply({ok:false},403);
    const raw=await request.json();
    if(!MANUAL_UUID.test(String(raw.clientId||''))) return reply({ok:false},400);
    if(raw.action==='select') {
      if(!MANUAL_UUID.test(String(raw.bc||''))||!MANUAL_UUID.test(String(raw.actorId||''))) return reply({ok:false},400);
      const lease=await automationRpc(db,'live_automation_manual_select',{p_broadcast:raw.bc,p_actor:raw.actorId,p_operator:operator,p_client:raw.clientId});
      return reply({ok:true,lease});
    }
    if(!MANUAL_UUID.test(String(raw.token||'')) || !['renew','release'].includes(raw.action)) return reply({ok:false},400);
    const lease=await automationRpc(db,'live_automation_manual_'+raw.action,{p_token:raw.token,p_operator:operator,p_client:raw.clientId});
    return reply({ok:true,lease});
  } catch(error) {const e=manualChatFailure(error);return reply({ok:false,message:e.message},e.status);}
}
