import assert from 'node:assert/strict';
import {includeChatViewNoticeMessage,includeChatViewMessage} from '../lib/chatViewFilter.ts';
const m=(badge,botRef,body)=>({badge,botRef,body});
for(const ref of ['c:1','o:2','card:3','paid:4','ap:5','auto-paid:6']){
  assert.equal(includeChatViewNoticeMessage(m('bot',ref,'알림 내용')),false,ref);
}
for(const body of ['주문서 제출 완료','주문 접수 완료','카드결제 완료','카결 완료 알림','입금 확인 완료','장바구니 담음']){
  assert.equal(includeChatViewNoticeMessage(m('bot','',body)),false,body);
}
for(const body of ['주문서 제출했는데 확인해주세요','입금 확인 부탁드립니다','카드결제 되나요?','장바구니 담았어요']){
  assert.equal(includeChatViewNoticeMessage(m(null,'',body)),true,body);
}
assert.equal(includeChatViewNoticeMessage(m('bot','p:21','상품 안내')),true);
assert.equal(includeChatViewNoticeMessage(m(null,'','이거 사이즈 어떻게 돼요?')),true);
assert.equal(includeChatViewMessage(m('bot','o:2','주문 알림')),true,'history behavior must be unchanged');
console.log('PASS overlay excludes order/cart/payment bot notices; customer chat and site history unchanged');
