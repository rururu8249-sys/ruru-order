import {chatPhaseConfig} from './liveAutomationRate';
/** Diagnostics and conservative focused recovery for a verified product card.
 * No fixed chat lines, fabricated orders, or direct customer content in logs.
 */
export type DirectorChoice = {speaker:string;text:string;replyTo:number;reason:string};
export function parseDirectorChoice(raw:string|null, allowed:string[]):DirectorChoice {
  const blank=(reason:string):DirectorChoice=>({speaker:'',text:'',replyTo:0,reason});
  if(!raw||!raw.trim())return blank('empty-response');
  let obj:unknown;
  try {
    const source=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    obj=JSON.parse(source);
  }catch{return blank('invalid-json');}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return blank('invalid-object');
  const v=obj as Record<string,unknown>;
  const speaker=typeof v.speaker==='string'?v.speaker.trim():'';
  if(!speaker)return blank('model-chose-silence');
  if(!allowed.includes(speaker))return blank('unknown-speaker');
  const body=typeof v.text==='string'?v.text.trim():'';
  if(!body||body.length>100)return blank('invalid-text');
  const id=Number(v.replyTo)||0;
  return {speaker,text:body,replyTo:Number.isSafeInteger(id)&&id>0?id:0,reason:'ok'};
}

/** A chat turn may be labelled 'reply' only when the model names a real,
 * recent target message ID. Never bind an unsolicited product question to the
 * latest customer message just because both exist in the room. */
export function resolveExplicitReplyTarget<T extends Record<string, unknown>>(
  replyTo:number, messages:T[], now:number,
):T|null {
  if(!Number.isSafeInteger(replyTo)||replyTo<=0)return null;
  return messages.find(m=>{
    const age=now-Date.parse(String(m.created_at||''));
    return Number(m.id)===replyTo&&m.badge!=='bot'&&Number.isFinite(age)&&age>=0&&age<150_000;
  })||null;
}

export function shouldTryFocusedProductTurn(q:{
  now:number;mode:'live'|'paused'|'replay';hasProduct:boolean;hasPendingHuman:boolean;
  lastHumanAt:number;lastAiAt:number;lastFocusAt:number;chatRate?:number;
}):boolean {
  if(!q.hasProduct||q.hasPendingHuman)return false;
  if(q.lastHumanAt>0&&q.now-q.lastHumanAt<3*60_000)return false;
  if(q.chatRate===0)return false;
  const aiGap=q.chatRate===undefined?(q.mode==='live'?7*60_000:12*60_000):Math.max(120_000,chatPhaseConfig(q.chatRate,q.mode).gapMax);
  if(q.lastAiAt>0&&q.now-q.lastAiAt<aiGap)return false;
  // Persisted in director logs before the model retry: no repeated retry per polling tick.
  const focusGap=aiGap;
  if(q.lastFocusAt>0&&q.now-q.lastFocusAt<focusGap)return false;
  return true;
}

/** Fail closed when a referenced card has been removed/hidden/pinned away.
 * A five-second automatic rotation itself is NOT a reason to discard an
 * otherwise verified card-grounded turn. The director reads fresh widget state.
 */
export function cardRemainsInRotation(
  card: {productId:string;detailName?:string|null}|null,
  state: {enabled:boolean;siteCardOff:boolean;targets:Array<{productId:string;detailName?:string|null}>}|null,
):boolean {
  if(!card||!state?.enabled||state.siteCardOff||!Array.isArray(state.targets))return false;
  return state.targets.some(t=>String(t.productId)===String(card.productId)&&
    String(t.detailName||'')===String(card.detailName||''));
}
