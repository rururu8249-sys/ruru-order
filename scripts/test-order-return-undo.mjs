// 반품 등록 «취소» 판정 — 돈이 두 번 나가지 않는지, 기록이 억울하게 지워지지 않는지
import assert from "node:assert/strict";
import {
  planReturnUndo,
  canClearReturnRecord,
  returnUndoSourceKey,
  RETURN_RECLAIM_CREATED_BY,
  RETURN_UNDO_CREATED_BY,
  detectManualRefund,
} from "../lib/orderReturnUndo.ts";

// ── 되돌림 열쇠 — 주문그룹 하나당 하나. 이게 흔들리면 이중 지급이 뚫린다.
assert.equal(returnUndoSourceKey("G-123"), "order_return_undo:G-123");
assert.equal(returnUndoSourceKey("  G-123  "), "order_return_undo:G-123");
assert.equal(returnUndoSourceKey(""), "");
assert.equal(returnUndoSourceKey(null), "");

// ① 회수 1,345원 → 그대로 1,345원 돌려준다 (다시 «계산»하지 않는다)
{
  const plan = planReturnUndo([
    { amount: -1345, created_by: RETURN_RECLAIM_CREATED_BY },
  ]);
  assert.equal(plan.refundPoints, 1345);
  assert.equal(plan.alreadyUndone, false);
}

// ② 이미 되돌린 건 → 0원. 두 번 누르셔도 돈이 안 나간다.
{
  const plan = planReturnUndo([
    { amount: -1345, created_by: RETURN_RECLAIM_CREATED_BY },
    { amount: 1345, created_by: RETURN_UNDO_CREATED_BY, source_key: "order_return_undo:G-1" },
  ]);
  assert.equal(plan.refundPoints, 0);
  assert.equal(plan.alreadyUndone, true);
}

// ③ 회수된 게 없던 건(적립 0원 주문) → 0원
assert.equal(planReturnUndo([]).refundPoints, 0);
assert.equal(planReturnUndo([{ amount: -500, created_by: "admin" }]).refundPoints, 0,
  "관리자가 손으로 깎은 포인트는 반품 회수가 아니다 — 건드리면 안 된다");

// ④ 같은 주문그룹을 두 번 반품 등록해 회수가 두 줄이면 합쳐서 돌려준다
{
  const plan = planReturnUndo([
    { amount: -1000, created_by: RETURN_RECLAIM_CREATED_BY },
    { amount: -345, created_by: RETURN_RECLAIM_CREATED_BY },
  ]);
  assert.equal(plan.refundPoints, 1345);
}

// ⑤ 적립(+) 줄이 섞여 있어도 회수만 본다
{
  const plan = planReturnUndo([
    { amount: 345, created_by: "order_submit" },
    { amount: -345, created_by: RETURN_RECLAIM_CREATED_BY },
  ]);
  assert.equal(plan.refundPoints, 345);
}

// ── 반품기록 지우기 판정 ──
const older = { id: "i1", created_at: "2026-09-20T10:00:00Z" };
const newer = { id: "i2", created_at: "2026-09-22T10:00:00Z" };

// ⑥ 마지막 등록이면 기록을 지워도 된다
assert.equal(canClearReturnRecord(newer, [older, newer]), true);
assert.equal(canClearReturnRecord(older, [older]), true);

// ⑦ 뒤에 더 최근 등록이 있으면 «지우면 안 된다» — 뒤 건 기록이 사라진다
assert.equal(canClearReturnRecord(older, [older, newer]), false);

// ⑧ 뒤 건이 이미 지워진 이슈면 살아있는 기록이 아니다 → 지워도 된다
assert.equal(
  canClearReturnRecord(older, [older, { ...newer, status: "deleted" }]),
  true,
);

// ⑨ 등록시각을 모르면 «지우지 않는다»(안전 쪽)
assert.equal(canClearReturnRecord({ id: "x" }, []), false);

// ── 「이미 손으로 돌려주셨나?」 감지 ── 사장님이 매번 판단하지 않게 시스템이 찾는다
{
  const reclaimedAt = "2026-09-22T10:00:00Z";

  // ⑩ 회수 뒤에 같은 금액을 손으로 지급 → 찾아낸다
  const hit = detectManualRefund({
    ledgerRows: [
      { amount: -1345, created_by: RETURN_RECLAIM_CREATED_BY, created_at: reclaimedAt },
      { amount: 1345, created_by: "admin", created_at: "2026-09-22T10:05:00Z" },
    ],
    reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1",
  });
  assert.equal(hit.found, true);
  assert.equal(hit.amount, 1345);

  // ⑪ 금액이 다르면 «돌려준 것»이 아니다 — 방송 이벤트 포인트 등. 경고하면 안 된다.
  assert.equal(detectManualRefund({
    ledgerRows: [{ amount: 1000, created_by: "admin", created_at: "2026-09-22T10:05:00Z" }],
    reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1",
  }).found, false);

  // ⑫ 회수 «이전» 지급은 상관없다
  assert.equal(detectManualRefund({
    ledgerRows: [{ amount: 1345, created_by: "admin", created_at: "2026-09-21T09:00:00Z" }],
    reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1",
  }).found, false);

  // ⑬ 자동 흐름(회수·되돌림)은 손으로 준 게 아니다
  assert.equal(detectManualRefund({
    ledgerRows: [{ amount: 1345, created_by: RETURN_UNDO_CREATED_BY, created_at: "2026-09-22T10:05:00Z" }],
    reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1",
  }).found, false);

  // ⑭ 금액이 달라도 «같은 주문그룹»에 달려 있으면 찾아낸다
  assert.equal(detectManualRefund({
    ledgerRows: [{ amount: 500, created_by: "admin", created_at: "2026-09-22T10:05:00Z", related_order_id: "G-1" }],
    reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1",
  }).found, true);

  // ⑮ 아무것도 없으면 조용하다
  assert.equal(detectManualRefund({ ledgerRows: [], reclaimedAt, reclaimedAmount: 1345, groupKey: "G-1" }).found, false);
}

console.log("✅ order return undo OK");
