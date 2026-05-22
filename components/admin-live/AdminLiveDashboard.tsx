"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLiveSidebar from "./AdminLiveSidebar";
import LiveHeader from "./LiveHeader";
import LiveStatsCards from "./LiveStatsCards";
import LiveBroadcastPanels from "./LiveBroadcastPanels";
import LiveOrderTable, { type LiveOrderFilters } from "./LiveOrderTable";
import LiveOrderDetailDrawer from "./LiveOrderDetailDrawer";
import type { OrderRow } from "@/lib/admin-v2/types";
import type { LiveOrder } from "./types";
import {
  buildAdminLiveOrderGroups,
  sortLiveOrdersByCreatedDesc,
  toAdminLiveOrder,
} from "./liveOrderAdapter";

type VideoRatio = "vertical" | "wide" | "auto";

const DEFAULT_FILTERS: LiveOrderFilters = {
  broadcast: "all",
  date: "all",
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

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function matchesStatus(order: LiveOrder, status: LiveOrderFilters["status"]) {
  if (status === "all") return true;
  if (status === "unpaid") return ["unpaid", "manual_match_needed"].includes(order.paymentStatus);
  if (status === "paid") return isPaid(order);
  return order.paymentStatus === status;
}

function matchesDate(order: LiveOrder, dateFilter: LiveOrderFilters["date"]) {
  if (dateFilter === "all") return true;

  const orderDateKey = toDateKey(order.createdAt);
  if (!orderDateKey) return false;

  const now = new Date();
  const todayKey = toDateKey(now.toISOString());
  const yesterdayKey = toDateKey(addDays(now, -1).toISOString());

  if (dateFilter === "today") return orderDateKey === todayKey;
  if (dateFilter === "yesterday") return orderDateKey === yesterdayKey;

  if (dateFilter === "7days") {
    const startKey = toDateKey(addDays(now, -6).toISOString());
    return orderDateKey >= startKey && orderDateKey <= todayKey;
  }

  if (dateFilter === "month") {
    return orderDateKey.slice(0, 7) === todayKey.slice(0, 7);
  }

  return true;
}

function buildCriteriaLabel(filters: LiveOrderFilters) {
  const parts: string[] = [];

  if (filters.broadcast === "all") parts.push("방송 전체보기");
  else if (filters.broadcast === "none") parts.push("방송없음");
  else parts.push("선택 방송");

  const dateLabelMap: Record<LiveOrderFilters["date"], string> = {
    all: "날짜 전체보기",
    today: "오늘",
    yesterday: "어제",
    "7days": "최근 7일",
    month: "이번 달",
  };
  parts.push(dateLabelMap[filters.date]);

  const statusLabelMap: Record<LiveOrderFilters["status"], string> = {
    all: "상태 전체보기",
    unpaid: "미입금",
    paid: "입금확인",
    manual_match_needed: "수동매칭 필요",
    card_paid: "카드결제완료",
    card_unpaid: "카드미결제",
  };
  parts.push(statusLabelMap[filters.status]);

  if (filters.keyword.trim()) parts.push(`검색: ${filters.keyword.trim()}`);

  return parts.join(" · ");
}

export default function AdminLiveDashboard() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<LiveOrderFilters>(DEFAULT_FILTERS);

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
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const groups = buildAdminLiveOrderGroups((data || []) as OrderRow[]);
    const liveOrders = sortLiveOrdersByCreatedDesc(groups).map(toAdminLiveOrder);

    setOrders(liveOrders);
    setSelectedOrderId((current) => {
      if (current && liveOrders.some((order) => order.id === current)) return current;
      return liveOrders.find((order) => order.paymentStatus === "manual_match_needed")?.id || liveOrders[0]?.id || "";
    });
    setLoading(false);
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const broadcastOptions = useMemo(() => {
    const map = new Map<string, string>();

    orders.forEach((order) => {
      if (!order.broadcastId) return;
      map.set(order.broadcastId, order.broadcastName || `방송 ${order.broadcastId.slice(0, 8)}`);
    });

    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label: `방송: ${label}`,
    }));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const keyword = normalizeText(filters.keyword);

    return orders.filter((order) => {
      const matchBroadcast =
        filters.broadcast === "all"
          ? true
          : filters.broadcast === "none"
            ? !order.broadcastId
            : order.broadcastId === filters.broadcast;

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
        matchesDate(order, filters.date) &&
        matchesStatus(order, filters.status) &&
        matchKeyword
      );
    });
  }, [orders, filters]);

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderId("");
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

  const criteriaLabel = buildCriteriaLabel(filters);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <AdminLiveSidebar />

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-4">
          <LiveHeader videoRatio={videoRatio} onVideoRatioChange={setVideoRatio} />
          <LiveStatsCards orders={filteredOrders} criteriaLabel={criteriaLabel} />
          <LiveBroadcastPanels videoRatio={videoRatio} />

          {loadError && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
              주문 데이터 불러오기 실패: {loadError}
            </div>
          )}

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 xl:col-span-9">
              <LiveOrderTable
                orders={filteredOrders}
                allOrderCount={orders.length}
                selectedOrderId={selectedOrder?.id || ""}
                onSelectOrder={(order) => setSelectedOrderId(order.id)}
                loading={loading}
                filters={filters}
                onFiltersChange={setFilters}
                broadcastOptions={broadcastOptions}
              />
            </div>

            <div className="col-span-12 xl:col-span-3">
              {selectedOrder ? (
                <LiveOrderDetailDrawer order={selectedOrder} />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-400 shadow-sm">
                  선택된 주문이 없습니다.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
