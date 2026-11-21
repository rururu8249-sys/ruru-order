#!/usr/bin/env node
// Executes the actual filtering function bodies extracted from the site's
// current customer page and API route with isolated test records.
// This is more than a text-only check, but is NOT a live database order test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shippingAddressKey } from '../lib/shippingAddressKey.ts';

const client = fs.readFileSync('app/order/page.tsx', 'utf8');
const server = fs.readFileSync('app/api/customer-orders/submit/route.ts', 'utf8');
const SOURCE_MARKER='subscribe_promo_redemption';

function body(source, begin, closing) {
  assert.equal(source.split(begin).length - 1, 1, `exact filter anchor missing/multiple: ${begin}`);
  const a = source.indexOf(begin);
  const bodyBegin = source.indexOf('=> {',a);
  assert(bodyBegin > a,`filter function arrow not found: ${begin}`);
  const b = source.indexOf(closing,bodyBegin);
  assert(b > bodyBegin,`closing filter bracket not found: ${begin}`);
  return source.slice(bodyBegin+'=> {'.length,b);
}
const customerActive = new Function('order','kakaoIdForCombine','isCanceledOrderForCombineShipping',
  body(client,'const activeCombineShippingOrders = ', '\n    });'));
const customerAddress = new Function('order','shippingAddressKey','addressSignature',
  body(client,'const paidShippingOrders = ', '\n    });'));
const serverAddress = new Function('row','safeKakaoIdForShipping','signature','isCanceledForSubmitShipping','shippingAddressKey',
  body(server,'const sameAddressOrders = ', '\n  });'));

// Test actual server window/broadcast predicate extracted verbatim.
const rangeAnchor='const withinCurrentCombine = ';
assert.equal(server.split(rangeAnchor).length-1,1);
const a=server.indexOf(rangeAnchor)+rangeAnchor.length;
const b=server.indexOf(');\n\n  const previousProductIds',a);
assert(b>a,'Server time/broadcast filter ended unexpectedly');
const windowExpr=server.slice(a,b+1).replace('(row: AnyRow)','(row)');
const serverWindow = new Function('sameAddressOrders','byBroadcast','requestedBroadcastId','windowStart','windowEnd',`return ${windowExpr};`);

const addr='서울특별시 중구 세종대로 110',detail='101호';
const addrKey=shippingAddressKey(addr,detail),account='verified_kakao_qa';
const isCanceled = status => /취소|환불|cancel|refund/i.test(String(status || ''));
const order = (extras={})=>({
  kakao_id:account, address:addr,detail_address:detail,
  order_manage_status:'주문확인전',is_deleted:false,
  product_id:100,created_at:'2026-11-21T12:00:00Z',
  broadcast_id:'broadcast-A',shipping_fee:0,
  subscribe_promo_redemption:true, ...extras,
});
const runCustomer=o=> customerActive(o,account,(x)=>isCanceled(x?.order_manage_status)) && customerAddress(o,shippingAddressKey,addrKey);
const runServer=o=> serverAddress(o,account,addrKey,isCanceled,shippingAddressKey);
let count=0;
function check(title, o, expected){
  assert.equal(runCustomer(o),expected,`customer: ${title}`);
  assert.equal(runServer(o),expected,`server: ${title}`);
  count++;
  console.log('PASS '+title);
}
check('혜택으로 첫 주문을 0원 결제해도 같은 기간 합배송 기준 주문임',order(),true);
check('일반 첫 주문도 합배송 기준 주문임',order({subscribe_promo_redemption:false,shipping_fee:4000}),true);
check('주문서 취소건은 제외',order({order_manage_status:'주문서취소'}),false);
check('환불 처리건은 제외',order({order_manage_status:'환불완료'}),false);
check('삭제 주문은 제외',order({is_deleted:true}),false);
check('다른 카카오 계정의 주문은 제외',order({kakao_id:'OTHER_KAKAO'}),false);
check('상세주소가 다르면 제외',order({detail_address:'202호'}),false);
check('기존 빈 카카오ID 주문은 기존 전화번호 대체확인 이후 인정',order({kakao_id:null}),true);

const windowStart='2026-11-21T10:00:00Z';
const windowEnd='2026-11-21T18:00:00Z';
const input=[order(),order({created_at:'2026-11-22T12:00:00Z'}),order({broadcast_id:'broadcast-B'})];
const inTime=serverWindow(input,false,'',windowStart,windowEnd);
assert.equal(inTime.length,2,'Server time eligibility changed unexpectedly');
count++;
console.log('PASS 서버 실제 코드: 관리자 기간 안의 주문만 합배송');
const inBroadcast=serverWindow(input,true,'broadcast-A',windowStart,windowEnd);
assert.equal(inBroadcast.length,2,'Broadcast ID route changed unexpectedly');
count++;
console.log('PASS 서버 실제 코드: 방송 합배송은 방송 ID 일치로 확인');

assert(!client.includes(`if (order?.${SOURCE_MARKER} === true) return false;`));
assert(!server.includes(`if (row?.${SOURCE_MARKER} === true) return false;`));
count++;
console.log('PASS 고객 화면·서버에 구독 무료 주문 제외 조건 없음');
console.log(`RURU_ACTUAL_SOURCE_FILTER_TESTS_PASS=${count}`);
