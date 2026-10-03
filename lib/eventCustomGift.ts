export function normalizeCustomGiftName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) {
    throw new Error('경품 상품명을 1~40자로 입력해 주세요.');
  }
  return value.trim();
}

export type EventWinnerCustomerRef = {
  kakao: string;
  phone: string;
  nick: string;
};

export type EventWinnerOrderIdentity = {
  id: string;
  broadcastId: string;
  nickname: string;
  customerId: string;
  customerName: string;
  phone: string;
  kakaoId: string;
  createdAt: string;
};

export type EventWinnerIdentity = {
  status: "resolved" | "ambiguous" | "not_found";
  customerName: string | null;
  customerRef: EventWinnerCustomerRef | null;
};

const clean = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, "");

function ownerKey(order: EventWinnerOrderIdentity) {
  const customerId = clean(order.customerId);
  if (customerId) return `customer:${customerId}`;

  const kakaoId = clean(order.kakaoId);
  if (kakaoId) return `kakao:${kakaoId}`;

  const phone = digits(order.phone);
  return phone ? `phone:${phone}` : "";
}

export function resolveEventWinnerIdentity({
  winner,
  orders,
}: {
  winner: { nickname: string; winnerOrderIds: string[]; broadcastId: string };
  orders: EventWinnerOrderIdentity[];
}): EventWinnerIdentity {
  const nickname = clean(winner.nickname);
  const exactIds = new Set((winner.winnerOrderIds || []).map(clean).filter(Boolean));
  const candidates = exactIds.size > 0
    ? orders.filter((order) => exactIds.has(clean(order.id)) && clean(order.nickname) === nickname)
    : orders.filter(
        (order) =>
          Boolean(clean(winner.broadcastId)) &&
          clean(order.broadcastId) === clean(winner.broadcastId) &&
          clean(order.nickname) === nickname,
      );

  const owners = new Map<string, EventWinnerOrderIdentity[]>();
  for (const order of candidates) {
    const key = ownerKey(order);
    if (!key) continue;
    const group = owners.get(key) || [];
    group.push(order);
    owners.set(key, group);
  }

  if (owners.size === 0) {
    return { status: "not_found", customerName: null, customerRef: null };
  }

  if (owners.size > 1) {
    return { status: "ambiguous", customerName: null, customerRef: null };
  }

  const ownerOrders = [...owners.values()][0].sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)));
  const representative = ownerOrders.find((order) => clean(order.customerName)) || ownerOrders[0];

  return {
    status: "resolved",
    customerName: clean(representative.customerName) || null,
    customerRef: {
      kakao: clean(representative.kakaoId),
      phone: digits(representative.phone),
      nick: nickname,
    },
  };
}

export function formatEventWinnerLabel(nickname: unknown, customerName: unknown) {
  const nick = clean(nickname) || "닉네임 없음";
  const name = clean(customerName);
  return name ? `${nick} · ${name}` : nick;
}

export type EventCustomGiftResult = {
  ok: true; status: 'added' | 'already_added'; winnerId: string; orderId: string;
  orderGroupId: string | null; lookupCode: string | null; productName: string;
  targetState: 'active' | 'removed' | 'canceled';
  nickname?: string | null;
  customerName?: string | null;
  customerRef?: EventWinnerCustomerRef | null;
} | { ok: false; code: string; message: string };
