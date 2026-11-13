import {journeyDelayMs} from './liveAutomationTiming';
/** Server-owned scheduling: generate once, persist, then execute without re-rolling on retries. */
export type TempoMode='quiet'|'steady'|'busy'|'burst';
export const MAX_HOURLY_ORDERS=12;
export const MAX_PARALLEL_ORDERS=3;
const sample=(random:()=>number)=>Math.min(1-Number.EPSILON,Math.max(0,random()));
const between=(min:number,max:number,random:()=>number)=>min+Math.floor(sample(random)*(max-min+1));
export function planOrderTempo(now:number,previous:TempoMode|null,random=Math.random):{mode:TempoMode;nextAt:number;offsets:number[]} {
  const choice=sample(random);
  const mode:TempoMode=previous==='burst'?'quiet':choice<.25?'quiet':choice<.75?'steady':choice<.95?'busy':'burst';
  if(mode==='quiet')return {mode,nextAt:now+between(1200000,1800000,random),offsets:[0]};
  if(mode==='steady'){const nextAt=now+between(480000,900000,random),count=between(1,3,random);return {mode,nextAt,offsets:Array.from({length:count},(_,i)=>i*between(90000,180000,random))};}
  if(mode==='busy'){const nextAt=now+between(480000,900000,random),count=between(2,3,random);return {mode,nextAt,offsets:Array.from({length:count},(_,i)=>i*between(30000,90000,random))};}
  const nextAt=now+between(600000,1200000,random),count=between(3,5,random);return {mode,nextAt,offsets:Array.from({length:count},(_,i)=>i*between(30000,75000,random))};
}
export const cartDelay=(random=Math.random)=>journeyDelayMs('cart',random);
export function planOrderJourney(now:number,waveAt:number,offset:number,random=Math.random) {
  const cartAt=Math.max(now,waveAt-30000+offset);
  return {cartAt,submitAt:cartAt+cartDelay(random)};
}
export function interleaveOrderStages<T extends {plan:{stage?:unknown}}>(due:T[],random=Math.random):T[] {
  const carts=due.filter(a=>a.plan.stage!=='submit'),submits=due.filter(a=>a.plan.stage==='submit');
  const selected:T[]=[];let next=sample(random)<.5?carts:submits;
  // At most two of either stage per dispatch; let independent journeys overlap.
  const used=new Map<T[],number>();
  for(let i=0;i<3;i++){
    const other=next===carts?submits:carts;
    if(!next.length||(used.get(next)||0)>=2)next=other;
    if(!next.length||(used.get(next)||0)>=2)break;
    selected.push(next.shift()!);used.set(next,(used.get(next)||0)+1);
    next=next===carts?submits:carts;
  }
  return selected;
}
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

/** Same-person cooldown is independent of the room's busy/quiet tempo. */
export function repeatOrderDelay(random=Math.random):number {
 const r=sample(random);return Math.round((r<.8?8+r*24:30+(r-.8)*150)*60000);
}
