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
    <div className="overflow-hidden rounded-[30px] border border-line bg-surface shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-4">
        <div>
          <div className="text-lg font-black text-ink">방송별 정산</div>
          <div className="mt-1 text-xs font-bold text-ink-mute">
            방송 날짜별로 얼마 팔고, 아직 못 받은 돈과 현재 남은 돈을 확인합니다.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}개 보기
              </option>
            ))}
          </select>

          <div className="rounded-full bg-surface-3 px-3 py-2 text-xs font-black text-ink-soft">
            총 {rows.length.toLocaleString()}개
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[900px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-surface-2 text-xs font-black text-ink-soft">
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
                <td colSpan={7} className="px-4 py-16 text-center text-sm font-bold text-ink-mute">
                  표시할 방송별 정산 내역이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const totalExpense = numberValue(row.actualCardFee) + numberValue(row.warehouseOtherExpense);
                const isExpanded = expandedRowKey === row.key;

                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-line-soft hover:bg-info-bg">
                      <td className="border-b border-line-soft px-4 py-4">
                        <div className="max-w-[260px] truncate text-sm font-black text-ink">{row.label}</div>
                        <div className="mt-1 text-xs font-bold text-ink-mute">{row.dateKey}</div>
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black text-ink">
                        {row.count.toLocaleString()}건
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-info-tx">
                        {won(row.paidAmount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-warn-tx">
                        {won(row.unpaidAmount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-ink">
                        -{won(totalExpense)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-ink">
                        {won(row.netAmount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedRowKey(isExpanded ? null : row.key)}
                          className="rounded-2xl border border-line bg-surface px-3 py-2 text-xs font-black text-info-tx shadow-sm transition hover:bg-info-bg"
                        >
                          {isExpanded ? "닫기" : "보기"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td colSpan={7} className="border-b border-line bg-info-bg px-4 py-4">
                          <div className="grid gap-3 text-xs font-bold text-ink-soft sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">주문서 총금액</div>
                              <div className="mt-1 font-black text-ink">{won(row.totalOrderAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">무통장 결제완료</div>
                              <div className="mt-1 font-black text-info-tx">{won(row.bankAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">카드 결제완료</div>
                              <div className="mt-1 font-black text-info-tx">{won(row.cardAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">추가 정산 수익</div>
                              <div className="mt-1 font-black text-ink">{won(row.manualIncomeAmount)}</div>
                            </div>
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">카드 수수료</div>
                              <div className="mt-1 font-black text-ink">-{won(row.actualCardFee)}</div>
                            </div>
                            <div className="rounded-2xl bg-surface px-3 py-3 shadow-sm">
                              <div className="text-ink-mute">창고/기타 지출</div>
                              <div className="mt-1 font-black text-ink">-{won(row.warehouseOtherExpense)}</div>
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-4">
        <div className="text-xs font-bold text-ink-mute">
          {rows.length === 0
            ? "0개"
            : `${(startIndex + 1).toLocaleString()}-${Math.min(endIndex, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}개`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => movePage(1)}
            disabled={safePage === 1}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            처음
          </button>

          <button
            type="button"
            onClick={() => movePage(safePage - 1)}
            disabled={safePage === 1}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            이전
          </button>

          {visiblePages[0] > 1 ? (
            <span className="px-1 text-sm font-black text-ink-mute">...</span>
          ) : null}

          {visiblePages.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => movePage(pageNumber)}
              className={
                pageNumber === safePage
                  ? "h-10 min-w-10 rounded-2xl bg-rose-deep px-3 text-sm font-black text-white shadow-sm"
                  : "h-10 min-w-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm hover:bg-surface-2"
              }
            >
              {pageNumber}
            </button>
          ))}

          {visiblePages[visiblePages.length - 1] < pageCount ? (
            <span className="px-1 text-sm font-black text-ink-mute">...</span>
          ) : null}

          <button
            type="button"
            onClick={() => movePage(safePage + 1)}
            disabled={safePage === pageCount}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            다음
          </button>

          <button
            type="button"
            onClick={() => movePage(pageCount)}
            disabled={safePage === pageCount}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            마지막
          </button>
        </div>
      </div>
    </div>
  );
}
