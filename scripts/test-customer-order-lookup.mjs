// [2026-08-29] 손님 주문내역 조회 규칙 회귀 테스트
import {
  CUSTOMER_ORDER_LOOKUP_DAYS,
  CUSTOMER_ORDER_VISIBLE_DAYS,
  CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS,
  applyCustomerOrderVisibleWindow,
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

// 1. [㊿ 2026-10-20 사장님] 불러오기 30일 · 보이기 14일(해외배송 상품이 든 주문서는 30일)
//    (예전 「60일 이상」 단정은 180일 시절 기준 — 사장님 결정으로 바뀜)
equal(CUSTOMER_ORDER_LOOKUP_DAYS, 30, "불러오는 최대 범위 30일");
equal(CUSTOMER_ORDER_VISIBLE_DAYS, 14, "보이는 기간 14일");
equal(CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS, 30, "해외배송 주문서 보이는 기간 30일");
assert(CUSTOMER_ORDER_LOOKUP_DAYS >= CUSTOMER_ORDER_VISIBLE_DAYS_OVERSEAS, "불러오는 범위가 가장 긴 보이는 기간 이상이어야 한다");
assert(CUSTOMER_ORDER_LOOKUP_LIMIT > 0, "조회 상한이 있어야 한다");

// 2. 불러오기 범위 — 해외원정방송(배송 2~3주) 주문은 30일 안이라 불러와진다. (예전 7일 규칙에선 안 보였던 사례)
//    [㊿] 35일 전(예: 2026-07-25 → 08-29) 주문은 이제 범위 밖 — 180일 → 30일 사장님 결정.
{
  const today = new Date("2026-08-29T00:00:00+09:00");
  const since = new Date(customerOrderLookupSinceIso(today));
  const order20 = new Date("2026-08-09T12:00:00+09:00");
  const order35 = new Date("2026-07-25T00:04:00+09:00");
  assert(order20 >= since, "20일 전 주문은 불러오기 범위 안");
  assert(order35 < since, "35일 전 주문은 불러오기 범위 밖");
  const old7 = new Date(today.getTime()); old7.setDate(old7.getDate() - 7);
  assert(order20 < old7, "기존 7일 규칙에서는 안 보였음이 맞다");
}

// 3. 카카오ID 우선, 전화번호 폴백
// [2026-08-31] orders.customer_phone 은 숫자만/하이픈이 섞여 저장돼 있어
//   모든 저장형식으로 찾는다(하이픈 주문이 주문내역에서 통째로 사라지던 실사고).
equal(
  buildOrderLookupOrFilter("123456789", "010-1234-5678"),
  'kakao_id.eq.123456789,and(or(kakao_id.is.null,kakao_id.eq.""),customer_phone.in.(01012345678,010-1234-5678))',
  "카카오ID + 전화번호 필터(숫자·하이픈 모두)",
);
equal(
  buildOrderLookupOrFilter("123456789", "0264906376"),
  'kakao_id.eq.123456789,and(or(kakao_id.is.null,kakao_id.eq.""),customer_phone.in.(0264906376,026-490-6376,02-6490-6376))',
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

// 5. [㊿] 보이는 기간 거르기 — 가짜 supabase(상품 조회만)
{
  const now = new Date("2026-10-20T12:00:00+09:00");
  const daysAgo = (d) => new Date(now.getTime() - d * 86400000).toISOString();
  const products = [{ id: 1, badge_type: "none", badge_types: [] }, { id: 2, badge_type: "", badge_types: ["overseas"] }, { id: 3, badge_type: "overseas", badge_types: null }];
  let queried = 0;
  const fakeSupabase = (fail = false) => ({
    from(table) {
      equal(table, "products", "상품 표만 읽는다");
      return { select() { return { in(_col, ids) { queried += 1; return Promise.resolve(fail ? { data: null, error: new Error("boom") } : { data: products.filter((p) => ids.includes(String(p.id))), error: null }); } }; } };
    },
  });
  const rows = [
    { id: "a1", order_group_id: "A", created_at: daysAgo(10), product_id: 1 },              // 10일 전 일반 → 보임
    { id: "b1", order_group_id: "B", created_at: daysAgo(20), product_id: 1 },              // 20일 전 일반 → 숨김
    { id: "c1", order_group_id: "C", created_at: daysAgo(20), product_id: 1 },              // 20일 전, 같은 주문서에
    { id: "c2", order_group_id: "C", created_at: daysAgo(20), product_id: 2 },              //   해외배송 상품 → 주문서 통째로 보임
    { id: "d1", order_group_id: "D", created_at: daysAgo(35), product_id: 3 },              // 35일 전 해외 → 숨김(애초에 30일 밖)
    { id: "e1", order_group_id: "", created_at: daysAgo(25), product_id: 3 },               // 묶음 id 없음 → id 로, 25일 전 해외(옛 badge_type) → 보임
  ];
  const shown = await applyCustomerOrderVisibleWindow(fakeSupabase(), rows, now);
  equal(shown.map((r) => r.id).join(","), "a1,c1,c2,e1", "보이는 주문서(순서 유지)");
  equal(queried, 1, "상품 조회는 한 번만");

  const failed = await applyCustomerOrderVisibleWindow(fakeSupabase(true), rows, now);
  equal(failed.length, rows.length, "상품 조회 오류면 숨기지 않고 전부 보임");

  const recentOnly = [{ id: "x", created_at: daysAgo(3), product_id: 1 }];
  queried = 0;
  equal((await applyCustomerOrderVisibleWindow(fakeSupabase(), recentOnly, now)).length, 1, "14일 이내만 있으면 그대로");
  equal(queried, 0, "14일 이내만 있으면 상품 조회 안 함");
  equal((await applyCustomerOrderVisibleWindow(fakeSupabase(), [], now)).length, 0, "빈 목록");
}

console.log("customer order lookup tests passed");
