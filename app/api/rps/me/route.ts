import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {rpsAccess,rpsState,uuid} from '@/lib/rpsServer';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try {
 const {identity,admin}=await rpsAccess(req);const room=req.nextUrl.searchParams.get('room');const sb=getServiceClient();
 let player=null;let winners:unknown[]=[];
 if(room&&uuid.test(room)) {
 if(identity){const result=await sb.from('rps_players').select('id,nickname,alive,winner,choice,choice_round,result,reward_status,reward_message').eq('room_id',room).eq('kakao_id',identity.sub).maybeSingle();if(result.error)throw result.error;player=result.data;}
 if(admin){const result=await sb.from('rps_players').select('id,nickname,winner_id,reward_status,reward_message').eq('room_id',room).eq('winner',true).order('joined_at');if(result.error)throw result.error;winners=result.data??[];}
 }
 return reply({ok:true,verified:!!identity,admin,player,winners,...(admin?{state:await rpsState()}:{}),serverTime:new Date().toISOString()});
 }catch{return reply({ok:false,message:'참가 정보를 확인하지 못했어요.'},503);}
}
