"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LiveOrder } from "./types";
import { exportLiveOrdersForPicking, exportLiveOrdersForRosen } from "./adminLiveOrderExcelExport";
import LiveOrderPickingModal from "./LiveOrderPickingModal";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import LiveOrderCancelViewFilter, { type LiveOrderCancelViewFilterValue } from "./LiveOrderCancelViewFilter";
import AdminLiveEventRoulettePanel from "./AdminLiveEventRoulettePanel";
import { openPaysterRightHalf } from "./AdminLiveCardPayPopup";
import BroadcastCalendarPicker, { type BroadcastCalendarItem } from "./BroadcastCalendarPicker";
import { useLiveOrderShipped } from "./useLiveOrderShipped";

// 현재 페이지를 새로고침 사이에 보존하기 위한 sessionStorage 키(보기 상태 전용).
const LIVE_ORDERS_PAGE_KEY = "ruru_live_orders_page";

export type LiveOrderDateFilter = "all" | "today" | "yesterday" | "7days" | "month" | "lastmonth" | "custom";
export type LiveOrderScopeFilter = "all" | "broadcast" | "shop";
export type LiveOrderStatusFilter =
  | "all"
  | "paid"
  | "unpaid"
  | "manual_match_needed"
  | "bank_paid"
  | "card_unpaid"
  | "card_paid"
  | "canceled"
  | "shipped";

export type LiveOrderFilters = {
  broadcast: string;
  scope: LiveOrderScopeFilter;
  date: LiveOrderDateFilter;
  customStartDate: string;
  customEndDate: string;
  status: LiveOrderStatusFilter;
  keyword: string;
};

type BroadcastOption = {
  value: string;
  label: string;
};

type SortMode = "latest" | "nickname_asc" | "nickname_desc";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function todayAlwaysOrderLabel() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${mm}${dd}(${weekdays[now.getDay()]}) 공구·상시주문`;
}

function buildItemText(item: LiveOrder["items"][number]) {
  return normalizeText(`${item.productName} ${item.optionText}`);
}

function getTotalQty(order: LiveOrder) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function compactOrderSummary(order: LiveOrder) {
  const items = order.items || [];

  if (!items.length) return order.orderSummary || "-";

  const itemTexts = items.map(buildItemText).filter(Boolean);

  if (itemTexts.length <= 1) {
    return itemTexts[0] || order.orderSummary || "-";
  }

  const maxChars = 70;
  const visible: string[] = [];
  let usedLength = 0;

  itemTexts.forEach((itemText) => {
    const nextLength = usedLength + itemText.length + (visible.length > 0 ? 3 : 0);

    if (nextLength <= maxChars) {
      visible.push(itemText);
      usedLength = nextLength;
    }
  });

  if (visible.length === 0) {
    return `${itemTexts[0]} 외 ${itemTexts.length - 1}개`;
  }

  const hiddenCount = itemTexts.length - visible.length;
  const joined = visible.join("  |  ");

  return hiddenCount > 0 ? `${joined} 외 ${hiddenCount}개` : joined;
}

function getVisibleOrderSummaryParts(order: LiveOrder) {
  const items = order.items || [];

  if (!items.length) {
    return {
      parts: [order.orderSummary || "-"],
      hiddenCount: 0,
    };
  }

  const itemTexts = items.map(buildItemText).filter(Boolean);

  if (itemTexts.length <= 1) {
    return {
      parts: [itemTexts[0] || order.orderSummary || "-"],
      hiddenCount: 0,
    };
  }

  const maxChars = 70;
  const visible: string[] = [];
  let usedLength = 0;

  itemTexts.forEach((itemText) => {
    const nextLength = usedLength + itemText.length + (visible.length > 0 ? 3 : 0);

    if (nextLength <= maxChars) {
      visible.push(itemText);
      usedLength = nextLength;
    }
  });

  if (visible.length === 0) {
    return {
      parts: [itemTexts[0]],
      hiddenCount: itemTexts.length - 1,
    };
  }

  return {
    parts: visible,
    hiddenCount: itemTexts.length - visible.length,
  };
}

function renderOrderSummary(order: LiveOrder) {
  const { parts, hiddenCount } = getVisibleOrderSummaryParts(order);
  // [UI 2026-07-06] 여러 상품을 한 칸에 다 구겨넣으면 각각 "룰..."로 뭉개져 아무것도 못 읽음
  // → 첫 상품은 온전히 + "외 N개"로 표시. 전체 목록은 hover(title)와 주문상세에서 확인.
  const firstPart = parts[0] || "-";
  const restCount = hiddenCount + Math.max(0, parts.length - 1);
  const fullText = [...parts].join(", ") + (hiddenCount > 0 ? ` 외 ${hiddenCount}개` : "");

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden whitespace-nowrap" title={fullText}>
      <span className="truncate">{firstPart}</span>
      {restCount > 0 && (
        <span className="shrink-0 font-black text-ink-soft">외 {restCount}개</span>
      )}
    </span>
  );
}

function statusBadge(order: LiveOrder) {
  // 시안 ① 팔레트(딥로즈 테마): 입금확인=green / 매칭필요=amber / 대기·미결제=red / 취소=muted / 카드완료=blue
  const base = { borderRadius: "8px", padding: "3px 9px", fontSize: "11px", fontWeight: 800, display: "inline-block" } as const;
  const green = { background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" };
  const amber = { background: "var(--color-warn-bg)", color: "var(--color-warn-tx)" };
  const red = { background: "var(--color-danger-bg)", color: "var(--color-danger-tx)" };
  const blue = { background: "var(--color-info-bg)", color: "var(--color-info-tx)" };
  const muted = { background: "var(--color-surface-3)", color: "var(--color-ink-soft)" };

  if (order.paymentStatus === "canceled") {
    return <span style={{ ...base, ...muted }}>주문서취소</span>;
  }
  if (order.paymentStatus === "manual_match_needed") {
    return <span style={{ ...base, ...amber }}>매칭필요</span>;
  }
  if (order.paymentStatus === "card_unpaid") {
    return <span style={{ ...base, ...red }}>카드미결제</span>;
  }
  if (order.paymentStatus === "unpaid") {
    return <span style={{ ...base, ...red }}>입금대기</span>;
  }
  if (order.paymentStatus === "card_paid") {
    return <span style={{ ...base, ...blue }}>카드결제완료</span>;
  }
  if (order.paymentStatus === "auto_paid") {
    return <span style={{ ...base, ...green }}>자동입금확인</span>;
  }
  if (order.paymentStatus === "manual_paid") {
    return <span style={{ ...base, ...green }}>수동입금확인</span>;
  }
  return <span style={{ ...base, ...green }}>입금확인</span>;
}

function returnBadge(order: LiveOrder) {
  // 반품/교환 기록 배지 (기록 전용 표시 — 정산/입금/상태 판정 무관)
  const s = String(order.returnStatus || "").trim();
  if (!s) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-warn-tx bg-warn-bg px-2 py-0.5 text-[10px] font-black text-warn-tx" title={order.returnReason || undefined}>
      ↩ {s}
    </span>
  );
}

function testOrderBadge(order: LiveOrder) {
  // 테스트 주문 배지는 화면에서 숨김(칸 차지 방지). isTestOrder 판정/필터/정산제외 로직은 그대로 유지됨.
  return null;
  if (!order.isTestOrder) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-danger-tx bg-danger-bg px-2 py-1 text-[11px] font-black text-danger-tx"
      title={[
        order.testOrderReason || "운영자 테스트 계정 주문",
        order.operatorTestPhone ? `전화번호 ${order.operatorTestPhone}` : "",
        order.excludeFromSettlement ? "정산제외 예정" : "",
        order.excludeFromPaymentMatch ? "입금확인 제외 예정" : "",
        order.excludeFromShipping ? "송장제외 예정" : "",
        order.excludeFromPicking ? "피킹제외 예정" : "",
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      테스트 주문
    </span>
  );
}

function inventoryStatusBadge(order: LiveOrder) {
  const items = order.items || [];
  const restoredItem = items.find((item) => {
    const status = normalizeText(item.inventoryRestoreStatus).toLowerCase();
    return status === "restored_total" || status === "restored_option" || Boolean(item.inventoryRestoredAt);
  });

  if (restoredItem) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-700"
        title={restoredItem.inventoryRestoreMemo || restoredItem.inventoryRestoreStatus || "주문취소 재고복구 완료"}
      >
        재고복구완료
      </span>
    );
  }

  const deductedItem = items.find((item) => {
    const status = normalizeText(item.inventoryDeductionStatus).toLowerCase();
    return status === "deducted_total" || status === "deducted_option" || Boolean(item.inventoryDeductedAt);
  });

  if (deductedItem) {
    // [UI 2026-07-06] 정상(차감완료)은 무표시 — 전 행에 초록 배지가 반복되면 정보가 아니라 소음.
    // 예외(재고차감제외·복구됨 등)만 아래에서 배지로 표시해 눈에 띄게. 판정 로직은 무변경.
    return null;
  }

  const skippedItem = items.find((item) => {
    const status = normalizeText(item.inventoryDeductionStatus).toLowerCase();
    return status.startsWith("skipped_");
  });

  if (skippedItem) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-line bg-surface-2 px-2 py-1 text-[11px] font-black text-ink-soft"
        title={skippedItem.inventoryDeductionMemo || skippedItem.inventoryDeductionStatus || "재고차감 제외"}
      >
        재고차감제외
      </span>
    );
  }

  return null;
}


// 인라인/플로팅 매칭 패널 공용 입금 타입/헬퍼 (ManualPaymentMatchDrawer와 동일 기준 — 표시·정렬용. 확정은 기존 API 호출)
export type LiveMatchDeposit = {
  id?: number | string;
  depositor_name?: string;
  amount?: number;
  deposited_time?: string;
  created_at?: string;
  match_status?: string;
  confirmed_at?: string | null;
};

export function isUnmatchedLiveDeposit(d: LiveMatchDeposit) {
  const status = String(d.match_status || "").trim();
  if (!status || status === "미확인" || status === "미매칭") return !d.confirmed_at;
  return !(Boolean(d.confirmed_at) || ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status));
}

export function liveDepositNameScore(depositName: string, nickname: string, customerName: string) {
  const norm = (s: string) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const d = norm(depositName);
  const n = norm(nickname);
  const c = norm(customerName);
  if (!d) return 0;
  if (n && d === n) return 100;
  if (c && d === c) return 95;
  if (n && (d.includes(n) || n.includes(d))) return 80;
  if (c && (d.includes(c) || c.includes(d))) return 75;
  return 0;
}

const LIVE_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// deposited_time이 "HH:MM[:SS]" 시간만이면 날짜는 created_at에서, 시간은 deposited_time에서 (드로어 getDepositTimeLabel과 동일 기준)
export function resolveLiveDepositDate(d: LiveMatchDeposit): { date: Date | null; timeText: string } {
  const raw = String(d.deposited_time || "").trim();
  const createdRaw = String(d.created_at || "").trim();
  let timeText = "";
  let dateSource = raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    timeText = raw.length === 4 ? `0${raw}` : raw;
    dateSource = createdRaw;
  } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    timeText = raw.slice(0, 5);
    dateSource = createdRaw;
  }
  const dt = new Date((dateSource || createdRaw || raw).replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return { date: null, timeText };
  if (!timeText) timeText = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  return { date: dt, timeText };
}

// 날짜 형식: 2026.06.05(금) 20:54
export function liveDepositDateLabel(d: LiveMatchDeposit) {
  const { date, timeText } = resolveLiveDepositDate(d);
  if (!date) return String(d.deposited_time || d.created_at || "-").trim() || "-";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}(${LIVE_WEEKDAYS[date.getDay()]}) ${timeText || "-"}`;
}

// 오늘(로컬) 입금 여부
export function isLiveDepositToday(d: LiveMatchDeposit) {
  const { date } = resolveLiveDepositDate(d);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

// 주문의 매칭 키(그룹/행ID/금액) — 인라인/플로팅 공용
export function deriveLiveOrderMatchKeys(order: LiveOrder) {
  const o = order as any;
  const orderIds = (o.orderIds || o.order_ids || (Array.isArray(order.items) ? order.items.map((i: any) => Number(i.id)) : []))
    .map((v: any) => Number(v))
    .filter((v: number) => Number.isFinite(v) && v > 0);
  const orderGroupId = o.groupId || o.orderGroupId || o.order_group_id || order.id || "";
  const expectedAmount = Number(order.totalAmount || 0) || Number(order.finalAmount || 0) || 0;
  return { orderIds, orderGroupId, expectedAmount };
}

type Props = {
  orders: LiveOrder[];
  allOrderCount: number;
  selectedOrderId: string;
  onSelectOrder: (order: LiveOrder) => void;
  onOpenManualMatch?: (order: LiveOrder) => void;
  onOpenCardPay?: (order: LiveOrder) => void;
  onRefresh?: () => void | Promise<void>;
  loading?: boolean;
  filters: LiveOrderFilters;
  onFiltersChange: (filters: LiveOrderFilters) => void;
  broadcastOptions: BroadcastOption[];
  broadcastCalendar?: BroadcastCalendarItem[];
  broadcastStartedAt?: string | null;
  deposits?: readonly any[];
  onMatched?: () => void | Promise<void>;
  onSelectForMatch?: (order: LiveOrder) => void;
};




export default function LiveOrderTable({
  orders,
  allOrderCount,
  selectedOrderId,
  onSelectOrder,
  onOpenManualMatch,
  onOpenCardPay,
  onRefresh,
  loading = false,
  filters,
  onFiltersChange,
  broadcastOptions,
  broadcastCalendar = [],
  broadcastStartedAt,
  deposits,
  onMatched,
  onSelectForMatch,
}: Props) {
  // 현재 페이지를 새로고침(F5) 사이에 보존(보기 상태 전용). 1페이지면 저장 삭제 → 초기화 시 자연 정리.
  const [page, setPage] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(window.sessionStorage.getItem(LIVE_ORDERS_PAGE_KEY));
    return Number.isFinite(v) && v >= 1 ? v : 1;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (page <= 1) window.sessionStorage.removeItem(LIVE_ORDERS_PAGE_KEY);
    else window.sessionStorage.setItem(LIVE_ORDERS_PAGE_KEY, String(page));
  }, [page]);
  const [pendingKeyword, setPendingKeyword] = useState(filters.keyword);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [pageSize, setPageSize] = useState(10);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 640);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  const [matchSaving, setMatchSaving] = useState(false);
  const [matchSearch, setMatchSearch] = useState("");
  const [dropHoverOrderId, setDropHoverOrderId] = useState("");

  // 플로팅 패널에서 드래그한 입금을 주문 행에 드롭 → 기존 confirmWithDeposit 재사용
  const handleDepositDropOnOrder = (order: LiveOrder, depositId: string) => {
    setDropHoverOrderId("");
    const dep = (deposits || []).find((d) => String(d.id) === String(depositId));
    if (dep) void confirmWithDeposit(order, [dep], [String(dep.id)]);
  };
  const isMatchableOrder = (order: LiveOrder) =>
    ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus);

  // 주문의 매칭 키(그룹/행ID/금액) 도출
  const deriveOrderMatchKeys = (order: LiveOrder) => {
    const o = order as any;
    const orderIds = (o.orderIds || o.order_ids || (Array.isArray(order.items) ? order.items.map((i: any) => Number(i.id)) : []))
      .map((v: any) => Number(v))
      .filter((v: number) => Number.isFinite(v) && v > 0);
    const orderGroupId = o.groupId || o.orderGroupId || o.order_group_id || order.id || "";
    const expectedAmount = Number(order.totalAmount || 0) || Number(order.finalAmount || 0) || 0;
    return { orderIds, orderGroupId, expectedAmount };
  };

  // 선택 입금으로 입금확인 (기존 /api/admin-v2/manual-payment-match 재사용)
  const confirmWithDeposit = async (order: LiveOrder, deposits: LiveMatchDeposit[], selectedIds: string[]) => {
    if (matchSaving) return;
    const depositIds = deposits.map(d => Number(d.id)).filter(n => Number.isFinite(n));
    if (depositIds.length === 0) return;
    const { orderIds, orderGroupId } = deriveOrderMatchKeys(order);
    setMatchSaving(true);
    try {
      const res = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, depositIds, clientSelectedTotalAmount: deposits.reduce((s,d) => s + Number(d.amount||0), 0) }),
      });
      const r = await res.json().catch(() => null);
      if (!res.ok || !r?.ok) {
        showAdminToast("입금확인 실패\n\n" + (r?.message || ""), "error");
        return;
      }
      showAdminToast("입금확인 처리됐습니다.", "success");
      setSelectedDepositIds([]);
      await onMatched?.();
    } finally {
      setMatchSaving(false);
    }
  };

  // 금액 무시하고 수동확인 (기존 /api/admin-v2/manual-payment-confirm-without-deposit 재사용)
  const confirmWithoutDeposit = async (order: LiveOrder) => {
    if (matchSaving) return;
    const { orderIds, orderGroupId, expectedAmount } = deriveOrderMatchKeys(order);
    setMatchSaving(true);
    try {
      const res = await fetch("/api/admin-v2/manual-payment-confirm-without-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, expectedAmount }),
      });
      const r = await res.json().catch(() => null);
      if (!res.ok || !r?.ok) {
        showAdminToast("수동확인 실패\n\n" + (r?.message || ""), "error");
        return;
      }
      showAdminToast("수동 입금확인 처리됐습니다.", "success");
      setSelectedDepositIds([]);
      await onMatched?.();
    } finally {
      setMatchSaving(false);
    }
  };
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<"" | "rozen" | "picking">("");
  const [exportConfirm, setExportConfirm] = useState<"" | "rozen" | "picking">("");
  const [pickingOpen, setPickingOpen] = useState(false);
  const [cancelViewFilter, setCancelViewFilter] = useState<LiveOrderCancelViewFilterValue>("all");

  // 필터/정렬 변경 시 1페이지로. 단, 첫 마운트(새로고침으로 복원된 페이지)에는 리셋하지 않음.
  const cancelViewMountedRef = useRef(false);
  useEffect(() => {
    if (!cancelViewMountedRef.current) { cancelViewMountedRef.current = true; return; }
    setPage(1);
  }, [cancelViewFilter]);

  const filterChangeMountedRef = useRef(false);
  useEffect(() => {
    if (!filterChangeMountedRef.current) { filterChangeMountedRef.current = true; return; }
    setPage(1);
  }, [filters.broadcast, filters.scope, filters.date, filters.customStartDate, filters.customEndDate, filters.status, filters.keyword, sortMode, pageSize]);

  useEffect(() => {
    setPendingKeyword(filters.keyword);
  }, [filters.keyword]);

  const baseOrders = useMemo(() => {
    if (!broadcastStartedAt) return orders;
    const startMs = new Date(broadcastStartedAt).getTime();
    if (Number.isNaN(startMs)) return orders;
    return orders.filter((order) => {
      const created = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
      return !Number.isNaN(created) && created >= startMs;
    });
  }, [orders, broadcastStartedAt]);

  const counts = useMemo(() => {
    const paid = baseOrders.filter((order) =>
      ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus)
    ).length;
    const bankPaid = baseOrders.filter((order) =>
      ["paid", "auto_paid", "manual_paid"].includes(order.paymentStatus) && order.paymentMethod === "무통장입금"
    ).length;
    const manual = baseOrders.filter((order) => order.paymentStatus === "manual_match_needed").length;
    const canceled = baseOrders.filter((order) => order.paymentStatus === "canceled").length;
    const unpaid = baseOrders.filter((order) =>
      ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus)
    ).length;
    // 표시용 분해 카운트(입금대기 칩 보조설명) — 기존 unpaid 합산식/manual 정의는 그대로.
    const pureUnpaid = baseOrders.filter((order) => order.paymentStatus === "unpaid").length;
    const cardUnpaid = baseOrders.filter((order) => order.paymentStatus === "card_unpaid").length;
    const shipped = baseOrders.filter((order) => {
      const ship = String((order as { shippingStatus?: unknown }).shippingStatus || "").trim();
      return /출고|발송|배송/.test(ship) && !/대기/.test(ship);
    }).length;

    return {
      total: baseOrders.length,
      paid,
      unpaid,
      manual,
      bankPaid,
      canceled,
      shipped,
      pureUnpaid,
      cardUnpaid,
    };
  }, [baseOrders]);

  const sortedOrders = useMemo(() => {
    const list = [...baseOrders];

    if (sortMode === "nickname_asc") {
      return list.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko-KR"));
    }

    if (sortMode === "nickname_desc") {
      return list.sort((a, b) => b.nickname.localeCompare(a.nickname, "ko-KR"));
    }

    return list.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  }, [baseOrders, sortMode]);

  const cancelViewFilteredOrders = useMemo(() => {
    if (cancelViewFilter === "active") {
      return sortedOrders.filter((order) => order.paymentStatus !== "canceled");
    }

    if (cancelViewFilter === "canceled") {
      return sortedOrders.filter((order) => order.paymentStatus === "canceled");
    }

    return sortedOrders;
  }, [sortedOrders, cancelViewFilter]);

  const cancelFilteredActiveCount = sortedOrders.filter((order) => order.paymentStatus !== "canceled").length;
  const cancelFilteredCanceledCount = sortedOrders.length - cancelFilteredActiveCount;

  const totalPages = Math.max(1, Math.ceil(cancelViewFilteredOrders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleOrders = cancelViewFilteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportableOrders = useMemo(
    () => cancelViewFilteredOrders.filter((order) => order.paymentStatus !== "canceled"),
    [cancelViewFilteredOrders]
  );
  const canceledExportExcludedCount = cancelViewFilteredOrders.length - exportableOrders.length;
  const paidOnlyExportOrders = exportableOrders.filter((order) =>
    ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus ?? "")
  );

  const allVisibleSelected = visibleOrders.length > 0 && visibleOrders.every((o) => selectedOrderIds.has(String(o.id)));
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds((prev) => { const n = new Set(prev); visibleOrders.forEach((o) => n.delete(String(o.id))); return n; });
    } else {
      setSelectedOrderIds((prev) => { const n = new Set(prev); visibleOrders.forEach((o) => n.add(String(o.id))); return n; });
    }
  };
  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectedExportOrders = orders.filter((o) => selectedOrderIds.has(String(o.id)) && o.paymentStatus !== "canceled");

  const updateFilter = <K extends keyof LiveOrderFilters>(key: K, value: LiveOrderFilters[K]) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const applyKeyword = () => {
    updateFilter("keyword", pendingKeyword.trim());
  };

  const resetFilters = () => {
    setPendingKeyword("");
    setSortMode("latest");
    setPageSize(10);
    onFiltersChange({
      broadcast: "all",
      scope: "all",
      date: "all",
      customStartDate: "",
      customEndDate: "",
      status: "all",
      keyword: "",
    });
  };

  const toggleNicknameSort = () => {
    setSortMode((current) => {
      if (current === "latest") return "nickname_asc";
      if (current === "nickname_asc") return "nickname_desc";
      return "latest";
    });
  };

  const sortLabel =
    sortMode === "nickname_asc" ? "닉네임 ↑" : sortMode === "nickname_desc" ? "닉네임 ↓" : "최신순";

  const refreshOrders = async () => {
    if (!onRefresh) return;

    setRefreshing(true);

    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // 출고완료 처리 / 해제 (선택 주문 일괄) — 주문상태만 변경, 돈/입금/포인트/정산 무변경
  const { savingAction: shippedSaving, markShipped, unmarkShipped } = useLiveOrderShipped({
    onAfterStatusChange: refreshOrders,
  });
  const handleMarkShipped = async () => {
    const ok = await markShipped(selectedExportOrders);
    if (ok) setSelectedOrderIds(new Set());
  };
  const handleUnmarkShipped = async () => {
    const ok = await unmarkShipped(selectedExportOrders);
    if (ok) setSelectedOrderIds(new Set());
  };


  const currentFilterLabel = useMemo(() => {
    const broadcastLabel =
      filters.broadcast === "all"
        ? "방송: 전체보기"
        : filters.broadcast === "none"
          ? todayAlwaysOrderLabel()
          : broadcastOptions.find((option) => option.value === filters.broadcast)?.label || "선택 방송";

    const dateLabelMap: Record<LiveOrderDateFilter, string> = {
      all: "날짜: 전체보기",
      today: "오늘",
      yesterday: "어제",
      "7days": "최근 7일",
      month: "이번 달",
      lastmonth: "지난 달",
      custom:
        filters.customStartDate || filters.customEndDate
          ? `기간 선택 ${filters.customStartDate || "시작일"}~${filters.customEndDate || "종료일"}`
          : "기간 선택",
    };

    const statusLabelMap: Record<LiveOrderStatusFilter, string> = {
      all: "상태: 전체보기",
      paid: "결제완료",
      unpaid: "입금대기",
      manual_match_needed: "매칭필요",
      bank_paid: "입금확인",
      card_unpaid: "카드미결제",
      card_paid: "카드결제완료",
      canceled: "주문서취소",
      shipped: "출고완료",
    };

    return [
      broadcastLabel,
      dateLabelMap[filters.date],
      statusLabelMap[filters.status],
      filters.keyword ? `검색: ${filters.keyword}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [broadcastOptions, filters]);

  const runExport = async (kind: "rozen" | "picking", orders: LiveOrder[], filterLabel: string) => {
    if (orders.length === 0) {
      showAdminToast("내보낼 주문이 없습니다. 필터를 확인해주세요.", "warning");
      return;
    }
    setExporting(kind);
    try {
      if (kind === "rozen") {
        await exportLiveOrdersForRosen(orders, { filterLabel });
      } else {
        await exportLiveOrdersForPicking(orders, { filterLabel });
      }
    } finally {
      setExporting("");
    }
  };

  return (
    <>
    {pickingOpen ? (
      <LiveOrderPickingModal orders={exportableOrders} filterLabel={currentFilterLabel} onClose={() => setPickingOpen(false)} />
    ) : null}
    {exportConfirm !== "" ? (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExportConfirm("")}>
        <div style={{ background: "var(--color-surface)", borderRadius: "16px", padding: "26px 30px", minWidth: "340px", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: "16px", fontWeight: 900, color: "var(--color-ink)", marginBottom: "14px" }}>
            {exportConfirm === "rozen" ? "🚚 송장 출력" : "🛍 물건챙기기"}
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-ink-soft)", marginBottom: "20px", lineHeight: 1.8 }}>
            <div>현재 필터 기준: <b>{exportableOrders.length.toLocaleString("ko-KR")}건</b></div>
            <div style={{ fontSize: "15px" }}>✅ 돈 받은 것(결제완료): <b style={{ color: "var(--color-ok-tx)", fontSize: "16px" }}>{paidOnlyExportOrders.length.toLocaleString("ko-KR")}건</b></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* 기본 추천: 결제완료만 — 크게/녹색/맨 위 */}
            <button type="button"
              disabled={paidOnlyExportOrders.length === 0}
              onClick={() => { const kind = exportConfirm as "rozen" | "picking"; setExportConfirm(""); void runExport(kind, paidOnlyExportOrders, "결제완료"); }}
              style={{ padding: "13px 16px", borderRadius: "10px", border: "none", background: "var(--color-ok-tx)", color: "#fff", fontWeight: 800, cursor: paidOnlyExportOrders.length === 0 ? "default" : "pointer", fontSize: "15px", opacity: paidOnlyExportOrders.length === 0 ? 0.4 : 1, textAlign: "left" }}>
              ✅ 돈 받은 것만 출력 ({paidOnlyExportOrders.length.toLocaleString("ko-KR")}건)
              <div style={{ fontSize: "11px", fontWeight: 600, opacity: 0.85, marginTop: "2px" }}>입금확인·카드결제 완료분만</div>
            </button>

            {selectedExportOrders.length > 0 ? (
              <button type="button"
                onClick={() => { const kind = exportConfirm as "rozen" | "picking"; setExportConfirm(""); void runExport(kind, selectedExportOrders, `선택 ${selectedExportOrders.length}건`); }}
                style={{ padding: "10px 16px", borderRadius: "10px", border: "none", background: "var(--color-rose-deep)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: "14px", textAlign: "left" }}>
                ✓ 선택한 {selectedExportOrders.length.toLocaleString("ko-KR")}건 출력
              </button>
            ) : null}

            {/* 미결제 포함 전체 — 작게/경고색/아래 */}
            <button type="button"
              onClick={() => { const kind = exportConfirm as "rozen" | "picking"; setExportConfirm(""); void runExport(kind, exportableOrders, currentFilterLabel); }}
              style={{ padding: "9px 14px", borderRadius: "9px", border: "1px solid var(--color-warn-tx)", background: "var(--color-warn-bg)", color: "var(--color-warn-tx)", fontWeight: 700, cursor: "pointer", fontSize: "12px", textAlign: "left" }}>
              ⚠️ 미결제 포함 전체 ({exportableOrders.length.toLocaleString("ko-KR")}건)
              <div style={{ fontSize: "10px", fontWeight: 600, opacity: 0.9, marginTop: "2px" }}>돈 안 들어온 주문도 포함됩니다</div>
            </button>

            <button type="button" onClick={() => setExportConfirm("")}
              style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              취소
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-black text-ink">실시간 주문서</h2>

        {[
          ["전체", counts.total, "all", "rose"],
          ["결제완료", counts.paid, "paid", "green"],
          ["입금대기", counts.unpaid, "unpaid", "red"],
          ["매칭필요", counts.manual, "manual_match_needed", "amber"],
          ["입금확인", counts.bankPaid, "bank_paid", "green"],
          ["주문서취소", counts.canceled, "canceled", "muted"],
          ["출고완료", counts.shipped, "shipped", "blue"],
        ].map(([label, count, status, tone]) => {
          const active = filters.status === status;
          const toneStyle: Record<string, { bg: string; text: string; inactiveBg: string; inactiveText: string }> = {
            rose:  { bg: "var(--color-rose-deep)", text: "#fff", inactiveBg: "var(--color-rose-soft)", inactiveText: "var(--color-rose-deep)" },
            green: { bg: "var(--color-ok-tx)", text: "#fff", inactiveBg: "var(--color-ok-bg)", inactiveText: "var(--color-ok-tx)" },
            red:   { bg: "var(--color-danger-tx)", text: "#fff", inactiveBg: "var(--color-danger-bg)", inactiveText: "var(--color-danger-tx)" },
            amber: { bg: "var(--color-warn-tx)", text: "#fff", inactiveBg: "var(--color-warn-bg)", inactiveText: "var(--color-warn-tx)" },
            blue:  { bg: "var(--color-info-tx)", text: "#fff", inactiveBg: "var(--color-info-bg)", inactiveText: "var(--color-info-tx)" },
            muted: { bg: "#777",    text: "#fff", inactiveBg: "var(--color-surface-3)", inactiveText: "#777" },
          };
          const t = toneStyle[tone as string] ?? toneStyle.muted;
          // 보조텍스트(표시용) — 기존 counts 값 조합만 사용. 결제완료=무통장/카드 분해, 입금대기=매칭필요 포함.
          const sub =
            status === "paid"
              ? `무통장 ${counts.bankPaid}·카드 ${Math.max(0, counts.paid - counts.bankPaid)}`
              : status === "unpaid"
                ? [
                    counts.pureUnpaid ? `미입금 ${counts.pureUnpaid}` : "",
                    counts.manual ? `매칭필요 ${counts.manual}` : "",
                    counts.cardUnpaid ? `카드미결제 ${counts.cardUnpaid}` : "",
                  ].filter(Boolean).join("·")
                : "";

          return (
            <button
              key={label as string}
              type="button"
              onClick={() => updateFilter("status", status as LiveOrderStatusFilter)}
              style={{
                borderRadius: "999px",
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: active ? t.bg : t.inactiveBg,
                color: active ? t.text : t.inactiveText,
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.13)" : "none",
              }}
            >
              {label} <span style={{ opacity: 0.85 }}>{count}</span>
              {sub ? <span style={{ marginLeft: "5px", fontSize: "10px", fontWeight: 700, opacity: 0.6 }}>{sub}</span> : null}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {selectedOrderIds.size > 0 && (
            <span className="text-[12px] font-black text-[var(--color-rose-deep)]">{selectedOrderIds.size}건 선택됨</span>
          )}
          {selectedOrderIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={handleMarkShipped}
                disabled={shippedSaving !== ""}
                className="rounded-xl border border-info-tx bg-info-bg px-3 py-2 text-xs font-black text-[var(--color-info-tx)] hover:bg-info-bg disabled:cursor-not-allowed disabled:opacity-40"
                title="선택한 결제완료 주문을 출고완료로 변경합니다 (출고시간 기록, 고객 주문조회 반영)"
              >
                {shippedSaving === "ship" ? "처리중..." : "📦 출고완료 처리"}
              </button>
              <button
                type="button"
                onClick={handleUnmarkShipped}
                disabled={shippedSaving !== ""}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                title="잘못 누른 출고완료를 해제합니다 (출고대기로 되돌림)"
              >
                {shippedSaving === "unship" ? "해제중..." : "↩ 출고완료 해제"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExportConfirm("rozen")}
            disabled={exporting !== "" || exportableOrders.length === 0}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            title="현재 필터 조건 그대로 로젠 송장 엑셀을 내보냅니다"
          >
            {exporting === "rozen" ? "내보내는중..." : "🚚 송장 출력"}
          </button>

          <button
            type="button"
            onClick={() => setPickingOpen(true)}
            disabled={exportableOrders.length === 0}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            title="물건챙기기 체크리스트 팝업을 엽니다"
          >
            🛍 물건챙기기
          </button>

            

          <button
            type="button"
            onClick={toggleNicknameSort}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
          >
            {sortLabel}
          </button>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft outline-none hover:bg-surface-2"
          >
            <option value={10}>페이지당 10건</option>
            <option value={20}>페이지당 20건</option>
            <option value={30}>페이지당 30건</option>
            <option value={50}>페이지당 50건</option>
            <option value={100}>페이지당 100건</option>
          </select>

          <button
            type="button"
            onClick={refreshOrders}
            disabled={!onRefresh || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-soft hover:bg-surface-2 active:bg-surface-2 active:scale-[0.94] transition-all duration-75 disabled:opacity-40"
            title="주문 새로고침"
          >
            {refreshing ? "…" : "↻"}
          </button>
        </div>
      </div>


      <div className="mb-3 flex w-full flex-wrap items-center gap-2">
        {/* [1] 기간 */}
        <select className="h-11 w-full flex-none rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg sm:w-[120px]"
          value={filters.date}
          onChange={(event) => updateFilter("date", event.target.value as LiveOrderDateFilter)}
        >
          <option value="all">기간: 전체</option>
          <option value="today">오늘</option>
          <option value="yesterday">어제</option>
          <option value="7days">최근 7일</option>
          <option value="month">이번 달</option>
          <option value="lastmonth">지난 달</option>
          <option value="custom">기간 선택</option>
        </select>

        {filters.date === "custom" && (
          <>
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg"
              type="date"
              value={filters.customStartDate}
              onChange={(event) => updateFilter("customStartDate", event.target.value)}
              aria-label="시작일"
            />
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg"
              type="date"
              value={filters.customEndDate}
              onChange={(event) => updateFilter("customEndDate", event.target.value)}
              aria-label="종료일"
            />
          </>
        )}

        {/* [2] 범위 */}
        <select className="h-11 w-full flex-none rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg sm:w-[130px]"
          value={filters.scope}
          onChange={(event) => {
            const next = event.target.value as LiveOrderScopeFilter;
            // 범위가 '방송'이 아니면 선택해둔 특정 방송을 전체로 되돌린다(빈 화면 방지).
            onFiltersChange({
              ...filters,
              scope: next,
              broadcast: next === "broadcast" ? filters.broadcast : "all",
            });
          }}
        >
          <option value="all">범위: 전체</option>
          <option value="broadcast">방송 주문</option>
          <option value="shop">쇼핑몰(상시) 주문</option>
        </select>

        {filters.scope === "broadcast" && (
          <BroadcastCalendarPicker
            items={broadcastCalendar}
            value={filters.broadcast}
            onPick={(broadcastId) => onFiltersChange({ ...filters, scope: "broadcast", broadcast: broadcastId })}
          />
        )}

        {/* [3] 상태 */}
        <select className="h-11 w-full flex-none rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg sm:w-[128px]"
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value as LiveOrderStatusFilter)}
        >
          <option value="all">상태: 전체보기</option>
          <option value="paid">결제완료</option>
          <option value="unpaid">입금대기</option>
          <option value="manual_match_needed">매칭필요</option>
          <option value="bank_paid">입금확인</option>
          <option value="card_unpaid">카드미결제</option>
          <option value="card_paid">카드결제완료</option>
          <option value="canceled">주문서취소</option>
          <option value="shipped">출고완료</option>
        </select>

        <div className="flex w-full flex-nowrap items-center gap-2 sm:w-auto sm:flex-1">
          <input className="h-11 min-w-[120px] flex-1 rounded-xl border border-line bg-surface px-3 text-[12px] font-black text-ink outline-none transition focus:border-info-tx focus:ring-4 focus:ring-info-bg"
            value={pendingKeyword}
            onChange={(event) => setPendingKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyKeyword();
            }}
            placeholder="🔍 닉네임·상품·금액 검색"
          />

          <button className="h-11 flex-none rounded-xl bg-rose-deep px-3 text-[12px] font-black text-white shadow-sm hover:opacity-90 active:opacity-80 active:scale-[0.95] transition-all duration-75 w-[64px] sm:w-[84px]"
            type="button"
            onClick={applyKeyword}
          >
            검색
          </button>

          <button className="h-11 flex-none rounded-xl border border-line bg-surface px-3 text-[12px] font-black text-ink-soft shadow-sm hover:bg-surface-2 active:bg-surface-3 active:scale-[0.95] transition-all duration-75 w-[64px] sm:w-[84px]"
            type="button"
            onClick={resetFilters}
          >
            초기화
          </button>
        </div>
      </div>

      <div className="h-[1180px] overflow-auto rounded-xl border border-line">
            {/* 헤더 행 (모바일 카드형에선 숨김) */}
            {!isMobile && (
            <div className="grid min-w-[1000px] grid-cols-[36px_108px_130px_90px_minmax(0,1fr)_48px_96px_72px_96px_116px_68px] gap-0 border-b border-rose-line bg-rose-soft/40 text-[12px] font-black text-ink-soft">
              <span className="flex items-center justify-center py-2.5">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 cursor-pointer accent-[var(--color-rose-deep)]" />
              </span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">주문일</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">닉네임</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">이름</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">주문내용</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">수량</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">상품금액</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">택배비</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">총금액</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">입금</span>
              <span className="whitespace-nowrap px-3 py-2.5 text-center">출고</span>
            </div>
            )}

            {/* 주문 행 목록 */}
            <div className="divide-y divide-line">
              {loading ? (
                <div className="px-3 py-10 text-center text-sm font-black text-ink-mute">실제 주문 데이터를 불러오는 중입니다.</div>
              ) : visibleOrders.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm font-black text-ink-mute">표시할 주문이 없습니다.</div>
              ) : (
                visibleOrders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  if (isMobile) {
                    return (
                      <div key={order.id} onClick={() => onSelectOrder(order)}
                        style={{ background: "#fff", border: "1px solid #eadfe3", borderLeft: order.paymentStatus === "manual_match_needed" ? "3px solid var(--color-rose-deep)" : "1px solid #eadfe3", borderRadius: "12px", padding: "11px 12px", marginBottom: "9px", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <input type="checkbox" checked={selectedOrderIds.has(String(order.id))} onChange={() => toggleSelectOrder(String(order.id))} onClick={(e) => e.stopPropagation()} style={{ width: "16px", height: "16px", accentColor: "var(--color-rose-deep)" }} />
                          <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{order.nickname}</span>
                          <span style={{ fontSize: "11px", color: "#888" }}>{order.name || ""}</span>
                          <span style={{ marginLeft: "auto", fontSize: "10px", color: "#aaa" }}>
                            {(() => {
                              const src = order.createdAt || order.submittedAt;
                              if (!src) return "-";
                              try {
                                const d = new Date(src);
                                if (isNaN(d.getTime())) return src;
                                const yy = d.getFullYear();
                                const mm = String(d.getMonth() + 1).padStart(2, "0");
                                const dd = String(d.getDate()).padStart(2, "0");
                                const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
                                const hh = String(d.getHours()).padStart(2, "0");
                                const mi = String(d.getMinutes()).padStart(2, "0");
                                return `${yy}.${mm}.${dd} (${wd}) ${hh}:${mi}`;
                              } catch { return src; }
                            })()}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#444", marginBottom: "7px", lineHeight: 1.4 }}>{renderOrderSummary(order)} · {getTotalQty(order)}개</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                            {statusBadge(order)}
                            {(order as any).shippingStatus ? (
                              <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none ${String((order as any).shippingStatus) === "출고완료" ? "bg-info-bg text-[var(--color-info-tx)]" : "bg-surface-2 text-ink-soft"}`}>{(order as any).shippingStatus}</span>
                            ) : null}
                            {order.paymentStatus === "manual_match_needed" ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); onSelectForMatch?.(order); }} className="rounded-lg border border-orange-300 bg-warn-bg px-2 py-0.5 text-[10px] font-black text-warn-tx hover:bg-orange-100">🔗 입금매칭</button>
                            ) : null}
                            {order.paymentStatus === "card_unpaid" && onOpenCardPay ? (
                              <button type="button" onClick={() => { openPaysterRightHalf(); onOpenCardPay(order); }} className="rounded-lg border border-info-tx bg-info-bg px-2 py-0.5 text-[10px] font-black text-info-tx hover:bg-info-bg">💳 카드결제</button>
                            ) : null}
                          </div>
                          <span style={{ fontSize: "15px", fontWeight: 800, color: "#C0392B" }}>{money(Number(order.totalAmount || 0) || Number(order.finalAmount || 0))}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Fragment key={order.id}>
                    <div
                      onDragOver={isMatchableOrder(order) ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropHoverOrderId !== order.id) setDropHoverOrderId(order.id); } : undefined}
                      onDragLeave={isMatchableOrder(order) ? () => setDropHoverOrderId((cur) => (cur === order.id ? "" : cur)) : undefined}
                      onDrop={isMatchableOrder(order) ? (e) => { e.preventDefault(); handleDepositDropOnOrder(order, e.dataTransfer.getData("text/plain")); } : undefined}
                      className={`grid min-w-[1000px] grid-cols-[36px_108px_130px_90px_minmax(0,1fr)_48px_96px_72px_96px_116px_68px] gap-0 items-start text-[14px] transition ${dropHoverOrderId === order.id ? "bg-ok-bg ring-2 ring-inset ring-ok-tx" : selected ? "bg-rose-soft/70" : "hover:bg-surface-2"} ${order.paymentStatus === "manual_match_needed" ? "border-l-2 border-rose-deep" : ""}`}
                    >
                      {/* 0. 선택 체크박스 */}
                      <div className="flex items-center justify-center py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedOrderIds.has(String(order.id))} onChange={() => toggleSelectOrder(String(order.id))} className="h-4 w-4 cursor-pointer accent-[var(--color-rose-deep)]" />
                      </div>
                      {/* 1. 주문일 */}
                      <div className="px-3 py-3 text-center text-[11px] leading-tight text-ink-soft">
                        {(() => {
                          const src = order.createdAt || order.submittedAt;
                          if (!src) return <span>-</span>;
                          try {
                            const d = new Date(src);
                            if (isNaN(d.getTime())) return <span className="text-[10px]">{src}</span>;
                            const yy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, "0");
                            const dd = String(d.getDate()).padStart(2, "0");
                            const wd = ["일","월","화","수","목","금","토"][d.getDay()];
                            const hh = String(d.getHours()).padStart(2, "0");
                            const mi = String(d.getMinutes()).padStart(2, "0");
                            return <><div>{yy}.{mm}.{dd}</div><div className="text-ink-mute">({wd}) {hh}:{mi}</div></>;
                          } catch { return <span className="text-[10px]">{src}</span>; }
                        })()}
                      </div>
                      {/* 2. 닉네임 */}
                      <div className="min-w-0 px-3 py-3 text-center">
                        <div className="mb-0.5">
                          <button type="button" onClick={() => onSelectOrder(order)} className="font-black text-rose-deep underline-offset-2 hover:underline text-[13px]">
                            {order.nickname}
                          </button>
                        </div>
                        {(inventoryStatusBadge(order) || testOrderBadge(order) || returnBadge(order)) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {inventoryStatusBadge(order)}
                            {testOrderBadge(order)}
                            {returnBadge(order)}
                          </div>
                        )}
                      </div>
                      {/* 3. 이름 */}
                      <div className="min-w-0 truncate px-3 py-3 text-center text-[13px] text-ink-soft">{order.name || "-"}</div>
                      {/* 4. 주문내용 */}
                      <div className="min-w-0 truncate px-3 py-3 text-center text-[13px] font-black text-ink-soft">{renderOrderSummary(order)}</div>
                      {/* 4. 수량 */}
                      <div className="px-3 py-3 text-center">
                        <span className="inline-flex min-w-[34px] items-center justify-center rounded-lg bg-surface-2 px-1 py-0.5 text-[13px] font-black text-ink">
                          {getTotalQty(order)}
                        </span>
                      </div>
                      {/* 5. 상품금액 */}
                      <div className="px-3 py-3 text-center text-[13px] font-black text-ink">
                        <div>{money(order.productAmount)}</div>
                        {Number(order.pointUsedAmount || 0) > 0 ? (
                          <div className="text-[10px] text-ok-tx">포인트 -{money(Number(order.pointUsedAmount || 0))}</div>
                        ) : null}
                      </div>
                      {/* 6. 택배비 */}
                      <div className="px-3 py-3 text-center text-[13px] text-ink-mute">
                        {Number(order.shippingFee || 0) > 0 ? money(order.shippingFee) : "0"}
                      </div>
                      {/* 7. 총금액 */}
                      <div className="px-3 py-3 text-center text-[14px] font-black text-ink">
                        {money(Number(order.totalAmount || 0) || Number(order.finalAmount || 0))}
                        {String((order as any).paymentMethod || "").includes("카드") && Number((order as any).cardPaymentTotalAmount || 0) > 0 ? (
                          <div className="text-[10px] font-black text-purple-700">카드 {money(Number((order as any).cardPaymentTotalAmount || 0))}</div>
                        ) : null}
                      </div>
                      {/* 8. 입금 */}
                      <div className="px-3 py-3 text-center">
                        <div>{statusBadge(order)}</div>
                        {order.paidAt && <div className="mt-0.5 text-[10px] text-ink-mute">{order.paidAt}</div>}
                        {order.paymentStatus === "manual_match_needed" ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); onSelectForMatch?.(order); }} className="mt-1 rounded-lg border border-orange-300 bg-warn-bg px-2 py-0.5 text-[10px] font-black text-warn-tx hover:bg-orange-100">
                            🔗 입금매칭
                          </button>
                        ) : null}
                        {order.paymentStatus === "card_unpaid" && onOpenCardPay ? (
                          <button type="button" onClick={() => { openPaysterRightHalf(); onOpenCardPay(order); }} className="mt-1 rounded-lg border border-info-tx bg-info-bg px-2 py-0.5 text-[10px] font-black text-info-tx hover:bg-info-bg">
                            💳 카드결제
                          </button>
                        ) : null}
                      </div>
                      {/* 9. 출고 */}
                      <div className="px-1 py-3 text-center">
                        {(order as any).shippingStatus ? (
                          <span
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none ${
                              String((order as any).shippingStatus) === "출고완료"
                                ? "bg-info-bg text-[var(--color-info-tx)]"
                                : "bg-surface-2 text-ink-soft"
                            }`}
                          >
                            {(order as any).shippingStatus}
                          </span>
                        ) : (
                          <span className="text-ink-mute">-</span>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  );
                })
              )}
            </div>
      </div>

      <div className="mt-3 flex-shrink-0 flex items-center">
        <div className="text-xs font-black text-ink-soft">
          총 {orders.length}건 / 전체 {allOrderCount}건
        </div>
        <div className="mx-auto flex items-center gap-5 text-sm font-black">
          <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} className="text-ink-mute">‹</button>
          {(() => {
            let start = Math.max(1, safePage - 2);
            const end = Math.min(totalPages, start + 4);
            start = Math.max(1, end - 4);
            return Array.from({ length: end - start + 1 }, (_, i) => start + i);
          })().map((pageNumber) => {
            return (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={
                  safePage === pageNumber
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-rose-deep text-white"
                    : "text-ink-soft"
                }
              >
                {pageNumber}
              </button>
            );
          })}
          <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="text-ink-mute">›</button>
        </div>
      </div>
    </section>
    </>
  );
}
