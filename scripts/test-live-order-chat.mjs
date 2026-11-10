// [2026-11-10 21:54] 주문 감사·결제 완료 채팅 글 — 서버 저장(가짜 DB)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader({});
const M = load("lib/liveOrderChatServer.ts");

function fakeDb(state) {
  const inserted = [];
  const from = (table) => {
    const q = { table, filters: [], _limit: null };
    const api = {
      select() { return api; },
      eq(k, v) { q.filters.push((r) => String(r[k]) === String(v)); return api; },
      neq(k, v) { q.filters.push((r) => r[k] !== v); return api; },
      gte(k, v) { q.filters.push((r) => r[k] != null && String(r[k]) >= String(v)); return api; },
      in(k, vs) { q.filters.push((r) => vs.includes(r[k])); return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { const rows = (state[table] ?? []).filter((r) => q.filters.every((f) => f(r))); return Promise.resolve({ data: rows[0] ?? null }); },
      then(res) { res({ data: (state[table] ?? []).filter((r) => q.filters.every((f) => f(r))) }); },
      insert(row) { inserted.push(row); (state.live_chat_messages ??= []).push(row); return Promise.resolve({}); },
    };
    return api;
  };
  return { from, inserted };
}
const base = () => ({
  broadcasts: [{ id: "b1", status: "ON", started_at: "2026-11-10T11:00:00Z", is_deleted: false }],
  settings: [{ key: "live_chat_v1", value: { enabled: true } }, { key: "live_chat_bot_v1", value: { enabled: true } }],
  orders: [
    { id: 1, order_group_id: "G1", broadcast_id: "b1", youtube_nickname: "호롤롤로-T", product_name: "MC-326 화이트", color: "", size: "2", payment_method: "무통장입금", is_test_order: false, is_deleted: false, created_at: "2026-11-10T12:46:00Z", deposit_confirmed_at: "2026-11-10T12:52:00Z", admin_order_status_v2: "자동입금확인" },
    { id: 2, order_group_id: "G2", broadcast_id: "b1", youtube_nickname: "카드손님", product_name: "PD-202", color: "블랙", size: "M", payment_method: "카드결제", is_test_order: false, is_deleted: false, created_at: "2026-11-10T12:47:00Z", deposit_confirmed_at: null, admin_order_status_v2: "주문확인전" },
    { id: 3, order_group_id: "G3", broadcast_id: "b1", youtube_nickname: "시험", product_name: "X", is_test_order: true, created_at: "2026-11-10T12:48:00Z", deposit_confirmed_at: "2026-11-10T12:52:00Z", admin_order_status_v2: "입금확인" },
    { id: 4, order_group_id: "G4", broadcast_id: "old", youtube_nickname: "예전방송", product_name: "X", is_test_order: false, created_at: "2026-11-09T12:48:00Z", deposit_confirmed_at: "2026-11-10T12:52:00Z", admin_order_status_v2: "입금확인" },
  ],
  live_chat_messages: [],
});
// 설정 키 이름 확인용
const { LIVE_CHAT_KEY } = load("lib/liveChat.ts");
const { LIVE_CHAT_BOT_KEY } = load("lib/liveChatBot.ts");
const fix = (s) => { s.settings[0].key = LIVE_CHAT_KEY; s.settings[1].key = LIVE_CHAT_BOT_KEY; return s; };

{ // 주문 감사 — 한 번만
  const s = fix(base()); const db = fakeDb(s);
  await M.announceOrderThanks(db, "G1");
  await M.announceOrderThanks(db, "G1");
  assert.equal(db.inserted.length, 1);
  assert.match(db.inserted[0].body, /호롤롤로-T님 MC-326 화이트 2 주문 감사합니다/);
  assert.equal(db.inserted[0].bot_ref, "o:G1");
}
{ // 카드 주문 — 감사 + 카드 링크 안내
  const s = fix(base()); const db = fakeDb(s);
  await M.announceOrderThanks(db, "G2");
  assert.deepEqual(db.inserted.map((r) => r.bot_ref), ["o:G2", "card:G2"]);
}
{ // 시험 주문·채팅 꺼짐 — 안 올림
  const s = fix(base()); const db = fakeDb(s);
  await M.announceOrderThanks(db, "G3");
  s.settings[0].value = { enabled: false };
  await M.announceOrderThanks(db, "G1");
  assert.equal(db.inserted.length, 0);
}
{ // 결제 완료 — 이 방송·결제된 것만, 두 번 돌려도 한 번
  const s = fix(base()); const db = fakeDb(s);
  const now = Date.parse("2026-11-10T12:53:00Z");
  assert.equal(await M.announceRecentPaid(db, now), 1);
  assert.equal(await M.announceRecentPaid(db, now), 0);
  assert.equal(db.inserted[0].bot_ref, "paid:G1");
  assert.match(db.inserted[0].body, /호롤롤로-T님 결제 완료! 감사합니다/);
}
console.log("✅ test-live-order-chat 통과");
