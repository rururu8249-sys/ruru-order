// components/admin-v2/payment/manualPaymentMatchSearchUtils.ts
// 목적: 수동 입금매칭 검색어 입력 시 표시할 입금내역만 필터링
// 주의: UI 검색 전용. 입금확인 저장, 자동매칭, 뱅크다, 금액계산, DB 저장 없음.

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function matchesManualPaymentSearch({
  keyword,
  depositName,
  amount,
}: {
  keyword: string;
  depositName: unknown;
  amount: unknown;
}) {
  const word = normalizeText(keyword);
  const amountKeyword = digitsOnly(keyword);

  if (word.length === 0 && amountKeyword.length === 0) {
    return false;
  }

  const normalizedDepositName = normalizeText(depositName);
  const depositAmountDigits = digitsOnly(amount);

  return (
    normalizedDepositName.includes(word) ||
    Boolean(amountKeyword && depositAmountDigits.includes(amountKeyword))
  );
}
