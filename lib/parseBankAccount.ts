// [2026-09-26] 계좌 정보 붙여넣기 → 은행/계좌번호/예금주 자동 인식. 순수 함수(외부 호출 없음).
//   ⚠️ 돈을 만들지 않는다. 사람이 붙여넣은 텍스트를 «파싱»만. 붙여넣은 원문은 저장하지 않는다(호출부 책임).

// 은행 별칭 → 기존 select 값. 긴 별칭이 먼저 매칭되도록 아래에서 길이순 정렬해 쓴다.
const BANK_ALIASES: Array<[string, string]> = [
  ["국민은행", "국민"], ["케이비", "국민"], ["KB", "국민"], ["국민", "국민"],
  ["신한은행", "신한"], ["신한", "신한"],
  ["우리은행", "우리"], ["우리", "우리"],
  ["하나은행", "하나"], ["KEB", "하나"], ["하나", "하나"],
  ["농협은행", "농협"], ["농협", "농협"], ["NH", "농협"],
  ["기업은행", "기업"], ["IBK", "기업"], ["기업", "기업"],
  ["카카오뱅크", "카카오뱅크"], ["카카오", "카카오뱅크"], ["카뱅", "카카오뱅크"],
  ["토스뱅크", "토스뱅크"], ["토스", "토스뱅크"],
  ["케이뱅크", "케이뱅크"], ["K뱅크", "케이뱅크"], ["케이", "케이뱅크"],
  ["새마을금고", "새마을"], ["새마을", "새마을"], ["MG", "새마을"],
  ["우체국", "우체국"],
  ["SC제일", "SC제일"], ["SC", "SC제일"], ["제일", "SC제일"],
  ["부산은행", "부산"], ["부산", "부산"],
  ["아이엠뱅크", "대구"], ["대구은행", "대구"], ["대구", "대구"], ["iM", "대구"],
  ["경남은행", "경남"], ["경남", "경남"],
  ["광주은행", "광주"], ["광주", "광주"],
  ["전북은행", "전북"], ["전북", "전북"],
  ["수협은행", "수협"], ["수협", "수협"],
  ["신협", "신협"],
];

export type ParsedBankAccount = { bank: string; account: string; holder: string; ok: boolean; missing: string[] };

function findBank(text: string): { bank: string; matched: string } {
  const t = text;
  // 긴 별칭 우선(길이 desc). 대소문자 무시.
  const sorted = [...BANK_ALIASES].sort((a, b) => b[0].length - a[0].length);
  const lower = t.toLowerCase();
  for (const [alias, value] of sorted) {
    if (lower.includes(alias.toLowerCase())) return { bank: value, matched: alias };
  }
  return { bank: "", matched: "" };
}

function findAccount(text: string): string {
  // 숫자·공백·하이픈 덩어리 후보
  const candidates = (text.match(/[0-9][0-9\s-]{6,}[0-9]/g) || []).map((c) => c.replace(/\D/g, ""));
  const valid = candidates.filter((d) => d.length >= 10 && d.length <= 16 && !(d.length === 11 && d.startsWith("010")));
  if (valid.length === 0) return "";
  return valid.sort((a, b) => b.length - a.length)[0]; // 가장 긴 것
}

function findHolder(text: string, bankMatched: string, account: string): string {
  let t = text;
  if (bankMatched) t = t.split(bankMatched).join(" ");
  // 계좌번호가 들어간 숫자 덩어리 통째 제거
  t = t.replace(/[0-9][0-9\s-]{6,}[0-9]/g, " ");
  t = t.replace(/은행|예금주|계좌|님/g, " ");
  // 남은 한글 2~5자
  const m = t.match(/[가-힣]{2,5}/g);
  if (!m) return "";
  // 계좌 숫자와 겹치지 않는 첫 한글 이름
  return m[0];
}

export function parseBankAccount(raw: unknown): ParsedBankAccount {
  const text = String(raw ?? "").trim();
  if (!text) return { bank: "", account: "", holder: "", ok: false, missing: ["bank", "account", "holder"] };
  const { bank, matched } = findBank(text);
  const account = findAccount(text);
  const holder = findHolder(text, matched, account);
  const missing: string[] = [];
  if (!bank) missing.push("bank");
  if (!account) missing.push("account");
  if (!holder) missing.push("holder");
  return { bank, account, holder, ok: missing.length === 0, missing };
}

// 계좌번호 마스킹(요약 표시용) — 앞 6자리 + 가운데 마스킹 + 뒤 표기 제거. 뒷자리는 노출 최소화.
export function maskAccountForSummary(account: unknown): string {
  const d = String(account ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-**-******`;
}
