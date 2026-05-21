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
import AdminTodayKakaoPanel from "@/components/admin-v2/today/AdminTodayKakaoPanel";
import AdminTodayCollapsiblePanel from "@/components/admin-v2/today/AdminTodayCollapsiblePanel";
import AdminTodayYoutubeLivePanel from "@/components/admin-v2/today/AdminTodayYoutubeLivePanel";
import AdminTodayPeriodFilter from "@/components/admin-v2/today/AdminTodayPeriodFilter";
import { filterOrderGroupsByPeriod, formatPeriodLabel, getTodayDateKey } from "@/components/admin-v2/today/adminTodayPeriodUtils";
import {
  buildMoneySummary,
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
  onOpenOrderDetail: (groupId: string) => void;
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
};

export default function AdminTodayDashboard({
  orderGroups,
  customers,
  broadcasts,
  onGoOrders,
  onGoShipping,
  onGoCustomers,
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




      <AdminTodayCollapsiblePanel
        title="오늘 핵심 현황 / 돈 흐름"
        description="주문·입금·배송·고객 숫자와 돈 흐름은 필요할 때 펼쳐서 확인합니다."
        badge="요약"
        defaultOpen={false}
      >
        <div className="grid gap-3">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <QuickCard
              label="기간별 주문"
              value={`${todayGroups.length}건`}
              desc="선택 기간 기준 주문묶음"
              onClick={onGoOrders}
            />
            <QuickCard
              label="결제확인 필요"
              value={`${workCounts.payment}건`}
              desc="미결제"
              onClick={() => setActiveWorkTab("payment")}
            />
            <QuickCard
              label="배송처리"
              value={`${workCounts.shipping}건`}
              desc="포장/발송 확인"
              onClick={() => setActiveWorkTab("shipping")}
            />
            <QuickCard
              label="특이사항"
              value={`${workCounts.issue}건`}
              desc="메모 키워드 감지"
              onClick={() => setActiveWorkTab("issue")}
            />
            <QuickCard
              label="고객"
              value={`${customers.length}명`}
              desc="고객관리 이동"
              onClick={onGoCustomers}
            />
          </section>

          <AdminTodayMoneySummary summary={moneySummary} />
        </div>
      </AdminTodayCollapsiblePanel>

      <AdminTodayCollapsiblePanel
        title="고객 이슈 처리 큐"
        description="카톡/고객대화에서 등록한 반품·교환·환불·배송 이슈를 필요할 때 펼쳐서 확인합니다."
        badge="처리 이슈"
        defaultOpen={false}
      >
        <AdminTodayPersistentTasks />
      </AdminTodayCollapsiblePanel>

      <AdminTodayCollapsiblePanel
        title="유튜브 LIVE 채팅"
        description="방송 화면과 채팅을 보면서 주문·입금·문의 처리를 같이 확인합니다."
        badge="방송채팅"
        defaultOpen={false}
      >
        <AdminTodayYoutubeLivePanel />
      </AdminTodayCollapsiblePanel>

      <div className="grid gap-4 2xl:grid-cols-[1.35fr_0.9fr]">
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

        <section className="grid gap-4">

          <AdminTodayCollapsiblePanel
            title="카톡 응대 업무"
            description="대화 붙여넣기, 이슈태그 선택, 분석문구 복사, 오늘할일 등록은 필요할 때만 펼쳐서 사용합니다."
            badge="카톡/메모"
            defaultOpen={false}
          >
            <AdminTodayKakaoPanel
              customers={customers}
              onSaveCustomerMemo={onSaveCustomerMemo}
            />
          </AdminTodayCollapsiblePanel>
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
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-neutral-950">
        {value}
      </div>
      <div className="mt-1 text-xs font-bold text-neutral-500">{desc}</div>
    </button>
  );
}
