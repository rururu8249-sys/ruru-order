import {createHmac,timingSafeEqual} from 'node:crypto';

type Customer={customer_phone?:unknown;customer_name?:unknown;live_alert_optin?:boolean|null;live_alert_optin_at?:string|null};
type Order={customer_phone?:unknown;phone?:unknown;created_at?:string|null;order_status?:string|null;admin_order_status_v2?:string|null;is_deleted?:boolean|null;is_permanently_deleted?:boolean|null;is_test_order?:boolean|null};
export type AlertTarget={phone:string;name:string;orderDays:number;recent:boolean};
export type AlertManifest={broadcastId:string;actor:string;phones:string[];expires:number;mode?:string;policy?:string};
export const ALERT_SELECTION_POLICY='buyers-first-5pct-v2';
export const alertPhone=(value:unknown)=>String(value??'').replace(/\D/g,'');
export function selectAlertRecipients(customers:Customer[],orders:Order[],excluded:Set<string>,options:{limit:number;orderDays:number;recentDays:number;now:number;random?:()=>number;includeAllEligible?:boolean}):AlertTarget[]{
 const {limit,orderDays,recentDays,now}=options;
 if(!Number.isInteger(limit)||limit<1||limit>10000)throw new Error('발송 인원은 1~10,000명의 정수로 입력해 주세요.');
 if([orderDays,recentDays].some(n=>!Number.isInteger(n)||n<1||n>365)||!Number.isFinite(now))throw new Error('조회 기간은 1~365일로 입력해 주세요.');
 const days=new Map<string,Set<string>>();
 for(const o of orders){
  if(o.is_deleted||o.is_permanently_deleted||o.is_test_order||['canceled','cancelled','취소'].includes(o.order_status||'')||['canceled','cancelled','취소'].includes(o.admin_order_status_v2||''))continue;
  const time=Date.parse(o.created_at||'');if(!Number.isFinite(time)||time<now-orderDays*86400000||time>now)continue;
  const phone=alertPhone(o.customer_phone||o.phone);if(!/^01[016789]\d{7,8}$/.test(phone))continue;
  const key=new Date(time+9*3600000).toISOString().slice(0,10);
  if(!days.has(phone))days.set(phone,new Set());days.get(phone)!.add(key);
 }
 const unique=new Map<string,Customer>();
 // If legacy duplicate profiles disagree, explicit OFF wins.
 for(const c of customers){const p=alertPhone(c.customer_phone);if(!unique.has(p)||c.live_alert_optin===false)unique.set(p,c);}
 const random=options.random||Math.random;
 const ranked=[...unique].flatMap(([phone,c])=>{
  if(c.live_alert_optin!==true||excluded.has(phone)||!/^01[016789]\d{7,8}$/.test(phone))return [];
  const count=days.get(phone)?.size||0,t=Date.parse(c.live_alert_optin_at||'');
  const recent=Number.isFinite(t)&&t<=now&&t>=now-recentDays*86400000;
  if(!options.includeAllEligible&&count<2&&!recent)return [];
  // Order-day count determines buyer priority; signup recency grants entry,
  // not a bonus that could outweigh a more frequent customer's orders.
  const weight=Math.max(1,count);
  const u=Math.max(Number.MIN_VALUE,Math.min(1,random()));
  return [{phone,name:String(c.customer_name||''),orderDays:count,recent,rank:-Math.log(u)/weight}];
 }).sort((a,b)=>a.rank-b.rank||a.phone.localeCompare(b.phone));
 // Recent signup boosts never let people without recent orders displace
 // more than the approved 5% of the operator's requested recipient count.
 // Keep one-day recent signups in the buyer pool (not the 5% pool).
 if(options.includeAllEligible)return ranked.map(({rank,...target})=>target);
 const buyers=ranked.filter(p=>p.orderDays>0);
 const nonBuyerLimit=Math.floor(limit/20);
 const nonBuyers=ranked.filter(p=>p.orderDays===0).slice(0,nonBuyerLimit);
 return [...buyers.slice(0,limit-nonBuyers.length),...nonBuyers].map(({rank,...target})=>target);
}
function validateManifest(m:AlertManifest){
 if(!m.broadcastId||!m.actor||!Number.isFinite(m.expires)||!Array.isArray(m.phones)||m.phones.length>10000||new Set(m.phones).size!==m.phones.length||m.phones.some(p=>!/^01[016789]\d{7,8}$/.test(p)))throw new Error('잘못된 발송 명단입니다.');
}
export function sealAlertSelection(manifest:AlertManifest,secret:string):string{
 validateManifest(manifest);if(!secret)throw new Error('발송 서명 설정 없음');
 const body=Buffer.from(JSON.stringify(manifest)).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
export function readAlertSelection(token:string,secret:string,broadcastId:string,actor:string,now:number):AlertManifest{
 if(!secret||typeof token!=='string'||token.length>300000)throw new Error('명단을 다시 확인해 주세요.');
 const [body,sig,...rest]=token.split('.');if(!body||!sig||rest.length)throw new Error('명단을 다시 확인해 주세요.');
 const expected=createHmac('sha256',secret).update(body).digest(),given=Buffer.from(sig,'base64url');
 if(given.length!==expected.length||!timingSafeEqual(given,expected))throw new Error('발송 명단 서명이 올바르지 않습니다.');
 const m=JSON.parse(Buffer.from(body,'base64url').toString()) as AlertManifest;validateManifest(m);
 if(m.broadcastId!==broadcastId||m.actor!==actor||m.expires<=now)throw new Error('명단이 만료되었거나 방송이 변경되었습니다. 다시 확인해 주세요.');
 return m;
}
