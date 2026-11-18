import {NextRequest,NextResponse} from 'next/server';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {getServiceClient} from '@/lib/youtube';
import {chatIdentityFromRequest,sameChatOrigin,verifiedChatRole} from '@/lib/liveChatSession';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const UUID=/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const fail=(message:string,status=400)=>NextResponse.json({ok:false,message},{status,headers:{'Cache-Control':'no-store'}});

/** All visible chat rows in the current broadcast are hidden, NEVER deleted.
 * Existing hidden_at realtime update broadcasts remove them on all viewers.
 * New messages are unaffected because only currently visible rows are updated. */
export async function POST(request:NextRequest){
  if(!sameChatOrigin(request))return fail('허용되지 않은 요청입니다.',403);
  const body=await request.json().catch(()=>null);
  const bc=String(body?.bc??'').trim();
  if(!UUID.test(bc))return fail('방송을 확인할 수 없습니다.');
  const admin=await verifyAdminSessionFromRequest(request);
  const identity=chatIdentityFromRequest(request);
  if(!admin&&!identity)return fail('관리자 본인 확인이 필요합니다.',401);
  try{
    const db=getServiceClient();
    if(!admin){
      if(!identity)return fail('관리자 본인 확인이 필요합니다.',401);
      const role=await verifiedChatRole(db,identity);
      if(!role.isOwner&&!role.isManager)return fail('채팅 화면을 비울 권한이 없습니다.',403);
    }
    const {data:broadcast,error:bcError}=await db.from('broadcasts')
      .select('id,status,is_deleted').eq('id',bc).maybeSingle();
    if(bcError)return fail('방송 상태를 확인할 수 없습니다.',503);
    if(!broadcast||broadcast.status!=='ON'||broadcast.is_deleted)return fail('현재 방송만 비울 수 있습니다.',409);
    const {error}=await db.from('live_chat_messages')
      .update({hidden_at:new Date().toISOString(),hidden_by:'screen_clear',pinned_at:null})
      .eq('broadcast_id',bc).is('hidden_at',null);
    if(error)return fail('채팅 화면을 비우지 못했습니다.',503);
    return NextResponse.json({ok:true,message:'기존 채팅을 모든 화면에서 숨겼습니다. 새 채팅은 정상 표시됩니다.'},
      {headers:{'Cache-Control':'no-store'}});
  }catch{return fail('채팅 화면을 비우지 못했습니다.',503);}
}
