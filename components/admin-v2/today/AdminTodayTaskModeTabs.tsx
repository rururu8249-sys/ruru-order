"use client";

// components/admin-v2/today/AdminTodayTaskModeTabs.tsx
// 목적: 해결 대기 업무 / 완료 이력 탭 표시
// 주의: UI 전용. 주문/입금/배송/정산 로직 없음.

export type AdminTaskViewMode = "open" | "resolved";

export default function AdminTodayTaskModeTabs({
  value,
  openCount,
  resolvedCount,
  onChange,
}: {
  value: AdminTaskViewMode;
  openCount: number;
  resolvedCount: number;
  onChange: (value: AdminTaskViewMode) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
      <button
        type="button"
        onClick={() => onChange("open")}
        className={`rounded-xl px-3 py-2.5 text-sm font-black active:scale-[0.98] ${
          value === "open"
            ? "bg-white text-neutral-950 shadow-sm"
            : "text-neutral-500"
        }`}
      >
        해결 대기 {openCount}
      </button>

      <button
        type="button"
        onClick={() => onChange("resolved")}
        className={`rounded-xl px-3 py-2.5 text-sm font-black active:scale-[0.98] ${
          value === "resolved"
            ? "bg-white text-neutral-950 shadow-sm"
            : "text-neutral-500"
        }`}
      >
        완료 이력 {resolvedCount}
      </button>
    </div>
  );
}
