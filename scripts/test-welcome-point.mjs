// [2026-11-12] 방송 시청 선물 포인트 — 대상 판정·설정 범위·주문 이력(가짜 DB)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const W = load("lib/welcomePoint.ts");
const S = load("lib/welcomePointServer.ts");

// 설정: 기본은 둘 다 꺼짐, 이상한 값은 범위 안으로
const def = W.parseWelcomePointConfig(null);
assert.equal(def.first.on, false); assert.equal(def.back.on, false);
const wild = W.parseWelcomePointConfig({ first: { on: true, amount: 9999999 }, back: { on: "yes", amount: -5, days: 1 }, watchSec: 99999, dailyCap: 0 });
assert.equal(wild.first.amount, 10000);
assert.equal(wild.back.on, false);
assert.equal(wild.back.amount, 0);
assert.equal(wild.back.days, 14);
assert.equal(wild.watchSec, 300);
assert.equal(wild.dailyCap, 1);
assert.equal(W.parseWelcomePointConfig("{broken").first.on, false);

const cfg = W.parseWelcomePointConfig({ first: { on: true, amount: 2000 }, back: { on: true, amount: 1000, days: 60 } });
const now = Date.parse("2026-11-12T03:00:00Z");
const day = 86400000;

// 결제한 적 없음 → 처음 오신 선물
assert.deepEqual(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now, new Date(now - 3600000).toISOString()), { kind: "first", amount: 2000, sourceKey: "welcome_first:c1", tiers: [{ sec: 30, amount: 2000 }] });
// [11-13] 가입한 지 24시간 넘은 회원·가입 시각 모름 → 처음 선물 없음
assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now, "2026-10-01T00:00:00+09:00"), null);
assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now, null), null);
// [11-13 예외] 11/1~11/13 가입은 며칠 지나도 신규 / 10/31 가입은 아님
{ const later = Date.parse("2026-11-20T03:00:00Z");
  assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, later, "2026-11-01T00:30:00+09:00")?.kind, "first");
  assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, later, "2026-11-13T23:00:00+09:00")?.kind, "first");
  assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, later, "2026-10-31T23:59:00+09:00"), null);
  assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, later, "2026-11-14T00:00:00+09:00"), null); }
assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now), null);
// 처음 선물 꺼짐 → 없음
assert.equal(W.decideWelcome({ ...cfg, first: { on: false, amount: 2000 } }, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now), null);
// 최근에 산 손님 → 없음
assert.equal(W.decideWelcome(cfg, "c1", { paidCount: 3, lastPaidAt: new Date(now - 10 * day).toISOString(), lastPaidKey: "G1" }, now), null);
// 61일 전 마지막 결제 → 오랜만에 오신 선물(그 마지막 주문서마다 한 번)
const back = W.decideWelcome(cfg, "c1", { paidCount: 3, lastPaidAt: new Date(now - 61 * day).toISOString(), lastPaidKey: "G1" }, now);
assert.deepEqual(back, { kind: "back", amount: 1000, sourceKey: "welcome_back:c1:G1", tiers: [{ sec: 30, amount: 1000 }] });
// 오랜만에 오신 선물 꺼짐 → 없음
assert.equal(W.decideWelcome({ ...cfg, back: { ...cfg.back, on: false } }, "c1", { paidCount: 3, lastPaidAt: new Date(now - 61 * day).toISOString(), lastPaidKey: "G1" }, now), null);
// 회원 id 없음 → 없음
assert.equal(W.decideWelcome(cfg, "", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now), null);
// 금액 0 → 없음
assert.equal(W.decideWelcome({ ...cfg, first: { on: true, amount: 0 } }, "c1", { paidCount: 0, lastPaidAt: null, lastPaidKey: null }, now), null);

// 한국 시간 0시
assert.equal(W.kstDayStartIso(Date.parse("2026-11-12T03:00:00Z")), "2026-11-11T15:00:00.000Z");
assert.equal(W.kstDayStartIso(Date.parse("2026-11-11T16:00:00Z")), "2026-11-11T15:00:00.000Z");

// 설명 문구
const h = W.welcomeHelpLines("first", 2000, 30);
assert.equal(h.title, "처음 오신 분께 드리는 시청 선물");
assert.deepEqual(h.lines, ["방송을 30초 보시면 2,000P를 드려요", "다른 앱이나 탭으로 나가면 시간이 처음부터 다시 시작돼요", "받은 포인트는 주문할 때 바로 쓸 수 있어요", "한 분께 한 번만 드려요"]);
assert.deepEqual(W.welcomeHelpLines("back", 1000, 0).lines, ["1,000P를 드려요", "받은 포인트는 주문할 때 바로 쓸 수 있어요", "오랜만에 오실 때마다 다시 드려요"]);
assert.equal(W.welcomeHelpLines("back", 1000, 30).title, "오랜만에 오신 분께 드리는 시청 선물");

// ── 가짜 DB ──
function fakeDb(tables) {
  return {
    from(name) {
      const rows = tables[name] || [];
      let list = rows.slice();
      const q = {
        select() { return q; },
        eq(k, v) { list = list.filter((r) => String(r[k]) === String(v)); return q; },
        in(k, vs) { list = list.filter((r) => vs.map(String).includes(String(r[k]))); return q; },
        like(k, pat) { const pre = pat.replace(/%$/, ""); list = list.filter((r) => String(r[k] || "").startsWith(pre)); return q; },
        gte(k, v) { list = list.filter((r) => String(r[k]) >= v); return q; },
        not(k, op, pat) { if (op === "like" && pat === "%#%") list = list.filter((r) => !String(r[k] || "").includes("#")); return q; },
        or(expr) {
          const parts = expr.split(/,(?![^(]*\))/);
          list = list.filter((r) => parts.some((p) => {
            const m = p.match(/^(\w+)\.(eq|in)\.(.*)$/);
            if (!m) return false;
            if (m[2] === "eq") return String(r[m[1]]) === m[3];
            return m[3].replace(/[()"]/g, "").split(",").includes(String(r[m[1]]));
          }));
          return q;
        },
        order() { return q; },
        limit(n) { list = list.slice(0, n); return q; },
        range(a, b) { list = list.slice(a, b + 1); return q; },
        then(res, rej) { return Promise.resolve({ data: list, error: null, count: list.length }).then(res, rej); },
      };
      return q;
    },
  };
}

const db = fakeDb({
  customers: [
    { id: "c1", kakao_id: "111", customer_phone: "010-1234-5678", youtube_nickname: "봄", customer_name: "김봄", created_at: "2026-01-01" },
    { id: "c2", kakao_id: "222", customer_phone: "01099998888", is_blocked: true, created_at: "2026-01-01" },
  ],
  orders: [
    // c1: 결제완료 1건(옛), 취소 1건, 테스트 1건, 미입금 1건
    { id: 1, order_group_id: "G1", kakao_id: "111", customer_phone: "01012345678", admin_order_status_v2: "입금확인", created_at: "2026-08-01T00:00:00Z" },
    { id: 2, order_group_id: "G1", kakao_id: "111", customer_phone: "01012345678", admin_order_status_v2: "입금확인", created_at: "2026-08-01T00:00:01Z" },
    { id: 3, order_group_id: "G2", kakao_id: "111", customer_phone: "01012345678", admin_order_status_v2: "주문취소", created_at: "2026-11-01T00:00:00Z" },
    { id: 4, order_group_id: "G3", kakao_id: "111", customer_phone: "01012345678", admin_order_status_v2: "입금확인", is_test_order: true, created_at: "2026-11-02T00:00:00Z" },
    { id: 5, order_group_id: "G4", kakao_id: "111", customer_phone: "01012345678", admin_order_status_v2: "미입금", created_at: "2026-11-03T00:00:00Z" },
    // 다른 카카오 계정으로 같은 번호 주문(하이픈 저장) — 같은 손님으로 셈
    { id: 6, order_group_id: "G5", kakao_id: "999", customer_phone: "010-1234-5678", admin_order_status_v2: "카드결제완료", created_at: "2026-09-01T00:00:00Z" },
  ],
  customer_point_ledger: [
    { id: 1, customer_phone: "01055556666", source_key: "welcome_first:cX", created_at: "2026-11-11T16:00:00Z" },
    { id: 2, customer_phone: "01011112222", source_key: "event_winner:9", created_at: "2026-11-11T16:00:00Z" },
  ],
});

// 회원 찾기: 카카오+번호가 같은 줄일 때만, 차단은 없음
const cu = await S.findWelcomeCustomer(db, "111", "01012345678");
assert.equal(cu.id, "c1"); assert.equal(cu.phone, "01012345678");
assert.equal(await S.findWelcomeCustomer(db, "111", "01000000000"), null);
assert.equal(await S.findWelcomeCustomer(db, "222", "01099998888"), null);
assert.equal(await S.findWelcomeCustomer(db, "", "01012345678"), null);

// 결제 이력: 취소·테스트·미입금 빼고 주문서 2개, 마지막 = G5(9/1)
const ph = await S.paidHistoryOf(db, "111", "01012345678");
assert.equal(ph.paidCount, 2);
assert.equal(ph.lastPaidKey, "G5");
assert.equal(ph.lastPaidAt, "2026-09-01T00:00:00Z");
// 결제 없는 손님
assert.deepEqual(await S.paidHistoryOf(db, "333", "01077776666"), { paidCount: 0, lastPaidAt: null, lastPaidKey: null });

// 이미 받은 키·같은 번호 처음 선물·오늘 지급 수
assert.equal(await S.alreadyGranted(db, "welcome_first:cX"), true);
assert.equal(await S.alreadyGranted(db, "welcome_first:c1"), false);
assert.equal(await S.phoneHadFirstGift(db, "010-5555-6666"), true);
assert.equal(await S.phoneHadFirstGift(db, "01011112222"), false);
assert.equal(await S.grantedTodayCount(db, "2026-11-11T15:00:00.000Z"), 1);

// ── 받기 전체 흐름(가짜 DB + 가짜 지급 RPC — RPC 와 같은 규칙: 같은 키는 한 번만) ──
function world({ cfg, on = true, rpcFail = false, ledger = [] }) {
  const tables = {
    customers: [
      { id: "n1", kakao_id: "500", customer_phone: "01050005000", youtube_nickname: "새손님", customer_name: "이새봄", created_at: "2026-11-12T01:00:00Z" },
      { id: "n2", kakao_id: "501", customer_phone: "01050005000", youtube_nickname: "새손님2", created_at: "2026-11-12T02:00:00Z" }, // 같은 번호 다른 카카오
      { id: "x1", kakao_id: "800", customer_phone: "01080008000", youtube_nickname: "예전회원", created_at: "2025-06-01", first_login_at: "2025-06-01T00:00:00Z" }, // 가입 오래됨·결제 0
      { id: "o1", kakao_id: "600", customer_phone: "01060006000", youtube_nickname: "옛손님", created_at: "2025-01-01" },
      { id: "r1", kakao_id: "700", customer_phone: "01070007000", youtube_nickname: "단골", created_at: "2025-01-01" },
    ],
    orders: [
      { id: 11, order_group_id: "OG1", kakao_id: "600", customer_phone: "01060006000", admin_order_status_v2: "입금확인", created_at: "2026-08-01T00:00:00Z" },
      { id: 12, order_group_id: "RG1", kakao_id: "700", customer_phone: "01070007000", admin_order_status_v2: "출고완료", created_at: "2026-11-05T00:00:00Z" },
      { id: 13, order_group_id: "NG1", kakao_id: "500", customer_phone: "01050005000", admin_order_status_v2: "미입금", created_at: "2026-11-11T00:00:00Z" },
    ],
    broadcasts: [{ id: 1, status: on ? "ON" : "OFF" }],
    customer_point_ledger: ledger.slice(),
  };
  const calls = [];
  const clock = { v: NOW };
  const db = fakeDb(tables);
  db.storage = { from: () => ({ download: async () => ({ data: { text: async () => JSON.stringify(cfg) }, error: null }) }) };
  db.rpc = async (name, a) => {
    calls.push({ name, a });
    if (rpcFail) return { data: null, error: { message: "boom" } };
    const dup = tables.customer_point_ledger.find((r) => r.source_key === a.p_source_key);
    if (dup) return { data: { ok: true, duplicate: true }, error: null };
    tables.customer_point_ledger.push({ id: 100 + calls.length, customer_phone: a.p_phone, amount: a.p_amount, reason: a.p_reason, customer_visible: a.p_customer_visible, source_key: a.p_source_key, created_at: new Date(clock.v).toISOString() });
    return { data: { ok: true }, error: null };
  };
  return { db, calls, tables, clock };
}
const NOW = Date.parse("2026-11-12T03:00:00Z");
const ON = { first: { on: true, amount: 2000 }, back: { on: true, amount: 1000, days: 60 }, watchSec: 30, dailyCap: 50 };
const fresh = () => S.clearWelcomeConfigCache();
const SECRET = "test-secret";
/** 진짜 화면처럼: 보기 시작 표(start) 받고 → 받기 */
async function claim(w, k, p, now = NOW, startMs = NOW - 60000) {
  const ev = await S.evaluateWelcome(w.db, k, p, startMs);
  const t = S.signWelcomeTicket(ev.customer?.id || "-", k, startMs, SECRET);
  return S.claimWelcome(w.db, k, p, now, { ticket: t, secret: SECRET });
}

// 1) 설정 꺼짐 → 아무것도 안 줌
fresh(); { const w = world({ cfg: { ...ON, first: { on: false, amount: 2000 }, back: { on: false, amount: 1000, days: 60 } } });
  assert.equal((await S.evaluateWelcome(w.db, "500", "01050005000", NOW)).decision, null);
  const r = await claim(w, "500", "01050005000"); assert.equal(r.ok, false); assert.equal(w.calls.length, 0); }
// 1-1) [11-13] 예전부터 회원인데 결제 0번 → 처음 선물 안 줌
fresh(); { const w = world({ cfg: ON });
  assert.equal((await S.evaluateWelcome(w.db, "800", "01080008000", NOW)).decision, null);
  assert.equal((await claim(w, "800", "01080008000")).ok, false); assert.equal(w.calls.length, 0); }
// 2) 방송 꺼짐 → 안 줌
fresh(); { const w = world({ cfg: ON, on: false });
  assert.equal((await claim(w, "500", "01050005000")).ok, false); assert.equal(w.calls.length, 0); }
// 3) 결제한 적 없는 손님(미입금 주문만 있음) → 처음 오신 선물 2,000P 한 번만
fresh(); { const w = world({ cfg: ON });
  const ev = await S.evaluateWelcome(w.db, "500", "010-5000-5000", NOW);
  assert.deepEqual(ev.decision, { kind: "first", amount: 2000, sourceKey: "welcome_first:n1", tiers: [{ sec: 30, amount: 2000 }] });
  const r1 = await claim(w, "500", "01050005000");
  assert.deepEqual(r1, { ok: true, granted: true, amount: 2000, kind: "first", tier: 0, next: null });
  assert.equal(w.calls.length, 1);
  const a = w.calls[0].a;
  assert.equal(w.calls[0].name, "admin_change_customer_points");
  assert.equal(a.p_phone, "01050005000"); assert.equal(a.p_action, "grant"); assert.equal(a.p_amount, 2000);
  assert.equal(a.p_reason, "처음 오신 선물"); assert.equal(a.p_customer_visible, true); assert.equal(a.p_source_key, "welcome_first:n1");
  // 두 번째는 안 줌(RPC 도 안 부름)
  assert.equal((await S.evaluateWelcome(w.db, "500", "01050005000", NOW)).decision, null);
  const r2 = await claim(w, "500", "01050005000"); assert.equal(r2.ok, false); assert.equal(w.calls.length, 1);
  // 같은 번호로 카카오 계정 새로 만든 사람 → 안 줌
  const r3 = await claim(w, "501", "01050005000"); assert.equal(r3.ok, false); assert.equal(w.calls.length, 1); }
// 4) 남의 번호를 넣으면(카카오 계정과 번호가 다른 회원) → 안 줌
fresh(); { const w = world({ cfg: ON });
  assert.equal((await claim(w, "500", "01060006000")).ok, false); assert.equal(w.calls.length, 0); }
// 5) 최근에 산 단골 → 안 줌 / 100일 넘게 쉰 손님 → 오랜만에 오신 선물 1,000P
fresh(); { const w = world({ cfg: ON });
  assert.equal((await claim(w, "700", "01070007000")).ok, false);
  const r = await claim(w, "600", "01060006000");
  assert.deepEqual(r, { ok: true, granted: true, amount: 1000, kind: "back", tier: 0, next: null });
  assert.equal(w.calls[0].a.p_source_key, "welcome_back:o1:OG1"); assert.equal(w.calls[0].a.p_reason, "오랜만에 오신 선물");
  assert.equal((await claim(w, "600", "01060006000")).ok, false); assert.equal(w.calls.length, 1); }
// 6) 오늘 최대 인원 다 참 → 안 줌
fresh(); { const w = world({ cfg: { ...ON, dailyCap: 1 }, ledger: [{ id: 1, customer_phone: "01099990000", source_key: "welcome_first:zz", created_at: "2026-11-12T01:00:00Z" }] });
  const r = await claim(w, "500", "01050005000"); assert.equal(r.ok, false); assert.equal(r.message, "오늘 선물이 모두 나갔어요"); assert.equal(w.calls.length, 0); }
// 7) 지급 결과를 모르면 실패로(다시 시도해도 같은 키라 두 번 안 들어감)
fresh(); { const w = world({ cfg: ON, rpcFail: true });
  const r = await claim(w, "500", "01050005000"); assert.equal(r.ok, false); assert.equal(r.status, 503); }
// 8) 저장된 금액이 이상해도 1만P 넘게는 안 줌
fresh(); { const w = world({ cfg: { ...ON, first: { on: true, amount: 5000000 } } });
  const r = await claim(w, "500", "01050005000"); assert.equal(r.ok, true); assert.equal(w.calls[0].a.p_amount, 10000); }
fresh();

console.log("welcome-point OK");

// ── 선물 받은 사람 목록: 선물 뒤 주문 판정(읽기 전용 표시) ──
{
  const PAIDSET = new Set(["입금확인", "카드결제완료", "출고완료"]);
  const gift = { at: "2026-11-12T05:00:00Z", kakaoId: "k1", phone: "01012345678" };
  const rows = [
    { id: 1, order_group_id: "G0", kakao_id: "k1", created_at: "2026-11-12T04:00:00Z", admin_order_status_v2: "입금확인", final_amount: 9999 }, // 선물 전 → 뺌
    { id: 2, order_group_id: "G1", kakao_id: "k1", created_at: "2026-11-12T06:00:00Z", admin_order_status_v2: "입금확인", final_amount: 30000 },
    { id: 3, order_group_id: "G1", kakao_id: "k1", created_at: "2026-11-12T06:00:01Z", admin_order_status_v2: "입금확인", final_amount: 20000 },
    { id: 4, order_group_id: "G2", customer_phone: "010-1234-5678", created_at: "2026-11-12T07:00:00Z", admin_order_status_v2: "미입금", final_amount: 10000 },
    { id: 5, order_group_id: "G3", kakao_id: "k1", created_at: "2026-11-12T08:00:00Z", admin_order_status_v2: "주문취소", final_amount: 5000 },
    { id: 6, order_group_id: "G4", kakao_id: "k1", created_at: "2026-11-12T08:00:00Z", admin_order_status_v2: "입금확인", is_test_order: true, final_amount: 5000 },
    { id: 7, order_group_id: "G5", kakao_id: "other", customer_phone: "01099998888", created_at: "2026-11-12T08:00:00Z", admin_order_status_v2: "입금확인", final_amount: 5000 },
  ];
  assert.deepEqual(W.welcomeOrderResult(gift, rows, PAIDSET), { orders: 2, paidOrders: 1, paidAmount: 50000 });
  assert.deepEqual(W.welcomeOrderResult(gift, [], PAIDSET), { orders: 0, paidOrders: 0, paidAmount: 0 });
  assert.deepEqual(W.parseWelcomeSourceKey("welcome_back:abc-1:G9"), { kind: "back", customerId: "abc-1", tier: 0 });
  assert.deepEqual(W.parseWelcomeSourceKey("welcome_first:xyz"), { kind: "first", customerId: "xyz", tier: 0 });
  assert.equal(W.parseWelcomeSourceKey("event_x:1"), null);
  console.log("ok 선물 받은 사람 목록 판정");
}

// ── 목록 서버 함수(가짜 DB, 읽기만) ──
{
  const tables = {
    customer_point_ledger: [
      { id: "L1", customer_phone: "01012345678", youtube_nickname: "루*동이", customer_name: "", amount: 1000, source_key: "welcome_first:c1", created_at: "2026-11-12T05:00:00Z" },
      { id: "L2", customer_phone: "01055556666", youtube_nickname: "", customer_name: "", amount: 1000, source_key: "welcome_back:c2:G7", created_at: "2026-11-12T06:00:00Z" },
      { id: "X", customer_phone: "01055556666", amount: 500, source_key: "event:1", created_at: "2026-11-12T06:00:00Z" },
    ],
    customers: [{ id: "c1", kakao_id: "k1", youtube_nickname: "루루", customer_name: "가" }, { id: "c2", kakao_id: "k2", youtube_nickname: "나무", customer_name: "나" }],
    orders: [
      { id: 1, order_group_id: "G1", kakao_id: "k1", customer_phone: "01012345678", created_at: "2026-11-12T06:00:00Z", admin_order_status_v2: "입금확인", final_amount: 30000 },
      { id: 2, order_group_id: "G2", kakao_id: "k2", customer_phone: "01055556666", created_at: "2026-11-12T07:00:00Z", admin_order_status_v2: "미입금", final_amount: 10000 },
    ],
  };
  const writes = [];
  const q = (name) => {
    let list = [...tables[name]]; let counted = false;
    const api = {
      select(_c, o) { counted = !!o?.count; return api; },
      like(col, pat) { const pre = pat.replace(/%$/, ""); list = list.filter((r) => String(r[col] ?? "").startsWith(pre)); return api; },
      gte(col, v) { list = list.filter((r) => String(r[col]) >= v); return api; },
      in(col, vs) { list = list.filter((r) => vs.includes(r[col])); return api; },
      or() { return api; },
      order(col, o) { list.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (o?.ascending === false ? -1 : 1)); return api; },
      range(a, b) { const total = list.length; return Promise.resolve({ data: list.slice(a, b + 1), error: null, count: counted ? total : null }); },
      then(res) { return res({ data: list, error: null }); },
      insert() { writes.push(name); return api; }, update() { writes.push(name); return api; },
    };
    return api;
  };
  const sb = { from: q, rpc() { writes.push("rpc"); } };
  const page1 = await S.listWelcomeRecipients(sb, 1, 1);
  assert.equal(page1.total, 2);
  assert.equal(page1.rows.length, 1);
  assert.equal(page1.rows[0].id, "L2");
  assert.equal(page1.rows[0].kind, "back");
  assert.equal(page1.rows[0].nickname, "나무"); // 장부에 없으면 회원 표
  assert.equal(page1.rows[0].orders, 1); assert.equal(page1.rows[0].paidOrders, 0);
  const page2 = await S.listWelcomeRecipients(sb, 2, 1);
  assert.equal(page2.rows[0].id, "L1"); assert.equal(page2.rows[0].paidAmount, 30000); assert.equal(page2.rows[0].phoneTail, "5678");
  const sum = await S.summarizeWelcome(sb, Date.parse("2026-11-12T09:00:00Z"));
  assert.deepEqual({ g: sum.gifts, p: sum.points, o: sum.ordered, paid: sum.paid, amt: sum.paidAmount }, { g: 2, p: 2000, o: 2, paid: 1, amt: 30000 });
  assert.deepEqual(writes, []); // 쓰기 0
  console.log("ok 목록·요약 서버 함수(쓰기 0)");
}

// ── [2026-11-14] 구간 지급(30초 얼마 · 60초 더 얼마) + 서버 시간 확인(서명된 보기 시작 표) ──
{
  // 설정: 예전 값 → 한 구간 / 구간 정리(범위·정렬·겹침·최대 3)
  const legacy = W.parseWelcomePointConfig({ first: { on: true, amount: 1500 }, back: { on: true, amount: 700, days: 90 }, watchSec: 40 });
  assert.deepEqual(legacy.first.tiers, [{ sec: 40, amount: 1500 }]);
  assert.deepEqual(legacy.back.tiers, [{ sec: 40, amount: 700 }]);
  const t = W.parseWelcomePointConfig({ first: { on: true, tiers: [{ sec: 90, amount: 99999 }, { sec: 30, amount: 1000 }, { sec: 30, amount: 5 }, { sec: 60, amount: 500 }, { sec: 999, amount: 1 }, "x"] } });
  assert.deepEqual(t.first.tiers, [{ sec: 30, amount: 1000 }, { sec: 60, amount: 500 }, { sec: 90, amount: 10000 }]);
  assert.equal(t.first.amount, 1000); // 첫 구간 금액 = 예전 amount 칸
  assert.equal(W.welcomeTierKey("welcome_first:c1", 0), "welcome_first:c1");
  assert.equal(W.welcomeTierKey("welcome_first:c1", 1), "welcome_first:c1#2");
  assert.deepEqual(W.parseWelcomeSourceKey("welcome_first:c1#2"), { kind: "first", customerId: "c1", tier: 1 });
  assert.deepEqual(W.parseWelcomeSourceKey("welcome_back:c2:G7#3"), { kind: "back", customerId: "c2", tier: 2 });
  assert.deepEqual(W.welcomeHelpLines("first", [{ sec: 30, amount: 1000 }, { sec: 60, amount: 1000 }]).lines.slice(0, 4),
    ["방송을 30초 보시면 1,000P를 드려요", "1분까지 보시면 1,000P를 더 드려요", "끝까지 보시면 모두 2,000P예요", "다른 앱이나 탭으로 나가면 시간이 다시 시작돼요 (받은 선물 다음부터 남은 시간만)"]);
  const T2 = [{ sec: 30, amount: 500 }, { sec: 60, amount: 500 }];
  assert.equal(W.welcomeCouponHint(T2, 0), "1분까지 보시면 500P 더 드려요");
  assert.equal(W.welcomeCouponHint(T2, 1), "모두 1,000P 받으셨어요");
  assert.equal(W.welcomeCouponHint([{ sec: 30, amount: 500 }], 0), "");

  const TIERS = { ...ON, first: { on: true, tiers: [{ sec: 30, amount: 1000 }, { sec: 60, amount: 1000 }] }, back: { on: true, days: 60, tiers: [{ sec: 30, amount: 1000 }, { sec: 60, amount: 500 }] } };
  const START = NOW;
  const ticketOf = async (w, k, p, start = START) => { const ev = await S.evaluateWelcome(w.db, k, p, start); return { ev, t: S.signWelcomeTicket(ev.customer?.id || "-", k, start, SECRET) }; };
  const go = (w, k, p, at, t, secret = SECRET) => { w.clock.v = at; return S.claimWelcome(w.db, k, p, at, { ticket: t, secret }); };

  // 처음 손님: 30초 → 1구간, 45초 → 아직, 60초 → 2구간(#2), 그 뒤 더 없음
  fresh(); { const w = world({ cfg: TIERS });
    const { ev, t: tk } = await ticketOf(w, "500", "01050005000");
    assert.equal(ev.tierIndex, 0);
    assert.equal((await go(w, "500", "01050005000", START + 10_000, tk)).message, "아직 시간이 안 됐어요"); assert.equal(w.calls.length, 0);
    const r1 = await go(w, "500", "01050005000", START + 30_000, tk);
    assert.deepEqual(r1, { ok: true, granted: true, amount: 1000, kind: "first", tier: 0, next: 1 });
    assert.equal(w.calls[0].a.p_source_key, "welcome_first:n1"); // 1구간 키 = 예전 키 그대로
    assert.equal((await go(w, "500", "01050005000", START + 45_000, tk)).message, "아직 시간이 안 됐어요"); assert.equal(w.calls.length, 1);
    const r2 = await go(w, "500", "01050005000", START + 60_000, tk);
    assert.deepEqual(r2, { ok: true, granted: true, amount: 1000, kind: "first", tier: 1, next: null });
    assert.equal(w.calls[1].a.p_source_key, "welcome_first:n1#2");
    assert.equal(w.calls[1].a.p_reason, "처음 오신 선물 · 추가");
    assert.equal((await go(w, "500", "01050005000", START + 300_000, tk)).ok, false); assert.equal(w.calls.length, 2);
    // 같은 번호 다른 카카오 계정은 여전히 못 받음
    const other = await ticketOf(w, "501", "01050005000");
    assert.equal(other.ev.decision, null);
    // 오늘 받은 «사람» 수는 1(2구간은 안 셈)
    assert.equal(await S.grantedTodayCount(w.db, "2026-11-11T15:00:00.000Z"), 1);
  }

  // 위조·남의 표·만료·서명 비밀 다름 → 안 줌
  fresh(); { const w = world({ cfg: TIERS });
    const { t: tk } = await ticketOf(w, "500", "01050005000");
    const [body] = tk.split(".");
    assert.equal((await go(w, "500", "01050005000", START + 60_000, `${body}.forged`)).message, "다시 열어 주세요");
    assert.equal((await go(w, "500", "01050005000", START + 60_000, tk, "other-secret")).message, "다시 열어 주세요");
    assert.equal((await go(w, "500", "01050005000", START + 60_000, "")).message, "다시 열어 주세요");
    const theirs = S.signWelcomeTicket("o1", "600", START, SECRET); // 다른 손님 표
    assert.equal((await go(w, "500", "01050005000", START + 60_000, theirs)).message, "다시 열어 주세요");
    const future = S.signWelcomeTicket("n1", "500", START + 60_000, SECRET); // 미래 시각 표(화면 조작) — 시작 직후엔 시간이 안 됨
    assert.equal((await go(w, "500", "01050005000", START + 60_000, future)).message, "아직 시간이 안 됐어요");
    assert.equal((await go(w, "500", "01050005000", START + 4 * 3600_000, tk)).message, "다시 열어 주세요"); // 3시간 넘은 표
    assert.equal(w.calls.length, 0);
  }

  // 예전에 1구간을 받은 손님 → 다음에 열면 2구간부터(1구간 다시 안 줌), 하루 인원이 꽉 차도 2구간은 줌(같은 사람)
  fresh(); { const w = world({ cfg: { ...TIERS, dailyCap: 1 }, ledger: [{ id: 1, customer_phone: "01050005000", source_key: "welcome_first:n1", created_at: "2026-11-12T01:00:00Z" }] });
    const { ev, t: tk } = await ticketOf(w, "500", "01050005000");
    assert.equal(ev.tierIndex, 1);
    assert.equal((await go(w, "500", "01050005000", START + 20_000, tk)).message, "아직 시간이 안 됐어요"); // 남은 30초 전
    const r = await go(w, "500", "01050005000", START + 30_000, tk); // [남은 30초만] 다시 와서 30초면 2구간
    assert.equal(r.ok, true); assert.equal(r.tier, 1); assert.equal(w.calls[0].a.p_source_key, "welcome_first:n1#2");
  }
  // 같은 화면에서 1구간 받은 뒤 나갔다 옴 → 새 표로 30초만, 옛 표로 1구간 직후 바로 받기는 막힘
  fresh(); { const w = world({ cfg: TIERS });
    const { t: tk } = await ticketOf(w, "500", "01050005000");
    assert.equal((await go(w, "500", "01050005000", START + 30_000, tk)).tier, 0);
    assert.equal((await go(w, "500", "01050005000", START + 31_000, tk)).message, "아직 시간이 안 됐어요"); // 옛 표 바로 또 → 막힘
    const back = await ticketOf(w, "500", "01050005000", START + 100_000); // 다른 앱 갔다 옴
    assert.equal(back.ev.tierIndex, 1);
    assert.equal((await go(w, "500", "01050005000", START + 110_000, back.t)).message, "아직 시간이 안 됐어요");
    assert.equal((await go(w, "500", "01050005000", START + 130_000, back.t)).tier, 1); // 30초만
    assert.equal(w.calls.length, 2);
  }

  // 오랜만 손님 2구간 금액 500 / 금액 0 구간은 건너뜀
  fresh(); { const w = world({ cfg: TIERS });
    const { t: tk } = await ticketOf(w, "600", "01060006000");
    assert.equal((await go(w, "600", "01060006000", START + 30_000, tk)).next, 1);
    const r = await go(w, "600", "01060006000", START + 60_000, tk);
    assert.equal(r.amount, 500); assert.equal(w.calls[1].a.p_source_key, "welcome_back:o1:OG1#2"); }
  fresh(); { const w = world({ cfg: { ...TIERS, first: { on: true, tiers: [{ sec: 30, amount: 1000 }, { sec: 60, amount: 0 }] } } });
    const { t: tk } = await ticketOf(w, "500", "01050005000");
    assert.equal((await go(w, "500", "01050005000", START + 30_000, tk)).next, null); }
  console.log("ok 구간 지급·서버 시간 확인");
}
