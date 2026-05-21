"use client";

// components/admin-v2/today/AdminTodayWorkQueue.tsx
// 목적: 주문관리 데이터를 오늘할일 업무 큐로 표시
// 주의: UI/이동 버튼 전용. 주문상태 저장/입금매칭 저장 로직 없음.

import type { TodayWorkItem, TodayWorkTab } from "@/components/admin-v2/today/adminTodayUtils";
import AdminTodayWorkTabs from "@/components/admin-v2/today/AdminTodayWorkTabs";

const toneClass = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  amber: "bg-amber-50 text-amber-800 border-amber-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rose: "bg-rose-50 text-rose-700 border-rose-100",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

export default function AdminTodayWorkQueue({
  activeTab,
  setActiveTab,
  counts,
  items,
  onGoOrders,
  onGoDeposits,
  onGoShipping,
  onOpenPaymentMatch,
}: {
  activeTab: TodayWorkTab;
  setActiveTab: (value: TodayWorkTab) => void;
  counts: Record<TodayWorkTab, number>;
  items: TodayWorkItem[];
  onGoOrders: () => void;
  onGoDeposits: () => void;
  onGoShipping: () => void;
  onOpenPaymentMatch: (groupId: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            오늘 입금 빠른처리
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            오늘 미입금 주문과 수동매칭을 여기에서 바로 처리합니다.
          </p>
        </div>
        <AdminTodayWorkTabs activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} />
      </div>

      <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-neutral-100">
        {items.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm font-black text-neutral-400">
            현재 표시할 업무가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {items.slice(0, 50).map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[108px_minmax(320px,720px)_auto] lg:items-center lg:justify-start">
                <div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${toneClass[item.tone]}`}>
                    {item.label}
                  </span>
                  <div className="mt-1 text-[11px] font-bold text-neutral-400">
                    {item.orderCode}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-neutral-950">{item.nickname}</span>
                    <span className="text-sm font-black text-neutral-700">{item.amountText}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-black text-neutral-600">
                      {item.statusText}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs font-bold text-neutral-500">
                    {item.product}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-neutral-400">
                    {item.timeText}
                  </div>
                </div>

                <div className="flex flex-wrap justify-start gap-1.5 lg:pl-2">
                  <button
                    type="button"
                    onClick={onGoOrders}
                    className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                  >
                    주문관리
                  </button>
                  {item.tab === "payment" ? (
                    <button
                      type="button"
                      onClick={() => onOpenPaymentMatch(item.id)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                    >
                      입금매칭
                    </button>
                  ) : null}
                  {item.tab === "shipping" ? (
                    <button
                      type="button"
                      onClick={onGoShipping}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
                    >
                      송장관리
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 50 ? (
        <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-500">
          현재 50건까지만 표시 중입니다. 다음 단계에서 페이지네이션을 붙이면 됩니다.
        </div>
      ) : null}
    </section>
  );
}
