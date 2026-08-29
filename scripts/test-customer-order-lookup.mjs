// [2026-08-29] 손님 주문내역 조회 규칙 회귀 테스트
import {
  CUSTOMER_ORDER_LOOKUP_DAYS,
  CUSTOMER_ORDER_LOOKUP_LIMIT,
  customerOrderLookupSinceIso,
  normalizeLookupKakaoId,
  normalizeLookupPhone,
  buildOrderLookupOrFilter,
} from "../lib/customerOrderLookup.ts";

function assert(c, m) { if (!c) throw new Error(m); }
function equal(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${String(e)} actual=${String(a)}`); }

// 1. 조회 기간이 7일보다 충분히 길어야 한다 (해외원정방송 배송 2~3주 커버)
assert(CUSTOMER_ORDER_LOOKUP_DAYS >= 60, "조회 기간이 너무 짧다");
assert(CUSTOMER_ORDER_LOOKUP_LIMIT > 0, "조회 상한이 있어야 한다");

// 2. 실제 신고 사례 재현 — 루루짱929 님의 7월 주문이 조회 범위에 들어와야 한다
{
  const today = new Date("2026-08-29T00:00:00+09:00");
  const since = new Date(customerOrderLookupSinceIso(today));
  const julyOrder1 = new Date("2026-07-25T00:04:00+09:00");
  const julyOrder2 = new Date("2026-07-24T23:56:00+09:00");
  assert(julyOrder1 >= since, "7월 25일 주문이 조회 범위에 있어야 한다");
  assert(julyOrder2 >= since, "7월 24일 주문이 조회 범위에 있어야 한다");

  // 기존 7일 규칙이었다면 안 보였다는 것도 함께 못박아 둔다
  const old7 = new Date(today.getTime()); old7.setDate(old7.getDate() - 7);
  assert(julyOrder1 < old7, "기존 7일 규칙에서는 안 보였음이 맞다");
}

// 3. 카카오ID 우선, 전화번호 폴백
equal(
  buildOrderLookupOrFilter("123456789", "010-1234-5678"),
  "kakao_id.eq.123456789,and(kakao_id.is.null,customer_phone.eq.01012345678)",
  "카카오ID + 전화번호 필터",
);
equal(buildOrderLookupOrFilter("", "010-1234-5678"), null, "카카오ID 없으면 null(전화번호 폴백)");
equal(buildOrderLookupOrFilter("123", ""), "kakao_id.eq.123", "전화번호가 없으면 카카오ID만");

// 4. 필터 문자열 주입 방지 — 숫자가 아닌 값은 통과하면 안 된다
equal(normalizeLookupKakaoId("12a"), "", "숫자 아닌 카카오ID 거부");
equal(normalizeLookupKakaoId("1,2"), "", "쉼표 포함 카카오ID 거부");
equal(normalizeLookupKakaoId(" 987 "), "987", "공백은 정리");
equal(normalizeLookupPhone("010-1234-5678"), "01012345678", "전화번호 숫자만");
equal(normalizeLookupPhone("010)1234 5678,x"), "01012345678", "전화번호에서 기호 제거");
equal(buildOrderLookupOrFilter("1;drop", "010"), null, "위험한 카카오ID는 폴백 처리");

console.log("customer order lookup tests passed");
