"use client";

// components/admin-v2/today/AdminTodayDashboard.tsx
// 목적: 루루동이LIVE Control Center 실무형 관제탑
// 주의: UI/조회/계산 전용. 주문 저장, 입금매칭 저장, 정산 저장, 배송비 계산 변경 없음.

import { useEffect, useMemo, useState } from "react";
import type {
  BroadcastRow,
  CustomerRow,
  DepositRow,
  OrderGroup,
  OrderRow,
  SettingRow,
} from "@/lib/admin-v2/types";
import AdminTodayHeader from "@/components/admin-v2/today/AdminTodayHeader";
import AdminTodayWorkQueue from "@/components/admin-v2/today/AdminTodayWorkQueue";
import AdminTodayCollapsiblePanel from "@/components/admin-v2/today/AdminTodayCollapsiblePanel";
import AdminTodayYoutubeLivePanel from "@/components/admin-v2/today/AdminTodayYoutubeLivePanel";
import AdminTodayPeriodFilter from "@/components/admin-v2/today/AdminTodayPeriodFilter";
import AdminTodayControlSummaryBar from "@/components/admin-v2/today/AdminTodayControlSummaryBar";
import AdminTodayIssueControlPanel from "@/components/admin-v2/today/AdminTodayIssueControlPanel";
import AdminTodayRankingColumn from "@/components/admin-v2/today/AdminTodayRankingColumn";
import { filterOrderGroupsByPeriod, formatPeriodLabel, getTodayDateKey } from "@/components/admin-v2/today/adminTodayPeriodUtils";
import {
  buildMoneySummary,
  buildWorkItems,
  type TodayWorkTab,
} from "@/components/admin-v2/today/adminTodayUtils";

const TODAY_PERIOD_STORAGE_KEY = "ruru-admin-v2-today-period-v1";

type StoredTodayPeriod = {
  startDate?: string;
  endDate?: string;
};

function readStoredTodayPeriod() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(TODAY_PERIOD_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredTodayPeriod;
    const startDate = String(parsed.startDate || "").trim();
    const endDate = String(parsed.endDate || "").trim();

    if (!startDate || !endDate) return null;

    return { startDate, endDate };
  } catch {
    return null;
  }
}

function saveStoredTodayPeriod(startDate: string, endDate: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      TODAY_PERIOD_STORAGE_KEY,
      JSON.stringify({ startDate, endDate })
    );
  } catch {
    // localStorage 저장 실패는 화면 동작을 막지 않습니다.
  }
}

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
  onOpenOrderDetail: (groupId: string) => void;
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
};

export default function AdminTodayDashboard({
  orderGroups,
  customers,
  broadcasts,
  onGoOrders,
  onGoShipping,
  onOpenPaymentMatch,
  onOpenOrderDetail,
  onSaveCustomerMemo,
}: AdminTodayDashboardProps) {
  const [activeWorkTab, setActiveWorkTab] = useState<TodayWorkTab>("all");

  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const [periodStartDate, setPeriodStartDate] = useState(todayDateKey);
  const [periodEndDate, setPeriodEndDate] = useState(todayDateKey);
  const [draftPeriodStartDate, setDraftPeriodStartDate] = useState(todayDateKey);
  const [draftPeriodEndDate, setDraftPeriodEndDate] = useState(todayDateKey);
  const [periodStorageReady, setPeriodStorageReady] = useState(false);
  const [adminTaskOpenCount, setAdminTaskOpenCount] = useState(0);


  useEffect(() => {
    const storedPeriod = readStoredTodayPeriod();

    if (storedPeriod) {
      setPeriodStartDate(storedPeriod.startDate);
      setPeriodEndDate(storedPeriod.endDate);
      setDraftPeriodStartDate(storedPeriod.startDate);
      setDraftPeriodEndDate(storedPeriod.endDate);
    }

    setPeriodStorageReady(true);
  }, []);

  useEffect(() => {
    if (!periodStorageReady) return;
    saveStoredTodayPeriod(periodStartDate, periodEndDate);
  }, [periodStorageReady, periodStartDate, periodEndDate]);

  useEffect(() => {
    let mounted = true;

    const loadAdminTaskOpenCount = async () => {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "GET",
      });

      const result = await response.json().catch(() => null);

      if (!mounted || !response.ok || !result?.ok) {
        return;
      }

      const openCount = ((result.tasks || []) as Array<{ resolved_at?: string | null }>).filter(
        (task) => !task.resolved_at
      ).length;

      setAdminTaskOpenCount(openCount);
    };

    loadAdminTaskOpenCount();

    const refresh = () => {
      loadAdminTaskOpenCount();
    };

    window.addEventListener("ruru-admin-task-created", refresh);
    window.addEventListener("ruru-admin-task-updated", refresh);

    return () => {
      mounted = false;
      window.removeEventListener("ruru-admin-task-created", refresh);
      window.removeEventListener("ruru-admin-task-updated", refresh);
    };
  }, []);

  const todayGroups = useMemo(
    () =>
      filterOrderGroupsByPeriod(orderGroups, {
        startDate: periodStartDate,
        endDate: periodEndDate,
      }),
    [orderGroups, periodStartDate, periodEndDate]
  );

  const periodLabel = useMemo(
    () => formatPeriodLabel(periodStartDate, periodEndDate),
    [periodStartDate, periodEndDate]
  );

  const moneySummary = useMemo(() => buildMoneySummary(todayGroups), [todayGroups]);
  const allWorkItems = useMemo(() => buildWorkItems(todayGroups), [todayGroups]);

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

  const itemQuantity = useMemo(() => {
    return todayGroups
      .flatMap((group) => group.rows)
      .reduce((sum, row) => sum + (Number(row.qty || 1) || 1), 0);
  }, [todayGroups]);

  const openPaymentMatchFromToday = (groupId: string) => {
    const targetGroup = orderGroups.find((group) => group.groupId === groupId);

    if (!targetGroup) {
      alert("입금매칭할 주문 정보를 찾지 못했습니다. 주문관리에서 다시 확인해주세요.");
      return;
    }

    onOpenPaymentMatch(targetGroup);
  };

  return (
    <section className="grid gap-4">
      <AdminTodayHeader
        broadcasts={broadcasts}
        periodControls={
          <AdminTodayPeriodFilter
            draftStartDate={draftPeriodStartDate}
            draftEndDate={draftPeriodEndDate}
            appliedLabel={periodLabel}
            onDraftStartDateChange={setDraftPeriodStartDate}
            onDraftEndDateChange={setDraftPeriodEndDate}
            onApply={() => {
              setPeriodStartDate(draftPeriodStartDate);
              setPeriodEndDate(draftPeriodEndDate);
            }}
            onResetToday={() => {
              setDraftPeriodStartDate(todayDateKey);
              setDraftPeriodEndDate(todayDateKey);
              setPeriodStartDate(todayDateKey);
              setPeriodEndDate(todayDateKey);
            }}
          />
        }
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px] 2xl:items-stretch">
        <main className="grid min-w-0 gap-4">
          <AdminTodayCollapsiblePanel
            title="유튜브 LIVE 채팅"
            description="방송 화면과 채팅을 보면서 주문·입금·문의 처리를 같이 확인합니다."
            badge="방송채팅"
            defaultOpen={true}
          >
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <AdminTodayYoutubeLivePanel />
            </div>
          </AdminTodayCollapsiblePanel>

          <AdminTodayControlSummaryBar
            summary={moneySummary}
            orderCount={todayGroups.length}
            itemQuantity={itemQuantity}
            issueCount={adminTaskOpenCount}
            periodLabel={periodLabel}
            periodStorageReady={periodStorageReady}
          />

        </main>

        <aside className="mt-4 grid min-w-0 content-start gap-4 2xl:mt-0">
          <AdminTodayIssueControlPanel
            customers={customers}
            onSaveCustomerMemo={onSaveCustomerMemo}
          />
        </aside>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px] 2xl:items-stretch">
        <div className="min-w-0 2xl:h-full">
          <AdminTodayWorkQueue
          activeTab={activeWorkTab}
          setActiveTab={setActiveWorkTab}
          counts={workCounts}
          items={visibleWorkItems}
          onGoOrders={onGoOrders}
          onGoDeposits={() => undefined}
          onGoShipping={onGoShipping}
          onOpenPaymentMatch={openPaymentMatchFromToday}
          onOpenOrderDetail={onOpenOrderDetail}
        />
        </div>

        <aside className="min-w-0 2xl:h-full">
          <AdminTodayRankingColumn groups={todayGroups} />
        </aside>
      </div>
    </section>
  );
}
