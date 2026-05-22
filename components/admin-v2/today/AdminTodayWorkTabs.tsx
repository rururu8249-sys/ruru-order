"use client";

// components/admin-v2/today/AdminTodayWorkTabs.tsx
// 목적: 오늘할일 업무 탭 UI
// 주의: UI 전용.

import type { TodayWorkTab } from "@/components/admin-v2/today/adminTodayUtils";

const TABS: Array<{ key: TodayWorkTab; label: string }> = [
  { key: "all", label: "전체" },
  { key: "payment", label: "입금확인 필요" },
  { key: "new", label: "신규주문" },
  { key: "shipping", label: "배송처리" },
  { key: "issue", label: "특이사항" },
  { key: "canceled", label: "취소" },
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
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setActiveTab(tab.key)}
          className={`rounded-xl px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
            activeTab === tab.key
              ? "bg-neutral-950 text-white"
              : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          {tab.label} {counts[tab.key] || 0}
        </button>
      ))}
    </div>
  );
}
