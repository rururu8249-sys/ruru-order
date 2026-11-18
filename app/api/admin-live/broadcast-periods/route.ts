/** Retired work-period feature. Pause/resume is deliberately independent of packing scopes. */
import {NextRequest,NextResponse} from 'next/server';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {getServiceClient} from '@/lib/youtube';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
 if(!await verifyAdminSessionFromRequest(request))return reply({ok:false,message:'관리자 로그인이 필요해요.'},401);
 return reply({ok:false,message:'작업 구간 분리 기능이 종료됐습니다. 물건챙기기는 방송 전체 주문 기준입니다.'},410);
}
export async function POST(request:NextRequest){
 if(!await verifyAdminSessionFromRequest(request))return reply({ok:false,message:'관리자 로그인이 필요해요.'},401);
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({ok:false,message:'요청 출처를 확인해 주세요.'},403);
 const body=await request.json().catch(()=>null);
 if(body?.action==='manualSplit')return reply({ok:false,message:'작업 구간 분리 기능이 종료됐습니다.'},410);
 const broadcastId=String(body?.broadcastId||'');
 if(!uuid.test(broadcastId)||typeof body?.paused!=='boolean')return reply({ok:false,message:'방송 및 일시정지 상태를 확인해 주세요.'},400);
 try{
  const {data,error}=await getServiceClient().rpc('ruru_admin_set_broadcast_pause_period',{
   p_broadcast_id:broadcastId,p_paused:body.paused
  });
  if(error)return reply({ok:false,message:error.message},503);
  return reply({ok:true,data});
 }catch{return reply({ok:false,message:'방송 상태를 저장하지 못했어요.'},503);}
}
