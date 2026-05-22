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
    fallback: 7,
    min: 5,
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
    <section className="flex h-full min-h-[560px] flex-col rounded-3xl border border-neutral-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-neutral-100 p-3 xl:grid-cols-[minmax(210px,0.55fr)_minmax(520px,1fr)_minmax(390px,0.85fr)] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            오늘할일 빠른처리
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-500">
            입금·배송·특이사항을 한 화면에서 처리합니다.
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

      <div ref={listRef} className="flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm font-black text-neutral-400">
            현재 표시할 업무가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1260px]">
              <div className="grid grid-cols-[112px_170px_180px_minmax(260px,1fr)_64px_140px_190px_minmax(130px,170px)_150px] border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-black text-neutral-500">
                <div>구분</div>
                <div>주문번호 / 주문일시</div>
                <div>고객닉네임</div>
                <div>주문상품 / 주문옵션</div>
                <div className="text-center">수량</div>
                <div className="text-right">주문금액</div>
                <div className="text-center">상태</div>
                <div>주문 메모</div>
                <div className="text-center">작업</div>
              </div>

              <div className="divide-y divide-neutral-100">
                {visibleItems.map((item, index) => (
                  <div
                    key={item.id}
                    ref={index === 0 ? firstRowRef : undefined}
                    className="grid grid-cols-[112px_170px_180px_minmax(260px,1fr)_64px_140px_190px_minmax(130px,170px)_150px] items-center px-3 py-3 text-xs"
                  >
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-black ${toneClass[item.tone]}`}>
                        {item.label}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenOrderDetail(item.id)}
                        className="block truncate text-left text-xs font-black text-blue-700 underline-offset-2 hover:underline"
                      >
                        {item.orderCode || "-"}
                      </button>
                      <div className="mt-0.5 text-[11px] font-bold text-neutral-400">
                        {item.timeText || "-"}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-neutral-950">
                        {item.nickname || "닉네임 없음"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.metaBadges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-600"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="grid gap-0.5">
                        {item.productLines.slice(0, 3).map((line, lineIndex) => (
                          <div
                            key={`${item.id}-line-${lineIndex}`}
                            className="truncate text-xs font-bold text-neutral-700"
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-center text-sm font-black text-neutral-900">
                      {item.itemQuantityText}
                    </div>

                    <div className="text-right text-sm font-black text-neutral-950">
                      {item.amountText}
                    </div>

                    <div className="flex min-w-0 flex-wrap justify-center gap-1">
                      <AdminTodayWorkItemStatusPills
                        orderStatusText={item.orderStatusText}
                        deliveryStageText={item.deliveryStageText}
                      />
                    </div>

                    <div className="min-w-0">
                      {item.memoPreview ? (
                        <div className="truncate rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                          {item.memoPreview}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-neutral-300">-</span>
                      )}
                    </div>

                    <div className="grid gap-1.5">
                      {item.tab === "payment" ? (
                        <button
                          type="button"
                          onClick={() => onOpenPaymentMatch(item.id)}
                          className="h-8 rounded-lg bg-blue-600 px-2 text-[11px] font-black text-white active:scale-[0.98]"
                        >
                          입금매칭
                        </button>
                      ) : item.tab === "shipping" ? (
                        <button
                          type="button"
                          onClick={onGoShipping}
                          className="h-8 rounded-lg bg-blue-600 px-2 text-[11px] font-black text-white active:scale-[0.98]"
                        >
                          송장관리
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenOrderDetail(item.id)}
                          className="h-8 rounded-lg bg-neutral-950 px-2 text-[11px] font-black text-white active:scale-[0.98]"
                        >
                          확인필요
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenOrderDetail(item.id)}
                        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-black text-neutral-700 active:scale-[0.98]"
                      >
                        상세보기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-3 py-3">
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
