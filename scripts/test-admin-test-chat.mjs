import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();const {adminTestChatRow}=load('lib/adminTestChat.ts');
for(const [ref,body] of [['c:1','🛍️ 파*수첩님 장바구니 담음 · 코트'],['o:1','🛒 파란수첩님 코트 주문 감사합니다!'],['ap:1','💗 파란수첩님 입금 확인! 감사합니다'],['ap:2','💗 파란수첩님 카드결제 확인! 감사합니다'],['card:1','💳 파란수첩님, 카드 결제 링크']]){
 const row={id:1,broadcast_id:'bc',nickname:'알림',badge:'bot',body,bot_ref:ref,automation_actor_id:'actor'};
 const admin=adminTestChatRow(row);
 assert.match(admin.body,/^[^\[]+\[테스트\]파/);assert.equal(admin.nickname,'알림','mark subject customer, not system alias');
 assert.deepEqual(adminTestChatRow(admin),admin,'idempotent');assert.equal(row.body,body,'stored/public text unchanged');
 assert.equal(adminTestChatRow({...row,automation_actor_id:null}).body,body,'real customer never marked');
 assert.equal(load('lib/liveChat.ts').parseChatMessage(row).body,body,'public parser never adds label');
}
assert.equal(adminTestChatRow({nickname:'손님',automation_actor_id:'actor'}).nickname,'[테스트]손님');
assert.equal(adminTestChatRow({body:'🛒 가상님 주문 감사합니다!',badge:'bot',bot_ref:'o:legacy',avatar_url:'autotest'}).body,'🛒 [테스트]가상님 주문 감사합니다!');
console.log('PASS admin-only subject prefix, real-customer exclusion, idempotence and unchanged public parser');
