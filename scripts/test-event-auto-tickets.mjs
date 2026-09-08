// [2026-09-09] 자동 응모권 테스트 — 사장님이 숫자를 «하나도» 안 정하는 규칙이 의도대로 도는지.
//   ⚠ 확률 = 돈이다. 상한(5장)과 「아무도 0장이 되지 않는다」를 특히 확인한다.
import { autoTicketThresholds, calculateAutoTicketCount, AUTO_TICKET_MAX } from "../lib/eventRoulette.ts";

let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) pass++;
  else { fail++; console.log(`  ✗ ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

// ── 기준선: 그날 «결제완료 금액»에서 뽑는다. 0원(미입금)은 분포에서 뺀다.
const th = autoTicketThresholds([0, 10000, 50000, 100000, 200000, 0]);
check("기준 준비됨", th.ready, true);
check("중앙값", th.median, 50000);
check("상위권", th.top, 100000);

// ── 장수 계산
check("미입금·첫 구매 = 1장", calculateAutoTicketCount({ paidAmountSum: 0, visitCount: 1 }, th), 1);
check("중앙값만큼 삼 = 2장", calculateAutoTicketCount({ paidAmountSum: 50000, visitCount: 1 }, th), 2);
check("상위권 = 3장", calculateAutoTicketCount({ paidAmountSum: 100000, visitCount: 1 }, th), 3);
check("상위권 + 재방문(2회) = 4장", calculateAutoTicketCount({ paidAmountSum: 100000, visitCount: 2 }, th), 4);
check("상위권 + 단골(5회) = 5장", calculateAutoTicketCount({ paidAmountSum: 100000, visitCount: 5 }, th), 5);
check("상한 초과해도 5장", calculateAutoTicketCount({ paidAmountSum: 999999999, visitCount: 99 }, th), AUTO_TICKET_MAX);

// ── 아무도 입금 안 한 날: 금액 가산 없음, 단골 가산만
const none = autoTicketThresholds([0, 0, 0]);
check("결제완료 0명 = 기준 없음", none.ready, false);
check("금액 가산 없음", calculateAutoTicketCount({ paidAmountSum: 500000, visitCount: 1 }, none), 1);
check("단골 가산은 살아있음", calculateAutoTicketCount({ paidAmountSum: 0, visitCount: 5 }, none), 3);

// ── 「아무도 0장이 되지 않는다」 — 어떤 값이 와도 최소 1장
const weird = [
  { paidAmountSum: -1, visitCount: -1 },
  { paidAmountSum: NaN, visitCount: NaN },
  { paidAmountSum: 0, visitCount: 0 },
];
for (const [i, w] of weird.entries()) {
  const t = calculateAutoTicketCount(w, th);
  check(`이상값${i} 최소 1장`, t >= 1 && t <= AUTO_TICKET_MAX, true);
}

// ── 명단 1명뿐이어도 터지지 않는다
const one = autoTicketThresholds([30000]);
check("1명 기준 준비됨", one.ready, true);
check("1명 = 중앙값 = 상위권", one.median === one.top, true);

console.log(fail === 0 ? `event auto ticket tests passed (${pass})` : `FAILED ${fail}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
