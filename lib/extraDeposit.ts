// [2026-11-15 사장님 「입금확인 뒤 상품을 바꿔 4,000원 더 받아야 하는데 다시 입금매칭할 방법이 없다 — 근본적으로」]
//   «추가 입금 연결» 공용 규칙(DB 무접촉 순수 함수).
//   · 이미 입금확인된 무통장 주문서에, 나중에 들어온 미확인 입금을 «붙이기만» 한다.
//   · 주문(orders)은 한 칸도 안 바꾼다 — 상태·금액·확인시각 그대로. 입금(deposits) 연결 칸만 쓴다.
//   · 주문상세 「부족해요」 계산(order-balance)과 같은 값: 연결된 입금 합 vs 주문 금액.

type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "").trim();

/**
 * 주문 줄 금액(손님이 낼 돈). final_amount 가 있으면 0원이어도 그 값 — 포인트로 전부 낸 줄은 0원이다.
 * (예전 «0이면 다음 칸» 방식은 포인트 쓴 주문을 많게 셌다 — 운영 실측 에이치더블 77,000 ≠ 실제 38,000)
 */
export function extraRowAmount(row: Row): number {
  const f = row.final_amount;
  if (f !== null && f !== undefined && String(f).trim() !== "" && Number.isFinite(Number(f))) return Math.max(0, Number(f));
  return Number(row.adjusted_total_price || 0) || Number(row.total_price || 0) || 0;
}

const statusText = (row: Row) => [row.admin_order_status_v2, row.order_manage_status, row.order_status].map(text).filter(Boolean).join(" ");

export function isCanceledRow(row: Row): boolean {
  return /주문서취소|주문취소|취소|환불|cancel|refund/i.test(statusText(row));
}

/** 살아 있는 줄(삭제·취소 아님) */
export function liveRows(rows: Row[]): Row[] {
  return rows.filter((r) => r.is_deleted !== true && !isCanceledRow(r));
}

/**
 * 추가 입금을 붙일 수 있는 주문서인지.
 * 무통장 + 살아 있는 줄 전부 입금확인 + 테스트·입금매칭 제외 아님.
 */
export function extraDepositOrderBlock(rows: Row[]): string | null {
  const live = liveRows(rows);
  if (live.length === 0) return "살아 있는 주문 상품이 없어요.";
  if (live.some((r) => text(r.payment_method).includes("카드"))) return "카드 주문은 추가 입금을 붙일 수 없어요.";
  if (live.some((r) => r.is_test_order === true || r.exclude_from_payment_match === true || text(r.exclude_from_payment_match) === "true")) {
    return "테스트·입금매칭 제외 주문이에요.";
  }
  const paid = (r: Row) => /자동입금확인|수동입금확인|입금확인/.test(statusText(r)) && !/입금확인\s*필요|확인필요/.test(statusText(r));
  if (!live.every(paid)) return "아직 입금확인 전인 주문이에요. 입금매칭에서 같이 체크해 확인하세요.";
  return null;
}

export function orderGroupTotal(rows: Row[]): number {
  return liveRows(rows).reduce((s, r) => s + extraRowAmount(r), 0);
}

/** 연결 가능한 입금 = 주문 연결 없음 + 확인시각 없음 + 상태 빈값/미확인/미매칭(정리한 입금 아님) */
export function isLinkableDeposit(d: Row): boolean {
  if (text(d.match_order_group_id) || text(d.match_customer_id) || text(d.confirmed_at)) return false;
  const s = text(d.match_status);
  return s === "" || s === "미확인" || s === "미매칭";
}

const norm = (v: unknown) => text(v).replace(/\s+/g, "").toLowerCase();

/**
 * 후보 입금 순서: ① 이름 같음 ② 금액 = 부족액 ③ 최근.
 * names = 주문 닉네임·이름 등(입금자명 후보)
 */
export function rankExtraDeposits<T extends Row>(deposits: T[], names: string[], shortage: number): Array<T & { nameMatch: boolean; exact: boolean }> {
  const keys = names.map(norm).filter((n) => n.length >= 2);
  const out = deposits.filter(isLinkableDeposit).map((d) => {
    const dn = norm(d.depositor_name);
    const nameMatch = !!dn && keys.some((k) => dn === k || (dn.length >= 2 && (k.includes(dn) || dn.includes(k))));
    const exact = Number(d.amount || 0) === shortage;
    return { ...d, nameMatch, exact };
  });
  // deposited_time 은 「11:04:39」처럼 시각만 오기도 한다 → 날짜가 안 읽히면 created_at
  const when = (d: Row) => Date.parse(text(d.deposited_time)) || Date.parse(text(d.created_at)) || 0;
  out.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || Number(b.exact) - Number(a.exact) || when(b) - when(a));
  return out;
}

/** 붙인 뒤 결과 — 딱 맞음 / 아직 부족 / 더 받음 */
export function extraDepositResult(total: number, linkedSum: number, addSum: number): { after: number; diff: number; kind: "exact" | "short" | "over" } {
  const after = linkedSum + addSum;
  const diff = after - total;
  return { after, diff, kind: diff === 0 ? "exact" : diff < 0 ? "short" : "over" };
}

export const EXTRA_DEPOSIT_NOTE = "추가 입금 연결 (주문 금액 변경)";

/**
 * 「추가 입금 기다리는 주문」 목록 — 입금이 1건 이상 연결돼 있는데 합이 주문 금액보다 적은 무통장 입금확인 주문서.
 * 「입금 없이 확인」(연결 입금 0건)·여러 주문 묶음 입금은 뺀다(주문상세 「부족해요」와 같은 기준).
 */
export function buildShortageList(orders: Row[], deposits: Row[]): Array<{ groupId: string; nickname: string; name: string; orderNo: string; total: number; linked: number; shortage: number }> {
  const byGroup = new Map<string, Row[]>();
  for (const o of orders) {
    const g = text(o.order_group_id);
    if (!g) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(o);
  }
  const linked = new Map<string, number>();
  const multi = new Set<string>();
  for (const d of deposits) {
    const g = text(d.match_order_group_id);
    if (!g) continue;
    if (/\[groups:/.test(text(d.confirmed_note))) multi.add(g);
    linked.set(g, (linked.get(g) || 0) + (Number(d.amount || 0) || 0));
  }
  const out = [];
  for (const [g, rows] of byGroup) {
    if (multi.has(g) || !linked.has(g)) continue;
    if (extraDepositOrderBlock(rows)) continue;
    const total = orderGroupTotal(rows);
    const sum = linked.get(g) || 0;
    if (total > 0 && sum < total) {
      const first = liveRows(rows)[0] ?? rows[0];
      out.push({ groupId: g, nickname: text(first.youtube_nickname), name: text(first.customer_name), orderNo: text(first.order_lookup_code), total, linked: sum, shortage: total - sum });
    }
  }
  return out.sort((a, b) => b.shortage - a.shortage);
}
