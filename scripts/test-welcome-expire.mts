import assert from 'node:assert/strict';
import {planWelcomeExpiry, runWelcomeExpiry} from '../lib/welcomeExpire';
const D=86_400_000, now=Date.parse('2026-12-20T00:00:00Z');
const at=(daysAgo:number)=>new Date(now-daysAgo*D).toISOString();
const R=(id:string,amount:number,daysAgo:number,key:string|null=null)=>({id,amount,created_at:at(daysAgo),source_key:key});

// 1) 안 씀 → 전부 소멸
assert.deepEqual(planWelcomeExpiry([R('g1',1000,31,'welcome_first:1')],1000,now).map(p=>p.amount),[1000]);
// 2) 29일 → 아직
assert.equal(planWelcomeExpiry([R('g1',1000,29,'welcome_first:1')],1000,now).length,0);
// 3) 600 씀(먼저 받은 것부터) → 400 소멸
assert.deepEqual(planWelcomeExpiry([R('g1',1000,40,'welcome_first:1'),R('u',-600,35)],400,now).map(p=>p.amount),[400]);
// 4) 적립 포인트가 먼저 있으면 그걸 먼저 씀 → 선물은 그대로 소멸
assert.deepEqual(planWelcomeExpiry([R('e',500,50),R('g1',1000,40,'welcome_first:1'),R('u',-500,35)],1000,now).map(p=>p.amount),[1000]);
// 5) 2구간 둘 다 / 이미 소멸한 건 다시 안 함
assert.deepEqual(planWelcomeExpiry([R('g1',500,40,'welcome_first:1'),R('g2',500,40,'welcome_first:1#2')],1000,now).map(p=>p.amount),[500,500]);
assert.deepEqual(planWelcomeExpiry([R('g1',500,40,'welcome_first:1'),R('x',-500,9,'wexpire:g1'),R('g2',500,40,'welcome_first:1#2')],500,now).map(p=>p.grantId),['g2']);
// 6) 잔액보다 많이 못 없앰 / 관리자 지급은 소멸 안 함
assert.deepEqual(planWelcomeExpiry([R('g1',1000,40,'welcome_back:1:9')],300,now).map(p=>p.amount),[300]);
assert.equal(planWelcomeExpiry([R('a',1000,40,'admin:1')],1000,now).length,0);
// 7) 주문 취소로 돌려받은 포인트(새 줄)는 소멸 안 함
assert.deepEqual(planWelcomeExpiry([R('g1',1000,40,'welcome_first:1'),R('u',-1000,35),R('c',1000,33)],1000,now).length,0);

// 8) 가짜 DB 로 runner: RPC deduct 호출 값·두 번 돌려도 한 번
type Row={id:string;customer_phone:string;change_type:string;amount:number;created_at:string;source_key:string|null};
const ledger:Row[]=[
 {id:'g1',customer_phone:'01011112222',change_type:'grant',amount:1000,created_at:at(31),source_key:'welcome_first:7'},
 {id:'u1',customer_phone:'01011112222',change_type:'use',amount:-300,created_at:at(30.5),source_key:null},
 {id:'g9',customer_phone:'01033334444',change_type:'grant',amount:1000,created_at:at(10),source_key:'welcome_first:8'},
];
const balances:Record<string,number>={'01011112222':700,'01033334444':1000};
const calls:any[]=[];
function q(rows:any[]){const f:any={_r:rows,select(){return f},eq(k:string,v:any){f._r=f._r.filter((r:any)=>r[k]===v);return f},like(k:string,p:string){f._r=f._r.filter((r:any)=>String(r[k]??'').startsWith(p.replace('%','')));return f},lte(k:string,v:string){f._r=f._r.filter((r:any)=>r[k]<=v);return f},gte(k:string,v:string){f._r=f._r.filter((r:any)=>r[k]>=v);return f},in(k:string,v:any[]){f._r=f._r.filter((r:any)=>v.includes(r[k]));return f},order(){return f},limit(){return f},maybeSingle(){return Promise.resolve({data:f._r[0]??null,error:null})},then(res:any){return Promise.resolve({data:f._r,error:null}).then(res)}};return f}
const sb:any={from(t:string){return t==='customer_point_balances'?q(Object.entries(balances).map(([p,c])=>({customer_phone:p,current_points:c}))):q(ledger)},
 rpc(_n:string,a:any){calls.push(a);if(ledger.some(r=>r.source_key===a.p_source_key))return Promise.resolve({data:{ok:true,duplicate:true},error:null});
  balances[a.p_phone]-=a.p_amount;ledger.push({id:'x'+calls.length,customer_phone:a.p_phone,change_type:'adjust',amount:-a.p_amount,created_at:new Date(now).toISOString(),source_key:a.p_source_key});return Promise.resolve({data:{ok:true},error:null});}};
const r1=await runWelcomeExpiry(sb,now);
assert.deepEqual([r1.expired,r1.points],[1,700]);
assert.equal(calls[0].p_action,'deduct');assert.equal(calls[0].p_source_key,'wexpire:g1');assert.match(calls[0].p_reason,/유효기간 만료/);
assert.equal(balances['01011112222'],0);assert.equal(balances['01033334444'],1000);
const r2=await runWelcomeExpiry(sb,now);
assert.deepEqual([r2.expired,calls.length],[0,1]);
console.log('welcome-expire OK');
