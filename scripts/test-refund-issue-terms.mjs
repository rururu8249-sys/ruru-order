// [2026-09-26 5·6차] 고객이슈 환불/교환 용어·💳 요약 문구 테스트
import { refundListButtonLabel, ledgerSummaryLine, optionLabelNoNone, isFullReturnSel, computeRefundBase, isCombinedShipmentPeer, cardRefundBackAmount, pickPrimaryLedger, ledgerHasPayoutInfo, restoreSelectionFromSnapshot } from "../lib/refundLedger.ts";
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

// ── [마무리1] 카드취소 💳 요약 — 다시 받을 돈 = adjustments 음수 합(역산 아님) ──
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850, card_total: 272850, adjustments: [{ label: "차감", amount: -20000 }] };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원 · 반품비 20,000원", "미완료 카드취소(차감 20,000)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 272850, card_total: 272850, adjustments: [] };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원", "미완료 카드취소(차감 없음→생략)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850, card_total: 272850, adjustments: [{ label: "차감", amount: -20000 }], done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소함 · 반품비 20,000원 받음 · 09.26(토)", "완료 카드취소(반품비 20,000 받음)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 272850, card_total: 272850, adjustments: [], done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소함 · 09.26(토)", "완료 카드취소(받을 돈 0)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 0, card_total: 0, adjustments: [] };
  eq(ledgerSummaryLine(li, ""), "", "카드취소 금액0·총액0 미완료→빈칸"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 252850, adjustments: [{ label: "차감", amount: -20000 }] }; // card_total 없는 옛 기록 → amount_final 로 대체
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 252,850원 · 반품비 20,000원", "card_total 없으면 amount_final 로 대체"); }

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

// ── [7차 보완·정정] 합배송 짝 판정(같은 결제방법일 때만) ──
const me = { code: "A", addr: "서울시강남구|101", kakao: "KAK1", phones: ["01012345678"], broadcast: "BC1", day: "2026-09-16", paymentMethod: "무통장입금" };
const P = (o) => ({ paymentMethod: "무통장입금", ...o }); // 상대 기본 무통장(me 와 같은 방법)
eq(isCombinedShipmentPeer(me, P({ code: "B", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" })), true, "같은 손님·주소·방송·방법→합배송");
eq(isCombinedShipmentPeer(me, P({ code: "B", addr: "서울시강남구|101", kakao: "", phone: "01012345678", broadcast: "", day: "2026-09-16" })), true, "전화 일치+같은 날→합배송");
eq(isCombinedShipmentPeer(me, P({ code: "B", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "", day: "2026-09-17" })), false, "방송 다르고 날 다르면 아님");
eq(isCombinedShipmentPeer(me, P({ code: "B", addr: "부산시해운대|202", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" })), false, "주소 다르면 아님");
eq(isCombinedShipmentPeer(me, P({ code: "B", addr: "서울시강남구|101", kakao: "KAK2", phone: "01099998888", broadcast: "BC1", day: "2026-09-16" })), false, "다른 손님이면 아님");
eq(isCombinedShipmentPeer(me, P({ code: "A", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" })), false, "자기 자신 제외");
eq(isCombinedShipmentPeer({ ...me, addr: "" }, P({ code: "B", addr: "", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" })), false, "주소 모르면 성립 안 함");
eq(isCombinedShipmentPeer(me, P({ code: "", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16" })), false, "상대 코드 없으면 아님");
// [정정] 결제방법 다르면 합배송 아님 — MU464IS3(무통장) vs 같은 날 카드결제 주문
eq(isCombinedShipmentPeer(me, { code: "B", addr: "서울시강남구|101", kakao: "KAK1", phone: "", broadcast: "BC1", day: "2026-09-16", paymentMethod: "카드결제" }), false, "결제방법 다르면 합배송 아님");

// ── [카드 단순화] 다시 받을 돈 = 차감 + 남기는 상품(역산 아님) ──
eq(cardRefundBackAmount(20000, 0), 20000, "전체반품 차감 20,000 → 다시 받을 돈 20,000");
eq(cardRefundBackAmount(0, 0), 0, "차감 0 → 0(줄 숨김)");
eq(cardRefundBackAmount(20000, 235000), 255000, "부분반품: 차감+남기는 상품");
eq(cardRefundBackAmount(0, 100000), 100000, "부분반품 차감0 → 남기는 상품만");

// ── [마무리1] 목록 💳 카드 = adjustments 음수 합 기반(역산 금지). 옛 base 여도 20,000 ──
{ const li = { kind: "반품", method: "카드취소", amount_final: 235000, card_total: 272850, adjustments: [{ label: "단순변심 차감", amount: -20000 }] };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원 · 반품비 20,000원", "미완료: adjustments 차감 20,000(옛 base·amount_final 무관)"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 235000, card_total: 272850, adjustments: [{ label: "차감", amount: -20000 }], done_at: "2026-09-26T10:00:00" };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소함 · 반품비 20,000원 받음 · 09.26(토)", "완료: 20,000 받음"); }
{ const li = { kind: "반품", method: "카드취소", amount_final: 272850, card_total: 272850, adjustments: [] };
  eq(ledgerSummaryLine(li, ""), "카드 전체 취소 272,850원", "차감 없음 → 다시 받을 돈 생략"); }

// 배송비 = adjusted_shipping_fee ?? shipping_fee (주문상세 getGroupShippingFee 규칙). base 포함 확인.
eq(computeRefundBase([{ lineTotal: 79000, qty: 1, unit: 79000, selectedQty: 1 }], true, 4000), 83000, "상품+배송비=83,000");

// ── [묶기] 같은 주문 대표 기록 선택(pickPrimaryLedger) ──
function ok2(c, m) { if (!c) throw new Error(m); pass++; }
ok2(pickPrimaryLedger([]) === null, "빈 목록 → null");
ok2(pickPrimaryLedger(null) === null, "null → null");
// 계좌 있는 쪽 우선(9/19 계좌 vs 9/23 계좌없음·최근)
{ const a = { id: "A", account_number: "12345678", updated_at: "2026-09-19T07:03:00", amount_final: 69000 };
  const b = { id: "B", account_number: "", account_last4: "", updated_at: "2026-09-23T07:50:00", amount_final: 73000 };
  eq(pickPrimaryLedger([b, a]).id, "A", "계좌 있는 쪽(9/19) 우선"); }
// 둘 다 계좌 있으면 최근 updated_at
{ const a = { id: "A", account_number: "111", updated_at: "2026-09-19T00:00:00" };
  const b = { id: "B", account_number: "222", updated_at: "2026-09-23T00:00:00" };
  eq(pickPrimaryLedger([a, b]).id, "B", "둘 다 계좌 → 최근 updated_at"); }
// 둘 다 계좌 없으면 최근
{ const a = { id: "A", account_number: "", updated_at: "2026-09-19T00:00:00" };
  const b = { id: "B", account_number: "", updated_at: "2026-09-23T00:00:00" };
  eq(pickPrimaryLedger([a, b]).id, "B", "둘 다 무계좌 → 최근"); }
// 카드취소는 계좌 없어도 payout 정보 있음으로 우선
{ const a = { id: "A", method: "카드취소", account_number: "", updated_at: "2026-09-19T00:00:00" };
  const b = { id: "B", method: "계좌이체", account_number: "", updated_at: "2026-09-23T00:00:00" };
  eq(pickPrimaryLedger([b, a]).id, "A", "카드취소 우선(payout 정보 있음)"); }
ok2(ledgerHasPayoutInfo({ account_last4: "2708" }) === true, "뒷4자리 있으면 payout 정보");
ok2(ledgerHasPayoutInfo({ method: "카드취소" }) === true, "카드취소 payout 정보");
ok2(ledgerHasPayoutInfo({ account_number: "", account_last4: "", method: "없음" }) === false, "정보 없음");
ok2(ledgerHasPayoutInfo(null) === false, "null → false");
// 주문 1개·기록 1개 → 그 기록이 대표
{ const only = { id: "X", account_number: "", updated_at: "2026-09-19T00:00:00" };
  eq(pickPrimaryLedger([only]).id, "X", "기록 1개면 그것이 대표"); }

// ── [A 재현] 저장된 선택 복원 — 김미성 PD-206 만 저장됐으면 재오픈 시 PD-206 만 체크(PD-202 자동체크 금지) ──
{
  // 주문 줄: PD-202, PD-206 (productId "676"·"677")
  const lines = [
    { id: "L202", product_id: "676", product_name: "PD(프라다)-202 니트", color: "없음", size: "M", qty: 1 },
    { id: "L206", product_id: "677", product_name: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 },
  ];
  // 저장 snapshot = PD-206 하나만(productId "677")
  const snap = [{ productId: "677", productName: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 }];
  const r = restoreSelectionFromSnapshot(lines, snap);
  eq(r.L206, 1, "PD-206 복원 체크");
  eq(r.L202, 0, "PD-202 자동체크 안 됨");
}
// productId 비어도 상품명+옵션으로 매칭(타입/누락 방어)
{
  const lines = [
    { id: "L1", product_id: "", product_name: "알로 뮬 2컬러", color: "회베이지", size: "240", qty: 1 },
    { id: "L2", product_id: "", product_name: "다른 상품", color: "", size: "", qty: 1 },
  ];
  const snap = [{ productId: "", productName: "알로 뮬 2컬러", color: "회베이지", size: "240", qty: 1 }];
  const r = restoreSelectionFromSnapshot(lines, snap);
  eq(r.L1, 1, "productId 없어도 이름+옵션 매칭");
  eq(r.L2, 0, "다른 줄 체크 안 됨");
}
// "없음" 옵션 정규화(snap color 없음 vs 줄 color 빈값도 매칭)
{
  const lines = [{ id: "L1", product_id: "9", product_name: "상품A", color: "", size: "230", qty: 2 }];
  const snap = [{ productId: "", productName: "상품A", color: "없음", size: "230", qty: 2 }];
  eq(restoreSelectionFromSnapshot(lines, snap).L1, 2, "«없음» 옵션 정규화 매칭");
}
// 수량 상한(저장 3 > 줄 2 → 2)
{
  const lines = [{ id: "L1", product_id: "9", product_name: "상품A", color: "", size: "", qty: 2 }];
  const snap = [{ productId: "9", qty: 3 }];
  eq(restoreSelectionFromSnapshot(lines, snap).L1, 2, "수량 줄 상한");
}

console.log(`✅ refund-issue-terms ${pass}건 통과`);
