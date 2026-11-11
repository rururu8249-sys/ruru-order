import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {sameChatOrigin} from '@/lib/liveChatSession';
import {rpsAccess,uuid} from '@/lib/rpsServer';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const actions=new Set(['create','close','start','next','lobbyTime','pause','resume','settings','pvp','retry']);
export async function POST(req:NextRequest){
 if(!sameChatOrigin(req))return reply({ok:false,message:'잘못된 요청입니다.'},403);
 try {
 if(Number(req.headers.get('content-length')||0)>8192)return reply({ok:false,message:'요청이 너무 큽니다.'},413);
 const text=await req.text();if(text.length>8192)return reply({ok:false,message:'요청이 너무 큽니다.'},413);
 const raw=JSON.parse(text);const {identity,admin}=await rpsAccess(req);const sb=getServiceClient();
 let result;
 if(raw.action==='join'||raw.action==='pick'||raw.action==='claim'){
 if(!identity)return reply({ok:false,message:'안전한 참가를 위해 카카오 본인 확인을 해주세요.',verify:true},401);
 if(admin)return reply({ok:false,message:'진행자는 관전과 게임 진행을 이용해 주세요.'},403);
 if(!uuid.test(String(raw.room||'')))return reply({ok:false,message:'게임 정보가 없습니다.'},400);
 if(raw.action==='claim')result=await sb.rpc('rps_claim_self',{p_room:raw.room,p_kakao:identity.sub,p_phone:identity.phone});
 else if(raw.action==='join')result=await sb.rpc('rps_join',{p_room:raw.room,p_kakao:identity.sub,p_phone:identity.phone});
 else {
 if(!Number.isInteger(raw.round)||!['rock','paper','scissors'].includes(raw.hand))return reply({ok:false,message:'선택을 확인해 주세요.'},400);
 result=await sb.rpc('rps_pick',{p_room:raw.room,p_kakao:identity.sub,p_round:raw.round,p_hand:raw.hand});
 }
 } else {
 if(!admin)return reply({ok:false,message:'관리자만 게임을 설정할 수 있어요.'},403);
 if(!actions.has(raw.action)||!Number.isSafeInteger(raw.revision))return reply({ok:false,message:'게임 명령을 확인해 주세요.'},400);
 const data=raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data)?raw.data:{};
 if(raw.action==='create'&&!data.test){
 if(!uuid.test(String(data.broadcastId||'')))return reply({ok:false,message:'방송 화면에서 게임을 시작하세요.'},400);
 const bc=await sb.from('broadcasts').select('id').eq('id',data.broadcastId).eq('status','ON').maybeSingle();
 if(bc.error||!bc.data)return reply({ok:false,message:'현재 방송을 확인하지 못했어요.'},409);
 }
 result=await sb.rpc('rps_admin',{p_action:raw.action,p_data:data,p_expected:raw.revision});
 }
 if(result.error){const message=result.error.message;return reply({ok:false,message:/[가-힣]/.test(message)?message:'설정값을 확인한 후 다시 시도해 주세요.'},409);}
 return reply({ok:true,result:result.data});
 }catch{return reply({ok:false,message:'연결이 불안정해요. 상태를 확인하고 다시 시도해 주세요.'},503);}
}
