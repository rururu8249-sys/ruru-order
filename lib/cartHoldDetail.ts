const EMPTY = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na", "null", "undefined"]);

const text = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const meaningful = (value: unknown) => {
  const t = text(value, 120);
  return EMPTY.has(t.toLowerCase()) ? "" : t;
};
const positiveInt = (value: unknown, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.floor(n));
};

export type CartHoldSnapshotItem = {
  productId: string;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number | null;
};

export function buildCartHoldSnapshotItem(item: Record<string, unknown>): CartHoldSnapshotItem {
  return {
    productId: text(item.product_id ?? item.productId, 80),
    productName: text(item.product_name ?? item.productName, 180),
    color: meaningful(item.color).slice(0, 60),
    size: meaningful(item.size).slice(0, 60),
    qty: positiveInt(item.qty, 99),
    unitPrice: (() => {
      const raw = item.product_price ?? item.unitPrice;
      if (raw === null || raw === undefined || String(raw).trim() === "") return null;
      if (String(raw).replace(/[^0-9.-]/g, "").trim() === "") return null;
      const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100_000_000, Math.floor(n));
    })(),
  };
}

export type CartHoldPresentationInput = {
  productName?: unknown;
  fallbackProductName?: unknown;
  color?: unknown;
  size?: unknown;
  qty?: unknown;
  unitPrice?: unknown;
  legacySnapshot?: boolean;
};

export function cartHoldPresentation(input: CartHoldPresentationInput) {
  const productName = text(input.productName, 180);
  const fallback = text(input.fallbackProductName, 180) || "상품";
  const qty = positiveInt(input.qty, 99);
  const rawUnit = input.unitPrice;
  const unitPrice = rawUnit === null || rawUnit === undefined || String(rawUnit).trim() === ""
    ? null
    : positiveInt(rawUnit, 100_000_000);
  const options = [meaningful(input.color), meaningful(input.size)].filter(Boolean);
  return {
    title: productName || fallback,
    optionText: options.join(" · "),
    qty,
    unitPrice,
    rowTotal: unitPrice === null ? null : unitPrice * qty,
    legacySnapshot: Boolean(input.legacySnapshot || !productName),
  };
}

export function checkoutReminderCopy() {
  return {
    title: "🛒 주문 확인이 필요해요",
    // [2026-08-31 사장님 지적] "선점 시간"은 손님이 못 알아듣는 말 — 누구나 아는 말로.
    message: "장바구니에 담아두신 상품이 아직 주문 완료 전이에요. 시간이 지나면 장바구니가 자동으로 비워져요. 지금 주문서를 제출하고 결제까지 마쳐주세요 🙂",
  };
}

// [2026-09-28] 관리자 모달용 남은시간 계산(표시 전용·순수함수). 절대 만료 = created_at + hold.
export type CartHoldTimeline = {
  remainMin: number;                       // 남은 분(0 하한, 올림)
  remainText: string;                      // "N분 남음" / "N시간 M분 남음" / "만료"
  level: "danger" | "warn" | "ok";         // ≤30분 danger · ≤120분 warn · 그 외 ok
  progress: number;                        // 경과 비율 0~1
};
export function cartHoldTimeline(input: { createdAtMs: number; expiresAtMs: number; nowMs: number }): CartHoldTimeline {
  const created = Number(input.createdAtMs);
  const expires = Number(input.expiresAtMs);
  const now = Number(input.nowMs);
  const remainMs = Math.max(0, expires - now);
  const remainMin = Math.ceil(remainMs / 60000);
  // 전체 수명(created→expires). created>expires 등 이상값은 방어(최소 1분).
  const spanMs = Math.max(60000, expires - created);
  const progress = expires <= now ? 1 : Math.min(1, Math.max(0, (now - created) / spanMs));
  const remainText = remainMs <= 0
    ? "만료"
    : remainMin >= 60
      ? `${Math.floor(remainMin / 60)}시간 ${remainMin % 60}분 남음`
      : `${remainMin}분 남음`;
  const level: CartHoldTimeline["level"] = remainMin <= 30 ? "danger" : remainMin <= 120 ? "warn" : "ok";
  return { remainMin: remainMs <= 0 ? 0 : remainMin, remainText, level, progress };
}
