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
import { primeAdminVoice, playOrderAlert, playDepositAlert } from "@/lib/adminVoice";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import AdminLiveCustomersPanel from "./AdminLiveCustomersPanel";
import AdminLiveNoticePanel from "./AdminLiveNoticePanel";
import AdminLivePaymentPanel from "./AdminLivePaymentPanel";
import AdminLiveSettlementPanel from "./AdminLiveSettlementPanel";
import AdminLiveSettingsPanel from "./AdminLiveSettingsPanel";
import AdminLiveSidebar from "./AdminLiveSidebar";
import LiveHeader from "./LiveHeader";
import LiveStatsCards from "./LiveStatsCards";
import LiveStatsPanel from "./LiveStatsPanel";
import BroadcastReportPopup from "./BroadcastReportPopup";
import SystemAuditCard from "./SystemAuditCard";
import LiveIssueRailPanel from "./LiveIssueRailPanel";
import LiveBroadcastEndSummaryModal, { type LiveBroadcastEndMission, type LiveBroadcastEndSummary } from "./LiveBroadcastEndSummaryModal";
// [2026-09-08 4단계-B] 방송 시작 확인창(미션 설정 포함) + 콘솔 미션 게이지
import LiveBroadcastStartModal, { type BroadcastStartConfirmInput } from "./LiveBroadcastStartModal";
import LiveMissionGauge from "./LiveMissionGauge";
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
  setBroadcastWidgetCard,
  setShopOpen,
  startAdminLiveBroadcast,
  updateAdminLiveBroadcast,
  type AdminLiveBroadcast,
} from "./liveBroadcastController";
import type { DepositRow, OrderGroup, OrderRow } from "@/lib/admin-v2/types";
import { ADMIN_LIVE_SUB_TABS, getAdminLiveTopMenu, isAdminLiveMenuKey, topMenuOf, type AdminLiveMenuKey } from "./adminLiveMenu";
// [2026-09-08 5단계 · 레이아웃 B] 오른쪽 접이식 방송 레일
import AdminLiveBroadcastRail from "./AdminLiveBroadcastRail";
import VisitStatsView from "./VisitStatsView";
import type { LiveOrder } from "./types";
import {
  buildAdminLiveOrderGroups,
  sortLiveOrdersByCreatedDesc,
  toAdminLiveOrder,
} from "./liveOrderAdapter";
import { useAutoBankdaPaymentSync } from "./useAutoBankdaPaymentSync";
import AdminLiveQuickProductDrawer from "./AdminLiveQuickProductDrawer";
import AdminLiveProductManagePopup, { type ProductManageTab } from "./AdminLiveProductManagePopup";
import AdminLiveCardPayPopup from "./AdminLiveCardPayPopup";
import AdminLiveEventRoulettePanel from "./AdminLiveEventRoulettePanel";
import ChatOrderQueuePopup from "./ChatOrderQueuePopup";
import ChatOrderReaderLoop from "./ChatOrderReaderLoop";
import {
  alwaysOrderFilterValue,
  buildAlwaysOrderOptions,
  getAlwaysOrderDateFromFilter,
  getAlwaysOrderDateKey,
  isAlwaysOrderLike,
} from "./alwaysOrderDateUtils";

type VideoRatio = "vertical" | "wide" | "auto";

const DEFAULT_FILTERS: LiveOrderFilters = {
  broadcast: "all",
  scope: "all",
  date: "all",
  customStartDate: "",
  customEndDate: "",
  status: "all",
  keyword: "",
};

// 실시간 주문서 필터를 새로고침 사이에 보존하기 위한 sessionStorage 키(보기 상태 전용).
const LIVE_ORDERS_FILTERS_KEY = "ruru_live_orders_filters";

function toDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  if (dateFilter === "lastmonth") {
    // 지난 달(전월) 1일~말일. 연초(1월)면 작년 12월로 넘어간다.
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return (
      orderDate.getFullYear() === lastMonthDate.getFullYear() &&
      orderDate.getMonth() === lastMonthDate.getMonth()
    );
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
    lastmonth: "지난 달",
    custom:
      filters.customStartDate || filters.customEndDate
        ? `기간 선택 ${filters.customStartDate || "시작일"}~${filters.customEndDate || "종료일"}`
        : "기간 선택",
  };
  parts.push(dateLabelMap[filters.date]);

  const statusLabelMap: Record<LiveOrderFilters["status"], string> = {
    all: "상태 전체보기",
    unpaid: "미결제",
    paid: "결제완료",
    manual_match_needed: "매칭필요",
    bank_paid: "입금확인",
    card_paid: "카드결제완료",
    card_unpaid: "카드미결제",
    canceled: "주문서취소",
    shipped: "택배출고",
  };
  parts.push(statusLabelMap[filters.status]);

  if (filters.keyword.trim()) parts.push(`검색: ${filters.keyword.trim()}`);

  return parts.join(" · ");
}

// [2026-09-08 사장님 지적] 모든 메뉴 화면의 «세로 크기»는 이 한 줄로만 정한다(제각각 금지).
//   화면 높이 - (본문 상하 여백 + 제목·탭 줄). 여기만 바꾸면 전 메뉴가 같이 바뀐다.
// [2026-09-08 사장님 지적] 「모든 페이지가 왼쪽 사이드메뉴바 px랑 하나도 안 맞는다」
//   원인: 화면 카드 높이를 100vh-104px 라는 «어림 숫자»로 잡아 제목줄/여백 실제 높이와 어긋났다.
//   수정: 숫자를 없애고 남는 세로를 그대로 채운다(flex-1). 창 크기·확대율·제목줄이 바뀌어도 사이드바 바닥과 항상 같은 선.
const SCREEN_SHELL_HEIGHT = "min-h-0 flex-1";

// [2026-09-08] ?panel= 은 adminLiveMenu 의 화면 키 전부 허용(옛 주소 그대로 열림)
function isMenuKeyForUrl(value: string | null): value is AdminLiveMenuKey {
  return isAdminLiveMenuKey(value);
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
    visitorText: "접속 기록 확인 중",
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
  const [customersInitialTab, setCustomersInitialTab] = useState<"members" | "issues">("members");
  // [2026-09-08 5단계] 오른쪽 방송 레일 열림 — null 이면 "방송 중이면 열림, 아니면 접힘"(자동), 손잡이를 누르면 고정
  const [railOpenChoice, setRailOpenChoice] = useState<boolean | null>(null);
  // 라이트/다크 테마 토글 — 관리자 루트에만 .dark 부여(다른 페이지 영향 0). localStorage 기억.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ruru_admin_theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch { /* 무시 */ }
  }, []);
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem("ruru_admin_theme", next); } catch { /* 무시 */ }
      return next;
    });
  };
  // 모바일 사이드바(드로어) 열림 상태 — 데스크탑(md+)에선 항상 보이므로 무관.
  const [navOpen, setNavOpen] = useState(false);
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<any>(null);
  const [integrityRecentOnly, setIntegrityRecentOnly] = useState(true);
  const [auditExpanded, setAuditExpanded] = useState<Record<string, boolean>>({});
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  // [2026-08-31 사장님 제보] 자동입금확인 소리가 아예 안 났다 — 소리 내던 LiveOpsStatusBox가
  //   화면 개편 때 빠지면서 기능째 사라져 있었음(실측: 어디에도 마운트 안 됨).
  //   → 항상 떠 있는 대시보드에서 감지: 주문 목록 갱신 시 "새로 자동입금확인된" 주문이 보이면 1회 알림.
  const knownAutoPaidRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const autoPaidRows = orders
      .filter((o) => o.paymentStatus === "auto_paid")
      .map((o) => ({ id: String(o.id), paidAtFull: String(o.paidAtFull || "") }));
    if (knownAutoPaidRef.current === null) {
      knownAutoPaidRef.current = new Set(autoPaidRows.map((r) => r.id)); // 첫 로드 — 기존 건은 조용히 기억만
      return;
    }
    const known = knownAutoPaidRef.current;
    const freshRows = autoPaidRows.filter((r) => !known.has(r.id));
    autoPaidRows.forEach((r) => known.add(r.id));
    if (freshRows.length === 0) return;
    // [2026-08-31 사장님 제보] 자동입금확인 안 됐는데 소리 남 — 기간·필터를 바꾸면
    //   예전부터 확인돼 있던 옛 주문이 "처음 보이는 것"으로 잡혀 울렸다.
    //   → 실제 확인시각(deposit_confirmed_at)이 최근 5분 이내인 건만 소리. 옛 건은 조용히 기억만.
    const FIVE_MIN = 5 * 60 * 1000;
    const now = Date.now();
    const recentFresh = freshRows.filter((r) => {
      const t = new Date(r.paidAtFull).getTime();
      return Number.isFinite(t) && now - t < FIVE_MIN;
    });
    if (recentFresh.length === 0) return;
    try {
      if (window.localStorage.getItem("ruru_admin_sound_on") === "false") return;
    } catch { /* 무시 */ }
    playDepositAlert(recentFresh[0].id); // 띵동(크게) + 음성 "입금!" — 탭 2개여도 같은 건은 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);
  // [표시 전용] 금액 단독 추천(amount_only_suggestions). 읽기 전용 dry_run으로만 채우며 확정/쓰기 없음.
  const [broadcasts, setBroadcasts] = useState<AdminLiveBroadcast[]>([]);
  const [broadcastProductCount, setBroadcastProductCount] = useState<number | null>(null);
  const [shopOpen, setShopOpenState] = useState(true);
  const [lastProductTab, setLastProductTab] = useState<ProductManageTab>("broadcast");
  const [lastProductSearch, setLastProductSearch] = useState("");
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("루루동이LIVE");
  const [broadcastYoutubeUrl, setBroadcastYoutubeUrl] = useState("");
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [cardPayOrder, setCardPayOrder] = useState<LiveOrder | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [matchPanelOpen, setMatchPanelOpen] = useState(false);
  const [selectedOrderForMatch, setSelectedOrderForMatch] = useState<LiveOrder | null>(null);
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // 필터를 sessionStorage에 보존 → 브라우저 새로고침(F5)에도 보던 필터 유지(초기화 버튼 누르면 기본값=저장 삭제).
  // (운영/돈 데이터 아님, 화면 보기 상태. 기존 ruru_admin_sound_on 등 UI 상태 저장과 동일 관행)
  const [filters, setFilters] = useState<LiveOrderFilters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    try {
      const raw = window.sessionStorage.getItem(LIVE_ORDERS_FILTERS_KEY);
      if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<LiveOrderFilters>) };
    } catch {
      // ignore
    }
    return DEFAULT_FILTERS;
  });
  const filtersRestoredRef = useRef<boolean>(
    typeof window !== "undefined" && !!window.sessionStorage.getItem(LIVE_ORDERS_FILTERS_KEY)
  );
  const [broadcastEndSummary, setBroadcastEndSummary] = useState<LiveBroadcastEndSummary | null>(null);
  // [2026-09-08] 방송 시작 확인창 — 헤더의 제목·URL 을 받아 두었다가 확인 시 시작한다
  const [broadcastStartDraft, setBroadcastStartDraft] = useState<{ title: string; youtubeUrl?: string } | null>(null);

  // [2026-08-11 부하개선] 기본은 최근 90일만(서버 스캔량 감소). 옛 입금 확인은 allPeriod=true(전체 기간 버튼).
  const loadDepositsFromServer = async (allPeriod?: boolean) => {
    const response = await fetch(allPeriod ? "/api/admin-v2/deposits?days=all" : "/api/admin-v2/deposits", {
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

  // [2026-08-11 부하개선] 실시간 증분 갱신용 — 마지막 조회의 원본 행을 들고 있다가,
  //   주문 1건이 바뀌면 그 행만 DB에서 가져와 교체하고 화면을 다시 조립한다(전체 재조회 제거).
  const rawOrderRowsRef = useRef<OrderRow[]>([]);

  // 원본 행 → 그룹/목록/선택 상태 반영 (loadOrders 꼬리와 동일 로직을 공용화 — 표시 결과 무변경)
  const applyRawOrderRows = (rows: OrderRow[]) => {
    rawOrderRowsRef.current = rows;
    const groups = sortLiveOrdersByCreatedDesc(buildAdminLiveOrderGroups(rows));
    const liveOrders = groups.map(toAdminLiveOrder);
    setOrderGroups(groups);
    setOrders(liveOrders);
    setSelectedOrderId((current) => {
      if (current && liveOrders.some((order) => order.id === current)) return current;
      return liveOrders.find((order) => order.paymentStatus === "manual_match_needed")?.id || liveOrders[0]?.id || "";
    });
  };

  // [2026-08-12 사장님] silent=true면 "불러오는 중" 화면 없이 조용히 데이터만 교체 —
  //   자동 갱신(Bankda 매칭·실시간 폴백·매칭 후 재조회)의 눈에 보이는 깜빡임 제거. 조회 로직 자체는 동일.
  const loadOrders = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setLoadError("");

    // 전체보기 / 지난달·기간선택(과거 범위) / 키워드 검색 시 .range로 전체 로드.
    // (키워드는 최근 500건 밖 주문도 검색해야 하고, 과거 기간은 500건 캡에 걸려 누락될 수 있으므로)
    const needsFullLoad =
      filters.broadcast === "all" ||
      filters.date === "lastmonth" ||
      filters.date === "custom" ||
      (filters.keyword?.trim() ?? "").length > 0;

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
      // silent 갱신 실패 시엔 보이던 목록을 지우지 않는다(일시 오류로 화면이 비는 사고 방지)
      if (!silent) {
        setOrders([]);
        setOrderGroups([]);
      }
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    applyRawOrderRows((data || []) as OrderRow[]);
    setLoading(false);
  };

  // [2026-08-11 부하개선] 변경된 주문 id만 조회해 원본 행에 병합 — 방송 피크 풀로드 폭풍 제거.
  //   실패·이상 상황은 전부 기존 loadOrders(전체 재조회)로 폴백 → 표시 누락 위험 0.
  const applyRealtimeOrderChanges = async (ids: string[]) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("id", ids);
      if (error) { void loadOrders({ silent: true }); return; }
      const fetched = (data || []) as OrderRow[];
      const fetchedById = new Map(fetched.map((r: any) => [String(r.id), r]));
      const requested = new Set(ids.map(String));
      const next: OrderRow[] = [];
      for (const row of rawOrderRowsRef.current) {
        const rid = String((row as any).id);
        if (requested.has(rid)) {
          const nr: any = fetchedById.get(rid);
          requested.delete(rid);
          // 행이 사라졌거나(영구삭제) 삭제 플래그면 목록에서 제거
          if (!nr || nr.is_deleted === true) continue;
          next.push(nr);
        } else {
          next.push(row);
        }
      }
      // 새 주문(기존 목록에 없던 id)은 맨 앞에 추가 (created_at 정렬은 applyRawOrderRows가 담당)
      for (const rid of requested) {
        const nr: any = fetchedById.get(rid);
        if (nr && nr.is_deleted !== true) next.unshift(nr);
      }
      applyRawOrderRows(next);
    } catch {
      void loadOrders({ silent: true });
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
        await loadOrders({ silent: true });
      }
    },
  });

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

  // 브라우저 음성 잠금 해제: 첫 사용자 클릭/키 입력 때 1회 무음 워밍업 → 이후 자동 알림 음성이 막히지 않음.
  useEffect(() => {
    const prime = () => primeAdminVoice();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  // 실시간 주문 반영: orders INSERT/UPDATE 발생 시 주문목록을 재조회(디바운스 600ms로 연속 변경 묶음).
  // INSERT 시 즉시 알림 소리(720Hz beep). UPDATE는 소리 없이 재조회만.
  // 새 고객 주문/상태변경이 수동 새로고침 없이 즉시 화면에 뜨도록 한다. (BANKDA setInterval과 무관)
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    // [2026-08-11 부하개선] 이벤트마다 전체 재조회 → 바뀐 id만 모아 한 번에 증분 반영.
    //   id를 못 받는 이벤트가 하나라도 있으면(구버전 페이로드 등) 기존처럼 전체 재조회.
    const pendingIds = new Set<string>();
    let needFullReload = false;
    const flushChanges = () => {
      const ids = Array.from(pendingIds);
      pendingIds.clear();
      const full = needFullReload || ids.length === 0 || ids.length > 50;
      needFullReload = false;
      if (full) { void loadOrders({ silent: true }); return; }
      void applyRealtimeOrderChanges(ids);
    };
    const scheduleReload = (payload?: any) => {
      const id = payload?.new?.id ?? payload?.old?.id;
      if (id === undefined || id === null || id === "") needFullReload = true;
      else pendingIds.add(String(id));
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(flushChanges, 600);
    };
    // [2026-08-31 사장님 제보] 상품 2개짜리 주문서 = DB에 2행 INSERT → 띵동이 2번 났다
    //   → 같은 주문서(order_group_id)면 한 번만. 그룹값이 없으면 3초 안 연속 울림 방지로 대체.
    const seenToneGroups = new Set<string>();
    let lastToneAt = 0;
    const playNewOrderTone = (payload?: any) => {
      try {
        if (window.localStorage.getItem("ruru_admin_sound_on") === "false") return;
        const groupId = String(payload?.new?.order_group_id || "");
        const now = Date.now();
        if (groupId) {
          if (seenToneGroups.has(groupId)) return; // 같은 주문서의 다른 상품 행 — 소리 생략
          seenToneGroups.add(groupId);
          if (seenToneGroups.size > 500) seenToneGroups.clear(); // 메모리 상한
        } else if (now - lastToneAt < 3000) {
          return;
        }
        lastToneAt = now;
        // [2026-08-31 사장님 요청] 「띵동~ 주문~」 파일 재생(증폭) — 탭 2개여도 같은 주문은 한 번만
        playOrderAlert(groupId || String(payload?.new?.id || ""));
      } catch {
        /* 소리 실패 시 무시 */
      }
    };
    const channel = supabase
      .channel("ruru-admin-live-orders-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload: any) => {
        playNewOrderTone(payload);
        scheduleReload(payload);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload: any) => scheduleReload(payload))
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
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const previewMode = url.searchParams.get("preview");

    if (previewMode !== "end-summary") return;

    setBroadcastEndSummary(buildLiveBroadcastEndPreviewSummary());
  }, []);

  const activeBroadcast = useMemo(() => getActiveBroadcast(broadcasts), [broadcasts]);

  // 처음 방송 데이터 로딩 후 1회: 방송 중이면 기본 필터를 현재 방송으로 맞춘다(라이브 표준).
  // 사용자가 이미 필터를 바꿨으면(=초기 상태가 아니면) 건드리지 않는다.
  // 필터 변경 시 sessionStorage에 보존(기본값이면 삭제 → 다음 새 세션은 현재 방송 기본값으로 시작).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)) {
        window.sessionStorage.removeItem(LIVE_ORDERS_FILTERS_KEY);
      } else {
        window.sessionStorage.setItem(LIVE_ORDERS_FILTERS_KEY, JSON.stringify(filters));
      }
    } catch {
      // ignore
    }
  }, [filters]);

  const didInitBroadcastFilter = useRef(false);
  useEffect(() => {
    if (didInitBroadcastFilter.current) return;
    if (broadcasts.length === 0) return; // 방송 목록 로딩 전이면 대기
    didInitBroadcastFilter.current = true;
    if (filtersRestoredRef.current) return; // 새로고침으로 복원된 필터가 있으면 기본값으로 덮어쓰지 않음
    if (activeBroadcast) {
      // 방송 중: 범위=방송 + 현재 방송으로 맞춘다(새 UI 일관). 사용자가 아직 안 건드린 초기 상태일 때만.
      setFilters((prev) =>
        prev.broadcast === "all" && prev.scope === "all"
          ? { ...prev, scope: "broadcast", broadcast: "current" }
          : prev
      );
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

  // [2026-07-12 사장님 지침] 위젯 상품카드 ON/OFF — 쇼핑몰 토글과 동일 패턴(낙관적 + 실패 롤백).
  //   broadcasts.widget_card_enabled 한 컬럼만 갱신. null/undefined = ON(기존 방송 호환).
  const widgetCardOn = activeBroadcast ? activeBroadcast.widget_card_enabled !== false : true;
  const handleToggleWidgetCard = async () => {
    if (!activeBroadcast?.id) return;
    const next = !widgetCardOn;
    setBroadcasts((prev) => prev.map((b) => (b.id === activeBroadcast.id ? { ...b, widget_card_enabled: next } : b)));
    try {
      await setBroadcastWidgetCard(activeBroadcast.id, next);
    } catch {
      setBroadcasts((prev) => prev.map((b) => (b.id === activeBroadcast.id ? { ...b, widget_card_enabled: !next } : b)));
      showAdminToast("위젯 상품카드 상태 저장에 실패했어요.", "error");
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
  }, [broadcasts, activeBroadcast, orders, filters.date, filters.customStartDate, filters.customEndDate]);

  // 방송 달력용 데이터: 방송별 (id, 날짜키 KST, 이름). 기간 제한 없이 전부 — 달력은 달 단위라 안 쌓임.
  const broadcastCalendar = useMemo(
    () =>
      broadcasts
        .map((broadcast) => ({
          id: broadcast.id,
          dateKey: getAlwaysOrderDateKey(broadcast.started_at || broadcast.created_at || ""),
          label: formatBroadcastDisplayTitle(broadcast),
        }))
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey)),
    [broadcasts]
  );

  const shopOrderCalendar = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders as any[]) {
      if (!isAlwaysOrderLike(order)) continue;
      const dateKey = getAlwaysOrderDateKey(order.createdAt || order.created_at || "");
      if (!dateKey) continue;
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    }
    return [...counts.entries()].sort(([a],[b]) => b.localeCompare(a)).map(([dateKey,count]) => ({ id: alwaysOrderFilterValue(dateKey), dateKey, label: `${dateKey.replace(/-/g,".")} · ${count}건`, count }));
  }, [orders]);

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

      // 범위(scope): 기존 방송 판정 위에 얹는 표시용 레이어. 돈/입금/방송 로직 무관.
      // all=제한없음, broadcast=방송주문만(상시 제외), shop=쇼핑몰 상시주문만
      const matchScope =
        filters.scope === "all"
          ? true
          : filters.scope === "shop"
            ? isAlwaysOrderLike(order as any)
            : !isAlwaysOrderLike(order as any);

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
        matchScope &&
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
    await loadOrders({ silent: true });
    await loadDepositsFromServer();
  };

  // [2026-09-08 4단계-B] 방송시작 = 확인창(LiveBroadcastStartModal)에서 미션까지 정하고 시작.
  //   ① 방송 ON(기존 로직 그대로) → ② 미션: 켜기면 "끄기 → 켜기" 두 번 저장해 시작시각·앵커를 이번 방송으로 새로 잡는다
  //   (지난 방송 미션이 켜진 채 남아 있으면 ON→ON 이라 시작시각이 안 바뀌어 옛 주문까지 세는 문제 방지).
  //   미션 저장 실패는 방송 시작을 막지 않는다(토스트로 안내).
  const startBroadcast = async (input: { title: string; youtubeUrl?: string }) => {
    setBroadcastStartDraft(input);
  };

  const saveMissionSettings = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin-live/mission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !j?.ok) throw new Error(j?.message || `HTTP ${res.status}`);
  };

  const confirmStartBroadcast = async (confirmInput: BroadcastStartConfirmInput) => {
    const input = broadcastStartDraft;
    if (!input) return;

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
      setBroadcastStartDraft(null);

      // 미션 — 방송이 ON 이 된 다음에 저장해야 앵커가 이번 방송으로 잡힌다
      const mission = confirmInput.mission;
      try {
        if (mission) {
          const base = { goalType: mission.goalType, goalValue: mission.goalValue, rewardAmount: mission.rewardAmount, title: mission.title };
          await saveMissionSettings({ ...base, active: false });
          await saveMissionSettings({ ...base, active: true });
          showAdminToast(`미션 게이지 켜짐 · 목표 ${mission.goalValue.toLocaleString("ko-KR")}${mission.goalType === "amount" ? "원" : "개"}`, "success");
        } else {
          // 이번 방송은 미션 없음 — 지난 방송 미션이 켜진 채 남아 있으면 끈다(위젯·게이지가 엉뚱하게 뜨지 않게)
          const res = await fetch("/api/admin-live/mission", { cache: "no-store" });
          const j = (await res.json().catch(() => null)) as { ok?: boolean; active?: boolean; goalType?: string; goal?: number; reward?: number; title?: string } | null;
          if (j?.ok && j.active) {
            await saveMissionSettings({ active: false, goalType: j.goalType, goalValue: j.goal, rewardAmount: j.reward, title: j.title });
          }
        }
      } catch (error) {
        showAdminToast("방송은 시작됐지만 미션 설정 저장에 실패했어요. 이벤트 › 미션 탭에서 직접 켜 주세요.\n\n" + (error instanceof Error ? error.message : String(error)), "warning");
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
      // [2026-09-08 4단계-B] 미션 결과는 방송이 아직 ON 일 때 읽어야 한다(진행률은 ON 방송 기준으로만 계산됨)
      let missionSnap: { goalType: "count" | "amount"; goal: number; reward: number; title: string; current: number; pct: number } | null = null;
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 6000);
        const res = await fetch("/api/admin-live/mission", { cache: "no-store", signal: controller.signal });
        window.clearTimeout(timer);
        const j = (await res.json().catch(() => null)) as { ok?: boolean; active?: boolean; goalType?: string; goal?: number; reward?: number; title?: string; current?: number; pct?: number } | null;
        if (j?.ok && j.active && Number(j.goal || 0) > 0) {
          missionSnap = {
            goalType: j.goalType === "amount" ? "amount" : "count",
            goal: Number(j.goal || 0),
            reward: Number(j.reward || 0),
            title: String(j.title || ""),
            current: Number(j.current || 0),
            pct: Number(j.pct || 0),
          };
        }
      } catch {
        /* 미션 조회 실패 — 요약에 미션 없음으로 표시 */
      }

      await endAdminLiveBroadcast(activeBroadcast.id);

      // 미션도 함께 종료(mission_active=false → 위젯 숨김, 구간 끝 고정). 실패해도 방송 종료엔 영향 없음
      if (missionSnap) {
        let ended = false;
        try {
          await saveMissionSettings({ active: false, goalType: missionSnap.goalType, goalValue: missionSnap.goal, rewardAmount: missionSnap.reward, title: missionSnap.title });
          ended = true;
        } catch {
          ended = false;
        }
        const mission: LiveBroadcastEndMission = { ...missionSnap, achieved: missionSnap.pct >= 100, ended };
        summary.mission = mission;
      }

      // [2026-09-07] 방문자 수 — 접속 기록(visitor_visits)에서 이 방송 방문자만 읽어 표시(읽기 전용, 실패해도 종료엔 영향 없음)
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 6000);
        const res = await fetch("/api/admin-live/visit-stats", { cache: "no-store", signal: controller.signal });
        window.clearTimeout(timer);
        const json = await res.json().catch(() => null);
        const row = Array.isArray(json?.broadcasts)
          ? json.broadcasts.find((b: any) => String(b?.broadcastId ?? "") === String(activeBroadcast.id))
          : null;
        summary.visitorText = row
          ? `${Number(row.visitors) || 0}명 (방문 ${Number(row.visits) || 0}회)`
          : json?.available === false
            ? "접속 기록 없음"
            : "이 방송 접속 기록 없음";
      } catch {
        summary.visitorText = "접속 기록 확인 실패";
      }

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

      // 방송 종료 → 텔레그램 결산 자동 발송(곁다리·실패해도 종료엔 영향 없음). 토글/연결은 서버에서 판단.
      void fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-report", auto: true }),
      }).catch(() => {});
    } catch (error) {
      showAdminToast("방송종료 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSavingBroadcast(false);
    }
  };

  const criteriaLabel = buildCriteriaLabel(filters);

  // 사이드바 예외 배지 (읽기 전용 카운트): 정산제외(테스트) 제외, 매칭필요/카드미결제 — 필터와 무관하게 로드된 전체 주문 기준
  // (취소 주문은 paymentStatus가 "canceled"라 아래 조건에 자연 제외됨)
  const badgeBase = orders.filter((o) => o.excludeFromSettlement !== true);
  const exceptionBadges = {
    needMatch: badgeBase.filter((o) => o.paymentStatus === "manual_match_needed").length,
    cardUnpaid: badgeBase.filter((o) => o.paymentMethod === "카드결제" && o.paymentStatus === "card_unpaid").length,
  };

  // [2026-09-08 5단계] 큰 메뉴·작은 탭·레일 열림(자동: 방송 중이면 열림)
  const activeTopMenu = getAdminLiveTopMenu(topMenuOf(activeMenu));
  const activeSubTabs = ADMIN_LIVE_SUB_TABS[activeTopMenu.key];
  const railOpen = railOpenChoice ?? Boolean(activeBroadcast);

  return (
    <div className={`h-screen overflow-hidden bg-canvas text-ink ${theme === "dark" ? "dark" : ""}`} data-ruru-controltower-shell="layout-b-pages-rail-v4">
      <div className="flex h-full min-h-0">
        <AdminLiveSidebar
          activeMenu={activeMenu}
          theme={theme}
          onToggleTheme={toggleTheme}
          navOpen={navOpen}
          onCloseNav={() => setNavOpen(false)}
          exceptionBadges={exceptionBadges}
          onExceptionBadgeClick={(kind) => {
            // [UX 2026-07-06] 배지 클릭 = 그 예외 주문만 바로 보기: 주문·입금 › 실시간 주문 + 기간/범위 전체 + 해당 상태 필터
            setActiveMenu("orders");
            replacePanelInUrl("orders");
            setNavOpen(false);
            setFilters((prev) => ({
              ...prev,
              broadcast: "all",
              scope: "all",
              date: "all",
              status: kind === "match" ? "manual_match_needed" : "card_unpaid",
            }));
          }}
          onMenuChange={(nextMenu) => {
            setActiveMenu(nextMenu);
            replacePanelInUrl(nextMenu);
          }}
          broadcastOn={Boolean(activeBroadcast)}
          onOpenVisitStats={() => { setActiveMenu("visits"); replacePanelInUrl("visits"); }}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3 md:px-5 md:py-4">
          {/* 모바일 전용: 사이드바(메뉴) 여는 햄버거. 데스크탑(md+)에선 사이드바가 항상 보여 숨김 */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="mb-3 inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-line bg-surface px-3 py-2 text-sm font-black text-ink shadow-sm md:hidden"
          >
            ☰ 메뉴
          </button>

          {/* [2026-09-08 5단계 · 레이아웃 B] 왼쪽 = 큰 메뉴 화면(통째로 전환) / 오른쪽 = 접이식 방송·채팅 레일 */}
          {/* [2026-09-08 사장님 지적] 메뉴마다 크기가 제각각이면 안 된다.
              → 모든 화면이 이 «하나의 틀» 안에 들어간다. 가로=화면 전체, 세로=화면 높이-헤더. 예외 없음. */}
          <div className="mx-auto flex min-h-0 w-full max-w-[1720px] flex-1 flex-col">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* 화면 제목 + 작은 탭 */}
              <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-2 border-b border-rose-line">
                <div className="flex items-end gap-3">
                  <h1 className="pb-2 text-lg font-black tracking-tight text-ink">{activeTopMenu.label}</h1>
                  {activeSubTabs.length > 1 ? (
                    <div className="flex items-center gap-1">
                      {activeSubTabs.map((tab) => {
                        const active = tab.key === activeMenu;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => { setActiveMenu(tab.key); replacePanelInUrl(tab.key); }}
                            className={[
                              "-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-[13px] font-black transition",
                              active ? "border-rose-deep bg-rose-soft/60 text-rose-deep" : "border-transparent text-ink-soft hover:opacity-90 hover:text-rose-deep",
                            ].join(" ")}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {activeMenu === "orders" ? (
                  <div className="flex items-center gap-1.5 pb-1.5">
                    <button
                      type="button"
                      onClick={() => setMatchPanelOpen((v) => !v)}
                      className={[
                        "rounded-lg border px-2.5 py-1.5 text-xs font-black transition",
                        matchPanelOpen ? "border-rose-deep bg-rose-soft text-rose-deep" : "border-rose-line text-rose-deep hover:opacity-90",
                      ].join(" ")}
                    >
                      {matchPanelOpen ? "입금매칭 닫기" : "입금매칭 열기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runIntegrityCheck()}
                      title="정합성 점검"
                      className="rounded-lg border border-rose-line px-2.5 py-1.5 text-xs font-black text-rose-deep transition hover:bg-rose-soft"
                    >
                      🛡️ 점검
                    </button>
                  </div>
                ) : null}
              </div>

              {loadError && (activeMenu === "orders" || activeMenu === "broadcast") ? (
                <div className="mb-3 shrink-0 rounded-2xl border border-danger-tx/40 bg-danger-bg px-4 py-3 text-sm font-black text-danger-tx">
                  주문 데이터 불러오기 실패: {loadError}
                </div>
              ) : null}

              {/* ▼▼ 모든 메뉴 공통 틀 — 여기 안쪽만 화면마다 다르다 ▼▼ */}
              <div className={`w-full overflow-hidden rounded-2xl border border-line bg-surface ${SCREEN_SHELL_HEIGHT}`}>

              {/* ── 방송 › 방송 콘솔 ── */}
              {activeMenu === "broadcast" ? (
                <div className="h-full space-y-3 overflow-y-auto p-4">
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
                    widgetCardOn={widgetCardOn}
                    onToggleWidgetCard={handleToggleWidgetCard}
                  />
                  <LiveMissionGauge
                    broadcastOn={Boolean(activeBroadcast)}
                    onOpenMission={() => { setActiveMenu("event"); replacePanelInUrl("event"); }}
                  />
                  <LiveStatsCards orders={filteredOrders} criteriaLabel={criteriaLabel} />
                  {/* [2026-09-08 사장님 지적] 시스템 점검은 「설정 › 시스템 점검」, 고객이슈는 「고객」으로 옮겼다.
                      방송/쇼핑몰 상관없는 공통 항목이라 방송 메뉴에 있을 자리가 아니다. */}
                  <div className="w-full">
                    <LiveStatsPanel orders={orders} activeBroadcastId={activeBroadcast?.id || null} onOpenReport={() => { setActiveMenu("reports"); replacePanelInUrl("reports"); }} />
                  </div>
                </div>
              ) : null}

              {/* ── 방송 › 채팅주문 대기열(판정 결과 확인 전용, 담기 없음) ── */}
              {activeMenu === "chatorder" ? <ChatOrderQueuePopup embedded onClose={() => {}} /> : null}

              {/* ── 방송 › 이벤트 (항상 마운트 → 명단·상태 유지. 탭이 아닐 땐 숨김) ── */}
              <div hidden={activeMenu !== "event"} className="h-full">
                <AdminLiveEventRoulettePanel
                  embedded
                  renderTrigger={false}
                  controlledOpen={activeMenu === "event"}
                  onRequestClose={() => { setActiveMenu("broadcast"); replacePanelInUrl("broadcast"); }}
                  activeBroadcastId={activeBroadcast?.id || null}
                  filteredOrderGroupIds={filteredOrders.map((o) => String(o.groupId))}
                />
              </div>

              {/* ── 방송 › 방송 기록·리포트 (읽기 전용) ── */}
              {activeMenu === "reports" ? (
                <BroadcastReportPopup embedded open onClose={() => {}} initialBroadcastId={activeBroadcast?.id || null} />
              ) : null}

              {/* ── 주문·입금 › 실시간 주문 ── */}
              {activeMenu === "orders" ? (
                <div className="flex h-full min-h-0 flex-col gap-3 p-4">
                  <div className="shrink-0">
                    <LiveStatsCards orders={filteredOrders} criteriaLabel={criteriaLabel} />
                  </div>
                  <div className="shrink-0">
                    <LiveMissionGauge
                      broadcastOn={Boolean(activeBroadcast)}
                      onOpenMission={() => { setActiveMenu("event"); replacePanelInUrl("event"); }}
                    />
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <LiveOrderTable
                      orders={filteredOrders}
                      allOrderCount={orders.length}
                      selectedOrderId={selectedOrder?.id || ""}
                      loading={loading}
                      filters={filters}
                      broadcastOptions={broadcastOptions}
                      broadcastCalendar={broadcastCalendar}
                      shopOrderCalendar={shopOrderCalendar}
                      broadcastStartedAt={activeBroadcast?.started_at || activeBroadcast?.created_at || null}
                      onSelectOrder={(order) => {
                        // 사이드 패널 단일 슬롯: 주문상세 열 때 입금매칭은 닫음
                        setMatchPanelOpen(false);
                        setSelectedOrderForMatch(null);
                        setSelectedOrderId(order.id);
                        setOrderDetailOpen(true);
                      }}
                      onFiltersChange={setFilters}
                      onRefresh={loadOrders}
                      onOpenManualMatch={openManualMatchForOrder}
                      onOpenCardPay={setCardPayOrder}
                      onSelectForMatch={(order) => { setOrderDetailOpen(false); setSelectedOrderForMatch(order); setMatchPanelOpen(true); }}
                    />
                  </div>
                </div>
              ) : null}

              {/* ── 주문·입금 › 입금내역 ── */}
              {activeMenu === "payments" ? (
                <div className="h-full overflow-y-auto p-5">
                  <AdminLivePaymentPanel
                    deposits={deposits}
                    orderGroups={orderGroups}
                    onRefresh={loadDepositsFromServer}
                    onBankdaSync={syncBankdaDepositsOnly}
                  />
                </div>
              ) : null}

              {/* ── 주문·입금 › 정산 ── */}
              {activeMenu === "settlement" ? (
                <div className="h-full overflow-y-auto p-5">
                  <AdminLiveSettlementPanel
                    orders={orders}
                    onGoToUnpaidOrders={() => {
                      // 미수금 줄 → 주문·입금 화면에서 «미입금 주문만» 바로 보기 (읽기 전용 이동, 돈 로직 무관)
                      setActiveMenu("orders");
                      replacePanelInUrl("orders");
                      setFilters((prev) => ({ ...prev, broadcast: "all", scope: "all", date: "all", status: "unpaid" }));
                    }}
                  />
                </div>
              ) : null}

              {/* ── 상품 ── */}
              {activeMenu === "products" ? (
                <AdminLiveProductManagePopup
                  embedded
                  activeBroadcastId={activeBroadcast?.id || null}
                  onClose={() => {}}
                  initialTab={lastProductTab}
                  onTabChange={setLastProductTab}
                  initialSearch={lastProductSearch}
                  onSearchChange={setLastProductSearch}
                />
              ) : null}

              {/* ── 고객 › 회원·이슈·단골 ── */}
              {activeMenu === "customers" ? (
                <div className="flex h-full flex-col gap-3 p-4">
                  {/* [2026-09-08] 방송 콘솔에 있던 「고객이슈」 요약 — 사람에 관한 건 고객 메뉴로 */}
                  <div className="shrink-0">
                    <LiveIssueRailPanel onOpenAll={() => setCustomersInitialTab("issues")} />
                  </div>
                  <div className="min-h-0 flex-1">
                    <AdminLiveCustomersPanel embedded orders={orders} initialTab={customersInitialTab} onClose={() => setCustomersInitialTab("members")} />
                  </div>
                </div>
              ) : null}

              {/* ── 고객 › 쪽지·공지 ── */}
              {activeMenu === "notice" ? (
                <div className="h-full w-full">
                  <AdminLiveNoticePanel />
                </div>
              ) : null}

              {/* ── 설정 › 시스템 점검 (공통) ── */}
              {activeMenu === "audit" ? (
                <div className="h-full space-y-3 overflow-y-auto p-4">
                  {/* [2026-07-25 사장님] 상시 시스템 점검 카드 — 이상 없어도 초록 표시 */}
                  <SystemAuditCard onOpenDetail={() => void runIntegrityCheck()} />
                  <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
                    주문·입금 데이터가 서로 어긋나는 곳이 있는지 훑어봅니다. 방송 중이든 아니든 언제나 같은 기준으로 봅니다.
                    「자세히 보기」를 누르면 어떤 주문인지 목록으로 나옵니다.
                  </div>
                </div>
              ) : null}

              {/* ── 고객 › 접속 기록 (읽기 전용) ── */}
              {activeMenu === "visits" ? (
                <VisitStatsView embedded style={{ height: "100%" }} />
              ) : null}

              {/* ── 설정 ── */}
              {activeMenu === "settings" ? (
                <div className="h-full w-full">
                  <AdminLiveSettingsPanel onOpenNotice={() => { setActiveMenu("notice"); replacePanelInUrl("notice"); }} />
                </div>
              ) : null}

              </div>
              {/* ▲▲ 공통 틀 끝 ▲▲ */}
            </div>

            {/* 오른쪽 접이식 방송·채팅 레일 (어느 화면에서든) */}
            <AdminLiveBroadcastRail
              open={railOpen}
              onToggle={() => setRailOpenChoice(!railOpen)}
              broadcastOn={Boolean(activeBroadcast)}
              videoRatio={videoRatio}
              youtubeUrl={activeBroadcast?.youtube_live_url || ""}
              activeBroadcastId={activeBroadcast?.id || null}
            />
          </div>

          {/* 주문상세 / 입금매칭 — 우측 오버레이 드로어(슬라이드인, 위로 떠서 표를 밀지 않음). 단일 슬롯. */}
          {(matchPanelOpen || (selectedOrder && orderDetailOpen)) ? (
            <>
              <button
                type="button"
                aria-label="패널 닫기"
                onClick={() => { setMatchPanelOpen(false); setSelectedOrderForMatch(null); setOrderDetailOpen(false); }}
                className="fixed inset-0 z-40 bg-black/40"
              />
              <div
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] overflow-y-auto border-l border-line bg-surface shadow-2xl"
                style={{ animation: "ruruSidePanelIn 0.22s ease" }}
              >
                {matchPanelOpen ? (
                  <LiveFloatingMatchPanel
                    deposits={deposits}
                    orders={filteredOrders}
                    onClose={() => { setMatchPanelOpen(false); setSelectedOrderForMatch(null); }}
                    onMatched={refreshAfterManualMatch}
                    onSearchFilter={(keyword) => setFilters((prev) => ({ ...prev, keyword }))}
                    selectedOrderForMatch={selectedOrderForMatch}
                    onClearSelectedOrder={() => setSelectedOrderForMatch(null)}
                  />
                ) : selectedOrder && orderDetailOpen ? (
                  <LiveOrderDetailDrawer
                    order={selectedOrder}
                    onOpenManualMatch={openManualMatchForOrder}
                    onClose={closeOrderDetail}
                    onAfterStatusChange={() => loadOrders({ silent: true })}
                  />
                ) : null}
              </div>
            </>
          ) : null}
          <style>{`@keyframes ruruSidePanelIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }`}</style>

          {/* 카드결제 복사창 (카드미결제 배지 → 페이스터) */}
          {cardPayOrder && (
            <AdminLiveCardPayPopup
              order={cardPayOrder}
              onClose={() => setCardPayOrder(null)}
              onAfterStatusChange={loadOrders}
            />
          )}

          {/* 채팅읽기 상주 루프 — 컨트롤타워가 열려 있으면 자동으로 읽는다 (OFF면 서버가 건너뜀) */}
          <ChatOrderReaderLoop />

          <LiveBroadcastStartModal
            open={Boolean(broadcastStartDraft)}
            broadcastTitle={broadcastStartDraft?.title || broadcastTitle}
            saving={savingBroadcast}
            onCancel={() => setBroadcastStartDraft(null)}
            onConfirm={confirmStartBroadcast}
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

      {integrityOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={() => setIntegrityOpen(false)}
        >
          <div
            style={{ background: "var(--color-surface)", borderRadius: "16px", width: "100%", maxWidth: "560px", maxHeight: "80vh", overflowY: "auto", padding: "20px 24px", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--color-rose-deep)" }}>🛡️ 정합성 점검</div>
              <button
                type="button"
                onClick={() => setIntegrityOpen(false)}
                style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#F1ECEE", color: "var(--color-ink-soft)", fontSize: "14px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {integrityLoading ? (
              <div style={{ padding: "32px 0", textAlign: "center", fontSize: "14px", fontWeight: 700, color: "var(--color-ink-mute)" }}>점검 중...</div>
            ) : integrityResult ? (
              integrityResult.ok === false ? (
                <div style={{ padding: "16px", borderRadius: "12px", background: "#FEF2F2", color: "var(--color-danger-tx)", fontSize: "14px", fontWeight: 700 }}>
                  점검 실패: {integrityResult.error || integrityResult.message || "알 수 없는 오류"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                    <button type="button" onClick={() => setIntegrityRecentOnly(true)}
                      style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "8px", border: "1px solid #E5C7CE", cursor: "pointer", background: integrityRecentOnly ? "#7A1E47" : "#fff", color: integrityRecentOnly ? "#fff" : "#7A1E47" }}>최근 7일만</button>
                    <button type="button" onClick={() => setIntegrityRecentOnly(false)}
                      style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "8px", border: "1px solid #E5C7CE", cursor: "pointer", background: !integrityRecentOnly ? "#7A1E47" : "#fff", color: !integrityRecentOnly ? "#fff" : "#7A1E47" }}>전체 보기</button>
                  </div>
                  {[
                    // [2026-08-11] 재고 안전장치 생존 감시 — 제출RPC 거부로직·경비원·담기선점이 하나라도 죽으면 표시 (0건=안전)
                    { title: "재고 안전장치 이상", count: integrityResult.summary?.check10_inventory_guard ?? 0, items: integrityResult.check10?.items ?? [], kind: "check10" },
                    { title: "자동입금확인인데 입금없음", count: integrityResult.summary?.check1_auto_paid_no_deposit ?? 0, items: integrityResult.check1?.items ?? [], kind: "check1" },
                    { title: "주문그룹 중복입금", count: integrityResult.summary?.check2_group_multi_deposit ?? 0, items: integrityResult.check2?.items ?? [], kind: "check2" },
                    { title: "날짜 역전 매칭(오매칭 의심)", count: integrityResult.summary?.check9_date_inverted_match ?? 0, items: integrityResult.check9?.items ?? [], kind: "check9" },
                    { title: "중복 입금내역", count: integrityResult.summary?.check3_duplicate_deposit ?? 0, items: integrityResult.check3?.items ?? [], kind: "check3" },
                    // [2026-07-25 전체점검] 점검4~8 — API가 만들어주는 label 문자열을 그대로 표시
                    { title: "취소인데 재고 미복구", count: integrityResult.summary?.check4_cancel_not_restored ?? 0, items: integrityResult.check4?.items ?? [], kind: "check4" },
                    { title: "재고 장부 불일치", count: integrityResult.summary?.check5_stock_ledger_mismatch ?? 0, items: integrityResult.check5?.items ?? [], kind: "check5" },
                    { title: "금액 공식 불일치", count: integrityResult.summary?.check6_amount_formula ?? 0, items: integrityResult.check6?.items ?? [], kind: "check6" },
                    { title: "포인트 잔액≠이력", count: integrityResult.summary?.check7_point_mismatch ?? 0, items: integrityResult.check7?.items ?? [], kind: "check7" },
                    { title: "입금확인 시각 누락", count: integrityResult.summary?.check8_paid_no_timestamp ?? 0, items: integrityResult.check8?.items ?? [], kind: "check8" },
                  ].map((card) => {
                    const now = Date.now();
                    const SEVEN = 7 * 24 * 60 * 60 * 1000;
                    const itemsWithDate = card.items.map((item: any) => {
                      // [2026-07-26] 입금 관련 날짜는 created_at 사용 — deposited_time은 "시각만" 저장이라 날짜없음 오표시됐었음
                      const dateRaw = card.kind === "check1" ? item.created_at
                        : card.kind === "check2" ? (item.latest_created_at ?? item.latest_deposited_time)
                        : card.kind === "check3" ? (item.created_at ?? item.deposited_time)
                        : card.kind === "check9" ? item.deposit_created_at
                        : item.created_at;
                      const t = dateRaw ? new Date(dateRaw).getTime() : NaN;
                      // 날짜 없는 항목(재고 장부·포인트)은 "최근 7일만" 필터에서도 항상 표시
                      // 날짜 역전 매칭(check9)은 오래된 오매칭도 살아있는 위험이라 항상 표시
                      const isRecent = card.kind === "check9" ? true
                        : dateRaw ? (Number.isFinite(t) ? (now - t) <= SEVEN : false) : true;
                      return { item, dateRaw, isRecent };
                    });
                    const shownItems = integrityRecentOnly ? itemsWithDate.filter((x: any) => x.isRecent) : itemsWithDate;
                    const recentCount = itemsWithDate.filter((x: any) => x.isRecent).length;
                    const shownCount = integrityRecentOnly ? recentCount : card.count;
                    const isOk = shownCount === 0;
                    const color = isOk ? "var(--color-ok-tx)" : "#B91C1C";
                    const fmtDate = (raw: any) => {
                      if (!raw) return "날짜없음";
                      const d = new Date(raw);
                      if (!Number.isFinite(d.getTime())) return "날짜없음";
                      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                    };
                    // 상세용: 연·월·일 (필요 시 시각 뒷 5자리 HH:MM)
                    const fmtFull = (raw: any, withTime = false) => {
                      if (!raw) return "날짜없음";
                      const d = new Date(raw);
                      if (!Number.isFinite(d.getTime())) return "날짜없음";
                      const base = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                      if (!withTime) return base;
                      return `${base} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    };
                    return (
                      <div key={card.kind} style={{ border: `1px solid ${isOk ? "#D1E7DD" : "#F5C2C7"}`, borderRadius: "12px", padding: "12px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-ink)" }}>{card.title}</div>
                          <div style={{ fontSize: "14px", fontWeight: 800, color }}>{isOk ? "정상" : `${shownCount}건`}</div>
                        </div>
                        {!isOk && shownItems.length > 0 ? (
                          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {shownItems.slice(0, 10).map((x: any, idx: number) => {
                              const item = x.item;
                              const dateStr = fmtDate(x.dateRaw);
                              const lineColor = x.isRecent ? "#666" : "#AAA";
                              // check2·check9 는 클릭하면 상세(입금자·각 입금·연결 주문·의심사유)가 펼쳐진다
                              const expandable = card.kind === "check2" || card.kind === "check9";
                              const ekey = `${card.kind}__${idx}`;
                              const open = !!auditExpanded[ekey];
                              const suspicious = card.kind === "check9" || (card.kind === "check2" && item.date_inverted);
                              const summaryText = card.kind === "check1"
                                ? `${item.nickname || "-"} / ${Number(item.amount || 0).toLocaleString("ko-KR")}원${item.order_lookup_code ? ` / ${item.order_lookup_code}` : ""} · ${dateStr}`
                                : card.kind === "check2"
                                  ? `${item.nickname || "주문미상"} · 입금 ${item.deposit_ids?.length || 0}건 / ${Number(item.total_deposit_amount || 0).toLocaleString("ko-KR")}원 · ${dateStr}`
                                  : card.kind === "check9"
                                    ? `${item.depositor_name || "-"} · ${Number(item.amount || 0).toLocaleString("ko-KR")}원 · 입금 ${fmtDate(item.deposit_created_at)} → 주문 ${item.nickname || "-"} ${fmtDate(item.order_created_at)}`
                                    : card.kind === "check3"
                                      ? `${item.depositor_name || "-"} / ${Number(item.amount || 0).toLocaleString("ko-KR")}원 / ${item.deposit_ids?.length || 0}줄 · ${dateStr}`
                                      : `${item.label || "-"}${x.dateRaw ? ` · ${dateStr}` : ""}`;
                              return (
                                <div key={idx} style={{ fontSize: "12px", color: lineColor, lineHeight: 1.5 }}>
                                  <div
                                    onClick={expandable ? () => setAuditExpanded((p) => ({ ...p, [ekey]: !p[ekey] })) : undefined}
                                    style={{ display: "flex", alignItems: "center", gap: "6px", cursor: expandable ? "pointer" : "default", flexWrap: "wrap" }}
                                  >
                                    {expandable ? <span style={{ color: "#B91C1C", fontWeight: 800, width: "10px" }}>{open ? "▾" : "▸"}</span> : <span>·</span>}
                                    <span style={{ fontWeight: expandable ? 700 : 400, color: expandable ? "var(--color-ink)" : lineColor }}>{summaryText}</span>
                                    {suspicious ? (
                                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#fff", background: "#B91C1C", borderRadius: "8px", padding: "1px 6px" }}>⚠️ 오매칭 의심</span>
                                    ) : card.kind === "check2" ? (
                                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#92400E", background: "#FEF3C7", borderRadius: "8px", padding: "1px 6px" }}>고객 중복입금?</span>
                                    ) : null}
                                  </div>
                                  {expandable && open ? (
                                    <div style={{ marginTop: "6px", marginLeft: "16px", marginBottom: "4px", padding: "8px 8px", background: suspicious ? "#FEF2F2" : "#FAF6F7", border: `1px solid ${suspicious ? "#F5C2C7" : "#E5C7CE"}`, borderRadius: "8px", color: "#444", fontSize: "12px", lineHeight: 1.7 }}>
                                      {card.kind === "check2" ? (
                                        <>
                                          <div style={{ fontWeight: 700, color: "var(--color-ink)" }}>연결 주문: {item.nickname || "-"}{item.customer_name ? ` (${item.customer_name})` : ""}{item.order_lookup_code ? ` · ${item.order_lookup_code}` : ""} · 주문일 {fmtFull(item.order_created_at)}</div>
                                          <div style={{ marginTop: "4px", fontWeight: 700, color: "var(--color-ink)" }}>입금 {item.deposits?.length || 0}건</div>
                                          {(item.deposits ?? []).map((d: any, di: number) => (
                                            <div key={di} style={{ color: d.date_inverted ? "#B91C1C" : "#444" }}>
                                              · 입금자 <b>{d.depositor_name || "-"}</b> · {Number(d.amount || 0).toLocaleString("ko-KR")}원 · {d.deposited_time || "시각없음"} · {fmtFull(d.created_at)}{d.date_inverted ? " ⚠️ 입금이 주문보다 빠름" : ""}
                                            </div>
                                          ))}
                                          <div style={{ marginTop: "6px", fontWeight: 700, color: suspicious ? "#B91C1C" : "#92400E" }}>
                                            {suspicious
                                              ? "⚠️ 입금일이 주문 생성일보다 빠릅니다 = 다른 주문의 입금이 이 주문에 잘못 물렸을 의심. 입금확인을 취소하고 올바른 주문(또는 미확인 입금)으로 수동 연결하세요."
                                              : "한 주문에 입금이 2건 이상입니다. 고객이 2번 입금했거나 분할입금일 수 있어요. 입금자·금액을 확인하세요."}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div>이 입금(입금자 <b>{item.depositor_name || "-"}</b>, {Number(item.amount || 0).toLocaleString("ko-KR")}원)은 <b>{fmtFull(item.deposit_created_at)}</b> 기록인데, 연결된 주문(<b>{item.nickname || "-"}</b>{item.order_lookup_code ? ` · ${item.order_lookup_code}` : ""})은 <b>{fmtFull(item.order_created_at)}</b>에 생성됐습니다.</div>
                                          <div style={{ marginTop: "6px", fontWeight: 700, color: "#B91C1C" }}>⚠️ 입금이 주문보다 {item.days_early}일 빠름 = 자동매칭이 다른 주문의 입금을 잘못 물었을 가능성. 입금확인을 취소하고 올바른 주문(또는 미확인 입금)으로 수동 연결하세요.</div>
                                        </>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                            {shownItems.length > 10 ? (
                              <div style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>… 외 {shownItems.length - 10}건</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {integrityResult.generated_at ? (
                    <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", textAlign: "right" }}>점검 시각: {new Date(integrityResult.generated_at).toLocaleString("ko-KR")}</div>
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
