/** One stable presentation per persisted event; never changes the message's facts or AI badge. */
export const NOTIFICATION_NAMES = {
 // [2026-11-13 23:15 사장님] 알림 닉네임은 종류마다 하나씩만(너무 많아 정신없음)
 cart:['언니이거사'],
 order:['주문알림'],
 paid:['입금요정'],
 guide:['쇼핑도우미'],
} as const;
const PALETTES={
 cart:{nick:'#FFD08A',badge:'#7A4300',ink:'#FFF1D7',light:'#7A4300',frame:'#FFB84D'},
 order:{nick:'#FFAFCC',badge:'#8B2851',ink:'#FFF0F6',light:'#8B2851',frame:'#F783AC'},
 paid:{nick:'#8CE8CA',badge:'#12664F',ink:'#E6FFF5',light:'#12664F',frame:'#50CBA4'},
 guide:{nick:'#AFCFFF',badge:'#264F8C',ink:'#EFF6FF',light:'#264F8C',frame:'#8AB8FA'},
};
export function notificationPresentation(m:{id:number;badge:unknown;body:string;botRef:string}){
 if(m.badge!=='bot')return null;
 const kind=m.botRef.startsWith('c:')?'cart':/^paid:|^auto-paid:|^ap:/.test(m.botRef)||/입금|결제 완료/.test(m.body)?'paid':/주문.*감사/.test(m.body)?'order':'guide';
 const index=Math.abs(Math.floor(m.id*2654435761))%NOTIFICATION_NAMES[kind].length;
 return {kind,nickname:NOTIFICATION_NAMES[kind][index],avatar:'notice:'+kind+':'+index,...PALETTES[kind]};
}
export function avatarVariant(src:string){
 const m=/^public(2)?:(\d{1,4})(?::([a-f0-9-]{36}))?$/i.exec(src);if(!m)return null;
 const index=Number(m[2]);return index<5000?{index,key:m[3]||'',version:m[1]?2:1}:null;
}
/** Public API receipts too: never send original photo URLs, even for the apparent sender. */
export function publicChatRow(row:Record<string,unknown>){
 const {avatar_url:discarded,avatar:discardedAlias,kakao_id:privateAccount,customer_id:privateCustomer,...safe}=row;
 void discarded;void discardedAlias;void privateAccount;void privateCustomer;
 const id=Number(row.public_avatar_id);
 return {...safe,avatar_url:Number.isInteger(id)&&id>=0&&id<5000?(row.public_avatar_version===2?'public2:':'public:')+id+(row.public_avatar_key?':'+String(row.public_avatar_key):''):''};
}
