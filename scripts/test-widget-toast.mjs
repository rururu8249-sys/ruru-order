import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {parseCartChatToast}=createUiLoader({})('lib/widgetToast.ts');
const msg=(o={})=>({id:7,broadcastId:'b',nickname:'루루동이',body:'🛍️ 루*동이님 장바구니 담음 · PD-202 블랙/M · 259,000원 외 2종',createdAt:'',hidden:false,badge:'bot',pinned:false,botRef:'c:ab~1|PD-202',avatar:'',...o});
assert.deepEqual(parseCartChatToast(msg()),{key:'7',nick:'루*동이',detail:'PD-202 블랙/M 외 2종'});
assert.deepEqual(parseCartChatToast(msg({body:'🛍️ 김*님 장바구니 담음 · BB-58 L · 195,000원'})).detail,'BB-58 L');
assert.equal(parseCartChatToast(msg({body:'🛍️ 김*님 장바구니 담음 · 니트'})).detail,'니트');
for(const o of [{botRef:'p:1|x'},{badge:null},{hidden:true},{body:'💗 결제 완료'}]) assert.equal(parseCartChatToast(msg(o)),null,JSON.stringify(o));
assert.equal(parseCartChatToast(null),null);
console.log('PASS widget toast: cart chat → sticker text, test/hidden/other bot skipped');
// [2026-11-14] 자동 테스트 담기도 실제처럼 스티커
assert.ok(parseCartChatToast(msg({avatar:'autotest'})), '자동 테스트 담기도 스티커');
