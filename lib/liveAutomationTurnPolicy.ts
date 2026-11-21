/** One room-level policy for TEST-chat spontaneity and contextual replies.
 * Independent chat never receives a free pass merely because the public
 * carousel advanced to its next product every five seconds.
 * Pure policy only; does not create messages or modify orders/payments.
 */
export type RoomTurnRow={id:number; at:number; actorId?:string|null;
  kind:'ai'|'human'|'system'; responseToId?:number|null; asksQuestion?:boolean};
export type RoomTurnInput={now:number; mode:'live'|'paused'|'replay'; currentProductKey:string;
  replyToId:number; speakerId:string; previousProductKey?:string; newGroundedInterest?:boolean; room:RoomTurnRow[]};
export type RoomTurnDecision={ok:boolean;reason:string};
export function assessRoomTurn(x:RoomTurnInput):RoomTurnDecision {
  const reject=(reason:string):RoomTurnDecision=>({ok:false,reason});
  const conversation=x.room.filter(m=>m.kind!=='system'&&Number.isFinite(m.at))
    .sort((a,b)=>b.id-a.id);
  const latest=conversation[0];
  // Very old AI messages must not keep the room silent forever.
  const streakWindow=x.mode==='live'?12*60_000:18*60_000;
  const recent=conversation.filter(m=>m.at<=x.now&&x.now-m.at<streakWindow);
  const aiStreak=recent.findIndex(m=>m.kind==='human');
  const continuousAi=aiStreak===-1?recent.length:aiStreak;
  if(x.replyToId>0){
    const target=conversation.find(m=>m.id===x.replyToId);
    if(!target||latest?.id!==target.id)return reject('stale-or-missing-reply');
    const age=x.now-target.at;
    if(age<8_000||age>150_000)return reject('reply-timing');
    if(target.kind==='ai'&&continuousAi>=3)return reject('stop-endless-ai-replies');
    // A human's offhand remark does not invite a chain of AI accounts
    // repeating a previous AI reply. A genuine question is different.
    if(target.kind==='ai'&&Number(target.responseToId||0)>0){
      const original=conversation.find(m=>m.id===target.responseToId);
      if(original?.kind==='human'&&!original.asksQuestion&&!target.asksQuestion)
        return reject('prevent-echo-chain-after-human-remark');
    }
    return {ok:true,reason:'context-reply'};
  }
  if(!x.currentProductKey&&!x.room.some(m=>m.kind==='human'&&x.now-m.at<180_000))
    return reject('no-product-or-human-context');
  if(latest?.kind==='human'&&x.now-latest.at<60_000)
    return reject('let-real-customer-conversation-breathe');
  if(latest?.kind==='ai'){
    const age=x.now-latest.at;
    const original=Number(latest.responseToId||0)>0
      ?conversation.find(m=>m.id===latest.responseToId):null;
    if(original?.kind==='human'&&!original.asksQuestion&&age<(x.mode==='live'?5*60_000:8*60_000))
      return reject('human-remark-already-answered');
    if(continuousAi>=2&&!x.newGroundedInterest)return reject('two-unrelated-ai-turns-without-new-context');
    const gap=x.mode==='live'?150_000:360_000;
    if(age<gap)return reject('independent-ai-too-close');
  }
  // Only the caller-verified new product AND new interest can pass the streak
  // limit; the normal gap and human reply protections above still apply.
  // previousProductKey is intentionally not an exemption: public product cards
  // auto-rotate every 5s without any human conversational signal.
  return {ok:true,reason:'room-is-ready'};
}
