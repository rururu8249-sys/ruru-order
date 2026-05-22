"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLiveSidebar from "./AdminLiveSidebar";
import LiveHeader from "./LiveHeader";
import LiveStatsCards from "./LiveStatsCards";
import LiveBroadcastPanels from "./LiveBroadcastPanels";
import LiveOrderTable from "./LiveOrderTable";
import LiveOrderDetailDrawer from "./LiveOrderDetailDrawer";
import type { OrderRow } from "@/lib/admin-v2/types";
import type { LiveOrder } from "./types";
import {
  buildAdminLiveOrderGroups,
  sortLiveOrdersByCreatedDesc,
  toAdminLiveOrder,
} from "./liveOrderAdapter";

type VideoRatio = "vertical" | "wide" | "auto";

export default function AdminLiveDashboard() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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

  const selectedOrder = useMemo(() => {
    return orders.find((order) => order.id === selectedOrderId) || orders[0] || null;
  }, [orders, selectedOrderId]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <AdminLiveSidebar />

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-4">
          <LiveHeader videoRatio={videoRatio} onVideoRatioChange={setVideoRatio} />
          <LiveStatsCards orders={orders} />
          <LiveBroadcastPanels videoRatio={videoRatio} />

          {loadError && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
              주문 데이터 불러오기 실패: {loadError}
            </div>
          )}

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 xl:col-span-9">
              <LiveOrderTable
                orders={orders}
                selectedOrderId={selectedOrder?.id || ""}
                onSelectOrder={(order) => setSelectedOrderId(order.id)}
                loading={loading}
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
