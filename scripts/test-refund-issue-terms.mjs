// [2026-09-26 5차] 고객이슈 환불/교환 용어·💳 요약 문구 테스트
import { refundListButtonLabel, ledgerSummaryLine } from "../lib/refundLedger.ts";
import { bankDisplayName } from "../lib/parseBankAccount.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`); pass++; }

// ── 버튼 글자 (기록 유무·단계 무관) ──
eq(refundListButtonLabel(["refund"]), "환불하기", "환불→환불하기");
eq(refundListButtonLabel(["return"]), "환불하기", "반품→환불하기");
eq(refundListButtonLabel(["return", "refund"]), "환불하기", "반품+환불→환불하기");
eq(refundListButtonLabel(["exchange"]), "교환하기", "교환만→교환하기");
eq(refundListButtonLabel(["exchange", "refund"]), "환불하기", "교환+환불→환불하기(반품/환불 우선)");
eq(refundListButtonLabel(["EXCHANGE"]), "교환하기", "대문자 exchange");
eq(refundListButtonLabel([]), "환불하기", "빈 배열 기본 환불하기");
eq(refundListButtonLabel(null), "환불하기", "null 기본 환불하기");

// ── 💳 요약: 미완료 계좌이체 ──
const bn = (li) => bankDisplayName(String(li.bank ?? ""));
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "국민", account_holder: "홍채윤" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원 · 국민은행 홍채윤", "미완료 계좌이체"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "농협", account_holder: "김영희" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원 · NH농협은행 김영희", "미완료 계좌이체(농협 전체명)"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "", account_holder: "" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원", "미완료 계좌이체(계좌 값 없음→금액만)"); }

// ── 💳 요약: 미완료 포인트 ──
{ const li = { kind: "반품", method: "포인트", amount_final: 69000 };
  eq(ledgerSummaryLine(li, ""), "포인트로 돌려줄 금액 69,000원", "미완료 포인트"); }

// ── 💳 요약: 미완료 교환 ──
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, exchange_option: "XL → 2XL" };
  eq(ledgerSummaryLine(li, ""), "교환 · 바꿀 옵션 XL → 2XL", "미완료 교환(옵션 있음)"); }
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, exchange_option: "" };
  eq(ledgerSummaryLine(li, ""), "교환 · 바꿀 옵션 -", "미완료 교환(옵션 없음→-)"); }

// ── 💳 요약: 완료 ──
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, done_at: "2026-09-26T10:00:00", bank: "국민", account_holder: "홍채윤" };
  eq(ledgerSummaryLine(li, bn(li)), "69,000원 보냄 · 09.26(토)", "완료 계좌이체"); }
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "재발송함 · 09.26(토)", "완료 교환→재발송함"); }
{ const li = { kind: "반품", method: "없음", amount_final: 0, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "환불 없이 종료", "완료 환불없음→환불 없이 종료"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, done_at: "2026-09-26" };
  eq(ledgerSummaryLine(li, "국민은행"), "69,000원 보냄 · 09.26(토)", "완료(날짜만)"); }

// ── 값 없음 / 처리 전 → 빈 문자열 ──
eq(ledgerSummaryLine(null, ""), "", "ledgerInfo 없음");
{ const li = { kind: "반품", method: "없음", amount_final: 0 };
  eq(ledgerSummaryLine(li, ""), "", "처리 전(방법 없음·금액0·미완료)→빈칸"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 0 };
  eq(ledgerSummaryLine(li, ""), "", "계좌이체지만 금액0·미완료→빈칸"); }

console.log(`✅ refund-issue-terms ${pass}건 통과`);
