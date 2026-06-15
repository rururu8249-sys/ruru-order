"use client";
const LIVE_ORDER_AUTO_REFRESH_ENABLED = true;
const LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = true;

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
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import ManualPaymentMatchDrawer from "@/components/admin-v2/payment/ManualPaymentMatchDrawer";
import AdminLiveCustomersPanel from "./AdminLiveCustomersPanel";
import AdminLiveMenuPlaceholder from "./AdminLiveMenuPlaceholder";
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
import LiveFloatingMatchPanel from "./LiveFloatingMatchPanel";
import {
  activateBroadcast,
  endAdminLiveBroadcast,
  getActiveBroadcast,
  getShopOpen,
  isOrderInsideBroadcastTime,
  loadAdminLiveBroadcasts,
  setShopOpen,
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
import AdminLiveProductManagePopup from "./AdminLiveProductManagePopup";
import AdminLiveCardPayPopup from "./AdminLiveCardPayPopup";
import AdminLiveEventRoulettePanel from "./AdminLiveEventRoulettePanel";
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
  filterYear: "",
  filterMonth: "",
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
  if (status === "bank_paid") return ["paid", "auto_paid", "manual_paid"].includes(order.paymentStatus) && order.paymentMethod === "무통장입금";
  if (status === "shipped") {
    // 출고완료: 배송상태에 '출고/발송/배송' 포함 + '대기' 아님 (주문/입금/금액 로직과 무관한 표시 필터)
    const ship = String((order as { shippingStatus?: unknown }).shippingStatus || "").trim();
    return /출고|발송|배송/.test(ship) && !/대기/.test(ship);
  }
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

  if (dateFilter === "yearmonth") {
    const fy = filters.filterYear ? Number(filters.filterYear) : null;
    const fm = filters.filterMonth ? Number(filters.filterMonth) : null;
    if (fy && orderDate.getFullYear() !== fy) return false;
    if (fm && orderDate.getMonth() + 1 !== fm) return false;
    return true;
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
    yearmonth:
      filters.filterYear || filters.filterMonth
        ? `${filters.filterYear ? `${filters.filterYear}년` : "연도전체"} ${filters.filterMonth ? `${filters.filterMonth}월` : "월전체"}`
        : "연·월 선택",
  };
  parts.push(dateLabelMap[filters.date]);

  const statusLabelMap: Record<LiveOrderFilters["status"], string> = {
    all: "상태 전체보기",
    unpaid: "입금대기",
    paid: "결제완료",
    manual_match_needed: "매칭필요",
    bank_paid: "입금확인",
    card_paid: "카드결제완료",
    card_unpaid: "카드미결제",
    canceled: "주문서취소",
    shipped: "출고완료",
  };
  parts.push(statusLabelMap[filters.status]);

  if (filters.keyword.trim()) parts.push(`검색: ${filters.keyword.trim()}`);

  return parts.join(" · ");
}

const MENU_KEYS_FOR_URL: AdminLiveMenuKey[] = [
  "broadcast",
  "products",
  "event",
  "point",
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
  const [activeMenu, setActiveMenu] = useState<AdminLiveMenuKey>(() => readMenuFromUrl());
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<any>(null);
  const [integrityRecentOnly, setIntegrityRecentOnly] = useState(true);
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  // [표시 전용] 금액 단독 추천(amount_only_suggestions). 읽기 전용 dry_run으로만 채우며 확정/쓰기 없음.
  const [paymentSuggestions, setPaymentSuggestions] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<AdminLiveBroadcast[]>([]);
  const [broadcastProductCount, setBroadcastProductCount] = useState<number | null>(null);
  const [shopOpen, setShopOpenState] = useState(true);
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("루루동이LIVE");
  const [broadcastYoutubeUrl, setBroadcastYoutubeUrl] = useState("");
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [manualMatchGroup, setManualMatchGroup] = useState<OrderGroup | null>(null);
  const [cardPayOrder, setCardPayOrder] = useState<LiveOrder | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [matchPanelOpen, setMatchPanelOpen] = useState(false);
  const [selectedOrderForMatch, setSelectedOrderForMatch] = useState<LiveOrder | null>(null);
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<LiveOrderFilters>(DEFAULT_FILTERS);
  const [broadcastEndSummary, setBroadcastEndSummary] = useState<LiveBroadcastEndSummary | null>(null);
  const [quickModal, setQuickModal] = useState<"orders" | "payments" | "customers" | "settlement" | null>(null);
  const [quickModalSearch, setQuickModalSearch] = useState("");
  const [quickModalPage, setQuickModalPage] = useState(1);
  const [quickModalCustomerDetail, setQuickModalCustomerDetail] = useState<any | null>(null);

  const [quickCustomerProfiles, setQuickCustomerProfiles] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;

    const loadQuickCustomerProfiles = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address")
        .limit(1000);

      if (!alive) return;

      if (error) {
        console.warn("[admin-live] quick customer profiles load failed", error.message);
        return;
      }

      setQuickCustomerProfiles(data || []);
    };

    void loadQuickCustomerProfiles();

    return () => {
      alive = false;
    };
  }, []);
  const [quickPointAmount, setQuickPointAmount] = useState("");
  const [quickPointMemo, setQuickPointMemo] = useState("");
  const [quickPointSaving, setQuickPointSaving] = useState<"add" | "subtract" | null>(null);
  const [quickPointMessage, setQuickPointMessage] = useState("");

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
      throw new Error(result?.message || "입금내역 조회에 실패했습니다.");
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

  const runIntegrityCheck = async () => {
    setIntegrityOpen(true);
    setIntegrityLoading(true);
    setIntegrityResult(null);
    try {
      const res = await fetch("/api/admin-v2/integrity-check", { method: "GET", cache: "no-store" });
      const data = await res.json();
      setIntegrityResult(data);
    } catch (e: any) {
      setIntegrityResult({ ok: false, error: e?.message || "점검 실패" });
    } finally {
      setIntegrityLoading(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    setLoadError("");

    // 전체보기 / 연·월 선택 / 키워드 검색 시 .range로 전체 로드. (키워드는 최근 500건 밖 주문도 검색해야 하므로)
    const needsFullLoad =
      filters.broadcast === "all" || filters.date === "yearmonth" || (filters.keyword?.trim() ?? "").length > 0;

    let data: any[] | null = null;
    let error: any = null;

    if (needsFullLoad) {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const page = await supabase
          .from("orders")
          .select("*")
          .neq("is_deleted", true)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (page.error) { error = page.error; break; }
        const rows = page.data || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      if (!error) data = all;
    } else {
      const res = await supabase
        .from("orders")
        .select("*")
        .neq("is_deleted", true)
        .order("created_at", { ascending: false })
        .limit(500);
      data = res.data;
      error = res.error;
    }

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

  // [읽기 전용] 금액 단독 추천을 dry_run(confirm 없음)으로 가져온다. DB 쓰기·자동확정 없음.
  // 실패(세션만료 등)하면 추천을 비워 칩이 그냥 안 보이게만 한다(안전 degrade).
  const loadPaymentSuggestions = async () => {
    try {
      const response = await fetch("/api/admin-v2/auto-payment-match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ source: "live_dashboard_suggest_display" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !Array.isArray(result.amount_only_suggestions)) {
        setPaymentSuggestions([]);
        return;
      }
      setPaymentSuggestions(result.amount_only_suggestions);
    } catch {
      setPaymentSuggestions([]);
    }
  };

  useAutoBankdaPaymentSync({
    enabled: true,
    onSynced: async (detail) => {
      await loadDepositsFromServer();
      // 주문목록은 실제로 입금매칭이 생겼을 때(successCount>0)만 갱신한다.
      // 매 폴링마다 무조건 loadOrders 하던 것이 "원치 않는 자동 새로고침"의 원인이었음.
      // 새 고객 주문은 아래 supabase realtime 구독이 즉시 반영한다.
      if (detail && detail.successCount > 0) {
        await loadOrders();
      }
    },
  });

  useEffect(() => {
    // 입금/주문 빠른보기를 열 때만 추천을 새로 불러와 표시용으로 쓴다(읽기 전용).
    if (quickModal === "payments" || quickModal === "orders") {
      void loadPaymentSuggestions();
    }
  }, [quickModal]);

  useEffect(() => {
    void loadOrders();
    void loadDepositsFromServer();
    void loadBroadcasts();

    // 화면 15초 자동 폴링 제거 — 화면 갱신은 BANKDA 입금확인(useAutoBankdaPaymentSync 훅의 onSynced)
    // + 동기화 이벤트(ruru-admin-live-auto-bankda-synced) + 수동 새로고침 버튼으로만 수행.
    // ※ BANKDA 입금확인 setInterval(useAutoBankdaPaymentSync.ts)은 그대로 유지 — 건드리지 않음.
    const handleAutoBankdaSynced = () => {
      if (!LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED) return;

      // 입금내역만 갱신. 주문목록은 onSynced(매칭 성공 시)+realtime 구독이 담당 → 매 폴링 새로고침 방지.
      void loadDepositsFromServer();
    };

    window.addEventListener("ruru-admin-live-auto-bankda-synced", handleAutoBankdaSynced);

    return () => {
      window.removeEventListener("ruru-admin-live-auto-bankda-synced", handleAutoBankdaSynced);
    };
  }, []);

  // 조회 범위 필터(전체보기/연·월) 전환 시 주문을 다시 불러온다(loadOrders가 그 시점 filters로 범위 결정).
  // 마운트 1회는 위 마운트 useEffect가 이미 loadOrders를 부르므로 스킵(중복 방지).
  const didMountOrdersScope = useRef(false);
  useEffect(() => {
    if (!didMountOrdersScope.current) {
      didMountOrdersScope.current = true;
      return;
    }
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.broadcast, filters.date]);

  // 실시간 주문 반영: orders INSERT/UPDATE 발생 시 주문목록을 재조회(디바운스 600ms로 연속 변경 묶음).
  // INSERT 시 즉시 알림 소리(720Hz beep). UPDATE는 소리 없이 재조회만.
  // 새 고객 주문/상태변경이 수동 새로고침 없이 즉시 화면에 뜨도록 한다. (BANKDA setInterval과 무관)
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void loadOrders();
      }, 600);
    };
    const playNewOrderTone = () => {
      try {
        if (window.localStorage.getItem("ruru_admin_sound_on") === "false") return;
        const AudioCtx =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 720;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.24);
        osc.onended = () => void ctx.close();
      } catch {
        /* 소리 실패 시 무시 */
      }
    };
    const channel = supabase
      .channel("ruru-admin-live-orders-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        playNewOrderTone();
        scheduleReload();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, scheduleReload)
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    replacePanelInUrl(activeMenu);
  }, [activeMenu]);

  useEffect(() => {
    const openQuickModal = (event: Event) => {
      const modalKey = String((event as CustomEvent).detail || "");

      if (
        modalKey !== "orders" &&
        modalKey !== "payments" &&
        modalKey !== "customers" &&
        modalKey !== "settlement"
      ) {
        return;
      }

      setQuickModal(modalKey);
    };

    window.addEventListener("ruru-admin-live-open-panel", openQuickModal);

    return () => {
      window.removeEventListener("ruru-admin-live-open-panel", openQuickModal);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const previewMode = url.searchParams.get("preview");

    if (previewMode !== "end-summary") return;

    setBroadcastEndSummary(buildLiveBroadcastEndPreviewSummary());
  }, []);

  const activeBroadcast = useMemo(() => getActiveBroadcast(broadcasts), [broadcasts]);

  // 처음 방송 데이터 로딩 후 1회: 방송 중이면 기본 필터를 현재 방송으로 맞춘다(라이브 표준).
  // 사용자가 이미 필터를 바꿨으면(=초기 상태가 아니면) 건드리지 않는다.
  const didInitBroadcastFilter = useRef(false);
  useEffect(() => {
    if (didInitBroadcastFilter.current) return;
    if (broadcasts.length === 0) return; // 방송 목록 로딩 전이면 대기
    didInitBroadcastFilter.current = true;
    if (activeBroadcast) {
      setFilters((prev) => (prev.broadcast === "all" ? { ...prev, broadcast: "current" } : prev));
    }
    // 방송 중이 아니면 기본값(all=전체/최근) 유지
  }, [broadcasts, activeBroadcast]);

  useEffect(() => {
    if (!activeBroadcast) return;
    setBroadcastTitle(activeBroadcast.public_title || "루루동이LIVE");
    setBroadcastYoutubeUrl(activeBroadcast.youtube_live_url || "");
  }, [activeBroadcast?.id]);

  // 등록/수정 폼 닫힘 → 상품관리 팝업 자동 복귀
  useEffect(() => {
    const reopenManage = () => setActiveMenu("products");
    window.addEventListener("ruru-reopen-product-manage", reopenManage);
    return () => window.removeEventListener("ruru-reopen-product-manage", reopenManage);
  }, []);

  // ＋새 방송(껍데기) 생성 → broadcasts 배열 갱신(방송시작 draft 분기가 즉시 인지하도록)
  useEffect(() => {
    const onBroadcastListUpdated = () => void loadBroadcasts();
    window.addEventListener("ruru-broadcast-list-updated", onBroadcastListUpdated);
    return () => window.removeEventListener("ruru-broadcast-list-updated", onBroadcastListUpdated);
  }, []);

  // 쇼핑몰 열기/닫기 상태 — 마운트 시 settings.shop_open 읽기(기본 열림)
  useEffect(() => {
    void getShopOpen().then(setShopOpenState);
  }, []);

  const handleToggleShopOpen = async () => {
    const next = !shopOpen;
    setShopOpenState(next); // 낙관적
    try {
      await setShopOpen(next);
    } catch {
      setShopOpenState(!next); // 실패 시 롤백
      showAdminToast("쇼핑몰 상태 저장에 실패했어요.", "error");
    }
  };

  // 컨트롤타워 "상품 N개" — 활성 방송의 broadcast_products 연결 개수(읽기 전용 count)
  const loadBroadcastProductCount = async () => {
    if (!activeBroadcast?.id) {
      setBroadcastProductCount(null);
      return;
    }
    const { count, error } = await supabase
      .from("broadcast_products")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", activeBroadcast.id);
    if (error) return;
    setBroadcastProductCount(count ?? 0);
  };

  useEffect(() => {
    void loadBroadcastProductCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBroadcast?.id]);

  // 상품 담기/빼기/순서 변경(ruru-live-product-updated) → 개수 즉시 갱신
  useEffect(() => {
    const onProductUpdated = () => void loadBroadcastProductCount();
    window.addEventListener("ruru-live-product-updated", onProductUpdated);
    return () => window.removeEventListener("ruru-live-product-updated", onProductUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBroadcast?.id]);

  const broadcastOptions = useMemo(() => {
    const todayDateKey = getAlwaysOrderDateKey(new Date().toISOString());
    const alwaysOptions = buildAlwaysOrderOptions(orders as any[], todayDateKey);

    // 계단식: 선택된 기간(filters.date) 안에 시작된 방송만 노출. "전체(all)"면 모두.
    const broadcastInPeriod = (broadcast: AdminLiveBroadcast) => {
      if (filters.date === "all") return true;
      const baseDate = broadcast.started_at || broadcast.created_at || null;
      if (!baseDate) return true; // 날짜 없으면 일단 노출(누락 방지)
      // matchesDate는 order.createdAt 기준으로 기간을 판정하므로, 방송 시작일을 createdAt 자리에 넣어 동일 판정 재활용
      return matchesDate({ createdAt: baseDate } as LiveOrder, filters);
    };

    const visibleBroadcasts = broadcasts.filter(broadcastInPeriod);

    const options = visibleBroadcasts.map((broadcast) => ({
      value: broadcast.id,
      label: `방송: ${formatBroadcastDisplayTitle(broadcast)}`,
    }));

    const mergedOptions = [...alwaysOptions, ...options];

    return activeBroadcast
      ? [{ value: "current", label: "현재 방송" }, ...mergedOptions]
      : mergedOptions;
  }, [broadcasts, activeBroadcast, orders, filters.date, filters.filterYear, filters.filterMonth, filters.customStartDate, filters.customEndDate]);

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
    // 우측 입금매칭 패널을 해당 주문 매칭모드로 연다.
    setOrderDetailOpen(false);
    setSelectedOrderForMatch(order);
    setMatchPanelOpen(true);
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
      // 준비된 OFF 껍데기(started_at 없음)가 있으면 그걸 켠다(새 row 안 만듦). 없으면 기존대로 새 방송 생성.
      const draft = broadcasts
        .filter(
          (b) =>
            String(b.status || "").toUpperCase() === "OFF" &&
            !b.started_at &&
            b.is_deleted !== true,
        )
        .sort((a, b) => String(b.created_at || b.id).localeCompare(String(a.created_at || a.id)))[0];

      if (draft) {
        await activateBroadcast(draft.id);
      } else {
        await startAdminLiveBroadcast(input);
      }
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

  const formatQuickMoney = (value: unknown) => {
    const numberValue = Number(value ?? 0);

    if (!Number.isFinite(numberValue)) {
      return "0원";
    }

    return `${numberValue.toLocaleString("ko-KR")}원`;
  };

  const getQuickText = (item: unknown, keys: string[], fallback = "-") => {
    const record = item as Record<string, unknown>;

    for (const key of keys) {
      const value = record[key];

      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value);
      }
    }

    return fallback;
  };

  const getQuickMoneyValue = (item: unknown, keys: string[]) => {
    const record = item as Record<string, unknown>;

    for (const key of keys) {
      const value = record[key];

      if (value !== undefined && value !== null && value !== "") {
        const numberValue = Number(value);

        if (Number.isFinite(numberValue)) {
          return numberValue;
        }
      }
    }

    return 0;
  };


  const quickCustomerProfileAddressByPhone = useMemo(() => {
    const normalizePhone = (value: unknown) => {
      const digits = String(value || "").replace(/\D/g, "");
      if (digits.length === 10 && digits.startsWith("10")) return `0${digits}`;
      return digits;
    };

    const map = new Map<string, string>();

    quickCustomerProfiles.forEach((profile) => {
      const phone = normalizePhone(profile?.customer_phone);
      const address = [profile?.zipcode, profile?.address, profile?.detail_address]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (phone && address) {
        map.set(phone, address);
      }
    });

    return map;
  }, [quickCustomerProfiles]);

  const getQuickCustomerProfileAddress = (phoneValue: unknown) => {
    const digits = String(phoneValue || "").replace(/\D/g, "");
    const phone = digits.length === 10 && digits.startsWith("10") ? `0${digits}` : digits;

    return phone ? quickCustomerProfileAddressByPhone.get(phone) || "" : "";
  };

  const quickOrderRows = filteredOrders.slice(0, 8);
  const quickDepositRows = deposits.slice(0, 8);
  const quickCustomerRows = Array.from(
    new Map(
      orders.map((order) => [
        getQuickText(order, ["customer_phone", "phone", "buyer_phone", "receiver_phone", "customer_nickname", "nickname"], ""),
        order,
      ])
    ).values()
  )
    .filter((order) => Boolean(getQuickText(order, ["customer_nickname", "nickname", "customer_name", "name"], "")))
    .slice(0, 8);

  const quickPaidOrders = filteredOrders.filter((order) => {
    const status = getQuickText(order, ["payment_status", "deposit_status", "status", "paymentStatus"], "");

    return status.includes("완료") || status.includes("확인");
  });

  const quickUnpaidOrders = filteredOrders.filter((order) => {
    const status = getQuickText(order, ["payment_status", "deposit_status", "status", "paymentStatus"], "");

    return status.includes("미입금") || status.includes("대기") || status.includes("미결제");
  });

  const quickCanceledOrders = filteredOrders.filter((order) => {
    const status = getQuickText(order, ["order_status", "status", "payment_status"], "");

    return status.includes("취소");
  });

  const quickSettlementTotal = quickPaidOrders.reduce(
    (sum, order) =>
      sum +
      getQuickMoneyValue(order, [
        "paid_amount",
        "payment_amount",
        "total_amount",
        "final_amount",
        "order_total",
        "product_total",
      ]),
    0
  );

  const quickModalTitle =
    quickModal === "orders"
      ? "주문 빠른보기"
      : quickModal === "payments"
      ? "입금 빠른보기"
      : quickModal === "customers"
      ? "고객 빠른보기"
      : quickModal === "settlement"
      ? "정산 빠른보기"
      : "";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950" data-ruru-controltower-shell="broadcast-quick-modal-sidebar-dock-v2">
      <div className="flex min-h-screen">
        <AdminLiveSidebar
          activeMenu={activeMenu}
          onMenuChange={(nextMenu) => {
            setActiveMenu(nextMenu);
            replacePanelInUrl(nextMenu);
          }}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-4">
          {/* 방송화면 항상 렌더 (배경) */}
          <div className={activeMenu !== "broadcast" ? "pointer-events-none" : ""}>
            <LiveHeader
              activeBroadcast={activeBroadcast}
              savingBroadcast={savingBroadcast}
              videoRatio={videoRatio}
              onVideoRatioChange={setVideoRatio}
              onStartBroadcast={startBroadcast}
              onEndBroadcast={endBroadcast}
              onSaveBroadcast={saveBroadcast}
              title={broadcastTitle}
              onTitleChange={setBroadcastTitle}
              youtubeUrl={broadcastYoutubeUrl}
              onYoutubeUrlChange={setBroadcastYoutubeUrl}
              productCount={broadcastProductCount ?? undefined}
              shopOpen={shopOpen}
              onToggleShopOpen={handleToggleShopOpen}
            />

            <div className="mb-4 mt-4 h-[420px] w-full min-h-0 [&>*]:h-full [&>*]:min-h-0 [&>*>*]:h-full [&>*>*]:min-h-0">
              <LiveBroadcastPanels videoRatio={videoRatio} youtubeUrl={activeBroadcast?.youtube_live_url || ""} activeBroadcastId={activeBroadcast?.id || null} />
            </div>

            {loadError ? (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
                주문 데이터 불러오기 실패: {loadError}
              </div>
            ) : null}

            <LiveStatsCards orders={filteredOrders} criteriaLabel={criteriaLabel} />

            {/* 주문 영역 서브탭(시안 ①): 각 탭은 기존 팝업/드로어 트리거에 연결 (딥로즈) */}
            <div className="mt-2 flex items-center gap-1.5 border-b border-rose-line">
              {[
                { key: "live", label: "실시간 주문", onClick: () => setActiveMenu("broadcast") },
                { key: "payments", label: "입금 내역", onClick: () => setActiveMenu("payments") },
                { key: "match", label: "입금 매칭", onClick: () => setMatchPanelOpen((v) => !v) },
              ].map((tab) => {
                const active =
                  (tab.key === "live" && activeMenu !== "orders" && activeMenu !== "payments") ||
                  (tab.key === "payments" && activeMenu === "payments") ||
                  (tab.key === "match" && matchPanelOpen);
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={tab.onClick}
                    className={[
                      "-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-[13px] font-black transition",
                      active
                        ? "border-rose-deep bg-rose-soft/60 text-rose-deep"
                        : "border-transparent text-slate-500 hover:bg-rose-soft hover:text-rose-deep",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => void runIntegrityCheck()}
                title="정합성 점검"
                className="ml-auto mb-1 mr-1.5 rounded-lg border border-rose-line px-2.5 py-1.5 text-xs font-black text-rose-deep transition hover:bg-rose-soft"
              >
                🛡️ 점검
              </button>
            </div>

            {/* 목업 B 2-col: 왼쪽 주문 테이블 / 오른쪽 380px 주문상세 사이드 패널(닉네임 클릭 시 슬라이드인) */}
            <section className="mt-2 flex items-start gap-3">
              <div className="min-w-0 flex-1 sticky top-0 self-start">
                <LiveOrderTable
                  orders={filteredOrders}
                  allOrderCount={orders.length}
                  selectedOrderId={selectedOrder?.id || ""}
                  loading={loading}
                  filters={filters}
                  broadcastOptions={broadcastOptions}
                  broadcastStartedAt={activeBroadcast?.started_at || activeBroadcast?.created_at || null}
                  onSelectOrder={(order) => {
                    setSelectedOrderId(order.id);
                    setOrderDetailOpen(true);
                  }}
                  onFiltersChange={setFilters}
                  onRefresh={loadOrders}
                  onOpenManualMatch={openManualMatchForOrder}
                  onOpenCardPay={setCardPayOrder}
                  deposits={deposits}
                  onMatched={refreshAfterManualMatch}
                  onSelectForMatch={(order) => { setSelectedOrderForMatch(order); setMatchPanelOpen(true); }}
                />
              </div>

              {/* 우측 사이드 패널: 입금매칭(목업 C) 우선, 없으면 주문상세(목업 B) */}
              {matchPanelOpen ? (
                <div
                  className="sticky top-0 w-[380px] shrink-0 min-h-[1000px] max-h-[1000px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
                  style={{ animation: "ruruSidePanelIn 0.22s ease" }}
                >
                  <LiveFloatingMatchPanel
                    deposits={deposits}
                    orders={filteredOrders}
                    onClose={() => { setMatchPanelOpen(false); setSelectedOrderForMatch(null); }}
                    onMatched={refreshAfterManualMatch}
                    onSearchFilter={(keyword) => setFilters((prev) => ({ ...prev, keyword }))}
                    selectedOrderForMatch={selectedOrderForMatch}
                    onClearSelectedOrder={() => setSelectedOrderForMatch(null)}
                  />
                </div>
              ) : selectedOrder && orderDetailOpen ? (
                <div
                  className="sticky top-0 w-[380px] shrink-0 min-h-[1000px] max-h-[1000px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
                  style={{ animation: "ruruSidePanelIn 0.22s ease" }}
                >
                  <LiveOrderDetailDrawer
                    order={selectedOrder}
                    onOpenManualMatch={openManualMatchForOrder}
                    onClose={closeOrderDetail}
                    onAfterStatusChange={loadOrders}
                  />
                </div>
              ) : null}
            </section>
            <style>{`@keyframes ruruSidePanelIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }`}</style>
          </div>

          {/* 입금확인 팝업 */}
          {activeMenu === "payments" && (
            <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 px-4 py-8" onClick={(e) => { if (e.target === e.currentTarget) setActiveMenu("broadcast"); }}>
              <div className="mx-auto w-full max-w-[1100px] rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
                  <span className="text-[15px] font-black text-slate-950">💳 입금내역</span>
                  <button type="button" onClick={() => setActiveMenu("broadcast")} className="text-lg leading-none text-slate-400 hover:text-slate-700">✕</button>
                </div>
                <div className="p-5">
                  <AdminLivePaymentPanel
                    deposits={deposits}
                    orderGroups={orderGroups}
                    onRefresh={loadDepositsFromServer}
                    onBankdaSync={syncBankdaDepositsOnly}
                    onOpenManualMatch={setManualMatchGroup}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 상품 관리 (자체 모달) */}
          {activeMenu === "products" && (
            <AdminLiveProductManagePopup
              activeBroadcastId={activeBroadcast?.id || null}
              onClose={() => setActiveMenu("broadcast")}
            />
          )}

          {/* 카드결제 복사창 (카드미결제 배지 → 페이스터) */}
          {cardPayOrder && (
            <AdminLiveCardPayPopup
              order={cardPayOrder}
              onClose={() => setCardPayOrder(null)}
              onAfterStatusChange={loadOrders}
            />
          )}

          {/* 이벤트 (항상 마운트 → 상태유지, 사이드바 이벤트 메뉴로 열고닫음) */}
          <AdminLiveEventRoulettePanel
            renderTrigger={false}
            controlledOpen={activeMenu === "event"}
            onRequestClose={() => setActiveMenu("broadcast")}
            activeBroadcastId={activeBroadcast?.id || null}
          />

          {/* 고객관리 (자체 모달) */}
          {activeMenu === "customers" && (
            <AdminLiveCustomersPanel orders={orders} onClose={() => setActiveMenu("broadcast")} />
          )}

          {/* 정산통계 팝업 */}
          {activeMenu === "settlement" && (
            <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 px-4 py-8" onClick={(e) => { if (e.target === e.currentTarget) setActiveMenu("broadcast"); }}>
              <div className="mx-auto w-full max-w-[1100px] rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
                  <span className="text-[15px] font-black text-slate-950">🧮 정산</span>
                  <button type="button" onClick={() => setActiveMenu("broadcast")} className="text-lg leading-none text-slate-400 hover:text-slate-700">✕</button>
                </div>
                <div className="p-5">
                  <AdminLiveSettlementPanel orders={orders} />
                </div>
              </div>
            </div>
          )}

          {/* 설정 팝업 */}
          {activeMenu === "settings" && (
            <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 px-4 py-8" onClick={(e) => { if (e.target === e.currentTarget) setActiveMenu("broadcast"); }}>
              <div className="mx-auto w-full max-w-[700px] rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
                  <span className="text-[15px] font-black text-slate-950">⚙ 설정</span>
                  <button type="button" onClick={() => setActiveMenu("broadcast")} className="text-lg leading-none text-slate-400 hover:text-slate-700">✕</button>
                </div>
                <div className="p-5">
                  <AdminLiveSettingsPanel />
                </div>
              </div>
            </div>
          )}

          {/* 알 수 없는 메뉴 */}
          {activeMenu !== "broadcast" && activeMenu !== "products" && activeMenu !== "event" && activeMenu !== "orders" && activeMenu !== "payments" && activeMenu !== "customers" && activeMenu !== "settlement" && activeMenu !== "settings" && (
            <AdminLiveMenuPlaceholder menuKey={activeMenu} />
          )}

          {/* 주문상세는 위 2-col 사이드 패널로 이동(목업 B). 기존 fixed 렌더 제거. */}

          <ManualPaymentMatchDrawer
            group={manualMatchGroup}
            deposits={deposits}
            onClose={() => setManualMatchGroup(null)}
            onMatched={refreshAfterManualMatch}
          />

          {/* 입금매칭은 위 2-col 우측 사이드 패널로 이동(목업 C). */}

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

          {quickModal
              ? (() => {
                  const modalOrders = Array.isArray(filteredOrders) ? filteredOrders : [];
                  const modalAllOrders = Array.isArray(orders) ? orders : [];
                  const modalDeposits = Array.isArray(deposits) ? deposits : [];

                  const toNumber = (value: unknown) => {
                    if (value === null || value === undefined || value === "") return 0;
                    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
                    const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
                    return Number.isFinite(parsed) ? parsed : 0;
                  };

                  const money = (value: unknown) => `${toNumber(value).toLocaleString("ko-KR")}원`;
                  const textValue = (value: unknown) => String(value ?? "").toLowerCase();

                  const orderNickname = (order: any) =>
                    String(order?.nickname || order?.customer_nickname || order?.youtube_nickname || order?.buyer_nickname || "-");

                  const orderName = (order: any) =>
                    String(order?.customer_name || order?.name || order?.buyer_name || order?.receiver_name || "");

                  const orderPhone = (order: any) =>
                    String(order?.phone || order?.customer_phone || order?.buyer_phone || order?.receiver_phone || "");

                  const orderAddress = (order: any) =>
                    String(order?.address || order?.customer_address || order?.receiver_address || order?.shipping_address || "");

                  const orderCreatedAt = (order: any) =>
                    String(order?.created_at || order?.submitted_at || order?.order_time || order?.ordered_at || "");

                  const orderMemo = (order: any) =>
                    String(
                      order?.order_summary ||
                        order?.items_summary ||
                        order?.order_memo ||
                        order?.memo ||
                        order?.product_name ||
                        order?.order_items_text ||
                        order?.order_text ||
                        "주문내역 확인 필요",
                    );

                  const orderItemsAmount = (order: any) => {
                    const items = Array.isArray(order?.items)
                      ? order.items
                      : Array.isArray(order?.order_items)
                        ? order.order_items
                        : Array.isArray(order?.products)
                          ? order.products
                          : [];
                    return items.reduce((sum: number, item: any) => {
                      const quantity = toNumber(item?.quantity ?? item?.qty ?? item?.count ?? 1) || 1;
                      const price = toNumber(
                        item?.final_price ??
                          item?.adjusted_product_price ??
                          item?.product_price ??
                          item?.price ??
                          item?.unit_price ??
                          item?.amount,
                      );
                      return sum + price * quantity;
                    }, 0);
                  };

                  const orderAmount = (order: any) => {
                    const direct = toNumber(
                      order?.final_amount ??
                        order?.total_amount ??
                        order?.order_total_amount ??
                        order?.total_order_amount ??
                        order?.total_product_amount ??
                        order?.order_amount ??
                        order?.paid_amount ??
                        order?.payment_amount ??
                        order?.product_total ??
                        order?.product_amount ??
                        order?.adjusted_product_price ??
                        order?.product_price ??
                        order?.amount ??
                        order?.price,
                    );
                    if (direct > 0) return direct;
                    return orderItemsAmount(order);
                  };

                  const collectStatusText = (value: any, depth = 0): string => {
                    if (value === null || value === undefined || depth > 4) return "";
                    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
                    if (Array.isArray(value)) return value.map((item) => collectStatusText(item, depth + 1)).join(" ");
                    if (typeof value === "object") {
                      return Object.entries(value)
                        .filter(([key]) => {
                          const lowerKey = key.toLowerCase();
                          return (
                            lowerKey.includes("status") ||
                            lowerKey.includes("cancel") ||
                            lowerKey.includes("badge") ||
                            lowerKey.includes("label") ||
                            lowerKey.includes("payment") ||
                            lowerKey.includes("deposit") ||
                            lowerKey.includes("state") ||
                            lowerKey.includes("reason") ||
                            lowerKey.includes("type") ||
                            lowerKey.includes("memo")
                          );
                        })
                        .map(([, nested]) => collectStatusText(nested, depth + 1))
                        .join(" ");
                    }
                    return "";
                  };

                  const paymentText = (order: any) =>
                    String(order?.payment_status || order?.deposit_status || order?.paymentStatus || order?.depositStatus || order?.payment_status_label || order?.status || order?.order_status || "");

                  const orderStatusText = (order: any) =>
                    [
                      order?.order_status,
                      order?.orderStatus,
                      order?.status,
                      order?.status_label,
                      order?.statusLabel,
                      order?.order_status_label,
                      order?.orderStatusLabel,
                      order?.paymentStatus,
                      order?.depositStatus,
                      order?.cancel_status,
                      order?.cancelStatus,
                      collectStatusText(order),
                    ]
                      .map((value) => String(value || ""))
                      .join(" ");

                  const isCanceledOrder = (order: any) => {
                    const status = orderStatusText(order).toLowerCase().replace(/\s+/g, " ");

                    return (
                      order?.is_canceled === true ||
                      order?.isCanceled === true ||
                      order?.is_cancelled === true ||
                      order?.isCancelled === true ||
                      order?.cancelled === true ||
                      order?.canceled === true ||
                      Boolean(order?.cancelled_at || order?.canceled_at || order?.cancelAt || order?.canceledAt) ||
                      status.includes("주문취소") ||
                      status.includes("취소") ||
                      status.includes("취소완료") ||
                      status.includes("cancel") ||
                      status.includes("cancelled") ||
                      status.includes("canceled") ||
                      status.includes("refund") ||
                      status.includes("refunded")
                    );
                  };

                  const isPaidOrder = (order: any) => {
                    if (isCanceledOrder(order)) return false;
                    const text = `${paymentText(order)} ${orderStatusText(order)}`;
                    return (
                      text.includes("입금확인") ||
                      text.includes("결제완료") ||
                      text.includes("수동입금확인") ||
                      text.includes("자동입금확인") ||
                      text.includes("manual_paid") ||
                      text.includes("auto_paid") ||
                      text.includes("paid") ||
                      text.includes("PAID")
                    );
                  };

                  const depositAmount = (deposit: any) =>
                    toNumber(deposit?.amount ?? deposit?.deposit_amount ?? deposit?.in_amount ?? deposit?.money ?? 0);

                  const depositName = (deposit: any) =>
                    String(deposit?.depositor_name || deposit?.name || deposit?.sender_name || deposit?.deposit_name || deposit?.account_holder || "-");

                  const formatQuickModalDateTime = (value: unknown) => {
                    const raw = String(value || "").trim();
                    if (!raw) return "-";

                    const parsed = new Date(raw);
                    if (!Number.isNaN(parsed.getTime())) {
                      const parts = new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).formatToParts(parsed);

                      const getPart = (type: string) => parts.find((part) => part.type === type)?.value || "";
                      return `${getPart("year")}.${getPart("month")}.${getPart("day")}(${getPart("weekday")}) ${getPart("hour")}:${getPart("minute")}`;
                    }

                    const cleaned = raw
                      .replace("T", " ")
                      .replace(/\.\d+/, "")
                      .replace(/\+00:00$/, "")
                      .replace(/Z$/, "");

                    return cleaned.slice(0, 16);
                  };

                  const depositTime = (deposit: any) =>
                    String(deposit?.deposited_at || deposit?.deposit_time || deposit?.created_at || deposit?.transaction_at || deposit?.date || "");

                  const depositTimeText = (deposit: any) => formatQuickModalDateTime(depositTime(deposit));

                  const modalSearch = quickModalSearch.trim().toLowerCase();
                  const rowPerPage = 7;

                  const filterBySearch = <T,>(rows: T[], picker: (row: T) => string) =>
                    modalSearch ? rows.filter((row) => picker(row).toLowerCase().includes(modalSearch)) : rows;

                  const customerMap = new Map<string, { key: string; nickname: string; name: string; phone: string; address: string; count: number; activeCount: number; cancelCount: number; amount: number; latestOrder: any; latestAt: string }>();
                  modalAllOrders.forEach((order: any) => {
                    const nickname = orderNickname(order);
                    const phone = orderPhone(order);
                    const key = `${nickname}-${phone || orderName(order)}`;
                    const canceled = isCanceledOrder(order);
                    const profileAddress = getQuickCustomerProfileAddress(phone);
                    const current = customerMap.get(key) || {
                      key,
                      nickname,
                      name: orderName(order),
                      phone,
                      address: profileAddress || orderAddress(order),
                      count: 0,
                      activeCount: 0,
                      cancelCount: 0,
                      amount: 0,
                      latestOrder: order,
                      latestAt: orderCreatedAt(order),
                    };
                    current.count += 1;
                    current.activeCount += canceled ? 0 : 1;
                    current.cancelCount += canceled ? 1 : 0;
                    current.amount += canceled ? 0 : orderAmount(order);
                    current.latestOrder = order;
                    current.latestAt = orderCreatedAt(order) || current.latestAt;
                    current.address = profileAddress || current.address || orderAddress(order);
                    customerMap.set(key, current);
                  });

                  const unpaidOrders = modalAllOrders.filter((order: any) => !isPaidOrder(order) && !isCanceledOrder(order));
                  const canceledOrders = modalAllOrders.filter((order: any) => isCanceledOrder(order));
                  const paidOrders = modalAllOrders.filter((order: any) => isPaidOrder(order) && !isCanceledOrder(order));

                  const orderRows = filterBySearch(modalOrders, (order: any) =>
                    [orderNickname(order), orderName(order), orderPhone(order), orderMemo(order), paymentText(order), orderStatusText(order), money(orderAmount(order))].join(" "),
                  );

                  const activePeriodOrderAmount = orderRows.reduce((sum: number, order: any) => sum + (isCanceledOrder(order) ? 0 : orderAmount(order)), 0);
                  const totalOrderAmount = modalAllOrders.reduce((sum: number, order: any) => sum + (isCanceledOrder(order) ? 0 : orderAmount(order)), 0);
                  const paidOrderAmount = paidOrders.reduce((sum: number, order: any) => sum + orderAmount(order), 0);
                  const unpaidOrderAmount = unpaidOrders.reduce((sum: number, order: any) => sum + orderAmount(order), 0);
                  const recentDepositAmount = modalDeposits.slice(0, 20).reduce((sum: number, deposit: any) => sum + depositAmount(deposit), 0);

                  const depositRows = filterBySearch(modalDeposits, (deposit: any) =>
                    [depositName(deposit), depositTime(deposit), money(depositAmount(deposit)), textValue(deposit?.status)].join(" "),
                  );

                  const customerRows = filterBySearch(Array.from(customerMap.values()), (customer) =>
                    [customer.nickname, customer.name, customer.phone, customer.address, `${customer.count}`, `${customer.cancelCount}`, money(customer.amount)].join(" "),
                  );

                  const totalRows =
                    quickModal === "orders"
                      ? orderRows.length
                      : quickModal === "payments"
                        ? depositRows.length
                        : quickModal === "customers"
                          ? customerRows.length
                          : 0;

                  const totalPages = quickModal === "settlement" ? 1 : Math.max(1, Math.ceil(totalRows / rowPerPage));
                  const activePage = Math.min(Math.max(quickModalPage, 1), totalPages);
                  const pageStart = (activePage - 1) * rowPerPage;
                  const pageEnd = pageStart + rowPerPage;
                  const pagedOrders = orderRows.slice(pageStart, pageEnd);
                  const pagedDeposits = depositRows.slice(pageStart, pageEnd);
                  const pagedCustomers = customerRows.slice(pageStart, pageEnd);

                  const pageNumbers = (() => {
                    const count = Math.min(7, totalPages);
                    const start = Math.max(1, Math.min(activePage - 3, totalPages - count + 1));
                    return Array.from({ length: count }, (_, index) => start + index);
                  })();

                  const modalTitle =
                    quickModal === "orders"
                      ? "주문 빠른보기"
                      : quickModal === "payments"
                        ? "입금 빠른보기"
                        : quickModal === "customers"
                          ? quickModalCustomerDetail
                            ? "고객상세"
                            : "고객 빠른보기"
                          : "정산 빠른보기";

                  const resetQuickModal = () => {
                    setQuickModal(null);
                    setQuickModalPage(1);
                    setQuickModalSearch("");
                    setQuickModalCustomerDetail(null);
                    setQuickPointAmount("");
                    setQuickPointMemo("");
                    setQuickPointSaving(null);
                    setQuickPointMessage("");
                  };

                  const goPanel = (panel: "orders" | "payments" | "customers" | "settlement") => {
                    resetQuickModal();
                    setActiveMenu(panel);
                    replacePanelInUrl(panel);
                  };

                  const openOrderDetail = (order: any) => {
                    const orderId = String(order?.id || "");
                    if (!orderId) return;
                    resetQuickModal();
                    setSelectedOrderId(orderId);
                    setOrderDetailOpen(true);
                  };

                  const openCustomerDetail = (customer: { latestOrder: any; nickname: string; name: string; phone: string; address: string; count: number; activeCount: number; cancelCount: number; amount: number; latestAt: string }) => {
                    setQuickModalCustomerDetail(customer);
                    setQuickModalPage(1);
                    setQuickModalSearch("");
                  };

                  const customerDetailOrders = quickModalCustomerDetail
                    ? modalAllOrders.filter((order: any) => {
                        const sameNickname = orderNickname(order) === quickModalCustomerDetail.nickname;
                        const samePhone = !quickModalCustomerDetail.phone || orderPhone(order) === quickModalCustomerDetail.phone;
                        return sameNickname && samePhone;
                      })
                    : [];

                  const customerDetailAmount = customerDetailOrders.reduce((sum: number, order: any) => sum + (isCanceledOrder(order) ? 0 : orderAmount(order)), 0);
                  const customerDetailCanceledCount = customerDetailOrders.filter((order: any) => isCanceledOrder(order)).length;
                  const customerDetailActiveCount = customerDetailOrders.length - customerDetailCanceledCount;

                  const renderPagination = () => {
                    if (quickModal === "settlement" || totalPages <= 1 || quickModalCustomerDetail) return null;

                    return (
                      <div className="mt-4 flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={activePage <= 1}
                          onClick={() => setQuickModalPage(Math.max(1, activePage - 1))}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-500 disabled:opacity-40"
                        >
                          이전
                        </button>
                        {pageNumbers.map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setQuickModalPage(page)}
                            className={[
                              "h-9 min-w-9 rounded-xl px-3 text-xs font-black",
                              page === activePage ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-600",
                            ].join(" ")}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={activePage >= totalPages}
                          onClick={() => setQuickModalPage(Math.min(totalPages, activePage + 1))}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-500 disabled:opacity-40"
                        >
                          다음
                        </button>
                      </div>
                    );
                  };

                  const openManualMatchAndClose = (order: any) => {
                    resetQuickModal();
                    openManualMatchForOrder(order as any);
                  };

                  const renderStatusBadge = (order: any) => {
                    const canceled = isCanceledOrder(order);
                    const paid = isPaidOrder(order);

                    const label = canceled ? "주문서취소" : paid ? "입금확인" : "매칭필요";
                    const klass = canceled
                      ? "bg-red-50 text-red-600"
                      : paid
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700";

                    return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${klass}`}>{label}</span>;
                  };

                  const submitQuickPoint = async (mode: "add" | "subtract") => {
                    if (!quickModalCustomerDetail || quickPointSaving) return;

                    const amount = toNumber(quickPointAmount);
                    if (amount <= 0) {
                      setQuickPointMessage("포인트 금액을 1원 이상 입력해주세요.");
                      return;
                    }

                    const signedAmount = mode === "add" ? amount : -amount;
                    const memo = quickPointMemo.trim() || (mode === "add" ? "방송 중 빠른보기 포인트 지급" : "방송 중 빠른보기 포인트 회수");

                    setQuickPointSaving(mode);
                    setQuickPointMessage("");

                    try {
                      const response = await fetch("/api/admin-live/customer-points", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: mode === "add" ? "grant" : "deduct",
                          type: mode === "add" ? "grant" : "deduct",
                          mode,
                          kind: mode,
                          direction: mode,
                          amount,
                          point: amount,
                          points: amount,
                          point_amount: amount,
                          delta: signedAmount,
                          point_delta: signedAmount,
                          change_amount: signedAmount,
                          customer_id: quickModalCustomerDetail.customer_id || quickModalCustomerDetail.customerId || quickModalCustomerDetail.id || undefined,
                          customerId: quickModalCustomerDetail.customer_id || quickModalCustomerDetail.customerId || quickModalCustomerDetail.id || undefined,
                          nickname: quickModalCustomerDetail.nickname,
                          customer_nickname: quickModalCustomerDetail.nickname,
                          phone: quickModalCustomerDetail.phone,
                          customer_phone: quickModalCustomerDetail.phone,
                          name: quickModalCustomerDetail.name,
                          customer_name: quickModalCustomerDetail.name,
                          memo,
                          reason: memo,
                          note: memo,
                        }),
                      });

                      const result = await response.json().catch(() => null);
                      if (!response.ok || result?.ok === false || result?.success === false) {
                        throw new Error(result?.message || result?.error || "포인트 처리에 실패했습니다.");
                      }

                      setQuickPointMessage(`포인트 ${mode === "add" ? "지급" : "회수"} 완료: ${money(amount)}`);
                      setQuickPointAmount("");
                      setQuickPointMemo("");
                    } catch (error) {
                      setQuickPointMessage(error instanceof Error ? error.message : "포인트 처리 중 오류가 발생했습니다.");
                    } finally {
                      setQuickPointSaving(null);
                    }
                  };

                  return (
                    <div
                      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-4"
                      data-ruru-quick-modal="mini"
                    >
                      <div className="flex h-[90vh] max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
                        <div className="shrink-0 border-b border-slate-100 px-6 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-[10px] font-black tracking-[0.34em] text-rose-deep">
                                {quickModalCustomerDetail ? "CUSTOMER DETAIL" : "QUICK MODAL"}
                              </div>
                              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{modalTitle}</h2>
                            </div>
                            <button type="button" onClick={resetQuickModal} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
                              닫기
                            </button>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
                          {quickModal === "customers" && quickModalCustomerDetail ? (
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-black tracking-[0.3em] text-rose-deep">CUSTOMER DETAIL</div>
                                    <h3 className="mt-2 text-3xl font-black text-slate-950">{quickModalCustomerDetail.nickname}</h3>
                                    <p className="mt-2 text-sm font-black text-slate-500">
                                      {quickModalCustomerDetail.name || "이름 확인 필요"} · {quickModalCustomerDetail.phone || "전화번호 확인 필요"}
                                    </p>
                                    {quickModalCustomerDetail.address ? (
                                      <p className="mt-2 text-sm font-bold text-slate-500">📍 {quickModalCustomerDetail.address}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setQuickModalCustomerDetail(null)}
                                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                                    >
                                      목록으로
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => goPanel("customers")}
                                      className="rounded-xl bg-rose-deep px-4 py-2 text-xs font-black text-white"
                                    >
                                      고객관리
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="text-xs font-black text-slate-500">고객상태</div>
                                  <div className="mt-2 text-3xl font-black text-slate-950">정상</div>
                                  <div className="mt-2 text-xs font-bold text-slate-400">차단 정보는 고객관리에서 확인</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="text-xs font-black text-slate-500">총 주문수</div>
                                  <div className="mt-2 text-3xl font-black text-slate-950">{customerDetailOrders.length}건</div>
                                  <div className="mt-2 text-xs font-bold text-slate-400">정상 {customerDetailActiveCount}건 · 취소 {customerDetailCanceledCount}건</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="text-xs font-black text-slate-500">누적구매금액</div>
                                  <div className="mt-2 text-3xl font-black text-rose-deep">{money(customerDetailAmount)}</div>
                                  <div className="mt-2 text-xs font-bold text-slate-400">취소 주문 제외 표시</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="text-xs font-black text-slate-500">최근주문</div>
                                  <div className="mt-2 text-xl font-black text-slate-950">{quickModalCustomerDetail.latestAt || "확인 필요"}</div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-rose-line bg-white p-5 shadow-sm">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                  <div>
                                    <h3 className="text-lg font-black text-slate-950">🎁 포인트 관리</h3>
                                    <p className="mt-1 text-xs font-bold text-slate-500">고객관리로 이동하지 않고 이 창에서 바로 지급/회수합니다.</p>
                                  </div>
                                  <span className="rounded-full bg-rose-soft px-3 py-1 text-xs font-black text-rose-deep">모달 안 처리</span>
                                </div>

                                <div className="grid gap-3">
                                  <label className="block">
                                    <span className="text-xs font-black text-slate-500">포인트 금액</span>
                                    <input
                                      value={quickPointAmount}
                                      onChange={(event) => {
                                        const digits = event.target.value.replace(/[^0-9]/g, "");
                                        setQuickPointAmount(digits ? Number(digits).toLocaleString("ko-KR") : "");
                                        setQuickPointMessage("");
                                      }}
                                      placeholder="예: 10,000"
                                      inputMode="numeric"
                                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none focus:border-blue-300 focus:bg-white"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="text-xs font-black text-slate-500">메모</span>
                                    <input
                                      value={quickPointMemo}
                                      onChange={(event) => {
                                        setQuickPointMemo(event.target.value);
                                        setQuickPointMessage("");
                                      }}
                                      placeholder="예: 방송 이벤트 지급 / 오지급 회수"
                                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 focus:bg-white"
                                    />
                                  </label>

                                  <div className="grid grid-cols-2 gap-3">
                                    <button
                                      type="button"
                                      disabled={quickPointSaving !== null}
                                      onClick={() => submitQuickPoint("add")}
                                      className="rounded-2xl bg-rose-deep px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50"
                                    >
                                      {quickPointSaving === "add" ? "지급 중..." : "포인트 지급"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={quickPointSaving !== null}
                                      onClick={() => submitQuickPoint("subtract")}
                                      className="rounded-2xl bg-slate-900 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50"
                                    >
                                      {quickPointSaving === "subtract" ? "회수 중..." : "포인트 회수"}
                                    </button>
                                  </div>

                                  {quickPointMessage ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                                      {quickPointMessage}
                                    </div>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => goPanel("customers")}
                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600"
                                  >
                                    고객관리 전체 화면에서 자세히 보기
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="mb-3 flex items-center justify-between">
                                  <h3 className="text-lg font-black text-slate-950">📦 주문내역</h3>
                                  <span className="text-sm font-black text-slate-500">{customerDetailOrders.length}건</span>
                                </div>
                                <div className="overflow-hidden rounded-2xl border border-slate-100">
                                  <div className="grid grid-cols-[150px_1fr_120px_110px] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
                                    <div>주문일시</div>
                                    <div>주문내역</div>
                                    <div className="text-right">금액</div>
                                    <div className="text-center">상태</div>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {customerDetailOrders.slice(0, 7).map((order: any, index: number) => (
                                      <div key={String(order?.id || index)} className="grid grid-cols-[150px_1fr_120px_110px] items-center px-4 py-3 text-sm">
                                        <div className="font-bold text-slate-500">{orderCreatedAt(order) || "-"}</div>
                                        <div className="min-w-0 font-black text-slate-900">
                                          <div className="line-clamp-2">{orderMemo(order)}</div>
                                        </div>
                                        <div className="text-right font-black text-slate-950">{money(orderAmount(order))}</div>
                                        <div className="flex justify-center">{renderStatusBadge(order)}</div>
                                      </div>
                                    ))}
                                    {customerDetailOrders.length < 1 ? (
                                      <div className="py-10 text-center text-sm font-bold text-slate-400">주문내역이 없습니다.</div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  {quickModal === "orders" ? (
                                    <>
                                      <button type="button" onClick={() => goPanel("orders")} className="rounded-xl bg-rose-deep px-4 py-2 text-xs font-black text-white">주문관리</button>
                                      <button type="button" onClick={() => goPanel("payments")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">입금확인</button>
                                    </>
                                  ) : null}

                                  {quickModal === "payments" ? (
                                    <button type="button" onClick={loadDepositsFromServer} className="rounded-xl bg-rose-deep px-4 py-2 text-xs font-black text-white">입금내역 조회</button>
                                  ) : null}

                                  {quickModal === "customers" ? (
                                    <>
                                      <button type="button" onClick={() => goPanel("customers")} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white">고객관리</button>
                                      <button type="button" onClick={() => goPanel("orders")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">주문관리</button>
                                    </>
                                  ) : null}

                                  {quickModal === "settlement" ? (
                                    <>
                                      <button type="button" onClick={() => goPanel("settlement")} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white">정산통계</button>
                                      <button type="button" onClick={() => goPanel("orders")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">주문관리</button>
                                    </>
                                  ) : null}

                                  <span className="ml-auto text-xs font-bold text-slate-400">빠른 처리용</span>
                                </div>

                                {quickModal !== "settlement" ? (
                                  <div className="mt-3">
                                    <input
                                      value={quickModalSearch}
                                      onChange={(event) => {
                                        setQuickModalSearch(event.target.value);
                                        setQuickModalPage(1);
                                      }}
                                      placeholder={
                                        quickModal === "orders"
                                          ? "닉네임 / 이름 / 주문내역 / 금액 검색"
                                          : quickModal === "payments"
                                            ? "입금자명 / 시간 / 금액 검색"
                                            : "닉네임 / 이름 / 전화번호 검색"
                                      }
                                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
                                    />
                                  </div>
                                ) : null}
                              </div>

                              {quickModal === "orders" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-slate-500">현재 표시 주문</div>
                                      <div className="mt-2 text-3xl font-black text-slate-950">{orderRows.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-line bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-rose-deep">해당기간 주문금액</div>
                                      <div className="mt-2 text-3xl font-black text-rose-deep">{money(activePeriodOrderAmount)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-red-500">입금대기</div>
                                      <div className="mt-2 text-3xl font-black text-red-600">{unpaidOrders.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-red-600">주문서취소</div>
                                      <div className="mt-2 text-3xl font-black text-red-600">{canceledOrders.length}건</div>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between">
                                      <h3 className="text-lg font-black text-slate-950">주문 목록</h3>
                                      <span className="text-xs font-bold text-slate-400">{activePage}/{totalPages} 페이지 · {totalRows}건</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {pagedOrders.length > 0 ? (
                                        pagedOrders.map((order: any, index: number) => {
                                          const paid = isPaidOrder(order);
                                          const canceled = isCanceledOrder(order);

                                          // [표시 전용] 이 주문그룹에 해당하는 금액 단독 추천(있으면). 클릭/확정 없음.
                                          const suggestion =
                                            !paid && !canceled
                                              ? paymentSuggestions.find(
                                                  (item) => String(item?.order_group_id || "") === String(order?.groupId || "")
                                                )
                                              : null;

                                          return (
                                            <div key={String(order?.id || `${activePage}-${index}`)} className={["grid grid-cols-[32px_1fr_130px_160px] items-center gap-3 py-3", canceled ? "bg-red-50/40" : ""].join(" ")}>
                                              <div className="text-sm font-black text-slate-400">{pageStart + index + 1}</div>
                                              <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="font-black text-slate-950">{orderNickname(order)}</span>
                                                  {renderStatusBadge(order)}
                                                </div>
                                                <div className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{orderMemo(order)}</div>
                                                {suggestion ? (
                                                  suggestion.confidence === "green" ? (
                                                    <span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
                                                      추천: {String(suggestion.depositor_name || "")} {money(Number(suggestion.deposit_amount || 0))}
                                                    </span>
                                                  ) : (
                                                    <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200">
                                                      동일금액 입금 {Array.isArray(suggestion.deposit_candidates) ? suggestion.deposit_candidates.length : 0}건 · 확인 필요
                                                    </span>
                                                  )
                                                ) : null}
                                              </div>
                                              <div className={["text-right text-sm font-black", canceled ? "text-red-500 line-through" : "text-slate-950"].join(" ")}>{money(orderAmount(order))}</div>
                                              <div className="flex justify-end gap-2">
                                                {!paid && !canceled ? (
                                                  <button type="button" onClick={() => openManualMatchAndClose(order)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">입금매칭</button>
                                                ) : null}
                                                <button type="button" onClick={() => openOrderDetail(order)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-rose-deep">상세열기</button>
                                              </div>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="py-12 text-center text-sm font-bold text-slate-400">표시할 주문이 없습니다.</div>
                                      )}
                                    </div>
                                    {renderPagination()}
                                  </div>
                                </div>
                              ) : null}

                              {quickModal === "payments" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-slate-500">입금내역</div>
                                      <div className="mt-2 text-3xl font-black text-slate-950">{depositRows.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-line bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-rose-deep">매칭 대상 주문</div>
                                      <div className="mt-2 text-3xl font-black text-rose-deep">{unpaidOrders.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-emerald-500">최근 입금 합계</div>
                                      <div className="mt-2 text-2xl font-black text-emerald-600">{money(recentDepositAmount)}</div>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between">
                                      <h3 className="text-lg font-black text-slate-950">입금 목록</h3>
                                      <span className="text-xs font-bold text-slate-400">{activePage}/{totalPages} 페이지 · {totalRows}건</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {pagedDeposits.length > 0 ? (
                                        pagedDeposits.map((deposit: any, index: number) => (
                                          <div key={String(deposit?.id || `${activePage}-${index}`)} className="grid grid-cols-[32px_1fr_150px] items-center gap-3 py-3">
                                            <div className="text-sm font-black text-slate-400">{pageStart + index + 1}</div>
                                            <div className="min-w-0">
                                              <div className="font-black text-slate-950">{depositName(deposit)}</div>
                                              <div className="mt-1 truncate text-xs font-bold text-slate-500">{depositTimeText(deposit)}</div>
                                            </div>
                                            <div className="text-right text-base font-black text-emerald-600">{money(depositAmount(deposit))}</div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="py-12 text-center text-sm font-bold text-slate-400">표시할 입금내역이 없습니다.</div>
                                      )}
                                    </div>
                                    {renderPagination()}
                                  </div>
                                </div>
                              ) : null}

                              {quickModal === "customers" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-slate-500">고객 후보</div>
                                      <div className="mt-2 text-3xl font-black text-slate-950">{customerRows.length}명</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-line bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-rose-deep">현재 주문 기준</div>
                                      <div className="mt-2 text-3xl font-black text-rose-deep">{modalAllOrders.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-slate-500">고객상세</div>
                                      <div className="mt-2 text-sm font-black text-slate-950">페이지 이동 없이 열림</div>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between">
                                      <h3 className="text-lg font-black text-slate-950">고객 목록</h3>
                                      <span className="text-xs font-bold text-slate-400">{activePage}/{totalPages} 페이지 · {totalRows}명</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {pagedCustomers.length > 0 ? (
                                        pagedCustomers.map((customer, index) => (
                                          <div key={customer.key || `${activePage}-${index}`} className={["grid grid-cols-[32px_1fr_150px_110px] items-center gap-3 py-3", customer.cancelCount > 0 && customer.activeCount === 0 ? "bg-red-50/40" : ""].join(" ")}>
                                            <div className="text-sm font-black text-slate-400">{pageStart + index + 1}</div>
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-slate-950">{customer.nickname}</span>
                                                {customer.cancelCount > 0 ? <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-black text-red-600">취소 {customer.cancelCount}건</span> : null}
                                              </div>
                                              <div className="mt-1 truncate text-xs font-bold text-slate-500">
                                                {customer.name || "이름 확인 필요"} · {customer.phone || "전화번호 확인 필요"} · 정상 {customer.activeCount}건 / 전체 {customer.count}건
                                              </div>
                                            </div>
                                            <div className="text-right text-sm font-black text-slate-950">{money(customer.amount)}</div>
                                            <button type="button" onClick={() => openCustomerDetail(customer)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-rose-deep">고객상세</button>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="py-12 text-center text-sm font-bold text-slate-400">표시할 고객이 없습니다.</div>
                                      )}
                                    </div>
                                    {renderPagination()}
                                  </div>
                                </div>
                              ) : null}

                              {quickModal === "settlement" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-slate-500">현재 주문</div>
                                      <div className="mt-2 text-3xl font-black text-slate-950">{modalAllOrders.length}건</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-line bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-rose-deep">주문 총액</div>
                                      <div className="mt-2 text-2xl font-black text-rose-deep">{money(totalOrderAmount)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                                      <div className="text-xs font-black text-emerald-500">결제완료 매출</div>
                                      <div className="mt-2 text-2xl font-black text-emerald-600">{money(paidOrderAmount)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                                      <div className="text-xs font-black text-amber-700">아직 못 받은 금액</div>
                                      <div className="mt-2 text-2xl font-black text-amber-700">{money(unpaidOrderAmount)}</div>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-black text-slate-950">정산 빠른보기</h3>
                                    <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                                      방송 중 금액 흐름 확인용입니다. 추가 정산 수익, 창고/기타 지출, 카드 수수료 계산은 정산통계 단독 페이지에서 처리합니다.
                                    </p>
                                    <button type="button" onClick={() => goPanel("settlement")} className="mt-4 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white">정산통계 열기</button>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              : null}

          <AdminLiveQuickProductDrawer activeBroadcastId={activeBroadcast?.id || null} />
        </main>
      </div>

      {integrityOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={() => setIntegrityOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "560px", maxHeight: "80vh", overflowY: "auto", padding: "20px 22px", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#7A1E47" }}>🛡️ 정합성 점검</div>
              <button
                type="button"
                onClick={() => setIntegrityOpen(false)}
                style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#F1ECEE", color: "#666", fontSize: "15px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {integrityLoading ? (
              <div style={{ padding: "32px 0", textAlign: "center", fontSize: "14px", fontWeight: 700, color: "#888" }}>점검 중...</div>
            ) : integrityResult ? (
              integrityResult.ok === false ? (
                <div style={{ padding: "16px", borderRadius: "12px", background: "#FEF2F2", color: "#B91C1C", fontSize: "14px", fontWeight: 700 }}>
                  점검 실패: {integrityResult.error || integrityResult.message || "알 수 없는 오류"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                    <button type="button" onClick={() => setIntegrityRecentOnly(true)}
                      style={{ fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "8px", border: "1px solid #E5C7CE", cursor: "pointer", background: integrityRecentOnly ? "#7A1E47" : "#fff", color: integrityRecentOnly ? "#fff" : "#7A1E47" }}>최근 7일만</button>
                    <button type="button" onClick={() => setIntegrityRecentOnly(false)}
                      style={{ fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "8px", border: "1px solid #E5C7CE", cursor: "pointer", background: !integrityRecentOnly ? "#7A1E47" : "#fff", color: !integrityRecentOnly ? "#fff" : "#7A1E47" }}>전체 보기</button>
                  </div>
                  {[
                    { title: "자동입금확인인데 입금없음", count: integrityResult.summary?.check1_auto_paid_no_deposit ?? 0, items: integrityResult.check1?.items ?? [], kind: "check1" },
                    { title: "주문그룹 중복입금", count: integrityResult.summary?.check2_group_multi_deposit ?? 0, items: integrityResult.check2?.items ?? [], kind: "check2" },
                    { title: "중복 입금내역", count: integrityResult.summary?.check3_duplicate_deposit ?? 0, items: integrityResult.check3?.items ?? [], kind: "check3" },
                  ].map((card) => {
                    const now = Date.now();
                    const SEVEN = 7 * 24 * 60 * 60 * 1000;
                    const itemsWithDate = card.items.map((item: any) => {
                      const dateRaw = card.kind === "check1" ? item.created_at
                        : card.kind === "check2" ? item.latest_deposited_time
                        : item.deposited_time;
                      const t = dateRaw ? new Date(dateRaw).getTime() : NaN;
                      const isRecent = Number.isFinite(t) ? (now - t) <= SEVEN : false;
                      return { item, dateRaw, isRecent };
                    });
                    const shownItems = integrityRecentOnly ? itemsWithDate.filter((x: any) => x.isRecent) : itemsWithDate;
                    const recentCount = itemsWithDate.filter((x: any) => x.isRecent).length;
                    const shownCount = integrityRecentOnly ? recentCount : card.count;
                    const isOk = shownCount === 0;
                    const color = isOk ? "#0F6E56" : "#B91C1C";
                    const fmtDate = (raw: any) => {
                      if (!raw) return "날짜없음";
                      const d = new Date(raw);
                      if (!Number.isFinite(d.getTime())) return "날짜없음";
                      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                    };
                    return (
                      <div key={card.kind} style={{ border: `1px solid ${isOk ? "#D1E7DD" : "#F5C2C7"}`, borderRadius: "12px", padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#333" }}>{card.title}</div>
                          <div style={{ fontSize: "14px", fontWeight: 800, color }}>{isOk ? "정상" : `${shownCount}건`}</div>
                        </div>
                        {!isOk && shownItems.length > 0 ? (
                          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {shownItems.slice(0, 10).map((x: any, idx: number) => {
                              const item = x.item;
                              const dateStr = fmtDate(x.dateRaw);
                              const lineColor = x.isRecent ? "#666" : "#AAA";
                              return (
                                <div key={idx} style={{ fontSize: "12px", color: lineColor, lineHeight: 1.5 }}>
                                  {card.kind === "check1"
                                    ? `· ${item.nickname || "-"} / ${Number(item.amount || 0).toLocaleString("ko-KR")}원${item.order_lookup_code ? ` / ${item.order_lookup_code}` : ""} · ${dateStr}`
                                    : card.kind === "check2"
                                      ? `· 입금 ${item.deposit_ids?.length || 0}건 / ${Number(item.total_deposit_amount || 0).toLocaleString("ko-KR")}원 · ${dateStr}`
                                      : `· ${item.depositor_name || "-"} / ${Number(item.amount || 0).toLocaleString("ko-KR")}원 / ${item.deposit_ids?.length || 0}줄 · ${dateStr}`}
                                </div>
                              );
                            })}
                            {shownItems.length > 10 ? (
                              <div style={{ fontSize: "11px", color: "#999" }}>… 외 {shownItems.length - 10}건</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {integrityResult.generated_at ? (
                    <div style={{ fontSize: "11px", color: "#999", textAlign: "right" }}>점검 시각: {new Date(integrityResult.generated_at).toLocaleString("ko-KR")}</div>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
