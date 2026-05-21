"use client";

// components/admin-v2/today/AdminTodayDashboard.tsx
// 목적: admin-v2 첫 화면인 오늘할일 실무형 관제탑
// 주의: UI/조회/계산 전용. 주문 저장, 입금매칭 저장, 정산 저장, 배송비 계산 변경 없음.

import { useMemo, useState } from "react";
import type {
  BroadcastRow,
  CustomerRow,
  DepositRow,
  OrderGroup,
  OrderRow,
  SettingRow,
} from "@/lib/admin-v2/types";
import AdminTodayHeader from "@/components/admin-v2/today/AdminTodayHeader";
import AdminTodayMoneySummary from "@/components/admin-v2/today/AdminTodayMoneySummary";
import AdminTodayPersistentTasks from "@/components/admin-v2/today/AdminTodayPersistentTasks";
import AdminTodayWorkQueue from "@/components/admin-v2/today/AdminTodayWorkQueue";
import AdminTodayRankings from "@/components/admin-v2/today/AdminTodayRankings";
import AdminTodayKakaoPanel from "@/components/admin-v2/today/AdminTodayKakaoPanel";
import {
  buildBuyerRanking,
  buildMoneySummary,
  buildProductRanking,
  buildWorkItems,
  getTodayGroups,
  type TodayWorkTab,
} from "@/components/admin-v2/today/adminTodayUtils";

type AdminTodayDashboardProps = {
  orders: OrderRow[];
  orderGroups: OrderGroup[];
  customers: CustomerRow[];
  deposits: DepositRow[];
  broadcasts: BroadcastRow[];
  settings: SettingRow[];
  onGoOrders: () => void;
  onGoShipping: () => void;
  onGoCustomers: () => void;
  onGoDeposits: () => void;
  onOpenPaymentMatch: (group: OrderGroup) => void;
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
};

export default function AdminTodayDashboard({
  orderGroups,
  customers,
  deposits,
  broadcasts,
  onGoOrders,
  onGoShipping,
  onGoCustomers,
  onGoDeposits,
  onOpenPaymentMatch,
  onSaveCustomerMemo,
}: AdminTodayDashboardProps) {
  const [activeWorkTab, setActiveWorkTab] = useState<TodayWorkTab>("all");

  const todayGroups = useMemo(() => getTodayGroups(orderGroups), [orderGroups]);
  const moneySummary = useMemo(() => buildMoneySummary(todayGroups), [todayGroups]);
  const allWorkItems = useMemo(() => buildWorkItems(todayGroups), [todayGroups]);
  const buyerRanking = useMemo(() => buildBuyerRanking(todayGroups), [todayGroups]);
  const productRanking = useMemo(() => buildProductRanking(todayGroups), [todayGroups]);

  const workCounts = useMemo(() => {
    const counts: Record<TodayWorkTab, number> = {
      all: allWorkItems.length,
      payment: 0,
      new: 0,
      shipping: 0,
      issue: 0,
      canceled: 0,
    };

    allWorkItems.forEach((item) => {
      counts[item.tab] += 1;
    });

    return counts;
  }, [allWorkItems]);

  const visibleWorkItems = useMemo(() => {
    if (activeWorkTab === "all") return allWorkItems;
    return allWorkItems.filter((item) => item.tab === activeWorkTab);
  }, [allWorkItems, activeWorkTab]);

  const openPaymentMatchFromToday = (groupId: string) => {
    const targetGroup = todayGroups.find((group) => group.groupId === groupId);

    if (!targetGroup) {
      alert("입금매칭할 주문 정보를 찾지 못했습니다. 주문관리에서 다시 확인해주세요.");
      return;
    }

    onOpenPaymentMatch(targetGroup);
  };

  return (
    <section className="grid gap-4">
      <AdminTodayHeader broadcasts={broadcasts} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <QuickCard label="오늘 주문" value={`${todayGroups.length}건`} desc="당일 기준 주문묶음" onClick={onGoOrders} />
        <QuickCard label="입금확인 필요" value={`${workCounts.payment}건`} desc="미입금/미결제" onClick={() => setActiveWorkTab("payment")} />
        <QuickCard label="배송/출고" value={`${workCounts.shipping}건`} desc="출고 확인 필요" onClick={() => setActiveWorkTab("shipping")} />
        <QuickCard label="특이사항" value={`${workCounts.issue}건`} desc="메모 키워드 감지" onClick={() => setActiveWorkTab("issue")} />
        <QuickCard label="고객" value={`${customers.length}명`} desc="고객관리 이동" onClick={onGoCustomers} />
      </section>

      <AdminTodayMoneySummary summary={moneySummary} />

      <AdminTodayPersistentTasks />

      <div className="grid gap-4 2xl:grid-cols-[1.35fr_0.9fr]">
        <AdminTodayWorkQueue
          activeTab={activeWorkTab}
          setActiveTab={setActiveWorkTab}
          counts={workCounts}
          items={visibleWorkItems}
          onGoOrders={onGoOrders}
          onGoDeposits={onGoDeposits}
          onGoShipping={onGoShipping}
          onOpenPaymentMatch={openPaymentMatchFromToday}
        />

        <section className="grid gap-4">
          <AdminTodayRankings buyers={buyerRanking} products={productRanking} />

          <AdminTodayKakaoPanel
            customers={customers}
            onSaveCustomerMemo={onSaveCustomerMemo}
          />

          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              

              <button
                type="button"
                onClick={onGoDeposits}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
              >
                입금매칭
              </button>
            </div>

            <div className="grid max-h-[260px] gap-2 overflow-y-auto">
              {deposits.slice(0, 8).length === 0 ? (
                <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
                  아직 입금내역이 없습니다.
                </div>
              ) : (
                deposits.slice(0, 8).map((deposit) => (
                  <div key={deposit.id} className="flex items-center justify-between rounded-2xl bg-neutral-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-black text-neutral-950">{deposit.depositor_name || "입금자명 없음"}</div>
                      <div className="text-xs font-bold text-neutral-500">{deposit.match_status || "-"}</div>
                    </div>
                    <div className="text-sm font-black text-neutral-950">
                      {Number(deposit.amount || 0).toLocaleString()}원
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}

function QuickCard({
  label,
  value,
  desc,
  onClick,
}: {
  label: string;
  value: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-3xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.99]"
    >
      <div className="text-xs font-black text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-neutral-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-neutral-500">{desc}</div>
    </button>
  );
}
