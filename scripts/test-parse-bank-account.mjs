// [2026-09-26] 계좌 붙여넣기 파서 테스트
import { parseBankAccount, maskAccountForSummary, bankDisplayName, isExcludedHolder } from "../lib/parseBankAccount.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`); pass++; }
function ok(c, m) { if (!c) throw new Error(m); pass++; }

// 표준
{ const r = parseBankAccount("국민은행 461302 04 112708 홍채윤"); eq(r.bank, "국민", "국민은행→국민"); eq(r.account, "46130204112708", "계좌 숫자만"); eq(r.holder, "홍채윤", "예금주"); ok(r.ok, "ok"); }
{ const r = parseBankAccount("KB 46130204112708 홍채윤"); eq(r.bank, "국민", "KB→국민"); eq(r.account, "46130204112708", "붙은 계좌"); eq(r.holder, "홍채윤", "예금주2"); }
{ const r = parseBankAccount("카뱅 3333-01-2345678 김영희"); eq(r.bank, "카카오뱅크", "카뱅→카카오뱅크"); eq(r.account, "3333012345678", "카뱅 계좌"); eq(r.holder, "김영희", "예금주3"); }
{ const r = parseBankAccount("홍길동 농협 302-1234-5678-91"); eq(r.bank, "농협", "농협"); eq(r.account, "30212345678 91".replace(/\D/g,""), "농협 계좌"); eq(r.holder, "홍길동", "이름 앞"); }
{ const r = parseBankAccount("신한 110 123 456789"); eq(r.bank, "신한", "신한"); eq(r.account, "110123456789", "공백 계좌"); eq(r.holder, "", "예금주 없음→빈칸"); ok(r.missing.includes("holder"), "holder missing"); }
// 전화번호 제외
{ const r = parseBankAccount("010-1234-5678 국민 123456-01-234567 이순자"); eq(r.bank, "국민", "국민(전화섞임)"); eq(r.account, "12345601234567", "전화 제외 계좌"); eq(r.holder, "이순자", "이름"); ok(!r.account.startsWith("010"), "010 전화 제외"); }
// 긴 별칭 우선
{ const r = parseBankAccount("카카오뱅크 3333012345678 박카카"); eq(r.bank, "카카오뱅크", "카카오뱅크 우선"); }
{ const r = parseBankAccount("케이뱅크 100123456789 최케이"); eq(r.bank, "케이뱅크", "케이뱅크 우선(케이 아님)"); }
{ const r = parseBankAccount("국민 12345678901 김국민"); eq(r.bank, "국민", "국민 단독"); }
// 은행명 없음
{ const r = parseBankAccount("12345678901234 무은행"); eq(r.bank, "", "은행 없음"); eq(r.account, "12345678901234", "계좌만"); ok(r.missing.includes("bank"), "bank missing"); }
// 빈 문자열
{ const r = parseBankAccount(""); eq(r.bank, "", "빈-은행"); eq(r.account, "", "빈-계좌"); eq(r.holder, "", "빈-예금주"); ok(!r.ok, "빈-실패"); }
{ const r = parseBankAccount("   "); ok(!r.ok, "공백만-실패"); }
// 하나·기업·토스·우체국·수협
{ eq(parseBankAccount("하나 12312312312 김하나").bank, "하나", "하나"); }
{ eq(parseBankAccount("IBK 12312312312 김기업").bank, "기업", "IBK→기업"); }
{ eq(parseBankAccount("토스 100012345678 김토스").bank, "토스뱅크", "토스→토스뱅크"); }
{ eq(parseBankAccount("우체국 013412345678 김우체").bank, "우체국", "우체국"); }
// 계좌 자릿수 경계(10~16)
{ eq(parseBankAccount("국민 123456789 김짧").account, "", "9자리 제외"); }
{ eq(parseBankAccount("국민 12345678901234567 김긺").account, "", "17자리 제외"); }
// 마스킹
eq(maskAccountForSummary("46130204112708"), "461302-**-******", "마스킹");
eq(maskAccountForSummary("12345"), "12345", "짧으면 그대로");

// ── [4차 item 1] 예금주 제외 단어 ──
{ const r = parseBankAccount("신한 91304888454 입니다"); eq(r.holder, "", "‘입니다’ 제외→빈칸"); ok(r.missing.includes("holder"), "holder missing(입니다)"); }
{ const r = parseBankAccount("국민 46130204112708 홍채윤 입니다"); eq(r.holder, "홍채윤", "홍채윤(입니다 뒤섞임)"); }
{ const r = parseBankAccount("농협 302-1234-5678-91 김영희님이요"); eq(r.holder, "김영희", "김영희(님이요 제거)"); }
{ const r = parseBankAccount("카뱅 3333012345678로 보내주세요"); eq(r.holder, "", "보내주세요→빈칸"); }
{ const r = parseBankAccount("국민 12345678901 이에요"); eq(r.holder, "", "이에요→빈칸"); }
{ const r = parseBankAccount("신한 110123456789 예금주 박서준"); eq(r.holder, "박서준", "예금주 단어 제거 후 이름"); }
{ const r = parseBankAccount("우리 1002123456789 본인 명의 이순자"); eq(r.holder, "이순자", "본인·명의 제거"); }
{ const r = parseBankAccount("국민 12345678901 김하나 감사합니다"); eq(r.holder, "김하나", "감사합니다 제거"); }
// isExcludedHolder
ok(isExcludedHolder("입니다"), "isExcluded 입니다"); ok(isExcludedHolder("보내주세요"), "isExcluded 보내주세요");
ok(!isExcludedHolder("홍채윤"), "isExcluded 홍채윤 false"); ok(!isExcludedHolder(""), "isExcluded 빈칸 false"); ok(!isExcludedHolder(null), "isExcluded null false");

// ── [4차 item 2] 은행 전체 이름 표시(모든 별칭 + 모르는 값 원문) ──
eq(bankDisplayName("국민"), "국민은행", "국민→국민은행");
eq(bankDisplayName("신한"), "신한은행", "신한→신한은행");
eq(bankDisplayName("우리"), "우리은행", "우리→우리은행");
eq(bankDisplayName("하나"), "하나은행", "하나→하나은행");
eq(bankDisplayName("농협"), "NH농협은행", "농협→NH농협은행");
eq(bankDisplayName("기업"), "IBK기업은행", "기업→IBK기업은행");
eq(bankDisplayName("SC제일"), "SC제일은행", "SC제일→SC제일은행");
eq(bankDisplayName("카카오뱅크"), "카카오뱅크", "카카오뱅크 그대로");
eq(bankDisplayName("토스뱅크"), "토스뱅크", "토스뱅크 그대로");
eq(bankDisplayName("케이뱅크"), "케이뱅크", "케이뱅크 그대로");
eq(bankDisplayName("새마을"), "새마을금고", "새마을→새마을금고");
eq(bankDisplayName("우체국"), "우체국", "우체국");
eq(bankDisplayName("신협"), "신협", "신협");
eq(bankDisplayName("대구"), "iM뱅크(대구)", "대구→iM뱅크(대구)");
eq(bankDisplayName("부산"), "부산은행", "부산→부산은행");
eq(bankDisplayName("경남"), "경남은행", "경남→경남은행");
eq(bankDisplayName("광주"), "광주은행", "광주→광주은행");
eq(bankDisplayName("전북"), "전북은행", "전북→전북은행");
eq(bankDisplayName("수협"), "수협은행", "수협→수협은행");
eq(bankDisplayName("듣도못한은행"), "듣도못한은행", "모르는 값 원문 그대로");
eq(bankDisplayName(""), "", "빈 값 빈칸");

// ── [7차 item 3] 예금주 인식 강화 — 성씨·우선순위·확신도 (20건+) ──
function holder(raw, cn) { return parseBankAccount(raw, cn).holder; }
function conf(raw, cn) { return parseBankAccount(raw, cn).holderConfidence; }
eq(holder("안녕하세요~ 국민 461302-04-112708 홍채윤이요 빨리 부탁드려요"), "홍채윤", "인사+어미 섞여도 홍채윤");
eq(conf("안녕하세요~ 국민 461302-04-112708 홍채윤이요 빨리 부탁드려요"), "high", "계좌 뒤→high");
eq(holder("신한 91304888454 입니다", "김손님"), "", "제외단어만→없음");
eq(conf("신한 91304888454 입니다", "김손님"), "none", "후보 없음→none");
eq(holder("카뱅 3333-01-2345678 로 해주세요 예금주 김영희"), "김영희", "예금주 키워드 뒤");
eq(conf("카뱅 3333-01-2345678 로 해주세요 예금주 김영희"), "high", "키워드→high");
eq(holder("농협 302-1234-5678-91 우리엄마 이순자 명의에요"), "이순자", "명의 앞·우리엄마 제외");
eq(conf("농협 302-1234-5678-91 우리엄마 이순자 명의에요"), "high", "명의 키워드→high");
eq(holder("남궁민수 하나 123-456789-12345"), "남궁민수", "복성 남궁");
eq(holder("황보라 국민 12345678901"), "황보라", "복성 황보");
eq(holder("선우현 신한 11012345678"), "선우현", "복성 선우");
eq(holder("우리 아이 이순자 국민 12345678901"), "이순자", "우리 아이(은행아님)→이순자");
eq(parseBankAccount("우리 아이 이순자 국민 12345678901").bank, "국민", "우리 아이→은행은 국민");
eq(parseBankAccount("우리은행 1002-123-456789 김우리").bank, "우리", "우리은행은 우리 은행");
eq(holder("우리은행 1002123456789 김우리"), "김우리", "우리은행+김우리");
eq(holder("기업 계좌 12345678901 이영수", "이영수"), "이영수", "손님이름 일치");
eq(conf("기업 계좌 12345678901 이영수", "이영수"), "high", "손님이름 일치→high");
eq(holder("하나 12312312312 김하나"), "김하나", "하나은행+김하나(계좌 뒤)");
eq(conf("하나 12312312312 김하나"), "high", "계좌 뒤→high");
eq(holder("국민은행 홍길동 12345678901"), "홍길동", "이름 계좌 앞(예금주 키워드 없음)");
eq(holder("박서준 국민 12345678901"), "박서준", "이름 먼저");
eq(conf("박서준 국민 12345678901"), "low", "계좌 앞·키워드없음→low");
eq(holder("신한은행 110-234-567890 예금주: 정지훈 감사합니다"), "정지훈", "예금주: 콜론");
eq(holder("김이박 국민 12345678901"), "김이박", "성씨 시작 3자");
eq(holder("국민 12345678901"), "", "이름 아예 없음→없음");
eq(conf("국민 12345678901"), "none", "이름 없음→none");
eq(holder("토스 100012345678 최유리 이름", "최유리"), "최유리", "이름 키워드+손님일치");
eq(holder("제갈량 농협 3021234567", "제갈량"), "제갈량", "복성 제갈");

console.log(`✅ parse-bank-account ${pass}건 통과`);
