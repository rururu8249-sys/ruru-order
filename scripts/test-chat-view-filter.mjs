import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {includeChatViewMessage}=createUiLoader({})('lib/chatViewFilter.ts');
const bot=(body,botRef='')=>({body,botRef,badge:'bot'});
for(const m of [bot('장바구니 담음','c:123'),bot('카드 결제 링크 보내 드려요','card:123'),bot('결제 완료! 감사합니다','paid:123'),bot('💳 홍길동님, 카드 결제 링크를 카톡으로 보내 드려요.'),bot('🛍️ 홍*동님 장바구니 담음 · 상품 1개'),bot('💗 홍길동님 결제 완료! 감사합니다')]) assert.equal(includeChatViewMessage(m),false,m.body);
for(const m of [bot('🛒 홍길동님 상품 주문 감사합니다!','o:123'),bot('구매해 주셔서 감사합니다'),{body:'카드결제 요청했는데 아직 안 왔어요',badge:null,botRef:''},bot('카드결제는 배송비 포함 5만원 이상부터 돼요.')])assert.equal(includeChatViewMessage(m),true,m.body);
console.log('PASS automated cart/payment/card filtering, purchase thanks, customer questions');
