/** Continuous test automation intensity. All changes affect TEST actions only.
 * Existing low / normal / high settings remain usable until the new slider is saved.
 */
export const ORDER_RATE_KEY='live_automation_order_rate_pct';
export const CHAT_RATE_KEY='live_automation_chat_rate_pct';
export type LegacyRate='low'|'normal'|'high';
export function legacyPercent(v:unknown):number {
 const s=String(v??'').replace(/"/g,'').trim();
 return s==='low'?20:s==='high'?80:50;
}
export function ratePercent(v:unknown,legacy:unknown='normal'):number {
 if(v===null||v===undefined||String(v).trim()==='')return legacyPercent(legacy);
 const s=String(v).replace(/"/g,'').trim();
 if(!/^\d{1,3}$/.test(s))return legacyPercent(legacy);
 const n=Number(s);
 return Number.isSafeInteger(n)&&n>=0&&n<=100?n:legacyPercent(legacy);
}
export function percentValid(v:unknown):v is number {
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=100;
}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
function atPoints(pct:number,points:readonly {pct:number;min:number;max:number;chance:number}[]){
 const p=Math.max(0,Math.min(100,pct));
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(p<=b.pct){const t=(p-a.pct)/(b.pct-a.pct);return {
   gapMin:Math.round(lerp(a.min,b.min,t)),gapMax:Math.round(lerp(a.max,b.max,t)),chance:lerp(a.chance,b.chance,t)
  };}
 }
 const z=points[points.length-1];return {gapMin:z.min,gapMax:z.max,chance:z.chance};
}
/** 0%: no AI chat. 100%: maximum within independent DB limits. */
export function chatRateConfig(percent:number){
 if(percent<=0)return {gapMin:3600000,gapMax:3600000,chance:0};
 return atPoints(percent,[
  {pct:0,min:900000,max:1200000,chance:0},
  {pct:20,min:120000,max:240000,chance:.6},
  {pct:50,min:45000,max:90000,chance:.75},
  {pct:80,min:20000,max:40000,chance:.95},
  {pct:100,min:15000,max:30000,chance:.98}
 ]);
}
/** Deterministic admission: retries of one wave cannot reroll the percentage. */
export function admitTestOrderPercent(percent:number,waveId:string,offsetIndex:number):boolean {
 if(percent<=0)return false;
 if(percent>=100)return true;
 let h=2166136261>>>0;
 for(const ch of `${waveId}:${offsetIndex}`){h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;}
 return (h%10000)<percent*100;
}

/** Match the existing per-minute DB safety floor; off-air stays slower.
 * Slider intensity is an opportunity rate, never a promise to publish unsafe/repeated text. */
export function chatPhaseConfig(percent:number,mode:'live'|'paused'|'replay') {
 const base=chatRateConfig(percent),factor=mode==='live'?1:2.4;
 const gapMin=Math.max(mode==='live'?60_000:120_000,Math.round(base.gapMin*factor));
 return {...base,humanQuietMs:percent<=20?90_000:60_000,gapMin,gapMax:Math.max(gapMin,Math.round(base.gapMax*factor)),
  chance:mode==='live'?base.chance:Math.min(.65,base.chance*.65)};
}
