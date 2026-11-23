// node scripts/test-subscribe-redeem.mjs
// 구독 무배 수동 사용 기록 — 가짜 DB 로 실제 라우트 함수 실행(운영 무접촉)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader({
  "@supabase/supabase-js": { createClient: () => ({}) },
  "next/server": { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  "@/lib/admin-auth": { verifyAdminSessionFromRequest: async () => ({ ok: true }) },
});
const { redeemSubscribeForOrder } = load("app/api/admin-live/subscribe-redeem/route.ts");

function fakeDb(orders, redemptions, customers = []) {
  const log = [];
  const api = {
    from(table) {
      const q = { table, filters: [], op: "select", payload: null };
      const chain = {
        select() { q.op = q.op === "select" ? "select" : q.op; return chain; },
        insert(p) { q.op = "insert"; q.payload = p; return chain; },
        update(p) { q.op = "update"; q.payload = p; return chain; },
        delete() { q.op = "delete"; return chain; },
        in(col, vals) { q.filters.push((r) => vals.includes(r[col])); return chain; },
        eq(col, v) { q.filters.push((r) => r[col] === v); return chain; },
        is(col, v) { q.filters.push((r) => r[col] === v); return chain; },
        limit() { return chain; },
        maybeSingle() { return run(true); },
        then(res, rej) { return run(false).then(res, rej); },
      };
      const run = async (single) => {
        const rows = table === "orders" ? orders : table === "customers" ? customers : redemptions;
        const hit = rows.filter((r) => q.filters.every((f) => f(r)));
        if (q.op === "insert") { if (redemptions.some((r) => r.kakao_id === q.payload.kakao_id)) return { error: { message: "duplicate key" } }; redemptions.push({ ...q.payload }); log.push(["insert", q.payload]); return { error: null }; }
        if (q.op === "update") { hit.forEach((r) => Object.assign(r, q.payload)); log.push(["update", table, hit.length, q.payload]); return { error: null }; }
        if (q.op === "delete") { for (const r of hit) rows.splice(rows.indexOf(r), 1); log.push(["delete", table, hit.length]); return { error: null }; }
        return { data: single ? hit[0] ?? null : hit, error: null };
      };
      return chain;
    },
    log,
  };
  return api;
}

const base = () => [
  { id: 1, order_group_id: "G1", kakao_id: "k1", youtube_nickname: "손님", is_test_order: false, is_deleted: false, subscribe_promo_redemption: false, subscribe_free_ship_at: null, shipping_fee: 0 },
  { id: 2, order_group_id: "G1", kakao_id: "k1", youtube_nickname: "손님", is_test_order: false, is_deleted: false, subscribe_promo_redemption: false, subscribe_free_ship_at: null, shipping_fee: 0 },
];

// 1) 수동 기록 → redemption 1줄 + 표시만, 배송비 무접촉
{
  const orders = base(); const red = []; const db = fakeDb(orders, red);
  const r = await redeemSubscribeForOrder(db, [1, 2], "redeem");
  assert.equal(r.ok, true);
  assert.deepEqual(red, [{ kakao_id: "k1", order_group_id: "G1" }]);
  assert.ok(orders.every((o) => o.subscribe_free_ship_at && o.shipping_fee === 0));
  assert.ok(db.log.every(([op, t, , p]) => !(op === "update" && p && ("shipping_fee" in p || "adjusted_shipping_fee" in p || "final_amount" in p))), "돈 칸 무접촉");
  // 2) 같은 주문 한 번 더 → 이미 기록
  const r2 = await redeemSubscribeForOrder(db, [1], "redeem");
  assert.equal(r2.ok, true); assert.equal(r2.already, true); assert.equal(red.length, 1);
  // 3) 되돌리기(수동 기록만) → 지움
  const r3 = await redeemSubscribeForOrder(db, [1], "undo");
  assert.equal(r3.ok, true); assert.equal(red.length, 0); assert.ok(orders.every((o) => o.subscribe_free_ship_at === null));
}
// 4) 다른 주문으로 이미 쓴 손님 → 409
{
  const db = fakeDb(base(), [{ kakao_id: "k1", order_group_id: "OLD" }]);
  const r = await redeemSubscribeForOrder(db, [1], "redeem");
  assert.equal(r.ok, false); assert.equal(r.status, 409);
}
// 5) 손님이 직접 인증해 받은 주문은 되돌리기 거절
{
  const orders = base(); orders.forEach((o) => { o.subscribe_promo_redemption = true; });
  const db = fakeDb(orders, [{ kakao_id: "k1", order_group_id: "G1" }]);
  const r = await redeemSubscribeForOrder(db, [1], "undo");
  assert.equal(r.ok, false); assert.match(r.message, /되돌릴 수 없어요/);
}
// 6) 테스트 주문·카카오 없음·주문서 2개 섞임 거절
{
  const o1 = base(); o1[0].is_test_order = true;
  assert.equal((await redeemSubscribeForOrder(fakeDb(o1, []), [1], "redeem")).ok, false);
  const o2 = base(); o2.forEach((o) => { o.kakao_id = null; });
  assert.equal((await redeemSubscribeForOrder(fakeDb(o2, []), [1], "redeem")).ok, false);
  // 7) 주문 줄 kakao_id 빈 문자열이어도 회원 표(전화)에서 찾아 기록
  const o4 = base(); o4.forEach((o) => { o.kakao_id = ""; o.customer_phone = "01011112222"; });
  const red4 = []; const r4 = await redeemSubscribeForOrder(fakeDb(o4, red4, [{ kakao_id: "k9", customer_phone: "01011112222" }]), [1], "redeem");
  assert.equal(r4.ok, true); assert.deepEqual(red4, [{ kakao_id: "k9", order_group_id: "G1" }]);
  const o3 = base(); o3[1].order_group_id = "G2";
  assert.equal((await redeemSubscribeForOrder(fakeDb(o3, []), [1, 2], "redeem")).ok, false);
}
console.log("test-subscribe-redeem OK");
