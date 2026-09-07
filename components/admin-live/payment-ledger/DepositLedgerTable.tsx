"use client";

import { useEffect, useMemo, useState } from "react";
import type { LedgerStatus, RawDepositRow, SortDirection, SortKey } from "./depositLedgerTypes";
import {
  formatDepositDateTime,
  formatDepositMoney,
  getDepositAmount,
  getDepositName,
  getDepositStatus,
  getDepositTime,
  statusClass,
} from "./depositLedgerUtils";

type Props = {
  rows: RawDepositRow[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
  onOpenDetail: (row: RawDepositRow) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type PaginationItem = number | "ellipsis";

function sortMark(active: boolean, direction: SortDirection) {
  if (!active) return <span className="text-[10px] text-ink-mute">↕</span>;
  return <span className="text-[11px] text-info-tx">{direction === "asc" ? "↑" : "↓"}</span>;
}

function SortButton({
  label,
  sortName,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  label: string;
  sortName: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
}) {
  const active = sortName === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSortChange(sortName)}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black transition ${
        active ? "bg-info-bg text-info-tx" : "text-ink-soft hover:bg-surface-3 hover:text-ink"
      }`}
      title={`${label} 오름차순/내림차순 정렬`}
    >
      {label}
      {sortMark(active, sortDirection)}
    </button>
  );
}

function StatusBadge({ status }: { status: LedgerStatus }) {
  return (
    <span className={`inline-flex min-w-[74px] justify-center rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function safePage(currentPage: number, pageCount: number) {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(currentPage, 1), pageCount);
}

function buildPaginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pageSet = new Set<number>();
  pageSet.add(1);
  pageSet.add(pageCount);

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page > 1 && page < pageCount) {
      pageSet.add(page);
    }
  }

  const sortedPages = Array.from(pageSet).sort((a, b) => a - b);
  const items: PaginationItem[] = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];

    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

export default function DepositLedgerTable({
  rows,
  sortKey,
  sortDirection,
  onSortChange,
  onOpenDetail,
}: Props) {
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const normalizedPage = safePage(currentPage, pageCount);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length, pageSize, sortKey, sortDirection]);

  const visibleRows = useMemo(() => {
    const start = (normalizedPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, normalizedPage, pageSize]);

  const pageItems = useMemo(() => {
    return buildPaginationItems(normalizedPage, pageCount);
  }, [normalizedPage, pageCount]);

  const startCount = rows.length === 0 ? 0 : (normalizedPage - 1) * pageSize + 1;
  const endCount = Math.min(normalizedPage * pageSize, rows.length);

  return (
    <section className="overflow-hidden rounded-[32px] border border-line bg-surface shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div>
          <div className="text-lg font-black text-ink">은행 입금내역</div>
          <div className="mt-1 text-xs font-bold text-ink-mute">실제 입금 1건은 목록에서 반드시 1줄로만 표시됩니다.</div>
        </div>
        <div className="rounded-full bg-surface-3 px-3 py-1 text-xs font-black text-ink-soft">
          총 {rows.length.toLocaleString()}건
        </div>
      </div>

      <div className="overflow-auto px-4 pb-3">
        <table className="mx-auto min-w-[760px] max-w-[860px] w-full border-separate border-spacing-0">
          <colgroup>
            <col className="w-[235px]" />
            <col className="w-[170px]" />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
            <col className="w-[84px]" />
          </colgroup>
          <thead>
            <tr className="bg-surface-2">
              <th className="px-3 py-3 text-left">
                <SortButton
                  label="입금일시"
                  sortName="time"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-3 py-3 text-left">
                <SortButton
                  label="입금자명"
                  sortName="name"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-3 py-3 text-right">
                <SortButton
                  label="입금금액"
                  sortName="amount"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-3 py-3 text-center text-xs font-black text-ink-soft">상태</th>
              <th className="px-3 py-3 text-center text-xs font-black text-ink-soft">상세</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <div className="text-lg font-black text-ink">조회된 입금내역이 없습니다.</div>
                  <div className="mt-2 text-sm font-bold text-ink-mute">검색어, 날짜, 상태필터를 다시 확인해주세요.</div>
                </td>
              </tr>
            ) : (
              visibleRows.map((row, index) => {
                const status = getDepositStatus(row);
                const rowKey = `${getDepositTime(row)}-${getDepositName(row)}-${getDepositAmount(row)}-${normalizedPage}-${index}`;

                return (
                  <tr key={rowKey} className="group border-b border-line-soft transition hover:bg-info-bg">
                    <td className="border-b border-line-soft px-3 py-4 text-sm font-black text-ink">
                      {formatDepositDateTime(row)}
                    </td>
                    <td className="border-b border-line-soft px-3 py-4">
                      <div className="text-base font-black text-ink">{getDepositName(row) || "-"}</div>
                    </td>
                    <td className="border-b border-line-soft px-3 py-4 text-right text-base font-black tabular-nums text-ink">
                      {formatDepositMoney(row ? getDepositAmount(row) : 0)}
                    </td>
                    <td className="border-b border-line-soft px-3 py-4 text-center">
                      <StatusBadge status={status} />
                    </td>
                    <td className="border-b border-line-soft px-3 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(row)}
                        className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-black text-ink shadow-sm transition hover:border-line hover:bg-info-bg hover:text-info-tx"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-surface px-5 py-4">
        <div className="text-xs font-black text-ink-mute">
          {rows.length === 0
            ? "표시할 입금내역 없음"
            : `${startCount.toLocaleString()}-${endCount.toLocaleString()} / ${rows.length.toLocaleString()}건 표시`}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setCurrentPage(1);
            }}
            className="h-10 rounded-2xl border border-line bg-surface px-3 text-xs font-black text-ink-soft outline-none transition hover:border-line focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
            aria-label="한 페이지당 표시 개수"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}개 보기
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => safePage(page - 1, pageCount))}
              disabled={normalizedPage <= 1}
              className="h-9 min-w-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>

            {pageItems.map((item, index) => {
              if (item === "ellipsis") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="grid h-9 min-w-9 place-items-center rounded-xl px-2 text-xs font-black text-ink-mute"
                  >
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                  className={`h-9 min-w-9 rounded-xl px-3 text-xs font-black transition ${
                    normalizedPage === item
                      ? "bg-rose-deep text-white shadow-sm"
                      : "border border-line bg-surface text-ink-soft hover:bg-surface-2"
                  }`}
                >
                  {item}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCurrentPage((page) => safePage(page + 1, pageCount))}
              disabled={normalizedPage >= pageCount}
              className="h-9 min-w-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
