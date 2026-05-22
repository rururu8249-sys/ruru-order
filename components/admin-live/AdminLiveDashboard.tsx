"use client";

import { useMemo, useState } from "react";
import AdminLiveSidebar from "./AdminLiveSidebar";
import LiveHeader from "./LiveHeader";
import LiveStatsCards from "./LiveStatsCards";
import LiveBroadcastPanels from "./LiveBroadcastPanels";
import LiveOrderTable from "./LiveOrderTable";
import LiveOrderDetailDrawer from "./LiveOrderDetailDrawer";
import { liveOrders } from "./mockData";
import type { LiveOrder } from "./types";

type VideoRatio = "vertical" | "wide" | "auto";

export default function AdminLiveDashboard() {
  const defaultSelected = useMemo(
    () => liveOrders.find((order) => order.paymentStatus === "manual_match_needed") || liveOrders[0],
    []
  );
  const [selectedOrder, setSelectedOrder] = useState<LiveOrder>(defaultSelected);
  const [videoRatio, setVideoRatio] = useState<VideoRatio>("vertical");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <AdminLiveSidebar />

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-4">
          <LiveHeader videoRatio={videoRatio} onVideoRatioChange={setVideoRatio} />
          <LiveStatsCards />
          <LiveBroadcastPanels videoRatio={videoRatio} />

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 xl:col-span-9">
              <LiveOrderTable
                orders={liveOrders}
                selectedOrderId={selectedOrder.id}
                onSelectOrder={setSelectedOrder}
              />
            </div>

            <div className="col-span-12 xl:col-span-3">
              <LiveOrderDetailDrawer order={selectedOrder} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
