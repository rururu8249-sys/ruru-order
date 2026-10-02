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
export function legacySurvivalGapMs(a:number):number {return a>70?550:a>45?700:a>25?900:a>14?1150:a>7?1550:a>2?2050:2500;}
export function survivalGapMs(a:number):number {return a>70?1800:a>45?2000:a>25?2400:a>14?2800:a>7?3200:a>2?4000:5000;}
export function survivalPace(candidates:number,legacy=false){
 let left=candidates,sum=0;
 while(left>0){left-=survivalKillCount(left);sum+=(legacy?legacySurvivalGapMs:survivalGapMs)(left);}
 const startMs=legacy?900:6000,scale=legacy||!sum?1:Math.max(1,(30000-startMs)/sum);
 return {startMs,scale,durationMs:sum?Math.round(startMs+sum*scale):1};
}
export function raceWinnerGapMs(k:number):number {return Math.min(600,Math.min(2600,Math.max(900,k*450))/Math.max(1,k));}
export function calculateEventDurationMs(kind:EventKind,participants:string[],winners:string[],seed:number):number {
  if(kind==='roulette')return 9200;
  if(kind==='claw')return clawDurationMs(seed);
  if(participants.length<=winners.length)return 1;
  if(kind==='race')return 2800+8000+(winners.length-1)*raceWinnerGapMs(winners.length)+120+400;
  return survivalPace(participants.length-winners.length).durationMs;
}
export function makePlayback(input:PlaybackInput):Playback|null {
  if(!input.id?.trim()||!['spinning','result'].includes(input.status)||!input.startedAt||!Array.isArray(input.participants)||!input.participants.length||!input.winners.length)return null;
  if(input.winners.some(n=>!input.participants.includes(n)))return null;
  const startedAtMs=Date.parse(input.startedAt);
  if(!Number.isFinite(startedAtMs)||!Number.isFinite(input.durationMs)||Number(input.durationMs)<=0)return null;
  const key=JSON.stringify([input.kind,input.id,input.startedAt,1]);
  const seed=eventSeed(key),durationMs=calculateEventDurationMs(input.kind,input.participants,input.winners,seed);
  const legacyDuration=input.kind==='survival'?survivalPace(input.participants.length-input.winners.length,true).durationMs:null;
  if(input.durationMs!==durationMs&&input.durationMs!==legacyDuration)return null;
  return {version:1,key,kind:input.kind,seed,startedAtMs,durationMs:Number(input.durationMs)};
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
export function seededRandom(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function winnerIndices(participants:string[],winners:string[]):number[] {
  const used=new Set<number>();
  return winners.map(name=>{const id=participants.findIndex((p,i)=>p===name&&!used.has(i));if(id>=0)used.add(id);return id;}).filter(id=>id>=0);
}
