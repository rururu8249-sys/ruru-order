import assert from "node:assert/strict";
import * as B from "../lib/orderChatBatch.ts";

// 문구
const e1 = B.orderChatEntry("몽상가8277", [{ product_name: "BB-78 트렌치코트" }, { product_name: "PD-202" }, { product_name: "MX-1 코트" }], 1000);
assert.deepEqual(B.buildOrderChatBatchMessages([e1]), ["🛒 몽상가8277님 주문 감사합니다! BB-78 트렌치코트 외 2개"]);
const e2 = B.orderChatEntry("행복나무", [{ product_name: "PD-202 니트" }], 1000);
const e3 = B.orderChatEntry("루루맘", [{ product_name: "다이슨 에어랩HS05-2세대" }, { product_name: "x" }], 1000);
assert.deepEqual(B.buildOrderChatBatchMessages([e1, e2, e3]), ["🛒 주문 감사합니다! 💗몽상가8277님 BB-78 외 2 💗행복나무님 PD-202 💗루루맘님 다이슨 에어랩HS05-… 외 1"]);
// 금액·옵션 없음
assert.ok(!B.buildOrderChatBatchMessages([e1, e2]).join("").includes("원"));
// 190자 넘으면 다음 줄, 줄마다 190자 이하
const many = Array.from({ length: 30 }, (_, i) => B.orderChatEntry(`손님닉네임${i}`, [{ product_name: `BB-${i} 코트` }, { product_name: "y" }], 1000));
const lines = B.buildOrderChatBatchMessages(many);
assert.ok(lines.length >= 3 && lines.length <= 8, String(lines.length));
assert.ok(lines.every((l) => l.length <= 190 && l.startsWith("🛒 주문 감사합니다!")));
assert.equal(lines.join(" ").split("💗").length - 1, 30); // 30명 빠짐없이
assert.deepEqual(B.buildOrderChatBatchMessages([]), []);
assert.equal(B.shortProductName("BB(버버리)-84M 코트"), "BB-84M");

// 대기열 — 가짜 settings 표(값 비교 바꾸기)
function fakeDb() {
  const rows = new Map();
  const q = (table) => {
    const st = { filters: [], op: "select", payload: null };
    const api = {
      select() { return api; },
      insert(v) { if (rows.has(v.key)) return Promise.resolve({ error: { message: "dup" } }); rows.set(v.key, v.value); return Promise.resolve({ error: null }); },
      update(v) { st.op = "update"; st.payload = v; return api; },
      eq(k, v) { st.filters.push([k, v]); return api; },
      limit() { return api; },
      maybeSingle() { const key = st.filters.find(([k]) => k === "key")?.[1]; return Promise.resolve({ data: rows.has(key) ? { value: rows.get(key) } : null }); },
      then(res) {
        const key = st.filters.find(([k]) => k === "key")?.[1];
        const val = st.filters.find(([k]) => k === "value");
        if (st.op === "update") {
          if (rows.has(key) && (!val || rows.get(key) === val[1])) { rows.set(key, st.payload.value); return Promise.resolve({ data: [{ key }], error: null }).then(res); }
          return Promise.resolve({ data: [], error: null }).then(res);
        }
        return Promise.resolve({ data: [], error: null }).then(res);
      },
    };
    return api;
  };
  return { from: q, rows };
}
const db = fakeDb();
assert.equal(await B.enqueueOrderChat(db, { ...e1, t: 0 }), true);
assert.equal(await B.enqueueOrderChat(db, { ...e2, t: 5000 }), true);
assert.deepEqual(await B.takeDueOrderChats(db, 10000), []); // 아직 20초 안 됨
const got = await B.takeDueOrderChats(db, 21000);
assert.equal(got.length, 2);
assert.deepEqual(await B.takeDueOrderChats(db, 99000), []); // 비워졌음 — 두 번 안 올림
// 동시에 넣어도 하나도 안 빠짐
await Promise.all([1, 2, 3, 4].map((i) => B.enqueueOrderChat(db, { n: `동시${i}`, p: "", m: 0, t: 0 })));
const after = await B.takeDueOrderChats(db, 30000);
assert.equal(after.length, 4);
console.log("order chat batch tests passed");
