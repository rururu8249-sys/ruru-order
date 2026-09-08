"use client";

import { useEffect, useMemo, useState } from "react";
import DepositDetailModal from "./DepositDetailModal";
import DepositLedgerFilters from "./DepositLedgerFilters";
import DepositLedgerSummary from "./DepositLedgerSummary";
import DepositLedgerTable from "./DepositLedgerTable";
import type {
  DepositSummary,
  LedgerStatus,
  RawDepositRow,
  SortDirection,
  SortKey,
} from "./depositLedgerTypes";
import {
  daysAgoInputValue,
  getDepositAmount,
  getDepositStatus,
  getDepositTime,
  isWithinDateRange,
  matchesKeyword,
  sortDeposits,
  todayInputValue,
} from "./depositLedgerUtils";

// [2026-09-08 사장님 지적 · 속도] 이 화면은 부모(관리자 화면)가 이미 불러다 놓은 입금 목록을 통째로 무시하고
//   열 때마다 90일치를 처음부터 다시 받아서 그동안 "불러오는 중"만 떠 있었다.
//   → ① 부모가 준 목록(deposits)을 그대로 «먼저» 보여주고 ② 최신화는 뒤에서 조용히 돌린다
//      ③ 서버 조회도 화면에 보이는 기간(기본 7일)만 받는다(전체 90일 → 필요할 때만).
//   집계·판정·매칭 로직은 그대로. 「보기」·상세·매칭 동작 무변경.
type Props = {
  deposits?: readonly unknown[];
  orderGroups?: readonly unknown[];
  onSyncBankdaDeposits?: () => Promise<void> | void;
  variant?: string;
};

function lastSyncedLabel(date: Date | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\.\s/g, ".")
    .replace(".", ".")
    .trim();
}

function todayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

export default function PaymentMatchPanel({ deposits: depositsFromParent }: Props) {
  // 부모가 준 목록으로 바로 그린다(빈 배열이면 서버 응답을 기다린다)
  const parentRows = useMemo(
    () => (Array.isArray(depositsFromParent) ? (depositsFromParent as RawDepositRow[]) : []),
    [depositsFromParent],
  );
  const [deposits, setDeposits] = useState<RawDepositRow[]>(parentRows);
  const [loading, setLoading] = useState(parentRows.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<LedgerStatus | "전체">("전체");
  const [fromDate, setFromDate] = useState(daysAgoInputValue(7));
  const [toDate, setToDate] = useState(todayInputValue());
  const [appliedFromDate, setAppliedFromDate] = useState(daysAgoInputValue(7));
  const [appliedToDate, setAppliedToDate] = useState(todayInputValue());
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedDeposit, setSelectedDeposit] = useState<RawDepositRow | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // background=true 면 화면을 가리지 않고 뒤에서 최신화만 한다
  const loadDeposits = async (options: { background?: boolean; days?: number | "all" } = {}) => {
    const background = options.background === true;
    if (background) setRefreshing(true);
    else setLoading(true);
    setMessage("");

    try {
      // 화면에 보이는 기간만 받는다(기본 7일 + 여유 1일). 「전체 기간」이 필요하면 days:"all".
      const days = options.days ?? Math.max(1, Math.ceil((Date.now() - new Date(appliedFromDate).getTime()) / 86400000) + 1);
      const query = days === "all" ? "?days=all" : `?days=${days}`;
      const response = await fetch(`/api/admin-v2/deposits${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || "입금내역 조회 실패");
      }

      const rows = Array.isArray(json.deposits) ? json.deposits : [];
      setDeposits(rows);
      setLastLoadedAt(new Date());
    } catch (error) {
      const text = error instanceof Error ? error.message : "입금내역 조회 실패";
      setMessage(text);
      // 뒤에서 돌던 최신화가 실패해도 이미 보고 있던 목록은 지우지 않는다
      if (!background) setDeposits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshBankdaDeposits = async () => {
    setSyncing(true);
    setMessage("");

    try {
      const response = await fetch("/api/bankda/sync-deposits", {
        method: "POST",
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.message || "뱅크다 입금내역 새로고침 실패");
      }

      await loadDeposits();
      setMessage("입금내역을 새로고침했습니다.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "뱅크다 입금내역 새로고침 실패";
      setMessage(text);
      await loadDeposits();
    } finally {
      setSyncing(false);
    }
  };

  // 부모 목록이 갱신되면(뱅크다 자동조회 등) 화면도 같이 갱신
  useEffect(() => {
    if (parentRows.length > 0) {
      setDeposits(parentRows);
      setLoading(false);
    }
  }, [parentRows]);

  // 첫 진입: 부모 목록이 있으면 «뒤에서» 최신화(화면 안 가림), 없으면 평소처럼 불러온다
  useEffect(() => {
    void loadDeposits({ background: parentRows.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const filteredRows = useMemo(() => {
    const rows = deposits.filter((row) => {
      if (!isWithinDateRange(row, appliedFromDate, appliedToDate)) return false;
      if (statusFilter !== "전체" && getDepositStatus(row) !== statusFilter) return false;
      if (!matchesKeyword(row, debouncedKeyword)) return false;

      return true;
    });

    return sortDeposits(rows, sortKey, sortDirection);
  }, [deposits, appliedFromDate, appliedToDate, statusFilter, debouncedKeyword, sortKey, sortDirection]);

  const summary = useMemo<DepositSummary>(() => {
    const start = todayStart();

    return {
      totalAmount: filteredRows.reduce((sum, row) => sum + getDepositAmount(row), 0),
      totalCount: filteredRows.length,
      todayAmount: filteredRows
        .filter((row) => getDepositTime(row) >= start)
        .reduce((sum, row) => sum + getDepositAmount(row), 0),
      lastSyncedLabel: lastSyncedLabel(lastLoadedAt),
    };
  }, [filteredRows, lastLoadedAt]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "time" ? "desc" : "asc");
  };

  const applyDateFilter = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    // 고른 기간이 지금 받아 둔 것보다 과거면 그 기간만큼 서버에서 더 받아온다(화면은 안 가림)
    const days = Math.max(1, Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86400000) + 1);
    void loadDeposits({ background: true, days });
  };

  const resetFilters = () => {
    const from = daysAgoInputValue(7);
    const to = todayInputValue();

    setKeyword("");
    setDebouncedKeyword("");
    setStatusFilter("전체");
    setFromDate(from);
    setToDate(to);
    setAppliedFromDate(from);
    setAppliedToDate(to);
    setSortKey("time");
    setSortDirection("desc");
  };

  return (
    <div className="grid w-full gap-5">
      <section className="flex flex-col gap-4 rounded-[34px] border border-line bg-gradient-to-br from-surface via-surface to-surface-2 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">입금내역</h1>

          <p className="mt-2 text-sm font-bold text-ink-soft">
            새마을금고 계좌에 들어온 입금을 뱅크다가 자동으로 모아 온 기록입니다. 주문과 연결된 내용은 「보기」에서 확인합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshBankdaDeposits}
          disabled={syncing || loading}
          className="h-13 shrink-0 rounded-2xl bg-rose-deep px-6 py-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:bg-rose-deep disabled:cursor-not-allowed disabled:bg-surface-3"
        >
          {syncing ? "새로고침 중..." : refreshing ? "최신 확인 중..." : "입금내역 새로고침"}
        </button>
      </section>

      <DepositLedgerSummary summary={summary} />

      <DepositLedgerFilters
        keyword={keyword}
        onKeywordChange={setKeyword}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onApplyDate={applyDateFilter}
        onReset={resetFilters}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {message ? (
        <div className="rounded-[24px] border border-line bg-info-bg px-5 py-4 text-sm font-black text-info-tx">
          {message}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-[32px] border border-line bg-surface p-12 text-center shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="text-lg font-black text-ink">입금내역을 불러오는 중입니다.</div>
          <div className="mt-2 text-sm font-bold text-ink-mute">잠시만요.</div>
        </section>
      ) : (
        <DepositLedgerTable
          rows={filteredRows}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={changeSort}
          onOpenDetail={setSelectedDeposit}
        />
      )}

      <DepositDetailModal row={selectedDeposit} onClose={() => setSelectedDeposit(null)} />
    </div>
  );
}
