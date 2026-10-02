import {clawDurationMs} from './eventClawScene';

export type EventKind = 'survival' | 'race' | 'roulette' | 'claw';
export type Playback = {version:1;key:string;kind:EventKind;seed:number;startedAtMs:number;durationMs:number};
export type PlaybackPhase = {phase:'waiting'|'running'|'done';elapsedMs:number};
export type PlaybackInput = {id:string;kind:EventKind;status:string;startedAt:string|null;durationMs:number|null;participants:string[];winners:string[]};
export function eventSeed(key:string):number {
  let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return hash>>>0;
}
export function survivalKillCount(a:number):number {return Math.min(a,a>70?9:a>45?7:a>25?5:a>14?3:a>7?2:1);}
export function survivalGapMs(a:number):number {return a>70?550:a>45?700:a>25?900:a>14?1150:a>7?1550:a>2?2050:2500;}
export function raceWinnerGapMs(k:number):number {return Math.min(600,Math.min(2600,Math.max(900,k*450))/Math.max(1,k));}
export function calculateEventDurationMs(kind:EventKind,participants:string[],winners:string[],seed:number):number {
  if(kind==='roulette')return 9200;
  if(kind==='claw')return clawDurationMs(seed);
  if(participants.length<=winners.length)return 1;
  if(kind==='race')return 2800+8000+(winners.length-1)*raceWinnerGapMs(winners.length)+120+400;
  let candidates=participants.length-winners.length,time=900;
  while(candidates>0){candidates-=survivalKillCount(candidates);time+=survivalGapMs(candidates);}
  return time;
}
export function makePlayback(input:PlaybackInput):Playback|null {
  if(!input.id?.trim()||!['spinning','result'].includes(input.status)||!input.startedAt||!Array.isArray(input.participants)||!input.participants.length||!input.winners.length)return null;
  if(input.winners.some(n=>!input.participants.includes(n)))return null;
  const startedAtMs=Date.parse(input.startedAt);
  if(!Number.isFinite(startedAtMs)||!Number.isFinite(input.durationMs)||Number(input.durationMs)<=0)return null;
  const key=JSON.stringify([input.kind,input.id,input.startedAt,1]);
  const seed=eventSeed(key),durationMs=calculateEventDurationMs(input.kind,input.participants,input.winners,seed);
  if(input.durationMs!==durationMs)return null; // old/unversioned schedules: static result only
  return {version:1,key,kind:input.kind,seed,startedAtMs,durationMs};
}
export function samplePlayback(playback:Playback,serverNowMs:number):PlaybackPhase {
  const elapsedMs=Math.max(0,Math.min(playback.durationMs,serverNowMs-playback.startedAtMs));
  return {phase:serverNowMs<playback.startedAtMs?'waiting':elapsedMs>=playback.durationMs?'done':'running',elapsedMs};
}
export type ServerAnchor = {serverMs:number;monoMs:number;uncertaintyMs:number};
export function estimateServerAnchor(serverNowMs:number,sentMonoMs:number,receivedMonoMs:number):ServerAnchor {
  const half=Math.max(0,receivedMonoMs-sentMonoMs)/2;
  return {serverMs:serverNowMs+half,monoMs:receivedMonoMs,uncertaintyMs:half};
}
export function readServerTime(anchor:ServerAnchor,monoMs:number):number {return anchor.serverMs+Math.max(0,monoMs-anchor.monoMs);}
