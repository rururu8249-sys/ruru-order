// lib/admin-v2/formatters.ts
// 돈/전화번호/한국시간 표시 유틸
// 리팩토링 1단계: 기존 표시 로직 그대로 분리. 계산 결과 변경 없음.

import type { OrderRow } from "./types";
import { formatKoreanPhone as formatSharedPhone } from "@/lib/order/phone";

export const money = (value: unknown) => `${Number(value || 0).toLocaleString()}원`;
export const moneyNumber = (value: unknown) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
export const moneyInput = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

export const digitsOnly = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

// [2026-08-30] 표기는 lib/order/phone.ts 로 통일한다.
//   예전엔 여기서 010 기준(3-4-4 / 3-3-4)으로만 쪼개서 02-6490-6376 이
//   "026-490-6376" 으로 나갔다(사장님이 손님께 보낸 주문내역 문자 실사례).
export const formatKoreanPhone = (value: unknown) => {
  const digits = digitsOnly(value);
  if (!digits) return "-";
  return formatSharedPhone(digits) || "-";
};

export const orderPhoneDigits = (row: Pick<OrderRow, "customer_phone" | "phone">) => {
  const customerPhone = digitsOnly(row.customer_phone);
  if (customerPhone.length >= 9) return customerPhone;

  const legacyPhone = digitsOnly(row.phone);
  if (legacyPhone.length >= 9) return legacyPhone;

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
