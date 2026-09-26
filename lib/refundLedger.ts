// [2026-09-26] 교환·환불 장부 1단계 — 순수 로직(라우트·UI·테스트 공유).
//   ⚠️ 돈을 움직이지 않는다. 금액 합산·계좌 마스킹·고객이슈→장부 매핑 같은 «계산/표시»만.
//   포인트 지급/회수는 이 파일에서 절대 하지 않는다(1단계 원칙).

import { isExcludedHolder } from "./parseBankAccount";

export const REFUND_STAGES = ["접수", "회수 대기", "도착·검수", "처리 필요", "완료", "거절·취소"] as const;
export type RefundStage = (typeof REFUND_STAGES)[number];

export const REFUND_KINDS = ["교환", "반품", "재발송"] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];

export const REFUND_METHODS = ["계좌이체", "포인트", "교환재발송", "카드취소", "없음"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

// [2026-09-26] 저장 단계값 → 목록·요약 표시(처리창 상태 2칩과 통일). 저장값은 안 건드림.
export function stageDisplay(stage: unknown, kind?: unknown): string {
  const s = String(stage ?? "").trim();
  const k = String(kind ?? "").trim();
  if (s === "접수" || s === "회수 대기") return "반품 대기";
  if (s === "도착·검수" || s === "처리 필요") return "반품 도착";
  if (s === "완료") return k === "교환" || k === "재발송" ? "재발송완료" : "환불완료";
  if (s === "거절·취소") return "종료";
  return s;
}

// [2026-09-26] 반품 사유 칩 — reason 필드에 저장.
export const REASON_CHIPS = ["단순변심", "사이즈", "불량", "오배송", "기타"] as const;

// [2026-09-26 7차보완] 합배송 짝 판정(순수 비교) — 주소키는 호출부에서 shippingAddressKey 로 계산해 넘긴다.
//   같은 손님(kakao_id 또는 전화) + 같은 주소키 + 같은 방송(또는 같은 날)이면 같이 배송된 주문으로 본다.
//   배송비를 «낸 쪽»이든 «빠진 쪽»이든 대칭으로 잡힌다(주소키가 같으므로).
export type CombinePeerSelf = { code: string; addr: string; kakao: string; phones: string[]; broadcast: string; day: string };
export type CombinePeerOther = { code: string; addr: string; kakao: string; phone: string; broadcast: string; day: string };
export function isCombinedShipmentPeer(mine: CombinePeerSelf, other: CombinePeerOther): boolean {
  const oc = String(other.code ?? "").trim();
  if (!oc || oc === String(mine.code ?? "").trim()) return false;
  if (!mine.addr || String(other.addr ?? "") !== mine.addr) return false; // 주소를 모르거나 다르면 아님
  const sameCust = (!!mine.kakao && String(other.kakao ?? "") === mine.kakao) || (Array.isArray(mine.phones) && mine.phones.includes(String(other.phone ?? "")));
  if (!sameCust) return false;
  return Boolean((mine.broadcast && String(other.broadcast ?? "") === mine.broadcast) || (mine.day && String(other.day ?? "") === mine.day));
}

// [2026-09-26 카드 단순화] 카드 「다시 받을 돈」 = 차감 + 남기는 상품값(부분반품). 전체반품이면 남기는 상품=0 → 차감 그대로.
//   ⚠️ «총액 − amount_final» 역산이 아니다(옛 저장 base 값에 오염되던 버그 방지).
export function cardRefundBackAmount(deductTotal: unknown, keptProductTotal: unknown): number {
  const d = Math.max(0, Math.round(Number(deductTotal)) || 0);
  const k = Math.max(0, Math.round(Number(keptProductTotal)) || 0);
  return d + k;
}

// [2026-09-26 복구후속] 저장 상품금액≠주문금액 경고를 띄울지 — 로딩 완료+성공+상품 있음+주문금액>0일 때만.
//   로딩 중/실패/주문금액0 이면 false(0원으로 덮어쓰는 사고 방지).
export function shouldWarnBaseMismatch(o: {
  linesLoaded: boolean; linesError: boolean; lineCount: number; autoBase: number; savedBase: number | null; matchAccepted: boolean;
}): boolean {
  if (!o.linesLoaded || o.linesError) return false;
  if ((Math.round(Number(o.lineCount)) || 0) <= 0) return false;
  if ((Math.round(Number(o.autoBase)) || 0) <= 0) return false;
  if (o.savedBase === null || o.savedBase === undefined) return false;
  if (o.matchAccepted) return false;
  return (Math.round(Number(o.savedBase)) || 0) !== (Math.round(Number(o.autoBase)) || 0);
}

// [2026-09-26 7차] 전체 반품 판정 — 모든 줄이 «전체 수량»으로 선택됐는가(배송비·카드추가금 자동 체크 기준).
export function isFullReturnSel(sels: Array<{ qty: unknown; selectedQty: unknown }>): boolean {
  const arr = Array.isArray(sels) ? sels : [];
  if (arr.length === 0) return false;
  return arr.every((s) => (Math.round(Number(s.selectedQty)) || 0) === (Math.round(Number(s.qty)) || 0) && (Math.round(Number(s.qty)) || 0) > 0);
}

// [2026-09-26 6차] 옵션 표기에서 「없음」 제거 — "없음/12"→"12", "없음" 단독→"".
export function optionLabelNoNone(color: unknown, size: unknown): string {
  const one = (v: unknown) => { const s = String(v ?? "").trim(); return s && s !== "없음" ? s : ""; };
  return [one(color), one(size)].filter(Boolean).join("/");
}

// [2026-09-26 5차] 고객이슈 목록 버튼 글자 — 교환만 「교환하기」, 반품/환불 섞이면 「환불하기」(기록·단계 무관).
export function refundListButtonLabel(rawTypes: unknown): string {
  const arr = Array.isArray(rawTypes) ? rawTypes.map((x) => String(x ?? "").toLowerCase()) : [];
  const isExchangeOnly = arr.includes("exchange") && !arr.some((x) => x === "return" || x === "refund");
  return isExchangeOnly ? "교환하기" : "환불하기";
}

// 완료일 짧은 표기 "MM.DD(요일)" — 💳 요약 전용(표시만).
function doneShortKo(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] || "";
  return `${p2(d.getMonth() + 1)}.${p2(d.getDate())}(${wd})`;
}

export type LedgerSummaryInput = {
  kind?: unknown; method?: unknown; amount_final?: unknown; stage?: unknown;
  done_at?: unknown; bank?: unknown; account_holder?: unknown; exchange_option?: unknown;
  account_number?: unknown; account_last4?: unknown; card_total?: unknown;
};
// [2026-09-26 6차] 💳 요약 문구 — 사람말. 값 없으면 "".
//   bankName = 은행 전체이름(호출부에서 bankDisplayName 적용).
//   미완료 계좌이체는 계좌번호 «전체»(라우트가 미완료만 전체 반환), 완료는 «****뒤4»(30일 경과 시 뒤4도 없음).
export function ledgerSummaryLine(li: LedgerSummaryInput | null | undefined, bankName: string): string {
  if (!li) return "";
  const s = (v: unknown) => String(v ?? "").trim();
  const amt = Math.round(Number(li.amount_final)) || 0;
  const wonTxt = `${amt.toLocaleString("ko-KR")}원`;
  const stage = s(li.stage);
  const completed = !!s(li.done_at) || stage === "완료" || stage === "거절·취소";
  const isExchange = s(li.kind) === "교환" || s(li.kind) === "재발송";
  const method = s(li.method);
  const bn = s(bankName);
  // 카드 총결제액(없으면 amount_final 로 대체) + 다시 받을 돈(= 카드총액 − 실제 환불액, 0 이하 숨김)
  const cardTotal = Math.max(0, Math.round(Number(li.card_total)) || 0) || amt;
  const refundBack = Math.max(0, cardTotal - amt);
  if (completed) {
    const dd = doneShortKo(li.done_at);
    if (isExchange) return `재발송함${dd ? ` · ${dd}` : ""}`;
    if (method === "없음") return "환불 없이 종료";
    if (method === "카드취소") return `카드 전체 취소함${refundBack > 0 ? ` · ${refundBack.toLocaleString("ko-KR")}원 받음` : ""}${dd ? ` · ${dd}` : ""}`;
    const last4 = s(li.account_last4);
    const acctSeg = last4 ? `${bn ? `${bn} ` : ""}****${last4}` : bn;
    return `${wonTxt} 보냄${dd ? ` · ${dd}` : ""}${acctSeg ? ` · ${acctSeg}` : ""}`;
  }
  if (isExchange) return `교환 · 바꿀 옵션 ${s(li.exchange_option) || "-"}`;
  if (method === "카드취소" && cardTotal > 0) return `카드 전체 취소 ${cardTotal.toLocaleString("ko-KR")}원${refundBack > 0 ? ` · 다시 받을 돈 ${refundBack.toLocaleString("ko-KR")}원` : ""}`;
  if (method === "포인트" && amt > 0) return `포인트로 돌려줄 금액 ${wonTxt}`;
  if (method === "계좌이체" && amt > 0) {
    // [6차] 옛 예금주(입니다 등)는 노출 금지 → 「예금주 확인 필요」
    const holderTxt = isExcludedHolder(li.account_holder) ? "예금주 확인 필요" : s(li.account_holder);
    const acct = [bn, s(li.account_number), holderTxt].filter(Boolean).join(" ");
    return `보낼 돈 ${wonTxt}${acct ? ` · ${acct}` : ""}`;
  }
  return ""; // 아직 처리 전(값 없음) → 표시 안 함
}

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

// ── [2026-09-26] 「돌려받을 상품」 선택 → 환불 상품금액(amount_base) 계산 ──
//   ⚠️ 돈을 만들지 않는다. 이미 계산된 줄 합계(submitRowLineTotal 기준)를 «고른 만큼» 더할 뿐.
//   포인트 사용/할인은 «자동 차감하지 않는다»(안내만) — 여기 계산에 절대 넣지 않는다.
export type RefundLineSel = { lineTotal: number; qty: number; unit: number; selectedQty: number };

/** 한 줄의 환불 금액 — 전량이면 정확한 줄 합계(반올림 오차 방지), 일부면 단가×고른수량. */
export function lineRefundAmount(sel: RefundLineSel): number {
  const qty = Math.max(0, Math.round(Number(sel?.qty)) || 0);
  const picked = Math.max(0, Math.min(Math.round(Number(sel?.selectedQty)) || 0, qty));
  if (picked === 0) return 0;
  const lineTotal = Math.max(0, Math.round(Number(sel?.lineTotal)) || 0);
  if (picked === qty) return lineTotal;
  const unit = Math.max(0, Math.floor(Number(sel?.unit)) || 0);
  return Math.max(0, unit * picked);
}

/** 상품금액(amount_base) = 고른 줄들의 합 (+ 배송비 체크 시 배송비). 포인트/할인 미반영. */
export function computeRefundBase(sels: RefundLineSel[], includeShipping: boolean, shippingFee: unknown): number {
  const items = (Array.isArray(sels) ? sels : []).reduce((s, x) => s + lineRefundAmount(x), 0);
  const ship = includeShipping ? Math.max(0, Math.round(Number(shippingFee)) || 0) : 0;
  return items + ship;
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
