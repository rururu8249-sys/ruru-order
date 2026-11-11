'use client';
import {useEffect,useReducer,useState} from 'react';
import {createChatViewUnread,reduceChatViewUnread} from './chatViewUnread';
import {includeChatViewMessage} from './chatViewFilter';
import type {YoutubeViewerResponse} from './youtubeViewer';

/** No request while YouTube is selected, hidden, unmounted or without a video. */
export function useYoutubeChatNotice(bc:string,videoId:string,active:boolean){
 const scope=`${bc}:${videoId}`;
 const [unread,dispatch]=useReducer(reduceChatViewUnread,scope,createChatViewUnread);
 const [status,setStatus]=useState('idle');
 useEffect(()=>{
  dispatch({type:'reset',bc:scope});
  if(!active||!bc||!videoId)return;
  let alive=true,timer:number|undefined,controller:AbortController|null=null;
  const stop=()=>{if(timer!==undefined)window.clearTimeout(timer);timer=undefined;controller?.abort();controller=null;};
  const load=async()=>{
   if(!alive||document.visibilityState!=='visible'||controller)return;
   const request=new AbortController();controller=request;
   let delay=20000;
   try{
    const response=await fetch(`/api/chat-view/youtube?bc=${encodeURIComponent(bc)}`,{cache:'no-store',signal:request.signal});
    const data=await response.json() as YoutubeViewerResponse;
    if(!alive||request.signal.aborted||document.visibilityState!=='visible')return;
    if(!response.ok||!data.ok){setStatus('unavailable');delay=60000;return;}
    if(data.videoId!==videoId)return;
    setStatus(data.status);
    if(data.initialized){
     // Preserve hidden tombstones so moderation also removes unread previews.
     const messages=(data.messages||[]).filter(m=>m.broadcastId===bc && (m.hidden||includeChatViewMessage(m))).map(m=>({...m,broadcastId:scope}));
     dispatch({type:'snapshot',bc:scope,messages});
    }
    delay=data.status==='live'?Math.max(20000,data.pollAfterMs||20000):60000;
   }catch{if(alive&&!request.signal.aborted){setStatus('unavailable');delay=60000;}}
   finally{
    if(controller===request)controller=null;
    if(alive&&!request.signal.aborted&&document.visibilityState==='visible')timer=window.setTimeout(()=>void load(),delay);
   }
  };
  const visibility=()=>{if(document.visibilityState==='visible')void load();else stop();};
  document.addEventListener('visibilitychange',visibility);
  void load();
  return()=>{alive=false;stop();document.removeEventListener('visibilitychange',visibility);};
 },[active,bc,videoId,scope]);
 return {messages:active&&unread.bc===scope?[...unread.unread.values()]:[],status:active?status:'idle'};
}
