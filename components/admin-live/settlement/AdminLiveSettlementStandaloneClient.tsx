"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import SettlementManualEntryPanel from "@/components/admin-v2/settlement/SettlementManualEntryPanel";
import type {
  AnyRow,
  PaymentFilter,
  SettlementManualEntry,
  SettlementSettingsSummary,
} from "@/components/admin-v2/settlement/settlementTypes";
import {
  buildBroadcastOptions,
  buildBroadcastRows,
  calculateStats,
  filterManualEntries,
  filterRows,
  flattenOrders,
  toNumber,
  won,
} from "@/components/admin-v2/settlement/settlementUtils";
import AdminLiveSettlementStandaloneDashboard from "./AdminLiveSettlementStandaloneDashboard";

const SETTING_KEYS = [
  "customer_card_extra_rate",
  "actual_card_fee_rate",
  "card_payment_min_amount",
  "default_shipping_fee",
] as const;

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthStartKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

function readSettingNumber(rows: AnyRow[], key: string, fallback: number) {
  const row = rows.find((item) => String(item.key || "") === key);
  const value = Number(row?.value ?? fallback);

  return Number.isFinite(value) ? value : fallback;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function moneyText(value: unknown) {
  return won(Math.round(Number(value || 0)));
}

export default function AdminLiveSettlementStandaloneClient() {
  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<AnyRow[]>([]);
  const [settingsRows, setSettingsRows] = useState<AnyRow[]>([]);
  const [manualEntries, setManualEntries] = useState<SettlementManualEntry[]>([]);
  const [manualEntriesLoading, setManualEntriesLoading] = useState(false);
  const [manualEntryTableReady, setManualEntryTableReady] = useState(true);
  const [manualPanelOpen, setManualPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [startDate, setStartDate] = useState(() => monthStartKey());
  const [endDate, setEndDate] = useState(() => todayKey());
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("전체");
  const [selectedBroadcastKeys, setSelectedBroadcastKeys] = useState<string[]>([]);

  const settingsSummary: SettlementSettingsSummary = useMemo(() => {
    return {
      customerCardRate: readSettingNumber(settingsRows, "customer_card_extra_rate", 10),
      actualCardRate: readSettingNumber(settingsRows, "actual_card_fee_rate", 7),
      cardPaymentMinAmount: readSettingNumber(settingsRows, "card_payment_min_amount", 100000),
      defaultShippingFee: readSettingNumber(settingsRows, "default_shipping_fee", 4000),
    };
  }, [settingsRows]);

  const actualCardFeeRate = String(settingsSummary.actualCardRate ?? 7);
  const actualRateNumber = toNumber(actualCardFeeRate);

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [ordersResult, broadcastsResult, settingsResult] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(5000),
        supabase.from("broadcasts").select("*").order("started_at", { ascending: false }).limit(300),
        supabase.from("settings").select("key,value").in("key", [...SETTING_KEYS]),
      ]);

      if (ordersResult.error) throw new Error("주문 불러오기 실패: " + ordersResult.error.message);
      if (broadcastsResult.error) throw new Error("방송리스트 불러오기 실패: " + broadcastsResult.error.message);
      if (settingsResult.error) throw new Error("정산 기준값 불러오기 실패: " + settingsResult.error.message);

      const groups = buildAdminLiveOrderGroups((ordersResult.data || []) as any[]);
      const liveOrders = groups.map(toAdminLiveOrder) as AnyRow[];

      setOrders(liveOrders);
      setBroadcasts((broadcastsResult.data || []) as AnyRow[]);
      setSettingsRows((settingsResult.data || []) as AnyRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "정산 데이터를 불러오지 못했습니다.";
      setLoadError(message);
      showAdminToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadManualEntries = useCallback(async () => {
    setManualEntriesLoading(true);

    try {
      const { data, error } = await supabase
        .from("settlement_manual_entries")
        .select("*")
        .eq("is_active", true)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        const message = String(error.message || "");
        const missingTable =
          message.includes("settlement_manual_entries") ||
          message.includes("schema cache") ||
          message.includes("does not exist");

        setManualEntryTableReady(!missingTable);

        if (!missingTable) {
          showAdminToast("정산 추가 입력 불러오기 실패\n\n" + message, "error");
        }

        setManualEntries([]);
        return;
      }

      setManualEntryTableReady(true);
      setManualEntries((data || []) as SettlementManualEntry[]);
    } finally {
      setManualEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBaseData();
    void loadManualEntries();
  }, [loadBaseData, loadManualEntries]);

  const allRows = useMemo(() => flattenOrders(undefined, orders), [orders]);

  const broadcastOptions = useMemo(() => {
    return buildBroadcastOptions(allRows, broadcasts);
  }, [allRows, broadcasts]);

  const filteredRows = useMemo(() => {
    return filterRows({
      rows: allRows,
      startDate,
      endDate,
      selectedBroadcastKeys,
      paymentFilter,
    });
  }, [allRows, startDate, endDate, selectedBroadcastKeys, paymentFilter]);

  const manualEntriesInScope = useMemo(() => {
    return filterManualEntries({
      entries: manualEntries,
      startDate,
      endDate,
      selectedBroadcastKeys,
      paymentFilter,
    });
  }, [manualEntries, startDate, endDate, selectedBroadcastKeys, paymentFilter]);

  const stats = useMemo(() => {
    return calculateStats(filteredRows, actualRateNumber, manualEntriesInScope);
  }, [filteredRows, actualRateNumber, manualEntriesInScope]);

  const broadcastRows = useMemo(() => {
    return buildBroadcastRows(filteredRows, broadcastOptions, actualRateNumber, manualEntriesInScope);
  }, [filteredRows, broadcastOptions, actualRateNumber, manualEntriesInScope]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    allRows.forEach((row) => {
      const raw = String(row.created_at || row.order_date || row.date || "");
      const year = raw.slice(0, 4);
      if (/^\d{4}$/.test(year)) years.add(year);
    });

    broadcasts.forEach((row) => {
      const raw = String(row.started_at || row.created_at || "");
      const year = raw.slice(0, 4);
      if (/^\d{4}$/.test(year)) years.add(year);
    });

    years.add(String(new Date().getFullYear()));

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [allRows, broadcasts]);

  const selectedYear = startDate.slice(0, 4) || String(new Date().getFullYear());
  const isFullYear = startDate.endsWith("-01-01") && endDate.endsWith("-12-31");
  const selectedMonth = isFullYear ? "all" : startDate.slice(5, 7) || "all";

  const applyQuickRange = (range: "today" | "week" | "month" | "lastMonth" | "year") => {
    const today = new Date();
    const start = new Date(today);

    if (range === "today") {
      setStartDate(todayKey(today));
      setEndDate(todayKey(today));
      return;
    }

    if (range === "week") {
      const day = today.getDay() === 0 ? 7 : today.getDay();
      start.setDate(today.getDate() - day + 1);
      setStartDate(todayKey(start));
      setEndDate(todayKey(today));
      return;
    }

    if (range === "month") {
      setStartDate(monthStartKey(today));
      setEndDate(todayKey(today));
      return;
    }

    if (range === "lastMonth") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(todayKey(firstDay));
      setEndDate(todayKey(lastDay));
      return;
    }

    setStartDate(`${today.getFullYear()}-01-01`);
    setEndDate(`${today.getFullYear()}-12-31`);
  };

  const applyYear = (year: string) => {
    if (!/^\d{4}$/.test(year)) return;

    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  const applyMonth = (month: string) => {
    const year = selectedYear || String(new Date().getFullYear());

    if (month === "all") {
      applyYear(year);
      return;
    }

    if (!/^\d{2}$/.test(month)) return;

    const firstDay = new Date(Number(year), Number(month) - 1, 1);
    const lastDay = new Date(Number(year), Number(month), 0);

    setStartDate(todayKey(firstDay));
    setEndDate(todayKey(lastDay));
  };

  const resetFilters = () => {
    setStartDate(monthStartKey());
    setEndDate(todayKey());
    setPaymentFilter("전체");
    setSelectedBroadcastKeys([]);
  };

  const exportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["루루동이 정산통계 보고서"],
      ["작성 기준", "/admin-live/settlement 정산통계 전용 페이지"],
      [],
      ["1. 돈 흐름 요약"],
      ["주문서 총금액", stats.totalOrderAmount],
      ["결제완료 매출", stats.paidAmount],
      ["아직 못 받은 금액", stats.unpaidAmount],
      ["카드 수수료", -stats.cardFeeAmount],
      ["창고/기타 지출", -stats.manualExpenseAmount],
      ["추가 정산 수익", stats.manualIncomeAmount],
      ["현재 실수익", stats.netAmount],
      [],
      ["2. 방송별 정산"],
      ["방송", "주문서 수", "결제완료 매출", "아직 못 받은 금액", "빠지는 돈", "현재 실수익"],
      ...broadcastRows.map((row) => [
        row.label,
        row.count,
        row.paidAmount,
        row.unpaidAmount,
        -row.totalExpense,
        row.netAmount,
      ]),
      [],
      ["3. 참고"],
      ["카드 수수료 기준", `${actualCardFeeRate}%`],
      ["조회 시작일", startDate],
      ["조회 종료일", endDate],
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const exportDate = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `ruru_settlement_standalone_${exportDate}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#f4f8ff] px-5 py-5 text-slate-950">
      <div className="mx-auto grid max-w-[1680px] gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-blue-100 bg-white px-5 py-4 shadow-[0_14px_35px_rgba(37,99,235,0.07)]">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">RURUDONGI LIVE</div>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-950">정산통계 전용 페이지</h1>
            <p className="mt-1 text-xs font-bold text-slate-500">
              기존 관리자 화면과 분리된 정산 전용 화면입니다. 주문/입금/배송/Bankda 상태는 변경하지 않습니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin-live"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              관리자 메인
            </Link>
            <button
              type="button"
              onClick={loadBaseData}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
            >
              새로고침
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
            {loadError}
          </div>
        ) : null}

        <AdminLiveSettlementStandaloneDashboard
          loading={loading}
          stats={stats}
          actualCardFeeRate={actualCardFeeRate}
          startDate={startDate}
          endDate={endDate}
          paymentFilter={paymentFilter}
          broadcastOptions={broadcastOptions}
          selectedBroadcastKeys={selectedBroadcastKeys}
          availableYears={availableYears}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          broadcastRows={broadcastRows}
          manualEntriesInScope={manualEntriesInScope}
          onQuickRange={applyQuickRange}
          onYearChange={applyYear}
          onMonthChange={applyMonth}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onPaymentFilterChange={setPaymentFilter}
          onSelectedBroadcastKeysChange={setSelectedBroadcastKeys}
          onReset={resetFilters}
          onOpenManualPanel={() => setManualPanelOpen(true)}
          onExportCsv={exportCsv}
        />

        {manualPanelOpen ? (
          <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40">
            <div className="flex h-full w-full max-w-[980px] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT EXTRA ENTRY</div>
                  <div className="mt-1 text-xl font-black text-slate-950">정산 추가 입력</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">
                    추가 정산 수익 또는 창고/기타 지출만 입력합니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setManualPanelOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <SettlementManualEntryPanel
                  entries={manualEntriesInScope}
                  broadcastOptions={broadcastOptions}
                  loading={manualEntriesLoading}
                  tableReady={manualEntryTableReady}
                  onChanged={loadManualEntries}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[26px] border border-blue-100 bg-blue-50 px-5 py-4 text-xs font-black leading-5 text-blue-900">
          계산 기준: 결제완료 매출은 입금확인/카드 결제완료 주문만 포함합니다. 아직 못 받은 금액은 현재 실수익에서 제외합니다.
          카드 수수료와 창고/기타 지출을 뺀 금액을 현재 실수익으로 표시합니다.
        </div>
      </div>
    </main>
  );
}
