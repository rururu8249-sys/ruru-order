"use client";

import { Fragment, useMemo, useState } from "react";
import type { SettlementBroadcastRow } from "./settlementTypes";
import { won } from "./settlementUtils";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

function getVisiblePages(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(pageCount, start + 4);

  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function numberValue(value: unknown) {
  const number = Number(value || 0);

  return Number.isFinite(number) ? Math.round(number) : 0;
}

export default function SettlementBroadcastTable({
  rows,
}: {
  rows: SettlementBroadcastRow[];
}) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const visibleRows = useMemo(() => {
    return rows.slice(startIndex, endIndex);
  }, [rows, startIndex, endIndex]);

  const visiblePages = useMemo(() => {
    return getVisiblePages(safePage, pageCount);
  }, [safePage, pageCount]);

  const changePageSize = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  const movePage = (nextPage: number) => {
    setPage(Math.min(Math.max(1, nextPage), pageCount));
  };

  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <div className="text-lg font-black text-slate-950">방송별 정산 리스트</div>
          <div className="mt-1 text-xs font-bold text-slate-400">
            방송 날짜별로 결제완료 매출, 아직 못 받은 금액, 현재 실수익을 한 줄씩 확인합니다.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}개 보기
              </option>
            ))}
          </select>

          <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">
            총 {rows.length.toLocaleString()}개
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[940px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50 text-xs font-black text-slate-500">
              <th className="px-4 py-3 text-left">날짜/방송명</th>
              <th className="px-4 py-3 text-right">주문서 수</th>
              <th className="px-4 py-3 text-right">결제완료 매출</th>
              <th className="px-4 py-3 text-right">아직 못 받은 금액</th>
              <th className="px-4 py-3 text-right">빠지는 돈</th>
              <th className="px-4 py-3 text-right">현재 실수익</th>
              <th className="px-4 py-3 text-center">상세</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm font-bold text-slate-400">
                  표시할 방송별 정산 내역이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const totalExpense = numberValue(row.actualCardFee) + numberValue(row.warehouseOtherExpense);
                const isExpanded = expandedRowKey === row.key;

                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-slate-100 hover:bg-blue-50/30">
                      <td className="border-b border-slate-100 px-4 py-4">
                        <div className="max-w-[260px] truncate text-sm font-black text-slate-900">{row.label}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">{row.dateKey}</div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-slate-700">
                        {row.count.toLocaleString()}건
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-blue-700">
                        {won(row.paidAmount)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-orange-700">
                        {won(row.unpaidAmount)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-slate-700">
                        -{won(totalExpense)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-slate-950">
                        {won(row.netAmount)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedRowKey(isExpanded ? null : row.key)}
                          className="rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50"
                        >
                          {isExpanded ? "닫기" : "보기"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td colSpan={7} className="border-b border-blue-100 bg-blue-50/45 px-4 py-4">
                          <div className="grid gap-3 text-xs font-bold text-slate-600 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">주문서 총금액</div>
                              <div className="mt-1 font-black text-slate-950">{won(row.totalOrderAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">무통장 결제완료</div>
                              <div className="mt-1 font-black text-blue-700">{won(row.bankAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">카드 결제완료</div>
                              <div className="mt-1 font-black text-blue-700">{won(row.cardAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">추가 정산 수익</div>
                              <div className="mt-1 font-black text-slate-950">{won(row.manualIncomeAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">카드 수수료</div>
                              <div className="mt-1 font-black text-slate-950">-{won(row.actualCardFee)}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                              <div className="text-slate-400">창고/기타 지출</div>
                              <div className="mt-1 font-black text-slate-950">-{won(row.warehouseOtherExpense)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
        <div className="text-xs font-bold text-slate-400">
          {rows.length === 0
            ? "0개"
            : `${(startIndex + 1).toLocaleString()}-${Math.min(endIndex, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}개`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => movePage(1)}
            disabled={safePage === 1}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            처음
          </button>

          <button
            type="button"
            onClick={() => movePage(safePage - 1)}
            disabled={safePage === 1}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            이전
          </button>

          {visiblePages[0] > 1 ? (
            <span className="px-1 text-sm font-black text-slate-300">...</span>
          ) : null}

          {visiblePages.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => movePage(pageNumber)}
              className={
                pageNumber === safePage
                  ? "h-10 min-w-10 rounded-2xl bg-blue-600 px-3 text-sm font-black text-white shadow-sm"
                  : "h-10 min-w-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm hover:bg-slate-50"
              }
            >
              {pageNumber}
            </button>
          ))}

          {visiblePages[visiblePages.length - 1] < pageCount ? (
            <span className="px-1 text-sm font-black text-slate-300">...</span>
          ) : null}

          <button
            type="button"
            onClick={() => movePage(safePage + 1)}
            disabled={safePage === pageCount}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            다음
          </button>

          <button
            type="button"
            onClick={() => movePage(pageCount)}
            disabled={safePage === pageCount}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            마지막
          </button>
        </div>
      </div>
    </div>
  );
}
