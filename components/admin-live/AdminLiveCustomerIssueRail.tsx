"use client";

// components/admin-live/AdminLiveCustomerIssueRail.tsx
// 목적: 고객관리 오른쪽 고객이슈 패널
// 주의: 주문/입금/배송/정산 상태 변경 없음. 고객이슈 admin_tasks 조회/등록/수정만 처리.

import { useEffect, useMemo, useRef, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { splitIssueBody, mergeIssueBody } from "@/lib/issueBodyMeta";
import { CUSTOMER_TERMS } from "./adminLiveCustomerTerms";
import { formatKoreanPhone } from "@/lib/order/phone";
import { supabase } from "@/lib/supabase";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { pickIssueProductRows } from "@/lib/issueProductLabel";
import { RefundProcessModal, type LedgerDetail } from "./AdminLiveRefundLedgerPanel";
import { productSnapshotFromItems, refundListButtonLabel, ledgerSummaryLine, pickPrimaryLedger } from "@/lib/refundLedger";

// [2026-09-26] refund_ledger 목록 요약 행(대표 선택·표시용). 같은 주문에 여러 개면 pickPrimaryLedger 로 1개.
type LedgerRow = {
  id: string; admin_task_id: string; order_lookup_code: string; created_at: string; updated_at: string;
  stage: string; kind: string; amount_final: number; method: string; done_at: string;
  bank: string; account_holder: string; exchange_option: string; account_number: string; account_last4: string;
  card_total: number; adjustments: Array<{ label: string; amount: number }>;
};
import { bankDisplayName } from "@/lib/parseBankAccount";
import { ISSUE_FILTER_CHIPS, matchesIssueFilterChip, issueRawTypes } from "@/lib/issueFilter";

type AdminIssueTask = {
  id?: string | number | null;
  title?: string | null;
  body?: string | null;
  task_type?: string | null;
  status?: string | null;
  priority?: string | null;
  customer_id?: string | number | null;
  customer_nickname?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  completed_at?: string | null;
  is_resolved?: boolean | null;
  raw_payload?: Record<string, unknown> | null;
  related_product?: string | null;
  /** 어디서 만들어졌나 — "order_return_flow" 면 주문상세 반품/교환 등록으로 생긴 건 */
  source?: string | null;
  resolved_note?: string | null;
};

type CustomerIssueCustomerOption = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
};

type Props = {
  customerOptions?: CustomerIssueCustomerOption[];
};

// [2026-09-23] 「지운 건」 탭 추가 — hide 는 DB 삭제가 아니라 status='deleted' 라 되살릴 수 있다.
type IssueTab = "open" | "all" | "resolved" | "deleted";

type IssueForm = {
  nickname: string;
  name: string;
  phone: string;
  taskTypes: string[];
  priority: string;
  memo: string;
};

// [2026-09-26] 고객이슈 표의 «단 하나의» grid 템플릿 — 머리글·모든 줄이 이 상수를 그대로 써서 칸이 어긋나지 않는다.
const ISSUE_GRID = "grid-cols-[36px_76px_120px_88px_124px_112px_1fr_auto]";

// [2026-09-26] 교환·환불 처리 대상인 이슈인가 — task_type(exchange/return/refund) 또는 유형 칩(교환/반품/환불).
//   이 줄에만 「환불 처리」 버튼·장부 요약을 붙인다.
export function isRefundKindTask(task: { task_type?: string | null }): boolean {
  const t = String(task?.task_type ?? "").trim().toLowerCase();
  return t === "exchange" || t === "return" || t === "refund";
}

const ISSUE_TYPE_OPTIONS: Array<[string, string]> = [
  ["exchange", "교환"],
  ["return", "반품"],
  ["refund", "환불"],
  ["purchase", "구매"],
  ["bad_customer", "진상"],
  ["general", "기타"],
];

// [2026-09-26] 등록·편집 셀렉터가 «보여주는» 유형 — 진상/구매 제외(교환·반품·환불·기타).
//   ⚠️ 저장값·기존데이터 라벨 인식용 ISSUE_TYPE_OPTIONS 는 그대로 둔다(진상/구매 건도 정상 표시).
const REGISTER_TYPE_OPTIONS: Array<[string, string]> = [
  ["exchange", "교환"],
  ["return", "반품"],
  ["refund", "환불"],
  ["general", "기타"],
];

const PRIORITY_OPTIONS: Array<[string, string]> = [
  ["normal", "보통"],
  ["high", "중요"],
  ["urgent", "긴급"],
  ["low", "낮음"],
];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanCompact(value: unknown) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits) return formatKoreanPhone(digits);   // [2026-08-30] 표기 통일 (02-6490-6376)

  return clean(value) || "-";
}

function cleanMultiline(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizePayload(payload: unknown): AdminIssueTask[] {
  const row = payload as {
    tasks?: AdminIssueTask[];
    adminTasks?: AdminIssueTask[];
    data?: AdminIssueTask[];
    items?: AdminIssueTask[];
  };

  if (Array.isArray(payload)) return payload as AdminIssueTask[];
  if (Array.isArray(row?.tasks)) return row.tasks;
  if (Array.isArray(row?.adminTasks)) return row.adminTasks;
  if (Array.isArray(row?.data)) return row.data;
  if (Array.isArray(row?.items)) return row.items;

  return [];
}

function isResolved(task: AdminIssueTask) {
  const status = clean(task.status).toLowerCase();

  return Boolean(
    task.is_resolved ||
      task.resolved_at ||
      task.completed_at ||
      status.includes("resolved") ||
      status.includes("done") ||
      status.includes("complete") ||
      status.includes("해결") ||
      status.includes("완료")
  );
}

function taskKey(task: AdminIssueTask, index: number) {
  return clean(task.id) || `${clean(task.title)}-${clean(task.created_at)}-${index}`;
}

function rawValue(task: AdminIssueTask, keys: string[]) {
  const rawPayload = task.raw_payload || {};

  for (const key of keys) {
    const value = clean(rawPayload[key]);

    if (value) return value;
  }

  return "";
}

function rawArray(task: AdminIssueTask, key: string) {
  const rawPayload = task.raw_payload || {};
  const value = rawPayload[key];

  if (!Array.isArray(value)) return [];

  return value.map(clean).filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function getNickname(task: AdminIssueTask) {
  return (
    clean(task.customer_nickname) ||
    rawValue(task, ["nickname", "youtube_nickname", "customer_nickname"]) ||
    clean(task.title).replace("[고객이슈]", "").split("-")[0]?.trim() ||
    "-"
  );
}

function getName(task: AdminIssueTask) {
  return clean(task.customer_name) || rawValue(task, ["name", "customer_name"]) || "-";
}

function getPhone(task: AdminIssueTask) {
  // [2026-09-21 버그] 화면엔 「전화번호 −」인데 등록 원문엔 번호가 멀쩡히 있었다.
  //   반품 접수로 자동 등록된 이슈는 admin_tasks 에 전화번호 «컬럼»을 안 넣고
  //   본문(body)에만 「전화번호: 010…」으로 적어둔다(order-return/route.ts 129행).
  //   → 컬럼이 비면 본문에서 뽑는다. 사장님이 전화를 걸어야 하는 정보라 안 보이면 안 된다.
  return (
    clean(task.customer_phone) ||
    rawValue(task, ["phone", "customer_phone"]) ||
    extractBodyField(task, "전화번호:") ||
    ""
  );
}

function getIssueTypes(task: AdminIssueTask) {
  const rawTypes = rawArray(task, "issue_types");
  const single = clean(task.task_type);
  const values = uniqueValues([...rawTypes, single]).filter((value) =>
    ISSUE_TYPE_OPTIONS.some(([key]) => key === value)
  );

  return values.length > 0 ? values : ["general"];
}

function getIssueTypeLabel(value: unknown) {
  const raw = clean(value) || "general";
  const found = ISSUE_TYPE_OPTIONS.find(([key]) => key === raw);

  return found?.[1] || raw;
}

function getPriorityLabel(value: unknown) {
  const raw = clean(value) || "normal";
  const found = PRIORITY_OPTIONS.find(([key]) => key === raw);

  return found?.[1] || raw;
}

function getIssueText(task: AdminIssueTask) {
  const text = cleanMultiline(task.body);

  if (!text) return clean(task.title).replace("[고객이슈]", "").trim() || "고객이슈 내용 없음";

  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  const contentLine =
    lines.find((line) => line.startsWith("내용:")) ||
    lines.find((line) => line.startsWith("메모:")) ||
    lines.find((line) => !line.includes(":")) ||
    lines[0] ||
    text;

  return contentLine.replace(/^(내용|메모):\s*/, "").trim();
}

// [2026-09-21 데이터 손실 버그] 사장님: 「수정하면 전화번호가 삭제됨」
//   원인: 수정창은 «메타줄을 걷어낸 메모»만 채우는데, 저장할 때 body 를 그 메모로
//     통째로 덮어써서 본문의 전화번호·닉네임·이름이 영구히 지워졌다.
//   자르고 합치는 규칙은 lib/issueBodyMeta.ts 한 곳에만 둔다(기준이 갈라지면 또 지워진다).
//   scripts/test-issue-body-meta.mjs 가 이를 지킨다.
function getFullMemo(task: AdminIssueTask) {
  const text = cleanMultiline(task.body);
  if (!text) return getIssueText(task);
  return splitIssueBody(text).memo || getIssueText(task);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateLabel(value: unknown) {
  const text = clean(value);

  if (!text) return "-";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}(${weekdays[date.getDay()]}) ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

// [2026-08-23 사장님 요청] 접힌 카드에서도 주문번호·대상상품이 보이게 — 클릭(전체 보기) 없이 핵심 파악.
function extractBodyField(task: AdminIssueTask, prefix: string) {
  const text = cleanMultiline(task.body);
  if (!text) return "";
  const line = text
    .split(/\n+/)
    .map((l) => clean(l))
    .find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

// [2026-09-21] issueRows / IssueRow 제거 — 카드가 «6줄 표»를 그리던 함수들이다.
//   NN/g 「Accordions on Desktop」: 펼치는 데 드는 상호작용 비용이 쌓이고,
//   접힌 줄은 «내용을 알려주는 제목»이어야 한다. 표를 접어두는 건 둘 다 어긴 구조였다.

function IssueTypeChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (nextValue: string[]) => void;
}) {
  const selected = value.length > 0 ? value : ["general"];

  return (
    <div className="flex flex-wrap gap-2">
      {REGISTER_TYPE_OPTIONS.map(([key, label]) => {
        const active = selected.includes(key);

        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = active ? selected.filter((item) => item !== key) : [...selected, key];

              onChange(next.length > 0 ? next : ["general"]);
            }}
            className={`h-9 rounded-xl px-3 text-sm font-black ${
              active ? "bg-rose-deep text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3"
            }`}
          >
            {active ? "✓ " : ""}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// [2026-09-24] 줄 버튼 생김새는 여기서만 정한다 — 탭마다 제각각이던 것을 하나로.
//   보조(수정·지우기·영구삭제): 흰 바탕 + 테두리, 글자색만 다르다.
//   주(해결완료·되살리기·미해결로): 채움(또는 테두리형 1종). 높이 32px · 최소너비로 자리가 흔들리지 않는다.
//   ⚠ 너비를 «고정»한다. min-width 로 두면 글자 수에 따라(지우기 3자 vs 영구삭제 4자)
//     탭마다 처리 칸 너비가 187/189/198px 로 어긋난다 — 실제로 렌더해서 재 보고 고친 값이다.
const SUB_BTN =
  "flex h-8 w-[64px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-[11px] font-black transition disabled:opacity-45";
const MAIN_BTN =
  "flex h-8 w-[72px] shrink-0 items-center justify-center rounded-lg text-[11px] font-black transition hover:opacity-90 disabled:opacity-45";
/** 버튼이 없는 칸 — 자리를 비워 두어 탭을 옮겨도 처리 칸이 안 흔들린다 */
const SUB_BTN_SLOT = "h-8 w-[64px] shrink-0";

function IssueCard({
  task,
  index,
  selected = false,
  onToggleSelect,
  onEdit,
  onResolve,
  onDelete,
  onRestore,
  onUnresolve,
  onPurge,
  busy = false,
  photos = [],
  onPhotoZoom,
  ledgerInfo = null,
  isRepresentativeIssue = false,
  repIssueDate = "",
  amountText = "",
  onOpenRefund,
}: {
  task: AdminIssueTask;
  index: number;
  /** [2026-09-25] 일괄 처리용 선택 상태 — 줄 맨 앞 체크박스 */
  selected?: boolean;
  onToggleSelect?: (task: AdminIssueTask) => void;
  onEdit: (task: AdminIssueTask) => void;
  onResolve: (task: AdminIssueTask) => void | Promise<void>;
  /** [2026-09-23] 잘못 등록된 건 지우기(반품 흐름이면 포인트까지 되돌림) */
  onDelete?: (task: AdminIssueTask) => void | Promise<void>;
  /** [2026-09-23] 「지운 건」 탭에서 되살리기 */
  onRestore?: (task: AdminIssueTask) => void | Promise<void>;
  /** [2026-09-24] 해결완료를 실수로 누른 건 미해결로 되돌리기 */
  onUnresolve?: (task: AdminIssueTask) => void | Promise<void>;
  /** [2026-09-24] 「지운 건」 영구삭제 — 되돌릴 수 없다 */
  onPurge?: (task: AdminIssueTask) => void | Promise<void>;
  busy?: boolean;
  /** [2026-09-23] 상품 사진 — 상품을 골라 등록한 이슈에만 붙는다. 없으면 빈 배열. */
  photos?: string[];
  onPhotoZoom?: (url: string) => void;
  /** [2026-09-26] 교환·환불 건의 장부 요약(있을 때만). 진행단계·최종환불액·방법. */
  ledgerInfo?: { stage?: string; kind?: string; amount_final?: number; method?: string; done_at?: string; bank?: string; account_holder?: string; exchange_option?: string; account_number?: string; account_last4?: string; card_total?: number; adjustments?: Array<{ label: string; amount: number }> } | null;
  /** [2026-09-26] 이 이슈가 주문의 «대표» 환불 기록인가(대표만 금액 요약, 나머지는 「같은 주문 처리 중」). */
  isRepresentativeIssue?: boolean;
  /** 대표 기록(대표 이슈) 등록일 — 다른 이슈 줄의 「M/D 이슈에서 처리 중」 표기용. */
  repIssueDate?: string;
  /** [2026-09-26] 목록 「단가 × 수량」(매칭 성공 시). 교환/반품/환불 건에만. */
  amountText?: string;
  /** [2026-09-26] 「환불 처리」 — 처리 창 열기(교환/반품/환불 건에만). */
  onOpenRefund?: (task: AdminIssueTask) => void;
}) {
  // [2026-09-21 사장님] 「2번씩이나 클릭해야 하고 너무 보기 불편함.
  //   필요한 고객정보 닉네임·이름·전화번호·년월일·특이사항 보기 좋게 딱 안 돼?」
  //   맞는 지적이다. 접기/펼치기를 «아예 없앤다».
  //     NN/g 「Accordions on Desktop」 — 대부분의 내용을 다 봐야 하는 화면이면
  //     접지 말고 한 번에 보여라. 펼치는 상호작용 비용이 쌓여 부담이 된다.
  //   화면은 가로로 넓은데 세로로만 쌓고 있었다 → 관리자 화면답게 «표 한 줄»로 간다.
  //   (쿠팡 윙·스마트스토어 반품관리도 목록은 표다)
  const done = isResolved(task);
  const deleted = clean(task.status).toLowerCase() === "deleted";
  const isRefund = isRefundKindTask(task);
  // [2026-09-26 5차] 버튼 글자 — 교환만 「교환하기」, 반품/환불 「환불하기」(순수 함수, 기록·단계 무관)
  const _rawTypes = issueRawTypes(task);
  const refundBtnLabel = refundListButtonLabel(_rawTypes);
  // [2026-09-26] 💳 요약 — 대표 이슈만 금액. 같은 주문의 다른 이슈는 「같은 주문 — M/D 이슈에서 처리 중」.
  const ledgerLine = (() => {
    if (!isRefund || !ledgerInfo) return "";
    if (isRepresentativeIssue) return ledgerSummaryLine(ledgerInfo, bankDisplayName(clean(ledgerInfo?.bank)));
    const d = new Date(String(repIssueDate).includes("T") ? String(repIssueDate) : String(repIssueDate).replace(" ", "T"));
    const md = Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
    return `같은 주문 — ${md ? `${md} ` : ""}이슈에서 처리 중`;
  })();
  // 반품/교환 등록으로 만들어진 건인가 — 지울 때 포인트·반품기록까지 되돌려야 한다
  const fromReturn = clean((task as { source?: unknown }).source) === "order_return_flow";
  const issueTypes = getIssueTypes(task);
  const nickname = getNickname(task);
  const name = getName(task);
  const phone = formatPhone(getPhone(task));
  const orderNo = extractBodyField(task, "주문번호:");
  const product = extractBodyField(task, "대상상품:") || clean(task.related_product);
  // [2026-09-23 사장님] 「고객 이슈 들어가면 내용이 다 안보임 수정 눌러야만 전체 내용 확인 가능」
  //   원인은 칸 폭이나 줄 제한이 아니라 «읽는 함수»였다. getIssueText 는 본문을 줄로 쪼갠 뒤
  //   첫 줄 하나만 돌려준다(212~230행). 그래서 「불량 교환 완료 / 반품택배 미도착」의 둘째 줄이
  //   목록에선 아예 넘어오지 않았고, 수정창(getFullMemo)에서만 보였다.
  //   → 목록도 수정창과 «같은 함수»를 쓴다. 기준이 갈라지면 또 이런다.
  const memo = getFullMemo(task);
  const priority = getPriorityLabel(task.priority);

  // 유형은 «색»으로 가른다 — 환불과 교환은 처리 방법이 완전히 달라서 한눈에 갈라져야 한다.
  const typeTone = (type: string) =>
    type === "refund"
      ? "bg-danger-bg text-danger-tx"
      : type === "exchange"
        ? "bg-warn-bg text-warn-tx"
        : "bg-surface-2 text-ink-soft";

  // [2026-09-25 사장님] 「상품명과 이슈 내용이 한줄에 있어서 이슈 내용을 밑에칸으로 내려주고
  //   이모지를 붙이던 폰트색상을 달리하던 구분좀 쉽게」
  //   예전: `상품명 · 메모` 를 한 줄에 붙였다(join " · ") → 어디까지가 상품명인지 눈으로 갈라야 했다.
  //   지금: 윗줄 📦 상품명(검정·굵게) / 아랫줄 💬 이슈 내용(장미색·굵게). 같은 말이면 한 번만.
  const memoShown = memo && memo !== product ? memo : "";
  const detail = [product, memoShown].filter(Boolean).join(" · ");   // title(툴팁)·검색용 한 줄

  return (
    <div
      key={taskKey(task, index)}
      // [2026-09-25 사장님] 「왜 다 폰트를 희미하게 처리한거야?」
      //   예전: 해결된 줄 전체에 opacity-60 → 글자까지 흐려져 WCAG 대비(4.5:1) 아래로 떨어졌다.
      //   지금: 글자는 그대로 또렷하게. 상태는 «왼쪽 색 띠 + 연한 초록 배경»으로만 가른다.
      //   (물건챙기기의 다 챙긴 카드와 같은 방식 — bg-ok-bg)
      className={`relative grid ${ISSUE_GRID} items-start gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 transition hover:bg-surface-2 ${selected ? "bg-rose-soft/50" : done ? "bg-ok-bg/40" : ""}`}
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${done ? "bg-[var(--color-ok-tx)]" : "bg-[var(--color-danger-tx)]"}`} />

      {/* [2026-09-25 사장님] 「맨앞에 체크 박스」 — NN/g 일괄 작업 원칙: 줄 맨 앞 체크박스 + 머리줄 전체선택.
          32px 짜리 라벨로 감싸 손가락으로도 눌린다(체크박스 자체는 18px). */}
      <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-2" title="이 건 선택">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(task)}
          aria-label={`${nickname || name || "이 건"} 선택`}
          className="h-[18px] w-[18px] cursor-pointer accent-[var(--color-rose-deep)] outline-none focus-visible:ring-2 focus-visible:ring-rose-deep"
        />
      </label>

      {/* 유형 */}
      <div className="flex flex-wrap gap-1">
        {issueTypes.map((type) => (
          <span key={type} className={`rounded px-1.5 py-0.5 text-[11px] font-black ${typeTone(type)}`}>
            {getIssueTypeLabel(type)}
          </span>
        ))}
        {priority !== "보통" ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-black text-ink-soft">{priority}</span>
        ) : null}
        {/* [2026-09-26] 「자동」 배지는 표시만 제거(source==="order_return_flow"). fromReturn 변수·삭제 포인트반환 로직은 그대로. */}
      </div>

      {/* 닉네임 */}
      <div className="truncate text-[13px] font-black text-ink" title={nickname}>{nickname}</div>

      {/* 이름 */}
      <div className="truncate text-[12px] font-bold text-ink-soft" title={name}>{name}</div>

      {/* 전화번호 — 눌러서 바로 복사 */}
      <div className="truncate text-[12px] font-bold text-ink-soft" title={phone}>
        {phone ? (
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(phone).then(() => showAdminToast("전화번호를 복사했어요.", "success")).catch(() => {}); }}
            className="truncate hover:text-rose-deep hover:underline"
            title="눌러서 복사"
          >
            {phone}
          </button>
        ) : (
          <span className="text-ink-mute">번호 없음</span>
        )}
      </div>

      {/* 년월일 */}
      <div className="text-[12px] font-bold text-ink-soft">{dateLabel(task.created_at)}</div>

      {/* 특이사항 — 자르지 않고 «전부» 보여준다(사장님 확정).
          접기/펼치기는 2026-09-21 에 「2번씩이나 클릭해야 한다」고 하셔서 없앤 기준을 유지한다.
          whitespace-pre-line = 메모에 적힌 줄바꿈을 그대로 살린다(HTML 기본은 줄바꿈을 지운다). */}
      <div className="flex min-w-0 items-start gap-2">
        {/* [2026-09-23] 상품 사진 — 상품을 골라 등록한 이슈에만. 최대 3장, 누르면 크게. */}
        {photos.length > 0 ? (
          <div className="flex shrink-0 gap-1">
            {photos.slice(0, 3).map((url, photoIndex) => (
              <button
                key={`${url}-${photoIndex}`}
                type="button"
                onClick={() => onPhotoZoom?.(url)}
                title="눌러서 크게 보기"
                className="relative h-11 w-11 overflow-hidden rounded-lg border border-line bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="상품 사진" className="h-full w-full object-cover" loading="lazy" />
                {photoIndex === 2 && photos.length > 3 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-[var(--color-ink)]/60 text-[11px] font-black text-white">
                    +{photos.length - 2}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className="min-w-0 flex-1 text-[12px] leading-5"
          title={[detail, orderNo ? `주문번호 ${orderNo}` : ""].filter(Boolean).join("\n")}
        >
          {/* 윗줄 — 📦 상품명 (한 줄 그대로, ×N 포함) */}
          {product ? (
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0" aria-hidden>📦</span>
              <span className="min-w-0 break-words font-black text-ink">{product}</span>
            </div>
          ) : null}
          {/* [2026-09-26] 줄합계 · 주문번호 (상품명 아래 줄, 숫자는 진한 글씨·tabular) */}
          {(amountText || orderNo) ? (
            <div className="mt-0.5 text-[13px]">
              {amountText ? <span className="font-black text-ink [font-variant-numeric:tabular-nums]">{amountText}</span> : null}
              {amountText && orderNo ? <span className="text-ink-mute"> · </span> : null}
              {orderNo ? <span className="font-bold text-ink-mute">{orderNo}</span> : null}
            </div>
          ) : null}
          {/* 아랫줄 — 💬 이슈 내용(진한 회색). 메모의 줄바꿈은 그대로(whitespace-pre-line) */}
          {memoShown ? (
            <div className="mt-0.5 flex min-w-0 items-start gap-1.5">
              <span className="shrink-0" aria-hidden>💬</span>
              <span className="min-w-0 whitespace-pre-line break-words font-bold text-ink-soft">{memoShown}</span>
            </div>
          ) : null}
          {!product && !memoShown && !amountText && !orderNo ? <span className="font-bold text-ink-mute">내용 없음</span> : null}
          {/* [2026-09-26] 교환·환불 장부 요약 — 진행단계 · 최종환불액 · 방법 (값 있을 때만) */}
          {ledgerLine ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
              <span className="shrink-0" aria-hidden>💳</span>
              <span className="min-w-0 truncate font-black text-info-tx">{ledgerLine}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 처리 ── [2026-09-24 사장님] 「여러 항목 레이아웃 디자인 UX등 일괄성 있게」
          예전엔 같은 «지우다»가 「등록취소」「지우기」「목록삭제」 세 이름이었고 탭마다 버튼 수도 달랐다.
          이제 어느 탭이든 «보조 · 보조 · 주» 세 칸 고정. 세 번째 칸만 상태에 따라 바뀐다.
            미해결  수정 · 삭제 · [해결완료]
            해결    수정 · 삭제 · [미해결로]
            삭제함   —  · 영구삭제 · [되살리기]
          [2026-09-25 사장님] 「지우기 말고 삭제로 변경요청」 — 「삭제 / 영구삭제」 는 한국 화면 표준 쌍이다
          (윈도우 휴지통·구글 드라이브). Polaris 로 치면 삭제=Remove(목록에서 빼되 보관), 영구삭제=Delete.
          탭 이름도 「지운 건」 → 「삭제함」 으로 맞췄다(버튼은 삭제인데 탭은 지운 건이면 또 어긋난다).
          생김새도 하나로: 보조 = 흰 바탕 + 테두리(글자색만 다름), 주 = 채움. 높이 32px 통일. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {deleted ? (
          <>
            <span className={SUB_BTN_SLOT} />
            <button
              type="button"
              onClick={() => onPurge?.(task)}
              disabled={busy}
              title="되돌릴 수 없습니다 — 기록이 완전히 사라집니다"
              className={`${SUB_BTN} text-danger-tx hover:bg-danger-bg`}
            >
              {busy ? "처리중…" : "영구삭제"}
            </button>
            <button
              type="button"
              onClick={() => onRestore?.(task)}
              disabled={busy}
              className={`${MAIN_BTN} bg-[var(--color-ok-tx)] text-white`}
            >
              {busy ? "처리중…" : "되살리기"}
            </button>
          </>
        ) : (
          <>
            {isRefund ? (
              <button
                type="button"
                onClick={() => onOpenRefund?.(task)}
                disabled={busy}
                title="교환·환불 처리(단계·환불액·계좌) — 포인트는 움직이지 않고 기록만"
                className={`${SUB_BTN} border-rose-line text-rose-deep hover:bg-rose-soft`}
              >
                {refundBtnLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(task)}
              disabled={busy}
              className={`${SUB_BTN} text-ink-soft hover:bg-surface-2`}
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(task)}
              disabled={busy}
              title={fromReturn
                ? "잘못 처리한 건 — 원래대로 되돌립니다(회수한 포인트도 같이)"
                : "잘못 등록한 건 — 「삭제함」 탭으로 옮깁니다(되살릴 수 있어요)"}
              className={`${SUB_BTN} text-danger-tx hover:bg-danger-bg`}
            >
              {busy ? "처리중…" : "삭제"}
            </button>
            {done ? (
              <button
                type="button"
                onClick={() => onUnresolve?.(task)}
                disabled={busy}
                title="실수로 해결완료를 누르셨으면 여기서 미해결로 돌립니다"
                className={`${MAIN_BTN} border border-line bg-surface text-ink-soft hover:bg-surface-2`}
              >
                {busy ? "처리중…" : "미해결로"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onResolve(task)}
                disabled={busy}
                className={`${MAIN_BTN} bg-[var(--color-ok-tx)] text-white`}
              >
                {busy ? "처리중…" : "해결완료"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function emptyIssueForm(): IssueForm {
  return {
    nickname: "",
    name: "",
    phone: "",
    taskTypes: ["general"],
    priority: "normal",
    memo: "",
  };
}

export default function AdminLiveCustomerIssueRail({ customerOptions = [] }: Props) {
  const [activeTab, setActiveTab] = useState<IssueTab>("open");
  // [2026-09-23] 지운 직후 5초 동안 뜨는 «되돌리기» 띠. 놓쳐도 「지운 건」 탭에서 되살릴 수 있다.
  const [undoTarget, setUndoTarget] = useState<AdminIssueTask | null>(null);
  // ── [2026-09-24 사장님 요청] 「고객이슈 뭐 필터 기능 그런거도 없고」 ──
  //   찾아본 기준: 반품 관리 대시보드(AfterShip Returns)는 필터를 기간/상태/사유·유형/항목으로 나눈다.
  //     그건 수천 건을 다루는 큰 쇼핑몰용이고, 우리는 전체 40건이라 그대로 가져오면 화면만 복잡해진다.
  //   NN/g 「Data Tables」: 필터는 «눈에 띄고, 빠르고, 켜져 있으면 표시가 나야» 한다. 개수 기준은 없다.
  //   → 우리 데이터에 실제로 있는 것만 둔다: «검색 한 칸» + «유형 칩».
  //     기간·우선순위는 지금 건수에서 값을 못 한다(등록일 내림차순 정렬 + 40건이면 눈으로 충분).
  //     필요해지면 칩 한 줄만 더 붙이면 되게 만들어 뒀다.
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("");   // "" = 전체
  useEffect(() => {
    if (!undoTarget) return;
    const timer = window.setTimeout(() => setUndoTarget(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoTarget]);
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [newIssueForm, setNewIssueForm] = useState<IssueForm>(() => emptyIssueForm());
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [customerSearchKeyword, setCustomerSearchKeyword] = useState("");
  // [2026-09-21] 3 → 20. 카드가 세로로 길던 시절엔 3개도 화면을 다 먹었지만
  //   이제 한 줄짜리 표라 미해결 10건이 «한 페이지»에 다 들어간다(페이지 넘길 일이 없어진다).
  const issuePageSize = 20;
  const [issuePage, setIssuePage] = useState(1);
  // ── [2026-09-25 사장님] 「체크박스 … 전체선택 … 해결완료 여러건 한번에 … 지우기도 한번에」 ──
  //   찾아본 기준
  //     NN/g 「Bulk Actions: 3 Design Guidelines」: ① 전체선택 제공 ② 선택했을 때만 나타나는 작업 바
  //       ③ 끝나면 알림으로 결과 알리기.
  //     Helios 「Table multi-select」: 체크박스는 줄 맨 앞, 전체선택은 머리줄(=현재 페이지),
  //       작업 바는 표 바로 위에 「N건 선택」 + 버튼. 표가 바뀌면 선택을 리셋.
  //   ⚠ 돈 보호: 「자동」(반품 흐름) 건의 삭제는 포인트 반환이 걸려 있어 일괄에서 뺀다. 한 건씩만.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab, reloadKey, keyword, typeFilter]);
  const [editingIssueTask, setEditingIssueTask] = useState<AdminIssueTask | null>(null);
  const [editingIssueMemo, setEditingIssueMemo] = useState("");
  const [editingIssueTypes, setEditingIssueTypes] = useState<string[]>(["general"]);
  const [editingIssuePriority, setEditingIssuePriority] = useState("normal");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);

      try {
        const response = await fetch("/api/admin-v2/admin-tasks", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const rows = normalizePayload(payload)
          .filter((task) => {
            const haystack = [task.title, task.body, task.task_type].map(clean).join(" ");

            return haystack.includes("고객이슈") || haystack.includes("issue") || Boolean(task.customer_id);
          })
          ;   // [2026-09-23] 지운 건도 들고 온다 — 「지운 건」 탭에서 되살릴 수 있어야 한다

        if (alive) setTasks(rows);
      } catch {
        if (alive) setTasks([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const reload = () => setReloadKey((value) => value + 1);

    window.addEventListener("ruru-admin-task-updated", reload);

    return () => {
      window.removeEventListener("ruru-admin-task-updated", reload);
    };
  }, []);

  const isDeleted = (task: AdminIssueTask) => clean(task.status).toLowerCase() === "deleted";
  // 「지운 건」은 미해결·전체·해결 어디에도 안 섞인다. 예전과 같은 화면을 유지한다.
  const liveTasks = useMemo(() => tasks.filter((task) => !isDeleted(task)), [tasks]);
  const deletedTasks = useMemo(() => tasks.filter(isDeleted), [tasks]);

  const openCount = useMemo(() => liveTasks.filter((task) => !isResolved(task)).length, [liveTasks]);
  const resolvedCount = useMemo(() => liveTasks.filter(isResolved).length, [liveTasks]);

  const tabTasks = useMemo(() => {
    if (activeTab === "open") return liveTasks.filter((task) => !isResolved(task));
    if (activeTab === "resolved") return liveTasks.filter(isResolved);
    if (activeTab === "deleted") return deletedTasks;

    return liveTasks;
  }, [activeTab, liveTasks, deletedTasks]);

  // 검색은 «화면에 보이는 글자»를 전부 본다 — 닉네임·이름·전화·상품·주문번호·메모.
  //   띄어쓰기와 하이픈을 지우고 비교한다(010-1234 로도, 01012340 로도 찾힌다).
  const searchKey = (value: unknown) => clean(value).replace(/[\s-]/g, "").toLowerCase();

  const visibleTasks = useMemo(() => {
    const word = searchKey(keyword);
    return tabTasks.filter((task) => {
      if (typeFilter && !matchesIssueFilterChip(task, typeFilter)) return false;
      if (!word) return true;
      const haystack = searchKey(
        [
          getNickname(task),
          getName(task),
          getPhone(task),
          extractBodyField(task, "주문번호:"),
          extractBodyField(task, "대상상품:"),
          clean(task.related_product),
          getFullMemo(task),
        ].join(" "),
      );
      return haystack.includes(word);
    });
  }, [tabTasks, keyword, typeFilter]);

  const filterOn = Boolean(clean(keyword) || typeFilter);

  useEffect(() => { setIssuePage(1); }, [keyword, typeFilter, activeTab]);

  const issueTotalPages = Math.max(1, Math.ceil(visibleTasks.length / issuePageSize));
  const safeIssuePage = Math.min(Math.max(1, issuePage), issueTotalPages);
  const pageTasks = visibleTasks.slice((safeIssuePage - 1) * issuePageSize, safeIssuePage * issuePageSize);

  // ── 일괄 선택 파생값 ──
  const pageIds = pageTasks.map((t) => clean(t.id)).filter(Boolean);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someOnPageSelected = selectedOnPage.length > 0 && !allOnPageSelected;
  const selectedTasks = useMemo(() => tasks.filter((t) => selectedIds.has(clean(t.id))), [tasks, selectedIds]);
  // [2026-09-25 사장님] 머리줄 전체선택으로 «현재 페이지»가 다 켜지면 → 작업 바에서 «필터 결과 전체»를 한 번에 선택.
  const filteredIds = useMemo(() => visibleTasks.map((t) => clean(t.id)).filter(Boolean), [visibleTasks]);
  const canSelectWholeTab = allOnPageSelected && selectedIds.size < filteredIds.length;
  const selectWholeTab = () => setSelectedIds(new Set(filteredIds));

  // ── [2026-09-26] 교환·환불 장부(고객이슈 안에서 처리) ──
  //   같은 주문(order_lookup_code)의 refund_ledger 는 «주문번호»로 묶어 조회 → 대표 1개로 표시(이중 이체 방지).
  const [ledgerByOrder, setLedgerByOrder] = useState<Record<string, LedgerRow[]>>({});
  const [refundReloadTick, setRefundReloadTick] = useState(0);
  const [refundModalItem, setRefundModalItem] = useState<LedgerDetail | null>(null);
  const [refundModalMeta, setRefundModalMeta] = useState<{ openedFromOther: boolean; repDate: string; linkedIssueCount: number }>({ openedFromOther: false, repDate: "", linkedIssueCount: 1 });
  const refundOrderCodesKey = Array.from(new Set(pageTasks.filter(isRefundKindTask).map((t) => extractBodyField(t, "주문번호:")).filter(Boolean))).sort().join(",");
  useEffect(() => {
    let alive = true;
    const codes = refundOrderCodesKey ? refundOrderCodesKey.split(",") : [];
    if (codes.length === 0) { setLedgerByOrder({}); return; }
    (async () => {
      const res = await fetch(`/api/admin-live/refund-ledger?orderCodes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      if (!alive || !p?.ok) return;
      const map: Record<string, LedgerRow[]> = {};
      for (const r of (p.items || []) as Array<Record<string, unknown>>) {
        const code = clean(r.order_lookup_code);
        if (!code) continue;
        (map[code] || (map[code] = [])).push({
          id: String(r.id), admin_task_id: clean(r.admin_task_id), order_lookup_code: code,
          created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""),
          stage: String(r.stage ?? ""), kind: String(r.kind ?? ""), amount_final: Number(r.amount_final) || 0,
          method: String(r.method ?? ""), done_at: String(r.done_at ?? ""), bank: String(r.bank ?? ""),
          account_holder: String(r.account_holder ?? ""), exchange_option: String(r.exchange_option ?? ""),
          account_number: String(r.account_number ?? ""), account_last4: String(r.account_last4 ?? ""),
          card_total: Number(r.card_total) || 0, adjustments: Array.isArray(r.adjustments) ? (r.adjustments as Array<{ label: string; amount: number }>) : [],
        });
      }
      setLedgerByOrder(map);
    })().catch(() => { /* 실패해도 목록은 정상, 요약만 생략 */ });
    return () => { alive = false; };
  }, [refundOrderCodesKey, refundReloadTick]);

  // 주문번호별 «대표» 기록(계좌 있는 것 우선·최근순). 목록·처리창·복사·완료가 모두 이걸 쓴다.
  const primaryByOrder = useMemo(() => {
    const out: Record<string, LedgerRow | null> = {};
    for (const code of Object.keys(ledgerByOrder)) out[code] = pickPrimaryLedger(ledgerByOrder[code]);
    return out;
  }, [ledgerByOrder]);

  // [2026-09-26] 목록 줄합계 — 주문번호가 있는 «모든» 페이지 줄의 주문 상품을 «주문번호로 한 번에» 조회(행마다 쿼리 금지).
  //   금액 = 매칭된 줄들의 줄합계(submitRowLineTotal 서버 계산) 합. 매칭 실패 시 생략(칸 비움).
  const [amountByTask, setAmountByTask] = useState<Record<string, string>>({});
  const pageOrderCodesKey = Array.from(new Set(pageTasks.map((t) => extractBodyField(t, "주문번호:")).filter(Boolean))).sort().join(",");
  useEffect(() => {
    let alive = true;
    const codes = pageOrderCodesKey ? pageOrderCodesKey.split(",") : [];
    if (codes.length === 0) { setAmountByTask({}); return; }
    (async () => {
      const res = await fetch(`/api/admin-live/order-lines?codes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      if (!alive || !p?.ok) return;
      const byCode = (p.byCode || {}) as Record<string, { lines?: Array<Record<string, unknown>> }>;
      const map: Record<string, string> = {};
      for (const t of pageTasks) {
        const code = extractBodyField(t, "주문번호:");
        const lines = (code && byCode[code]?.lines) || [];
        if (lines.length === 0) continue;
        const rawItems = (t.raw_payload && typeof t.raw_payload === "object" ? (t.raw_payload as { items?: unknown }).items : null);
        const targetIds = Array.isArray(rawItems)
          ? rawItems.map((x) => clean((x as { productId?: unknown; product_id?: unknown })?.productId ?? (x as { product_id?: unknown })?.product_id)).filter(Boolean)
          : [];
        const matched = targetIds.length > 0
          ? lines.filter((l) => targetIds.includes(clean(l.product_id)))
          : pickIssueProductRows(lines, extractBodyField(t, "대상상품:") || clean(t.related_product));
        if (matched.length === 0) continue; // 매칭 실패 → 금액 칸 생략
        const sum = matched.reduce((s, m) => s + (Number(m.lineTotal) || 0), 0);
        map[clean(t.id)] = `${sum.toLocaleString("ko-KR")}원`;
      }
      setAmountByTask(map);
    })().catch(() => { /* 실패해도 목록 정상, 금액만 생략 */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageOrderCodesKey]);

  // 같은 주문의 «열린» 환불/교환 이슈 수(완료 시 함께 해결완료할 대상). 페이지 기준.
  const openIssueCountForOrder = (orderCode: string) =>
    !orderCode ? 1 : Math.max(1, pageTasks.filter((t) => isRefundKindTask(t) && !isResolved(t) && clean(t.status).toLowerCase() !== "deleted" && extractBodyField(t, "주문번호:") === orderCode).length);

  const openRefund = async (task: AdminIssueTask) => {
    const tid = clean(task.id);
    const orderCode = extractBodyField(task, "주문번호:");
    const primary = orderCode ? primaryByOrder[orderCode] : null;
    const siblings = orderCode ? (ledgerByOrder[orderCode] || []) : [];
    const linkedIssueCount = openIssueCountForOrder(orderCode);
    // 같은 주문에 이미 기록이 있으면 «대표»를 열어 편집(새 기록 생성 금지, 이중 이체 방지).
    if (primary?.id) {
      try {
        const res = await fetch(`/api/admin-live/refund-ledger?id=${encodeURIComponent(primary.id)}`, { cache: "no-store" });
        const p = await res.json().catch(() => null);
        if (p?.ok) {
          const item = { ...(p.item as LedgerDetail) };
          // 대표에 없는 계좌·차감 값을 형제 기록에서 보충(저장 눌러야 반영).
          const acctSib = siblings.find((s) => clean(s.id) !== clean(item.id) && (clean(s.account_number) || clean(s.bank)));
          if (acctSib) {
            if (!clean(item.bank)) item.bank = acctSib.bank;
            if (!clean(item.account_number)) item.account_number = acctSib.account_number;
            if (!clean(item.account_holder)) item.account_holder = acctSib.account_holder;
          }
          if ((!Array.isArray(item.adjustments) || item.adjustments.length === 0)) {
            const adjSib = siblings.find((s) => clean(s.id) !== clean(item.id) && Array.isArray(s.adjustments) && s.adjustments.length > 0);
            if (adjSib) item.adjustments = adjSib.adjustments;
          }
          setRefundModalItem(item);
          setRefundModalMeta({ openedFromOther: clean(primary.admin_task_id) !== tid, repDate: clean(primary.created_at), linkedIssueCount });
          return;
        }
      } catch { /* fallthrough */ }
      showAdminToast("장부 항목을 불러오지 못했습니다.", "error");
      return;
    }
    // 첫 처리 — 저장 시 admin_task_id 로 새 행 생성(UNIQUE). 상품·주문번호·고객·사유는 고객이슈에서.
    const rawItems = (task.raw_payload && typeof task.raw_payload === "object" ? (task.raw_payload as Record<string, unknown>).items : undefined);
    setRefundModalItem({
      id: "",
      created_at: "",
      admin_task_id: tid,
      kind: clean(task.task_type).toLowerCase() === "exchange" ? "교환" : "반품",
      stage: "접수",
      method: "없음",
      amount_base: 0,
      amount_final: 0,
      adjustments: [],
      product_snapshot: productSnapshotFromItems(rawItems),
      nickname: getNickname(task),
      customer_name: getName(task),
      customer_phone: getPhone(task),
      order_lookup_code: orderCode,
      reason: splitIssueBody(task.body).memo,
    });
    setRefundModalMeta({ openedFromOther: false, repDate: "", linkedIssueCount });
  };

  // 주문번호 묶음 → 그 주문들의 «대표» 기록만(주문당 1줄). 이중 이체 방지.
  const fetchPrimariesForSelected = async (): Promise<Array<Record<string, unknown>>> => {
    const refundSel = selectedTasks.filter(isRefundKindTask);
    const codes = Array.from(new Set(refundSel.map((t) => extractBodyField(t, "주문번호:")).filter(Boolean)));
    if (codes.length === 0) return [];
    const res = await fetch(`/api/admin-live/refund-ledger?orderCodes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store" });
    const p = await res.json().catch(() => null);
    const rows = (p?.ok ? p.items : []) as Array<Record<string, unknown>>;
    const byOrder: Record<string, Array<Record<string, unknown>>> = {};
    for (const r of rows) { const c = clean(r.order_lookup_code); if (c) (byOrder[c] || (byOrder[c] = [])).push(r); }
    return codes.map((c) => pickPrimaryLedger(byOrder[c])).filter((r): r is Record<string, unknown> => !!r);
  };

  // 이체 목록 복사 — 대표 기록 중 계좌이체·금액 있는 건만(주문당 1줄). 전체 계좌번호는 copyIds 1회.
  const copyTransferListBulk = async () => {
    if (selectedTasks.filter(isRefundKindTask).length === 0) { showAdminToast("선택한 교환·환불 건이 없어요."); return; }
    const primaries = await fetchPrimariesForSelected();
    const targets = primaries.filter((r) => String(r.method) === "계좌이체" && (Number(r.amount_final) || 0) > 0);
    if (targets.length === 0) { showAdminToast("계좌이체·금액이 있는 선택 건이 없어요."); return; }
    const detailById: Record<string, LedgerDetail> = {};
    try {
      const dRes = await fetch(`/api/admin-live/refund-ledger?copyIds=${encodeURIComponent(targets.map((r) => String(r.id)).join(","))}`, { cache: "no-store" });
      const dP = await dRes.json().catch(() => null);
      if (dP?.ok) for (const d of (dP.items as LedgerDetail[]) || []) detailById[clean(d.id)] = d;
    } catch { /* 실패해도 뒷4자리 없는 대로 */ }
    const lines = targets.map((r) => {
      const d = detailById[clean(r.id)] || null;
      const holder = clean(d?.account_holder) || clean(r.account_holder) || clean(r.customer_name) || clean(r.nickname);
      return [clean(d?.bank) || clean(r.bank), clean(d?.account_number), holder, `${(Number(r.amount_final) || 0).toLocaleString("ko-KR")}원`].filter(Boolean).join(" ");
    });
    const textOut = lines.join("\n");
    try { await navigator.clipboard.writeText(textOut); showAdminToast(`이체 목록 ${targets.length}건 복사했어요 (은행 계좌 예금주 금액)`, "success"); }
    catch { showAdminToast("복사 실패 — 직접 복사하세요:\n\n" + textOut, "warning"); }
  };

  // 엑셀(CSV) — 대표 기록만(주문당 1줄), 계좌는 뒷4자리만.
  const downloadRefundExcel = async () => {
    if (selectedTasks.filter(isRefundKindTask).length === 0) { showAdminToast("선택한 교환·환불 건이 없어요."); return; }
    const rows = await fetchPrimariesForSelected();
    if (rows.length === 0) { showAdminToast("장부에 기록된 선택 건이 없어요(처리 전이면 먼저 「환불 처리」).", "warning"); return; }
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["접수일", "고객", "전화뒷4", "구분", "단계", "최종환불액", "방법", "계좌뒷4", "이체일", "완료일"];
    const body = rows.map((r) => [clean(r.created_at), clean(r.nickname) || clean(r.customer_name), clean(r.customer_phone).slice(-4), clean(r.kind), clean(r.stage), Number(r.amount_final) || 0, clean(r.method), clean(r.account_last4), clean(r.transferred_at), clean(r.done_at)].map(esc).join(","));
    const csv = "﻿" + [header.map(esc).join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `교환환불_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  const toggleSelect = (task: AdminIssueTask) => {
    const id = clean(task.id);
    if (!id) return;
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  /** 머리줄 체크박스 = «현재 페이지» 전체 (Helios 기준). 다 켜져 있으면 끈다. */
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => n.delete(id));
      else pageIds.forEach((id) => n.add(id));
      return n;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  // 머리줄 체크박스의 «일부 선택(▪)» 표시는 DOM 속성이라 ref 로 넣는다
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPageSelected; }, [someOnPageSelected]);

  /** 한 건 처리 함수들 — 확인창·알림·새로고침 없이 «서버 호출만». 일괄 루프가 쓴다. */
  const patchOne = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/admin-v2/admin-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const payload = await res.json().catch(() => null);
    return Boolean(res.ok && payload?.ok);
  };
  const purgeOne = async (id: string) => {
    const res = await fetch("/api/admin-v2/admin-tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const payload = await res.json().catch(() => null);
    return Boolean(res.ok && payload?.ok);
  };
  /** 일괄 실행 — 한 건씩 차례로(서버 API 가 단건이라). 끝나면 성공/실패 건수를 한 번에 알린다(NN/g ③). */
  const runBulk = async (items: AdminIssueTask[], label: string, doOne: (id: string) => Promise<boolean>) => {
    if (items.length === 0) return;
    setSaving(true);
    let ok = 0; let fail = 0;
    try {
      for (const t of items) {
        const id = clean(t.id);
        if (!id) { fail += 1; continue; }
        if (await doOne(id)) ok += 1; else fail += 1;
      }
    } finally {
      setSaving(false);
    }
    setIssuePage(1);
    setReloadKey((value) => value + 1);   // 표가 바뀌므로 선택도 같이 비워진다(위 useEffect)
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    showAdminToast(`${label} ${ok}건 완료${fail > 0 ? ` · ${fail}건 실패` : ""}`, fail > 0 ? "warning" : "success");
  };

  const bulkResolve = async () => {
    const items = selectedTasks.filter((t) => !isDeleted(t) && !isResolved(t));
    if (items.length === 0) { showAdminToast("해결완료로 바꿀 미해결 건이 선택되지 않았어요."); return; }
    const ok = await showAdminConfirm(`선택한 ${items.length}건을 해결완료 처리할까요?`, { title: "일괄 해결완료", confirmText: `${items.length}건 해결완료`, cancelText: "그만두기", tone: "info" });
    if (!ok) return;
    await runBulk(items, "해결완료", (id) => patchOne(id, { action: "resolve", resolved_note: "고객관리에서 일괄 해결완료" }));
  };
  const bulkUnresolve = async () => {
    const items = selectedTasks.filter((t) => !isDeleted(t) && isResolved(t));
    if (items.length === 0) { showAdminToast("미해결로 되돌릴 해결 건이 선택되지 않았어요."); return; }
    const ok = await showAdminConfirm(`선택한 ${items.length}건을 미해결로 되돌릴까요?`, { title: "일괄 미해결로", confirmText: `${items.length}건 미해결로`, cancelText: "그만두기", tone: "warning" });
    if (!ok) return;
    await runBulk(items, "미해결로", (id) => patchOne(id, { action: "restore", resolved_note: "고객관리에서 일괄 미해결로" }));
  };
  const bulkDelete = async () => {
    const live = selectedTasks.filter((t) => !isDeleted(t));
    // ⚠ 「자동」(반품 흐름) 건은 삭제 = 반품 등록 취소 + 포인트 반환. 돈이 움직이므로 일괄에서 뺀다.
    const auto = live.filter(isReturnFlowIssue);
    const items = live.filter((t) => !isReturnFlowIssue(t));
    if (items.length === 0) {
      showAdminToast(auto.length > 0
        ? `선택한 ${auto.length}건은 모두 「자동」(반품 등록) 건이에요.\n포인트 반환이 걸려 있어 한 건씩만 삭제할 수 있어요.`
        : "삭제할 건이 선택되지 않았어요.", "warning");
      return;
    }
    const ok = await showAdminConfirm(
      `선택한 ${items.length}건을 삭제할까요?\n\n「삭제함」 탭으로 옮겨져서 언제든 되살릴 수 있어요.` +
        (auto.length > 0 ? `\n\n⚠ 「자동」 ${auto.length}건은 포인트 반환이 걸려 있어 이번 일괄에서 뺍니다. 한 건씩 삭제해주세요.` : ""),
      { title: "일괄 삭제", confirmText: `${items.length}건 삭제`, cancelText: "그만두기", tone: "warning" },
    );
    if (!ok) return;
    await runBulk(items, "삭제", (id) => patchOne(id, { action: "hide", resolved_note: "고객관리에서 일괄 삭제" }));
  };
  const bulkRestore = async () => {
    const items = selectedTasks.filter(isDeleted);
    if (items.length === 0) { showAdminToast("되살릴 건이 선택되지 않았어요."); return; }
    const fromReturnCancel = items.filter((t) => clean(t.resolved_note).startsWith("반품/교환 등록 취소")).length;
    const ok = await showAdminConfirm(
      `선택한 ${items.length}건을 되살릴까요?\n「미해결」에서 다시 보입니다.` +
        (fromReturnCancel > 0 ? `\n\n⚠ ${fromReturnCancel}건은 «반품 등록 취소»로 삭제된 건이라 손님께 돌려드린 포인트·반품기록은 돌아오지 않고 이슈 줄만 되살아납니다.` : ""),
      { title: "일괄 되살리기", confirmText: `${items.length}건 되살리기`, cancelText: "그만두기", tone: "warning" },
    );
    if (!ok) return;
    await runBulk(items, "되살리기", (id) => patchOne(id, { action: "restore", resolved_note: "고객관리에서 일괄 되돌리기" }));
  };
  const bulkPurge = async () => {
    const items = selectedTasks.filter(isDeleted);
    if (items.length === 0) { showAdminToast("영구삭제할 건이 선택되지 않았어요."); return; }
    const ok = await showAdminConfirm(
      `선택한 ${items.length}건을 영구삭제할까요?\n\n이건 되돌릴 수 없습니다. 기록이 완전히 사라집니다.`,
      { title: "일괄 영구삭제", confirmText: `${items.length}건 영구삭제`, cancelText: "그만두기", tone: "danger" },
    );
    if (!ok) return;
    await runBulk(items, "영구삭제", purgeOne);
  };

  // ── [2026-09-23 사장님 요청] 「상품선택해서 했을 경우에는 상품 사진이 있는경우 같이 표시」 ──
  //   이슈에는 상품이 «글자»로만 남으므로 상품을 되찾아 사진을 붙인다. 화면에 보이는 페이지만.
  //     ① 새 이슈: raw_payload.items 에 상품 id 가 있다 → products 조회 1번으로 끝
  //     ② 옛 이슈: id 가 없다 → 주문번호로 orders 를 찾고, 「대상상품:」에 적힌 행만 고른다
  //        (pickIssueProductRows — 한 주문서의 다른 상품까지 딸려오면 엉뚱한 사진이 붙는다)
  //   ⚠ 읽기 전용. 사진 주소를 저장하지 않는다 — 상품 사진을 바꾸면 여기도 최신으로 따라온다.
  //   ⚠ 실패해도 목록은 그대로 뜬다. 사진은 «보조»다.
  const [issuePhotos, setIssuePhotos] = useState<Record<string, string[]>>({});
  const photoLookupKey = pageTasks
    .map((task, index) => `${taskKey(task, index)}:${extractBodyField(task, "주문번호:")}`)
    .join("|");

  useEffect(() => {
    let stopped = false;
    if (pageTasks.length === 0) { setIssuePhotos({}); return; }

    (async () => {
      try {
        type Want = { key: string; rows: { productId: string; productName: string; color: string }[] };
        const wants: Want[] = [];
        const lookupCodes: string[] = [];
        const needOrderLookup: { key: string; code: string; target: string }[] = [];

        pageTasks.forEach((task, index) => {
          const key = taskKey(task, index);
          const raw = (task.raw_payload || {}) as { items?: unknown };
          const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];

          if (items.length > 0) {
            wants.push({
              key,
              rows: items.map((it) => ({
                productId: clean(it.productId),
                productName: clean(it.productName),
                color: clean(it.color),
              })),
            });
            return;
          }

          const code = extractBodyField(task, "주문번호:");
          const target = extractBodyField(task, "대상상품:") || clean(task.related_product);
          if (code && target) {
            needOrderLookup.push({ key, code, target });
            lookupCodes.push(code);
          }
        });

        // ② 옛 이슈 보충 — 주문번호로 한 번에
        if (lookupCodes.length > 0) {
          const { data } = await supabase
            .from("orders")
            .select("id, order_lookup_code, product_id, product_name, color, size, qty, is_deleted")
            .in("order_lookup_code", Array.from(new Set(lookupCodes)));
          if (stopped) return;

          const byCode = new Map<string, Record<string, unknown>[]>();
          for (const row of (data || []) as Record<string, unknown>[]) {
            if (row.is_deleted === true) continue;
            const code = clean(row.order_lookup_code);
            if (!code) continue;
            byCode.set(code, [...(byCode.get(code) || []), row]);
          }

          for (const need of needOrderLookup) {
            const picked = pickIssueProductRows(byCode.get(need.code) || [], need.target);
            if (picked.length === 0) continue;
            wants.push({
              key: need.key,
              rows: picked.map((row) => ({
                productId: clean(row.product_id),
                productName: clean(row.product_name),
                color: clean(row.color),
              })),
            });
          }
        }

        const productIds = Array.from(
          new Set(wants.flatMap((want) => want.rows.map((row) => row.productId)).filter(Boolean)),
        );
        if (productIds.length === 0) { if (!stopped) setIssuePhotos({}); return; }

        const { data: productRows } = await supabase.from("products").select("*").in("id", productIds);
        if (stopped) return;

        const byId = new Map<string, Record<string, unknown>>();
        for (const row of (productRows || []) as Record<string, unknown>[]) {
          byId.set(clean((row as { id?: unknown }).id), row);
        }

        const next: Record<string, string[]> = {};
        for (const want of wants) {
          const urls: string[] = [];
          for (const row of want.rows) {
            const productRow = byId.get(row.productId);
            if (!productRow) continue;
            // 사진 고르는 규칙은 주문상세와 같은 공용 함수 하나만 쓴다(엉뚱한 사진 금지)
            const found = resolveOrderItemPhoto(productRow, { productName: row.productName, color: row.color });
            if (found.url && !urls.includes(found.url)) urls.push(found.url);
          }
          if (urls.length > 0) next[want.key] = urls;
        }
        setIssuePhotos(next);
      } catch {
        if (!stopped) setIssuePhotos({});   // 사진은 보조 — 실패해도 목록은 정상
      }
    })();

    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoLookupKey]);

  const [issuePhotoPreview, setIssuePhotoPreview] = useState("");

  const customerSearchResults = useMemo(() => {
    const keyword = cleanCompact(customerSearchKeyword || customerSearchDraft);

    if (!keyword) return [];

    return customerOptions
      .filter((customer) => {
        const haystack = cleanCompact(`${customer.nickname} ${customer.name} ${customer.phone} ${formatPhone(customer.phone)}`);

        return haystack.includes(keyword);
      })
      .slice(0, 8);
  }, [customerOptions, customerSearchDraft, customerSearchKeyword]);

  const updateNewIssueForm = (patch: Partial<IssueForm>) => {
    setNewIssueForm((current) => ({ ...current, ...patch }));
  };

  const selectCustomer = (customer: CustomerIssueCustomerOption) => {
    updateNewIssueForm({
      nickname: customer.nickname,
      name: customer.name,
      phone: customer.phone,
    });
    setCustomerSearchDraft(`${customer.nickname} ${customer.name} ${formatPhone(customer.phone)}`);
    setCustomerSearchKeyword("");
  };

  const closeAdd = () => {
    setShowMemoAdd(false);
    setNewIssueForm(emptyIssueForm());
    setCustomerSearchDraft("");
    setCustomerSearchKeyword("");
  };

  const openEdit = (task: AdminIssueTask) => {
    setEditingIssueTask(task);
    setEditingIssueMemo(getFullMemo(task));
    setEditingIssueTypes(getIssueTypes(task));
    setEditingIssuePriority(clean(task.priority) || "normal");
  };

  const closeEdit = () => {
    setEditingIssueTask(null);
    setEditingIssueMemo("");
    setEditingIssueTypes(["general"]);
    setEditingIssuePriority("normal");
  };

  const saveIssueMemo = async () => {
    const memo = cleanMultiline(newIssueForm.memo);

    if (!memo) {
      showAdminToast("고객이슈 메모 내용을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const nickname = clean(newIssueForm.nickname);
      const name = clean(newIssueForm.name);
      const phone = clean(newIssueForm.phone);
      const issueTypes = newIssueForm.taskTypes.length > 0 ? newIssueForm.taskTypes : ["general"];
      const titleName = nickname || name || phone || "수동메모";

      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_type: issueTypes[0] || "general",
          title: `[고객이슈] ${titleName}`,
          body: memo,
          customer_name: name,
          customer_nickname: nickname,
          priority: newIssueForm.priority || "normal",
          source: "admin-live-customers",
          raw_payload: {
            nickname,
            name,
            phone,
            issue_types: issueTypes,
            memo,
            source: "admin-live-customers",
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "고객이슈 메모 추가 실패");
      }

      closeAdd();
      setActiveTab("open");
      setIssuePage(1);
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("고객이슈 메모를 추가했습니다.");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const resolveIssueTask = async (task: AdminIssueTask) => {
    const id = clean(task.id);

    if (!id) {
      showAdminToast("해결 처리할 고객이슈 ID가 없습니다.");
      return;
    }

    const ok = await showAdminConfirm("이 고객이슈를 해결완료 처리할까요?");
    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        action: "resolve",
        resolved_note: "고객관리에서 해결완료 처리",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      showAdminToast("해결완료 처리 실패\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    setIssuePage(1);
    setReloadKey((value) => value + 1);
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    showAdminToast("고객이슈를 해결완료 처리했습니다.");
  };

  // ── [2026-09-23 사장님 요청] 잘못 등록된 고객이슈 지우기 / 되살리기 ──
  //   ⚠ 주문상세 «반품/교환 등록»으로 생긴 건은 고객이슈만 있는 게 아니다.
  //     주문의 반품기록 + (환불이면) 회수된 적립 포인트가 같이 남아 있다.
  //     그래서 그 건은 «반품 등록 취소» API 를 부른다 — 포인트를 자동으로 돌려준다.
  //     서버가 이중 지급을 막는다(source_key + DB 유니크 인덱스).
  const isReturnFlowIssue = (task: AdminIssueTask) =>
    clean((task as { source?: unknown }).source) === "order_return_flow";

  // [2026-09-24 사장님 요청] 「지운건은 뭐 삭제 기능도 없고」
  //   ⚠ 되돌릴 수 없다. 서버는 status='deleted' 인 줄만 지운다(살아있는 이슈는 실수로도 안 지워진다).
  const purgeIssueTask = async (task: AdminIssueTask) => {
    const id = clean(task.id);
    if (!id) return;

    const who = getNickname(task) || getName(task) || "이 건";
    const ok = await showAdminConfirm(
      `${who} 건을 영구삭제할까요?\n\n이건 되돌릴 수 없습니다. 기록이 완전히 사라집니다.`,
      { title: "영구삭제", confirmText: "영구삭제", cancelText: "그만두기", tone: "danger" },
    );
    if (!ok) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        showAdminToast("영구삭제 실패\n" + (payload?.message || "알 수 없는 오류"), "error");
        return;
      }
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("영구삭제했습니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  // [2026-09-25 사장님] 「전체 비우기」 버튼 제거 — 삭제함 탭은 머리줄 전체선택 → 「이 탭 N건 전체 선택」 → 일괄 영구삭제(bulkPurge)로 대체.

  const restoreIssueTask = async (task: AdminIssueTask, silent = false) => {
    const id = clean(task.id);
    if (!id) return false;

    // ⚠ «반품 등록 취소»로 지운 건은 포인트가 이미 손님께 돌아갔고 반품기록도 지워졌다.
    //   이슈만 되살리면 화면과 실제가 어긋나므로, 무엇이 안 돌아오는지 분명히 알리고 확인받는다.
    if (clean(task.resolved_note).startsWith("반품/교환 등록 취소")) {
      const ok = await showAdminConfirm(
        "이 건은 «반품 등록 취소»로 삭제한 건입니다.\n\n" +
          "되살려도 다음은 자동으로 돌아오지 않습니다:\n" +
          "· 손님께 돌려드린 포인트\n" +
          "· 주문의 반품/교환 기록\n\n" +
          "고객이슈 줄만 다시 보이게 할까요?\n(반품을 다시 잡으시려면 주문상세에서 새로 등록해주세요)",
        { title: "되살리기", confirmText: "이슈만 되살리기", cancelText: "취소", tone: "warning" },
      );
      if (!ok) return false;
    }

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore", resolved_note: "고객관리에서 되돌리기" }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      showAdminToast("되돌리기 실패\n" + (payload?.message || "알 수 없는 오류"), "error");
      return false;
    }

    setReloadKey((value) => value + 1);
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    if (!silent) {
      showAdminToast("고객이슈를 되돌렸습니다. 「미해결」에서 다시 보입니다.", "success");
    }
    return true;
  };

  /** 미해결 줄에서 «잘못 등록된 건» 지우기 */
  const deleteIssueTask = async (task: AdminIssueTask) => {
    const id = clean(task.id);
    if (!id) {
      showAdminToast("삭제할 고객이슈 ID가 없습니다.");
      return;
    }

    const who = getNickname(task) || getName(task) || "이 고객";
    const fromReturn = isReturnFlowIssue(task);

    if (fromReturn) {
      // [2026-09-23 사장님 「뭐가 이리 복잡해?」]
      //   묻기 전에 서버에 «무엇이 일어날지»만 물어본다(preview — 아무것도 안 바뀐다).
      //   그래서 확인창에 실제 금액을 띄우고, 이상한 낌새가 있을 때만 한 줄 덧붙인다.
      //   사장님이 매번 「혹시 따로 주셨나」를 떠올리실 필요가 없다.
      setSaving(true);
      let plan: { willRefund?: number; warning?: string } | null = null;
      try {
        const res = await fetch("/api/admin-live/order-return/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: id, preview: true }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) {
          showAdminToast("되돌릴 수 없는 건이에요\n\n" + (payload?.message || "알 수 없는 오류"), "error");
          return;
        }
        plan = payload;
      } finally {
        setSaving(false);
      }

      const refund = Number(plan?.willRefund || 0);
      const warning = clean(plan?.warning);

      const ok = await showAdminConfirm(
        `${who} 님의 반품 처리를 취소하고 원래대로 되돌릴까요?` +
          (refund > 0 ? `\n\n회수했던 포인트 ${refund.toLocaleString("ko-KR")}원을 손님께 돌려드립니다.` : "") +
          (warning ? `\n\n⚠ ${warning}` : ""),
        { title: "반품 처리 취소", confirmText: "되돌리기", cancelText: "그만두기", tone: "warning" },
      );
      if (!ok) return;
    } else {
      const ok = await showAdminConfirm(
        `${who} 님의 고객이슈를 삭제할까요?\n\n「삭제함」 탭으로 옮겨져서 언제든 되살릴 수 있어요.`,
        { title: "고객이슈 삭제", confirmText: "삭제", cancelText: "그만두기", tone: "warning" },
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      if (fromReturn) {
        const response = await fetch("/api/admin-live/order-return/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: id }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          showAdminToast("반품 등록 취소 실패\n\n" + (payload?.message || "알 수 없는 오류"), "error");
          return;
        }
        setIssuePage(1);
        setReloadKey((value) => value + 1);
        window.dispatchEvent(new Event("ruru-admin-task-updated"));
        showAdminToast(String(payload.message || "반품/교환 등록을 취소했습니다."), "success");
        // ⚠ 포인트가 오간 건은 «되돌리기» 한 번으로 못 되살린다 → 「지운 건」 탭으로 안내만 한다
        return;
      }

      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "hide", resolved_note: "고객관리에서 삭제" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        showAdminToast("삭제 실패\n" + (payload?.message || "알 수 없는 오류"), "error");
        return;
      }

      setIssuePage(1);
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      setUndoTarget(task);      // 5초 동안 «되돌리기» 띠를 띄운다
    } finally {
      setSaving(false);
    }
  };

  const saveEditedIssueMemo = async () => {
    const task = editingIssueTask;

    if (!task) return;

    const id = clean(task.id);

    if (!id) {
      showAdminToast("수정할 고객이슈 ID가 없습니다.");
      return;
    }

    const memo = cleanMultiline(editingIssueMemo);

    if (!memo) {
      showAdminToast("수정할 메모 내용을 입력해주세요.");
      return;
    }

    const issueTypes = editingIssueTypes.length > 0 ? editingIssueTypes : ["general"];

    // [2026-09-21] 메타줄(전화번호·닉네임·이름·자동날짜…)을 앞에 되살린다.
    //   예전엔 memo 만 보내 본문을 덮어써서 전화번호가 영구히 지워졌다.
    const nextBody = mergeIssueBody(splitIssueBody(cleanMultiline(task.body)).metaLines, memo);

    setSaving(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action: "update",
          title: clean(task.title) || `[고객이슈] ${getNickname(task)}`,
          body: nextBody,
          task_type: issueTypes[0] || "general",
          priority: editingIssuePriority || "normal",
          raw_payload: {
            ...(task.raw_payload || {}),
            issue_types: issueTypes,
            memo,
            edited_from: "admin-live-customers",
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "고객이슈 메모 수정 실패");
      }

      closeEdit();
      setIssuePage(1);
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("고객이슈 메모를 수정했습니다.");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="flex flex-col">
        {/* [2026-09-21 사장님] 「고객 이슈 내용 등록 등…」
            예전엔 오른쪽 끝에 「+ 메모」 두 글자만 떠 있어, 이게 «새 고객이슈를 적는 곳»인지 알 수 없었다.
            (누르면 열리는 창 제목은 「고객이슈 메모 추가」다 — 버튼 이름이 창 이름과 달랐다)
            → 왼쪽에 이 화면이 뭘 하는 곳인지 한 줄, 버튼 이름도 창과 같게 맞춘다. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-black text-ink">📮 고객이슈</div>
            <div className="text-[12px] font-bold text-ink-mute">반품·교환·문의를 적어두고 처리되면 해결완료로 넘깁니다</div>
          </div>

          <button
            type="button"
            onClick={() => setShowMemoAdd(true)}
            className="ml-auto h-9 rounded-xl bg-rose-deep px-3 text-[12px] font-black text-white transition hover:opacity-90"
          >
            + 고객이슈 등록
          </button>

          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-[12px] font-black text-ink-soft hover:bg-surface-2"
          >
            새로고침
          </button>
        </div>

      {/* [2026-09-23] 지운 직후 «되돌리기» 띠 — 5초. 놓쳐도 「지운 건」 탭에서 되살릴 수 있다. */}
      {undoTarget ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-ok-tx/35 bg-ok-bg px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ok-tx">
            {getNickname(undoTarget) || getName(undoTarget) || "고객이슈"} 건을 삭제했습니다 · 「삭제함」 탭에 있어요
          </span>
          <button
            type="button"
            onClick={() => { const t = undoTarget; setUndoTarget(null); void restoreIssueTask(t); }}
            className="h-9 shrink-0 rounded-lg bg-[var(--color-ok-tx)] px-3 text-[12px] font-black text-white hover:opacity-90"
          >
            ↩ 되돌리기
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-surface-2 p-1">
        {[
          ["open", `미해결 ${openCount}`],
          ["all", `전체 ${liveTasks.length}`],
          ["resolved", `해결 ${resolvedCount}`],
          ["deleted", `삭제함 ${deletedTasks.length}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key as IssueTab);
              setIssuePage(1);
            }}
            className={`h-9 rounded-xl text-[12px] font-black outline-none focus-visible:ring-2 focus-visible:ring-rose-deep ${
              activeTab === key ? "bg-surface text-rose-deep shadow-sm" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 찾기 줄 — 검색 한 칸 + 유형 칩. 켜져 있으면 「초기화」가 나타난다(NN/g) ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-mute">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="닉네임 · 이름 · 전화 · 상품 · 주문번호 · 메모"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-[13px] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-mute focus:border-rose-deep"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-line text-[13px] font-black text-ink-soft"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {ISSUE_FILTER_CHIPS.map(([key, label]) => {
            const on = typeFilter === key;
            return (
              <button
                key={key || "all"}
                type="button"
                onClick={() => setTypeFilter(key)}
                className={`h-10 rounded-xl px-3 text-[12px] font-black ${
                  on ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {filterOn ? (
          <button
            type="button"
            onClick={() => { setKeyword(""); setTypeFilter(""); }}
            className="h-10 rounded-xl border border-rose-deep bg-surface px-3 text-[12px] font-black text-rose-deep hover:bg-rose-soft"
          >
            ✕ 초기화
          </button>
        ) : null}

      </div>

      {filterOn ? (
        <div className="mt-2 text-[11px] font-bold text-ink-mute">
          찾은 결과 {visibleTasks.length.toLocaleString("ko-KR")}건
          {clean(keyword) ? ` · 검색 「${clean(keyword)}」` : ""}
          {typeFilter ? ` · 유형 「${getIssueTypeLabel(typeFilter)}」` : ""}
        </div>
      ) : null}

      {/* [2026-09-25] 일괄 작업 바 — 선택했을 때만 나타난다(NN/g ②). 표 바로 위, 「N건 선택」 + 탭에 맞는 버튼(Helios). */}
      {selectedIds.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-line bg-rose-soft px-3 py-2">
          <span className="text-[12px] font-black text-rose-deep">{selectedIds.size}건 선택</span>
          {canSelectWholeTab ? (
            <button type="button" onClick={selectWholeTab} className="h-8 rounded-lg px-2 text-[11px] font-black text-rose-deep underline underline-offset-2 hover:bg-surface">이 탭 {visibleTasks.length.toLocaleString("ko-KR")}건 전체 선택</button>
          ) : null}
          <button type="button" onClick={clearSelection} className="h-8 rounded-lg px-2 text-[11px] font-black text-ink-soft hover:bg-surface">선택 해제</button>
          {/* [2026-09-26] 교환·환불 건 대상 — 이체 목록 복사(계좌이체·금액 있는 건, 이때만 전체 계좌)·엑셀(계좌 뒷4만) */}
          <button type="button" onClick={copyTransferListBulk} className="h-8 rounded-lg border border-rose-line bg-surface px-2 text-[11px] font-black text-rose-deep hover:bg-rose-soft">📋 이체 목록 복사</button>
          <button type="button" onClick={downloadRefundExcel} className="h-8 rounded-lg border border-line bg-surface px-2 text-[11px] font-black text-ink-soft hover:bg-surface-2">⬇ 엑셀</button>
          <div className="ml-auto flex items-center gap-1.5">
            {activeTab === "deleted" ? (
              <>
                <button type="button" onClick={bulkPurge} disabled={saving} className={`${SUB_BTN} text-danger-tx hover:bg-danger-bg`}>{saving ? "처리중…" : "영구삭제"}</button>
                <button type="button" onClick={bulkRestore} disabled={saving} className={`${MAIN_BTN} bg-[var(--color-ok-tx)] text-white`}>{saving ? "처리중…" : "되살리기"}</button>
              </>
            ) : activeTab === "resolved" ? (
              <>
                <button type="button" onClick={bulkDelete} disabled={saving} className={`${SUB_BTN} text-danger-tx hover:bg-danger-bg`}>{saving ? "처리중…" : "삭제"}</button>
                <button type="button" onClick={bulkUnresolve} disabled={saving} className={`${MAIN_BTN} border border-line bg-surface text-ink-soft hover:bg-surface-2`}>{saving ? "처리중…" : "미해결로"}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={bulkDelete} disabled={saving} className={`${SUB_BTN} text-danger-tx hover:bg-danger-bg`}>{saving ? "처리중…" : "삭제"}</button>
                <button type="button" onClick={bulkResolve} disabled={saving} className={`${MAIN_BTN} bg-[var(--color-ok-tx)] text-white`}>{saving ? "처리중…" : "해결완료"}</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* [2026-09-21] 표 머리글 — 어느 칸이 무엇인지 한 번만 적어두면 줄마다 「닉네임:」 같은 라벨이 필요 없다.
          예전 카드가 길었던 이유의 절반이 줄마다 반복되던 라벨이었다. */}
      <div className={`${selectedIds.size > 0 ? "mt-2" : "mt-4"} min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-xl border border-line`}>
        {loading ? (
          <div className="bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">
            고객이슈 불러오는 중...
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">
            표시할 고객이슈가 없습니다.
          </div>
        ) : (
          <div className="min-w-[860px]">
            <div className={`sticky top-0 z-10 grid ${ISSUE_GRID} items-center gap-x-3 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-black text-ink-mute`}>
              {/* 전체선택 = 이 페이지 전부. 일부만 켜져 있으면 ▪(indeterminate) */}
              <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-surface" title={allOnPageSelected ? "이 페이지 전체 선택 해제" : "이 페이지 전체 선택"}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  aria-label="이 페이지 전체 선택"
                  className="h-[18px] w-[18px] cursor-pointer accent-[var(--color-rose-deep)] outline-none focus-visible:ring-2 focus-visible:ring-rose-deep"
                />
              </label>
              <div>유형</div>
              <div>닉네임</div>
              <div>이름</div>
              <div>전화번호</div>
              <div>등록일</div>
              <div>특이사항 · 주문번호</div>
              <div className="text-right">처리</div>
            </div>
            {pageTasks.map((task, index) => (
            <IssueCard
              key={taskKey(task, index)}
              task={task}
              index={index}
              selected={selectedIds.has(clean(task.id))}
              onToggleSelect={toggleSelect}
              photos={issuePhotos[taskKey(task, index)] || []}
              onPhotoZoom={setIssuePhotoPreview}
              onEdit={openEdit}
              onResolve={resolveIssueTask}
              onDelete={deleteIssueTask}
              onRestore={(t) => { void restoreIssueTask(t); }}
              onUnresolve={(t) => { void restoreIssueTask(t, true).then((ok) => { if (ok) showAdminToast("미해결로 되돌렸습니다.", "success"); }); }}
              onPurge={purgeIssueTask}
              busy={saving}
              ledgerInfo={primaryByOrder[extractBodyField(task, "주문번호:")] || null}
              isRepresentativeIssue={(() => { const pr = primaryByOrder[extractBodyField(task, "주문번호:")]; return !!pr && clean(pr.admin_task_id) === clean(task.id); })()}
              repIssueDate={(primaryByOrder[extractBodyField(task, "주문번호:")]?.created_at) || ""}
              amountText={amountByTask[clean(task.id)] || ""}
              onOpenRefund={openRefund}
            />
          ))}
          </div>
        )}
      </div>

      {refundModalItem ? (
        <RefundProcessModal
          item={refundModalItem}
          openedFromOtherIssue={refundModalMeta.openedFromOther}
          repIssueDate={refundModalMeta.repDate}
          linkedIssueCount={refundModalMeta.linkedIssueCount}
          onClose={() => setRefundModalItem(null)}
          onSaved={() => { setRefundModalItem(null); setRefundReloadTick((v) => v + 1); setReloadKey((v) => v + 1); window.dispatchEvent(new Event("ruru-admin-task-updated")); }}
          onCompleted={async () => {
            // 환불/교환 완료 → 같은 «주문»의 열린 이슈 전부 해결완료(상태값만 변경, 부수효과 없음 — 4차 확인).
            const code = clean((refundModalItem as LedgerDetail).order_lookup_code);
            const targets = code
              ? pageTasks.filter((t) => isRefundKindTask(t) && !isResolved(t) && clean(t.status).toLowerCase() !== "deleted" && extractBodyField(t, "주문번호:") === code).map((t) => clean(t.id)).filter(Boolean)
              : [clean((refundModalItem as LedgerDetail).admin_task_id)].filter(Boolean);
            const ids = Array.from(new Set(targets));
            if (ids.length === 0) return true;
            let allOk = true;
            for (const id of ids) {
              try {
                const res = await fetch("/api/admin-v2/admin-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "resolve", resolved_note: "환불/교환 처리 완료(장부)" }) });
                const p = await res.json().catch(() => null);
                if (!(res.ok && p?.ok)) allOk = false;
              } catch { allOk = false; }
            }
            return allOk;
          }}
        />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-2">
        <div className="text-xs font-black text-ink-mute">
          현재페이지 {pageTasks.length.toLocaleString("ko-KR")}건 · 전체 {visibleTasks.length.toLocaleString("ko-KR")}건
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft">
            {issuePageSize}개씩 보기
          </div>

          <button
            type="button"
            onClick={() => setIssuePage(Math.max(1, safeIssuePage - 1))}
            disabled={safeIssuePage <= 1}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
          >
            이전
          </button>

          <div className="ru-badge ru-badge-rose h-9 px-3 py-2">
            {safeIssuePage} / {issueTotalPages}
          </div>

          <button
            type="button"
            onClick={() => setIssuePage(Math.min(issueTotalPages, safeIssuePage + 1))}
            disabled={safeIssuePage >= issueTotalPages}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </div>

      {showMemoAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink-soft)]/35 px-4">
          <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-rose-deep">ADD CUSTOMER ISSUE</div>
                <h3 className="mt-1 text-lg font-black text-ink">고객이슈 메모 추가</h3>
              </div>

              <button
                type="button"
                onClick={closeAdd}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink">🤖 ChatGPT로 고객이슈 정리</div>
              <button
                type="button"
                onClick={() => window.open("https://chatgpt.com/", "_blank", "noopener")}
                className="mt-2 h-9 rounded-lg bg-rose-deep px-3 text-xs font-black text-white"
              >
                🤖 ChatGPT 열기
              </button>
              <div className="mt-1.5 text-[11px] font-bold leading-4 text-ink-mute">
                ChatGPT 창에 카톡 대화를 붙여넣고 "손님 말만 골라 닉네임/이름/유형/내용으로 정리해줘"라고 하세요. 나온 결과를 아래 메모칸에 붙여넣으면 됩니다.
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-black text-ink-soft">고객 검색</div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_96px]">
                <input
                  value={customerSearchDraft}
                  onChange={(event) => {
                    setCustomerSearchDraft(event.target.value);
                    setCustomerSearchKeyword("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setCustomerSearchKeyword(customerSearchDraft);
                    }
                  }}
                  placeholder="닉네임 / 이름 / 전화번호 검색"
                  className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
                />

                <button
                  type="button"
                  onClick={() => setCustomerSearchKeyword(customerSearchDraft)}
                  className="h-11 rounded-xl bg-rose-deep px-3 text-sm font-black text-white transition hover:opacity-90"
                >
                  검색
                </button>
              </div>

              <div className="mt-2 rounded-2xl border border-dashed border-line bg-surface-2 p-2">
                {!clean(customerSearchDraft) ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">
                    닉네임·이름·전화번호를 검색하면 고객 추천이 표시됩니다.
                  </div>
                ) : customerSearchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">
                    검색 결과가 없습니다. 직접 입력도 가능합니다.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {customerSearchResults.map((customer) => (
                      <button
                        key={customer.key}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="grid w-full grid-cols-[1fr_auto] gap-2 rounded-xl bg-surface px-3 py-2 text-left text-xs font-bold text-ink-soft hover:bg-rose-soft"
                      >
                        <span className="min-w-0 truncate">
                          <b className="text-ink">{customer.nickname || "-"}</b> · {customer.name || "-"}
                        </span>
                        <span className="font-black text-rose-deep">{formatPhone(customer.phone)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <input
                value={newIssueForm.nickname}
                onChange={(event) => updateNewIssueForm({ nickname: event.target.value })}
                placeholder="닉네임"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
              />
              <input
                value={newIssueForm.name}
                onChange={(event) => updateNewIssueForm({ name: event.target.value })}
                placeholder="이름"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
              />
              <input
                value={newIssueForm.phone}
                onChange={(event) => updateNewIssueForm({ phone: event.target.value })}
                placeholder="전화번호"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
              />
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-black text-ink-soft">유형 (여러 개 선택 가능)</div>
              <IssueTypeChips
                value={newIssueForm.taskTypes}
                onChange={(nextValue) => updateNewIssueForm({ taskTypes: nextValue })}
              />
            </div>

            <div className="mt-3">
              <select
                value={newIssueForm.priority}
                onChange={(event) => updateNewIssueForm({ priority: event.target.value })}
                className="h-11 w-full rounded-xl border border-line px-3 text-sm font-black text-ink outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    우선순위: {label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={newIssueForm.memo}
              onChange={(event) => updateNewIssueForm({ memo: event.target.value })}
              placeholder="고객이슈 내용을 입력하세요."
              className="mt-3 min-h-[180px] w-full resize-none rounded-2xl border border-line p-3 text-sm font-bold leading-6 outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAdd}
                className="h-11 rounded-xl border border-line bg-surface text-sm font-black text-ink-soft hover:bg-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-rose-deep text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editingIssueTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink-soft)]/35 px-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-ink">고객이슈 수정</h3>
                <p className="mt-1 text-xs font-bold text-ink-soft">
                  {getNickname(editingIssueTask)} / {getName(editingIssueTask)}
                </p>
                <p className="mt-1 text-[11px] font-bold text-ink-mute">
                  고객정보는 수정하지 않고 이슈유형·우선순위·메모만 수정합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-black text-ink-soft">유형 (여러 개 선택 가능)</div>
              <IssueTypeChips value={editingIssueTypes} onChange={setEditingIssueTypes} />
            </div>

            <div className="mt-3">
              <select
                value={editingIssuePriority}
                onChange={(event) => setEditingIssuePriority(event.target.value)}
                className="h-11 w-full rounded-xl border border-line px-3 text-sm font-black text-ink outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    우선순위: {label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={editingIssueMemo}
              onChange={(event) => setEditingIssueMemo(event.target.value)}
              className="mt-3 min-h-[220px] w-full resize-none rounded-2xl border border-line p-3 text-sm font-bold leading-6 outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="h-11 rounded-xl border border-line bg-surface text-sm font-black text-ink-soft hover:bg-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEditedIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-rose-deep text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
              >
                수정 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [2026-09-23] 상품 사진 크게 보기 — 주문상세와 같은 방식(배경 아무 데나 누르면 닫힘) */}
      {issuePhotoPreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-ink)]/70 p-6"
          onClick={() => setIssuePhotoPreview("")}
          role="button"
          tabIndex={-1}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={issuePhotoPreview}
            alt="상품 사진 크게 보기"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </aside>
  );
}
