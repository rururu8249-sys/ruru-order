// [2026-11-15] 추가 입금 연결 — 규칙 + 실제 라우트(가짜 DB)로 위험 상황 시뮬레이션
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

// ── 가짜 DB ──
function makeDb(state) {
  return {
    from(table) {
      const ctx = { table, f: [], patch: null, sel: false, lim: null };
      const rows = () => state[table];
      const match = (r) => ctx.f.every(([op, c, v]) => {
        const x = r[c];
        if (op === "eq") return String(x) === String(v);
        if (op === "neq") return x !== v;
        if (op === "is") return v === null ? x === null || x === undefined : x === v;
        if (op === "in") return v.map(String).includes(String(x));
        if (op === "gte") return String(x) >= String(v);
        if (op === "ilike") return String(x ?? "").includes(String(v).replace(/[%*]/g, ""));
        return true;
      });
      const api = {
        select() { ctx.sel = true; return api; },
        eq(c, v) { ctx.f.push(["eq", c, v]); return api; },
        neq(c, v) { ctx.f.push(["neq", c, v]); return api; },
        is(c, v) { ctx.f.push(["is", c, v]); return api; },
        in(c, v) { ctx.f.push(["in", c, v]); return api; },
        gte(c, v) { ctx.f.push(["gte", c, v]); return api; },
        ilike(c, v) { ctx.f.push(["ilike", c, v]); return api; },
        or() { return api; },
        order() { return api; },
        limit(n) { ctx.lim = n; return api; },
        range() { return api; },
        update(p) { ctx.patch = p; return api; },
        then(res, rej) {
          return Promise.resolve().then(() => {
            if (state.failNextUpdate && ctx.patch) { state.failNextUpdate = false; return { data: [], error: null }; }
            const hit = rows().filter(match);
            if (ctx.patch) { for (const r of hit) Object.assign(r, ctx.patch); return { data: ctx.sel ? hit.map((r) => ({ id: r.id })) : null, error: null }; }
            return { data: ctx.lim ? hit.slice(0, ctx.lim) : hit, error: null };
          }).then(res, rej);
        },
      };
      return api;
    },
  };
}

let state;
const NextResponse = { json: (body, init = {}) => ({ status: init.status ?? 200, body }) };
const load = createUiLoader({
  "next/server": { NextResponse },
  "@supabase/supabase-js": { createClient: () => makeDb(state) },
  "@/lib/admin-auth": { verifyAdminSessionFromRequest: async () => ({ sub: "t" }) },
});
process.env.NEXT_PUBLIC_SUPABASE_URL = "x"; process.env.SUPABASE_SERVICE_ROLE_KEY = "y";
const L = load("lib/extraDeposit.ts");
const route = load("app/api/admin-live/order-extra-deposit/route.ts");

const req = (method, body, search = "") => ({
  method,
  nextUrl: { origin: "https://a", searchParams: new URLSearchParams(search) },
  headers: { get: (k) => (k === "origin" ? "https://a" : null) },
  json: async () => body,
});

function fresh() {
  state = {
    orders: [
      // 씩씩이: BB-58(194,000) 지움 → BB-60(199,000-1,000 포인트?) 실제는 총 198,000
      { id: 6889, order_group_id: "G1", order_lookup_code: "RURU-MWFQVZVV", youtube_nickname: "씩씩이", customer_name: "최영숙", customer_id: 9, payment_method: "무통장입금", admin_order_status_v2: "자동입금확인", order_manage_status: "자동입금확인", final_amount: 198000, is_deleted: false },
      { id: 7000, order_group_id: "G2", youtube_nickname: "카드손님", payment_method: "카드", admin_order_status_v2: "카드결제완료", final_amount: 50000, is_deleted: false },
      { id: 7100, order_group_id: "G3", youtube_nickname: "미입금", payment_method: "무통장입금", admin_order_status_v2: "미입금", final_amount: 30000, is_deleted: false },
      { id: 7200, order_group_id: "G4", youtube_nickname: "없이확인", payment_method: "무통장입금", admin_order_status_v2: "수동입금확인", final_amount: 40000, is_deleted: false },
    ],
    deposits: [
      { id: 1, depositor_name: "씩씩이", amount: 194000, match_order_group_id: "G1", match_status: "자동입금확인", confirmed_at: "2026-11-14", confirmed_note: "자동", created_at: "2026-11-14" },
      { id: 2, depositor_name: "씩씩이", amount: 4000, match_order_group_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null, created_at: "2026-11-15" },
      { id: 3, depositor_name: "다른사람", amount: 4000, match_order_group_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null, created_at: "2026-11-15" },
      { id: 4, depositor_name: "씩씩이", amount: 1, match_order_group_id: null, match_status: "처리완료", confirmed_at: null, confirmed_note: "정리: 인증(1원 등)", created_at: "2026-11-15" },
    ],
  };
}

// ① 규칙
fresh();
assert.equal(L.extraDepositOrderBlock(state.orders.filter((o) => o.order_group_id === "G1")), null);
assert.match(L.extraDepositOrderBlock(state.orders.filter((o) => o.order_group_id === "G2")), /카드/);
assert.match(L.extraDepositOrderBlock(state.orders.filter((o) => o.order_group_id === "G3")), /입금확인 전/);
const ranked = L.rankExtraDeposits(state.deposits, ["씩씩이", "최영숙"], 4000);
assert.equal(ranked[0].id, 2, "이름 같고 금액=부족액이 맨 위");
assert.ok(!ranked.some((d) => d.id === 4), "정리한 입금은 후보 아님");
assert.ok(!ranked.some((d) => d.id === 1), "이미 연결된 입금은 후보 아님");
const list = L.buildShortageList(state.orders, state.deposits);
assert.deepEqual(list.map((x) => [x.groupId, x.shortage]), [["G1", 4000]], "입금 없이 확인(G4)·카드·미입금은 목록에 안 나옴");

// 포인트로 전부 낸 줄(final 0)은 0원 — 운영 에이치더블 모양
assert.equal(L.orderGroupTotal([{ final_amount: 0, adjusted_total_price: 39000, admin_order_status_v2: "수동입금확인" }, { final_amount: 38000, adjusted_total_price: 39000, admin_order_status_v2: "수동입금확인" }]), 38000);
assert.equal(L.buildShortageList([
  { order_group_id: "H", payment_method: "무통장입금", admin_order_status_v2: "수동입금확인", final_amount: 0, adjusted_total_price: 39000 },
  { order_group_id: "H", payment_method: "무통장입금", admin_order_status_v2: "수동입금확인", final_amount: 38000, adjusted_total_price: 39000 },
], [{ match_order_group_id: "H", amount: 38000 }]).length, 0, "딱 맞는 주문은 부족 목록에 안 나옴");

// ② GET 후보
let r = await route.GET(req("GET", null, "groupId=G1"));
assert.equal(r.body.shortage, 4000);
assert.equal(r.body.candidates[0].id, 2);

// ③ 연결 → 딱 맞음, 주문은 한 칸도 안 바뀜
const before = JSON.stringify(state.orders);
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2], selectedTotal: 4000 }));
assert.equal(r.status, 200); assert.equal(r.body.kind, "exact");
assert.equal(JSON.stringify(state.orders), before, "orders 무변경");
assert.equal(state.deposits.find((d) => d.id === 2).match_order_group_id, "G1");
assert.equal(L.buildShortageList(state.orders, state.deposits).length, 0, "붙이면 부족 목록에서 빠짐");

// ④ 같은 입금 두 번(다른 화면) → 거절
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2] }));
assert.equal(r.status, 409);

// ⑤ 연결 취소 → 다시 미확인, 원래 입금(1)은 못 뗌
r = await route.POST(req("POST", { groupId: "G1", depositIds: [1], action: "unlink" }));
assert.equal(r.status, 409, "원래 자동확인 입금은 떼지 않음");
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2], action: "unlink" }));
assert.equal(r.status, 200);
assert.equal(state.deposits.find((d) => d.id === 2).match_status, "미확인");

// ⑥ 위험 상황들
fresh();
r = await route.POST(req("POST", { groupId: "G2", depositIds: [2] })); assert.equal(r.status, 409, "카드 주문 거절");
r = await route.POST(req("POST", { groupId: "G3", depositIds: [2] })); assert.equal(r.status, 409, "미입금 주문 거절(입금매칭으로)");
r = await route.POST(req("POST", { groupId: "G4", depositIds: [2] })); assert.equal(r.status, 409, "입금 없이 확인한 주문 거절");
r = await route.POST(req("POST", { groupId: "G1", depositIds: [4] })); assert.equal(r.status, 409, "정리한 입금 거절");
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2], selectedTotal: 5000 })); assert.equal(r.status, 400, "화면 금액 다르면 거절");
// 두 건 같이 붙이기
state.deposits.push({ id: 5, depositor_name: "씩씩이", amount: 1000, match_order_group_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null, created_at: "2026-11-15" });
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2, 5], selectedTotal: 5000 }));
assert.equal(r.status, 200, "두 건 같이 붙이기");
r = await route.GET(req("GET", null, "groupId=G1"));
assert.equal(r.body.linkedSum, 199000);
assert.equal(r.body.shortage, 0, "더 받은 경우 부족 0 (주문상세에서 「더 냈어요」 → 포인트)");

// 다른 화면이 중간에 먼저 처리 → 앞에 붙인 것까지 되돌림
fresh();
state.deposits.push({ id: 5, depositor_name: "씩씩이", amount: 1000, match_order_group_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null, created_at: "2026-11-15" });
const d2 = state.deposits.find((d) => d.id === 2);
let armed = false;
state.deposits[state.deposits.indexOf(d2)] = new Proxy(d2, { set(t, k, v) { t[k] = v; if (k === "confirmed_note" && v && !armed) { armed = true; state.failNextUpdate = true; } return true; } });
r = await route.POST(req("POST", { groupId: "G1", depositIds: [2, 5] }));
assert.equal(r.status, 409, "중간 실패 → 409");
assert.equal(state.deposits.find((d) => d.id === 2).match_order_group_id, null, "앞에 붙인 입금도 되돌림");
assert.equal(state.deposits.find((d) => d.id === 2).match_status, "미확인");

// ⑦ 브랜드 묶음 저장 모양
const B = load("lib/brandDetailOrderRow.ts");
const note = { brand_group: { enabled: true }, stock_management_enabled: false };
assert.deepEqual(B.splitBrandDetailForOrder({ note, productName: "버버리", color: "BB-60 / 없음", detailNames: ["BB-6", "BB-60"] }), { productName: "BB-60", color: "", changed: true }, "긴 이름 먼저(BB-6 과 헷갈리지 않음)");
assert.deepEqual(B.splitBrandDetailForOrder({ note, productName: "버버리", color: "BB-507 블랙(위틀리) / 블랙", detailNames: ["BB-507 블랙(위틀리)"] }).color, "블랙");
assert.equal(B.splitBrandDetailForOrder({ note: { ...note, stock_management_enabled: true }, productName: "버버리", color: "BB-60 / 없음", detailNames: ["BB-60"] }).changed, false, "재고 세는 묶음은 그대로(재고 키)");
assert.equal(B.splitBrandDetailForOrder({ note: {}, productName: "니트", color: "블랙", detailNames: [] }).changed, false, "일반 상품 그대로");

// ⑧ 복사 문구
const C = load("components/admin-live/liveOrderCustomerCopy.ts");
const order = { nickname: "씩씩이", name: "최영숙", items: [{ productName: "BB-60", color: "없음", size: "L", qty: 1 }, { productName: "BB-507 블랙(위틀리)", color: "", size: "XL", qty: 2 }] };
assert.equal(C.buildOrderItemsCopyText(order), "씩씩이 (최영숙) 주문내용\n- BB-60 (사이즈 L) 1개\n- BB-507 블랙(위틀리) (사이즈 XL) 2개\n총 3개");
assert.ok(!/원|계좌|주소/.test(C.buildOrderItemsCopyText(order)), "주문내용 복사엔 금액·계좌·주소 없음");
assert.equal(C.buildManyOrderItemsCopyText([order, { nickname: "A", name: "A", items: [{ productName: "X", color: "", size: "", qty: 1 }] }]).split("\n\n").length, 2);

console.log("PASS extra deposit — 규칙·후보·연결·딱맞음·중복·연결취소·카드/미입금/입금없이확인/정리입금 거절·중간실패 되돌림 / 브랜드 묶음 저장 모양 / 주문내용 복사");
