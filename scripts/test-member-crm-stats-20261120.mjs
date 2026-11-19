import assert from 'node:assert/strict';
import {calculateLifetimeStats, classifyLifetimeOrder, buildLifetimeStatsByProfile} from '../lib/customerLifetimeStats.ts';

// Existing payment vocabulary (lib/orderLabels.ts) and the member list's
// isPaid contract: an explicit unpaid status takes priority over shipping text.
for (const status of ['unpaid', 'unpaid 출고대기', '미입금 출고대기', '입금대기 출고대기', '출고대기']) {
  assert.equal(classifyLifetimeOrder(status).kind, 'unpaid', `${status} is not a completed payment`);
  const stats = calculateLifetimeStats([{id: 1, order_group_id: 'g', final_amount: 35000, order_manage_status: status}]);
  assert.equal(stats.paidAmount, 0, `${status} must not inflate the member payment total`);
  assert.equal(stats.unpaid, 1);
}
for (const status of ['auto_paid 출고대기', 'manual_paid 출고대기', 'card_paid 출고대기', '출고완료 합배송중']) {
  assert.equal(classifyLifetimeOrder(status).kind, 'paid', `${status} keeps the existing paid/legacy contract`);
}
assert.equal(classifyLifetimeOrder('주문서취소 card_paid').kind, 'canceled');
assert.equal(classifyLifetimeOrder('manual_match_needed 출고완료').kind, 'unpaid');

// Do not turn the number of Kakao IDs in historical orders into a new ownership rule.
// One current profile, its previous phone, NULL/empty legacy rows, and another
// explicitly linked account must retain the existing v3 assignment semantics.
const profiles = [{id: 'A', kakao_id: '101', customer_phone: '01011112222'}, {id: 'B', kakao_id: '202', customer_phone: '01033334444'}];
const orders = [
  {id: 1, kakao_id: '101', customer_phone: '01055556666', final_amount: 10000, order_manage_status: 'paid'},
  {id: 2, kakao_id: null, customer_phone: '010-1111-2222', final_amount: 20000, order_manage_status: 'paid'},
  {id: 3, kakao_id: '', customer_phone: '01011112222', final_amount: 30000, order_manage_status: 'paid'},
  {id: 4, kakao_id: '202', customer_phone: '01011112222', final_amount: 40000, order_manage_status: 'paid'},
];
const result = buildLifetimeStatsByProfile(profiles, orders);
assert.equal(result.byProfile.A.all, 3, 'legacy orders stay connected even when historical phone has multiple IDs');
assert.equal(result.byProfile.A.paidAmount, 60000);
assert.equal(result.byProfile.B.paidAmount, 40000, 'explicit other account still receives its own order');
console.log('PASS member CRM stats: explicit unpaid priority, shipping wait, legacy compatibility and identity policy unchanged');
