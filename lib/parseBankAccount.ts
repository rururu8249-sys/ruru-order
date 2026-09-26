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

export type ParsedBankAccount = {
  bank: string; account: string; holder: string; ok: boolean; missing: string[];
  holderConfidence: "high" | "low" | "none";
};

// [2026-09-26 7차] «우리 아이»·«하나만» 처럼 은행이 아닌 문맥 오인식 방지.
//   해당 별칭 바로 뒤가 이 낱말이면 은행으로 안 본다(단 「은행/뱅크」가 붙어 있으면 은행 확정).
const AMBIGUOUS_BANK_NEXT: Record<string, RegExp> = {
  "우리": /^(아이|애기|애들|엄마|아빠|딸|아들|집|가족|신랑|남편|강아지|고양이|둘|셋|넷|친정|시댁|회사|가게)/,
  "하나": /^(님|씩|만|밖에|뿐|하나|씩만)/,
  "기업": /^(은|이|가|에서|의)/,
};

function findBank(text: string): { bank: string; matched: string } {
  // 긴 별칭 우선(길이 desc). 대소문자 무시.
  const sorted = [...BANK_ALIASES].sort((a, b) => b[0].length - a[0].length);
  const lower = text.toLowerCase();
  for (const [alias, value] of sorted) {
    const idx = lower.indexOf(alias.toLowerCase());
    if (idx < 0) continue;
    const guard = AMBIGUOUS_BANK_NEXT[alias];
    if (guard) {
      const head = text.slice(idx, idx + alias.length + 2); // 「우리은행」 여부
      const after = text.slice(idx + alias.length).replace(/^\s+/, "");
      if (!/은행|뱅크/.test(head) && guard.test(after)) continue; // 은행 아님 → 다음 별칭
    }
    return { bank: value, matched: alias };
  }
  return { bank: "", matched: "" };
}

function findAccountAt(text: string): { account: string; start: number; end: number } {
  const re = /[0-9][0-9\s-]{6,}[0-9]/g;
  let best = { account: "", start: -1, end: -1 };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 16) continue;
    if (digits.length === 11 && digits.startsWith("010")) continue; // 휴대폰 제외
    if (digits.length > best.account.length) best = { account: digits, start: m.index, end: m.index + m[0].length };
  }
  return best;
}

// [2026-09-26] 예금주 후보에서 뺄 말(어미·조사·잡단어). 긴 것 먼저 제거.
const HOLDER_EXCLUDE_MULTI = [
  "보내주세요", "부탁드려요", "감사합니다", "안녕하세요", "계좌번호", "예금주", "입금자", "송금인", "드려요", "주세요",
  "입니다", "이에요", "이구요", "으로", "예요", "이요", "이고", "본인", "명의", "이름", "고객", "환불", "입금", "송금",
  "부탁", "계좌", "번호", "은행", "뱅크", "빨리", "해주세요",
];
// 완성형(그 자체가 이름이 아님) — 저장된 예금주 검증에도 쓴다.
const HOLDER_EXCLUDE_WORDS = new Set([...HOLDER_EXCLUDE_MULTI, "님", "씨", "요", "로", "에"]);

// [2026-09-26 7차] 흔한 성씨(상위 100) + 복성 — 예금주 후보 판정용.
const SURNAMES = new Set(("김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 유 전 홍 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 나 진 지 엄 채 원 천 방 공 현 함 변 염 여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 왕 금 옥 육 인 맹 제 모 탁 국 어 은 편 용 예 경 봉 사 부 가 복 태 목 형 피 두 감 호 라 계 동 순").split(" "));
const COMPOUND_SURNAMES = ["남궁", "황보", "제갈", "선우", "독고", "사공", "서문"];

const JOSA_TAIL = /(이에요|이예요|예요|이요|입니다|이고|이구요|이구|으로|에게|한테|께|이야|님|씨|요|로|에|이|가|은|는|을|를|의|야)+$/;

/** 저장된 예금주가 «제외 단어»(입니다 등)면 true — 처리창 열 때 확인 안내용. */
export function isExcludedHolder(name: unknown): boolean {
  const n = String(name ?? "").trim();
  if (!n) return false;
  return HOLDER_EXCLUDE_WORDS.has(n);
}

// 한글 토막 → 이름 후보(성씨로 시작·2~4자). 아니면 "".
function toNameCandidate(run: string): string {
  let s = run.replace(JOSA_TAIL, "");
  if (s.length < 2 || s.length > 4) s = run; // 조사 제거가 이름을 깎으면 원본으로 한 번 더 판정
  s = s.replace(JOSA_TAIL, "");
  if (HOLDER_EXCLUDE_WORDS.has(s)) return "";
  if (s.length < 2 || s.length > 4) return "";
  if (/^우리/.test(s)) return ""; // 「우리엄마」 등 — 이름 아님
  if (COMPOUND_SURNAMES.some((c) => s.startsWith(c)) && s.length >= 3) return s;
  if (SURNAMES.has(s[0])) return s;
  return "";
}

function findHolder(
  text: string,
  bankMatched: string,
  acc: { start: number; end: number },
  customerName: string,
): { holder: string; confidence: "high" | "low" | "none" } {
  // 은행 별칭 위치만 공백으로(다른 글자 위치는 보존 — 우선순위 계산에 index 사용)
  let masked = text;
  if (bankMatched) {
    const bi = masked.toLowerCase().indexOf(bankMatched.toLowerCase());
    if (bi >= 0) masked = masked.slice(0, bi) + " ".repeat(bankMatched.length) + masked.slice(bi + bankMatched.length);
  }
  // 다글자 제외 단어 위치를 공백으로(index 보존)
  for (const w of HOLDER_EXCLUDE_MULTI) {
    let i = masked.indexOf(w);
    while (i >= 0) { masked = masked.slice(0, i) + " ".repeat(w.length) + masked.slice(i + w.length); i = masked.indexOf(w); }
  }
  // 계좌 숫자 덩어리도 공백으로(index 보존)
  masked = masked.replace(/[0-9][0-9\s-]{5,}[0-9]/g, (m) => " ".repeat(m.length));

  // 한글 토막 → 이름 후보 + 위치
  const cands: { name: string; index: number }[] = [];
  const re = /[가-힣]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const name = toNameCandidate(m[0]);
    if (name) cands.push({ name, index: m.index });
  }
  if (cands.length === 0) return { holder: "", confidence: "none" };

  const cn = String(customerName ?? "").trim();

  // ① 「예금주/이름/명의」 근처(양쪽) — 한국어는 「예금주 홍길동」·「이순자 명의」 둘 다 쓴다.
  const kwRe = /(예금주|이름|명의)/g;
  const kwRanges: { start: number; end: number }[] = [];
  let km: RegExpExecArray | null;
  while ((km = kwRe.exec(text)) !== null) kwRanges.push({ start: km.index, end: km.index + km[0].length });
  if (kwRanges.length > 0) {
    const dist = (c: { index: number; name: string }) =>
      Math.min(...kwRanges.map((k) => (c.index >= k.end ? c.index - k.end : k.start - (c.index + c.name.length))));
    const nearest = [...cands].sort((a, b) => dist(a) - dist(b))[0];
    if (nearest) return { holder: nearest.name, confidence: "high" };
  }
  // ② 계좌번호 바로 뒤
  if (acc.end >= 0) {
    const after = cands.filter((c) => c.index >= acc.end).sort((a, b) => a.index - b.index)[0];
    if (after) return { holder: after.name, confidence: "high" };
  }
  // ④ 손님 이름과 같은 후보(③보다 확신) → high
  if (cn) {
    const same = cands.find((c) => c.name === cn);
    if (same) return { holder: same.name, confidence: "high" };
  }
  // ③ 계좌번호 바로 앞
  if (acc.start >= 0) {
    const before = cands.filter((c) => c.index < acc.start).sort((a, b) => b.index - a.index)[0];
    if (before) return { holder: before.name, confidence: "low" };
  }
  // ⑤ 나머지 첫 후보
  return { holder: cands[0].name, confidence: "low" };
}

export function parseBankAccount(raw: unknown, customerName?: unknown): ParsedBankAccount {
  const text = String(raw ?? "").trim();
  if (!text) return { bank: "", account: "", holder: "", ok: false, missing: ["bank", "account", "holder"], holderConfidence: "none" };
  const { bank, matched } = findBank(text);
  const acc = findAccountAt(text);
  const account = acc.account;
  const { holder, confidence } = findHolder(text, matched, acc, String(customerName ?? ""));
  const missing: string[] = [];
  if (!bank) missing.push("bank");
  if (!account) missing.push("account");
  if (!holder) missing.push("holder");
  return { bank, account, holder, ok: missing.length === 0, missing, holderConfidence: confidence };
}

// [2026-09-26] 은행 저장값 → 전체 표시 이름(표시 전용, 저장값 불변). 모르는 값은 원문 그대로.
const BANK_DISPLAY: Record<string, string> = {
  국민: "국민은행", 신한: "신한은행", 우리: "우리은행", 하나: "하나은행",
  농협: "NH농협은행", 기업: "IBK기업은행", SC제일: "SC제일은행",
  카카오뱅크: "카카오뱅크", 토스뱅크: "토스뱅크", 케이뱅크: "케이뱅크",
  새마을: "새마을금고", 우체국: "우체국", 신협: "신협",
  대구: "iM뱅크(대구)", 부산: "부산은행", 경남: "경남은행", 광주: "광주은행",
  전북: "전북은행", 수협: "수협은행",
};
export function bankDisplayName(value: unknown): string {
  const k = String(value ?? "").trim();
  if (!k) return "";
  return BANK_DISPLAY[k] || k;
}

// 계좌번호 마스킹(요약 표시용) — 앞 6자리 + 가운데 마스킹 + 뒤 표기 제거. 뒷자리는 노출 최소화.
export function maskAccountForSummary(account: unknown): string {
  const d = String(account ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-**-******`;
}
