'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {chatIdentityHeaders,verifyChatAccount} from '@/lib/useLiveChatPrivate';
import type {RpsPlayer,RpsRewardRow,RpsState} from '@/lib/rps';
export function useRpsGame(publicOnly=false){
 const [state,setState]=useState<RpsState|null>(null);const [player,setPlayer]=useState<RpsPlayer|null>(null);
 const [admin,setAdmin]=useState(false);const [verified,setVerified]=useState(false);const [winners,setWinners]=useState<RpsRewardRow[]>([]);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [now,setNow]=useState(()=>Date.now());
 const offset=useRef(0),room=useRef<string|undefined>(undefined),loading=useRef(false),mounted=useRef(true),lastSuccess=useRef(0),privateRequest=useRef(0),phase=useRef(''),latest=useRef<RpsState|null>(null);
 const accept=useCallback((next:RpsState)=>{
 const prev=latest.current;
 if(prev?.id&&prev.id===next.id&&prev.revision>next.revision)return;
 if(prev?.serverTime&&next.serverTime&&Date.parse(prev.serverTime)>Date.parse(next.serverTime))return;
 latest.current=next;room.current=next.id;phase.current=`${next.id}:${next.revision}:${next.status}`;setState(next);
 },[]);
 const loadPublic=useCallback(async()=>{
 if(loading.current||document.hidden)return;loading.current=true;
 try{const start=Date.now();const response=await fetch('/api/rps/state');const data=await response.json();if(!data.ok)throw Error();
 if(mounted.current){offset.current=Date.parse(data.serverTime)+(Number(response.headers.get('age'))||0)*1000-(start+Date.now())/2;accept(data.state);lastSuccess.current=Date.now();}}
 catch{if(mounted.current&&lastSuccess.current&&Date.now()-lastSuccess.current>20000)setError('게임 연결이 잠시 끊겼어요. 다시 연결 중입니다.');}
 finally{loading.current=false;}
 },[accept]);
 const loadMe=useCallback(async()=>{
 if(publicOnly)return;
 try{const requestId=++privateRequest.current;const requestedPhase=phase.current;const headers=chatIdentityHeaders();const requestedRoom=room.current;const response=await fetch(`/api/rps/me${requestedRoom?'?room='+encodeURIComponent(requestedRoom):''}`,{headers,cache:'no-store'});const data=await response.json();
 if(data.ok&&mounted.current&&room.current===requestedRoom&&requestId===privateRequest.current&&phase.current===requestedPhase&&JSON.stringify(headers)===JSON.stringify(chatIdentityHeaders())){setAdmin(data.admin);setVerified(data.verified);setPlayer(data.player);setWinners(data.winners);if(data.state)accept(data.state);}}
 catch{/* Preserve prior state during reconnection. */}
 },[publicOnly,accept]);
 useEffect(()=>{
 mounted.current=true;queueMicrotask(()=>{void loadPublic();void loadMe();});
 const channel=supabase.channel('ruru-rps').on('broadcast',{event:'changed'},()=>{void loadPublic();}).subscribe(status=>{if(status==='SUBSCRIBED')void loadPublic();});
 const fallback=setInterval(()=>{if(!document.hidden){void loadPublic();void loadMe();}},10000);
 const clock=setInterval(()=>setNow(Date.now()+offset.current),200);
 const resume=()=>{if(!document.hidden){void loadPublic();void loadMe();}};
 window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
 return()=>{mounted.current=false;clearInterval(fallback);clearInterval(clock);void supabase.removeChannel(channel);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[loadMe,loadPublic]);
 useEffect(()=>{queueMicrotask(()=>void loadMe());},[state?.id,state?.revision,state?.status,loadMe]);
 // Recover quickly from a missed broadcast at a deadline without continuous polling.
 const second=Math.floor(now/1000);
 useEffect(()=>{if(state?.deadline&&second*1000>=Date.parse(state.deadline)){const timer=setTimeout(()=>void loadPublic(),150+Math.random()*500);return()=>clearTimeout(timer);}},[state?.deadline,second,loadPublic]);
 const action=useCallback(async(name:string,data:Record<string,unknown>={})=>{
 if(busy)return false;setBusy(true);setError('');
 try{const response=await fetch('/api/rps/action',{method:'POST',headers:{'Content-Type':'application/json',...chatIdentityHeaders()},body:JSON.stringify({action:name,revision:data._expectedRevision??state?.revision??0,room:state?.id,round:state?.round,hand:data.hand,data})});const result=await response.json();
 if(!result.ok){setError(result.message||'다시 시도해 주세요.');if(result.verify)setVerified(false);return false;}
 if(result.result?.status)accept(result.result);
 await loadMe();await loadPublic();return true;
 }catch{setError('전송 결과를 확인하지 못했어요. 다시 연결해 확인해 주세요.');return false;}
 finally{setBusy(false);void loadMe();}
 },[state,busy,accept,loadMe,loadPublic]);
 return {state,player,admin,verified,winners,error,busy,now,action,verify:verifyChatAccount,refresh:loadMe};
}
export type RpsController=ReturnType<typeof useRpsGame>;
