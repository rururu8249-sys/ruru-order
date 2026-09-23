// ═══ 반품/교환 등록 «취소» 판정 규칙 — 2026-09-23 신설 ═══
//
//   사장님: 「고객이슈 잘못 등록 된건 되돌리기? 삭제? 기능 있으면 좋겠음」
//           「포인트도 회수가 된 고객이슈건이면 다시 자동으로 되돌려주면 되잖아?」
//
//   ⚠⚠ 돈이 움직이는 경로다. 판정 규칙만 여기 모아 테스트로 고정한다.
//      실제 쓰기(포인트 원장·잔액·주문 반품칸)는 서버 라우트가 한다.
//
//   돈이 새는 길은 하나뿐이다 — «취소를 두 번 눌러 포인트가 두 번 나가는 것».
//   그래서 되돌림은 항상 같은 열쇠(source_key)를 쓴다. 두 번째는 DB 유니크 인덱스
//   (customer_point_ledger_source_key_uidx)가 거부한다 — 일괄 포인트지급과 같은 방식.

/** 반품 등록이 포인트를 회수할 때 남긴 표시 */
export const RETURN_RECLAIM_CREATED_BY = "order_return_flow";
/** 되돌림이 남길 표시 */
export const RETURN_UNDO_CREATED_BY = "order_return_undo";

/**
 * 되돌림 열쇠 — 주문그룹 하나당 «단 한 번»만 되돌릴 수 있게 하는 값.
 * DB 유니크 인덱스가 이 값으로 이중 지급을 막는다. 절대 임의로 바꾸지 말 것.
 */
export function returnUndoSourceKey(groupKey: unknown): string {
  const key = String(groupKey ?? "").trim();
  return key ? `${RETURN_UNDO_CREATED_BY}:${key}` : "";
}

type LedgerRow = {
  amount?: unknown;
  created_by?: unknown;
  source_key?: unknown;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type ReturnUndoPlan = {
  /** 돌려줄 금액(양수). 0이면 돌려줄 포인트가 없다. */
  refundPoints: number;
  /** 이미 되돌린 적이 있는가 — 있으면 포인트를 다시 주지 않는다. */
  alreadyUndone: boolean;
  /** 사장님께 보여줄 한 줄 설명 */
  note: string;
};

/**
 * 이 주문그룹의 포인트 원장 줄들을 보고 «얼마를 돌려줄지»를 정한다.
 *
 * ⚠ 금액을 다시 «계산하지» 않는다. 회수할 때 남긴 금액을 그대로 되돌린다.
 *   반품이 일부 상품만이었으면 회수도 안분돼 있었으므로, 그 값이 곧 정답이다.
 */
export function planReturnUndo(ledgerRows: LedgerRow[]): ReturnUndoPlan {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];

  // 이미 되돌렸나 — 되돌림 줄이 하나라도 있으면 끝.
  const alreadyUndone = rows.some(
    (row) => String(row?.created_by ?? "").trim() === RETURN_UNDO_CREATED_BY,
  );

  // 회수 줄(음수)만 더한다. 회수는 음수로 기록돼 있다.
  const reclaimed = rows
    .filter((row) => String(row?.created_by ?? "").trim() === RETURN_RECLAIM_CREATED_BY)
    .reduce((sum, row) => sum + Math.max(0, -num(row.amount)), 0);

  if (alreadyUndone) {
    return { refundPoints: 0, alreadyUndone: true, note: "이미 되돌린 건이라 포인트를 다시 지급하지 않습니다." };
  }

  if (reclaimed <= 0) {
    return { refundPoints: 0, alreadyUndone: false, note: "회수된 포인트가 없어 돌려드릴 금액이 없습니다." };
  }

  return {
    refundPoints: reclaimed,
    alreadyUndone: false,
    note: `회수했던 ${reclaimed.toLocaleString("ko-KR")}원을 돌려드립니다.`,
  };
}

/**
 * 회수한 «뒤에» 사장님이 손으로 포인트를 따로 주신 흔적이 있는가?
 *
 * [2026-09-23 사장님] 「뭐가 이리 복잡해?」 — 맞는 지적이다.
 *   예전엔 이 경우를 확인창에 «주의하세요»라고 써서 사장님이 매번 판단하시게 했다.
 *   그건 시스템이 할 일이다. 여기서 찾아내고, 찾았을 때만 한 줄 알려드린다.
 *
 * 판정: 회수 시각 이후 · 양수 지급 · 자동 흐름이 아닌 것(손으로 준 것) ·
 *       금액이 회수액과 같거나 같은 주문그룹에 달려 있는 것.
 *   → 금액까지 같아야 «돌려주신 것»으로 본다. 방송 이벤트 포인트 같은 건 안 걸린다.
 */
export function detectManualRefund(input: {
  ledgerRows: Array<{ amount?: unknown; created_by?: unknown; created_at?: unknown; related_order_id?: unknown }>;
  reclaimedAt: string;
  reclaimedAmount: number;
  groupKey: string;
}): { found: boolean; amount: number; at: string } {
  const rows = Array.isArray(input.ledgerRows) ? input.ledgerRows : [];
  const auto = new Set([RETURN_RECLAIM_CREATED_BY, RETURN_UNDO_CREATED_BY]);

  for (const row of rows) {
    const by = String(row?.created_by ?? "").trim();
    if (auto.has(by)) continue;

    const amount = num(row?.amount);
    if (amount <= 0) continue;

    const at = String(row?.created_at ?? "");
    if (!at || !input.reclaimedAt || at <= input.reclaimedAt) continue;

    const sameAmount = input.reclaimedAmount > 0 && amount === input.reclaimedAmount;
    const sameOrder = Boolean(input.groupKey) && String(row?.related_order_id ?? "") === input.groupKey;
    if (!sameAmount && !sameOrder) continue;

    return { found: true, amount, at };
  }

  return { found: false, amount: 0, at: "" };
}

type IssueRow = {
  id?: unknown;
  created_at?: unknown;
  status?: unknown;
};

/**
 * 반품기록(orders.return_*)을 지워도 되는가?
 *
 * ⚠ 한 주문서에 반품을 두 번 등록했다면 뒤 등록이 앞 등록을 «덮어써» 있다.
 *   그 상태에서 앞 건을 취소하며 기록을 지우면 «뒤 건의 기록»까지 사라진다.
 *   → 지금 취소하는 이슈가 그 주문그룹의 «가장 최근» 반품 등록일 때만 지운다.
 */
export function canClearReturnRecord(
  targetIssue: IssueRow,
  siblingIssues: IssueRow[],
): boolean {
  const targetAt = String(targetIssue?.created_at ?? "");
  if (!targetAt) return false;

  const targetId = String(targetIssue?.id ?? "");

  return !siblingIssues.some((issue) => {
    if (String(issue?.id ?? "") === targetId) return false;
    // 이미 지워진(숨김) 이슈는 살아있는 기록으로 치지 않는다
    if (String(issue?.status ?? "").toLowerCase() === "deleted") return false;
    return String(issue?.created_at ?? "") > targetAt;
  });
}
