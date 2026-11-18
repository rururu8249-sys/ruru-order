/** One room-level policy for TEST-chat spontaneity and contextual replies.
 * Never creates messages, touches payments, or impersonates an actual customer.
 */
export type RoomTurnRow={id:number; at:number; actorId?:string|null; kind:'ai'|'human'|'system'};
export type RoomTurnInput={now:number; mode:'live'|'paused'|'replay'; currentProductKey:string;
  replyToId:number; speakerId:string; previousProductKey?:string; room:RoomTurnRow[]};
export type RoomTurnDecision={ok:boolean; reason:string};
export function assessRoomTurn(x:RoomTurnInput):RoomTurnDecision {
  const reject=(reason:string)=>({ok:false,reason});
  const conversation=x.room.filter(m=>m.kind!=='system' && Number.isFinite(m.at)).sort((a,b)=>b.id-a.id);
  const latest=conversation[0];
  const aiStreak=conversation.findIndex(m=>m.kind==='human');
  const continuousAi=aiStreak===-1?conversation.length:aiStreak;
  const productChanged=Boolean(x.previousProductKey&&x.currentProductKey&&x.previousProductKey!==x.currentProductKey);
  if(x.replyToId>0){
    const target=conversation.find(m=>m.id===x.replyToId);
    if(!target||latest?.id!==target.id)return reject('stale-or-missing-reply');
    const age=x.now-target.at;
    if(age<8_000||age>150_000)return reject('reply-timing');
    if(target.kind==='ai'&&continuousAi>=3)return reject('stop-endless-ai-replies');
    // An actual customer may address a known TEST actor; matching target content
    // is checked by the director, not by repeating a canned acknowledgement.
    return {ok:true,reason:'context-reply'};
  }
  if(!x.currentProductKey&&!x.room.some(m=>m.kind==='human'&&x.now-m.at<180_000))return reject('no-product-or-human-context');
  if(latest?.kind==='human'&&x.now-latest.at<60_000)return reject('let-real-customer-conversation-breathe');
  if(latest?.kind==='ai'){
    const age=x.now-latest.at;
    if(continuousAi>=2&&!productChanged)return reject('two-unrelated-ai-turns-without-new-context');
    const gap=x.mode==='live'?150_000:360_000;
    if(age<gap&&!productChanged)return reject('independent-ai-too-close');
    if(productChanged&&age<45_000)return reject('new-product-but-still-too-fast');
  }
  return {ok:true,reason:productChanged?'new-product-context':'room-is-ready'};
}
