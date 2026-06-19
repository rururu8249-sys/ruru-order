"use client";

import { useMemo, useState } from "react";
import type { SettlementBroadcastEndReport } from "./settlementTypes";
import { won } from "./settlementUtils";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30];

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function countText(value: unknown, suffix = "건") {
  return `${numberValue(value).toLocaleString("ko-KR")}${suffix}`;
}

function dateText(value: unknown) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "-";

  const [yearText, monthText, dayText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return raw;

  const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const date = new Date(year, month - 1, day);
  const weekday = Number.isFinite(date.getTime()) ? weekdayNames[date.getDay()] : "";

  return `${year}년 ${month}월 ${day}일${weekday ? `(${weekday})` : ""}`;
}

function timeText(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "-";

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function durationText(value: unknown) {
  const minutes = numberValue(value);
  if (minutes <= 0) return "-";

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  if (hour <= 0) return `${minute}분`;
  if (minute <= 0) return `${hour}시간`;

  return `${hour}시간 ${minute}분`;
}

function reportDateKey(report: SettlementBroadcastEndReport) {
  return String(report.broadcast_date || report.ended_at || report.created_at || "").slice(0, 10);
}

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

export default function SettlementBroadcastEndReportTable({
  rows,
  loading,
  tableReady,
}: {
  rows: SettlementBroadcastEndReport[];
  loading: boolean;
  tableReady: boolean;
}) {
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aTime = new Date(a.ended_at || a.created_at || 0).getTime() || 0;
      const bTime = new Date(b.ended_at || b.created_at || 0).getTime() || 0;

      return bTime - aTime;
    });
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const visibleRows = useMemo(() => {
    return sortedRows.slice(startIndex, endIndex);
  }, [sortedRows, startIndex, endIndex]);

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
          <div className="text-lg font-black text-ink">방송종료 요약 리스트</div>
          <div className="mt-1 text-xs font-bold text-ink-mute">
            방송 종료 시점에 저장된 주문서 수, 결제완료 매출, 아직 못 받은 금액, 기존회원/신규회원을 다시 확인합니다.
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
            총 {sortedRows.length.toLocaleString("ko-KR")}개
          </div>
        </div>
      </div>

      {!tableReady ? (
        <div className="px-6 py-12 text-center text-sm font-bold text-ink-mute">
          방송종료 요약 테이블이 아직 준비되지 않았습니다.
        </div>
      ) : loading ? (
        <div className="px-6 py-12 text-center text-sm font-bold text-ink-mute">
          방송종료 요약 리스트를 불러오는 중입니다.
        </div>
      ) : (
        <>
          <div className="overflow-auto">
            <table className="min-w-[1220px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-surface-2 text-xs font-black text-ink-soft">
                  <th className="px-4 py-3 text-left">방송/날짜</th>
                  <th className="px-4 py-3 text-right">방송시간</th>
                  <th className="px-4 py-3 text-right">주문서 수</th>
                  <th className="px-4 py-3 text-right">결제완료 매출</th>
                  <th className="px-4 py-3 text-right">아직 못 받은 금액</th>
                  <th className="px-4 py-3 text-right">무통장 결제완료</th>
                  <th className="px-4 py-3 text-right">카드 결제완료</th>
                  <th className="px-4 py-3 text-right">구매고객 수</th>
                  <th className="px-4 py-3 text-right">기존회원</th>
                  <th className="px-4 py-3 text-right">신규회원</th>
                  <th className="px-4 py-3 text-left">방문자</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-sm font-bold text-ink-mute">
                      표시할 방송종료 요약이 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr key={row.id} className="border-b border-line-soft hover:bg-info-bg">
                      <td className="border-b border-line-soft px-4 py-4">
                        <div className="max-w-[280px] truncate text-sm font-black text-ink">
                          {row.broadcast_title || "방송제목 없음"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-ink-mute">{dateText(reportDateKey(row))}</div>
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-xs font-black text-ink-soft">
                        <div>{timeText(row.started_at)} ~ {timeText(row.ended_at)}</div>
                        <div className="mt-1 text-ink-mute">{durationText(row.duration_minutes)}</div>
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black text-ink">
                        {countText(row.order_count)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-info-tx">
                        {won(row.paid_amount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-warn-tx">
                        {won(row.unpaid_amount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-ok-tx">
                        {won(row.bank_paid_amount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black tabular-nums text-info-tx">
                        {won(row.card_paid_amount)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black text-ink">
                        {countText(row.buyer_count, "명")}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black text-ok-tx">
                        {countText(row.existing_member_count, "명")}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-right text-sm font-black text-info-tx">
                        {countText(row.new_member_count, "명")}
                      </td>
                      <td className="border-b border-line-soft px-4 py-4 text-xs font-bold text-ink-soft">
                        {row.visitor_count == null ? row.visitor_note || "방문 로그 설정 후 표시" : countText(row.visitor_count, "명")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-4">
            <div className="text-xs font-bold text-ink-mute">
              {sortedRows.length === 0
                ? "0개"
                : `${(startIndex + 1).toLocaleString("ko-KR")}-${Math.min(endIndex, sortedRows.length).toLocaleString("ko-KR")} / ${sortedRows.length.toLocaleString("ko-KR")}개`}
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
        </>
      )}
    </div>
  );
}
