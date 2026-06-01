"use client";

// components/admin-v2/today/AdminTodayWorkTabs.tsx
// 목적: 오늘할일 빠른처리 탭
// 주의: 화면 필터 전용. DB 저장/입금매칭/정산 로직 없음.

import type { TodayWorkTab } from "@/components/admin-v2/today/adminTodayUtils";

const TABS: Array<{ key: TodayWorkTab; label: string }> = [
  { key: "all", label: "전체" },
  { key: "payment", label: "입금매칭 필요" },
  { key: "new", label: "신규주문" },
  { key: "shipping", label: "배송처리" },
  { key: "issue", label: "특이사항" },
  { key: "canceled", label: "주문서취소" },
];

export default function AdminTodayWorkTabs({
  activeTab,
  setActiveTab,
  counts,
}: {
  activeTab: TodayWorkTab;
  setActiveTab: (value: TodayWorkTab) => void;
  counts: Record<TodayWorkTab, number>;
}) {
  return (
    <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        const count = counts[tab.key] || 0;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              "h-9 shrink-0 whitespace-nowrap rounded-xl px-3 text-xs font-black active:scale-[0.98]",
              active
                ? "bg-blue-600 text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:bg-blue-50",
            ].join(" ")}
          >
            {tab.label} {count.toLocaleString()}
          </button>
        );
      })}
    </div>
  );
}
