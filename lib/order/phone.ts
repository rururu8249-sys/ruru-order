// lib/order/phone.ts
// 목적: 주문/고객 전화번호 입력값 정리 전용 유틸
// 주의: 주문금액, 배송비, 합배송, 입금, DB 저장 로직 없음.

export const ORDER_PHONE_MAX_DIGITS = 11;

// 화면 표시 기준: 010-1111-2222 = 13자
export const ORDER_PHONE_FORMAT_MAX_LENGTH = 13;

// [2026-08-30 손님 문의] "휴대폰 번호를 확인해 주세요" 오류가 계속 났다.
//   원인: 국제형식(+82 10-1234-5678)이 들어오면 82 를 떼기 전에 11자리로 먼저 잘라서
//        "82101234567" 이 되고, 01 로 시작하지 않아 검증에 걸렸다.
//   → 나라번호(82)를 먼저 떼고 나서 자른다. 카카오 로그인 쪽(normalizeKakaoPhone)과 같은 규칙.
const stripKoreaCountryCode = (raw: string) => {
  // 00822…, 00082… 처럼 국제접속번호(00)가 앞에 붙어 오는 경우도 있다.
  const digits = raw.replace(/^0+82/, "82");
  if (digits.startsWith("82010")) return `010${digits.slice(5)}`;   // 82 + 010…
  if (digits.startsWith("8210")) return `010${digits.slice(4)}`;    // 82 + 10…  (앞 0 생략형)
  if (digits.startsWith("82") && digits.length > 10) return `0${digits.slice(2)}`; // 82 + 지역번호 등
  return raw;
};

export const onlyOrderPhoneDigits = (value: string) => {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  return stripKoreaCountryCode(digits).slice(0, ORDER_PHONE_MAX_DIGITS);
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
