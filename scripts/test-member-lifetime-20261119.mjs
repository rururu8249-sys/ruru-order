import assert from 'node:assert/strict';
import {buildLifetimeStatsByProfile,calculateLifetimeStats,classifyLifetimeOrder} from '../lib/customerLifetimeStats.ts';
const profiles=[{id:1,kakao_id:'123',customer_phone:'01011112222'},{id:2,kakao_id:'456',customer_phone:'01033334444'},{id:3,kakao_id:null,customer_phone:'01055556666'}];
const order=(id,group,kid,phone,total,status,dt='2026-05-10T12:00:00Z')=>({id,order_group_id:group,kakao_id:kid,customer_phone:phone,final_amount:total,order_manage_status:status,admin_order_status_v2:status,created_at:dt,is_deleted:false});
const rows=[
 order(1,'new','123','01011112222',40000,'자동입금확인'),
 order(2,'new','123','01011112222',20000,'자동입금확인'),
 order(3,'old',null,'01011112222',100000,'카드결제완료','2026-07-01T00:00:00Z'),
 order(4,'cancel','123','01011112222',50000,'주문서취소'),
 order(5,'unpaid','123','01011112222',70000,'입금대기'),
 order(6,'someone-else','456','01011112222',999999,'자동입금확인'),
 order(7,'two','456','01033334444',38000,'출고완료'),
 order(8,'unlinked',null,'01055556666',23000,'자동입금확인'),
 {...order(9,'deleted','123','01011112222',60000,'카드결제완료'),is_deleted:true},
];
const result=buildLifetimeStatsByProfile(profiles,rows);
assert.deepEqual(result.byProfile['1'],{all:4,paid:2,unpaid:1,canceled:1,paidAmount:160000,totalAmount:280000,latestOrderAt:'2026-07-01T00:00:00Z',manualNeededCount:0});
assert.equal(result.byProfile['2'].all,2);
assert.equal(result.byProfile['2'].paidAmount,1037999,'actual Kakao owner gets its own item even if phone collides');
assert.equal(result.byProfile['3'].paidAmount,23000);
assert.equal(calculateLifetimeStats([order(1,'one','123','010',0,'manual_match_needed')]).unpaid,1);
assert.equal(calculateLifetimeStats([order(1,'one','123','010',0,'manual_match_needed')]).manualNeededCount,1);
assert.equal(classifyLifetimeOrder('출고완료 합배송중').kind,'paid');
assert.equal(classifyLifetimeOrder('주문서취소 카드결제완료').kind,'canceled');
assert.equal(calculateLifetimeStats([]).all,0);
const sharedPhoneProfiles=[{id:10,kakao_id:'A',customer_phone:'01012341234'},{id:11,kakao_id:'B',customer_phone:'01012341234'}];
const confusing=[order(90,'a','A','01012341234',17000,'카드결제완료'),order(91,'b','B','01012341234',23000,'카드결제완료'),order(92,'legacy',null,'01012341234',45000,'자동입금확인')];
const safety=buildLifetimeStatsByProfile(sharedPhoneProfiles,confusing);
assert.equal(safety.byProfile['10'].paidAmount,17000,'account A remains separate');
assert.equal(safety.byProfile['11'].paidAmount,23000,'account B remains separate');
assert.equal(safety.ambiguousRows,1,'legacy row with multiple account owners is held for audit, not assigned');
const unknown=buildLifetimeStatsByProfile([{id:7,kakao_id:'777',customer_phone:'01011112222'}],[order(900,'x','888','01011112222',10000,'카드결제완료')]);
assert.equal(unknown.unmatchedRows,1,'unknown Kakao cannot inherit another account by phone');
console.log('PASS member lifetime: grouped forms, paid amounts, cancellations, old phones, Kakao ownership, no double count');
