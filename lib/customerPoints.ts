export type CustomerPointAction = "grant" | "deduct";
export type CustomerPointChangeType = "grant" | "adjust";

export type CustomerPointBalanceRow = {
  id?: string;
  customer_phone: string;
  youtube_nickname?: string | null;
  customer_name?: string | null;
  current_points?: number | null;
  total_granted_points?: number | null;
  total_used_points?: number | null;
  total_canceled_points?: number | null;
  total_adjusted_points?: number | null;
  last_granted_at?: string | null;
  last_used_at?: string | null;
  last_customer_seen_at?: string | null;
  admin_memo?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CustomerPointChangeInput = {
  action: CustomerPointAction;
  amount: number | string;
  currentPoints: number;
};

export type CustomerPointChangeResult = {
  action: CustomerPointAction;
  changeType: CustomerPointChangeType;
  requestedAmount: number;
  signedAmount: number;
  nextPoints: number;
};

export function normalizeCustomerPointPhone(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function assertValidCustomerPointPhone(value: unknown): string {
  const phone = normalizeCustomerPointPhone(value);

  if (phone.length < 9) {
    throw new Error("전화번호가 올바르지 않습니다.");
  }

  return phone;
}

export function parseCustomerPointAmount(value: unknown): number {
  const raw = String(value ?? "").trim();

  if (!raw) {
    throw new Error("포인트 금액을 입력해주세요.");
  }

  const normalized = raw.replace(/,/g, "");

  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error("포인트 금액은 숫자만 입력해주세요.");
  }

  const amount = Number(normalized);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("포인트 금액은 1원 이상이어야 합니다.");
  }

  if (amount > 10000000) {
    throw new Error("포인트 금액이 너무 큽니다. 한 번에 10,000,000원 이하로 처리해주세요.");
  }

  return amount;
}

export function normalizeCustomerPointAction(value: unknown): CustomerPointAction {
  const action = String(value ?? "").trim();

  if (action === "grant" || action === "deduct") {
    return action;
  }

  throw new Error("포인트 처리 구분이 올바르지 않습니다.");
}

export function readCurrentCustomerPoints(row: CustomerPointBalanceRow | null | undefined): number {
  const current = Number(row?.current_points ?? 0);

  if (!Number.isFinite(current) || current < 0) {
    return 0;
  }

  return Math.floor(current);
}

export function buildCustomerPointChange(input: CustomerPointChangeInput): CustomerPointChangeResult {
  const action = normalizeCustomerPointAction(input.action);
  const requestedAmount = parseCustomerPointAmount(input.amount);
  const currentPoints = Math.max(0, Math.floor(Number(input.currentPoints || 0)));

  const signedAmount = action === "grant" ? requestedAmount : -requestedAmount;
  const nextPoints = currentPoints + signedAmount;

  if (nextPoints < 0) {
    throw new Error(
      `현재 포인트가 부족합니다. 현재 ${formatCustomerPointMoney(currentPoints)}, 차감 요청 ${formatCustomerPointMoney(
        requestedAmount
      )}`
    );
  }

  return {
    action,
    changeType: action === "grant" ? "grant" : "adjust",
    requestedAmount,
    signedAmount,
    nextPoints,
  };
}

export function sanitizeCustomerPointText(value: unknown, maxLength = 300): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * [2026-08-30] 중복지급 차단 키.
 *   같은 출처(예: 이벤트 당첨자 한 줄)로는 포인트가 한 번만 나가게 하는 열쇠다.
 *   DB 의 부분 유니크 인덱스(customer_point_ledger_source_key_uidx)가 실제로 막는다.
 *   비어 있으면(NULL) 제한 없음 — 수동지급·주문 자동적립은 예전 그대로 동작한다.
 */
export function buildPointSourceKey(kind: string, id: unknown): string {
  const k = String(kind ?? "").trim().replace(/[^a-z0-9_]/gi, "");
  const v = String(id ?? "").trim();
  if (!k || !v) return "";
  return `${k}:${v}`.slice(0, 200);
}

export function normalizePointSourceKey(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 200);
}

export function buildCustomerPointLedgerPayload(input: {
  id: string;
  phone: string;
  youtubeNickname?: unknown;
  customerName?: unknown;
  change: CustomerPointChangeResult;
  reason?: unknown;
  adminMemo?: unknown;
  customerVisible?: unknown;
  createdBy?: unknown;
  sourceKey?: unknown;
}) {
  const customerVisible = input.customerVisible === false ? false : true;

  return {
    id: input.id,
    customer_phone: input.phone,
    youtube_nickname: sanitizeCustomerPointText(input.youtubeNickname, 80) || null,
    customer_name: sanitizeCustomerPointText(input.customerName, 80) || null,
    change_type: input.change.changeType,
    amount: input.change.signedAmount,
    balance_after: input.change.nextPoints,
    reason: sanitizeCustomerPointText(input.reason, 200) || null,
    admin_memo: sanitizeCustomerPointText(input.adminMemo, 500) || null,
    related_order_id: null,
    related_broadcast_id: null,
    customer_visible: customerVisible,
    customer_seen_at: null,
    created_by: sanitizeCustomerPointText(input.createdBy, 80) || "admin",
    // 없으면 NULL — 유니크 인덱스가 NULL 을 제외하므로 기존 지급 흐름에 영향이 없다.
    source_key: normalizePointSourceKey(input.sourceKey) || null,
  };
}

export function buildCustomerPointBalancePayload(input: {
  phone: string;
  youtubeNickname?: unknown;
  customerName?: unknown;
  previousBalance?: CustomerPointBalanceRow | null;
  change: CustomerPointChangeResult;
  adminMemo?: unknown;
}) {
  const previous = input.previousBalance ?? null;
  const now = new Date().toISOString();
  const isGrant = input.change.action === "grant";

  return {
    customer_phone: input.phone,
    youtube_nickname:
      sanitizeCustomerPointText(input.youtubeNickname, 80) || sanitizeCustomerPointText(previous?.youtube_nickname, 80) || null,
    customer_name: sanitizeCustomerPointText(input.customerName, 80) || sanitizeCustomerPointText(previous?.customer_name, 80) || null,
    current_points: input.change.nextPoints,
    total_granted_points: Math.max(0, Number(previous?.total_granted_points ?? 0)) + (isGrant ? input.change.requestedAmount : 0),
    total_used_points: Math.max(0, Number(previous?.total_used_points ?? 0)),
    total_canceled_points: Math.max(0, Number(previous?.total_canceled_points ?? 0)),
    total_adjusted_points: Number(previous?.total_adjusted_points ?? 0) + (isGrant ? 0 : input.change.signedAmount),
    last_granted_at: isGrant ? now : previous?.last_granted_at ?? null,
    last_used_at: previous?.last_used_at ?? null,
    last_customer_seen_at: previous?.last_customer_seen_at ?? null,
    admin_memo: sanitizeCustomerPointText(input.adminMemo, 500) || previous?.admin_memo || null,
  };
}

export function formatCustomerPointMoney(value: unknown): string {
  const amount = Math.floor(Number(value || 0));

  if (!Number.isFinite(amount)) {
    return "0원";
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}
