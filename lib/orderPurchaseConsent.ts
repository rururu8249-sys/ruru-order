export const ORDER_PURCHASE_CONSENT_KEYS = [
  "order_purchase_consent_mode",
  "order_purchase_consent_title",
  "order_purchase_consent_text",
  "order_purchase_consent_checkbox",
] as const;

export const ORDER_PURCHASE_CONSENT_REQUIRED_MESSAGE = "해외배송 상품 구매 동의를 확인해 주세요.";

export type OrderPurchaseConsentMode = "auto" | "all" | "off";

export type OrderPurchaseConsentConfig = {
  mode: OrderPurchaseConsentMode;
  title: string;
  text: string;
  checkboxLabel: string;
};

export const DEFAULT_ORDER_PURCHASE_CONSENT: OrderPurchaseConsentConfig = {
  mode: "auto",
  title: "해외방송 상품 구매 전 필수 확인",
  text: [
    "✅ 배송",
    "10/7(수) 기준 약 2~3주 소요되며, 현지 제작·통관·배송 상황에 따라 추가 지연될 수 있습니다.",
    "",
    "✅ 교환·반품",
    "개별 주문·제작 상품으로 단순변심·사이즈 미스에 의한 교환·반품은 제한될 수 있습니다.",
    "※ 반품 가능 시 상품당 30,000원의 해외 반품비가 발생합니다.",
    "",
    "✅ 공홈·검색",
    "특정 국가 출시·부티크 전용·익스클루시브 컬렉션·시즌 종료·품절 등의 사유로 공식 홈페이지 또는 구글에 노출되지 않을 수 있습니다.",
    "",
    "✅ 1:1 제작",
    "제작 특성상 실밥·미세 이염·마감 및 세부 디테일에 미세한 차이가 있을 수 있으며, 시리얼·품번 정보도 공식 판매 상품과 다를 수 있습니다.",
  ].join("\n"),
  checkboxLabel: "위 내용을 모두 확인하였으며 구매에 동의합니다.",
};

type SettingRow = { key?: unknown; value?: unknown };
type ProductLike = {
  id?: unknown;
  badge_type?: unknown;
  badge_types?: unknown;
};
type OrderRowLike = { product_id?: unknown };

const clean = (value: unknown) => String(value ?? "").trim();

const rowValue = (rows: readonly SettingRow[], key: string): unknown =>
  rows.find((row) => clean(row?.key) === key)?.value;

const safeMode = (value: unknown): OrderPurchaseConsentMode => {
  const mode = clean(value).toLowerCase();
  return mode === "all" || mode === "off" || mode === "auto" ? mode : "auto";
};

export function parseOrderPurchaseConsentSettings(rows: readonly SettingRow[]): OrderPurchaseConsentConfig {
  return {
    mode: safeMode(rowValue(rows, "order_purchase_consent_mode")),
    title: clean(rowValue(rows, "order_purchase_consent_title")) || DEFAULT_ORDER_PURCHASE_CONSENT.title,
    text: clean(rowValue(rows, "order_purchase_consent_text")) || DEFAULT_ORDER_PURCHASE_CONSENT.text,
    checkboxLabel: clean(rowValue(rows, "order_purchase_consent_checkbox")) || DEFAULT_ORDER_PURCHASE_CONSENT.checkboxLabel,
  };
}

export function toOrderPurchaseConsentRows(config: OrderPurchaseConsentConfig) {
  return [
    { key: "order_purchase_consent_mode", value: safeMode(config.mode) },
    { key: "order_purchase_consent_title", value: clean(config.title) || DEFAULT_ORDER_PURCHASE_CONSENT.title },
    { key: "order_purchase_consent_text", value: clean(config.text) || DEFAULT_ORDER_PURCHASE_CONSENT.text },
    { key: "order_purchase_consent_checkbox", value: clean(config.checkboxLabel) || DEFAULT_ORDER_PURCHASE_CONSENT.checkboxLabel },
  ];
}

export function productHasOverseasBadge(product: ProductLike | null | undefined): boolean {
  if (!product) return false;
  const badges = Array.isArray(product.badge_types)
    ? product.badge_types.map((value) => clean(value).toLowerCase()).filter(Boolean)
    : [];
  const legacyBadge = clean(product.badge_type).toLowerCase();
  return badges.includes("overseas") || legacyBadge === "overseas";
}

export function orderNeedsPurchaseConsent(
  mode: OrderPurchaseConsentMode,
  orderRows: readonly OrderRowLike[],
  catalog: ReadonlyMap<string, ProductLike>,
): boolean {
  if (mode === "off") return false;
  if (mode === "all") return orderRows.length > 0;
  return orderRows.some((row) => {
    const productId = clean(row?.product_id);
    return Boolean(productId) && productHasOverseasBadge(catalog.get(productId));
  });
}

export function assertOrderPurchaseConsent(required: boolean, accepted: boolean): void {
  if (required && accepted !== true) {
    throw new Error(ORDER_PURCHASE_CONSENT_REQUIRED_MESSAGE);
  }
}
