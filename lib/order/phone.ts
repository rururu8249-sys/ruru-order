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

// [2026-08-30 손님 화면 오표기] 02-6490-6376 이 "026-4906-376" 으로 보였다.
//   010 기준(앞 3자리)으로만 쪼개고 있었기 때문. 일반전화를 열었으니 지역번호도 제대로 쪼갠다.
//   · 02  → 02-6490-6376 (10자리) / 02-777-1234 (9자리)
//   · 그 밖 → 010-1234-5678 (11자리) / 031-668-0167 (10자리)
//   입력 도중(자릿수가 덜 찬 상태)에도 깨지지 않아야 한다.
export const formatOrderPhone = (value: string) => {
  const numbers = onlyOrderPhoneDigits(value);

  if (numbers.startsWith("02")) {
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 2)}-${numbers.slice(2, 5)}-${numbers.slice(5)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
  }

  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  if (numbers.length === 10) return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`;

  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

// [2026-08-30 사장님 결정] 집·사무실 전화(02 등)로도 주문서를 낼 수 있게 허용한다.
//   확인한 사실(코드 전수 확인):
//     · 입금 자동매칭(Bankda) → 입금자명 + 금액 기준. 전화번호 안 씀.
//     · 택배 연락 → 배송지 연락처(recipient_phone). 주문자 번호 안 씀.
//     · 정산 / 포인트 / 합배송 / 주문조회 → 번호를 열쇠로만 쓰므로 형식과 무관.
//     · 방송 알림톡(SOLAPI) → 이 번호로 감. 일반전화는 못 받음(발송 실패로 끝, 사고 아님).
//     · 카드결제 링크 → 휴대폰이 필요. 관리자 카드결제 창에서 경고로 알린다.
//   막은 이유가 "돈이 깨져서"가 아니라 "알림톡을 못 받아서"였으므로, 주문 자체는 막지 않는다.
//   허용 대상은 국내 번호만. 해외 번호는 자릿수 규칙이 제각각이라 여기서 다루지 않는다.

// 휴대폰 (010/011/016/017/018/019)
export const isMobileOrderPhone = (value: string) =>
  /^01[016789][0-9]{7,8}$/.test(onlyOrderPhoneDigits(value));

// 국내 일반전화 · 인터넷전화
//   02(서울) 9~10자리 / 지역번호(031~064) 10~11자리 / 070(인터넷) 11자리
//   ※ 시스템 전체 최소 자릿수도 9 로 통일했다(2026-08-30, 20개 파일).
export const isLandlineOrderPhone = (value: string) => {
  const d = onlyOrderPhoneDigits(value);
  // 02 는 9자리(02-777-1234) · 10자리(02-1234-5678) 둘 다 허용.
  //   [2026-08-30] 예전엔 시스템 전체가 "전화번호 10자리 이상"을 전제로 만들어져 있어
  //   9자리를 열면 포인트·합배송·주문조회·차단확인이 조용히 안 되는 상태가 됐다.
  //   → 최소 자릿수를 9로 통일하고(20개 파일 43군데) 여기서도 연다.
  if (/^02[0-9]{7,8}$/.test(d)) return true;
  if (/^0(3[1-3]|4[1-4]|5[1-5]|6[1-4])[0-9]{7,8}$/.test(d)) return true; // 031~064 (10~11자리)
  if (/^070[0-9]{8}$/.test(d)) return true;                              // 070 인터넷전화
  return false;
};

// 주문서 제출에 쓸 수 있는 번호인가 (휴대폰 또는 국내 일반전화)
export const isOrderablePhone = (value: string) =>
  isMobileOrderPhone(value) || isLandlineOrderPhone(value);
