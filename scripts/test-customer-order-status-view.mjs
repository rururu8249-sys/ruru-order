// [㊲] 같은 주문이 /myorder 와 주문서 화면 「주문내역」 창에서 같은 상태(필터·배지 글자)로 보이는지.
import assert from 'node:assert/strict';
import { myOrderStatusLabel, myOrderFilterOf, myOrderChipView, orderLookupStatusView, cleanCustomerOptionValue, CUSTOMER_ORDER_FILTERS } from '../lib/customerOrderStatusView.ts';

const cases = [
  { name: '취소(RURU-MUVHONNV 실례 모양)', order: { order_manage_status: '주문취소', order_status: '주문완료', payment_method: '무통장입금' }, filter: '주문취소', badge: '주문취소' },
  { name: '입금대기', order: { order_manage_status: '주문확인전', order_status: '주문완료', payment_method: '무통장입금' }, filter: '입금대기', badge: '입금대기' },
  { name: '입금확인', order: { order_manage_status: '자동입금확인', order_status: '주문완료', payment_method: '무통장입금' }, filter: '입금확인', badge: '입금확인' },
  { name: '카드 결제완료', order: { order_manage_status: '카드결제완료', payment_method: '카드결제' }, filter: '입금확인', badge: '입금확인' },
  { name: '출고완료', order: { order_manage_status: '출고완료', shipping_status: '택배출고', payment_method: '무통장입금' }, filter: '출고완료', badge: '출고완료' },
  { name: '환불', order: { order_manage_status: '환불', refund_type: '', payment_method: '무통장입금' }, filter: '주문취소', badge: '환불완료' },
  { name: '부분환불', order: { order_manage_status: '환불', refund_type: '부분환불', payment_method: '무통장입금' }, filter: '주문취소', badge: '부분환불' },
];

for (const c of cases) {
  const label = myOrderStatusLabel(c.order);
  const my = { filter: myOrderFilterOf(label), badge: myOrderChipView(label).chipText };
  const sheet = orderLookupStatusView(c.order);
  assert.equal(my.filter, c.filter, `${c.name}: /myorder 필터 (label=${label})`);
  assert.equal(sheet.filterKey, c.filter, `${c.name}: 주문서 화면 필터`);
  assert.equal(my.badge, c.badge, `${c.name}: /myorder 배지`);
  assert.equal(sheet.displayText, c.badge, `${c.name}: 주문서 화면 배지`);
}

// 버그 재현: 예전 /myorder 는 "주문서취소" 를 몰라서 입금대기 — 이제 주문취소
assert.equal(myOrderStatusLabel({ order_manage_status: '주문취소' }), '주문서취소');
assert.equal(myOrderFilterOf('주문서취소'), '주문취소');
assert.notEqual(myOrderChipView('주문서취소').chipText, '입금대기');

// 두 화면 필터 이름 같음, 이모지 없음
assert.deepEqual([...CUSTOMER_ORDER_FILTERS], ['전체', '입금대기', '입금확인', '출고완료', '주문취소']);
for (const c of cases) assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(orderLookupStatusView(c.order).displayText));

// 옵션 「없음」 제거
assert.equal(cleanCustomerOptionValue('없음'), '');
assert.equal(cleanCustomerOptionValue(' 블랙 '), '블랙');
console.log('customer order status view passed');
