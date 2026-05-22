"use client";

// components/admin-v2/today/AdminTodayWorkQueue.tsx
// 목적: 주문관리 데이터를 오늘할일 업무 큐로 표시
// 주의: UI/이동 버튼 전용. 주문상태 저장/입금매칭 저장 로직 없음.

import { useMemo, useState, useEffect } from "react";
import type { TodayWorkItem, TodayWorkTab } from "@/components/admin-v2/today/adminTodayUtils";
import AdminTodayWorkTabs from "@/components/admin-v2/today/AdminTodayWorkTabs";
import AdminTodayWorkPagination from "@/components/admin-v2/today/AdminTodayWorkPagination";
import useAutoTodayWorkPageSize from "@/components/admin-v2/today/useAutoTodayWorkPageSize";
import AdminTodayWorkQueueFilterBar from "@/components/admin-v2/today/AdminTodayWorkQueueFilterBar";
import AdminTodayWorkItemStatusPills from "@/components/admin-v2/today/AdminTodayWorkItemStatusPills";
import { matchesTodayWorkQueueSearch } from "@/components/admin-v2/today/adminTodayWorkQueueFilterUtils";

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
  onOpenOrderDetail,
}: {
  activeTab: TodayWorkTab;
  setActiveTab: (value: TodayWorkTab) => void;
  counts: Record<TodayWorkTab, number>;
  items: TodayWorkItem[];
  onGoOrders: () => void;
  onGoDeposits: () => void;
  onGoShipping: () => void;
  onOpenPaymentMatch: (groupId: string) => void;
  onOpenOrderDetail: (groupId: string) => void;
}) {
  void onGoDeposits;
  void onGoOrders;

  const [page, setPage] = useState(1);
  const [draftKeyword, setDraftKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item) => matchesTodayWorkQueueSearch(item, appliedKeyword));
  }, [items, appliedKeyword]);

  const { listRef, firstRowRef, pageSize } = useAutoTodayWorkPageSize({
    triggerKey: `${activeTab}:${filteredItems.length}:${appliedKeyword}`,
    fallback: 4,
    min: 3,
    max: 12,
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [activeTab, filteredItems.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const safeSetPage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <section className="flex h-full min-h-[520px] flex-col rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="mb-3 grid gap-2 xl:grid-cols-[minmax(210px,0.7fr)_minmax(540px,1.15fr)_minmax(390px,0.9fr)] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            오늘할일 빠른처리
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-500">
            입금·배송·특이사항을 빠르게 처리합니다.
          </p>
        </div>

        <div className="min-w-0">
          <AdminTodayWorkTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            counts={counts}
          />
        </div>

        <div className="min-w-0">
          <AdminTodayWorkQueueFilterBar
            draftKeyword={draftKeyword}
            appliedKeyword={appliedKeyword}
            totalCount={items.length}
            filteredCount={filteredItems.length}
            onDraftKeywordChange={setDraftKeyword}
            onSearch={() => {
              setAppliedKeyword(draftKeyword);
              setPage(1);
            }}
            onReset={() => {
              setDraftKeyword("");
              setAppliedKeyword("");
              setPage(1);
            }}
          />
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-hidden rounded-2xl border border-neutral-100">
        {items.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm font-black text-neutral-400">
            현재 표시할 업무가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {visibleItems.map((item, index) => (
              <div
                key={item.id}
                ref={index === 0 ? firstRowRef : undefined}
                className="grid gap-3 px-3 py-3 lg:grid-cols-[108px_minmax(560px,1fr)_minmax(240px,300px)_132px] lg:items-center"
              >
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${toneClass[item.tone]}`}>
                    {item.label}
                  </span>
                  <div className="mt-1 truncate text-[11px] font-black text-neutral-400">
                    {item.orderCode || "-"}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black tracking-[-0.03em] text-neutral-950">
                        {item.nickname || "닉네임 없음"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {item.metaBadges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-black text-neutral-600"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right text-lg font-black tracking-[-0.04em] text-neutral-950">
                      {item.amountText}
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1 rounded-2xl bg-neutral-50 px-3 py-2">
                    {item.productLines.map((line, lineIndex) => (
                      <div
                        key={`${item.id}-line-${lineIndex}`}
                        className="flex min-w-0 items-center justify-between gap-2 text-xs font-bold"
                      >
                        <span className="min-w-0 truncate text-neutral-700">
                          {line}
                        </span>
                        {lineIndex === 0 ? (
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-neutral-500">
                            {item.itemQuantityText}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {item.memoPreview ? (
                    <div className="mt-1 truncate rounded-xl bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                      메모: {item.memoPreview}
                    </div>
                  ) : null}

                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <AdminTodayWorkItemStatusPills
                      orderStatusText={item.orderStatusText}
                      deliveryStageText={item.deliveryStageText}
                    />
                  </div>

                  <div className="mt-1 text-[11px] font-bold text-neutral-400 lg:hidden">
                    {item.timeText}
                  </div>
                </div>

                <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                  <div className="grid gap-1 text-[11px] font-bold text-neutral-500">
                    <InfoLine label="주문번호" value={item.orderCode || "-"} />
                    <InfoLine label="주문일시" value={item.timeText || "-"} />
                    <InfoLine label="주문상태" value={item.orderStatusText || "-"} tone="emerald" />
                    <InfoLine label="배송처리" value={item.deliveryStageText || "-"} tone="blue" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => onOpenOrderDetail(item.id)}
                    className="h-9 rounded-lg bg-neutral-950 px-3 text-xs font-black text-white active:scale-[0.98]"
                  >
                    상세열기
                  </button>

                  {item.tab === "payment" ? (
                    <button
                      type="button"
                      onClick={() => onOpenPaymentMatch(item.id)}
                      className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-black text-white active:scale-[0.98]"
                    >
                      입금매칭
                    </button>
                  ) : null}

                  {item.tab === "shipping" ? (
                    <button
                      type="button"
                      onClick={onGoShipping}
                      className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-black text-neutral-700 active:scale-[0.98]"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black text-neutral-400">
          표시 {visibleItems.length}건 / 검색결과 {filteredItems.length}건 / 전체 {items.length}건 · 한 페이지 {pageSize}건
        </div>

        <AdminTodayWorkPagination
          page={page}
          totalPages={totalPages}
          onChange={safeSetPage}
        />
      </div>
    </section>
  );
}

function InfoLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "blue";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "blue"
        ? "text-blue-700"
        : "text-neutral-700";

  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2">
      <span className="text-neutral-400">{label}</span>
      <span className={`truncate text-right font-black ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
