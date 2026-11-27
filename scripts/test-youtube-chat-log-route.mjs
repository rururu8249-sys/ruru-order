// scripts/test-youtube-chat-log-route.mjs — 채팅 기록 조회 주소(관리자만·읽기만): 방송 목록·닉네임 찾기+주문서·앞뒤 대화·주문서 없는 사람
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const T = {
  broadcasts: [{ id: "11111111-1111-1111-1111-111111111111", public_title: "의류15", started_at: "2026-11-27T11:00:00Z", ended_at: "2026-11-27T15:00:00Z", status: "OFF", is_deleted: false }],
  youtube_chat_log: [
    { id: 1, message_id: "a", broadcast_id: "11111111-1111-1111-1111-111111111111", channel_id: "UC1", author_name: "@루루맘", is_owner: false, is_bot: false, message: "509 블랙 M 주세요", order_like: true, published_at: "2026-11-27T12:00:00Z" },
    { id: 2, message_id: "b", broadcast_id: "11111111-1111-1111-1111-111111111111", channel_id: "UC2", author_name: "@꽃님", is_owner: false, is_bot: false, message: "저요", order_like: true, published_at: "2026-11-27T12:01:00Z" },
    { id: 3, message_id: "c", broadcast_id: "11111111-1111-1111-1111-111111111111", channel_id: "UC3", author_name: "@수다", is_owner: false, is_bot: false, message: "예뻐요", order_like: false, published_at: "2026-11-27T12:02:00Z" },
    { id: 4, message_id: "d", broadcast_id: "11111111-1111-1111-1111-111111111111", channel_id: "UC4", author_name: "@채널손님", is_owner: false, is_bot: false, message: "MX-101 주세요", order_like: true, published_at: "2026-11-27T12:30:00Z" },
  ],
  orders: [
    { id: 10, order_lookup_code: "RURU-1", youtube_nickname: "루루맘", customer_name: "김", kakao_id: "k1", customer_phone: "01011112222", product_name: "MX-509", color: "블랙", size: "M", qty: 1, created_at: "2026-11-27T12:05:00Z", admin_order_status_v2: "자동입금확인", payment_method: "무통장입금", broadcast_id: "11111111-1111-1111-1111-111111111111", is_deleted: false },
    { id: 11, order_lookup_code: "RURU-2", youtube_nickname: "다른이름", customer_name: "박", kakao_id: "k9", customer_phone: "01099998888", product_name: "MX-101", color: "", size: "", qty: 1, created_at: "2026-11-27T12:40:00Z", admin_order_status_v2: "미입금", payment_method: "무통장입금", broadcast_id: null, is_deleted: false },
  ],
  customers: [{ youtube_channel_id: "UC4", kakao_id: "k9", customer_phone: "01099998888" }],
};
let writes = 0;
function qb(table) {
  let rows = [...(T[table] || [])];
  let head = false;
  const q = {
    select(_c, o) { if (o?.head) head = true; return q; },
    eq(c, v) { rows = rows.filter((r) => String(r[c]) === String(v)); return q; },
    neq(c, v) { rows = rows.filter((r) => r[c] !== v); return q; },
    not(c, _op, _v) { rows = rows.filter((r) => r[c] != null); return q; },
    ilike(c, p) { const needle = p.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase(); rows = rows.filter((r) => String(r[c] || "").toLowerCase().includes(needle)); return q; },
    gte(c, v) { rows = rows.filter((r) => String(r[c]) >= v); return q; },
    lte(c, v) { rows = rows.filter((r) => String(r[c]) <= v); return q; },
    in(c, vs) { rows = rows.filter((r) => vs.includes(r[c])); return q; },
    order() { return q; }, limit(n) { rows = rows.slice(0, n); return q; },
    range(a, b) { rows = rows.slice(a, b + 1); return q; },
    async maybeSingle() { return { data: rows[0] || null }; },
    upsert() { writes++; return q; }, insert() { writes++; return q; }, update() { writes++; return q; }, delete() { writes++; return q; },
    then(res) { return res(head ? { count: rows.length, error: null } : { data: rows, error: null }); },
  };
  return q;
}
let authed = true;
const load = createUiLoader({
  "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  "@supabase/supabase-js": { createClient: () => ({ from: qb }) },
  "@/lib/admin-auth": { verifyAdminSessionFromRequest: async () => (authed ? { ok: true } : null) },
});
process.env.NEXT_PUBLIC_SUPABASE_URL = "x"; process.env.SUPABASE_SERVICE_ROLE_KEY = "y";
const { GET } = load("app/api/admin-live/youtube-chat-log/route.ts");
const call = (qs) => GET({ url: `http://x/api/admin-live/youtube-chat-log${qs}` });
const BC = "11111111-1111-1111-1111-111111111111";

authed = false; assert.equal((await call("")).status, 401); authed = true;

let r = await call("");
assert.equal(r.body.broadcasts[0].chatCount, 4);
assert.equal(r.body.broadcasts[0].title, "의류15");

r = await call(`?mode=chat&bc=${BC}&q=@루루`);
assert.deepEqual(r.body.messages.map((m) => m.message_id), ["a"], "그 사람 말만");
assert.equal(r.body.orders.length, 1); assert.equal(r.body.orders[0].code, "RURU-1");
assert.equal(r.body.orders[0].items[0], "MX-509 블랙/M ×1");
assert.equal(JSON.stringify(r.body).includes("0101111"), false, "전화번호 안 내보냄");

r = await call(`?mode=chat&q=꽃님`);
assert.deepEqual(r.body.messages.map((m) => m.message_id), ["b"]);
assert.equal(r.body.orders.length, 0, "꽃님 주문서 없음");

r = await call(`?mode=around&bc=${BC}&at=2026-11-27T12:01:00Z`);
assert.deepEqual(r.body.messages.map((m) => m.message_id), ["a", "b", "c"], "앞뒤 3분");

r = await call(`?mode=suspects&bc=${BC}`);
assert.deepEqual(r.body.suspects.map((s) => s.author), ["@꽃님"], "루루맘=주문 있음, 채널손님=채널로 이어진 주문 있음, 수다=주문 같은 말 아님");

assert.equal((await call(`?mode=chat&bc=nope`)).status, 400);
assert.equal(writes, 0, "읽기만");
console.log("test-youtube-chat-log-route OK");
