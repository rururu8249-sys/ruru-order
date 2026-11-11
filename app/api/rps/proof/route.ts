import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {uuid} from '@/lib/rpsServer';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const room=req.nextUrl.searchParams.get('room')||'';
 if(!uuid.test(room))return NextResponse.json({ok:false},{status:400});
 const {data,error}=await getServiceClient().from('rps_rounds').select('round,commitment,host_hand,salt,opened_at,revealed_at').eq('room_id',room).not('revealed_at','is',null).order('round').limit(1000);
 return NextResponse.json(error?{ok:false}:{ok:true,room,algorithm:'SHA-256',input:'room:round:host_hand:salt',rounds:data},{status:error?503:200,headers:{'Cache-Control':'public, max-age=2'}});
}
