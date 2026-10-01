// [2026-08-29] 손님 주문내역 조회 규칙 회귀 테스트
import {
  CUSTOMER_ORDER_LOOKUP_DAYS,
  CUSTOMER_ORDER_LOOKUP_LIMIT,
  customerOrderLookupSinceIso,
  normalizeLookupKakaoId,
  normalizeLookupPhone,
  buildOrderLookupOrFilter,
} from "../lib/customerOrderLookup.ts";
import { resolveOrderGroupBankAccount } from "../lib/orderBankAccount.ts";
import { readFile } from "node:fs/promises";

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
// [2026-08-31] orders.customer_phone 은 숫자만/하이픈이 섞여 저장돼 있어
//   모든 저장형식으로 찾는다(하이픈 주문이 주문내역에서 통째로 사라지던 실사고).
equal(
  buildOrderLookupOrFilter("123456789", "010-1234-5678"),
  "kakao_id.eq.123456789,and(kakao_id.is.null,customer_phone.in.(01012345678,010-1234-5678))",
  "카카오ID + 전화번호 필터(숫자·하이픈 모두)",
);
equal(
  buildOrderLookupOrFilter("123456789", "0264906376"),
  "kakao_id.eq.123456789,and(kakao_id.is.null,customer_phone.in.(0264906376,026-490-6376,02-6490-6376))",
  "서울 10자리는 옛 표기(026-…)와 새 표기(02-…)까지 모두",
);
equal(buildOrderLookupOrFilter("", "010-1234-5678"), null, "카카오ID 없으면 null(전화번호 폴백)");
equal(buildOrderLookupOrFilter("123", ""), "kakao_id.eq.123", "전화번호가 없으면 카카오ID만");

// 폴백용 후보 목록도 검증
import { orderLookupPhoneValues } from "../lib/customerOrderLookup.ts";
equal(orderLookupPhoneValues("010-1234-5678").join("|"), "01012345678|010-1234-5678", "폴백 후보(휴대폰)");
equal(orderLookupPhoneValues("0264906376").join("|"), "0264906376|026-490-6376|02-6490-6376", "폴백 후보(서울)");
equal(orderLookupPhoneValues("").length, 0, "빈 번호는 빈 목록");

// 4. 필터 문자열 주입 방지 — 숫자가 아닌 값은 통과하면 안 된다
equal(normalizeLookupKakaoId("12a"), "", "숫자 아닌 카카오ID 거부");
equal(normalizeLookupKakaoId("1,2"), "", "쉼표 포함 카카오ID 거부");
equal(normalizeLookupKakaoId(" 987 "), "987", "공백은 정리");
equal(normalizeLookupPhone("010-1234-5678"), "01012345678", "전화번호 숫자만");
equal(normalizeLookupPhone("010)1234 5678,x"), "01012345678", "전화번호에서 기호 제거");
equal(buildOrderLookupOrFilter("1;drop", "010"), null, "위험한 카카오ID는 폴백 처리");

// 5. 주문 그룹 계좌 스냅샷은 모든 행이 같아야 하며, 추정해서 하나를 고르면 안 된다.
const legacyFallback = { id: "primary", bankName: "국민은행", bankAccount: "111-222-333333", bankHolder: "홍길동" };
const savedRow = {
  customer_order_segment: "first_order",
  payment_bank_account_id: "secondary",
  payment_bank_name: "신한은행",
  payment_bank_account: "444-555-666666",
  payment_bank_holder: "김루루",
};
{
  const resolved = resolveOrderGroupBankAccount([savedRow, { ...savedRow }], legacyFallback);
  equal(resolved.status, "snapshot", "같은 스냅샷 행은 주문 계좌로 사용");
  equal(resolved.bankAccount?.id, "secondary", "저장 계좌 ID");
}
{
  const resolved = resolveOrderGroupBankAccount(
    [savedRow, { ...savedRow, payment_bank_account: "999-999-999999" }],
    legacyFallback,
  );
  equal(resolved.status, "conflict", "그룹 내 다른 계좌는 충돌");
  equal(resolved.bankAccount, undefined, "충돌 계좌를 임의로 고르지 않음");
}
{
  const resolved = resolveOrderGroupBankAccount([{}], legacyFallback);
  equal(resolved.status, "legacy", "마이그레이션 전 주문은 legacy 폴백");
  equal(resolved.bankAccount?.bankAccount, legacyFallback.bankAccount, "legacy primary 계좌");
}
{
  const resolved = resolveOrderGroupBankAccount([{ payment_bank_name: "일부만" }], legacyFallback);
  equal(resolved.status, "conflict", "불완전 스냅샷은 추정 금지");
}

const lookupSheet = await readFile(new URL("../components/customer/CustomerOrderLookupBottomSheet.tsx", import.meta.url), "utf8");
assert(/onOpenPaymentGuide:\s*\(group:\s*CustomerOrderLookupGroup\)/.test(lookupSheet), "선택한 주문 그룹을 콜백으로 넘겨야 한다");
assert(/group\.paymentMethodLabel\s*===\s*"무통장입금"/.test(lookupSheet), "무통장 주문에만 계좌 버튼을 보여야 한다");
assert(/group\.bankAccountStatus\s*===\s*"conflict"/.test(lookupSheet), "충돌 주문은 고객 안내를 보여야 한다");

console.log("customer order lookup tests passed");
