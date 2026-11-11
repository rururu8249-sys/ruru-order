import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {youtubeVideoIdFromUrl} from '@/lib/liveWatch';
import {readYoutubeViewer} from '@/lib/youtubeViewerServer';
import {publicYoutubeViewer} from '@/lib/youtubeViewer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
export async function GET(request:NextRequest){
 const bc=request.nextUrl.searchParams.get('bc')||'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bc))return NextResponse.json({ok:false},{status:400});
 try{
  const sb=getServiceClient();
  const {data,error}=await sb.from('broadcasts').select('id,status,is_deleted,youtube_live_url').eq('id',bc).maybeSingle();
  if(error)throw error;
  if(!data || data.status!=='ON'||data.is_deleted)return NextResponse.json({ok:false,status:'offline'},{status:404});
  const videoId=youtubeVideoIdFromUrl(data.youtube_live_url);
  if(!videoId)return NextResponse.json({ok:false,status:'offline'},{status:404});
  const state=await readYoutubeViewer(sb,bc,videoId);
  return NextResponse.json(publicYoutubeViewer(state),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({ok:false,status:'unavailable'},{status:503});}
}
