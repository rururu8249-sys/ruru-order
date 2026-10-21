// lib/shippingGroups.ts
// [2026-10-22 사장님 지시] 배송비 갈래 = 일반 · 업체1 · 업체2 «세 갈래», 갈래마다 따로 1번씩.
//   - 세 갈래 상품을 한 주문서에 다 담으면 배송비 3번.
//   - 합배송 범위(관리자 시간창 / 같은 방송 / 같은 날, 같은 주소) 안에 그 갈래 주문이 이미 있으면 그 갈래는 0원(최초 1회만).
//   - 금액: 일반 = 설정 「기본 배송비」(제주·산간이면 「제주/산간 배송비」),
//           업체1·업체2 = 설정 「업체배송비」(제주·산간이면 「업체배송 제주/산간」) — 기본 배송비를 0원(무료배송)으로 해도 그대로.
// 손님 화면(app/order/page.tsx)과 서버(app/api/customer-orders/submit/route.ts)가 이 파일 하나를 같이 쓴다.
//   한쪽만 다르면 손님 화면 금액과 서버 검사가 어긋나 주문이 막히거나 배송비가 빠진다.

export type ShippingGroup = "normal" | "vendor" | "vendor2";
export const SHIPPING_GROUPS: ShippingGroup[] = ["normal", "vendor", "vendor2"];
export type PaidShippingGroups = Record<ShippingGroup, boolean>;
export const EMPTY_PAID_SHIPPING_GROUPS: PaidShippingGroups = { normal: false, vendor: false, vendor2: false };

/** 상품(또는 주문 줄)의 배송 갈래. 상품 등록 폼 저장값 shipping_type: normal / vendor(업체1) / vendor2(업체2).
 *  옛 값: 「업체…」 글자·combine_shipping "N" 은 업체1로 본다(예전 규칙 그대로). */
export function resolveShippingGroup(value: unknown): ShippingGroup {
  const record = (value || {}) as Record<string, unknown>;
  const shippingType = String(record.shipping_type ?? record.delivery_type ?? "").trim().toLowerCase();
  const combineShipping = String(record.combine_shipping ?? "").trim().toUpperCase();
  const compact = shippingType.replace(/\s+/g, "");
  if (compact.includes("vendor2") || compact.includes("업체2") || compact.includes("업체배송2")) return "vendor2";
  if (shippingType.includes("vendor") || shippingType.includes("업체") || combineShipping === "N") return "vendor";
  return "normal";
}

export function normalizePaidShippingGroups(value: boolean | Partial<PaidShippingGroups> | null | undefined): PaidShippingGroups {
  if (typeof value === "boolean") return { normal: value, vendor: value, vendor2: value };
  return { normal: Boolean(value?.normal), vendor: Boolean(value?.vendor), vendor2: Boolean(value?.vendor2) };
}

export function anyPaidShippingGroup(value: PaidShippingGroups): boolean {
  return value.normal || value.vendor || value.vendor2;
}

export type ShippingFeeSettings = {
  normalFee: number;        // 기본 배송비
  normalRemoteFee: number;  // 제주/산간 배송비
  vendorFee: number;        // 업체배송비
  vendorRemoteFee: number;  // 업체배송 제주/산간
};

/** 배송지에 따라 갈래별 1회 금액. 제주·산간은 일반 금액보다 낮아지지 않게(설정 화면 저장 규칙과 같음). */
export function shippingFeeByGroup(settings: ShippingFeeSettings, isRemote: boolean): Record<ShippingGroup, number> {
  const normal = Math.max(0, Number(settings.normalFee) || 0);
  const vendor = Math.max(0, Number(settings.vendorFee) || 0);
  const normalFee = isRemote ? Math.max(normal, Math.max(0, Number(settings.normalRemoteFee) || 0)) : normal;
  const vendorFee = isRemote ? Math.max(vendor, Math.max(0, Number(settings.vendorRemoteFee) || 0)) : vendor;
  return { normal: normalFee, vendor: vendorFee, vendor2: vendorFee };
}

export type ShippingBreakdown = {
  normalShippingFee: number;
  vendor1ShippingFee: number;
  vendor2ShippingFee: number;
  /** 업체1 + 업체2 (예전 화면 문구가 쓰는 합) */
  vendorShippingFee: number;
  totalShippingFee: number;
};

/** 배송비 대상 줄들의 갈래 목록 → 이번 주문서 배송비. 이미 낸 갈래(합배송)는 0원. */
export function calculateShippingBreakdown(
  groups: ShippingGroup[],
  paid: PaidShippingGroups,
  feeByGroup: Record<ShippingGroup, number>,
): ShippingBreakdown {
  const has = (g: ShippingGroup) => groups.includes(g);
  const fee = (g: ShippingGroup) => (has(g) && !paid[g] ? feeByGroup[g] : 0);
  const normalShippingFee = fee("normal");
  const vendor1ShippingFee = fee("vendor");
  const vendor2ShippingFee = fee("vendor2");
  return {
    normalShippingFee,
    vendor1ShippingFee,
    vendor2ShippingFee,
    vendorShippingFee: vendor1ShippingFee + vendor2ShippingFee,
    totalShippingFee: normalShippingFee + vendor1ShippingFee + vendor2ShippingFee,
  };
}

/** 주문 줄마다 배송비 — 갈래마다 «첫 번째 배송비 대상 줄»에만 붙인다(합이 calculateShippingBreakdown 과 같다).
 *  chargeable[i] 가 false 인 줄(0원 상품 등)은 0원이고 갈래 첫 줄로 치지 않는다. */
export function assignRowShippingFees(
  rows: { group: ShippingGroup; chargeable: boolean }[],
  paid: PaidShippingGroups,
  feeByGroup: Record<ShippingGroup, number>,
): number[] {
  const charged = new Set<ShippingGroup>();
  return rows.map(({ group, chargeable }) => {
    if (!chargeable || paid[group] || charged.has(group)) return 0;
    charged.add(group);
    return feeByGroup[group];
  });
}

/** 서버 검사용 — 합배송이 하나도 없을 때 이 주문서가 냈어야 하는 최소 배송비(제주·산간 가산 제외). */
export function expectedMinimumShipping(groups: Iterable<ShippingGroup>, settings: ShippingFeeSettings): number {
  const fees = shippingFeeByGroup(settings, false);
  let sum = 0;
  for (const g of new Set(groups)) sum += fees[g];
  return sum;
}
