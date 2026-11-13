// [2026-11-13] 자동 테스트 주문 — 상품/옵션 고르기·주문 줄·저장 확인·실행 흐름(가짜 DB+가짜 주소)·잠금·삭제 안전장치
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const A = load("lib/autoTestOrder.ts");
const S = load("lib/autoTestOrderServer.ts");

// ── 고를 수 있는 상품: 재고 관리 상품·숨김·0원·구매제한은 빼고, 브랜드 묶음은 세부상품 단가(추가금)·품절 체크 반영
const simple = { id: 10, product_name: "니트", price: 30000, color_options: ["블랙", "화이트"], size_options: ["M"], product_note: {} };
const stockOn = { id: 11, product_name: "재고상품", price: 30000, product_note: { stock_management_enabled: true, stock_variants: [{ color: "블랙", size: "M", stock: 3 }] } };
const hidden = { id: 12, product_name: "숨김", price: 30000, status: "숨김", product_note: {} };
const brand = { id: 20, product_name: "프라다", price: 100000, product_note: {
  brand_group: { enabled: true, detail_options: { "PD-1": { colors: ["블랙"], sizes: ["S", "M"] }, "PD-2": { colors: [], sizes: [] }, "PD-3": { colors: ["레드"], sizes: ["S"] } } },
  option_pricing: { "PD-1": 20000 }, combo_hidden: ["PD-3"],
  stock_variants: [{ color: "PD-1 / 블랙", size: "S", manual_soldout: true }],
} };
assert.equal(A.productChoices(stockOn, false).length, 0);
assert.equal(A.productChoices(hidden, false).length, 0);
assert.equal(A.productChoices({ ...simple, price: 0 }, false).length, 0);
assert.equal(A.productChoices({ ...simple, product_note: { purchase_limit_enabled: true } }, false).length, 0);
assert.deepEqual(A.productChoices(simple, false).map((c) => `${c.color}/${c.size}`), ["블랙/M", "화이트/M"]);
const bc = A.productChoices(brand, false);
assert.deepEqual(bc.map((c) => `${c.productName}|${c.color}|${c.size}|${c.unitPrice}`), ["PD-1|블랙|M|120000", "PD-2|없음||100000"]);

// ── 테스트 상품 기준: 11/6 이후 주문 있었던 것만 · 다이슨 항상 · 샘플할인 제외
const fc = A.filterTestChoices([
  { productName: "PD-1" }, { productName: "PD-2" }, { productName: "다이슨 에어랩HS05-2세대" }, { productName: "PD-507 베이지 샘플할인" },
], new Set(["PD-1", "PD-507 베이지 샘플할인"]));
assert.deepEqual(fc.map((c) => c.productName), ["PD-1", "다이슨 에어랩HS05-2세대"]);

// ── 1~3개, 서로 다른 상품, 수량 1~3
for (let i = 0; i < 50; i += 1) {
  const lines = A.pickOrderLines([...A.productChoices(simple, false), ...bc]);
  assert.ok(lines.length >= 1 && lines.length <= 3);
  assert.equal(new Set(lines.map((l) => `${l.productId}|${l.productName}`)).size, lines.length);
  for (const l of lines) assert.ok(l.qty >= 1 && l.qty <= 3);
}

// ── 300개 목록: test 글자 없음·서로 다름·섞어 고름
const N = load("lib/autoTestNicknames.ts");
assert.equal(N.AUTO_TEST_NICKNAME_POOL.length, 300);
assert.equal(new Set(N.AUTO_TEST_NICKNAME_POOL).size, 300);
for (const n of N.AUTO_TEST_NICKNAME_POOL) assert.ok(!/test|테스트/i.test(n), n);
assert.notDeepEqual(N.pickNicknameCandidates(300).slice(0, 10), N.pickNicknameCandidates(300).slice(0, 10));
// 화면 방식 주문(운영자 테스트 계정 사유)도 자동 테스트로 봄, 사람 테스트 주문은 아님
assert.equal(A.isAutoTestRow({ is_test_order: true, test_order_reason: "운영자 테스트 계정 주문", operator_test_phone: A.AUTO_TEST_PHONE }), true);
assert.equal(A.isAutoTestRow({ is_test_order: true, test_order_reason: "운영자 테스트 계정 주문", operator_test_phone: "01087852465" }), false);
assert.equal(A.isAutoTestRow({ is_test_order: false, test_order_reason: "자동 테스트" }), false);

// ── 닉네임: test 글자 없음·서로 다름
const nicks = A.nicknameCandidates(30);
assert.equal(new Set(nicks).size, nicks.length);
for (const n of nicks) assert.ok(!/test|테스트/i.test(n), n);

// ── 주문 줄: 배송비는 갈래마다 첫 줄에만·카드면 추가금·테스트 표시
const settings = { shipping: { normalFee: 4000, normalRemoteFee: 6000, vendorFee: 4000, vendorRemoteFee: 7000, overseasFee: 0 }, customerCardRate: 10, actualCardRate: 7, cardMinAmount: 100000 };
const lines = [{ ...A.productChoices(simple, false)[0], qty: 2 }, { ...bc[0], qty: 1 }];
const rows = A.buildOrderRows({ lines, paymentMethod: "카드결제", nickname: "포근한고양이123", groupId: "g1", lookupCode: "RURU-X", broadcast: { id: "b1", title: "방송", subtitle: "" }, settings });
assert.equal(rows[0].shipping_fee, 4000); assert.equal(rows[1].shipping_fee, 0);
assert.equal(rows[0].total_price, 60000 + 4000 + 6400);
assert.equal(rows[1].total_price, 120000 + 12000);
assert.ok(rows.every((r) => r.is_test_order === true && r.test_order_reason === "자동 테스트" && r.exclude_from_settlement === true));
// 카드 최소 금액 못 넘으면 무통장
assert.equal(A.choosePayment([{ ...A.productChoices(simple, false)[0], qty: 1 }], settings, () => 0.9), "무통장입금");
assert.equal(A.choosePayment(lines, settings, () => 0.9), "카드결제");

// ── 저장 확인
assert.deepEqual(A.verifySavedRows(rows, rows.map((r) => ({ ...r }))), []);
assert.ok(A.verifySavedRows(rows, [rows[0]]).length > 0);
assert.ok(A.verifySavedRows(rows, rows.map((r) => ({ ...r, youtube_nickname: "다른이름" }))).some((p) => p.includes("닉네임")));

// ── 가짜 DB
function fakeDb(tables) {
  return {
    tables,
    from(name) {
      tables[name] ||= [];
      let filters = [];
      let op = "select", payload = null, single = false;
      const match = (r) => filters.every((f) => f(r));
      const run = () => {
        const t = tables[name];
        if (op === "insert") { const add = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: t.length + i + 1, ...r })); t.push(...add); return { data: add, error: null }; }
        if (op === "update") { const hit = t.filter(match); hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
        if (op === "delete") { const hit = t.filter(match); tables[name] = t.filter((r) => !match(r)); return { data: hit, error: null }; }
        const hit = t.filter(match);
        return { data: single ? hit[0] ?? null : hit, error: null, count: hit.length };
      };
      const q = {
        select() { return q; }, insert(p) { op = "insert"; payload = p; return q; }, update(p) { op = "update"; payload = p; return q; }, delete() { op = "delete"; return q; },
        eq(k, v) { filters.push((r) => String(r[k]) === String(v)); return q; },
        neq(k, v) { filters.push((r) => String(r[k]) !== String(v)); return q; },
        gte(k, v) { filters.push((r) => String(r[k] ?? "") >= String(v)); return q; },
        in(k, vs) { filters.push((r) => vs.map(String).includes(String(r[k]))); return q; },
        order() { return q; }, limit() { return q; },
        maybeSingle() { single = true; return q; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
  };
}

const tables = {
  settings: [], customers: [{ id: "c1", youtube_nickname: "포근한고양이100" }], orders: [{ id: 1, youtube_nickname: "기존손님", order_group_id: "real", is_test_order: false },
    { id: 2, product_name: "니트", created_at: "2026-11-07T01:00:00.000Z", is_test_order: false, order_group_id: "r2" },
    { id: 3, product_name: "PD-1", created_at: "2026-11-08T01:00:00.000Z", is_test_order: false, order_group_id: "r3" },
    { id: 4, product_name: "PD-2", created_at: "2026-11-01T01:00:00.000Z", is_test_order: false, order_group_id: "r4" }],
  broadcasts: [{ id: "b1", status: "ON", is_deleted: false, broadcast_public_title: "테스트방송" }],
  broadcast_products: [{ broadcast_id: "b1", product_id: 10 }, { broadcast_id: "b1", product_id: 11 }, { broadcast_id: "b1", product_id: 20 }],
  products: [simple, stockOn, brand], inventory_ledger: [], live_chat_messages: [],
};
const db = fakeDb(tables);
const calls = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  if (url.endsWith("/api/cart-reservations")) {
    return { status: 200, json: async () => ({ ok: true, results: body.items.map((it) => ({ ...it, ok: true })) }) };
  }
  // 주문 저장 RPC 처럼 받은 줄을 그대로 저장
  db.tables.orders.push(...body.orderRows.map((r, i) => ({ id: 100 + db.tables.orders.length + i, ...r })));
  return { status: 200, json: async () => ({ ok: true }) };
};

// 꺼져 있으면 cron 은 아무것도 안 함
assert.equal((await S.autoTestTick(db, "https://x")).reason, "off");
await S.setAutoTestEnabled(db, true);
const st = await S.readAutoTestState(db);
assert.ok(st.enabled && st.nextRunAt > Date.now() + 4.9 * 60_000 && st.nextRunAt <= Date.now() + 10 * 60_000 + 1000);
assert.equal((await S.autoTestTick(db, "https://x")).reason, "waiting");
assert.equal(calls.length, 0);

// 지금 테스트 → 담기 → 제출 → 저장 확인
const last = await S.autoTestRunNow(db, "https://x");
assert.equal(last.ok, true, last.message);
assert.equal(calls.length, 2);
assert.ok(calls[0].url.endsWith("/api/cart-reservations") && calls[1].url.endsWith("/api/customer-orders/submit"));
assert.equal(calls[1].body.cart_session_key, calls[0].body.sessionKey);
assert.ok(calls[1].body.orderRows.every((r) => String(r.product_id) !== "11"), "재고 관리 상품은 안 고름");
assert.ok(calls[1].body.orderRows.every((r) => r.product_name !== "PD-2"), "11/6 전에만 주문된 상품은 안 고름");
const cust = tables.customers.find((c) => c.kakao_id === A.AUTO_TEST_KAKAO_ID);
assert.equal(cust.youtube_nickname, last.nickname);
assert.equal(cust.live_alert_optin, false);
// 다음 테스트 닉네임은 달라야 함(이전 닉네임 안 남음)
const last2 = await S.autoTestRunNow(db, "https://x");
assert.equal(last2.ok, true); assert.notEqual(last2.nickname, last.nickname);
assert.equal((await S.readAutoTestState(db)).lockUntil, 0);

// 잠금 중이면 두 번째 실행 거절
const raw = tables.settings[0];
const locked = JSON.parse(raw.value); locked.lockUntil = Date.now() + 60_000; raw.value = JSON.stringify(locked);
assert.equal((await S.autoTestRunNow(db, "https://x")).ok, false);
locked.lockUntil = 0; locked.nextRunAt = Date.now() - 1; raw.value = JSON.stringify(locked);
// 시간 된 cron 은 실행하고 다음 시간을 다시 잡음
const t = await S.autoTestTick(db, "https://x");
assert.equal(t.ran, true);
assert.ok((await S.readAutoTestState(db)).nextRunAt > Date.now());
// 방송이 꺼지면 쉼(꺼짐 아님)
tables.broadcasts[0].status = "OFF";
assert.equal((await S.autoTestTick(db, "https://x")).reason, "no-broadcast");
assert.equal((await S.readAutoTestState(db)).enabled, true);
tables.broadcasts[0].status = "ON";

// ── 삭제: 자동 테스트 주문서만. 일반 주문 섞인 주문서·재고 기록 있는 주문서는 건너뜀
const testGroups = [...new Set(tables.orders.filter((o) => o.test_order_reason === "자동 테스트").map((o) => o.order_group_id))];
assert.equal(testGroups.length, 3);
tables.orders.push({ id: 900, order_group_id: testGroups[0], is_test_order: false, youtube_nickname: "진짜" }); // 섞인 주문서
const ledgerRow = tables.orders.find((o) => o.order_group_id === testGroups[1]);
tables.inventory_ledger.push({ order_id: ledgerRow.id });
tables.orders.push({ id: 901, order_group_id: "manual", is_test_order: true, test_order_reason: "운영자 테스트 계정 주문" });
tables.orders.push({ id: 902, order_group_id: "screen1", is_test_order: true, test_order_reason: "운영자 테스트 계정 주문", operator_test_phone: A.AUTO_TEST_PHONE }); // 화면 방식 주문
const del = await S.deleteAutoTestOrders(db, null);
assert.equal(del.groups, 2);
assert.ok(!tables.orders.some((o) => o.id === 902), "화면 방식 테스트 주문도 지움");
assert.ok(del.skipped.includes(testGroups[0]) && del.skipped.includes(testGroups[1]));
assert.ok(tables.orders.some((o) => o.id === 1), "일반 주문 그대로");
assert.ok(tables.orders.some((o) => o.id === 900), "섞인 주문서의 일반 줄 그대로");
assert.ok(tables.orders.some((o) => o.id === 901), "사람이 낸 테스트 주문 그대로");
assert.ok(!tables.orders.some((o) => o.order_group_id === testGroups[2]));
// 일반 주문서 번호를 직접 넣어도 안 지움
const del2 = await S.deleteAutoTestOrders(db, ["real"]);
assert.equal(del2.groups, 0); assert.ok(tables.orders.some((o) => o.id === 1));

// ── 채팅 문장: 다시보기 중엔 질문 없음 · 다이슨엔 사이즈 질문 없음 · 주문 뒤엔 결제 완료 표현 없음
const C = load("lib/autoTestChat.ts");
const dyson = { name: "다이슨 에어랩HS05-2세대", category: "", price: 329000, colors: ["니켈"], sizes: [] };
const coat = { name: "BB-58", category: "의류", price: 195000, colors: ["블랙", "베이지"], sizes: ["S", "M", "L"] };
for (let i = 0; i < 300; i += 1) {
  const replay = C.fallbackChatLine("before", false, coat);
  assert.ok(!/\?|얼마|사이즈|배송|있나요/.test(replay), replay);
  const d = C.fallbackChatLine("before", true, dyson);
  assert.ok(!/kg|사이즈 추천|정사이즈|입는데/.test(d), d);
  assert.ok(!/결제|입금/.test(C.fallbackChatLine("after", true, coat)));
  const b = C.randomBody();
  assert.ok(b.height >= 150 && b.height <= 170 && b.weight >= 40 && b.weight <= 75, JSON.stringify(b));
}
assert.equal(C.chatProductKind(dyson), "appliance");
assert.equal(C.chatProductKind({ name: "MC-328 블랙(마야여자친구) 1", category: "" }), "maya");
assert.equal(C.chatProductKind(coat), "clothing");
assert.equal(C.chatProductKind({ name: "종이방향제", category: "" }), "unknown");

// ── 가상 시청자: 들어오고 나감 · 꺼지면 비움 · 방송 바뀌면 새로
const V = load("lib/autoTestViewers.ts");
let vs = { bc: "", list: [] };
let t0 = Date.now();
for (let m = 0; m < 120; m += 1) vs = V.stepTestViewers(vs, "b1", true, t0 + m * 60_000);
assert.ok(vs.list.every((v) => v.leave > t0 + 119 * 60_000), "나갈 시간 지난 사람은 빠짐");
assert.ok(vs.list.length <= 7);
assert.equal(V.stepTestViewers(vs, "b1", false, t0).list.length, 0);
assert.equal(V.stepTestViewers(vs, "b2", true, t0, () => 0.99).list.length, 0);
const one = V.stepTestViewers({ bc: "b1", list: [] }, "b1", true, t0, () => 0.1);
assert.equal(one.list.length, 1);
const dwellMin = (one.list[0].leave - one.list[0].join) / 60_000;
assert.ok(dwellMin >= 2.4 && dwellMin <= 72, String(dwellMin));

// 상품 카드 질문 → 1~2분 뒤 같은 상품 주문
{
  const st = A.parseAutoTestState(JSON.stringify({ enabled: true, pending: { bcId: "b1", nickname: "푸딩", productId: "677", detailName: "PD-202", productName: "PD-202", askedAt: 1, dueAt: 2 } }));
  assert.equal(st.pending.nickname, "푸딩");
  assert.equal(A.parseAutoTestState(JSON.stringify({ pending: { bcId: "b1" } })).pending, null);
  assert.equal(A.parseAutoTestState("{}").pending, null);
  for (let i = 0; i < 50; i++) { const g = A.pendingGapMs(); assert.ok(g >= 60000 && g <= 120000); }
  const targets = [{ productId: "677", detailName: "PD-202" }, { productId: "800", detailName: "" }];
  assert.equal(A.cardHasTarget(targets, "677", "PD-202"), true);
  assert.equal(A.cardHasTarget(targets, "677", "PD-206"), false);
  assert.equal(A.cardHasTarget(targets, "800", ""), true);
  assert.equal(A.cardHasTarget([], "800", ""), false);
}
console.log("test-auto-test-order: all passed");
