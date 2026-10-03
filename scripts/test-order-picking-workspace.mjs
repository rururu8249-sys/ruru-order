import assert from 'node:assert/strict';
import {
  classifyPickingAttention,
  filterPickingWorkspaceOrders,
  kstDateKey,
  selectBroadcastIdsForDateKeys,
} from '../lib/orderPickingWorkspace.ts';

const item = (overrides = {}) => ({ id: '11', productName: '재킷', optionText: '', qty: 1, amount: 10000, pickedAt: null, ...overrides });
const order = (overrides = {}) => ({
  id: '1', groupId: 'g1', rowIds: [11], orderNo: 'O1', paymentStatus: 'paid', paymentLabel: '결제완료',
  createdAt: '2026-10-02T14:30:00.000Z', submittedAt: '2026-10-02T14:30:00.000Z',
  paidAt: '2026-10-03T15:05:00.000Z', paidAtFull: '2026-10-03T15:05:00.000Z', nickname: '고객', name: '고객', phone: '',
  paymentMethod: '무통장입금', broadcastId: 'b1', broadcastName: '10월 2일 방송', orderSummary: '',
  productAmount: 10000, shippingFee: 0, totalAmount: 10000, memo: '', items: [item()], ...overrides,
});

assert.equal(kstDateKey('2026-10-03T15:05:00.000Z'), '2026-10-04');
assert.equal(kstDateKey(null), null);

const late = order();
assert.equal(classifyPickingAttention(late, late.items[0]), 'late_paid');
const repickItem = item({ repickRequiredAt: '2026-10-04T01:00:00Z', repickResolvedAt: null });
assert.equal(classifyPickingAttention(order({ items: [repickItem] }), repickItem), 'repick', 'repick wins over late payment');
assert.equal(classifyPickingAttention(order({ paidAtFull: '2026-10-02T15:00:00Z' }), item({ pickedAt: 'done' })), null);

const rows = [
  late,
  order({ id: '2', broadcastId: 'b2', createdAt: '2026-10-04T00:00:00Z', paidAtFull: '2026-10-04T02:00:00Z' }),
  order({ id: '3', broadcastId: 'b3', paymentStatus: 'unpaid', paidAtFull: null }),
  order({ id: '4', broadcastId: 'b1', paymentStatus: 'canceled' }),
  order({ id: '5', broadcastId: 'b1', excludeFromPicking: true }),
];
assert.deepEqual(
  filterPickingWorkspaceOrders(rows, { broadcastIds: ['b1', 'b2'], paymentDateFilter: 'today_paid', today: '2026-10-04T03:00:00+09:00' }).map(row => row.id),
  ['1', '2'],
  'today-paid uses the KST calendar day and includes multiple broadcasts',
);
assert.deepEqual(
  filterPickingWorkspaceOrders(rows, { broadcastIds: ['b1', 'b2'], paymentDateFilter: 'late_paid', today: '2026-10-04T03:00:00+09:00' }).map(row => row.id),
  ['1'],
  'late-paid is paid on a later KST date than the order',
);
assert.deepEqual(filterPickingWorkspaceOrders(rows, { paymentDateFilter: 'all_paid', today: '2026-10-04' }).map(row => row.id), ['1', '2']);

const broadcasts = [
  { id: 'today-a', startedAt: '2026-10-04T01:00:00+09:00' },
  { id: 'yesterday', startedAt: '2026-10-03T20:00:00+09:00' },
  { id: 'old', startedAt: '2026-10-02T20:00:00+09:00' },
];
assert.deepEqual(selectBroadcastIdsForDateKeys(broadcasts, ['2026-10-04', '2026-10-03']), ['today-a', 'yesterday']);

console.log('picking workspace: KST dates, attention, paid filters, broadcast scope passed');
