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
};

// [2026-09-08] 응모권 규칙 — "1장 + 결제완료 금액 unit원마다 1장, 최대 max장". 꺼져 있으면 전원 1장.
//   예전 공식(1 + 금액/20만 최대 0.5 + 주문수 보너스 최대 0.3, 최대 1.8배)은 화면 토글과 무관하게 항상 걸려 있어서 제거.
export type RouletteTicketRule = {
  enabled: boolean;
  /** 원 단위. 이 금액마다 응모권 1장 추가 */
  unit: number;
  /** 1명이 가질 수 있는 최대 장수 */
  max: number;
};

export const DEFAULT_TICKET_RULE: RouletteTicketRule = { enabled: false, unit: 50000, max: 5 };
export const TICKET_UNIT_MIN = 10000;
export const TICKET_UNIT_MAX = 1000000;
export const TICKET_MAX_MIN = 1;
export const TICKET_MAX_MAX = 20;

/** 요청 본문/쿼리에서 온 값을 안전한 규칙으로. 비어 있거나 이상하면 기본값(꺼짐) */
export function normalizeTicketRule(input: {
  useWeight?: unknown;
  ticketUnit?: unknown;
  ticketMax?: unknown;
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
  return { enabled, unit, max };
}

/** 응모권 장수 = 1 + floor(결제완료 금액 / 단위), 최대 max. 규칙 꺼짐이면 1 */
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
