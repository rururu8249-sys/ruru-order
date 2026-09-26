// [2026-09-26] 환불 상품금액(돌려받을 상품 선택) 계산 테스트
import { lineRefundAmount, computeRefundBase, computeAmountFinal, adjRowsToStored } from "../lib/refundLedger.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`); pass++; }

// 두 줄: A 12,000×1, B 30,000×1
const A = { lineTotal: 12000, qty: 1, unit: 12000, selectedQty: 1 };
const B = { lineTotal: 30000, qty: 1, unit: 30000, selectedQty: 1 };
const shipping = 4000;

// 1개만 체크 → 그 줄만
eq(computeRefundBase([A, { ...B, selectedQty: 0 }], false, shipping), 12000, "1개만 체크→그 줄 금액");
// 둘 다 체크
eq(computeRefundBase([A, B], false, shipping), 42000, "둘 다 체크 합계");
// 배송비 기본 제외
eq(computeRefundBase([A], false, shipping), 12000, "배송비 기본 제외");
// 배송비 체크 → 포함
eq(computeRefundBase([A], true, shipping), 16000, "배송비 체크→포함");

// 수량 일부 선택: 24,000(2개) 중 1개 → 단가 12,000
const C = { lineTotal: 24000, qty: 2, unit: 12000, selectedQty: 1 };
eq(lineRefundAmount(C), 12000, "2개 중 1개→단가");
eq(lineRefundAmount({ ...C, selectedQty: 2 }), 24000, "2개 전량→줄합계");
eq(lineRefundAmount({ ...C, selectedQty: 0 }), 0, "0개→0");
eq(lineRefundAmount({ ...C, selectedQty: 5 }), 24000, "주문수량 초과→최대 전량");

// 반올림: 전량이면 줄합계 그대로(단가×수량 오차 없음)
const D = { lineTotal: 10000, qty: 3, unit: 3333, selectedQty: 3 };
eq(lineRefundAmount(D), 10000, "전량은 줄합계(3333×3=9999 아님)");
eq(lineRefundAmount({ ...D, selectedQty: 1 }), 3333, "일부는 단가×수량");

// 차감/추가 합산 (최종 = base + 조정)
{
  const base = computeRefundBase([A, B], true, shipping); // 42000 + 4000 = 46000
  eq(base, 46000, "상품+배송비 base");
  const adj = adjRowsToStored([{ label: "반품배송비", sign: "차감", amount: 4000 }, { label: "보상", sign: "추가", amount: 1000 }]);
  eq(computeAmountFinal(base, adj), 43000, "46,000 − 4,000 + 1,000 = 43,000");
}

// 매칭 실패 → 줄 없음 → base 0 (수동 입력이 대체)
eq(computeRefundBase([], false, 0), 0, "매칭 실패→줄 합계 0(수동 입력)");

// 포인트 사용 주문이라도 자동 차감 없음 — computeRefundBase 는 pointUsed 인자를 아예 받지 않는다
{
  const base = computeRefundBase([A], false, shipping); // 12000
  eq(base, 12000, "포인트 사용과 무관하게 상품금액 그대로(자동차감 없음)");
}

console.log(`✅ refund-amount 계산 ${pass}건 통과`);
