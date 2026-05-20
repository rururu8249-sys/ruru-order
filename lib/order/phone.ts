// lib/order/phone.ts
// 목적: 주문/고객 전화번호 입력값 정리 전용 유틸
// 주의: 주문금액, 배송비, 합배송, 입금, DB 저장 로직 없음.

export const ORDER_PHONE_MAX_DIGITS = 11;

// 화면 표시 기준: 010-1111-2222 = 13자
export const ORDER_PHONE_FORMAT_MAX_LENGTH = 13;

export const onlyOrderPhoneDigits = (value: string) => {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, ORDER_PHONE_MAX_DIGITS);
};

export const normalizeOrderPhone = (value: string) => {
  return onlyOrderPhoneDigits(value);
};

export const formatOrderPhone = (value: string) => {
  const numbers = onlyOrderPhoneDigits(value);

  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;

  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};
