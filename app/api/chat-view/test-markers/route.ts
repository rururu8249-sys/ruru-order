import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Chat-view is a public OBSERVER. Only return numeric message IDs, never account IDs.
// Covers AI actors and operator/manual test messages carrying the autotest avatar marker.
export async function GET(request:NextRequest){
  const bc=request.nextUrl.searchParams.get('bc')||'';
  if(!UUID.test(bc)) return NextResponse.json({ok:false,ids:[]},{status:400});
  try{
    const db=getServiceClient();
    const result=await db.from('live_chat_messages')
      .select('id,automation_actor_id,avatar_url')
      .eq('broadcast_id',bc).is('hidden_at',null)
      .order('id',{ascending:false}).limit(200);
    if(result.error)throw result.error;
    const ids=(result.data||[]).filter(x=>x.automation_actor_id!=null||x.avatar_url==='autotest')
      .map(x=>Number(x.id)).filter(x=>Number.isSafeInteger(x)&&x>0);
    return NextResponse.json({ok:true,ids},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({ok:false,ids:[]},{status:503,headers:{'Cache-Control':'no-store'}});}
}
