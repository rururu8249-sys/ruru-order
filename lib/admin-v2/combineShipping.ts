// lib/admin-v2/combineShipping.ts
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/lib/admin-v2/combineShipping.ts
// 목적: 임시 합배송 시간 설정 공통 유틸
// 주의: 주문 저장/정산 돈 로직 없음

export type CombineShippingSettings = {
  enabled: boolean;
  startAt: string;
  endAt: string;
};

export const DEFAULT_COMBINE_SHIPPING_SETTINGS: CombineShippingSettings = {
  enabled: false,
  startAt: "",
  endAt: "",
};

export const COMBINE_SHIPPING_SETTING_KEYS = [
  "combine_shipping_enabled",
  "combine_shipping_start_at",
  "combine_shipping_end_at",
] as const;

export const parseCombineShippingSettings = (rows: any[] | null | undefined) => {
  const readValue = (key: string) => {
    const found = (rows || []).find((item: any) => item.key === key);
    return String(found?.value || "");
  };

  return {
    enabled: readValue("combine_shipping_enabled") === "true",
    startAt: readValue("combine_shipping_start_at"),
    endAt: readValue("combine_shipping_end_at"),
  };
};

export const isCombineShippingActiveNow = (
  settings: CombineShippingSettings,
  now = new Date()
) => {
  if (!settings.enabled) return false;
  if (!settings.startAt || !settings.endAt) return false;

  const startMs = new Date(settings.startAt).getTime();
  const endMs = new Date(settings.endAt).getTime();
  const nowMs = now.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (startMs >= endMs) return false;

  return nowMs >= startMs && nowMs <= endMs;
};

export const hasPaidShippingFee = (order: any) => {
  const status = String(order?.order_manage_status || "");

  if (["주문서취소", "환불"].includes(status)) {
    return false;
  }

  return (
    Number(order?.shipping_fee || 0) > 0 ||
    Number(order?.adjusted_shipping_fee || 0) > 0
  );
};

export const toDateTimeLocalValue = (isoValue: string) => {
  if (!isoValue) return "";

  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
};

export const fromDateTimeLocalValue = (localValue: string) => {
  if (!localValue) return "";

  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) return "";

  return date.toISOString();
};

export const getDefaultTonightCombineWindow = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(19, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(4, 0, 0, 0);

  return {
    startLocal: toDateTimeLocalValue(start.toISOString()),
    endLocal: toDateTimeLocalValue(end.toISOString()),
  };
};
