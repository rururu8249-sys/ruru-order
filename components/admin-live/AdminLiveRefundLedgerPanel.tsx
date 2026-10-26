"use client";

// [2026-09-26] 교환·환불 장부 — 처리 창(RefundProcessModal). 목록 화면(별도 탭)은 2026-09-26 고객이슈로 통합돼 2026-10-21 코드 삭제.
//   ⚠️ 돈 무접촉: 포인트/주문/정산 안 건드림. refund_ledger 기록만 읽고 씀(서버 라우트 경유, service_role).
//   계좌: 목록은 뒷4자리만. 전체 번호는 처리 창 열 때/이체 목록 복사 때만 서버에서 받는다.

import { useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { patchIssueTask, type IssueExtraItem } from "@/lib/issueTaskPatch";
import IssueExtraItems from "./IssueExtraItems";
import LiveOrderRegisteredProductPicker from "./LiveOrderRegisteredProductPicker";
import { parseBankAccount, bankDisplayName, isExcludedHolder } from "@/lib/parseBankAccount";
import {
  ISSUE_MEMO_PRESETS,
  issueKindFromTaskTypes,
  issueKindTaskType,
  presetFromSaved,
  type IssueKind,
  transferCopyText,
  transferCopyBlock,
  reasonChipFromStored,
  type ReasonChip,
  buildKakaoCopy,
  optionLabelNoNone,
  isFullReturnSel,
  cardRefundBackAmount,
  deriveInitialSelection,
  buildSnapshotFromSelection,
  baseSummaryLine,
  cardBaseSummaryLine,
  dateShortKo,
  dateLongKo,
  computeAmountFinal,
  computeRefundBase,
  formatComma,
  parseAmountInput,
  type RefundLineSel,
  type RefundAdjustment,
} from "@/lib/refundLedger";

// [2026-09-26] 은행 select 목록
const BANK_OPTIONS = ["국민", "신한", "농협", "우리", "하나", "기업", "카카오뱅크", "토스뱅크", "케이뱅크", "새마을", "우체국", "수협", "SC제일", "부산", "대구", "경남", "광주", "전북", "제주", "신협", "씨티", "산업", "기타"] as const;

export type LedgerListRow = {
  id: string;
  created_at: string;
  admin_task_id?: string | null;
  order_lookup_code?: string | null;
  customer_phone?: string | null;
  nickname?: string | null;
  customer_name?: string | null;
  kind: string;
  reason?: string | null;
  product_snapshot?: Array<{ productId?: string; productName?: string; color?: string; size?: string; qty?: number }> | null;
  stage: string;
  next_action?: string | null;
  amount_base: number;
  adjustments?: RefundAdjustment[] | null;
  amount_final: number;
  method: string;
  bank?: string | null;
  account_last4?: string | null;
  account_holder?: string | null;
  card_total?: number | null;
  return_requested_on?: string | null;
  return_received_on?: string | null;
  transferred_at?: string | null;
  done_at?: string | null;
};

export type LedgerDetail = LedgerListRow & {
  bank?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  account_hidden?: boolean;
  exchange_option?: string | null;
  reship_tracking?: string | null;
  memo?: string | null;
};

const won = (n: unknown) => `${(Math.round(Number(n)) || 0).toLocaleString("ko-KR")}원`;
const clean = (v: unknown) => String(v ?? "").trim();
// [6차] 옵션 표기에서 「없음」 제거 — 공용(lib) optionLabelNoNone 재사용
const optLabel = optionLabelNoNone;
function productText(snapshot: LedgerListRow["product_snapshot"]) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return "-";
  return snapshot
    .map((it) => { const opt = optLabel(it.color, it.size); return `${clean(it.productName) || "상품"}${opt ? ` (${opt})` : ""} ×${Math.max(1, Math.round(Number(it.qty)) || 1)}`; })
    .join(", ");
}

const ISSUE_KINDS: readonly IssueKind[] = ["refund", "exchange", "ship", "etc"];
const ISSUE_KIND_LABEL: Record<IssueKind, string> = { refund: "환불", exchange: "교환", ship: "출고", etc: "기타" };

// ── 시안 ③ 처리 창 ──
export function RefundProcessModal({ item, onClose, onSaved, openedFromOtherIssue = false, repIssueDate = "", issueTypesInitial = [], issueBodyMemo = "", onSaveIssue, onDelete, createMode = false, earnedPoints = 0, extraInitial = [], onCreateIssue }: { item: LedgerDetail; onClose: () => void; onSaved: () => void; openedFromOtherIssue?: boolean; repIssueDate?: string; issueTypesInitial?: string[]; issueBodyMemo?: string; onSaveIssue?: (d: { issueType: IssueKind; memo: string; items?: Array<{ productId: string; productName: string; color: string; size: string; qty: number }>; extraItems?: IssueExtraItem[] }) => Promise<boolean>; onDelete?: () => void; createMode?: boolean; earnedPoints?: number; extraInitial?: IssueExtraItem[]; onCreateIssue?: (d: { issueType: IssueKind; memo: string; selectedRowIds: number[]; rowQty: Record<string, number> }) => Promise<{ taskId: string } | null> }) {
  const orderCode = clean(item.order_lookup_code);
  // [2026-09-27 ②] 유형 칩(환불/교환/기타) — 이 하나가 kind·하단 전환을 정한다. 기타는 하단 없음(admin-tasks 만 저장).
  // [2026-10-25] 출고(ship) 추가 — 환불 기록 없는 유형(기타·출고)은 isEtc 로 같이 다룬다(금액·계좌 칸 없음).
  const initIssueType: IssueKind = issueKindFromTaskTypes(issueTypesInitial || [], item.kind);
  const [issueType, setIssueType] = useState<IssueKind>(initIssueType);
  const isShip = issueType === "ship";
  const isEtc = issueType === "etc" || isShip;
  const kind = issueType === "exchange" ? "교환" : "반품";
  const isExchange = kind === "교환";

  // [5차] 상태 칩 폐지 — stage 는 저장값 유지(완료 버튼만 stage 를 명시적으로 바꾼다)
  const [stage] = useState(item.stage || "접수");
  const [method, setMethod] = useState(item.method && item.method !== "없음" ? item.method : (isExchange ? "교환재발송" : "계좌이체"));
  const [exchangeOption, setExchangeOption] = useState(clean(item.exchange_option));
  const [memo] = useState(clean(item.memo)); // refund_ledger.memo — 화면에서 편집 안 함(doPatch 로 값 유지). 표시 메모는 issueMemo(이슈 내용).
  const [issueMemo, setIssueMemo] = useState(clean(issueBodyMemo)); // [②] 공통 상단 메모 = admin_tasks 이슈 내용
  const [extra, setExtra] = useState<IssueExtraItem[]>(extraInitial); // [⑱] 기타 이슈에 따로 추가한 관련 상품
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // [2026-10-23 사장님] 자주 쓰는 내용 칩 · 교환 «바꿀 상품» 고르기 · 기타 «출고 넘기기» 이어서
  const [presetLabel, setPresetLabel] = useState(() => presetFromSaved(initIssueType, issueBodyMemo, item.reason));
  const [exPicker, setExPicker] = useState<"" | "same" | "other">("");

  // 계좌 — [6차] 항상 3칸 표시(요약/펼침 토글 폐지). 옛 예금주가 제외단어(입니다 등)면
  //   손님 이름으로 «프리필»하고 노란 테두리+안내(저장 눌러야 DB 반영). 자동 저장 안 함.
  const holderExcluded = isExcludedHolder(clean(item.account_holder));
  const [bank, setBank] = useState(clean(item.bank));
  const [account, setAccount] = useState(clean(item.account_number));
  const [holder, setHolder] = useState(
    holderExcluded ? (clean(item.customer_name) || clean(item.nickname)) : (clean(item.account_holder) || clean(item.customer_name) || clean(item.nickname)),
  );
  const [paste, setPaste] = useState("");
  const [acctMissing, setAcctMissing] = useState<string[]>([]);

  // 반품 사유(reason 필드) — [2026-09-27] 3칩(단순변심 / 상품 문제 / 기타). 옛 값(손님 변심·사이즈→단순변심, 불량·오배송→상품 문제)은 매핑, 긴 메모는 미선택.
  const initReasonChip = reasonChipFromStored(item.reason);
  const [reasonChip, setReasonChip] = useState<ReasonChip>(initReasonChip);
  const [reasonDirty, setReasonDirty] = useState(false);
  const reasonVal = reasonChip;

  // 차감 — 신규는 금액칸 1개. 기존 조정줄이 1개(차감)면 그 줄을 금액칸으로 불러와 편집(별도 줄 없음). 2개↑면 목록+입력.
  //   [6차] 라벨은 «현재 사유»를 따라감(옛 저장 라벨 표시·유지 안 함).
  const initAdjs = (Array.isArray(item.adjustments) ? item.adjustments : [])
    .map((x) => ({ label: clean(x.label), amount: Math.round(Number(x.amount)) || 0 }))
    .filter((x) => x.label || x.amount !== 0);
  const singleAdj = initAdjs.length === 1 && initAdjs[0].amount < 0 ? initAdjs[0] : null;
  const [keptAdj] = useState<RefundAdjustment[]>(singleAdj ? [] : initAdjs); // 기존 다중 조정줄 보존(차감액 합산). 신규는 차감 입력칸 하나.
  const [deductAmount, setDeductAmount] = useState(singleAdj ? Math.abs(singleAdj.amount) : 0);

  // 돌려받을 상품
  type OrderLineRow = { id: string; product_id: string; product_name: string; color: string; size: string; qty: number; unit: number; lineTotal: number; photo: string };
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [linesError, setLinesError] = useState(false);
  const [linesReloadTick, setLinesReloadTick] = useState(0);
  const [snapshotUnmatched, setSnapshotUnmatched] = useState(false); // 저장 snapshot 이 주문 줄과 안 맞음
  // [반품 날짜] 접수/도착 — 표시·기록 전용(기본값 없음)
  const [returnRequestedOn, setReturnRequestedOn] = useState(clean(item.return_requested_on));
  const [returnReceivedOn, setReturnReceivedOn] = useState(clean(item.return_received_on));
  const [editingReturnDate, setEditingReturnDate] = useState<"" | "req" | "recv">("");
  const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const [shippingFee, setShippingFee] = useState(0);
  const [pointUsed, setPointUsed] = useState(0);
  const [orderDate, setOrderDate] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("");
  const [cardTotal, setCardTotal] = useState(0);
  const [cardExtra, setCardExtra] = useState(0);
  const [combinedShipping, setCombinedShipping] = useState(false);
  const [combinedWith, setCombinedWith] = useState("");
  const [combinedShipFee, setCombinedShipFee] = useState(0);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [includeShipping, setIncludeShipping] = useState(false);
  const [shippingTouched, setShippingTouched] = useState(false);
  const [shipFee, setShipFee] = useState(0); // 편집 가능한 배송비 금액
  const [shipFeeTouched, setShipFeeTouched] = useState(false);
  const [manualBase, setManualBase] = useState(Math.round(Number(item.amount_base)) || 0);


  useEffect(() => {
    if (!orderCode) { setLinesLoaded(true); return; }
    let alive = true;
    setLinesError(false);
    setSnapshotUnmatched(false);
    (async () => {
      try {
        const res = await fetch(`/api/admin-live/order-lines?codes=${encodeURIComponent(orderCode)}`, { cache: "no-store" });
        const p = await res.json().catch(() => null);
        if (!alive) return;
        // 라우트가 실패하면 «조용히 직접입력»으로 떨어지지 않고 오류 표시(다시 시도) — 매칭 실패와 구분.
        if (!p?.ok) { setLinesError(true); setLinesLoaded(true); return; }
        const entry = p.byCode?.[orderCode] || null;
        const got: OrderLineRow[] = entry?.lines || [];
        setLines(got);
        setShippingFee(Math.max(0, Math.round(Number(entry?.shippingFee)) || 0));
        setPointUsed(Math.max(0, Math.round(Number(entry?.pointUsed)) || 0));
        setOrderDate(clean(entry?.orderDate));
        setOrderPaymentMethod(clean(entry?.paymentMethod));
        setCardTotal(Math.max(0, Math.round(Number(entry?.cardTotal)) || 0));
        setCardExtra(Math.max(0, Math.round(Number(entry?.cardExtra)) || 0));
        setCombinedShipping(Boolean(entry?.combined));
        setCombinedWith(clean(entry?.combinedWith));
        setCombinedShipFee(Math.max(0, Math.round(Number(entry?.combinedShipFee)) || 0));
        // [A 근본수정] 선택 상태는 «ledger(=item 프롭)+주문 줄이 둘 다 도착한 뒤» 한 번만 결정(레이스 방지).
        //   item.id 있으면 저장 기록 → snapshot 만 복원(자동 체크 금지·불일치면 0개+안내). 없으면 신규 자동 체크.
        const savedSnap = Array.isArray(item.product_snapshot) ? item.product_snapshot : [];
        const derived = deriveInitialSelection({ hasLedger: Boolean(item.id), snapshot: savedSnap, lines: got });
        // [㉑] 기타(초기 유형 etc) + 환불기록 없음(!item.id) + 저장 대상 없음(savedSnap 0개) → 자동 전체 체크 금지(0개로 연다)
        const etcNoTarget = initIssueType === "etc" && !item.id && savedSnap.length === 0;
        setSel(etcNoTarget ? {} : derived.sel);
        setSnapshotUnmatched(derived.matchedNone);
        // 카드결제 주문 → 방법 기본 항상 「카드취소」(저장 방법 없을 때만). 카드는 전체 취소가 원칙.
        //   [C4] 카드 감지 이전 저장 기록이 「계좌이체」(계좌번호 없음)로 열려 이체 사고 위험(김미성 MTD0B5AY) → 그 경우도 카드취소로.
        if (clean(entry?.paymentMethod).includes("카드") && !isExchange && (!item.method || item.method === "없음" || (item.method === "계좌이체" && !clean(item.account_number)))) {
          setMethod("카드취소");
        }
        setLinesLoaded(true);
      } catch { if (alive) { setLinesError(true); setLinesLoaded(true); } }
    })();
    // [묶기] 같은 주문은 이제 «대표 1개»로 자동 합쳐 열리므로 중복 경고는 없앤다.
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode, linesReloadTick]);

  const matchFailed = linesLoaded && !linesError && lines.length === 0;
  const isCardOrder = orderPaymentMethod.includes("카드");
  const isCardCancel = method === "카드취소";
  // [7차] 전체 반품 = 모든 줄이 «전체 수량»으로 선택됨(공용 isFullReturnSel).
  const isFullReturn = isFullReturnSel(lines.map((l) => ({ qty: l.qty, selectedQty: sel[l.id] || 0 })));
  // 배송비 — 이 주문 배송비가 0이고 합배송이면 «낸 쪽» 주문 배송비(combinedShipFee)를 정보로 쓴다.
  //   (order-lines 가 총액−상품−카드추가금으로 배송비를 이미 보정하므로, 대부분 shippingFee 에 실린다)
  const shipMovedToPeer = shippingFee === 0 && combinedShipping && combinedShipFee > 0;
  const effectiveShippingFee = shippingFee > 0 ? shippingFee : (shipMovedToPeer ? combinedShipFee : 0);
  // [복구후속3] 배송비 줄은 배송비(또는 합배송 낸 쪽 배송비)>0이면 항상 표시(부분선택·복원 무관 — «체크 여부»만 자동/복원).
  const showShippingRow = !isExchange && effectiveShippingFee > 0;

  // 편집 가능한 배송비 금액 — 사용자가 손대기 전엔 order-lines 값 따라감.
  useEffect(() => {
    if (shipFeeTouched) return;
    setShipFee(effectiveShippingFee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShippingFee, shipFeeTouched]);

  // [7차] 배송비 자동 체크 — 단독 주문 전체 반품 + 배송비>0일 때 기본 체크(합배송이면 해제). 사용자가 손대면 유지.
  useEffect(() => {
    if (shippingTouched) return;
    setIncludeShipping(isFullReturn && effectiveShippingFee > 0 && !combinedShipping);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullReturn, effectiveShippingFee, combinedShipping, shippingTouched]);
  const selList: RefundLineSel[] = lines.map((l) => ({ lineTotal: l.lineTotal, qty: l.qty, unit: l.unit, selectedQty: sel[l.id] || 0 }));
  const autoBase = computeRefundBase(selList, includeShipping, shipFee);
  // 참고용 부가세율(카드 결제 안내 줄) — 표시만, 계산엔 안 씀.
  const totalLineSum = lines.reduce((s, l) => s + l.lineTotal, 0);
  const vatRatePct = totalLineSum > 0 ? Math.round((cardExtra / totalLineSum) * 100) : 0;

  // [카드 = 단순 전체 취소] amount_base = 카드 총결제액. 받을 반품비 = 차감칸 입력값만(남기는 상품값 자동계산 폐기).
  const cardTotalDisplay = cardTotal > 0 ? cardTotal : autoBase;

  // [마무리3] 저장금액≠주문금액 경고 폐지 — 창을 열면 항상 «현재 체크된 상품 + 배송비» 기준으로 즉시 계산.
  const amountBase = isCardCancel
    ? cardTotalDisplay // 카드 = 전체 취소 → 총결제액 기준
    : matchFailed ? manualBase : autoBase;

  const deductFinalLabel = isCardCancel ? (reasonVal ? `${reasonVal} 반품비` : "반품비") : (reasonVal ? `${reasonVal} 차감` : "차감");
  // [사유 3칩] 단순변심 → 「반품비」 라벨, 기타 → 「차감」, 상품 문제 → 차감 행 숨김(0). 단 저장된 차감 값(입력>0)이 있으면 칩 무관하게 표시.
  const deductRowLabel = reasonChip === "단순변심" ? "반품비" : "차감";
  const showDeductRow = reasonChip !== "상품문제" || deductAmount > 0;
  const finalAdj: RefundAdjustment[] = [...keptAdj, ...(deductAmount > 0 ? [{ label: deductFinalLabel, amount: -deductAmount }] : [])];
  const amountFinal = computeAmountFinal(amountBase, finalAdj);
  const deductTotal = finalAdj.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);
  // [카드] 받을 반품비 = 차감칸 입력값(음수 합). 0이면 줄 숨김.
  const cardRefundBack = cardRefundBackAmount(deductTotal, 0);

  // [금액 박스 = 주문상세 합계 표] 상품금액/배송비/차감/환불할 금액을 줄로. 계산은 기존값 그대로 표시만.
  const productSum = matchFailed ? manualBase : computeRefundBase(selList, false, 0); // 체크 상품 줄합계(배송비 제외)
  const shipIncludedAmount = includeShipping ? shipFee : 0;
  const selectedCount = lines.filter((l) => (sel[l.id] || 0) > 0).length;
  const lineCount = lines.length;
  const isPartial = !matchFailed && lineCount > 0 && !isFullReturn;
  const orderTotalAll = totalLineSum + effectiveShippingFee; // 주문 총 결제금액(무통장)
  const cardProductAmount = Math.max(0, cardTotalDisplay - cardExtra); // 카드: 상품금액 = 카드총액 − 부가세
  // [기준 줄] 카드 주문이면 카드총액 기준(cardBaseSummaryLine), 아니면 총 결제 기준(baseSummaryLine).
  const baseSummaryText = isCardOrder
    ? cardBaseSummaryLine({ cardTotal: cardTotalDisplay, productAll: totalLineSum, shippingFee: effectiveShippingFee, isPartial, lineCount, selectedCount })
    : baseSummaryLine({ orderTotal: orderTotalAll, productAll: totalLineSum, shippingFee: effectiveShippingFee, isPartial, lineCount, selectedCount });
  const shippingStatusText = (() => {
    if (effectiveShippingFee === 0) return "무료배송";
    if (shippingTouched) return includeShipping ? "직접 포함" : "직접 제외";
    if (combinedShipping && !includeShipping) return `같이 배송된 주문 ${combinedWith || ""} · 미포함`.replace("  ", " ").trim();
    if (isFullReturn && includeShipping && !combinedShipping) return "주문 상품 전부 반품 · 포함";
    if (isPartial && !includeShipping) return `남는 상품 ${Math.max(0, lineCount - selectedCount)}개 · 미포함`;
    return includeShipping ? "포함" : "미포함";
  })();

  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();
  const setQty = (id: string, q: number, max: number) => setSel((prev) => ({ ...prev, [id]: Math.max(0, Math.min(q, max)) }));

  const applyPaste = (raw: string) => {
    setPaste(raw);
    const r = parseBankAccount(raw, clean(item.customer_name) || clean(item.nickname));
    if (r.bank) setBank(r.bank);
    if (r.account) setAccount(r.account);
    // 예금주: 자신있게 찾았으면 그 이름, 못 찾았으면 손님 이름으로 채우고 확인 요망(노란)
    if (r.holder) setHolder(r.holder);
    else if (!r.holder) setHolder(clean(item.customer_name) || clean(item.nickname));
    // 인식했을 때만 노란 테두리 표시. 예금주 확신이 낮으면(low·none) holder 도 확인 대상.
    const recognized = raw.trim() && (r.bank || r.account || r.holder);
    const miss = [...r.missing];
    if (recognized && r.holderConfidence !== "high" && !miss.includes("holder")) miss.push("holder");
    setAcctMissing(recognized ? miss : []);
  };

  // reason 저장: 사용자가 사유를 건드렸을 때만 새 값으로. 안 건드리면 신규는 이슈 메모, 기존은 유지(미전송).
  const reasonToSend = reasonDirty ? reasonVal : (item.id ? undefined : clean(item.reason));

  // 창을 닫지 않고 저장만 — 성공 여부 반환.
  const doPatch = async (extra: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setSaveError("");
    try {
      // [D] 저장 snapshot = «현재 체크된 줄»에서 생성(lineId 포함). 매칭 실패(직접입력)일 때만 기존 값 유지.
      const snapshot = matchFailed
        ? (item.product_snapshot ?? [])
        : buildSnapshotFromSelection(lines, sel);
      const body: Record<string, unknown> = {
        id: item.id || undefined,
        admin_task_id: item.admin_task_id || undefined,
        stage, kind, method,
        amount_base: amountBase, adjustments: finalAdj,
        bank, account_number: account, account_holder: holder,
        exchange_option: exchangeOption, memo,
        return_requested_on: returnRequestedOn, return_received_on: returnReceivedOn,
        product_snapshot: snapshot,
        ...(reasonToSend !== undefined ? { reason: reasonToSend } : {}),
        ...(item.id ? {} : {
          nickname: clean(item.nickname), customer_name: clean(item.customer_name),
          customer_phone: clean(item.customer_phone), order_lookup_code: orderCode,
          next_action: clean(item.next_action),
        }),
        ...extra,
      };
      const res = await fetch("/api/admin-live/refund-ledger", {
        method: item.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        const msg = clean(payload?.message) || `오류 (${res.status})`;
        setSaveError(msg);
        showAdminToast("저장 실패: " + msg, "error");
        return false;
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      setSaveError(msg);
      showAdminToast("저장 실패: " + msg, "error");
      return false;
    } finally { setSaving(false); }
  };

  // [②] 저장 하나 — 유형·메모(이슈)를 admin-tasks 에 먼저 저장 → (기타 아니면) refund-ledger PATCH. 순서대로, 부분 실패 안내.
  const saveOnly = async () => {
    // [⑬ 초안 모드] 주문상세 「+ 고객이슈 등록」 — order-return 으로 이슈 생성(포인트 회수 규칙은 서버가), 받은 taskId 로 환불 기록 연결.
    if (createMode) {
      const chosen = lines.filter((l) => (sel[l.id] || 0) > 0);
      const ids = chosen.map((l) => Number(l.id)).filter((n) => n > 0);
      if (!isEtc && ids.length === 0) { showAdminToast("대상 상품을 1개 이상 선택해주세요.", "warning"); return; } // [⑭] 기타는 0개 허용
      const rowQty = Object.fromEntries(chosen.map((l) => [String(l.id), sel[l.id]])); // [⑯] 고른 수량 → 서버 회수 비율
      setSaving(true);
      const created = await onCreateIssue?.({ issueType, memo: issueMemo, selectedRowIds: ids, rowQty });
      setSaving(false);
      if (!created?.taskId) return;                       // 실패 토스트는 onCreateIssue 쪽에서
      if (isEtc) {
        // [⑱] 기타 + 추가 상품이 있으면 방금 만든 이슈(taskId)에 extra_items 를 보강(order-return 서버 무변경).
        if (extra.length > 0 || isShip) {
          try {
            const fr = await fetch(`/api/admin-live/order-return/find-task?orderCode=${encodeURIComponent(orderCode)}`, { cache: "no-store" });
            const fp = await fr.json().catch(() => null);
            const t = (fp?.ok && fp.latest?.task) ? fp.latest.task : { id: created.taskId, body: "" };
            await patchIssueTask(t, { issueTypeKey: issueKindTaskType(issueType), memo: issueMemo, extraItems: extra }); // 출고면 유형을 shipping 으로
          } catch { /* 보강 실패해도 이슈는 등록됨 */ }
        }
        onSaved(); return;
      }
      const okLedger = await doPatch({ admin_task_id: created.taskId });
      if (!okLedger) { showAdminToast("고객이슈는 등록됐지만 환불 기록 저장에 실패했어요. 고객이슈 탭 「처리」에서 이어서 저장해 주세요.", "warning"); onSaved(); return; }
      showAdminToast("등록됐어요", "success"); onSaved(); return;
    }
    // 1) 고객이슈(admin-tasks) 저장 — 기존 수정 경로(메타줄 보존). 호출은 rail 이 넘긴 onSaveIssue.
    //   [⑰] 이슈의 대상상품·수량은 «화면 선택»과 같아야 하므로 유형 상관없이 items 를 넘긴다(환불·교환 기록은 doPatch 가 별도 저장).
    if (onSaveIssue) {
      const items = lines.filter((l) => (sel[l.id] || 0) > 0).map((l) => ({ productId: String(l.product_id ?? ""), productName: l.product_name, color: l.color || "", size: l.size || "", qty: sel[l.id] }));
      // [⑱] 기타일 때만 추가 상품(extra) 저장. 환불·교환은 화면에서 숨기므로 넘기지 않음(값 보존).
      const okIssue = await onSaveIssue({ issueType, memo: issueMemo, items, extraItems: isEtc ? extra : undefined });
      if (!okIssue) { setSaveError("고객이슈 저장에 실패했어요. 다시 시도해 주세요."); showAdminToast("고객이슈 저장 실패", "error"); return; }
    }
    // 2) 기타면 환불 기록은 만들지도 바꾸지도 않는다(💳 은 유형이 general 이라 목록에서 자동 숨김).
    if (isEtc) {
      showAdminToast("저장됐어요", "success"); onSaved(); return;
    }
    // 3) 환불/교환 기록(refund-ledger) 저장.
    const okLedger = await doPatch({});
    if (!okLedger) { showAdminToast("고객이슈는 저장됐지만 환불 기록 저장에 실패했어요. 환불 부분을 다시 저장해 주세요.", "warning"); return; }
    showAdminToast("저장됐어요", "success"); onSaved();
  };

  // [2026-09-27] 카톡 붙여넣기용 여러 줄 텍스트(text/plain·순수함수 buildKakaoCopy).
  const copyTransferInfo = async () => {
    const prodItems = matchFailed
      ? (Array.isArray(item.product_snapshot) ? item.product_snapshot : []).map((s) => ({
          name: clean((s as Record<string, unknown>).productName ?? (s as Record<string, unknown>).product_name),
          opt: [clean((s as Record<string, unknown>).color), clean((s as Record<string, unknown>).size)].filter(Boolean).join("/"),
          qty: Number((s as Record<string, unknown>).qty) || 1,
        }))
      : lines.filter((l) => (sel[l.id] || 0) > 0).map((l) => ({
          name: l.product_name,
          opt: [l.color, l.size].filter(Boolean).join("/"),
          qty: sel[l.id] || 0,
        }));
    const text = buildKakaoCopy({
      nickname: clean(item.nickname), name: clean(item.customer_name),
      orderCode, orderDateLong: dateLongKo(orderDate || item.created_at),
      products: prodItems,
      returnReceivedLong: dateLongKo(returnReceivedOn), returnRequestedLong: dateLongKo(returnRequestedOn),
      reasonChip: reasonVal, memo: clean(issueMemo),
      method,
      productSum, shipIncluded: shipIncludedAmount, deductTotal, amountFinal,
      cardTotal: cardTotalDisplay, cardRefundBack,
      bankName: bankDisplayName(bank), account, holder,
    });
    try { await navigator.clipboard.writeText(text); showAdminToast("환불 안내 복사했어요 (카톡 붙여넣기)", "success"); }
    catch { showAdminToast("복사 실패:\n" + text, "warning"); }
  };

  // [2026-10-23] 은행 앱용 이체정보 한 줄(목록 줄의 「이체정보 복사」와 같은 글자)
  const copyTransferShort = async () => {
    if (!account) { showAdminToast("계좌번호를 먼저 넣어 주세요.", "warning"); return; }
    // [14:44 사장님] 이체정보 + 누구·상품·사유·금액 계산까지 여러 줄로
    const products = lines.filter((l) => (sel[l.id] || 0) > 0).map((l) => `${l.product_name}${optLabel(l.color, l.size) ? `(${optLabel(l.color, l.size)})` : ""}×${sel[l.id]}`).join(", ");
    const text = transferCopyBlock({ bankName: bankDisplayName(bank), account, holder, amount: amountFinal, nickname: item.nickname, name: item.customer_name, orderCode, products, memo: issueMemo, base: productSum + shipIncludedAmount, deduct: deductTotal, shipping: shipIncludedAmount });
    try { await navigator.clipboard.writeText(text); showAdminToast(`이체정보·내용 복사했어요\n${text}`, "success"); }
    catch { showAdminToast("복사 실패:\n" + text, "warning"); }
  };

  const nextActionSaved = clean(item.next_action);
  const INPUT = "h-11 rounded-lg border border-line bg-surface px-3 text-[16px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink";
  // [묶기] 대표가 아닌 이슈에서 열었을 때 표기할 대표 이슈 날짜(M/D).
  const repIssueDateMD = (() => {
    const raw = clean(repIssueDate);
    if (!raw) return "";
    const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
  })();
  // [5차 → 2026-10-22] 「여기서 돈이 안 나간다」 안내는 방법 칩 아래 한 줄(methodNote)로.

  // [2026-10-22 사장님 「너무 복잡해」] DESIGN-ADMIN(2-1 문구·3 모양·4 버튼·8 폼) 기준으로 배치만 재정리.
  //   상태·계산·저장(saveOnly·doPatch·setQty·applyPaste·copyTransferInfo)·조건은 전부 그대로 — JSX 자리와 문구만 바뀜.
  //   순서: 유형 칩 → 상품 → 사유(환불·교환) → 금액·방법(환불) / 바꿀 옵션(교환) → 메모 → 하단 [삭제 · 닫기 · 저장]
  const SUB_LABEL = "mb-1.5 text-[13px] font-semibold text-ink-mute";
  const CHIP = (on: boolean) => `h-9 rounded-full border px-3 text-[13px] font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`;
  const AMOUNT_INPUT = "h-9 w-24 rounded-lg border border-line px-2 text-right text-[14px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink";
  const methodNote = isExchange ? "" : method === "카드취소" ? "카드 취소는 페이스터에서 · 여기는 기록만" : method === "계좌이체" ? "이체는 은행 앱에서 · 여기는 기록만" : method === "포인트" ? "포인트 지급은 회원 상세 › 포인트 지급에서" : "환불 없이 기록만";
  // [2026-10-26 사장님] 메모 칸 — 환불·교환·출고는 사유 칩 바로 아래, 기타는 상품 아래
  const memoBlock = (
    <div className="mb-2">
      <label className={`block ${SUB_LABEL}`}>메모 (선택)
        <textarea value={issueMemo} onChange={(e) => setIssueMemo(e.target.value)}
          placeholder={presetLabel === "기타" ? "기타 사유를 적어 주세요" : isShip ? "예: 방송 끝나고 주문 — 이번 출고에 같이" : issueType === "etc" ? "예: 차콜 XL 미발송, S 1개로 출고 요청" : isExchange ? "예: 오배송 — 베이지 M 으로 재발송" : "예: 사이즈 작아서 반품"}
          className="mt-1.5 h-[72px] w-full resize-none rounded-lg border border-line bg-surface p-3 text-[16px] leading-6 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
      </label>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[min(92vh,880px)] w-full max-w-[600px] flex-col overflow-hidden rounded-t-xl bg-surface sm:rounded-xl" style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()}>
        {/* 머리 — 제목 · 손님 한 줄 · 닫기 */}
        <div className="flex items-start justify-between gap-2 border-b border-line px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h3 className="text-[20px] font-bold text-ink">{createMode ? "고객이슈 등록" : ISSUE_KIND_LABEL[issueType]}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-soft">
              <span className="min-w-0 truncate"><span className="font-bold text-ink">{clean(item.nickname) || "—"}</span>{clean(item.customer_name) ? ` · ${clean(item.customer_name)}` : ""}{orderCode ? ` · ${orderCode}` : ""}</span>
              {orderPaymentMethod ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft">{isCardOrder ? "카드" : "무통장"}</span> : null}
              {clean(orderDate) ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft">{dateShortKo(orderDate)} 주문</span> : null}
            </div>
            {openedFromOtherIssue ? <div className="mt-1 text-[12px] leading-5 text-ink-mute">같은 주문의 {repIssueDateMD ? `${repIssueDateMD} ` : ""}이슈 기록</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-9 w-9 shrink-0 rounded-lg text-[18px] text-ink-mute hover:bg-surface-2">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* 1. 유형 — [2026-10-25] 4칸 한 줄(환불·교환·출고·기타). 아래 칩(사유)과 모양을 달리해 «무엇을 할지»가 먼저 보이게 */}
          <div role="radiogroup" aria-label="유형" className="mb-5 grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1">
            {ISSUE_KINDS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={issueType === t} onClick={() => {
                  if (t === issueType) return;
                  setIssueType(t);
                  setPresetLabel("");
                  // [⑭] 기타·출고로 바꾸면 선택 비움(고른 것만 대상). 환불·교환으로 바꿀 때 선택이 0개면 전체 체크(반품 기본).
                  if (t === "etc" || t === "ship") setSel({});
                  else if (!lines.some((l) => (sel[l.id] || 0) > 0)) setSel(Object.fromEntries(lines.map((l) => [String(l.id), Math.max(1, Number(l.qty) || 1)])));
                  if (t === "exchange") setMethod("교환재발송"); else if (t === "refund" && (method === "교환재발송" || method === "없음")) setMethod("계좌이체");
                }}
                className={`h-9 rounded-lg text-[14px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink ${issueType === t ? "bg-ink text-white" : "text-ink-soft hover:bg-surface"}`}>
                {ISSUE_KIND_LABEL[t]}
              </button>
            ))}
          </div>

          {/* 2. 상품 */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-mute">{isShip ? "출고할 상품 (선택)" : issueType === "etc" ? "관련 상품 (선택)" : isExchange ? "교환할 상품" : "돌려받을 상품"}</span>
              {linesLoaded && !linesError && !matchFailed && (lines.length > 1 || isEtc) ? <span className="text-[12px] tabular-nums text-ink-mute">{lines.length}개 중 <b className="font-bold text-ink">{selectedCount}개</b> 선택</span> : null}
            </div>
            {!linesLoaded ? (
              <div className="rounded-lg border border-line p-4 text-center text-[13px] text-ink-mute">주문 상품 불러오는 중…</div>
            ) : linesError ? (
              <div className="rounded-lg border border-line p-4 text-center">
                <div className="text-[13px] font-semibold text-danger-tx">주문 정보를 불러오지 못했어요.</div>
                <button type="button" onClick={() => { setLinesLoaded(false); setLinesReloadTick((v) => v + 1); }} className="mt-2 h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">다시 시도</button>
              </div>
            ) : matchFailed ? (
              isEtc ? (
                /* [⑱ C1] 기타 + 주문 미연결 — 금액칸 대신 한 줄 안내(아래 「추가한 상품」으로 상품을 담는다). */
                <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-ink-mute">주문이 연결되지 않은 이슈예요</div>
              ) : isExchange ? (
                <div className="rounded-lg border border-line p-3 text-[14px] font-bold text-ink">{productText(item.product_snapshot)}</div>
              ) : (
                <div className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink-soft">상품 금액 (직접 입력)</span>
                    <input inputMode="numeric" value={formatComma(manualBase)} onFocus={selectOnFocus} onChange={(e) => setManualBase(parseAmountInput(e.target.value))} className={`w-36 text-right ${INPUT}`} />
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-lg border border-line">
                {lines.map((l) => {
                  const picked = sel[l.id] || 0;
                  // [⑭] 기타는 상품이 1개여도 «선택»(체크박스·토글 노출·기본 미선택). 환불·교환은 1개면 항상 선택.
                  const multi = lines.length > 1 || isEtc;
                  const on = multi ? picked > 0 : true;
                  const lineShown = on ? (picked === l.qty ? l.lineTotal : l.unit * picked) : l.lineTotal; // 체크 안 돼도 줄금액 표시(회색)
                  return (
                    <div key={l.id} className="flex items-center gap-2 border-b border-line last:border-b-0">
                      {/* [A3] 체크·사진·이름 전체가 «이 줄» 토글 버튼(44px+) — 다른 줄에 영향 없음 */}
                      <button
                        type="button"
                        onClick={multi ? () => setQty(l.id, on ? 0 : l.qty, l.qty) : undefined}
                        aria-label={multi ? "이 상품 선택" : undefined}
                        className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left outline-none ${multi ? "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink" : "cursor-default"}`}
                      >
                        {multi ? (
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[13px] ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-transparent"}`}>✓</span>
                        ) : null}
                        {l.photo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={l.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" loading="lazy" />
                        ) : <span className="h-10 w-10 shrink-0 rounded-lg border border-line bg-surface-2" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold text-ink">{l.product_name}</span>
                          <span className="block truncate text-[13px] text-ink-mute">{optLabel(l.color, l.size) || l.product_name}{l.qty >= 2 ? ` × ${l.qty}` : ""}</span>
                        </span>
                      </button>
                      {/* [⑰] 한 줄 주문도 수량 조절 노출. 한 줄(비multi)은 1까지만(0 은 multi 일 때만 — 선택 해제). */}
                      {l.qty > 1 && on ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" aria-label="수량 줄이기" onClick={() => setQty(l.id, Math.max(multi ? 0 : 1, picked - 1), l.qty)} className="h-9 w-9 rounded-lg border border-line text-[14px] font-bold text-ink-soft">−</button>
                          <span className="w-6 text-center text-[14px] font-bold text-ink tabular-nums">{picked}</span>
                          <button type="button" aria-label="수량 늘리기" onClick={() => setQty(l.id, picked + 1, l.qty)} className="h-9 w-9 rounded-lg border border-line text-[14px] font-bold text-ink-soft">+</button>
                        </div>
                      ) : null}
                      <div className={`w-20 shrink-0 pr-2 text-right text-[14px] font-bold tabular-nums ${on ? "text-ink" : "text-ink-mute"}`}>{formatComma(lineShown)}원</div>
                    </div>
                  );
                })}
              </div>
            )}
            {snapshotUnmatched ? (
              <div className="mt-1.5 text-[12px] text-danger-tx">저장된 상품을 주문에서 못 찾았어요 — 상품을 다시 선택해 주세요.</div>
            ) : null}
            {!isExchange && !isEtc && pointUsed > 0 ? (
              <div className="mt-1.5 text-[12px] text-warn-tx">포인트 {formatComma(pointUsed)}원 사용 주문 — 환불액에서 자동 차감하지 않아요</div>
            ) : null}
            {/* [⑱] 기타 이슈 — 관련 상품 따로 추가(등록상품/직접). 환불·교환에선 숨김(값 유지). */}
            {isEtc ? <IssueExtraItems value={extra} onChange={setExtra} /> : null}
          </div>

          {/* 3. 사유 — [2026-10-25 사장님 「자주 쓰는 내용·사유 중복」] 칩 한 줄로 합침. 칩 하나가 메모 첫머리 + 사유(반품비 판정)를 같이 정한다.
               reason 값(단순변심/상품문제/기타)·반품비 규칙은 예전 사유 칩과 같다. 기타 유형은 사유 없음. */}
          {issueType !== "etc" ? (
            <div className="mb-5">
              <div className={SUB_LABEL}>{isShip ? "출고 이유" : "사유"}</div>
              <div className="flex flex-wrap gap-2">
                {ISSUE_MEMO_PRESETS[issueType].map((p) => {
                  const on = presetLabel === p.label;
                  return (
                    <button key={p.label} type="button" aria-pressed={on} onClick={() => {
                        const list = ISSUE_MEMO_PRESETS[issueType];
                        const prev = list.find((x) => x.label === presetLabel);
                        const cur = clean(issueMemo);
                        const curIsPrev = Boolean(prev?.memo) && cur === prev?.memo;
                        if (on) { // 다시 누르면 해제 — 칩이 채운 메모만 지우고, 사유도 비운다
                          setPresetLabel("");
                          if (curIsPrev) setIssueMemo("");
                          if (p.reason && !isEtc) { setReasonChip(""); setReasonDirty(true); }
                          return;
                        }
                        if (p.memo) setIssueMemo(!cur || curIsPrev ? p.memo : `${p.memo} · ${cur}`);
                        else if (curIsPrev) setIssueMemo("");
                        setPresetLabel(p.label);
                        if (p.reason && !isEtc) {
                          setReasonChip(p.reason); setReasonDirty(true);
                          if (p.reason === "상품문제") setDeductAmount(0); // 상품문제(사업자 귀책) → 반품비 차감 0(전자상거래법 18조)
                        }
                      }}
                      className={CHIP(on)}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {!isEtc && !presetLabel && reasonChip ? <div className="mt-1.5 text-[12px] text-ink-mute">저장된 사유: {reasonChip}</div> : null}
              {/* [2026-10-26 사장님] 메모는 사유 칩 바로 아래 */}
              <div className="mt-3">{memoBlock}</div>
              {/* 반품 날짜 — 환불·교환만. 사유 칩과 헷갈리지 않게 칩(동그란 알약) 대신 날짜 칸 모양(8px) */}
              {!isEtc ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-ink-mute">반품 날짜</span>
                {([["req", "접수", returnRequestedOn, setReturnRequestedOn], ["recv", "도착", returnReceivedOn, setReturnReceivedOn]] as const).map(([key, label, val, setVal]) => {
                  const on = !!clean(val);
                  return editingReturnDate === key ? (
                    <span key={key} className="flex items-center gap-1">
                      <input type="date" aria-label={`${label}일`} value={clean(val).slice(0, 10)} autoFocus onBlur={() => setEditingReturnDate("")} onChange={(e) => setVal(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-[14px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
                      <button type="button" onClick={() => { setVal(""); setEditingReturnDate(""); }} className="h-9 rounded-lg border border-line px-2 text-[12px] font-semibold text-ink-mute">지우기</button>
                    </span>
                  ) : (
                    <button key={key} type="button" title={on ? "누르면 날짜 수정" : "누르면 오늘 날짜"} onClick={() => { if (!on) setVal(todayKST()); else setEditingReturnDate(key); }}
                      className={`h-9 rounded-lg border px-3 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ink ${on ? "border-ink bg-surface font-bold text-ink" : "border-dashed border-line bg-surface font-semibold text-ink-mute hover:bg-surface-2"}`}>
                      {label}{on ? ` ${dateShortKo(val)}` : " +"}
                    </button>
                  );
                })}
              </div>
              ) : null}
            </div>
          ) : null}

          {/* 4. 환불 — 금액 표 + 방법 / 교환 — 바꿀 옵션 */}
          {!isEtc ? (
          <>
          {/* [⑬ D] 등록 초안 + 환불 + 선택 있음 + 적립>0 일 때만 — 서버 order-return 안분 규칙(선택÷전체×적립)과 같은 식(표시 전용). */}
          {createMode && !isExchange && earnedPoints > 0 && selectedCount > 0 ? (
            <div className="mb-3 text-[12px] text-ink-mute">
              환불 등록 시 포인트 약 {won(totalLineSum > 0 ? (productSum >= totalLineSum ? earnedPoints : Math.floor(earnedPoints * productSum / totalLineSum)) : 0)} 회수 (이 주문 적립 {won(earnedPoints)})
            </div>
          ) : null}

          {!isExchange ? (
            <>
              <div className="mb-4">
                <div className={SUB_LABEL}>환불 금액</div>
                {isCardCancel ? (
                  <div className="rounded-lg border border-line px-3 py-1">
                    {isPartial ? <div className="py-1 text-[12px] text-ink-mute">{lineCount}개 중 {selectedCount}개 반품 · 카드는 전체 취소 뒤 손님과 정리</div> : null}
                    <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-ink-soft">상품금액</span><span className="font-bold text-ink tabular-nums">{won(cardProductAmount)}</span></div>
                    {cardExtra > 0 ? <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-ink-soft">부가세({vatRatePct}%)</span><span className="font-bold text-ink tabular-nums">{won(cardExtra)}</span></div> : null}
                    <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-ink-soft">카드 결제금액</span><span className="font-bold text-ink tabular-nums">{won(cardTotalDisplay)}</span></div>
                    {/* 받을 반품비 = 차감 입력칸(오른쪽) */}
                    <div className="flex items-center justify-between py-1.5 text-[13px]">
                      <span className="text-ink-soft">받을 반품비{reasonVal ? ` (${reasonVal})` : ""}</span>
                      <span className="flex items-center gap-1">
                        <input inputMode="numeric" aria-label="받을 반품비" value={formatComma(deductAmount)} onFocus={selectOnFocus} onChange={(e) => setDeductAmount(parseAmountInput(e.target.value))} className={AMOUNT_INPUT} />
                        <span className="text-ink-mute">원</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-line py-2 text-[16px] font-bold"><span className="text-ink">카드 전체 취소</span><span className="text-ink tabular-nums">{won(cardTotalDisplay)}</span></div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-line px-3 py-1">
                    {/* 기준 줄(항상) */}
                    <div className="py-1 text-[12px] text-ink-mute">{baseSummaryText}</div>
                    <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-ink-soft">상품금액</span><span className="font-bold text-ink tabular-nums">{won(productSum)}</span></div>
                    {showShippingRow ? (
                      <div className="py-1.5 text-[13px]">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-ink-soft">
                            <input type="checkbox" checked={includeShipping} onChange={(e) => { setIncludeShipping(e.target.checked); setShippingTouched(true); }} className="h-4 w-4 shrink-0 accent-[var(--color-ink)]" />
                            배송비
                          </label>
                          <span className="flex items-center gap-1">
                            <input inputMode="numeric" aria-label="배송비" value={formatComma(shipFee)} onFocus={selectOnFocus} onChange={(e) => { setShipFee(parseAmountInput(e.target.value)); setShipFeeTouched(true); }} className={AMOUNT_INPUT} />
                            <span className="text-ink-mute">원</span>
                          </span>
                        </div>
                        {shippingStatusText ? <div className="mt-0.5 text-right text-[12px] text-ink-mute">{shippingStatusText}</div> : null}
                      </div>
                    ) : null}
                    {/* 차감/반품비 = 입력칸(오른쪽). 손님 변심 → 「반품비」, 미선택 → 「차감」. 상품 문제(저장 차감 없음)면 숨김·0. */}
                    {showDeductRow ? (
                      <div className="flex items-center justify-between py-1.5 text-[13px]">
                        <span className="text-ink-soft">{deductRowLabel}</span>
                        <span className="flex items-center gap-1">
                          <span className="text-danger-tx">−</span>
                          <input inputMode="numeric" aria-label={deductRowLabel} value={formatComma(deductAmount)} onFocus={selectOnFocus} onChange={(e) => setDeductAmount(parseAmountInput(e.target.value))} className={`${AMOUNT_INPUT} !text-danger-tx`} />
                          <span className="text-ink-mute">원</span>
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-line py-2 text-[16px] font-bold"><span className="text-ink">환불할 금액</span><span className="text-[20px] text-ink tabular-nums">{won(amountFinal)}</span></div>
                  </div>
                )}
              </div>

              {/* 방법 — 칩 → 계좌 */}
              <div className="mb-4">
                <div className={SUB_LABEL}>방법</div>
                <div className="flex flex-wrap gap-2">
                  {(isCardOrder ? ["카드취소", "계좌이체", "포인트", "없음"] : ["계좌이체", "포인트", "없음"]).map((mth) => (
                    <button key={mth} type="button" aria-pressed={method === mth} onClick={() => setMethod(mth)} className={CHIP(method === mth)}>
                      {mth === "없음" ? "환불 없음" : mth}
                    </button>
                  ))}
                </div>
                {methodNote ? <div className="mt-1.5 text-[12px] text-ink-mute">{methodNote}</div> : null}
                {method === "계좌이체" ? (
                  <div className="mt-2">
                    {isCardOrder ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-warn-tx">카드결제 주문이에요.<button type="button" onClick={() => setMethod("카드취소")} className="h-7 rounded-lg border border-line bg-surface px-2 text-[12px] font-semibold text-ink hover:bg-surface-2">카드취소로</button></div>
                    ) : null}
                    {holderExcluded ? (
                      <div className="mb-2 text-[12px] text-warn-tx">예금주가 &lsquo;{clean(item.account_holder)}&rsquo;로 잘못 저장돼 있어 손님 이름으로 바꿔뒀어요 — 맞으면 저장</div>
                    ) : null}
                    {item.account_hidden ? (
                      <div className="text-[14px] font-bold text-ink">{[bankDisplayName(bank), holder].filter(Boolean).join(" · ")}<div className="mt-1 text-[12px] text-ink-mute">완료 후 30일이 지나 계좌번호는 가려졌어요</div></div>
                    ) : (
                      /* [2026-10-23 사장님 「계좌 칸 제대로」] 붙여넣기 한 칸 → 은행·계좌번호·예금주가 채워지고, 못 읽은 칸만 주황 표시.
                         복사는 두 가지: 이체정보(은행 앱용 한 줄) / 카톡 안내(손님에게 보낼 여러 줄). 저장·인식 함수(applyPaste) 그대로. */
                      <div className="rounded-lg border border-line p-3">
                        <textarea value={paste} onChange={(e) => applyPaste(e.target.value)} onPaste={(e) => { e.preventDefault(); applyPaste(e.clipboardData.getData("text")); }} rows={2} aria-label="계좌 정보 붙여넣기" placeholder="손님이 보낸 계좌를 그대로 붙여넣으세요&#10;(예: 국민 46130204112708 홍채윤)" className="w-full resize-none rounded-lg border border-dashed border-line bg-surface-2 p-2.5 text-[16px] leading-6 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[132px_1fr_112px]">
                          <label className="grid gap-1 text-[12px] font-semibold text-ink-mute">은행
                            <select value={BANK_OPTIONS.includes(bank as typeof BANK_OPTIONS[number]) ? bank : (bank ? "기타" : "")} onChange={(e) => setBank(e.target.value === "기타" ? "" : e.target.value)} className={`${INPUT} ${acctMissing.includes("bank") ? "ring-2 ring-warn-tx" : ""}`}>
                              <option value="">선택</option>
                              {BANK_OPTIONS.map((b) => <option key={b} value={b}>{bankDisplayName(b)}</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[12px] font-semibold text-ink-mute">계좌번호
                            <input value={account} onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))} onFocus={selectOnFocus} placeholder="숫자만" inputMode="numeric" className={`min-w-0 tabular-nums ${INPUT} ${acctMissing.includes("account") ? "ring-2 ring-warn-tx" : ""}`} />
                          </label>
                          <label className="grid gap-1 text-[12px] font-semibold text-ink-mute">예금주
                            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="이름" className={`min-w-0 ${INPUT} ${acctMissing.includes("holder") || holderExcluded ? "ring-2 ring-warn-tx" : ""}`} />
                          </label>
                        </div>
                        {acctMissing.length > 0 ? <div className="mt-1.5 text-[12px] text-warn-tx">주황 칸을 확인해 주세요{acctMissing.includes("holder") ? " — 예금주는 손님 이름으로 채워 뒀어요" : ""}</div> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => void copyTransferShort()} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white">이체정보 복사</button>
                          <button type="button" onClick={copyTransferInfo} className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2">카톡 안내 복사</button>
                          {account ? <span className="min-w-0 truncate text-[12px] text-ink-mute">{transferCopyText(bankDisplayName(bank), account, holder, amountFinal)}</span> : null}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            /* [2026-10-23 사장님] 교환 — «무엇으로 바꿀까요?» 같은 상품 다른 옵션 / 다른 등록상품을 골라 exchange_option 에 「원래 → 새 상품」으로 기록(재고·주문 무접촉).
               송장 칸은 [A3]에서 삭제(reship_tracking 저장값 보존). */
            <div className="mb-4">
              <div className={SUB_LABEL}>무엇으로 바꿀까요?</div>
              {/* [2026-10-25] 고른 값이 상자와 입력칸에 두 번 보이던 것 → 입력칸 하나(고르면 여기에 채워지고, 직접 고쳐도 됨) */}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={selectedCount === 0} onClick={() => setExPicker("same")} className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-40">같은 상품 · 옵션 바꾸기</button>
                <button type="button" onClick={() => setExPicker("other")} className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2">다른 상품으로</button>
              </div>
              <div className="relative mt-2">
                <input value={exchangeOption} onChange={(e) => setExchangeOption(e.target.value)} aria-label="바꿀 상품" placeholder="고르거나 직접 적기 (예: 블랙/XL → 블랙/2XL)" className={`w-full pr-16 ${INPUT} ${exchangeOption ? "!border-ink" : "!font-normal"}`} />
                {exchangeOption ? <button type="button" onClick={() => setExchangeOption("")} className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2">지우기</button> : null}
              </div>
            </div>
          )}
          </>
          ) : null}

          {/* 5. 메모 — 기타 유형만 여기(사유 칩이 없어서). 환불·교환·출고는 사유 칩 바로 아래(2026-10-26 사장님) */}
          {issueType === "etc" ? memoBlock : null}
          {/* 다음 할 일은 저장값 있으면 회색으로만. */}
          {nextActionSaved ? <div className="mb-1 text-[12px] text-ink-mute">다음 할 일: {nextActionSaved}</div> : null}
        </div>

        {/* 하단 고정 — [삭제] … [닫기] [저장]. 완료(이체·취소·지급 등)는 목록 「해결완료」에서. */}
        {saveError ? <div className="border-t border-line px-4 py-2 text-[12px] text-danger-tx">저장 실패: {saveError}</div> : null}
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          {onDelete && !createMode ? <button type="button" disabled={saving} onClick={onDelete} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-danger-tx hover:bg-surface-2 disabled:opacity-50">삭제</button> : null}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-line bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2">닫기</button>
          <button type="button" disabled={saving || (!isEtc && !linesLoaded && !!orderCode) || (!isEtc && linesError)} onClick={saveOnly} className="h-10 min-w-[112px] rounded-lg bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">{saving ? (createMode ? "등록 중…" : "저장 중…") : createMode ? "등록" : "저장"}</button>
        </div>
        {/* [2026-10-23] 교환 «바꿀 상품» 고르기 — 등록상품 창을 기록용으로만 재사용(재고·주문 무접촉, onAdd 는 글자만 만든다) */}
        {exPicker ? (
          <LiveOrderRegisteredProductPicker
            adding={false}
            title={exPicker === "same" ? "같은 상품 · 바꿀 옵션 고르기" : "바꿀 상품 고르기"}
            confirmLabel="이걸로 교환"
            initialSearch={exPicker === "same" ? (lines.find((l) => (sel[l.id] || 0) > 0)?.product_name || "") : ""}
            onClose={() => setExPicker("")}
            onAdd={async (inp) => {
              const from = lines.find((l) => (sel[l.id] || 0) > 0);
              const fromOpt = from ? optLabel(from.color, from.size) : "";
              const toOpt = optLabel(inp.color, inp.size);
              // [14:57 사장님] 송장·챙기기에서도 알아보게 상품 이름까지 — 「아크네스튜디오 청바지 XS → S」 / 다른 상품이면 「A XS → B M」
              const fromTxt = from ? [from.product_name, fromOpt].filter(Boolean).join(" ") : "";
              const toTxt = exPicker === "same" ? (toOpt || inp.productName) : [inp.productName, toOpt].filter(Boolean).join(" ");
              setExchangeOption(fromTxt ? `${fromTxt} → ${toTxt}` : toTxt);
              return true;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
