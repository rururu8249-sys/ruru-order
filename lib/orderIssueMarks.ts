// [2026-10-22 사장님] 환불·반품 이슈의 «대상 상품 줄»에 취소선 — 표시 전용(금액·수량·재고·입금 무접촉).
//   어떤 줄인지 고르는 규칙은 고객이슈 목록·처리창과 같은 것(restoreSelectionFromSnapshot → 대상상품 글자 pickIssueProductRows).
//   못 고르면 빈 결과 — 엉뚱한 줄에 줄을 긋느니 안 긋는다.
import { restoreSelectionFromSnapshot } from "./refundLedger";
import { pickIssueProductRows } from "./issueProductLabel";

export type IssueMarkKind = "환불" | "반품" | "교환" | "기타";

type MarkItem = { id: string; productId?: string | null; productName?: string; color?: string; size?: string; qty?: number };

const clean = (v: unknown) => String(v ?? "").trim();

/** 이슈 유형 → 표시 종류. task_type(refund/return/exchange) 우선, 없으면 유형 칩·return_status 글자. */
export function issueMarkKind(input: { task_type?: unknown; raw_payload?: unknown; returnStatus?: unknown }): IssueMarkKind {
  const type = clean(input.task_type).toLowerCase();
  if (type === "refund") return "환불";
  if (type === "return") return "반품";
  if (type === "exchange") return "교환";
  const chips = input.raw_payload && typeof input.raw_payload === "object" ? (input.raw_payload as { issue_types?: unknown }).issue_types : null;
  const chipText = Array.isArray(chips) ? chips.map(clean).join(" ") : "";
  const status = clean(input.returnStatus);
  const text = `${chipText} ${status}`;
  if (text.includes("환불")) return "환불";
  if (text.includes("교환")) return "교환";
  if (text.includes("반품")) return "반품";
  return "기타";
}

/** 환불·반품만 취소선. 교환은 다시 나가는 상품이라 배지만. */
export function isStrikeKind(kind: IssueMarkKind): boolean {
  return kind === "환불" || kind === "반품";
}

/**
 * 이슈가 가리키는 주문 줄 id 목록.
 *   ① raw_payload.items(상품 id·이름·옵션·수량) → 엄격 매처
 *   ② 없으면 「대상상품:」 글자(이슈 본문 또는 orders.return_reason 의 「대상: …」) → 표기 일치
 */
export function issueTargetItemIds(items: readonly MarkItem[], source: { raw_payload?: unknown; targetText?: string | null }): string[] {
  const lite = items.map((it) => ({
    id: clean(it.id), product_id: clean(it.productId), product_name: clean(it.productName),
    color: clean(it.color), size: clean(it.size), qty: Number(it.qty) || 1,
  }));
  const rawItems = source.raw_payload && typeof source.raw_payload === "object" ? (source.raw_payload as { items?: unknown }).items : null;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const snap = rawItems.map((x) => { const o = (x ?? {}) as Record<string, unknown>; return { productId: clean(o.productId ?? o.product_id), productName: clean(o.productName ?? o.product_name), color: clean(o.color), size: clean(o.size), qty: Number(o.qty) || 1 }; });
    const restored = restoreSelectionFromSnapshot(lite, snap);
    return lite.filter((l) => (restored[l.id] || 0) > 0).map((l) => l.id);
  }
  const target = clean(source.targetText);
  if (!target) return [];
  return pickIssueProductRows(lite as unknown as Record<string, unknown>[], target).map((r) => clean((r as { id?: unknown }).id));
}

/** orders.return_reason(「[반품(환불)] 대상: 꼼데 쭈리바지(그레이/M)×1\n세부: …」) 에서 대상 글자만 */
export function targetTextFromReturnReason(reason: unknown): string {
  const text = clean(reason);
  const m = text.match(/대상:\s*([^\n]*)/);
  return m ? clean(m[1]) : "";
}
