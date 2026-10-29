// [2026-10-22] 배송비 세 갈래(일반·업체1·업체2) — 사장님 규칙 시뮬레이션
import assert from 'node:assert/strict';
import { resolveShippingGroup, calculateShippingBreakdown, assignRowShippingFees, shippingFeeByGroup, expectedMinimumShipping, EMPTY_PAID_SHIPPING_GROUPS, normalizePaidShippingGroups } from '../lib/shippingGroups.ts';

const S = (normalFee, vendorFee = 4000) => ({ normalFee, normalRemoteFee: 7000, vendorFee, vendorRemoteFee: 7000 });
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

t('갈래 판정: normal / vendor(업체1) / vendor2(업체2) / 옛 값', () => {
  assert.equal(resolveShippingGroup({ shipping_type: 'normal', combine_shipping: 'Y' }), 'normal');
  assert.equal(resolveShippingGroup({ shipping_type: 'vendor', combine_shipping: 'N' }), 'vendor');
  assert.equal(resolveShippingGroup({ shipping_type: 'vendor2', combine_shipping: 'Y' }), 'vendor2'); // 폼이 업체2를 Y 로 저장해도
  assert.equal(resolveShippingGroup({ shipping_type: '업체배송 2' }), 'vendor2');
  assert.equal(resolveShippingGroup({ shipping_type: '업체배송' }), 'vendor');
  assert.equal(resolveShippingGroup({ combine_shipping: 'N' }), 'vendor');
  assert.equal(resolveShippingGroup({}), 'normal');
});

t('일반·업체1·업체2 다 사면 배송비 3번', () => {
  const f = shippingFeeByGroup(S(4000), false);
  const b = calculateShippingBreakdown(['normal', 'vendor', 'vendor2', 'normal'], EMPTY_PAID_SHIPPING_GROUPS, f);
  assert.deepEqual([b.normalShippingFee, b.vendor1ShippingFee, b.vendor2ShippingFee, b.totalShippingFee], [4000, 4000, 4000, 12000]);
});

t('10/18 사례: 기본 배송비 0원(무료배송)이어도 업체 상품엔 업체배송비', () => {
  const f = shippingFeeByGroup(S(0), false);
  assert.equal(calculateShippingBreakdown(['normal'], EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 0);
  assert.equal(calculateShippingBreakdown(['vendor'], EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 4000);
  assert.equal(calculateShippingBreakdown(['normal', 'vendor'], EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 4000);
  assert.equal(calculateShippingBreakdown(['normal', 'vendor', 'vendor2'], EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee, 8000);
});

t('제주·산간: 일반 7,000 / 업체 7,000 (설정값)', () => {
  const f = shippingFeeByGroup(S(4000), true);
  assert.deepEqual(f, { normal: 7000, vendor: 7000, vendor2: 7000, overseas: 0 });
  const f0 = shippingFeeByGroup(S(0), true);
  assert.equal(calculateShippingBreakdown(['vendor2'], EMPTY_PAID_SHIPPING_GROUPS, f0).totalShippingFee, 7000);
});

t('합배송 기간 안 추가 주문: 이미 낸 갈래만 0원(최초 1회)', () => {
  const f = shippingFeeByGroup(S(4000), false);
  const paid = normalizePaidShippingGroups({ normal: true, vendor: true });
  const b = calculateShippingBreakdown(['normal', 'vendor', 'vendor2'], paid, f);
  assert.deepEqual([b.normalShippingFee, b.vendor1ShippingFee, b.vendor2ShippingFee], [0, 0, 4000]);
  // 업체1을 냈다고 업체2가 빠지면 안 됨(예전엔 한 갈래로 봐서 빠졌음)
  assert.equal(calculateShippingBreakdown(['vendor2'], normalizePaidShippingGroups({ vendor: true }), f).totalShippingFee, 4000);
});

t('줄마다 배송비: 갈래 첫 «배송비 대상» 줄에만, 합 = 총 배송비', () => {
  const f = shippingFeeByGroup(S(4000, 5000), false);
  const rows = [
    { group: 'normal', chargeable: false }, // 0원 상품(무료나눔) — 첫 줄로 치지 않음
    { group: 'normal', chargeable: true },
    { group: 'vendor', chargeable: true },
    { group: 'vendor', chargeable: true },
    { group: 'vendor2', chargeable: true },
  ];
  const fees = assignRowShippingFees(rows, EMPTY_PAID_SHIPPING_GROUPS, f);
  assert.deepEqual(fees, [0, 4000, 5000, 0, 5000]);
  const total = calculateShippingBreakdown(rows.filter((r) => r.chargeable).map((r) => r.group), EMPTY_PAID_SHIPPING_GROUPS, f).totalShippingFee;
  assert.equal(fees.reduce((a, b) => a + b, 0), total);
});

t('서버 최소 배송비 검사 = 갈래마다(일반=기본, 업체=업체배송비)', () => {
  assert.equal(expectedMinimumShipping(['normal', 'vendor', 'vendor2'], S(4000)), 12000);
  assert.equal(expectedMinimumShipping(['normal'], S(0)), 0);           // 일반만 + 무료배송 → 검사 안 함
  assert.equal(expectedMinimumShipping(['normal', 'vendor'], S(0)), 4000); // 무료배송이어도 업체분은 받아야
});

console.log(`ALL PASS shipping groups (${n})`);
