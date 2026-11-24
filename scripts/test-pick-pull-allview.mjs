// [2026-11-25] 전체보기 + 기간 필터에서 «옮긴 주문»이 물건챙기기에 빠지던 것 — AdminLiveDashboard pickingBaseOrders 의 전체보기 규칙을 그대로 시뮬
//   설계(10/25): 전체보기엔 원래 주문 그대로(옮긴 줄이 이미 들어 있음 → 가상 묶음 또 넣으면 두 번 셈)
//   보강: 원래 주문이 기간 밖이라 목록에 없을 때만 «넘긴 날짜» 기준으로 가상 묶음을 넣는다.
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const adapter = createUiLoader()('components/admin-live/liveOrderAdapter.ts');
const pull = createUiLoader()('components/admin-live/liveOrderPickPull.ts');

const day = (iso) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const inRange = (iso, from, to) => { const d = day(iso); return d >= from && d <= to; };
// Dashboard 전체보기 규칙과 같은 식(범위 all)
function pickingAllView(rows, from, to) {
  const groups = adapter.buildAdminLiveOrderGroups(rows);
  const orders = groups.map((g) => adapter.toAdminLiveOrder(g));
  const virtual = pull.buildPulledVirtualOrders(groups);
  const base = orders.filter((o) => inRange(o.createdAt, from, to));
  const baseIds = new Set(base.map((o) => String(o.id)));
  const missing = virtual.filter((o) => o.pickPull?.pulledFor && !baseIds.has(String(pull.originalOrderIdOf(o))) && inRange(`${o.pickPull.pulledFor}T12:00:00+09:00`, from, to));
  return [...base, ...missing];
}
const itemsOf = (list) => list.flatMap((o) => (o.items || []).map((it) => String(it.id))).sort();
const row = (id, over = {}) => ({ id, order_lookup_code: 'G1', youtube_nickname: '행복나무', customer_name: '김행복', customer_phone: '01012345678', created_at: '2026-11-10T15:30:00+09:00', product_name: `상품${id}`, color: '블랙', size: 'M', qty: 1, product_price: 10000, adjusted_product_price: 10000, total_price: 20000, adjusted_total_price: 20000, final_amount: 20000, shipping_fee: 0, admin_order_status_v2: '수동입금확인', order_manage_status: '수동입금확인', ...over });
const moved = { pick_pulled_at: '2026-11-24T09:00:00+09:00', pick_pulled_for: '2026-11-24', pick_pulled_reason: '늦게 입고', pick_pulled_target: '11.24(화) 쇼핑몰 주문' };

// 1) 주문서 전부를 11.10 → 11.24 로 옮김, 기간 11.24~11.24 → 예전엔 0줄(버그), 이제 2줄
const whole = [row(1, moved), row(2, moved)];
assert.deepEqual(itemsOf(pickingAllView(whole, '2026-11-24', '2026-11-24')), ['1', '2'], '옮긴 날 기간에 보임');
// 2) 같은 주문, 기간 11.10 → 원래 주문 그대로(전체보기엔 그대로 — 10/25 설계)
assert.deepEqual(itemsOf(pickingAllView(whole, '2026-11-10', '2026-11-10')), ['1', '2']);
// 3) 기간이 둘 다 포함(11.01~11.30) → 두 번 세지 않음
assert.deepEqual(itemsOf(pickingAllView(whole, '2026-11-01', '2026-11-30')), ['1', '2'], '중복 없음');
// 4) 일부 줄만 옮김(2번만), 기간 11.24 → 옮긴 2번 줄만
const part = [row(1), row(2, moved)];
assert.deepEqual(itemsOf(pickingAllView(part, '2026-11-24', '2026-11-24')), ['2']);
// 5) 일부 줄만 옮김, 기간 11.01~11.30 → 원래 주문(1·2)만, 2번 두 번 안 셈
assert.deepEqual(itemsOf(pickingAllView(part, '2026-11-01', '2026-11-30')), ['1', '2'], '일부 옮김도 중복 없음');
// 6) 옮김 없는 주문은 예전 그대로
assert.deepEqual(itemsOf(pickingAllView([row(1), row(2)], '2026-11-24', '2026-11-24')), [], '기간 밖 일반 주문은 안 보임');
console.log('test-pick-pull-allview: ok');
