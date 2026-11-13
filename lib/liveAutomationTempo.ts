/** Server-owned scheduling: generate once, persist, then execute without re-rolling on retries. */
export type TempoMode='quiet'|'steady'|'busy'|'burst';
export const MAX_HOURLY_ORDERS=120;
export const MAX_PARALLEL_ORDERS=3;
const sample=(random:()=>number)=>Math.min(1-Number.EPSILON,Math.max(0,random()));
const between=(min:number,max:number,random:()=>number)=>min+Math.floor(sample(random)*(max-min+1));
export function planOrderTempo(now:number,previous:TempoMode|null,random=Math.random):{mode:TempoMode;nextAt:number;offsets:number[]} {
  const choice=sample(random);
  const mode:TempoMode=previous==='burst'?(choice<.25?'quiet':'steady'):choice<.2?'quiet':choice<.65?'steady':choice<.9?'busy':'burst';
  if(mode==='quiet')return {mode,nextAt:now+between(180000,480000,random),offsets:[0]};
  if(mode==='steady')return {mode,nextAt:now+between(35000,100000,random),offsets:Array.from({length:between(1,2,random)},()=>between(0,45000,random)).sort((a,b)=>a-b)};
  if(mode==='busy')return {mode,nextAt:now+between(25000,65000,random),offsets:Array.from({length:between(2,3,random)},()=>between(0,60000,random)).sort((a,b)=>a-b)};
  const nextAt=now+between(15000,35000,random),count=between(4,8,random);
  return {mode,nextAt,offsets:Array.from({length:count},()=>between(0,90000,random)).sort((a,b)=>a-b)};
}
export const cartDelay=(random=Math.random)=>between(15000,150000,random);
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
