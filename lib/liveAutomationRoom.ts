type RoomMessage={body?:unknown;created_at?:unknown;badge?:unknown;automation_actor_id?:unknown};
/** Describes observed messages only; a truncated history cannot prove a quiet room. */
export function conversationRoom(messages:RoomMessage[],mode:string,now=Date.now(),lastRoomComment?:string) {
  const recent=messages.filter(m=>{const t=Date.parse(String(m.created_at));return t<=now&&t>now-300000});
  const chat=recent.filter(m=>m.badge!=='bot');
  const orders=recent.filter(m=>m.badge==='bot'&&String(m.body).startsWith('🛒'));
  const recentSpeech=chat.some(m=>Date.parse(String(m.created_at))>now-180000);
  const coversQuietWindow=messages.length<40||messages.some(m=>Date.parse(String(m.created_at))<=now-180000);
  const alreadyObserved=(lastRoomComment?Date.parse(lastRoomComment)>now-900000:false)||messages.some(m=>m.automation_actor_id&&/조용|주문만|말이 없|말씀.{0,4}없/.test(String(m.body))&&Date.parse(String(m.created_at))>now-900000);
  return {mode,recentOrderNotices:orders.length,recentParticipantMessages:chat.length,
    quietWhileOrdering:coversQuietWindow&&!recentSpeech&&orders.length>=2&&!alreadyObserved};
}
