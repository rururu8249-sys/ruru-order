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
  orderIds: string[];
  weight: number;
};

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

export function calculateRouletteWeight(input: { amountSum: number; orderCount: number }): number {
  const amount = safeNumber(input.amountSum);
  const orderCount = safeNumber(input.orderCount);

  const amountBonus = Math.min(0.5, amount / 200000);
  const orderBonus = Math.min(0.3, Math.max(0, orderCount - 1) * 0.05);
  const weight = 1 + amountBonus + orderBonus;

  return Math.min(1.8, Math.max(1, Number(weight.toFixed(4))));
}

export function buildRouletteParticipants(
  orders: EventRouletteOrderLike[],
  mode: EventRouletteMode = "live"
): EventRouletteParticipant[] {
  const grouped = new Map<string, EventRouletteParticipant>();

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
        orderIds: [],
        weight: 1,
      } satisfies EventRouletteParticipant);

    current.orderCount += 1;
    current.qtySum += getRouletteQty(order);
    current.amountSum += getRouletteOrderAmount(order);

    if (orderId) {
      current.orderIds.push(orderId);
    }

    current.weight = calculateRouletteWeight({
      amountSum: current.amountSum,
      orderCount: current.orderCount,
    });

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
