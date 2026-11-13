'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {chatIdentityHeaders} from '@/lib/useLiveChatPrivate';
import type {ManualActor,ManualChatSelection} from '@/lib/liveAutomationManualChat';
type Lease={token:string;actor_id:string;expires_at:string};
type Selection={actor:ManualActor;lease:Lease};
type SendResult={ok:boolean;message?:string};
const endpoint='/api/live-chat/automation-persona';
export function useManualAutomationChat(broadcastId:string,enabled:boolean) {
 const [available,setAvailable]=useState(false),[actors,setActors]=useState<ManualActor[]>([]),[selected,setSelected]=useState<ManualActor|null>(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false);
 const [recent,setRecent]=useState<string[]>([]);
 const current=useRef<Selection|null>(null),client=useRef(''),access=useRef(false),serial=useRef(0),generation=useRef(0),mounted=useRef(false),locked=useRef(false);
 const readyRef=useRef(false),openRef=useRef(false),lastRenew=useRef(0),retry=useRef<{actor:string;body:string;id:string}|null>(null);
 const lastVerified=useRef(0);
 openRef.current=open;
 const allow=useCallback((value:boolean)=>{readyRef.current=value;setReady(value)},[]);
 const post=useCallback(async(body:Record<string,unknown>,keepalive=false)=>{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...chatIdentityHeaders()},body:JSON.stringify({...body,clientId:client.current}),keepalive});
   const data=await response.json();
   if(!response.ok||!data.ok) throw Error(data.message||'사용 상태를 확인하지 못했어요.');
   return data;
 },[]);
 const refresh=useCallback(async()=>{
   if(!enabled||!broadcastId||document.hidden||!mounted.current)return false;
   const stamp=++serial.current,epoch=generation.current;
   try {
     const response=await fetch(endpoint+'?'+new URLSearchParams({bc:broadcastId,client:client.current}),{headers:chatIdentityHeaders(),cache:'no-store'});
     const data=await response.json();
     if(!mounted.current||epoch!==generation.current||stamp!==serial.current)return false;
     if(response.status===403){access.current=false;setAvailable(false);allow(false);setActors([]);return false}
     if(!response.ok||!data.ok)throw Error(data.message||'연결을 확인해 주세요.');
     access.current=true;lastVerified.current=Date.now();setAvailable(true);setActors(data.actors||[]);
     if(current.current) {
       const found=(data.actors as ManualActor[]).find(a=>a.id===current.current?.actor.id);
       const valid=!!found?.mine&&Date.parse(current.current.lease.expires_at)>Date.now();
       allow(valid);
       if(!valid)setMessage('사용권이 끝났어요. 닉네임을 다시 선택해 주세요.');
     } else allow(true);
     return true;
   } catch {
     if(mounted.current&&epoch===generation.current&&stamp===serial.current){lastVerified.current=0;allow(false);setMessage('연결 확인 중이에요. 확인 후 보낼 수 있어요.');}
     return false;
   }
 },[allow,broadcastId,enabled]);
 const choose=useCallback(async(id:string)=>{
   if(locked.current)return;
   const actor=actors.find(x=>x.id===id);
   if(!actor||actor.inUse&&!actor.mine)return;
   if(Date.now()-lastVerified.current>6000 && !await refresh())return;
   locked.current=true;setBusy(true);++serial.current;
   const epoch=generation.current;
   try{
     const data=await post({action:'select',bc:broadcastId,actorId:id});
     if(!mounted.current||epoch!==generation.current){void post({action:'release',token:data.lease.token},true).catch(()=>{});return;}
     current.current={actor,lease:data.lease};setSelected(actor);allow(true);lastRenew.current=Date.now();
     setRecent(prev=>[id,...prev.filter(x=>x!==id)].slice(0,3));setMessage('');setOpen(false);
     await refresh();
   }catch(error){if(mounted.current&&epoch===generation.current){setMessage(error instanceof Error?error.message:'선택하지 못했어요.');await refresh();}}
   finally{locked.current=false;if(mounted.current&&epoch===generation.current)setBusy(false);}
 },[actors,allow,broadcastId,post,refresh]);
 const reset=useCallback(async()=>{
   if(locked.current)return;
   locked.current=true;setBusy(true);++serial.current;
   const held=current.current,epoch=generation.current;
   try{if(held)await post({action:'release',token:held.lease.token});}
   catch{if(mounted.current)setMessage('반납 연결이 지연돼요. 사용권은 자동으로 만료돼요.');}
   finally{
     if(mounted.current&&epoch===generation.current){current.current=null;setSelected(null);retry.current=null;setOpen(false);allow(true);setBusy(false);}
     locked.current=false;
   }
 },[allow,post]);
 const send=useCallback(async(body:string,sender:(body:string,selection:ManualChatSelection)=>Promise<SendResult>):Promise<SendResult>=>{
   const held=current.current;
   if(!held||!readyRef.current||locked.current||Date.parse(held.lease.expires_at)<=Date.now())return {ok:false,message:'닉네임 사용 상태를 확인해 주세요.'};
   locked.current=true;setBusy(true);const epoch=generation.current;
   const previous=retry.current;
   const requestId=previous?.actor===held.actor.id&&previous.body===body?previous.id:crypto.randomUUID();
   retry.current={actor:held.actor.id,body,id:requestId};
   try {
     const result=await sender(body,{token:held.lease.token,clientId:client.current,requestId,nickname:held.actor.nickname});
     if(epoch===generation.current&&result.ok)retry.current=null;
     return result;
   } catch {return {ok:false,message:'전송 결과를 확인하지 못했어요. 같은 글로 다시 눌러 주세요.'};}
   finally{locked.current=false;if(mounted.current&&epoch===generation.current)setBusy(false);}
 },[]);
 useEffect(()=>{
   if(!enabled||!broadcastId)return;
   mounted.current=true;client.current=crypto.randomUUID();++generation.current;
   current.current=null;retry.current=null;access.current=false;allow(false);setSelected(null);setAvailable(false);setActors([]);setOpen(false);setRecent([]);
   const release=()=>{const held=current.current;if(held)void post({action:'release',token:held.lease.token},true).catch(()=>{});};
   const clear=()=>{release();++generation.current;++serial.current;current.current=null;retry.current=null;access.current=false;setSelected(null);setActors([]);setAvailable(false);allow(false);};
   const visibility=()=>{if(document.hidden){++serial.current;allow(false);}else void refresh()};
   const offline=()=>{++serial.current;allow(false);setMessage('연결이 끊겼어요. 연결 확인 후 보낼 수 있어요.');};
   const identity=()=>{clear();void refresh()};
   const verified=(event:MessageEvent)=>{if(event.origin===location.origin&&event.data?.type==='ruru-chat-verified')identity();};
   void refresh();
   const timer=setInterval(()=>{
     if(document.hidden||!access.current)return;
     if(openRef.current||current.current)void refresh();
     const held=current.current;
     if(!held||locked.current||Date.now()-lastRenew.current<30000)return;
     lastRenew.current=Date.now();const epoch=generation.current;
     void post({action:'renew',token:held.lease.token}).then(data=>{
       if(mounted.current&&epoch===generation.current&&current.current?.lease.token===held.lease.token){current.current.lease=data.lease;allow(true);}
     }).catch(()=>{if(mounted.current&&epoch===generation.current){allow(false);setMessage('사용권을 확인하지 못했어요. 다시 선택해 주세요.');}});
   },3000);
   document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',offline);window.addEventListener('online',visibility);
   window.addEventListener('pagehide',release);window.addEventListener('ruru-chat-logout',clear);window.addEventListener('storage',identity);window.addEventListener('message',verified);
   return ()=>{
     release();mounted.current=false;++generation.current;++serial.current;clearInterval(timer);
     document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',offline);window.removeEventListener('online',visibility);
     window.removeEventListener('pagehide',release);window.removeEventListener('ruru-chat-logout',clear);window.removeEventListener('storage',identity);window.removeEventListener('message',verified);
   };
 },[allow,broadcastId,enabled,post,refresh]);
 useEffect(()=>{
   if(!available||!enabled||!broadcastId)return;
   const channel=supabase.channel('live-automation:'+broadcastId).on('broadcast',{event:'changed'},()=>{if(access.current)void refresh()}).subscribe();
   return ()=>{void supabase.removeChannel(channel)};
 },[available,broadcastId,enabled,refresh]);
 return {available,actors,selected,ready,busy,message,open,setOpen,recent,choose,reset,send,refresh};
}
export type ManualAutomationChat=ReturnType<typeof useManualAutomationChat>;

