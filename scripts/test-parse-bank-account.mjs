// [2026-09-26] 계좌 붙여넣기 파서 테스트
import { parseBankAccount, maskAccountForSummary } from "../lib/parseBankAccount.ts";

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

console.log(`✅ parse-bank-account ${pass}건 통과`);
