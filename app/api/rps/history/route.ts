import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {rpsAccess,uuid} from '@/lib/rpsServer';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
 if(!(await rpsAccess(req)).admin)return reply({ok:false},403);
 const sb=getServiceClient();const rooms=await sb.from('rps_rooms').select('id,title,status,revision,created_at,is_test,reward_kind,points,gift').order('created_at',{ascending:false}).limit(50);
 if(rooms.error)throw rooms.error;
 const id=req.nextUrl.searchParams.get('room');
 const winners=id&&uuid.test(id)?await sb.from('rps_players').select('id,nickname,winner_id,reward_status,reward_message').eq('room_id',id).eq('winner',true).order('joined_at'):null;
 if(winners?.error)throw winners.error;
 return reply({ok:true,rooms:rooms.data,winners:winners?.data||[]});
 }catch{return reply({ok:false,message:'당첨 이력을 불러오지 못했어요.'},503);}
}
