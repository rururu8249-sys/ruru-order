"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { LiveOrder } from "./types";
import { exportLiveOrdersForPicking, exportLiveOrdersForRosen } from "./adminLiveOrderExcelExport";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import LiveOrderCancelViewFilter, { type LiveOrderCancelViewFilterValue } from "./LiveOrderCancelViewFilter";
import AdminLiveEventRoulettePanel from "./AdminLiveEventRoulettePanel";
import { openPaysterRightHalf } from "./AdminLiveCardPayPopup";

export type LiveOrderDateFilter = "all" | "today" | "yesterday" | "7days" | "month" | "custom" | "yearmonth";
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
  date: LiveOrderDateFilter;
  customStartDate: string;
  customEndDate: string;
  filterYear: string;
  filterMonth: string;
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

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden whitespace-nowrap">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex min-w-0 items-center gap-2">
          {index > 0 && <span className="text-rose-deep mx-0.5 shrink-0">,</span>}
          <span className="truncate">{part}</span>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="shrink-0 font-black text-slate-500">외 {hiddenCount}개</span>
      )}
    </span>
  );
}

function statusBadge(order: LiveOrder) {
  // 시안 ① 팔레트(딥로즈 테마): 입금확인=green / 매칭필요=amber / 대기·미결제=red / 취소=muted / 카드완료=blue
  const base = { borderRadius: "8px", padding: "3px 9px", fontSize: "11px", fontWeight: 800, display: "inline-block" } as const;
  const green = { background: "#E7F3EE", color: "#0F6E56" };
  const amber = { background: "#FBF1E0", color: "#854F0B" };
  const red = { background: "#FBEAE7", color: "#C0392B" };
  const blue = { background: "#E8F0FA", color: "#185FA5" };
  const muted = { background: "#F1EFEC", color: "#777" };

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

function testOrderBadge(order: LiveOrder) {
  // 테스트 주문 배지는 화면에서 숨김(칸 차지 방지). isTestOrder 판정/필터/정산제외 로직은 그대로 유지됨.
  return null;
  if (!order.isTestOrder) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-black text-red-700"
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
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700"
        title={deductedItem.inventoryDeductionMemo || deductedItem.inventoryDeductionStatus || "재고차감 완료"}
      >
        재고차감완료
      </span>
    );
  }

  const skippedItem = items.find((item) => {
    const status = normalizeText(item.inventoryDeductionStatus).toLowerCase();
    return status.startsWith("skipped_");
  });

  if (skippedItem) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-500"
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
function resolveLiveDepositDate(d: LiveMatchDeposit): { date: Date | null; timeText: string } {
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
  broadcastStartedAt?: string | null;
  deposits?: readonly any[];
  onMatched?: () => void | Promise<void>;
  externalMatchOpenOrderId?: string;
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
  broadcastStartedAt,
  deposits,
  onMatched,
  externalMatchOpenOrderId,
}: Props) {
  const [page, setPage] = useState(1);
  const [pendingKeyword, setPendingKeyword] = useState(filters.keyword);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [pageSize, setPageSize] = useState(10);
  const [matchOpenOrderId, setMatchOpenOrderId] = useState("");
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);
  const [matchSaving, setMatchSaving] = useState(false);
  const [matchSearch, setMatchSearch] = useState("");

  // 외부(Dashboard "입금 매칭에서 찾기")에서 특정 주문의 인라인 매칭 패널을 연다.
  // 값은 "order.id#nonce" 형태 → nonce 떼고 order.id만 사용(같은 주문 연속 클릭에도 재발화).
  useEffect(() => {
    if (!externalMatchOpenOrderId) return;
    const id = externalMatchOpenOrderId.split("#")[0];
    if (id) {
      setMatchOpenOrderId(id);
      setSelectedDepositIds([]);
      setMatchSearch("");
    }
  }, [externalMatchOpenOrderId]);
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
      setMatchOpenOrderId("");
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
      setMatchOpenOrderId("");
      setSelectedDepositIds([]);
      await onMatched?.();
    } finally {
      setMatchSaving(false);
    }
  };
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<"" | "rozen" | "picking">("");
  const [cancelViewFilter, setCancelViewFilter] = useState<LiveOrderCancelViewFilterValue>("all");

  useEffect(() => {
    setPage(1);
  }, [cancelViewFilter]);

  useEffect(() => {
    setPage(1);
  }, [filters.broadcast, filters.date, filters.customStartDate, filters.customEndDate, filters.filterYear, filters.filterMonth, filters.status, filters.keyword, sortMode, pageSize]);

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
      date: "all",
      customStartDate: "",
      customEndDate: "",
      filterYear: "",
      filterMonth: "",
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
      custom:
        filters.customStartDate || filters.customEndDate
          ? `직접 선택 ${filters.customStartDate || "시작일"}~${filters.customEndDate || "종료일"}`
          : "직접 선택",
      yearmonth:
        filters.filterYear || filters.filterMonth
          ? `${filters.filterYear ? `${filters.filterYear}년` : "연도전체"} ${filters.filterMonth ? `${filters.filterMonth}월` : "월전체"}`
          : "연·월 선택",
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

  const exportRosen = async () => {
    setExporting("rozen");

    try {
      await exportLiveOrdersForRosen(exportableOrders, { filterLabel: currentFilterLabel });
    } finally {
      setExporting("");
    }
  };

  const exportPicking = async () => {
    setExporting("picking");

    try {
      await exportLiveOrdersForPicking(exportableOrders, { filterLabel: currentFilterLabel });
    } finally {
      setExporting("");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-black text-slate-950">실시간 주문서</h2>

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
            rose:  { bg: "#7B2D43", text: "#fff", inactiveBg: "#F9F0F2", inactiveText: "#7B2D43" },
            green: { bg: "#0F6E56", text: "#fff", inactiveBg: "#E7F3EE", inactiveText: "#0F6E56" },
            red:   { bg: "#C0392B", text: "#fff", inactiveBg: "#FBEAE7", inactiveText: "#C0392B" },
            amber: { bg: "#854F0B", text: "#fff", inactiveBg: "#FBF1E0", inactiveText: "#854F0B" },
            blue:  { bg: "#185FA5", text: "#fff", inactiveBg: "#E8F0FA", inactiveText: "#185FA5" },
            muted: { bg: "#777",    text: "#fff", inactiveBg: "#F1EFEC", inactiveText: "#777" },
          };
          const t = toneStyle[tone as string] ?? toneStyle.muted;

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
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exportRosen}
            disabled={exporting !== "" || exportableOrders.length === 0}
            className="rounded-xl bg-rose-deep px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-rose-deep disabled:cursor-not-allowed disabled:bg-slate-300"
            title="현재 필터 조건 그대로 로젠 송장 엑셀을 내보냅니다"
          >
            {exporting === "rozen" ? "내보내는중..." : "🚚 송장 출력"}
          </button>

          <button
            type="button"
            onClick={exportPicking}
            disabled={exporting !== "" || exportableOrders.length === 0}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title="현재 필터 조건 그대로 물건챙기기 엑셀을 내보냅니다"
          >
            {exporting === "picking" ? "내보내는중..." : "🛍 물건챙기기"}
          </button>

            {canceledExportExcludedCount > 0 ? (
              <span className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                주문서취소 {canceledExportExcludedCount.toLocaleString("ko-KR")}건은 엑셀 내보내기에서 자동 제외됩니다.
              </span>
            ) : null}

          <button
            type="button"
            onClick={toggleNicknameSort}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            {sortLabel}
          </button>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none hover:bg-slate-50"
          >
            <option value={10}>페이지당 10건</option>
            <option value={20}>페이지당 20건</option>
            <option value={30}>페이지당 30건</option>
          </select>

          <button
            type="button"
            onClick={refreshOrders}
            disabled={!onRefresh || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            title="주문 새로고침"
          >
            {refreshing ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="mb-2 rounded-xl bg-rose-soft px-3 py-2 text-[11px] font-black text-rose-deep">
        상단 카운트 버튼과 필터가 실제 주문서와 매출요약에 함께 적용됩니다. 검색은 Enter 또는 검색 버튼을 눌렀을 때만 적용됩니다.
      </div>

      <div className="mb-3 flex w-full flex-wrap items-center gap-2 xl:flex-nowrap">
        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[170px]"
          value={filters.broadcast}
          onChange={(event) => updateFilter("broadcast", event.target.value)}
        >
          <option value="all">방송: 전체보기</option>
          {broadcastOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="none">{todayAlwaysOrderLabel()}</option>
        </select>

        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[120px]"
          value={filters.date}
          onChange={(event) => updateFilter("date", event.target.value as LiveOrderDateFilter)}
        >
          <option value="all">날짜: 전체보기</option>
          <option value="today">오늘</option>
          <option value="yesterday">어제</option>
          <option value="7days">최근 7일</option>
          <option value="month">이번 달</option>
          <option value="custom">직접 선택</option>
          <option value="yearmonth">연·월 선택</option>
        </select>

        {filters.date === "custom" && (
          <>
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              type="date"
              value={filters.customStartDate}
              onChange={(event) => updateFilter("customStartDate", event.target.value)}
              aria-label="시작일"
            />
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              type="date"
              value={filters.customEndDate}
              onChange={(event) => updateFilter("customEndDate", event.target.value)}
              aria-label="종료일"
            />
          </>
        )}

        {filters.date === "yearmonth" && (
          <>
            <select className="h-11 flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[100px]"
              value={filters.filterYear}
              onChange={(event) => updateFilter("filterYear", event.target.value)}
              aria-label="연도"
            >
              <option value="">연도 전체</option>
              {(() => {
                const cy = new Date().getFullYear();
                const years = [];
                for (let y = cy; y >= cy - 3; y--) years.push(y);
                return years.map((y) => <option key={y} value={String(y)}>{y}년</option>);
              })()}
            </select>
            <select className="h-11 flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[90px]"
              value={filters.filterMonth}
              onChange={(event) => updateFilter("filterMonth", event.target.value)}
              aria-label="월"
            >
              <option value="">월 전체</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>{m}월</option>
              ))}
            </select>
          </>
        )}

        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[128px]"
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

        <input className="h-11 min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          value={pendingKeyword}
          onChange={(event) => setPendingKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyKeyword();
          }}
          placeholder="🔍 닉네임·상품·금액 검색"
        />

        <button className="h-11 w-full flex-none rounded-xl bg-rose-deep px-3 text-[12px] font-black text-white shadow-sm hover:bg-rose-deep active:scale-[0.99] sm:w-[84px]"
          type="button"
          onClick={applyKeyword}
        >
          검색
        </button>

        <button className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm hover:bg-slate-50 active:scale-[0.99] sm:w-[84px]"
          type="button"
          onClick={resetFilters}
        >
          초기화
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
            {/* 헤더 행 */}
            <div className="grid grid-cols-[108px_130px_90px_minmax(0,1fr)_48px_96px_72px_96px_116px_68px] gap-0 border-b border-rose-line bg-rose-soft/40 text-[12px] font-black text-slate-500">
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

            {/* 주문 행 목록 */}
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="px-3 py-10 text-center text-sm font-black text-slate-400">실제 주문 데이터를 불러오는 중입니다.</div>
              ) : visibleOrders.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm font-black text-slate-400">표시할 주문이 없습니다.</div>
              ) : (
                visibleOrders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  return (
                    <Fragment key={order.id}>
                    <div
                      onDragOver={isMatchableOrder(order) ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropHoverOrderId !== order.id) setDropHoverOrderId(order.id); } : undefined}
                      onDragLeave={isMatchableOrder(order) ? () => setDropHoverOrderId((cur) => (cur === order.id ? "" : cur)) : undefined}
                      onDrop={isMatchableOrder(order) ? (e) => { e.preventDefault(); handleDepositDropOnOrder(order, e.dataTransfer.getData("text/plain")); } : undefined}
                      className={`grid grid-cols-[108px_130px_90px_minmax(0,1fr)_48px_96px_72px_96px_116px_68px] gap-0 items-start text-[14px] transition ${dropHoverOrderId === order.id ? "bg-emerald-50 ring-2 ring-inset ring-emerald-500" : selected ? "bg-rose-soft/70" : "hover:bg-slate-50"} ${order.paymentStatus === "manual_match_needed" ? "border-l-2 border-rose-deep" : ""}`}
                    >
                      {/* 1. 주문일 */}
                      <div className="px-3 py-3 text-center text-[11px] leading-tight text-slate-500">
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
                            return <><div>{yy}.{mm}.{dd}</div><div className="text-slate-400">({wd}) {hh}:{mi}</div></>;
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
                        {(inventoryStatusBadge(order) || testOrderBadge(order)) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {inventoryStatusBadge(order)}
                            {testOrderBadge(order)}
                          </div>
                        )}
                      </div>
                      {/* 3. 이름 */}
                      <div className="min-w-0 truncate px-3 py-3 text-center text-[13px] text-slate-600">{order.name || "-"}</div>
                      {/* 4. 주문내용 */}
                      <div className="min-w-0 truncate px-3 py-3 text-center text-[13px] font-black text-slate-600">{renderOrderSummary(order)}</div>
                      {/* 4. 수량 */}
                      <div className="px-3 py-3 text-center">
                        <span className="inline-flex min-w-[34px] items-center justify-center rounded-lg bg-slate-100 px-1 py-0.5 text-[13px] font-black text-slate-700">
                          {getTotalQty(order)}
                        </span>
                      </div>
                      {/* 5. 상품금액 */}
                      <div className="px-3 py-3 text-center text-[13px] font-black text-slate-700">
                        <div>{money(order.productAmount)}</div>
                        {Number(order.pointUsedAmount || 0) > 0 ? (
                          <div className="text-[10px] text-emerald-700">-{money(Number(order.pointUsedAmount || 0))}</div>
                        ) : null}
                      </div>
                      {/* 6. 택배비 */}
                      <div className="px-3 py-3 text-center text-[13px] text-slate-400">
                        {Number(order.shippingFee || 0) > 0 ? money(order.shippingFee) : "0"}
                      </div>
                      {/* 7. 총금액 */}
                      <div className="px-3 py-3 text-center text-[14px] font-black text-slate-950">
                        {money(Number(order.totalAmount || 0) || Number(order.finalAmount || 0))}
                        {String((order as any).paymentMethod || "").includes("카드") && Number((order as any).cardPaymentTotalAmount || 0) > 0 ? (
                          <div className="text-[10px] font-black text-purple-700">카드 {money(Number((order as any).cardPaymentTotalAmount || 0))}</div>
                        ) : null}
                      </div>
                      {/* 8. 입금 */}
                      <div className="px-3 py-3 text-center">
                        <div>{statusBadge(order)}</div>
                        {order.paidAt && <div className="mt-0.5 text-[10px] text-slate-400">{order.paidAt}</div>}
                        {order.paymentStatus === "manual_match_needed" ? (
                          <button type="button" onClick={() => { setMatchOpenOrderId((cur) => (cur === order.id ? "" : order.id)); setSelectedDepositIds([]); }} className="mt-1 rounded-lg border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-700 hover:bg-orange-100">
                            {matchOpenOrderId === order.id ? "매칭 ▲" : "매칭 ▼"}
                          </button>
                        ) : null}
                        {order.paymentStatus === "card_unpaid" && onOpenCardPay ? (
                          <button type="button" onClick={() => { openPaysterRightHalf(); onOpenCardPay(order); }} className="mt-1 rounded-lg border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-100">
                            💳 카드결제
                          </button>
                        ) : null}
                      </div>
                      {/* 9. 출고 */}
                      <div className="px-3 py-3 text-center">
                        {(order as any).shippingStatus ? (
                          <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{(order as any).shippingStatus}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </div>
                    </div>

                    {matchOpenOrderId === order.id ? (() => {
                      const { expectedAmount } = deriveOrderMatchKeys(order);
                      const q = matchSearch.trim().toLowerCase();
                      const qDigits = q.replace(/[^0-9]/g, "");
                      const sorted = (deposits || [])
                        .filter(isUnmatchedLiveDeposit)
                        .filter((d) => {
                          if (!q) return true;
                          const nameHit = String(d.depositor_name || "").toLowerCase().includes(q);
                          const amtHit = qDigits ? String(Number(d.amount || 0)).includes(qDigits) : false;
                          return nameHit || amtHit;
                        })
                        .slice()
                          .sort((a, b) => {
                            return new Date(b.deposited_time || 0).getTime() - new Date(a.deposited_time || 0).getTime();
                          })
                        .slice(0, 8);
                      return (
                        <div style={{ background: "#FFF8FA", borderTop: "1px solid #D9C5CC", borderBottom: "1px solid #D9C5CC", padding: "12px 16px 14px" }}>
                          <div style={{ maxWidth: "580px", margin: "0 auto" }}>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#7B2D43", marginBottom: "8px", textAlign: "center" }}>
                            🔗 입금내역에서 연결할 건을 선택해주세요 — 최신 입금순 정렬 (주문금액 {money(expectedAmount)})
                          </div>
                          <input
                            value={matchSearch}
                            onChange={(e) => setMatchSearch(e.target.value)}
                            placeholder="🔍 입금자명 / 금액 검색"
                            style={{ width: "100%", height: "34px", borderRadius: "8px", border: "1px solid #E8E2DD", padding: "0 10px", fontSize: "12px", fontWeight: 700, marginBottom: "8px", outline: "none" }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                            {sorted.length === 0 ? (
                              <div style={{ fontSize: "12px", color: "#888", padding: "8px 0" }}>미매칭 입금내역이 없습니다.</div>
                            ) : (
                              sorted.map((dep, idx) => {
                                const id = String(dep.id);
                                const isSel = selectedDepositIds.includes(id);
                                const diff = Number(dep.amount || 0) - expectedAmount;
                                const score = liveDepositNameScore(String(dep.depositor_name || ""), order.nickname || "", order.name || "");
                                const best = diff === 0 && score >= 75;
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedDepositIds((prev) => (isSel ? prev.filter((x) => x !== id) : [...prev, id]))}
                                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 10px", borderRadius: "8px", textAlign: "left", border: "1px solid " + (isSel || best ? "#0F6E56" : "#E8E2DD"), background: isSel || best ? "#E7F3EE" : "#fff", cursor: "pointer" }}
                                  >
                                    <span style={{ width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid " + (isSel ? "#0F6E56" : "#D9C5CC"), background: isSel ? "#0F6E56" : "#fff", color: "#fff", fontSize: "11px", fontWeight: 900, lineHeight: 1 }}>{isSel ? "✓" : ""}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontSize: "12px", fontWeight: 800 }}>{dep.depositor_name || "-"}</span>
                                      {best ? <span style={{ marginLeft: "4px", fontSize: "10px", fontWeight: 800, padding: "1px 5px", borderRadius: "3px", background: "#0F6E56", color: "#fff" }}>✅ 추천</span> : null}{score >= 75 && !best ? <span style={{ marginLeft: "4px", fontSize: "10px", fontWeight: 800, color: "#0F6E56" }}>👤 이름유사</span> : null}
                                      <span style={{ display: "block", fontSize: "11px", color: "#888" }}>{liveDepositDateLabel(dep)}</span>
                                    </span>
                                    <span style={{ fontSize: "12px", fontWeight: 800 }}>{money(Number(dep.amount || 0))}</span>
                                    <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: diff === 0 ? "#E7F3EE" : "#FBF1E0", color: diff === 0 ? "#0F6E56" : "#854F0B" }}>
                                      {diff === 0 ? "일치" : (diff > 0 ? "+" : "") + diff.toLocaleString("ko-KR")}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                          {selectedDepositIds.length > 0 ? (() => {
                            const selDeps = (deposits || []).filter((d) => selectedDepositIds.includes(String(d.id)));
                            const selTotal = selDeps.reduce((s, d) => s + Number(d.amount || 0), 0);
                            const amountMatch = selTotal === expectedAmount;
                            return (
                              <div style={{ fontSize: "11px", fontWeight: 800, textAlign: "center", padding: "0 0 6px", color: amountMatch ? "#0F6E56" : "#C0392B" }}>
                                선택 {selDeps.length}건 합계 {money(selTotal)} / 주문금액 {money(expectedAmount)} {amountMatch ? "✓ 일치" : "✗ 불일치 (확정 불가)"}
                              </div>
                            );
                          })() : null}
                          <div style={{ display: "flex", gap: "6px" }}>
                            {(() => {
                              const selDeps = (deposits || []).filter((d) => selectedDepositIds.includes(String(d.id)));
                              const selTotal = selDeps.reduce((s, d) => s + Number(d.amount || 0), 0);
                              const canConfirm = selDeps.length > 0 && selTotal === expectedAmount;
                              return (
                            <button
                              type="button"
                              disabled={matchSaving || !canConfirm}
                              onClick={() => {
                                if (canConfirm) void confirmWithDeposit(order, selDeps, selectedDepositIds);
                              }}
                              style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, color: "#fff", background: "#0F6E56", border: "none", cursor: matchSaving || !canConfirm ? "default" : "pointer", opacity: matchSaving || !canConfirm ? 0.5 : 1 }}
                            >
                              선택 후 입금확인
                            </button>
                              );
                            })()}
                            <button
                              type="button"
                              disabled={matchSaving}
                              onClick={() => void confirmWithoutDeposit(order)}
                              style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, color: "#fff", background: "#7B2D43", border: "none", cursor: "pointer", opacity: matchSaving ? 0.6 : 1 }}
                            >
                              금액 무시하고 수동확인
                            </button>
                            <button
                              type="button"
                              onClick={() => { setMatchOpenOrderId(""); setSelectedDepositIds([]); }}
                              style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, color: "#555", background: "#fff", border: "1px solid #E8E2DD", cursor: "pointer" }}
                            >
                              닫기
                            </button>
                          </div>
                          </div>
                        </div>
                      );
                    })() : null}
                    </Fragment>
                  );
                })
              )}
            </div>
      </div>

      <div className="mt-3 flex items-center">
        <div className="text-xs font-black text-slate-500">
          총 {orders.length}건 / 전체 {allOrderCount}건
        </div>
        <div className="mx-auto flex items-center gap-5 text-sm font-black">
          <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} className="text-slate-400">‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={
                  safePage === pageNumber
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-rose-deep text-white"
                    : "text-slate-500"
                }
              >
                {pageNumber}
              </button>
            );
          })}
          <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="text-slate-400">›</button>
        </div>
      </div>
    </section>
  );
}
