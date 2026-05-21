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
import { matchesTodayWorkQueueFilters } from "@/components/admin-v2/today/adminTodayWorkQueueFilterUtils";

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
  void onGoDeposits;

  const [page, setPage] = useState(1);
  const [queueKeyword, setQueueKeyword] = useState("");
  const [queueStartDate, setQueueStartDate] = useState("");
  const [queueEndDate, setQueueEndDate] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesTodayWorkQueueFilters(item, {
        keyword: queueKeyword,
        startDate: queueStartDate,
        endDate: queueEndDate,
      })
    );
  }, [items, queueKeyword, queueStartDate, queueEndDate]);

  const { listRef, firstRowRef, pageSize } = useAutoTodayWorkPageSize({
    triggerKey: `${activeTab}:${filteredItems.length}:${queueKeyword}:${queueStartDate}:${queueEndDate}`,
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
    <section className="flex h-full min-h-[520px] flex-col rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            오늘 입금 빠른처리
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            오른쪽 패널 높이에 맞춰 표시 개수와 페이지 수가 자동 조정됩니다.
          </p>
        </div>

        <AdminTodayWorkTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          counts={counts}
        />

          <AdminTodayWorkQueueFilterBar
            keyword={queueKeyword}
            startDate={queueStartDate}
            endDate={queueEndDate}
            totalCount={items.length}
            filteredCount={filteredItems.length}
            onKeywordChange={(value) => {
              setQueueKeyword(value);
              setPage(1);
            }}
            onStartDateChange={(value) => {
              setQueueStartDate(value);
              setPage(1);
            }}
            onEndDateChange={(value) => {
              setQueueEndDate(value);
              setPage(1);
            }}
            onReset={() => {
              setQueueKeyword("");
              setQueueStartDate("");
              setQueueEndDate("");
              setPage(1);
            }}
          />
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
                className="grid gap-3 px-4 py-3 lg:grid-cols-[112px_minmax(260px,1fr)_minmax(210px,300px)_auto] lg:items-center"
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-black text-neutral-950">
                      {item.nickname || "닉네임 없음"}
                    </span>
                    <span className="text-sm font-black text-neutral-700">
                      {item.amountText}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-black text-neutral-600">
                      {item.statusText}
                    </span>
                  </div>

                  <div className="mt-1 truncate text-xs font-bold text-neutral-500">
                    {item.product || "상품명 없음"}
                  </div>

                  <div className="mt-1 text-[11px] font-bold text-neutral-400 lg:hidden">
                    {item.timeText}
                  </div>
                </div>

                <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                  <div className="grid gap-1 text-[11px] font-bold text-neutral-500">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">주문번호</span>
                      <span className="truncate font-black text-neutral-700">
                        {item.orderCode || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">주문일시</span>
                      <span className="truncate font-black text-neutral-700">
                        {item.timeText || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">처리구분</span>
                      <span className="truncate font-black text-neutral-700">
                        {item.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-start gap-1.5 lg:justify-end">
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
