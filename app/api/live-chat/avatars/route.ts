import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {chatIdentityFromRequest,sameChatOrigin} from '@/lib/liveChatSession';
const UUID=/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest){
 const bc=request.nextUrl.searchParams.get('bc')||'';if(!UUID.test(bc))return json({ok:false},400);
 const {data,error}=await getServiceClient().from('live_chat_public_profiles').select('id,avatar_id').eq('broadcast_id',bc).limit(10000);
 return error?json({ok:false},503):json({ok:true,profiles:Object.fromEntries((data||[]).map(p=>[p.id,p.avatar_id]))});
}
export async function POST(request:NextRequest){
 if(!sameChatOrigin(request))return json({ok:false},403);
 const identity=chatIdentityFromRequest(request);if(!identity)return json({ok:false},401);
 const raw=await request.json().catch(()=>({}));if(!UUID.test(String(raw.bc||''))||!UUID.test(String(raw.entry||'')))return json({ok:false},400);
 const {data,error}=await getServiceClient().rpc('live_chat_rotate_avatar',{p_broadcast:raw.bc,p_identity:identity.sub,p_entry:raw.entry});
 return error?json({ok:false},409):json({ok:true,profile:data});
}
