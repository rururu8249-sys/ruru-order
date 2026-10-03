import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPickingExportRows, partitionPickingAttentionRows } from '../lib/orderPickingExportRows.ts';

const item = (id, extra = {}) => ({ id: String(id), productName: `상품${id}`, optionText: '', color: '검정', size: 'M', qty: 1, amount: 10000, pickedAt: null, ...extra });
const order = (id, itemValue, extra = {}) => ({
  id: String(id), groupId: `g${id}`, rowIds: [id], orderNo: `O${id}`, paymentStatus: 'paid', paymentLabel: '완료',
  createdAt: '2026-10-01T01:00:00Z', submittedAt: '2026-10-01T01:00:00Z', paidAt: null, paidAtFull: '2026-10-01T02:00:00Z',
  nickname: `고객${id}`, name: `고객${id}`, phone: '', paymentMethod: '무통장입금', broadcastId: 'b1', broadcastName: '10월 1일 방송',
  orderSummary: '', productAmount: 10000, shippingFee: 0, totalAmount: 10000, memo: '', items: [itemValue], ...extra,
});

const ordinary = order(1, item(1));
const late = order(2, item(2), { createdAt: '2026-10-01T01:00:00Z', paidAtFull: '2026-10-02T01:00:00Z' });
const repick = order(3, item(3, { productName: '새 재킷', color: '아이보리', size: 'L', qty: 2, repickRequiredAt: '2026-10-03T03:00:00Z', repickBefore: { product_name: '재킷', color: '검정', size: 'M', qty: 1 } }));
const missingTime = order(4, item(4), { paymentStatus: 'card_paid', paymentMethod: '카드결제', paidAt: null, paidAtFull: null });
const result = buildPickingExportRows([ordinary, late, repick, missingTime], ['2', '3', '4'], ['2', '3', '4']);

assert.deepEqual(result.mainRows.map(row => row.itemId), ['2', '3', '4'], 'main sheet uses exactly the visible item IDs');
assert.equal(result.mainRows[0].kind, '결제 후 추가 챙기기');
assert.equal(result.mainRows[1].kind, '상품 변경 · 다시 챙기기');
assert.equal(result.mainRows[2].kind, '결제 후 추가 챙기기');
assert.equal(result.mainRows[1].qty, 2);
assert.equal(result.attentionRows.length, 3, 'safety rows are cross-checks, not duplicate quantities');
assert.match(result.attentionRows[0].detail, /주문일.*결제일/);
assert.match(result.attentionRows[1].before, /재킷.*검정.*M.*1개/);
assert.match(result.attentionRows[1].current, /새 재킷.*아이보리.*L.*2개/);
assert.match(result.attentionRows[2].detail, /카드결제 완료.*미챙김/);
assert.doesNotMatch(result.attentionRows[2].detail, /결제시각.*확인/);
const partitioned = partitionPickingAttentionRows(result.attentionRows);
assert.deepEqual(partitioned.latePaymentRows.map(row => row.itemId), ['2', '4']);
assert.deepEqual(partitioned.repickRows.map(row => row.itemId), ['3']);

const withOrdinary = buildPickingExportRows([ordinary, late, repick], ['1', '2', '3']);
assert.equal(withOrdinary.mainRows.length, 3);
assert.equal(withOrdinary.attentionRows.length, 2, 'ordinary rows stay off the attention sheet');

const activeBroadcastMissingTime = buildPickingExportRows([missingTime], ['4'], []);
assert.equal(activeBroadcastMissingTime.mainRows[0].kind, '일반', 'a selected active-broadcast card payment is ordinary work even when its legacy timestamp is missing');
assert.equal(activeBroadcastMissingTime.attentionRows.length, 0, 'selected-broadcast work never leaks into the additional-work sheets');

const workbookSource = fs.readFileSync(path.resolve('components/admin-live/adminLiveOrderExcelExport.ts'), 'utf8');
for (const sheetName of ['오늘 챙길 전체', '결제 후 추가 챙기기', '상품 변경 다시 챙기기']) {
  assert.ok(workbookSource.includes(`addWorksheet("${sheetName}")`) || workbookSource.includes(`appendAttentionSheet("${sheetName}"`), `${sheetName} sheet must be created`);
}

console.log('picking export rows: visible parity, attention detail and stable counts passed');
