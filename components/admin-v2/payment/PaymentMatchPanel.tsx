"use client";

import { useEffect, useMemo, useState } from "react";
import DepositDetailModal from "@/components/admin-v2/payment/ledger/DepositDetailModal";
import DepositLedgerFilters from "@/components/admin-v2/payment/ledger/DepositLedgerFilters";
import DepositLedgerSummary from "@/components/admin-v2/payment/ledger/DepositLedgerSummary";
import DepositLedgerTable from "@/components/admin-v2/payment/ledger/DepositLedgerTable";
import type {
  DepositSummary,
  LedgerStatus,
  RawDepositRow,
  SortDirection,
  SortKey,
} from "@/components/admin-v2/payment/ledger/depositLedgerTypes";
import {
  daysAgoInputValue,
  getDepositAmount,
  getDepositStatus,
  getDepositTime,
  isWithinDateRange,
  matchesKeyword,
  sortDeposits,
  todayInputValue,
} from "@/components/admin-v2/payment/ledger/depositLedgerUtils";

type Props = Record<string, unknown>;

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

export default function PaymentMatchPanel(_props: Props) {
  const [deposits, setDeposits] = useState<RawDepositRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadDeposits = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin-v2/deposits", {
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
      setDeposits([]);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    void loadDeposits();
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
    <div className="mx-auto grid w-full max-w-[1180px] gap-5">
      <section className="flex flex-col gap-4 rounded-[34px] border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/40 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            BANKDA DEPOSIT LEDGER
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">입금내역</h1>
          <p className="mt-2 text-sm font-bold text-slate-500">
            뱅크다에서 가져온 실제 은행 입금내역을 확인합니다. 연결/처리 정보는 상세 버튼에서만 표시합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshBankdaDeposits}
          disabled={syncing || loading}
          className="h-13 rounded-2xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {syncing ? "새로고침 중..." : "입금내역 새로고침"}
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
        <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-black text-blue-700">
          {message}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-[32px] border border-slate-200 bg-white p-12 text-center shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="text-lg font-black text-slate-700">입금내역을 불러오는 중입니다.</div>
          <div className="mt-2 text-sm font-bold text-slate-400">뱅크다 저장 내역을 조회하고 있습니다.</div>
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
