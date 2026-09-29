// [2026-09-29] selectedEligibleAmount — 고른 수량 비율 회수
import assert from "node:assert/strict";
import { selectedEligibleAmount } from "../lib/orderReturnReclaim.ts";

let pass = 0;
const near = (a, e, m) => { assert.ok(Math.abs(a - e) < 0.001, `${m}: ${a} vs ${e}`); pass++; };

const amt = (r) => Number(r.amount) || 0;
// 두 줄: A(1개·30000), B(2개·40000)
const rows = [
  { id: "A", qty: 1, amount: 30000 },
  { id: "B", qty: 2, amount: 40000 },
];

// null → 전체 합 = 70000
near(selectedEligibleAmount(rows, null, amt), 70000, "null → 전체 합");
// 전체 수량 명시 → 동일
near(selectedEligibleAmount(rows, { A: 1, B: 2 }, amt), 70000, "전체 수량 → 동일");
// B 2개 중 1개 → 30000 + 40000*1/2 = 50000
near(selectedEligibleAmount(rows, { B: 1 }, amt), 30000 + 20000, "2개 중 1개 → 절반(그 줄)");
// 0·음수 → 1로 클램프: B 0 → 1개분
near(selectedEligibleAmount(rows, { B: 0 }, amt), 30000 + 20000, "0 → 1");
near(selectedEligibleAmount([{ id: "B", qty: 2, amount: 40000 }], { B: -5 }, amt), 20000, "음수 → 1");
// 초과 → q 로 클램프: B 9 → 2개 전부
near(selectedEligibleAmount([{ id: "B", qty: 2, amount: 40000 }], { B: 9 }, amt), 40000, "초과 → q");
// map 에 없는 줄 → 그 줄은 전체(p=q)
near(selectedEligibleAmount(rows, { B: 1 }, amt), 30000 + 20000, "map 없는 A 는 전체");

console.log(`✅ order-return-reclaim ${pass}건 통과`);
