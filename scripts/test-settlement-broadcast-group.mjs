// [2026-11-28] 정산 방송별 = 방송 기준(자정 넘긴 방송 한 묶음). 합계 불변 확인.
import assert from "node:assert/strict";
process.env.TZ = "Asia/Seoul";
const u = await import("../components/admin-live/settlement/settlementUtils.ts");
const bcs = [
  { id: "b1", title: "어그UGG", started_at: "2026-11-23T21:00:00+09:00", ended_at: "2026-11-24T10:34:00+09:00", status: "OFF" },
  { id: "b2", title: "숨김", started_at: "2026-11-23T22:00:00+09:00", ended_at: "2026-11-23T22:10:00+09:00", is_deleted: true, status: "OFF" },
];
const mk = (id, at, extra = {}) => ({ id, created_at: at, payment_status: "입금확인", payment_method: "무통장", final_amount: 10000, total_price: 10000, ...extra });
const rows = [
  mk(1, "2026-11-23T21:30:00+09:00", { broadcast_id: "b1" }),
  mk(2, "2026-11-24T01:10:00+09:00", { broadcast_id: "b1" }),
  mk(3, "2026-11-24T02:00:00+09:00"), // 방송 기록 없음·방송 시간 안
  mk(4, "2026-11-24T15:00:00+09:00"), // 쇼핑몰
  mk(5, "2026-11-23T22:05:00+09:00"), // 숨긴 방송과 겹침 → 진짜 방송
];
assert.equal(u.orderBroadcastKey(rows[1], bcs), "date:2026-11-23");
assert.equal(u.orderBroadcastKey(rows[2], bcs), "date:2026-11-23");
assert.equal(u.orderBroadcastKey(rows[3], bcs), "date:2026-11-24");
assert.equal(u.orderBroadcastKey(rows[4], bcs), "date:2026-11-23");
assert.equal(u.orderBroadcastKey(rows[1]), "date:2026-11-24"); // 방송 목록 없으면 예전 그대로
const opts = u.buildBroadcastOptions(rows, bcs);
const out = u.buildBroadcastRows(rows, opts, 0, [], bcs);
const g = Object.fromEntries(out.map((r) => [r.key, r]));
assert.equal(g["date:2026-11-23"].count, 4);
assert.equal(g["date:2026-11-24"].count, 1);
assert.ok(g["date:2026-11-23"].label.includes("어그UGG"));
const sum = out.reduce((a, r) => a + r.paidAmount, 0);
assert.equal(sum, u.calculateStats(rows, 0, []).paidAmount);
const picked = u.filterRows({ rows, startDate: "", endDate: "", selectedBroadcastKeys: ["date:2026-11-23"], paymentFilter: "전체", broadcasts: bcs });
assert.equal(picked.length, 4);
console.log("ok settlement broadcast group");
