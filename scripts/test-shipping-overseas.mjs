// [2026-10-29 사장님] 해외배송 배지 상품 = 해외배송비 따로 1번(설정 > 0 일 때만). 0원이면 예전 그대로.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveShippingGroup, hasOverseasBadge, calculateShippingBreakdown, assignRowShippingFees, shippingFeeByGroup, expectedMinimumShipping, EMPTY_PAID_SHIPPING_GROUPS, normalizePaidShippingGroups } from '../lib/shippingGroups.ts';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
const S = (overseasFee) => ({ normalFee: 4000, normalRemoteFee: 7000, vendorFee: 4000, vendorRemoteFee: 7000, overseasFee });
const OV = { shipping_type: 'normal', badge_types: ['overseas'] };
const NORMAL = { shipping_type: 'normal', badge_types: ['special'] };
const grp = (p, fee) => resolveShippingGroup(p, fee > 0 && hasOverseasBadge(p));

t('배지 판정: badge_types / 옛 badge_type', () => {
  assert.equal(hasOverseasBadge(OV), true);
  assert.equal(hasOverseasBadge({ badge_type: 'overseas' }), true);
  assert.equal(hasOverseasBadge(NORMAL), false);
  assert.equal(hasOverseasBadge({}), false);
});

t('해외배송비 0원(기본) = 예전 그대로: 해외배송 상품도 일반 갈래, 같이 사면 4,000 한 번', () => {
  const f = shippingFeeByGroup(S(0), false);
  const groups = [grp(OV, 0), grp(NORMAL, 0)];
  assert.deepEqual(groups, ['normal', 'normal']);
  assert.equal(calculateShippingBreakdown(groups, EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 4000);
});

t('해외배송비 5,000: 일반+해외 같이 사면 4,000 + 5,000', () => {
  const f = shippingFeeByGroup(S(5000), false);
  const groups = [grp(OV, 5000), grp(NORMAL, 5000)];
  const b = calculateShippingBreakdown(groups, EMPTY_PAID_SHIPPING_GROUPS, f);
  assert.deepEqual([b.normalShippingFee, b.overseasShippingFee, b.totalShippingFee], [4000, 5000, 9000]);
});

t('해외배송 상품 여러 개 = 해외배송비 한 번', () => {
  const f = shippingFeeByGroup(S(5000), false);
  assert.equal(calculateShippingBreakdown(['overseas', 'overseas', 'overseas'], EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 5000);
});

t('업체배송으로 등록된 해외배송 상품도 해외배송 갈래(배지 우선)', () => {
  assert.equal(grp({ shipping_type: 'vendor', badge_types: ['overseas'] }, 5000), 'overseas');
});

t('제주·산간: 해외배송 제주/산간 금액(없으면 해외배송비와 같음·더 낮게는 안 됨)', () => {
  assert.equal(shippingFeeByGroup(S(5000), true).overseas, 5000);
  assert.equal(shippingFeeByGroup({ ...S(5000), overseasRemoteFee: 8000 }, true).overseas, 8000);
  assert.equal(shippingFeeByGroup({ ...S(5000), overseasRemoteFee: 8000 }, false).overseas, 5000);
  assert.equal(shippingFeeByGroup({ ...S(5000), overseasRemoteFee: 3000 }, true).overseas, 5000);
});

t('합배송: 이미 해외배송비 낸 기간 안 추가 해외배송 주문 = 0원, 일반은 따로', () => {
  const f = shippingFeeByGroup(S(5000), false);
  const paid = { ...EMPTY_PAID_SHIPPING_GROUPS, overseas: true };
  assert.equal(calculateShippingBreakdown(['overseas'], paid, f).totalShippingFee, 0);
  assert.equal(calculateShippingBreakdown(['overseas', 'normal'], paid, f).totalShippingFee, 4000);
  assert.equal(normalizePaidShippingGroups(true).overseas, true);
});

t('줄마다 배송비: 갈래 첫 줄에만, 합 = 계산 합', () => {
  const f = shippingFeeByGroup(S(5000), false);
  const rows = [{ group: 'normal', chargeable: true }, { group: 'overseas', chargeable: true }, { group: 'overseas', chargeable: true }];
  assert.deepEqual(assignRowShippingFees(rows, EMPTY_PAID_SHIPPING_GROUPS, f), [4000, 5000, 0]);
});

t('서버 최소 배송비 = 손님 화면 금액(일반+해외 = 9,000)', () => {
  assert.equal(expectedMinimumShipping(['normal', 'overseas'], S(5000)), 9000);
  assert.equal(expectedMinimumShipping(['normal'], S(5000)), 4000);
});

t('연결: 손님 화면·서버·관리자 설정이 같은 키를 쓴다', () => {
  const page = fs.readFileSync('app/order/page.tsx', 'utf8');
  const route = fs.readFileSync('app/api/customer-orders/submit/route.ts', 'utf8');
  const admin = fs.readFileSync('components/admin-live/AdminLiveSettingsPanel.tsx', 'utf8');
  for (const src of [page, route, admin]) assert.match(src, /overseas_shipping_fee/);
  for (const src of [page, admin]) assert.match(src, /overseas_remote_area_shipping_fee/);
  assert.match(route, /resolveSubmitShippingGroup\(product, overseasShippingFee > 0\)/);
  assert.match(page, /select\("id, shipping_type, combine_shipping, product_type, badge_type, badge_types"\)/); // 합배송 판정도 배지를 읽어야
  assert.doesNotMatch(page, /resolveShippingGroupFromValue\(item\)/); // 장바구니 줄은 모두 shippingGroupOf 로
  assert.match(page, /overseas: paidShippingGroupsBeforeSubmit\.overseas \|\| appliedShippingFeeBreakdown\.overseasShippingFee > 0/);
});

console.log(`shipping-overseas tests passed (${n})`);
