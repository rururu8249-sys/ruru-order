// [2026-10-22] 환불·반품 줄 취소선 판정(표시 전용) + 고객이슈 삭제 ↔ 주문 반품 기록 연동(clear-record 라우트)
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const lib = createUiLoader()('lib/orderIssueMarks.ts');
const { issueMarkKind, isStrikeKind, issueTargetItemIds, targetTextFromReturnReason } = lib;

assert.equal(issueMarkKind({ task_type: 'refund' }), '환불');
assert.equal(issueMarkKind({ task_type: 'exchange' }), '교환');
assert.equal(issueMarkKind({ task_type: 'general', returnStatus: '반품(환불)' }), '환불');
assert.equal(issueMarkKind({ returnStatus: '반품(교환)' }), '교환');
assert.equal(issueMarkKind({ raw_payload: { issue_types: ['반품'] } }), '반품');
assert.equal(issueMarkKind({ task_type: 'general' }), '기타');
assert.ok(isStrikeKind('환불') && isStrikeKind('반품') && !isStrikeKind('교환') && !isStrikeKind('기타'));

const items = [
  { id: '1', productId: '677', productName: '꼼데 쭈리바지', color: '그레이', size: 'M', qty: 1 },
  { id: '2', productId: '677', productName: '꼼데 쭈리바지', color: '블랙', size: 'M', qty: 1 },
  { id: '3', productId: '12', productName: '폴로 셔츠', color: '없음', size: 'L', qty: 2 },
];
// ① raw_payload.items 로 엄격 매칭 — 같은 브랜드(677) 다른 색은 안 잡힘
assert.deepEqual(issueTargetItemIds(items, { raw_payload: { items: [{ productId: '677', productName: '꼼데 쭈리바지', color: '그레이', size: 'M', qty: 1 }] } }), ['1']);
// ② 대상상품 글자(return_reason) 로
assert.equal(targetTextFromReturnReason('[반품(환불)] 대상: 꼼데 쭈리바지(그레이/M)×1\n세부: 물건챙기기전'), '꼼데 쭈리바지(그레이/M)×1');
assert.deepEqual(issueTargetItemIds(items, { targetText: '꼼데 쭈리바지(그레이/M)×1' }), ['1']);
assert.deepEqual(issueTargetItemIds(items, { targetText: '폴로 셔츠(L)×2, 꼼데 쭈리바지(블랙/M)×1' }), ['2', '3']);
// ③ 못 고르면 빈 배열(엉뚱한 줄에 안 긋는다)
assert.deepEqual(issueTargetItemIds(items, { targetText: '없는 상품×1' }), []);
assert.deepEqual(issueTargetItemIds(items, {}), []);

// ── clear-record 라우트 시뮬 ──
const tasks = new Map([
  ['t1', { id: 't1', created_at: '2026-10-20T10:00:00Z', status: 'deleted', body: '주문번호: RURU-A\n대상상품: 꼼데', source: 'order_return_flow' }],
  ['t2', { id: 't2', created_at: '2026-10-21T10:00:00Z', status: 'open', body: '주문번호: RURU-A\n대상상품: 폴로', source: 'order_return_flow' }],
  ['t3', { id: 't3', created_at: '2026-10-21T10:00:00Z', status: 'deleted', body: '주문번호: RURU-B', source: 'manual' }],
]);
const orders = [
  { id: 1, order_lookup_code: 'RURU-A', is_deleted: false, return_status: '반품(환불)', total_price: 1000 },
  { id: 2, order_lookup_code: 'RURU-A', is_deleted: false, return_status: '반품(환불)', total_price: 1000 },
];
const touched = new Set();
const fake = { from(table) { return {
  select() { const q = {
    eq(col, v) { q._f = (r) => String(r[col]) === String(v); return q; },
    ilike(col, pat) { const needle = pat.replace(/%/g, ''); q._g = (r) => String(r[col]).includes(needle); return q; },
    maybeSingle() { return Promise.resolve({ data: [...tasks.values()].find((t) => q._f(t)) || null, error: null }); },
    then(res) { const src = table === 'admin_tasks' ? [...tasks.values()] : orders; res({ data: src.filter((r) => (!q._f || q._f(r)) && (!q._g || q._g(r))), error: null }); },
  }; return q; },
  update(patch) { return { in(col, ids) { for (const r of orders) if (ids.includes(r[col])) { Object.assign(r, patch); Object.keys(patch).forEach((k) => touched.add(k)); } return Promise.resolve({ error: null }); } }; },
}; } };
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
const json = (body, init) => ({ body, status: init?.status ?? 200 });
const route = createUiLoader({ '@supabase/supabase-js': { createClient: () => fake }, '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => true }, 'next/server': { NextResponse: { json } } })('app/api/admin-live/order-return/clear-record/route.ts');
const call = (body) => route.POST({ json: async () => body });
// t1(옛 이슈) 삭제 — 더 최신 t2 가 살아 있으니 기록 유지
let r = await call({ taskId: 't1' });
assert.equal(r.body.cleared, false); assert.equal(r.body.reason, 'newer_issue_alive'); assert.equal(orders[0].return_status, '반품(환불)');
// 수동 이슈(order_return_flow 아님) — 할 일 없음
r = await call({ taskId: 't3' }); assert.equal(r.body.cleared, false); assert.equal(r.body.reason, 'not_return_flow');
// t2(최신) 삭제됨 → 기록 비움(돈 칸 무접촉)
tasks.get('t2').status = 'deleted';
r = await call({ taskId: 't2' });
assert.equal(r.body.cleared, true); assert.equal(r.body.rowCount, 2);
assert.equal(orders[0].return_status, null); assert.equal(orders[1].return_status, null);
assert.equal(orders[0].total_price, 1000);
assert.deepEqual([...touched].sort(), ['return_amount', 'return_reason', 'return_status', 'return_updated_at']);
r = await call({}); assert.equal(r.status, 400);
const noAuth = createUiLoader({ '@supabase/supabase-js': { createClient: () => fake }, '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => false }, 'next/server': { NextResponse: { json } } })('app/api/admin-live/order-return/clear-record/route.ts');
assert.equal((await noAuth.POST({ json: async () => ({ taskId: 't2' }) })).status, 401);
console.log('test-order-issue-marks: ok');
