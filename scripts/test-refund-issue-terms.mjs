// [2026-09-26 5·6차] 고객이슈 환불/교환 용어·💳 요약 문구 테스트
import { refundListButtonLabel, ledgerSummaryLine, optionLabelNoNone, isFullReturnSel, computeRefundBase, isCombinedShipmentPeer, shouldWarnBaseMismatch, cardRefundBackAmount } from "../lib/refundLedger.ts";
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

// ── 💳 요약: 미완료 계좌이체 (6차: 계좌번호 전체 표시) ──
const bn = (li) => bankDisplayName(String(li.bank ?? ""));
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "국민", account_number: "46130204112708", account_holder: "홍채윤" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원 · 국민은행 46130204112708 홍채윤", "미완료 계좌이체(계좌 전체)"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "농협", account_number: "3021234567891", account_holder: "김영희" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원 · NH농협은행 3021234567891 김영희", "미완료 계좌이체(농협 전체명·전체번호)"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "", account_number: "", account_holder: "" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원", "미완료 계좌이체(계좌 값 없음→금액만)"); }
// 6차: 옛 예금주(제외단어)는 「예금주 확인 필요」로
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, bank: "신한", account_number: "91304888454", account_holder: "입니다" };
  eq(ledgerSummaryLine(li, bn(li)), "보낼 돈 69,000원 · 신한은행 91304888454 예금주 확인 필요", "미완료+제외단어 예금주→확인 필요"); }

// ── 💳 요약: 미완료 포인트 ──
{ const li = { kind: "반품", method: "포인트", amount_final: 69000 };
  eq(ledgerSummaryLine(li, ""), "포인트로 돌려줄 금액 69,000원", "미완료 포인트"); }

// ── 💳 요약: 미완료 교환 ──
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, exchange_option: "XL → 2XL" };
  eq(ledgerSummaryLine(li, ""), "교환 · 바꿀 옵션 XL → 2XL", "미완료 교환(옵션 있음)"); }
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, exchange_option: "" };
  eq(ledgerSummaryLine(li, ""), "교환 · 바꿀 옵션 -", "미완료 교환(옵션 없음→-)"); }

// ── 💳 요약: 완료 (6차: 은행 ****뒤4) ──
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, done_at: "2026-09-26T10:00:00", bank: "국민", account_number: "", account_last4: "2708" };
  eq(ledgerSummaryLine(li, bn(li)), "69,000원 보냄 · 09.26(토) · 국민은행 ****2708", "완료 계좌이체(****뒤4)"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, done_at: "2026-09-26T10:00:00", bank: "국민", account_number: "", account_last4: "" };
  eq(ledgerSummaryLine(li, bn(li)), "69,000원 보냄 · 09.26(토) · 국민은행", "완료 계좌이체(30일 경과→은행만)"); }
{ const li = { kind: "교환", method: "교환재발송", amount_final: 0, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "재발송함 · 09.26(토)", "완료 교환→재발송함"); }
{ const li = { kind: "반품", method: "없음", amount_final: 0, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "환불 없이 종료", "완료 환불없음→환불 없이 종료"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 69000, stage: "완료", account_last4: "2708" };
  eq(ledgerSummaryLine(li, "국민은행"), "69,000원 보냄 · 국민은행 ****2708", "완료(stage=완료·날짜없음)"); }

// ── [7차보완] 카드취소 💳 요약 — 전체 취소 + 다시 받을 돈 ──
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850, card_total: 272850 };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원 · 다시 받을 돈 20,000원", "미완료 카드취소(차감 20,000)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 272850, card_total: 272850 };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원", "미완료 카드취소(다시 받을 돈 0→생략)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850, card_total: 272850, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소함 · 20,000원 받음 · 09.26(토)", "완료 카드취소(20,000 받음)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 272850, card_total: 272850, done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소함 · 09.26(토)", "완료 카드취소(받을 돈 0)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 0, card_total: 0 };
  eq(ledgerSummaryLine(li, ""), "", "카드취소 금액0·총액0 미완료→빈칸"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850 }; // card_total 없는 옛 기록 → amount_final 로 대체
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 252,850원", "card_total 없으면 amount_final 로 대체"); }

// ── [6차] 옵션 「없음」 제거 ──
eq(optionLabelNoNone("없음", "12"), "12", "없음/12→12");
eq(optionLabelNoNone("없음", ""), "", "없음 단독→빈칸");
eq(optionLabelNoNone("블랙", "230"), "블랙/230", "정상 옵션 유지");
eq(optionLabelNoNone("", "없음"), "", "빈칸/없음→빈칸");
eq(optionLabelNoNone("네이비", "없음"), "네이비", "네이비/없음→네이비");

// ── 값 없음 / 처리 전 → 빈 문자열 ──
eq(ledgerSummaryLine(null, ""), "", "ledgerInfo 없음");
{ const li = { kind: "반품", method: "없음", amount_final: 0 };
  eq(ledgerSummaryLine(li, ""), "", "처리 전(방법 없음·금액0·미완료)→빈칸"); }
{ const li = { kind: "반품", method: "계좌이체", amount_final: 0 };
  eq(ledgerSummaryLine(li, ""), "", "계좌이체지만 금액0·미완료→빈칸"); }

// ── [7차] 전체 반품 판정 (배송비·카드추가금 자동 기준) ──
eq(isFullReturnSel([{ qty: 1, selectedQty: 1 }]), true, "1개 중 1개→전체");
eq(isFullReturnSel([{ qty: 1, selectedQty: 1 }, { qty: 1, selectedQty: 1 }]), true, "2개 중 2개→전체");
eq(isFullReturnSel([{ qty: 1, selectedQty: 1 }, { qty: 1, selectedQty: 0 }]), false, "2개 중 1개→일부");
eq(isFullReturnSel([{ qty: 3, selectedQty: 2 }]), false, "수량 3중 2→일부");
eq(isFullReturnSel([{ qty: 2, selectedQty: 2 }]), true, "수량 2중 2→전체");
eq(isFullReturnSel([]), false, "빈 목록→전체 아님");
eq(isFullReturnSel([{ qty: 0, selectedQty: 0 }]), false, "수량0→전체 아님");
// 전체 반품이면 배송비 포함, 일부면 상품만(컴포넌트가 isFullReturn 으로 includeShipping 을 정함)
eq(computeRefundBase([{ lineTotal: 79000, qty: 1, unit: 79000, selectedQty: 1 }], true, 4000), 83000, "전체+배송비=83,000");
eq(computeRefundBase([{ lineTotal: 79000, qty: 1, unit: 79000, selectedQty: 1 }], false, 4000), 79000, "배송비 미포함=79,000");
// 카드: base + 카드추가금(컴포넌트가 더함) — 272,850
eq(computeRefundBase([{ lineTotal: 255000, qty: 1, unit: 255000, selectedQty: 1 }], false, 0) + 17850, 272850, "상품255,000+카드추가금17,850=272,850");

// ── [7차 보완] 합배송 짝 판정 ──
const me = { code: "A", addr: "서울시강남구|101", kakao: "KAK1", phones: ["01012345678"], broadcast: "BC1", day: "2026-09-16" };
// 배송비 낸 쪽 ↔ 빠진 쪽: 주소·손님·방송 같으면 대칭으로 잡힌다
eq(isCombinedShipmentPeer(me, { code: "B", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" }), true, "같은 손님·주소·방송→합배송");
eq(isCombinedShipmentPeer(me, { code: "B", addr: "서울시강남구|101", kakao: "", phone: "01012345678", broadcast: "", day: "2026-09-16" }), true, "전화 일치+같은 날→합배송");
eq(isCombinedShipmentPeer(me, { code: "B", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "", day: "2026-09-17" }), false, "방송 다르고 날 다르면 아님");
eq(isCombinedShipmentPeer(me, { code: "B", addr: "부산시해운대|202", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" }), false, "주소 다르면 아님");
eq(isCombinedShipmentPeer(me, { code: "B", addr: "서울시강남구|101", kakao: "KAK2", phone: "01099998888", broadcast: "BC1", day: "2026-09-16" }), false, "다른 손님이면 아님");
eq(isCombinedShipmentPeer(me, { code: "A", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" }), false, "자기 자신 제외");
eq(isCombinedShipmentPeer({ ...me, addr: "" }, { code: "B", addr: "", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" }), false, "주소 모르면 성립 안 함");
eq(isCombinedShipmentPeer(me, { code: "", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" }), false, "상대 코드 없으면 아님");

// ── [복구후속1] 저장금액≠주문금액 경고 표시 판정 ──
const base = { linesLoaded: true, linesError: false, lineCount: 1, autoBase: 83000, savedBase: 79000, matchAccepted: false };
eq(shouldWarnBaseMismatch(base), true, "로딩완료+다름→경고");
eq(shouldWarnBaseMismatch({ ...base, linesLoaded: false }), false, "로딩 중→경고 없음");
eq(shouldWarnBaseMismatch({ ...base, linesError: true }), false, "조회 실패→경고 없음");
eq(shouldWarnBaseMismatch({ ...base, autoBase: 0 }), false, "주문금액 0→경고 없음(덮어쓰기 방지)");
eq(shouldWarnBaseMismatch({ ...base, lineCount: 0 }), false, "상품 줄 없음→경고 없음");
eq(shouldWarnBaseMismatch({ ...base, savedBase: null }), false, "저장금액 없음(신규)→경고 없음");
eq(shouldWarnBaseMismatch({ ...base, matchAccepted: true }), false, "이미 맞춤→경고 없음");
eq(shouldWarnBaseMismatch({ ...base, autoBase: 79000 }), false, "금액 같음→경고 없음");

// ── [카드 단순화] 다시 받을 돈 = 차감 + 남기는 상품(역산 아님) ──
eq(cardRefundBackAmount(20000, 0), 20000, "전체반품 차감 20,000 → 다시 받을 돈 20,000");
eq(cardRefundBackAmount(0, 0), 0, "차감 0 → 0(줄 숨김)");
eq(cardRefundBackAmount(20000, 235000), 255000, "부분반품: 차감+남기는 상품");
eq(cardRefundBackAmount(0, 100000), 100000, "부분반품 차감0 → 남기는 상품만");
// 옛 저장 base(255,000) 로 amount_final 이 235,000 이어도 «역산 아님»이라 영향 없음 — 차감만 반영
{ const deduct = 20000; eq(cardRefundBackAmount(deduct, 0), 20000, "옛 base 무관 — 차감 20,000 그대로"); }

console.log(`✅ refund-issue-terms ${pass}건 통과`);
