// lib/solapiBalanceFit.ts
// [2026-11-09 사장님 「예치금이 더 많은데 왜 실패야 · 돈이 모자라면 금액에 맞게 발송해줘」]
//   솔라피 약관 제7조 ②: 발송 때 «요금(공급가액) + 부가세(10%)»를 예치금에서 차감한다.
//   솔라피가 알려 주는 「차감금액」은 부가세 빼기 전 값이라, 차감금액 54,145 < 예치금 55,514.5 여도 실제로는 59,559.5 가 필요해 실패한다.
//   이 함수는 실패 문구의 숫자로 «지금 돈으로 보낼 수 있는 인원»을 계산한다(포인트는 발송 결제에 쓰인다는 근거가 없어 빼고 셈).
export function parseSolapiBalanceError(msg: string): { charge: number; balance: number; point: number; deposit: number } | null {
  const s = String(msg || "");
  if (!/NotEnoughBalance|잔액이 부족/.test(s)) return null;
  const get = (label: string) => { const m = new RegExp(`${label}\\s*:\\s*([\\d.]+)`).exec(s); return m ? Number(m[1]) : NaN; };
  const charge = get("차감금액"), balance = get("보유잔액"), point = get("보유포인트"), deposit = get("보유예치금");
  if (![charge, balance, deposit].every(Number.isFinite) || charge <= 0) return null;
  return { charge, balance, point: Number.isFinite(point) ? point : 0, deposit };
}

/** 보낼 수 있는 인원(부가세 10% 포함·1% 여유). 못 구하면 0. */
export function affordableAlertCount(msg: string, triedCount: number): number {
  const p = parseSolapiBalanceError(msg);
  if (!p || triedCount <= 0) return 0;
  const perPersonWithVat = (p.charge / triedCount) * 1.1;
  const money = p.balance + p.deposit;
  return Math.max(0, Math.floor((money / perPersonWithVat) * 0.99));
}

/** 잔액 맞춤 발송 뒤 사장님께 보여 줄 숫자(1명 요금·남은 사람 보내는 데 필요한 돈·발송 뒤 남은 예치금 추정). */
export function alertFitSummary(msg: string, triedCount: number, sentCount: number): { perPersonWon: number; notSent: number; needWon: number; depositBefore: number; depositAfterEst: number } | null {
  const p = parseSolapiBalanceError(msg);
  if (!p || triedCount <= 0) return null;
  const perPersonWon = Math.round((p.charge / triedCount) * 1.1 * 10) / 10;
  const notSent = Math.max(0, triedCount - sentCount);
  const money = p.balance + p.deposit;
  return { perPersonWon, notSent, needWon: Math.ceil(notSent * perPersonWon), depositBefore: money, depositAfterEst: Math.max(0, Math.round(money - sentCount * perPersonWon)) };
}
