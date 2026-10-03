import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cardPaymentStatusPatch } from '../lib/cardPaymentStatusUpdate.ts';

const completedAt = '2026-10-04T03:12:34.000Z';
assert.deepEqual(cardPaymentStatusPatch('카드결제완료', completedAt), {
  admin_order_status_v2: '카드결제완료',
  order_manage_status: '카드결제완료',
  deposit_confirmed_at: completedAt,
});
assert.deepEqual(cardPaymentStatusPatch('주문확인전', completedAt), {
  admin_order_status_v2: '주문확인전',
  order_manage_status: '주문확인전',
  deposit_confirmed_at: null,
});

const root = path.resolve('.');
for (const relative of ['components/admin-live/AdminLiveCardPayPopup.tsx', 'components/admin-live/LiveOrderDetailDrawer.tsx']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.match(source, /cardPaymentStatusPatch\(/, `${relative} must use the timestamp-safe status patch`);
}

console.log('card payment status updates always write or clear the confirmation timestamp');
