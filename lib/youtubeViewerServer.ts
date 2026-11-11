import type {SupabaseClient} from '@supabase/supabase-js';
import {getAccessToken,readRefreshToken,readSetting} from '@/lib/youtube';
import {emptyYoutubeViewer,mergeYoutubeViewer,type YoutubeViewerState} from './youtubeViewer';

type ApiResult = {ok:boolean;status:number;json:Record<string, any>};
type Options = {now?:()=>number;request?:(path:string)=>Promise<ApiResult>};
const iso=(ms:number)=>new Date(ms).toISOString();
const MIN_POLL=20_000;
/** Called ONLY by the site-tab alert endpoint. No cron, order parsing or posting. */
export async function readYoutubeViewer(sb:SupabaseClient,bc:string,videoId:string,options:Options={}):Promise<YoutubeViewerState> {
 const now=options.now || Date.now;
 const table='chat_view_youtube_cache';
 let result=await sb.from(table).select('*').eq('broadcast_id',bc).maybeSingle();
 if(result.error)throw new Error('Chat cache unavailable');
 if(!result.data){
  const inserted=await sb.from(table).upsert({broadcast_id:bc},{onConflict:'broadcast_id',ignoreDuplicates:true});
  if(inserted.error)throw new Error('Chat cache unavailable');
  result=await sb.from(table).select('*').eq('broadcast_id',bc).maybeSingle();
 }
 const row=result.data;
 if(result.error||!row)throw new Error('Chat cache unavailable');
 const sameVideo=row.state?.videoId===videoId && Array.isArray(row.state?.messages);
 const state:YoutubeViewerState=sameVideo?row.state:emptyYoutubeViewer(videoId);
 if(Date.parse(row.lease_until)>now() || (sameVideo && Date.parse(row.next_poll_at)>now()))return state;
 const version=Number(row.version)+1;
 const claim=await sb.from(table).update({version,lease_until:iso(now()+45_000)})
  .eq('broadcast_id',bc).eq('version',row.version).lte('lease_until',iso(now())).select('version');
 if(claim.error)throw new Error('Chat cache unavailable');
 if(!claim.data?.length)return state; // Another viewer already claimed this read.
 let next={...state}; let delay=MIN_POLL;
 try{
  let token='';
  const request=options.request || (async(path:string):Promise<ApiResult>=>{
   if(!token){const refresh=await readRefreshToken(sb);if(!refresh)throw new Error('Disconnected');token=await getAccessToken(refresh);}
   const response=await fetch('https://www.googleapis.com/youtube/v3/'+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12_000),cache:'no-store'});
   return {ok:response.ok,status:response.status,json:await response.json()};
  });
  const checked=async(path:string)=>{
   const response=await request(path);
   if(!response.ok){
    const reason=String(response.json?.error?.errors?.[0]?.reason||'');
    if(/quota|dailyLimit/i.test(reason))delay=15*60_000;
    else if(response.status===401||response.status===403)delay=5*60_000;
    else delay=60_000;
    if(/liveChatEnded|liveChatNotFound|liveChatDisabled/.test(reason)){next={...next,status:'offline',chatId:'',pageToken:''};delay=60_000;}
    throw new Error('YouTube read failed');
   }
   return response.json;
  };
  if(!next.chatId){
   const video=await checked('videos?part=liveStreamingDetails&id='+encodeURIComponent(videoId));
   next.chatId=String(video?.items?.[0]?.liveStreamingDetails?.activeLiveChatId||'');
   next.pageToken='';
  }
  if(!next.chatId){next.status='offline';delay=60_000;}
  else{
   const params=new URLSearchParams({part:'snippet,authorDetails',liveChatId:next.chatId,maxResults:'200'});
   if(next.pageToken)params.set('pageToken',next.pageToken);
   const data=await checked('liveChat/messages?'+params);
   const botChannel=await readSetting(sb,'chat_order_bot_channel_id');
   next=mergeYoutubeViewer(next,Array.isArray(data.items)?data.items:[],bc,botChannel);
   next.pageToken=String(data.nextPageToken||'');
   delay=Math.max(MIN_POLL,Number(data.pollingIntervalMillis)||MIN_POLL);
   if(data.offlineAt){next.status='offline';next.chatId='';next.pageToken='';delay=60_000;}
  }
 }catch{
  if(next.status!=='offline')next.status='unavailable';
  delay=Math.max(delay,60_000);
 }
 const saved=await sb.from(table).update({state:next,lease_until:iso(0),next_poll_at:iso(now()+delay),updated_at:iso(now())}).eq('broadcast_id',bc).eq('version',version).select('version');
 if(saved.error||!saved.data?.length)throw new Error('Chat cache save unavailable');
 return next;
}
