// [2026-09-08] 이벤트 응모권 규칙 — 서버 계산(lib/eventRoulette) 검증
//   실행: node --import ./scripts/_ts-resolve.mjs scripts/test-event-tickets.mjs
import {
  DEFAULT_TICKET_RULE,
  buildRouletteParticipants,
  calculateTicketCount,
  normalizeTicketRule,
  pickRouletteWinner,
  ticketPercent,
} from "../lib/eventRoulette.ts";

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
}

// 1) 규칙 해석
{
  const off = normalizeTicketRule(null);
  equal(off.enabled, false, "기본 꺼짐");
  equal(off.unit, 50000, "기본 단위 5만원");
  equal(off.max, 5, "기본 최대 5장");
  const on = normalizeTicketRule({ useWeight: true, ticketUnit: "30000", ticketMax: "3" });
  equal(on.enabled && on.unit === 30000 && on.max === 3, true, "문자열 값도 해석");
  equal(normalizeTicketRule({ useWeight: "true", ticketUnit: 500, ticketMax: 99 }).unit, 10000, "단위 하한 1만원");
  equal(normalizeTicketRule({ useWeight: "true", ticketUnit: 500, ticketMax: 99 }).max, 20, "최대 상한 20장");
  equal(normalizeTicketRule({ useWeight: "yes" }).enabled, false, "true 가 아니면 꺼짐");
}

// 2) 장수 계산
{
  const rule = { enabled: true, unit: 50000, max: 5 };
  equal(calculateTicketCount(0, rule), 1, "0원 → 1장");
  equal(calculateTicketCount(49999, rule), 1, "4만9천 → 1장");
  equal(calculateTicketCount(50000, rule), 2, "5만 → 2장");
  equal(calculateTicketCount(149000, rule), 3, "14만9천 → 3장");
  equal(calculateTicketCount(1000000, rule), 5, "100만 → 최대 5장");
  equal(calculateTicketCount(1000000, DEFAULT_TICKET_RULE), 1, "규칙 꺼짐 → 무조건 1장");
}

// 3) 명단 만들기: 결제완료 금액만 장수에 반영, 꺼짐이면 전원 1장(예전 1~1.8배 가중치 없음)
{
  const orders = [
    { id: 1, youtube_nickname: "큰손", final_amount: 120000, admin_order_status_v2: "입금확인" },
    { id: 2, youtube_nickname: "큰손", final_amount: 80000, admin_order_status_v2: "미입금" },
    { id: 3, youtube_nickname: "새손님", final_amount: 30000, admin_order_status_v2: "입금확인" },
    { id: 4, youtube_nickname: "취소한사람", final_amount: 90000, admin_order_status_v2: "주문취소" },
  ];
  const isPaid = (o) => o.admin_order_status_v2 === "입금확인";
  const on = buildRouletteParticipants(orders, "live", { ticketRule: { enabled: true, unit: 50000, max: 5 }, isPaid });
  equal(on.length, 2, "취소 주문은 제외");
  const big = on.find((p) => p.nickname === "큰손");
  equal(big.amountSum, 200000, "전체 금액 합");
  equal(big.paidAmountSum, 120000, "결제완료 금액만");
  equal(big.weight, 3, "12만 결제완료 → 3장(미입금 8만은 안 셈)");
  equal(on.find((p) => p.nickname === "새손님").weight, 1, "3만 → 1장");
  const off = buildRouletteParticipants(orders, "live", { isPaid });
  equal(off.every((p) => p.weight === 1), true, "규칙 없으면 전원 1장");
  equal(ticketPercent(3, 4), 75, "확률 표시 3/4 = 75%");
}

// 4) 추첨은 장수 비율대로 (누적합 방식 — randomValue 로 결정적 검증)
{
  const ps = [
    { nickname: "A", orderCount: 1, qtySum: 1, amountSum: 0, orderIds: [], weight: 3 },
    { nickname: "B", orderCount: 1, qtySum: 1, amountSum: 0, orderIds: [], weight: 1 },
  ];
  equal(pickRouletteWinner(ps, 0.0).winner.nickname, "A", "0.00 → A");
  equal(pickRouletteWinner(ps, 0.74).winner.nickname, "A", "0.74 → A (3/4 구간)");
  equal(pickRouletteWinner(ps, 0.76).winner.nickname, "B", "0.76 → B");
  equal(pickRouletteWinner(ps, 0.0).totalWeight, 4, "총 장수 4");
}

console.log("event ticket tests passed");
