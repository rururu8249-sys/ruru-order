'use client';
import {useEffect,useRef,useState} from 'react';
import type {RpsState} from '@/lib/rps';
export function useRpsAudio(state:RpsState|null,publicOnly:boolean){
 const [sound,setSound]=useState(true);const unlocked=useRef(false);const players=useRef<HTMLAudioElement[]>([]);const previous=useRef('');const initialized=useRef(false);const announced=useRef(new Set<string>());
 useEffect(()=>{
 queueMicrotask(()=>{try{setSound(localStorage.getItem('ruru_rps_sound')!=='off');}catch{}});
 const start=new Audio('/sounds/rps/janken-soft.mp3'),win=new Audio('/sounds/rps/fanfare.mp3');start.volume=.65;win.volume=.35;players.current=[start,win];
 const unlock=()=>{if(unlocked.current)return;unlocked.current=true;for(const a of players.current){a.muted=true;void a.play().then(()=>{a.pause();a.currentTime=0;a.muted=false;}).catch(()=>{a.muted=false;});}};
 const hide=()=>{if(document.hidden)players.current.forEach(a=>a.pause());};
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);document.addEventListener('visibilitychange',hide);
 return()=>{document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',hide);players.current.forEach(a=>{a.pause();a.src='';});};
 },[]);
 useEffect(()=>{
 if(!state?.id)return;
 const key=`${state.id}:${state.round}:${state.status}`;
 if(key===previous.current)return;previous.current=key;
 const eventKey=`${state.id}:${state.round}:${state.status==='finished'?'winner':'start'}`;
 if(!initialized.current){initialized.current=true;announced.current.add(eventKey);return;}
 if(state.status!=='choosing'&&state.status!=='finished')return;
 if(announced.current.has(eventKey))return;announced.current.add(eventKey);
 if(state.serverTime&&Date.now()-Date.parse(state.serverTime)>2500)return;
 if(!sound||publicOnly||document.hidden||!unlocked.current)return;
 const audioIndex=state.status==='choosing'?0:state.status==='finished'&&state.winners.length?1:-1;
 const a=players.current.at(audioIndex); if(audioIndex<0)return;
 if(a){players.current.forEach(p=>p.pause());a.currentTime=0;void a.play().catch(()=>{});}
 },[state,sound,publicOnly]);
 const toggle=()=>setSound(value=>{const next=!value;try{localStorage.setItem('ruru_rps_sound',next?'on':'off');}catch{}if(!next)players.current.forEach(a=>a.pause());return next;});
 return{sound,toggle};
}
