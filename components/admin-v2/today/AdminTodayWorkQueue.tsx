"use client";

// components/admin-v2/today/AdminTodayWorkQueue.tsx
// 목적: 주문관리 표 구조를 기반으로 오늘할일 업무 큐 표시
// 주의: UI/이동 버튼 전용. 주문상태 저장/입금매칭 저장/돈계산/배송저장 로직 없음.

import { useEffect, useMemo, useState } from "react";
import type { TodayWorkItem, TodayWorkTab } from "@/components/admin-v2/today/adminTodayUtils";
import AdminTodayWorkTabs from "@/components/admin-v2/today/AdminTodayWorkTabs";
import AdminTodayWorkPagination from "@/components/admin-v2/today/AdminTodayWorkPagination";
import AdminTodayWorkQueueFilterBar from "@/components/admin-v2/today/AdminTodayWorkQueueFilterBar";
import { matchesTodayWorkQueueSearch } from "@/components/admin-v2/today/adminTodayWorkQueueFilterUtils";

const TODAY_ORDER_GRID =
  "grid-cols-[0.9fr_1.45fr_1.1fr_1.05fr_minmax(320px,3fr)_0.9fr_0.9fr_0.95fr_0.75fr]";

const statusClass = (label: string) => {
  if (label.includes("취소")) return "bg-rose-100 text-rose-700";
  if (label.includes("미결제") || label.includes("대기")) return "bg-amber-100 text-amber-800";
  if (label.includes("완료") || label.includes("입금확인")) return "bg-emerald-100 text-emerald-700";
  return "bg-neutral-100 text-neutral-700";
};

const deliveryClass = (label: string) => {
  if (label.includes("발송완료") || label.includes("출고완료")) return "bg-indigo-100 text-indigo-700";
  if (label.includes("포장") || label.includes("출고")) return "bg-blue-100 text-blue-700";
  if (label.includes("미설정")) return "bg-neutral-100 text-neutral-600";
  return "bg-neutral-100 text-neutral-700";
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
  void onGoOrders;
  void onGoDeposits;

  const [page, setPage] = useState(1);
  const [draftKeyword, setDraftKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item) => matchesTodayWorkQueueSearch(item, appliedKeyword));
  }, [items, appliedKeyword]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [activeTab, filteredItems.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page]);

  const safeSetPage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-neutral-200 p-3 xl:grid-cols-[minmax(210px,0.55fr)_minmax(520px,1fr)_minmax(390px,0.85fr)] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            오늘할일 빠른처리
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-500">
            주문관리와 같은 표 구조로 입금·배송·특이사항을 처리합니다.
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

      <div className="w-full overflow-x-auto">
        <div className="min-w-[1420px]">
          <div className={`hidden w-full ${TODAY_ORDER_GRID} bg-neutral-900 px-4 py-3 text-[13px] font-black text-white lg:grid`}>
            <div className="text-center">주문상태</div>
            <div className="text-center">주문번호</div>
            <div className="text-center">주문시간</div>
            <div className="text-center">고객</div>
            <div className="text-center">주문내역</div>
            <div className="text-center">입금</div>
            <div className="text-center">금액</div>
            <div className="text-center">배송처리</div>
            <div className="text-center">상세</div>
          </div>

          {visibleItems.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm font-black text-neutral-400">
              현재 조건에 맞는 업무가 없습니다.
            </div>
          ) : (
            visibleItems.map((item) => {
              const fullOrderCode = item.fullOrderCode || item.orderCode || "-";

              return (
                <div
                  key={item.id}
                  className={`grid w-full ${TODAY_ORDER_GRID} border-t border-neutral-100 px-4 py-4 text-[14px] first:border-t-0 hover:bg-neutral-50 lg:items-center`}
                >
                  <div className="min-w-0 px-2 text-center">
                    <span className={`inline-flex max-w-full rounded-lg px-2.5 py-1 text-[11px] font-black ${statusClass(item.orderStatusText)}`}>
                      {item.orderStatusText}
                    </span>
                    <div className="mt-1 text-[10px] font-black text-neutral-400">
                      {item.label}
                    </div>
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenOrderDetail(item.id)}
                      className="whitespace-normal break-all text-center text-[12px] font-black leading-snug text-blue-700 underline-offset-2 hover:underline"
                      title={fullOrderCode}
                    >
                      {fullOrderCode}
                    </button>
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    <div className="whitespace-normal text-[12px] font-bold leading-snug text-neutral-500">
                      {item.timeText || "-"}
                    </div>
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    <div className="truncate text-[15px] font-black text-neutral-950" title={item.nickname || ""}>
                      {item.nickname || "-"}
                    </div>
                  </div>

                  <div className="min-w-0 px-3">
                    <div className="grid gap-1">
                      {item.productLines.map((line, index) => (
                        <div
                          key={`${item.id}-product-${index}`}
                          className="whitespace-normal break-words text-[13px] font-bold leading-snug text-neutral-800"
                        >
                          {line}
                        </div>
                      ))}
                    </div>

                    {item.memoPreview ? (
                      <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                        메모: {item.memoPreview}
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    {item.tab === "payment" ? (
                      <button
                        type="button"
                        onClick={() => onOpenPaymentMatch(item.id)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-black text-white active:scale-[0.98]"
                      >
                        입금매칭
                      </button>
                    ) : (
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-black ${statusClass(item.orderStatusText)}`}>
                        {item.orderStatusText}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 px-2 text-right">
                    <div className="text-[15px] font-black tracking-[-0.03em] text-neutral-950">
                      {item.amountText}
                    </div>
                    <div className="mt-0.5 text-[10px] font-bold text-neutral-400">
                      총 {item.itemQuantityText}
                    </div>
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-black ${deliveryClass(item.deliveryStageText)}`}>
                      {item.deliveryStageText}
                    </span>

                    {item.tab === "shipping" ? (
                      <button
                        type="button"
                        onClick={onGoShipping}
                        className="mt-1 block w-full rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-black text-white active:scale-[0.98]"
                      >
                        송장관리
                      </button>
                    ) : null}
                  </div>

                  <div className="min-w-0 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenOrderDetail(item.id)}
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] font-black text-neutral-700 active:scale-[0.98]"
                    >
                      상세보기
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
