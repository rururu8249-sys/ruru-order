export type EventRouletteMode = "live" | "test" | "preview";
export type EventRouletteStatus = "idle" | "spinning" | "result" | "closed";

export type EventRouletteOrderLike = {
  id?: string | number | null;
  youtube_nickname?: string | null;
  youtubeNickname?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  qty?: number | string | null;
  total_price?: number | string | null;
  totalAmount?: number | string | null;
  adjusted_total_price?: number | string | null;
  adjustedTotalAmount?: number | string | null;
  final_amount?: number | string | null;
  finalAmount?: number | string | null;
  admin_order_status_v2?: string | null;
  adminOrderStatusV2?: string | null;
  order_manage_status?: string | null;
  orderManageStatus?: string | null;
  paymentStatus?: string | null;
  is_test_order?: boolean | null;
  isTestOrder?: boolean | null;
  event_excluded?: boolean | null;
  eventExcluded?: boolean | null;
};

export type EventRouletteParticipant = {
  nickname: string;
  orderCount: number;
  qtySum: number;
  amountSum: number;
  /** [2026-09-08] 결제완료 주문만 합친 금액 — 응모권 계산 근거 */
  paidAmountSum?: number;
  orderIds: string[];
  /** 응모권 장수(= 추첨 가중치). 규칙 꺼짐이면 전원 1 */
  weight: number;
  /** [2026-09-09 자동 응모권] 과거 «서로 다른 구매일» 수 = 단골 판정. 단골리포트와 같은 기준. 모르면 1 */
  visitCount?: number;
};

// [2026-09-08] 응모권 규칙 — "1장 + 결제완료 금액 unit원마다 1장, 최대 max장". 꺼져 있으면 전원 1장.
//   예전 공식(1 + 금액/20만 최대 0.5 + 주문수 보너스 최대 0.3, 최대 1.8배)은 화면 토글과 무관하게 항상 걸려 있어서 제거.
export type RouletteTicketRule = {
  enabled: boolean;
  /** 원 단위. 이 금액마다 응모권 1장 추가 */
  unit: number;
  /** 1명이 가질 수 있는 최대 장수 */
  max: number;
  /** [2026-09-09 사장님 지시] 「수동으로 숫자 작성하는거 없애라. 자동으로 손님들 분석해서」
   *  true 면 unit·max 를 «안 쓴다». 그날 명단 안에서 상대 비교로 장수를 정한다. */
  auto: boolean;
};

export const DEFAULT_TICKET_RULE: RouletteTicketRule = { enabled: false, unit: 50000, max: 5, auto: false };
export const TICKET_UNIT_MIN = 10000;
export const TICKET_UNIT_MAX = 1000000;
export const TICKET_MAX_MIN = 1;
export const TICKET_MAX_MAX = 20;

/** 요청 본문/쿼리에서 온 값을 안전한 규칙으로. 비어 있거나 이상하면 기본값(꺼짐) */
export function normalizeTicketRule(input: {
  useWeight?: unknown;
  ticketUnit?: unknown;
  ticketMax?: unknown;
  ticketAuto?: unknown;
} | null | undefined): RouletteTicketRule {
  const src = input || {};
  const enabled = src.useWeight === true || src.useWeight === "true";
  const unitRaw = Number(src.ticketUnit);
  const maxRaw = Number(src.ticketMax);
  const unit = Number.isFinite(unitRaw) && unitRaw > 0
    ? Math.min(TICKET_UNIT_MAX, Math.max(TICKET_UNIT_MIN, Math.floor(unitRaw)))
    : DEFAULT_TICKET_RULE.unit;
  const max = Number.isFinite(maxRaw) && maxRaw > 0
    ? Math.min(TICKET_MAX_MAX, Math.max(TICKET_MAX_MIN, Math.floor(maxRaw)))
    : DEFAULT_TICKET_RULE.max;
  const auto = (src as { ticketAuto?: unknown }).ticketAuto === true || (src as { ticketAuto?: unknown }).ticketAuto === "true";
  return { enabled, unit, max, auto };
}

// ═══ [2026-09-09] 자동 응모권 — 사장님이 숫자를 «하나도» 안 정한다 ═══
//
//   사장님 지시: 「수동을 작성 하는거 없애라. 자동으로 손님들 분석해서 당첨 잘되게 설정」
//   계획 문서(2026-09-09 순차작업계획 2순위): 「자주 구매하러 오는가? + 오늘 많이 샀는가? 심플하게」
//
//   그래서 두 가지만 본다. 기준 금액은 «그날 명단 안에서» 상대적으로 정한다(고정 숫자 없음).
//     ① 오늘 많이 샀는가  — 그날 결제완료 금액의 중앙값 / 상위권(3사분위) 기준
//     ② 자주 오는가       — 과거 «서로 다른 구매일» 수 (단골리포트와 같은 기준)
//
//   ⚠ 확률 = 돈이다. 그래서 상한을 두고(최대 5장), 아무도 0장이 되지 않게 «기본 1장»은 항상 준다.

/** 자동 모드에서 한 사람이 가질 수 있는 최대 응모권 */
export const AUTO_TICKET_MAX = 5;

export type AutoTicketThresholds = {
  /** 그날 결제완료 금액의 중앙값(0원인 사람은 빼고 계산) */
  median: number;
  /** 그날 결제완료 금액의 상위권 기준(3사분위) */
  top: number;
  /** 기준을 뽑을 수 있었나(결제완료한 사람이 아무도 없으면 false → 금액 가산 없음) */
  ready: boolean;
};

/** 그날 명단의 «결제완료 금액»들로 기준선을 뽑는다. 고정 숫자를 쓰지 않기 위한 핵심. */
export function autoTicketThresholds(paidAmounts: number[]): AutoTicketThresholds {
  const values = (Array.isArray(paidAmounts) ? paidAmounts : [])
    .map((v) => safeNumber(v))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return { median: 0, top: 0, ready: false };

  const at = (ratio: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(ratio * (values.length - 1))))];
  return { median: at(0.5), top: at(0.75), ready: true };
}

/** 자동 응모권 장수. 기본 1장 + 오늘 금액(최대 +2) + 단골(최대 +2), 상한 5장. */
export function calculateAutoTicketCount(
  input: { paidAmountSum: number; visitCount: number },
  thresholds: AutoTicketThresholds
): number {
  let tickets = 1;

  const paid = safeNumber(input.paidAmountSum);
  if (thresholds.ready && paid > 0) {
    if (paid >= thresholds.median) tickets += 1; // 오늘 평균만큼 산 손님
    if (paid >= thresholds.top) tickets += 1;    // 오늘 특히 많이 산 손님
  }

  const visits = Math.max(1, Math.floor(safeNumber(input.visitCount) || 1));
  if (visits >= 2) tickets += 1; // 다시 와 준 손님
  if (visits >= 5) tickets += 1; // 자주 오는 단골

  return Math.min(AUTO_TICKET_MAX, tickets);
}

/** 응모권 장수 = 1 + floor(결제완료 금액 / 단위), 최대 max. 규칙 꺼짐이면 1
 *  ⚠ 자동 모드(rule.auto)에서는 이 함수를 안 쓴다 — 위 calculateAutoTicketCount 가 대신한다.
 *    (예전 수동 규칙을 지우지 않고 남겨둔 이유: 자동이 이상하면 즉시 되돌리기 위해) */
export function calculateTicketCount(paidAmountSum: number, rule: RouletteTicketRule): number {
  if (!rule.enabled) return 1;
  const amount = safeNumber(paidAmountSum);
  const unit = Math.max(1, safeNumber(rule.unit) || DEFAULT_TICKET_RULE.unit);
  return Math.min(Math.max(1, safeNumber(rule.max) || DEFAULT_TICKET_RULE.max), 1 + Math.floor(amount / unit));
}

/** 명단의 총 응모권 대비 확률(%) — 표시용 */
export function ticketPercent(weight: number, totalWeight: number): number {
  if (!(totalWeight > 0)) return 0;
  return Math.round((Math.max(0, weight) / totalWeight) * 1000) / 10;
}

export type EventRouletteWinnerPick = {
  winner: EventRouletteParticipant;
  randomValue: number;
  totalWeight: number;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numberValue));
}

function toBooleanTrue(value: unknown): boolean {
  return value === true;
}

export function normalizeEventRouletteMode(value: unknown): EventRouletteMode {
  const raw = cleanText(value);

  if (raw === "live" || raw === "test" || raw === "preview") {
    return raw;
  }

  return "live";
}

export function getRouletteOrderId(order: EventRouletteOrderLike): string {
  return cleanText(order.id);
}

export function getRouletteNickname(order: EventRouletteOrderLike): string {
  return cleanText(order.youtube_nickname || order.youtubeNickname) || "(닉네임없음)";
}

export function getRouletteOrderAmount(order: EventRouletteOrderLike): number {
  return safeNumber(
    order.final_amount ??
      order.finalAmount ??
      order.adjusted_total_price ??
      order.adjustedTotalAmount ??
      order.total_price ??
      order.totalAmount
  );
}

export function getRouletteQty(order: EventRouletteOrderLike): number {
  const qty = safeNumber(order.qty);

  return qty > 0 ? qty : 1;
}

export function isRouletteCanceledLike(order: EventRouletteOrderLike): boolean {
  const statusText = [
    order.admin_order_status_v2,
    order.adminOrderStatusV2,
    order.order_manage_status,
    order.orderManageStatus,
    order.paymentStatus,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ");

  return /주문취소|주문서취소|취소|환불|cancel|refund/i.test(statusText);
}

export function isRouletteOrderExcluded(order: EventRouletteOrderLike): boolean {
  return (
    toBooleanTrue(order.is_test_order) ||
    toBooleanTrue(order.isTestOrder) ||
    toBooleanTrue(order.event_excluded) ||
    toBooleanTrue(order.eventExcluded) ||
    isRouletteCanceledLike(order)
  );
}

export function isRouletteEligibleOrder(order: EventRouletteOrderLike, mode: EventRouletteMode = "live"): boolean {
  if (mode === "preview") {
    return true;
  }

  return !isRouletteOrderExcluded(order);
}

export type BuildParticipantsOptions = {
  /** 응모권 규칙. 없으면 기본(꺼짐 = 전원 1장) */
  ticketRule?: RouletteTicketRule;
  /** 결제완료 주문 판정 — 응모권은 결제완료 금액으로만 센다. 없으면 모든 주문 금액을 결제완료로 본다(수동 명단·미리보기용) */
  isPaid?: (order: EventRouletteOrderLike) => boolean;
};

export function buildRouletteParticipants(
  orders: EventRouletteOrderLike[],
  mode: EventRouletteMode = "live",
  options: BuildParticipantsOptions = {}
): EventRouletteParticipant[] {
  const grouped = new Map<string, EventRouletteParticipant>();
  const rule = options.ticketRule || DEFAULT_TICKET_RULE;
  const isPaid = options.isPaid;

  for (const order of orders) {
    if (!isRouletteEligibleOrder(order, mode)) continue;

    const nickname = getRouletteNickname(order);
    const orderId = getRouletteOrderId(order);
    const current =
      grouped.get(nickname) ||
      ({
        nickname,
        orderCount: 0,
        qtySum: 0,
        amountSum: 0,
        paidAmountSum: 0,
        orderIds: [],
        weight: 1,
      } satisfies EventRouletteParticipant);

    current.orderCount += 1;
    current.qtySum += getRouletteQty(order);
    const amount = getRouletteOrderAmount(order);
    current.amountSum += amount;
    if (!isPaid || isPaid(order)) {
      current.paidAmountSum = (current.paidAmountSum || 0) + amount;
    }

    if (orderId) {
      current.orderIds.push(orderId);
    }

    current.weight = calculateTicketCount(current.paidAmountSum || 0, rule);

    grouped.set(nickname, current);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.amountSum !== a.amountSum) return b.amountSum - a.amountSum;
    return a.nickname.localeCompare(b.nickname, "ko-KR");
  });
}

export function calculateRouletteSpinDurationMs(participantCount: number): number {
  const count = safeNumber(participantCount);

  if (count <= 10) return 4500;
  if (count <= 30) return 6000;
  if (count <= 60) return 7500;

  return 9000;
}

export function pickRouletteWinner(
  participants: EventRouletteParticipant[],
  randomValue = Math.random()
): EventRouletteWinnerPick {
  if (!Array.isArray(participants) || participants.length <= 0) {
    throw new Error("룰렛 참여자가 없습니다.");
  }

  const totalWeight = participants.reduce((sum, item) => sum + Math.max(0.0001, Number(item.weight || 1)), 0);
  const safeRandom = Math.min(0.999999, Math.max(0, Number(randomValue || 0)));
  const target = safeRandom * totalWeight;
  let cursor = 0;

  for (const participant of participants) {
    cursor += Math.max(0.0001, Number(participant.weight || 1));

    if (target <= cursor) {
      return {
        winner: participant,
        randomValue: safeRandom,
        totalWeight,
      };
    }
  }

  return {
    winner: participants[participants.length - 1],
    randomValue: safeRandom,
    totalWeight,
  };
}

export function buildRoulettePreviewParticipants(): EventRouletteParticipant[] {
  return buildRouletteParticipants(
    [
      { id: "preview-1", youtube_nickname: "보루의하루", final_amount: 45000, qty: 2 },
      { id: "preview-2", youtube_nickname: "꾸꾸", final_amount: 23000, qty: 1 },
      { id: "preview-3", youtube_nickname: "루루동이", final_amount: 55000, qty: 3 },
      { id: "preview-4", youtube_nickname: "백설공주", final_amount: 37000, qty: 1 },
      { id: "preview-5", youtube_nickname: "개구쟁이", final_amount: 16000, qty: 1 },
    ],
    "preview"
  );
}
