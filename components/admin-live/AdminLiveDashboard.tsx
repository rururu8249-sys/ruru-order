"use client";
const LIVE_ORDER_AUTO_REFRESH_ENABLED = false;

const maybeSetLiveOrderAutoRefreshInterval = (
  handler: Parameters<typeof window.setInterval>[0],
  timeout?: number,
): number | null => {
  if (!LIVE_ORDER_AUTO_REFRESH_ENABLED) return null;
  return window.setInterval(handler, timeout);
};

const clearLiveOrderAutoRefreshInterval = (intervalId: number | null) => {
  if (intervalId !== null) window.clearInterval(intervalId);
};


import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import ManualPaymentMatchDrawer from "@/components/admin-v2/payment/ManualPaymentMatchDrawer";
import AdminLiveCustomersPanel from "./AdminLiveCustomersPanel";
import AdminLiveMenuPlaceholder from "./AdminLiveMenuPlaceholder";
import AdminLiveOrdersPanel from "./AdminLiveOrdersPanel";
import AdminLivePaymentPanel from "./AdminLivePaymentPanel";
import AdminLiveSettlementPanel from "./AdminLiveSettlementPanel";
import AdminLiveSettingsPanel from "./AdminLiveSettingsPanel";
import AdminLiveSidebar from "./AdminLiveSidebar";
import LiveHeader from "./LiveHeader";
import LiveStatsCards from "./LiveStatsCards";
import LiveBroadcastPanels from "./LiveBroadcastPanels";
import LiveBroadcastEndSummaryModal, { type LiveBroadcastEndSummary } from "./LiveBroadcastEndSummaryModal";
import LiveOrderTable, { type LiveOrderFilters } from "./LiveOrderTable";
import LiveOrderDetailDrawer from "./LiveOrderDetailDrawer";
import {
  endAdminLiveBroadcast,
  getActiveBroadcast,
  isOrderInsideBroadcastTime,
  loadAdminLiveBroadcasts,
  startAdminLiveBroadcast,
  updateAdminLiveBroadcast,
  type AdminLiveBroadcast,
} from "./liveBroadcastController";
import type { DepositRow, OrderGroup, OrderRow } from "@/lib/admin-v2/types";
import type { AdminLiveMenuKey } from "./adminLiveMenu";
import type { LiveOrder } from "./types";
import {
  buildAdminLiveOrderGroups,
  sortLiveOrdersByCreatedDesc,
  toAdminLiveOrder,
} from "./liveOrderAdapter";
import { useAutoBankdaPaymentSync } from "./useAutoBankdaPaymentSync";
import AdminLiveQuickProductDrawer from "./AdminLiveQuickProductDrawer";
import AdminLiveProductListPanel from "./AdminLiveProductListPanel";
import {
  buildAlwaysOrderOptions,
  getAlwaysOrderDateFromFilter,
  getAlwaysOrderDateKey,
  isAlwaysOrderLike,
} from "./alwaysOrderDateUtils";

type VideoRatio = "vertical" | "wide" | "auto";

const DEFAULT_FILTERS: LiveOrderFilters = {
  broadcast: "all",
  date: "all",
  customStartDate: "",
  customEndDate: "",
  status: "all",
  keyword: "",
};

function toDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function formatMonthDay(value?: string | null) {
  const date = value ? new Date(value) : new Date();

  if (!Number.isFinite(date.getTime())) {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function formatKoreanWeekday(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  if (!Number.isFinite(date.getTime())) {
    return weekdays[new Date().getDay()];
  }

  return weekdays[date.getDay()];
}

function stripExistingBroadcastPrefix(title: string) {
  return title
    .replace(/^\d{4}\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일)\s*/u, "")
    .replace(/^\d{4}\s*/u, "")
    .trim();
}

function formatBroadcastDisplayTitle(broadcast: AdminLiveBroadcast | null | undefined) {
  const baseDate = broadcast?.started_at || broadcast?.created_at || null;
  const mmdd = formatMonthDay(baseDate);
  const weekday = formatKoreanWeekday(baseDate);
  const rawTitle = String(broadcast?.public_title || broadcast?.admin_subtitle || "").trim();
  const cleanedTitle = stripExistingBroadcastPrefix(rawTitle) || "방송";

  return `${mmdd}(${weekday}) ${cleanedTitle}`;
}

function todayAlwaysOrderLabel() {
  return `${formatMonthDay()}(${formatKoreanWeekday()}) 공구·상시주문`;
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function matchesStatus(order: LiveOrder, status: LiveOrderFilters["status"]) {
  if (status === "all") return true;
  if (status === "unpaid") return ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus);
  if (status === "paid") return isPaid(order);
  return order.paymentStatus === status;
}

function localDateKey(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateInput(value: string) {
  const nextValue = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(nextValue) ? nextValue : "";
}

function matchesDate(order: LiveOrder, filters: LiveOrderFilters) {
  const dateFilter = filters.date;

  if (dateFilter === "all") return true;

  const orderDateKey = localDateKey(order.createdAt);
  if (!orderDateKey) return false;

  if (dateFilter === "custom") {
    const startDate = normalizeDateInput(filters.customStartDate);
    const endDate = normalizeDateInput(filters.customEndDate);

    if (!startDate && !endDate) return true;
    if (startDate && orderDateKey < startDate) return false;
    if (endDate && orderDateKey > endDate) return false;

    return true;
  }

  const now = new Date();
  const todayKey = localDateKey(now.toISOString());

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday.toISOString());

  if (dateFilter === "today") return orderDateKey === todayKey;
  if (dateFilter === "yesterday") return orderDateKey === yesterdayKey;

  const orderDate = new Date(order.createdAt || orderDateKey);
  if (!Number.isFinite(orderDate.getTime())) return false;

  if (dateFilter === "7days") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return orderDate >= sevenDaysAgo;
  }

  if (dateFilter === "month") {
    return orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth();
  }

  return true;
}

function buildCriteriaLabel(filters: LiveOrderFilters) {
  const parts: string[] = [];

  if (filters.broadcast === "all") parts.push("방송 전체보기");
  else if (filters.broadcast === "none") parts.push(todayAlwaysOrderLabel());
  else parts.push("선택 방송");

  const dateLabelMap: Record<LiveOrderFilters["date"], string> = {
    all: "날짜 전체보기",
    today: "오늘",
    yesterday: "어제",
    "7days": "최근 7일",
    month: "이번 달",
    custom:
      filters.customStartDate || filters.customEndDate
        ? `직접 선택 ${filters.customStartDate || "시작일"}~${filters.customEndDate || "종료일"}`
        : "직접 선택",
  };
  parts.push(dateLabelMap[filters.date]);

  const statusLabelMap: Record<LiveOrderFilters["status"], string> = {
    all: "상태 전체보기",
    unpaid: "결제대기",
    paid: "입금확인완료",
    manual_match_needed: "입금확인 필요",
    card_paid: "카드결제완료",
    card_unpaid: "카드 미결제",
  };
  parts.push(statusLabelMap[filters.status]);

  if (filters.keyword.trim()) parts.push(`검색: ${filters.keyword.trim()}`);

  return parts.join(" · ");
}

const MENU_KEYS_FOR_URL: AdminLiveMenuKey[] = [
  "broadcast",
  "orders",
  "payments",
  "customers",
  "settlement",
  "settings",
];

function isMenuKeyForUrl(value: string | null): value is AdminLiveMenuKey {
  return Boolean(value && MENU_KEYS_FOR_URL.includes(value as AdminLiveMenuKey));
}

function readMenuFromUrl(): AdminLiveMenuKey {
  if (typeof window === "undefined") return "broadcast";

  const params = new URLSearchParams(window.location.search);
  const panel = params.get("panel");

  return isMenuKeyForUrl(panel) ? panel : "broadcast";
}

function replacePanelInUrl(menu: AdminLiveMenuKey) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("panel", menu);

  window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
}


const BROADCAST_END_PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];

function broadcastEndMoneyAmount(order: LiveOrder) {
  if (order.paymentStatus === "card_paid" && Number(order.cardPaymentTotalAmount || 0) > 0) {
    return Number(order.cardPaymentTotalAmount || 0);
  }

  return Number(order.totalAmount || 0);
}

function isBroadcastEndPaid(order: LiveOrder) {
  return BROADCAST_END_PAID_STATUSES.includes(order.paymentStatus);
}

function isBroadcastEndCanceled(order: LiveOrder) {
  return order.paymentStatus === "canceled";
}

function isExcludedFromSettlement(order: LiveOrder) {
  return order.excludeFromSettlement === true;
}

function normalizeBroadcastEndPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatBroadcastEndDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatBroadcastEndTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBroadcastEndDuration(startValue: string | null | undefined, endValue: string | null | undefined) {
  const startTime = startValue ? new Date(startValue).getTime() : NaN;
  const endTime = endValue ? new Date(endValue).getTime() : NaN;

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return "-";
  }

  const totalMinutes = Math.max(0, Math.round((endTime - startTime) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes.toLocaleString("ko-KR")}분`;
  return `${hours.toLocaleString("ko-KR")}시간 ${minutes.toLocaleString("ko-KR")}분`;
}

function isOrderInsideBroadcastEndSummary(order: LiveOrder, broadcast: AdminLiveBroadcast, endedAtIso: string) {
  if (order.broadcastId && String(order.broadcastId) === String(broadcast.id)) return true;

  const startValue = broadcast.started_at || broadcast.created_at || null;
  const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
  const startTime = startValue ? new Date(startValue).getTime() : NaN;
  const endTime = new Date(endedAtIso).getTime();

  if (!Number.isFinite(orderTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;

  return orderTime >= startTime && orderTime <= endTime;
}

function buildLiveBroadcastEndSummary({
  broadcast,
  orders,
  endedAtIso,
}: {
  broadcast: AdminLiveBroadcast;
  orders: LiveOrder[];
  endedAtIso: string;
}): LiveBroadcastEndSummary {
  const startValue = broadcast.started_at || broadcast.created_at || null;
  const broadcastOrders = orders.filter((order) => !isExcludedFromSettlement(order) && isOrderInsideBroadcastEndSummary(order, broadcast, endedAtIso));
  const activeOrders = broadcastOrders.filter((order) => !isBroadcastEndCanceled(order));
  const canceledOrders = broadcastOrders.filter(isBroadcastEndCanceled);
  const paidOrders = activeOrders.filter(isBroadcastEndPaid);
  const unpaidOrders = activeOrders.filter((order) => !isBroadcastEndPaid(order));
  const bankPaidOrders = paidOrders.filter((order) => order.paymentMethod === "무통장입금");
  const cardPaidOrders = paidOrders.filter((order) => order.paymentMethod === "카드결제" || order.paymentStatus === "card_paid");

  const currentPhones = Array.from(
    new Set(activeOrders.map((order) => normalizeBroadcastEndPhone(order.phone)).filter(Boolean))
  );

  const startTime = startValue ? new Date(startValue).getTime() : NaN;
  const previousPhones = new Set(
    orders
      .filter((order) => {
        if (isExcludedFromSettlement(order)) return false;
        const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
        return Number.isFinite(startTime) && Number.isFinite(orderTime) && orderTime < startTime;
      })
      .map((order) => normalizeBroadcastEndPhone(order.phone))
      .filter(Boolean)
  );

  const existingMemberCount = currentPhones.filter((phone) => previousPhones.has(phone)).length;
  const newMemberCount = Math.max(0, currentPhones.length - existingMemberCount);

  const sum = (list: LiveOrder[]) => {
    return list.reduce((total, order) => total + broadcastEndMoneyAmount(order), 0);
  };

  return {
    title: broadcast.public_title || broadcast.admin_subtitle || "루루동이LIVE",
    broadcastDateText: formatBroadcastEndDate(startValue || endedAtIso),
    startTimeText: formatBroadcastEndTime(startValue),
    endTimeText: formatBroadcastEndTime(endedAtIso),
    durationText: formatBroadcastEndDuration(startValue, endedAtIso),
    orderCount: broadcastOrders.length,
    activeOrderCount: activeOrders.length,
    canceledCount: canceledOrders.length,
    paidCount: paidOrders.length,
    paidAmount: sum(paidOrders),
    bankPaidCount: bankPaidOrders.length,
    bankPaidAmount: sum(bankPaidOrders),
    cardPaidCount: cardPaidOrders.length,
    cardPaidAmount: sum(cardPaidOrders),
    unpaidCount: unpaidOrders.length,
    unpaidAmount: sum(unpaidOrders),
    buyerCount: currentPhones.length,
    existingMemberCount,
    newMemberCount,
    visitorText: "방문 로그 설정 후 표시",
    memberBasisText: "현재 불러온 주문 이력 기준",
  };
}


function buildLiveBroadcastEndPreviewSummary(): LiveBroadcastEndSummary {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 1000 * 60 * 194);

  return {
    title: "미리보기 방송종료 요약",
    broadcastDateText: formatBroadcastEndDate(startedAt.toISOString()),
    startTimeText: formatBroadcastEndTime(startedAt.toISOString()),
    endTimeText: formatBroadcastEndTime(endedAt.toISOString()),
    durationText: formatBroadcastEndDuration(startedAt.toISOString(), endedAt.toISOString()),
    orderCount: 28,
    activeOrderCount: 27,
    canceledCount: 1,
    paidCount: 24,
    paidAmount: 1847000,
    bankPaidCount: 19,
    bankPaidAmount: 1462000,
    cardPaidCount: 5,
    cardPaidAmount: 385000,
    unpaidCount: 3,
    unpaidAmount: 214000,
    buyerCount: 18,
    existingMemberCount: 11,
    newMemberCount: 7,
    visitorText: "미리보기 샘플 · 실제 방문 기록 아님",
    memberBasisText: "미리보기 샘플",
  };
}


async function saveLiveBroadcastEndReport({
  broadcast,
  summary,
  endedAtIso,
}: {
  broadcast: AdminLiveBroadcast;
  summary: LiveBroadcastEndSummary;
  endedAtIso: string;
}) {
  const response = await fetch("/api/admin-live/broadcast-end-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      broadcastId: broadcast.id,
      broadcastTitle: summary.title,
      startedAt: broadcast.started_at || broadcast.created_at || null,
      endedAt: endedAtIso,

      orderCount: summary.orderCount,
      activeOrderCount: summary.activeOrderCount,
      canceledCount: summary.canceledCount,

      paidCount: summary.paidCount,
      paidAmount: summary.paidAmount,

      bankPaidCount: summary.bankPaidCount,
      bankPaidAmount: summary.bankPaidAmount,

      cardPaidCount: summary.cardPaidCount,
      cardPaidAmount: summary.cardPaidAmount,

      unpaidCount: summary.unpaidCount,
      unpaidAmount: summary.unpaidAmount,

      buyerCount: summary.buyerCount,
      existingMemberCount: summary.existingMemberCount,
      newMemberCount: summary.newMemberCount,

      visitorCount: null,
      visitorNote: summary.visitorText,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message || "방송종료 리포트 저장 실패");
  }

  return payload.report;
}

export default function AdminLiveDashboard() {
  useAutoBankdaPaymentSync();
  const [activeMenu, setActiveMenu] = useState<AdminLiveMenuKey>(() => readMenuFromUrl());
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [broadcasts, setBroadcasts] = useState<AdminLiveBroadcast[]>([]);
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [manualMatchGroup, setManualMatchGroup] = useState<OrderGroup | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<LiveOrderFilters>(DEFAULT_FILTERS);
  const [broadcastEndSummary, setBroadcastEndSummary] = useState<LiveBroadcastEndSummary | null>(null);

  const loadDepositsFromServer = async () => {
    const response = await fetch("/api/admin-v2/deposits", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      console.warn("[admin-live] 입금내역 불러오기 실패", result);
      setDeposits([]);
      return;
    }

    setDeposits((result.deposits || []) as DepositRow[]);
  };

  const syncBankdaDepositsOnly = async () => {
    const response = await fetch("/api/bankda/sync-and-auto-match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || "뱅크다 입금내역 조회에 실패했습니다.");
    }

    await loadDepositsFromServer();

    return result;
  };


  const loadBroadcasts = async () => {
    try {
      const rows = await loadAdminLiveBroadcasts();
      setBroadcasts(rows);
    } catch (error) {
      console.warn("[admin-live] 방송 목록 불러오기 실패", error);
      setBroadcasts([]);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .neq("is_deleted", true)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setOrders([]);
      setOrderGroups([]);
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const groups = sortLiveOrdersByCreatedDesc(
      buildAdminLiveOrderGroups((data || []) as OrderRow[])
    );
    const liveOrders = groups.map(toAdminLiveOrder);

    setOrderGroups(groups);
    setOrders(liveOrders);
    setSelectedOrderId((current) => {
      if (current && liveOrders.some((order) => order.id === current)) return current;
      return liveOrders.find((order) => order.paymentStatus === "manual_match_needed")?.id || liveOrders[0]?.id || "";
    });
    setLoading(false);
  };

  useEffect(() => {
    void loadOrders();
    void loadDepositsFromServer();
    void loadBroadcasts();

    const refreshTimer = maybeSetLiveOrderAutoRefreshInterval(() => {
      void loadOrders();
      void loadDepositsFromServer();
    }, 15000);

    const handleAutoBankdaSynced = () => {
      void loadOrders();
      void loadDepositsFromServer();
    };

    window.addEventListener("ruru-admin-live-auto-bankda-synced", handleAutoBankdaSynced);

    return () => {
      clearLiveOrderAutoRefreshInterval(refreshTimer);
      window.removeEventListener("ruru-admin-live-auto-bankda-synced", handleAutoBankdaSynced);
    };
  }, []);

  useEffect(() => {
    replacePanelInUrl(activeMenu);
  }, [activeMenu]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const previewMode = url.searchParams.get("preview");

    if (previewMode !== "end-summary") return;

    setBroadcastEndSummary(buildLiveBroadcastEndPreviewSummary());
  }, []);

  const activeBroadcast = useMemo(() => getActiveBroadcast(broadcasts), [broadcasts]);

  const broadcastOptions = useMemo(() => {
    const todayDateKey = getAlwaysOrderDateKey(new Date().toISOString());
    const alwaysOptions = buildAlwaysOrderOptions(orders as any[], todayDateKey);

    const options = broadcasts.map((broadcast) => ({
      value: broadcast.id,
      label: `방송: ${formatBroadcastDisplayTitle(broadcast)}`,
    }));

    const mergedOptions = [...alwaysOptions, ...options];

    return activeBroadcast
      ? [{ value: "current", label: "현재 방송" }, ...mergedOptions]
      : mergedOptions;
  }, [broadcasts, activeBroadcast, orders]);

  const filteredOrders = useMemo(() => {
    const keyword = normalizeText(filters.keyword);

    return orders.filter((order) => {
      const selectedAlwaysOrderDate = getAlwaysOrderDateFromFilter(filters.broadcast);

      const selectedBroadcast =
        filters.broadcast === "current"
          ? activeBroadcast
          : broadcasts.find((broadcast) => broadcast.id === filters.broadcast) || null;

      const todayKey = toDateKey(new Date().toISOString());
      const orderDateKey = toDateKey(order.createdAt);

      const matchBroadcast =
        filters.broadcast === "all"
          ? true
          : filters.broadcast === "none"
            ? isAlwaysOrderLike(order as any) && orderDateKey === todayKey
            : selectedAlwaysOrderDate
              ? isAlwaysOrderLike(order as any) && orderDateKey === selectedAlwaysOrderDate
              : selectedBroadcast
              ? order.broadcastId === selectedBroadcast.id || isOrderInsideBroadcastTime(order.createdAt, selectedBroadcast)
              : false;

      const matchKeyword =
        !keyword ||
        normalizeText([
          order.groupId,
          order.orderNo,
          order.nickname,
          order.name,
          order.phone,
          order.paymentMethod,
          order.orderSummary,
          ...order.items.map((item) => `${item.productName} ${item.optionText}`),
        ].join(" ")).includes(keyword);

      return (
        matchBroadcast &&
        matchesDate(order, filters) &&
        matchesStatus(order, filters.status) &&
        matchKeyword
      );
    });
  }, [orders, filters, broadcasts, activeBroadcast]);

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderId("");
      setOrderDetailOpen(false);
      return;
    }

    setSelectedOrderId((current) => {
      if (current && filteredOrders.some((order) => order.id === current)) return current;
      return filteredOrders.find((order) => order.paymentStatus === "manual_match_needed")?.id || filteredOrders[0].id;
    });
  }, [filteredOrders]);

  const selectedOrder = useMemo(() => {
    return filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null;
  }, [filteredOrders, selectedOrderId]);

  const closeOrderDetail = () => {
    setOrderDetailOpen(false);
  };

  const openManualMatchForOrder = (order: LiveOrder) => {
    const group = orderGroups.find((item) => item.groupId === order.groupId) || null;

    if (!group) {
      showAdminToast("수동매칭할 주문그룹을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.", "warning");
      return;
    }

    setOrderDetailOpen(false);
    setManualMatchGroup(group);
  };

  const refreshAfterManualMatch = async () => {
    await loadOrders();
    await loadDepositsFromServer();
  };

  const startBroadcast = async (input: { title: string; youtubeUrl?: string }) => {
    const ok = await showAdminConfirm(
      [
        "방송을 시작할까요?",
        "",
        "기존 ON 방송이 있으면 종료 처리되고, 새 방송이 ON으로 생성됩니다.",
        "주문 필터는 방송 시작시간 기준으로 묶입니다.",
      ].join("\n")
    );

    if (!ok) return;

    setSavingBroadcast(true);

    try {
      await startAdminLiveBroadcast(input);
      await loadBroadcasts();
      await loadOrders();
      setFilters((prev) => ({ ...prev, broadcast: "current" }));
    } catch (error) {
      showAdminToast("방송시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSavingBroadcast(false);
    }
  };

  const saveBroadcast = async (input: { title: string; youtubeUrl?: string }) => {
    if (!activeBroadcast) {
      showAdminToast("수정할 현재 방송이 없습니다. 먼저 방송을 시작해주세요.", "warning");
      return;
    }

    setSavingBroadcast(true);

    try {
      await updateAdminLiveBroadcast({
        broadcastId: activeBroadcast.id,
        title: input.title,
        youtubeUrl: input.youtubeUrl,
      });
      await loadBroadcasts();
    } catch (error) {
      showAdminToast("방송 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSavingBroadcast(false);
    }
  };

  const endBroadcast = async () => {
    if (!activeBroadcast) {
      showAdminToast("종료할 현재 방송이 없습니다.", "warning");
      return;
    }

    const ok = await showAdminConfirm(
      [
        "현재 방송을 종료할까요?",
        "",
        activeBroadcast.public_title || "방송제목 없음",
        "",
        "종료시간이 저장되고 현재 방송 상태가 OFF로 바뀝니다.",
      ].join("\n")
    );

    if (!ok) return;

    const endedAtIso = new Date().toISOString();
    const summary = buildLiveBroadcastEndSummary({
      broadcast: activeBroadcast,
      orders,
      endedAtIso,
    });

    setSavingBroadcast(true);

    try {
      await endAdminLiveBroadcast(activeBroadcast.id);

      try {
        await saveLiveBroadcastEndReport({
          broadcast: activeBroadcast,
          summary,
          endedAtIso,
        });
      } catch (reportError) {
        showAdminToast(
          "방송종료는 완료됐지만 요약 리포트 저장에 실패했습니다.\n\n" +
            (reportError instanceof Error ? reportError.message : String(reportError)),
          "warning"
        );
      }

      await loadBroadcasts();
      await loadOrders();
      setBroadcastEndSummary(summary);
    } catch (error) {
      showAdminToast("방송종료 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSavingBroadcast(false);
    }
  };

  const criteriaLabel = buildCriteriaLabel(filters);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <AdminLiveSidebar
          activeMenu={activeMenu}
          onMenuChange={(nextMenu) => {
            setActiveMenu(nextMenu);
            replacePanelInUrl(nextMenu);
          }}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-4">
          {activeMenu === "broadcast" ? (
            <>
          <LiveHeader
            videoRatio={videoRatio}
            onVideoRatioChange={setVideoRatio}
            activeBroadcast={activeBroadcast}
            savingBroadcast={savingBroadcast}
            onStartBroadcast={startBroadcast}
            onEndBroadcast={endBroadcast}
            onSaveBroadcast={saveBroadcast}
          />
          <div className="mb-6 grid w-full grid-cols-12 grid-rows-[auto_480px] items-stretch gap-3">

            <div className="col-span-12 min-w-0 xl:col-span-8">

              <LiveStatsCards orders={filteredOrders} criteriaLabel={criteriaLabel} />

            </div>


            <div className="col-span-12 min-h-0 min-w-0 overflow-hidden xl:col-span-4 xl:row-span-2">

              <AdminLiveProductListPanel fillHeight className="h-full min-w-0 overflow-hidden" />

            </div>


            <div className="col-span-12 min-w-0 xl:col-span-8">

              <LiveBroadcastPanels videoRatio={videoRatio} youtubeUrl={activeBroadcast?.youtube_live_url || ""} />

            </div>

          </div>
{loadError && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
              주문 데이터 불러오기 실패: {loadError}
            </div>
          )}

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 xl:col-span-12">
              <LiveOrderTable
                orders={filteredOrders}
                allOrderCount={orders.length}
                selectedOrderId={selectedOrder?.id || ""}
                onSelectOrder={(order) => {
                  setSelectedOrderId(order.id);
                  setOrderDetailOpen(true);
                }}
                onOpenManualMatch={openManualMatchForOrder}
                onRefresh={loadOrders}
                loading={loading}
                filters={filters}
                onFiltersChange={setFilters}
                broadcastOptions={broadcastOptions}
              />
            </div>


          </section>

          {orderDetailOpen && selectedOrder ? (
            <LiveOrderDetailDrawer
              order={selectedOrder}
              onOpenManualMatch={openManualMatchForOrder}
              onClose={closeOrderDetail}
            />
          ) : null}

            </>
          ) : activeMenu === "orders" ? (
            <AdminLiveOrdersPanel
              orders={filteredOrders}
              allOrderCount={orders.length}
              selectedOrder={selectedOrder}
              selectedOrderId={selectedOrder?.id || ""}
              orderDetailOpen={orderDetailOpen}
              filters={filters}
              broadcastOptions={broadcastOptions}
              onSelectOrder={(order) => {
                setSelectedOrderId(order.id);
                setOrderDetailOpen(true);
              }}
              onCloseOrderDetail={() => setOrderDetailOpen(false)}
              onFiltersChange={setFilters}
              onRefresh={loadOrders}
            />
          ) : activeMenu === "payments" ? (
            <AdminLivePaymentPanel
              deposits={deposits}
              orderGroups={orderGroups}
              onRefresh={loadDepositsFromServer}
              onBankdaSync={syncBankdaDepositsOnly}
              onOpenManualMatch={setManualMatchGroup}
            />
          ) : activeMenu === "customers" ? (
            <AdminLiveCustomersPanel orders={orders} />
          ) : activeMenu === "settlement" ? (
            <AdminLiveSettlementPanel orders={orders} />
          ) : activeMenu === "settings" ? (
            <AdminLiveSettingsPanel />
          ) : (
            <AdminLiveMenuPlaceholder menuKey={activeMenu} />
          )}

          <ManualPaymentMatchDrawer
            group={manualMatchGroup}
            deposits={deposits}
            onClose={() => setManualMatchGroup(null)}
            onMatched={refreshAfterManualMatch}
          />
          {broadcastEndSummary ? (
            <LiveBroadcastEndSummaryModal
              summary={broadcastEndSummary}
              onClose={() => setBroadcastEndSummary(null)}
              onOpenSettlement={() => {
                setBroadcastEndSummary(null);
                setActiveMenu("settlement");
                replacePanelInUrl("settlement");
              }}
            />
          ) : null}

          <AdminLiveQuickProductDrawer activeBroadcastId={activeBroadcast?.id || null} />

      </main>
      </div>
    </div>
  );
}
