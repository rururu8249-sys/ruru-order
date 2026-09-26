// [2026-09-26] 교환·환불 장부 1단계 — 순수 로직(라우트·UI·테스트 공유).
//   ⚠️ 돈을 움직이지 않는다. 금액 합산·계좌 마스킹·고객이슈→장부 매핑 같은 «계산/표시»만.
//   포인트 지급/회수는 이 파일에서 절대 하지 않는다(1단계 원칙).

export const REFUND_STAGES = ["접수", "회수 대기", "도착·검수", "처리 필요", "완료", "거절·취소"] as const;
export type RefundStage = (typeof REFUND_STAGES)[number];

export const REFUND_KINDS = ["교환", "반품", "재발송"] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];

export const REFUND_METHODS = ["계좌이체", "포인트", "교환재발송", "없음"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export type RefundAdjustment = { label: string; amount: number };

export function isValidStage(v: unknown): v is RefundStage {
  return typeof v === "string" && (REFUND_STAGES as readonly string[]).includes(v);
}
export function isValidKind(v: unknown): v is RefundKind {
  return typeof v === "string" && (REFUND_KINDS as readonly string[]).includes(v);
}
export function isValidMethod(v: unknown): v is RefundMethod {
  return typeof v === "string" && (REFUND_METHODS as readonly string[]).includes(v);
}

export function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** 계좌번호 뒷 4자리(목록·엑셀에 노출하는 유일한 계좌 정보). */
export function accountLast4(account: unknown): string {
  const d = digitsOnly(account);
  return d.length >= 4 ? d.slice(-4) : d;
}

/** 조정줄을 정규화 — label 문자열 + amount 정수(차감은 음수). 깨진 값은 버린다. */
export function normalizeAdjustments(input: unknown): RefundAdjustment[] {
  if (!Array.isArray(input)) return [];
  const out: RefundAdjustment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const label = String((raw as { label?: unknown }).label ?? "").trim().slice(0, 120);
    const amount = Math.round(Number((raw as { amount?: unknown }).amount));
    if (!Number.isFinite(amount) || amount === 0) {
      if (!label) continue;
    }
    out.push({ label, amount: Number.isFinite(amount) ? amount : 0 });
  }
  return out;
}

/**
 * 최종 환불액 = 상품금액(base) + 조정줄 합(차감은 음수). 음수면 0으로 막는다.
 * ⚠️ 서버가 이 함수로 «다시 계산»해서 저장한다. 클라이언트가 보낸 amount_final 은 믿지 않는다.
 */
export function computeAmountFinal(base: unknown, adjustments: unknown): number {
  const b = Math.round(Number(base));
  const safeBase = Number.isFinite(b) ? b : 0;
  const adjSum = normalizeAdjustments(adjustments).reduce((s, a) => s + a.amount, 0);
  return Math.max(0, safeBase + adjSum);
}

// ── [2026-09-26] 처리 창 입력 보조(표시·입력 전용, 저장은 서버가 amount_final 재계산) ──

/** 숫자에 천단위 쉼표 — "69000" → "69,000" */
export function formatComma(n: unknown): string {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v.toLocaleString("ko-KR") : "0";
}

/** 쉼표·문자 섞인 입력에서 숫자만 → 양의 정수(부호는 버튼으로 받으므로 여기선 절대값). */
export function parseAmountInput(s: unknown): number {
  const d = String(s ?? "").replace(/[^0-9]/g, "");
  return d ? Number(d) : 0;
}

/** 교환은 금액 대신 옵션/송장을 받는다 → 금액 영역이 필요 없다. */
export function kindNeedsAmount(kind: unknown): boolean {
  return String(kind ?? "").trim() !== "교환";
}

/** 처리 창 조정 줄(부호 버튼 + 양수 금액) */
export type RefundAdjRow = { label: string; sign: "차감" | "추가"; amount: number };

/** 화면 줄 → 저장형(차감은 음수). 기존 adjustments 형식 유지. 라벨·금액 둘 다 없으면 버림. */
export function adjRowsToStored(rows: RefundAdjRow[]): RefundAdjustment[] {
  if (!Array.isArray(rows)) return [];
  const out: RefundAdjustment[] = [];
  for (const r of rows) {
    const label = String(r?.label ?? "").trim().slice(0, 120);
    const abs = Math.abs(Math.round(Number(r?.amount)) || 0);
    const amount = r?.sign === "차감" ? -abs : abs;
    if (!label && amount === 0) continue;
    out.push({ label, amount });
  }
  return out;
}

/** 저장형(음수/양수) → 화면 줄(부호 버튼 + 양수). 기존 값 편집용. */
export function storedToAdjRows(adjs: unknown): RefundAdjRow[] {
  return normalizeAdjustments(adjs).map((a) => ({
    label: a.label,
    sign: a.amount < 0 ? "차감" : "추가",
    amount: Math.abs(a.amount),
  }));
}

/** done_at 이후 N일(기본 30) 지났으면 전체 계좌번호를 가려야 한다. */
export function shouldHideAccountNumber(doneAt: unknown, now: number, days = 30): boolean {
  const s = String(doneAt ?? "").trim();
  if (!s) return false;
  const t = new Date(s.includes("T") ? s : s.replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > days * 24 * 60 * 60 * 1000;
}

/** 고객이슈 status → 장부 단계 (이전용). */
export function stageFromIssueStatus(status: unknown): RefundStage {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "done" || s.includes("resolve") || s.includes("완료") || s.includes("해결")) return "완료";
  if (s === "deleted" || s.includes("삭제") || s.includes("취소")) return "거절·취소";
  return "접수";
}

/** 고객이슈 task_type → 장부 구분 (이전용). exchange→교환, refund/return→반품, 그 외→반품. */
export function kindFromTaskType(taskType: unknown): RefundKind {
  const t = String(taskType ?? "").trim().toLowerCase();
  if (t === "exchange" || t.includes("교환")) return "교환";
  if (t === "reship" || t.includes("재발송")) return "재발송";
  return "반품"; // refund / return / 그 외
}

/** 고객이슈 raw_payload.items → 장부 product_snapshot 배열. */
export function productSnapshotFromItems(items: unknown): Array<{ productId: string; productName: string; color: string; size: string; qty: number }> {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      productId: String(r.productId ?? r.product_id ?? "").trim(),
      productName: String(r.productName ?? r.product_name ?? "").trim(),
      color: String(r.color ?? "").trim(),
      size: String(r.size ?? "").trim(),
      qty: Math.max(1, Math.round(Number(r.qty)) || 1),
    };
  });
}

/** 고객이슈 1건(admin_tasks) → 장부 줄 초안(이전용). admin_task_id 는 UNIQUE 라 재실행해도 중복 안 생김. */
export function mapIssueToLedgerDraft(
  task: Record<string, unknown>,
  orderAmountBase: number,
): {
  admin_task_id: string;
  kind: RefundKind;
  stage: RefundStage;
  reason: string;
  amount_base: number;
  product_snapshot: ReturnType<typeof productSnapshotFromItems>;
} {
  const rawPayload = (task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {}) as Record<string, unknown>;
  return {
    admin_task_id: String(task.id ?? "").trim(),
    kind: kindFromTaskType(task.task_type),
    stage: stageFromIssueStatus(task.status),
    reason: String(task.body ?? task.title ?? "").trim().slice(0, 2000),
    amount_base: Math.max(0, Math.round(Number(orderAmountBase)) || 0),
    product_snapshot: productSnapshotFromItems(rawPayload.items),
  };
}
