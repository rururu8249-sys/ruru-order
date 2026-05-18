// lib/admin-v2/formatters.ts
// 돈/전화번호/한국시간 표시 유틸
// 리팩토링 1단계: 기존 표시 로직 그대로 분리. 계산 결과 변경 없음.

import type { OrderRow } from "./types";

export const money = (value: unknown) => `${Number(value || 0).toLocaleString()}원`;
export const moneyNumber = (value: unknown) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
export const moneyInput = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

export const digitsOnly = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

export const formatKoreanPhone = (value: unknown) => {
  const digits = digitsOnly(value);

  if (!digits) return "-";
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;

  return String(value ?? "").trim() || "-";
};

export const orderPhoneDigits = (row: Pick<OrderRow, "customer_phone" | "phone">) => {
  const customerPhone = digitsOnly(row.customer_phone);
  if (customerPhone.length >= 10) return customerPhone;

  const legacyPhone = digitsOnly(row.phone);
  if (legacyPhone.length >= 10) return legacyPhone;

  return "";
};

export const displayOrderPhone = (row: Pick<OrderRow, "customer_phone" | "phone">) => {
  const phoneDigits = orderPhoneDigits(row);
  if (!phoneDigits) return "-";
  return formatKoreanPhone(phoneDigits);
};

const KST_TIME_ZONE = "Asia/Seoul";

function getKstParts(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    yyyy: parts.year || "",
    mm: parts.month || "",
    dd: parts.day || "",
    day: (parts.weekday || "").replace("요일", ""),
    hh: parts.hour || "00",
    mi: parts.minute || "00",
  };
}

export function toDateKey(value: string | null | undefined) {
  const parts = getKstParts(value);
  if (!parts) return "";
  return `${parts.yyyy}-${parts.mm}-${parts.dd}`;
}

export function formatDateLabel(value: string | null | undefined) {
  const parts = getKstParts(value);
  if (!parts) return "-";
  return `${parts.yyyy}.${parts.mm}.${parts.dd}(${parts.day}) ${parts.hh}:${parts.mi}`;
}
