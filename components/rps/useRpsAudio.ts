'use client';
import {useEffect,useRef,useState} from 'react';
import type {RpsState} from '@/lib/rps';
export function useRpsAudio(state:RpsState|null,publicOnly:boolean,serverNow:number){
 const [sound,setSound]=useState(true),[ready,setReady]=useState(false),[visible,setVisible]=useState(true);
 const [voiceSeconds,setVoiceSeconds]=useState(1.45);
 const unlocking=useRef(false),players=useRef<HTMLAudioElement[]>([]),previous=useRef(''),announced=useRef(new Set<string>());
 useEffect(()=>{
 let disposed=false;
 queueMicrotask(()=>{try{setSound(localStorage.getItem('ruru_rps_sound')!=='off');}catch{}});
 const start=new Audio('/sounds/rps/janken-soft.mp3'),win=new Audio('/sounds/rps/fanfare.mp3');start.volume=.65;win.volume=.35;players.current=[start,win];
 const metadata=()=>{if(Number.isFinite(start.duration)&&start.duration>0)setVoiceSeconds(start.duration);};
 start.addEventListener('loadedmetadata',metadata);start.preload='auto';win.preload='auto';
 const unlock=()=>{
  if(unlocking.current)return;unlocking.current=true;
  void Promise.all(players.current.map(async a=>{a.muted=true;try{await a.play();a.pause();a.currentTime=0;}catch{}finally{a.muted=false;}})).then(()=>{if(!disposed)setReady(true);});
 };
 const visibility=()=>{setVisible(!document.hidden);if(document.hidden)players.current.forEach(a=>a.pause());};
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);document.addEventListener('visibilitychange',visibility);
 return()=>{disposed=true;unlocking.current=false;start.removeEventListener('loadedmetadata',metadata);document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',visibility);players.current.forEach(a=>{a.pause();a.src='';});};
 },[]);
 useEffect(()=>{
 const key=state?.id?`${state.id}:${state.round}:${state.status}`:'';
 const first=!previous.current,changed=key!==previous.current;previous.current=key;
 const allowed=sound&&!publicOnly&&visible&&!document.hidden&&ready;
 if(!allowed||state?.status!=='choosing')players.current[0]?.pause();
 if(!allowed)players.current[1]?.pause();
 if(!state?.id)return;
 if(state.status==='finished'){
  const eventKey=`${state.id}:${state.round}:winner`;
  if(first||!changed||announced.current.has(eventKey))return;
  announced.current.add(eventKey);
  if(!allowed||!state.winners.length||(state.serverTime&&Date.now()-Date.parse(state.serverTime)>2500))return;
  const win=players.current[1];if(win){win.currentTime=0;void win.play().catch(()=>{});}return;
 }
 if(!allowed||state.status!=='choosing'||!state.deadline)return;
 const deadline=Date.parse(state.deadline),eventKey=`${state.id}:${state.round}:start`;
 if(!Number.isFinite(deadline)||deadline<=serverNow||announced.current.has(eventKey))return;
 const scheduledAt=Date.now();
 const play=()=>{
  // Use the same server-adjusted clock as the visible countdown, including timer delays.
  const remaining=deadline-(serverNow+Date.now()-scheduledAt);
  if(remaining<=0||document.hidden||announced.current.has(eventKey))return;
  const start=players.current[0];if(!start)return;
  announced.current.add(eventKey);players.current[1]?.pause();
  // A late join starts at the matching position, so the voice still ends at the deadline.
  start.currentTime=Math.max(0,voiceSeconds-remaining/1000);
  void start.play().catch(()=>{announced.current.delete(eventKey);});
 };
 const delay=deadline-serverNow-voiceSeconds*1000;
 if(delay<=0){play();return;}
 const timer=setTimeout(play,delay);return()=>clearTimeout(timer);
 },[state,serverNow,sound,publicOnly,ready,visible,voiceSeconds]);
 const toggle=()=>setSound(value=>{const next=!value;try{localStorage.setItem('ruru_rps_sound',next?'on':'off');}catch{}if(!next)players.current.forEach(a=>a.pause());return next;});
 return{sound,toggle};
}
