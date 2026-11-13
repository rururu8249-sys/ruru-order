/** Server-owned scheduling: generate once, persist, then execute without re-rolling on retries. */
export type TempoMode='quiet'|'steady'|'burst';
export const MAX_HOURLY_ORDERS=20;
export const MAX_PARALLEL_ORDERS=3;
const sample=(random:()=>number)=>Math.min(1-Number.EPSILON,Math.max(0,random()));
const between=(min:number,max:number,random:()=>number)=>min+Math.floor(sample(random)*(max-min+1));
export function planOrderTempo(now:number,previous:TempoMode|null,random=Math.random):{mode:TempoMode;nextAt:number;offsets:number[]} {
  const choice=sample(random);
  const mode:TempoMode=previous==='burst'||choice<.35?'quiet':choice<.85?'steady':'burst';
  if(mode==='quiet')return {mode,nextAt:now+between(480000,1200000,random),offsets:[0]};
  if(mode==='steady')return {mode,nextAt:now+between(60000,360000,random),offsets:[0]};
  const nextAt=now+between(15000,45000,random),count=between(2,3,random);
  return {mode,nextAt,offsets:Array.from({length:count},()=>between(0,45000,random)).sort((a,b)=>a-b)};
}
export const cartDelay=(random=Math.random)=>between(15000,150000,random);
export const actorQuietDelay=(random=Math.random)=>between(300000,900000,random);
export function nextAdmission(now:number,successfulAt:readonly number[],limit=MAX_HOURLY_ORDERS):number {
  const recent=successfulAt.filter(t=>Number.isFinite(t)&&t>now-3600000&&t<=now).sort((a,b)=>a-b);
  return recent.length<limit?now:recent[recent.length-limit]+3600000;
}
export type SpeechEvent={at:number;kind:'proactive'|'reply'};
export function maySpeak(input:{kind:SpeechEvent['kind'];now:number;hasActivity:boolean;manualUntil:number;quietUntil:number;actorLast:number|null;recent:readonly SpeechEvent[]}):boolean {
  const {now,kind}=input;
  if(!input.hasActivity||input.manualUntil>now||input.quietUntil>now)return false;
  const recent=input.recent.filter(e=>e.at<=now&&e.at>now-3600000);
  if(recent.filter(e=>e.at>now-60000).length>=2)return false;
  if(kind==='reply')return true;
  return !(input.actorLast!==null&&input.actorLast>now-300000) &&
    recent.filter(e=>e.kind==='proactive').length<6 &&
    !recent.some(e=>e.kind==='proactive'&&e.at>now-60000);
}
