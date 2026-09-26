// [2026-09-26 5·6차] 고객이슈 환불/교환 용어·💳 요약 문구 테스트
import { refundListButtonLabel, ledgerSummaryLine, optionLabelNoNone, isFullReturnSel, computeRefundBase, isCombinedShipmentPeer, cardRefundBackAmount, pickPrimaryLedger, ledgerHasPayoutInfo, restoreSelectionFromSnapshot, deriveInitialSelection, buildSnapshotFromSelection } from "../lib/refundLedger.ts";
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
// 둘 다 계좌 있으면 최근 «생성»(created_at) — updated_at 은 정렬에 안 씀(저장해도 대표 안 바뀜)
{ const a = { id: "A", account_number: "111", created_at: "2026-09-19T00:00:00", updated_at: "2026-09-30T00:00:00" };
  const b = { id: "B", account_number: "222", created_at: "2026-09-23T00:00:00", updated_at: "2026-09-20T00:00:00" };
  eq(pickPrimaryLedger([a, b]).id, "B", "둘 다 계좌 → 최근 created_at(B, updated_at 무관)"); }
// updated_at 이 바뀌어도 대표 고정(레이스 원인 제거) — created_at 고정이므로 결과 동일
{ const a = { id: "A", account_number: "111", created_at: "2026-09-19T00:00:00", updated_at: "2026-09-19T00:00:00" };
  const b = { id: "B", account_number: "222", created_at: "2026-09-23T00:00:00", updated_at: "2026-09-19T00:00:00" };
  const first = pickPrimaryLedger([a, b]).id;
  const afterSaveA = pickPrimaryLedger([{ ...a, updated_at: "2026-10-01T00:00:00" }, b]).id; // A 저장으로 updated_at 최신
  eq(first, afterSaveA, "A 를 저장(updated_at 갱신)해도 대표 안 바뀜"); eq(first, "B", "대표는 계속 B"); }
// created_at 동률이면 id 문자열로 결정(완전 결정적)
{ const a = { id: "zzz", account_number: "1", created_at: "2026-09-19T00:00:00" };
  const b = { id: "aaa", account_number: "2", created_at: "2026-09-19T00:00:00" };
  eq(pickPrimaryLedger([a, b]).id, "aaa", "created_at 동률 → id 오름차순"); }
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
// [2026-09-27] 1:1 배정 — snapshot 1건은 이름/옵션 겹치는 여러 줄이 있어도 «한 줄»만 체크(김미성 PD-202 오체크 방지)
{
  // order-lines 가 product_name 을 폴백 「상품」으로 주고 옵션(M/없음)이 같은 4줄 + snapshot 1건
  const lines = [
    { id: "A", product_id: "", product_name: "상품", color: "없음", size: "M", qty: 1 },
    { id: "B", product_id: "", product_name: "상품", color: "없음", size: "M", qty: 1 },
    { id: "C", product_id: "", product_name: "상품", color: "없음", size: "M", qty: 1 },
  ];
  const r = restoreSelectionFromSnapshot(lines, [{ productId: "", productName: "상품", color: "없음", size: "M", qty: 1 }]);
  eq(Object.values(r).filter((v) => v > 0).length, 1, "snapshot 1건 → 최대 1줄만(이름/옵션 겹쳐도)");
}
// [김미성 실측] PD-202·PD-206 이 같은 product_id "677" 을 공유해도 snapshot(PD-206)은 «이름 맞는» PD-206 만
{
  const lines = [
    { id: "L202", product_id: "677", product_name: "PD(프라다)-202 니트", color: "없음", size: "M", qty: 1 },
    { id: "L206", product_id: "677", product_name: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 },
  ];
  const snap = [{ productId: "677", productName: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 }];
  const r = restoreSelectionFromSnapshot(lines, snap);
  eq(r.L206, 1, "pid 공유해도 이름 맞는 PD-206 선택"); eq(r.L202, 0, "PD-202 는 이름 달라 선택 안 됨");
  eq(Object.values(r).filter((v) => v > 0).length, 1, "체크 1개(478,000 과다매칭 아님)");
}
// 이름/옵션 다르면 productId 만으로도 «첫 줄 자동선택» 안 하고, 이름 완전 일치 줄만
{
  const lines = [
    { id: "X", product_id: "677", product_name: "PD(프라다)-202 아우터", color: "없음", size: "M", qty: 1 },
    { id: "Y", product_id: "677", product_name: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 },
  ];
  eq(restoreSelectionFromSnapshot(lines, [{ productId: "677", productName: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 }]).Y, 1, "202아우터 vs 206아우터 — 206만");
}
// snapshot 2건이면 서로 다른 두 줄 각각 1개씩(중복 claim 금지)
{
  const lines = [
    { id: "A", product_id: "1", product_name: "가", color: "", size: "M", qty: 1 },
    { id: "B", product_id: "2", product_name: "나", color: "", size: "M", qty: 1 },
    { id: "C", product_id: "3", product_name: "다", color: "", size: "M", qty: 1 },
  ];
  const r = restoreSelectionFromSnapshot(lines, [{ productId: "1", qty: 1 }, { productId: "3", qty: 1 }]);
  eq(r.A, 1, "snap1→A"); eq(r.B, 0, "B 미체크"); eq(r.C, 1, "snap2→C");
}
// 수량 상한(저장 3 > 줄 2 → 2)
{
  const lines = [{ id: "L1", product_id: "9", product_name: "상품A", color: "", size: "", qty: 2 }];
  const snap = [{ productId: "9", qty: 3 }];
  eq(restoreSelectionFromSnapshot(lines, snap).L1, 2, "수량 줄 상한");
}

// ── [A 근본] deriveInitialSelection — 한 번에 결정, ledger 있으면 snapshot 만 ──
const LINES4 = [
  { id: "L202", product_id: "676", product_name: "PD-202 니트", color: "없음", size: "M", qty: 1 },
  { id: "L206", product_id: "677", product_name: "PD-206 아우터", color: "없음", size: "M", qty: 1 },
  { id: "L3", product_id: "678", product_name: "C", color: "", size: "", qty: 1 },
  { id: "L4", product_id: "679", product_name: "D", color: "", size: "", qty: 1 },
];
// (a) ledger snapshot=PD-206, raw 는 무관 → PD-206 만
{ const r = deriveInitialSelection({ hasLedger: true, snapshot: [{ productId: "677", productName: "PD-206 아우터", color: "없음", size: "M", qty: 1 }], lines: LINES4 });
  eq(r.sel.L206, 1, "(a) ledger→PD-206 체크"); eq(r.sel.L202, 0, "(a) PD-202 미체크"); eq(r.matchedNone, false, "(a) 매칭됨"); }
// (b) ledger 없음(신규) → raw_payload 대상(PD-202·206) 자동 체크
{ const r = deriveInitialSelection({ hasLedger: false, snapshot: [{ productId: "676" }, { productId: "677" }], lines: LINES4 });
  eq(r.sel.L202, 1, "(b) 신규 PD-202 자동체크"); eq(r.sel.L206, 1, "(b) 신규 PD-206 자동체크"); eq(r.sel.L3, 0, "(b) 대상 아님"); }
// (b2) 신규인데 raw 대상이 PD-206 하나, 줄 PD-202·PD-206 이 같은 pid 677 → 이름 맞는 PD-206 만(브랜드 pid 과다 방지)
{ const linesShare = [
    { id: "L202", product_id: "677", product_name: "PD(프라다)-202 니트", color: "없음", size: "M", qty: 1 },
    { id: "L206", product_id: "677", product_name: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 },
  ];
  const r = deriveInitialSelection({ hasLedger: false, snapshot: [{ productId: "677", productName: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 }], lines: linesShare });
  eq(r.sel.L206, 1, "(b2) 신규·브랜드 pid 공유 → 이름 맞는 PD-206 만"); eq(r.sel.L202, 0, "(b2) PD-202 안 켜짐"); }
// (b3) 신규·대상 정보 없음 → 전부 체크
{ const r = deriveInitialSelection({ hasLedger: false, snapshot: [], lines: LINES4 });
  eq(Object.values(r.sel).filter((v) => v > 0).length, 4, "(b3) 대상 없음 → 전부"); }
// (c) ledger snapshot 이 줄과 불일치 → 0개 + matchedNone(raw 대체 금지)
{ const r = deriveInitialSelection({ hasLedger: true, snapshot: [{ productId: "999", productName: "없는상품" }], lines: LINES4 });
  eq(Object.values(r.sel).filter((v) => v > 0).length, 0, "(c) 하나도 체크 안 됨"); eq(r.matchedNone, true, "(c) matchedNone"); }
// (d) productId 숫자/문자 혼용 매칭 — snapshot "677"(문자) vs 줄 677(숫자)
{ const linesNum = [{ id: "L206", product_id: 677, product_name: "PD-206", color: "없음", size: "M", qty: 1 }];
  const r = deriveInitialSelection({ hasLedger: true, snapshot: [{ productId: "677", qty: 1 }], lines: linesNum });
  eq(r.sel.L206, 1, "(d) 문자 productId vs 숫자 매칭"); }

// ── 순서 시나리오: lines/ledger 도착 순서와 무관하게 결과 동일(순수함수라 입력만 같으면 동일) ──
{
  const snap = [{ productId: "677", productName: "PD-206 아우터", color: "없음", size: "M", qty: 1 }];
  const r1 = deriveInitialSelection({ hasLedger: true, snapshot: snap, lines: LINES4 }); // ledger 먼저
  const r2 = deriveInitialSelection({ hasLedger: true, snapshot: snap, lines: LINES4 }); // lines 먼저 (동일 입력)
  eq(JSON.stringify(r1.sel), JSON.stringify(r2.sel), "순서 무관 동일 결과");
  eq(r1.sel.L206, 1, "최종 PD-206 만"); eq(r1.sel.L202, 0, "PD-202 미체크");
}

// ── [lineId] 복원 ① lineId 정확 일치가 최우선(브랜드 pid·이름 흔들려도 그 줄만) ──
{
  const lines = [
    { id: "row-A", product_id: "677", product_name: "PD(프라다)-202 니트", color: "없음", size: "M", qty: 1 },
    { id: "row-B", product_id: "677", product_name: "PD(프라다)-206 아우터", color: "없음", size: "M", qty: 1 },
  ];
  // snapshot 에 lineId 만 있고 이름은 옛 값이어도 lineId 로 정확히
  const snap = [{ lineId: "row-B", productId: "677", productName: "옛이름", color: "없음", size: "M", qty: 1 }];
  const r = restoreSelectionFromSnapshot(lines, snap);
  eq(r["row-B"], 1, "lineId 로 row-B 복원"); eq(r["row-A"], 0, "row-A 미체크");
}
// lineId 없으면 기존 우선순위(pid+이름/옵션)로 폴백
{
  const lines = [{ id: "X", product_id: "677", product_name: "PD-206", color: "없음", size: "M", qty: 1 }];
  eq(restoreSelectionFromSnapshot(lines, [{ productId: "677", productName: "PD-206", color: "없음", size: "M", qty: 1 }]).X, 1, "lineId 없으면 pid+이름 폴백");
}

// ── [D] 저장 snapshot = 현재 체크된 줄에서 생성(lineId 포함) — 2개 체크 → 2개 / 1개 → 1개 ──
{
  const lines = [
    { id: "a", product_id: "677", product_name: "PD-202", color: "없음", size: "M", qty: 2 },
    { id: "b", product_id: "677", product_name: "PD-206", color: "없음", size: "M", qty: 1 },
    { id: "c", product_id: "678", product_name: "CH", color: "", size: "S", qty: 1 },
  ];
  const snap2 = buildSnapshotFromSelection(lines, { a: 1, b: 1, c: 0 });
  eq(snap2.length, 2, "2개 체크 → snapshot 2개");
  eq(snap2.map((s) => s.lineId).join(","), "a,b", "lineId 담김");
  const snap1 = buildSnapshotFromSelection(lines, { a: 0, b: 1, c: 0 });
  eq(snap1.length, 1, "1개 체크 → snapshot 1개"); eq(snap1[0].lineId, "b", "b 하나"); eq(snap1[0].qty, 1, "qty 반영");
  // 저장→복원 왕복: buildSnapshotFromSelection 결과로 다시 복원하면 같은 줄
  const back = restoreSelectionFromSnapshot(lines, snap1);
  eq(back.b, 1, "왕복 복원 b"); eq(back.a, 0, "왕복 a 미체크");
  eq(buildSnapshotFromSelection(lines, {}).length, 0, "체크 0 → snapshot 0");
  // 수량 편집(a 2개 중 1개만)도 반영
  const snapQ = buildSnapshotFromSelection(lines, { a: 1 });
  eq(snapQ[0].qty, 1, "부분 수량 저장");
}

console.log(`✅ refund-issue-terms ${pass}건 통과`);
