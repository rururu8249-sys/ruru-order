"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import type { AnyRow, PaymentFilter, SettlementManualEntry, SettlementSettingsSummary } from "./settlementTypes";
import {
  buildBroadcastOptions,
  buildBroadcastRows,
  buildDailyTrend,
  calculateStats,
  filterManualEntries,
  filterRows,
  flattenOrders,
  toNumber,
} from "./settlementUtils";
import SettlementFilterBar from "./SettlementFilterBar";
import SettlementSummaryCards from "./SettlementSummaryCards";
import SettlementCharts from "./SettlementCharts";
import SettlementBroadcastTable from "./SettlementBroadcastTable";
import SettlementManualEntryPanel from "./SettlementManualEntryPanel";

type Props = {
  orderGroups?: AnyRow[];
  orders?: AnyRow[];
  deposits?: AnyRow[];
  broadcasts?: AnyRow[];
  settingsSummary?: SettlementSettingsSummary;
};

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminSettlementPanel({
  orderGroups,
  orders,
  deposits,
  broadcasts,
  settingsSummary,
}: Props) {
  const actualCardFeeRate = String(settingsSummary?.actualCardRate ?? 7);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("전체");
  const [selectedBroadcastKeys, setSelectedBroadcastKeys] = useState<string[]>([]);
  const [manualEntries, setManualEntries] = useState<SettlementManualEntry[]>([]);
  const [manualEntriesLoading, setManualEntriesLoading] = useState(false);
  const [manualEntryTableReady, setManualEntryTableReady] = useState(true);
  const [manualPanelOpen, setManualPanelOpen] = useState(false);

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
    loadManualEntries();
  }, [loadManualEntries]);

  const allRows = useMemo(() => flattenOrders(orderGroups, orders), [orderGroups, orders]);

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

  const actualRateNumber = toNumber(actualCardFeeRate);
  const stats = useMemo(() => calculateStats(filteredRows, actualRateNumber, manualEntriesInScope), [filteredRows, actualRateNumber, manualEntriesInScope]);
  const trend = useMemo(() => buildDailyTrend(filteredRows, actualRateNumber, manualEntriesInScope), [filteredRows, actualRateNumber, manualEntriesInScope]);
  const broadcastRows = useMemo(() => {
    return buildBroadcastRows(filteredRows, broadcastOptions, actualRateNumber, manualEntriesInScope);
  }, [filteredRows, broadcastOptions, actualRateNumber, manualEntriesInScope]);

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setPaymentFilter("전체");
    setSelectedBroadcastKeys([]);
  };

  const exportSummaryCsv = () => {
    const escapeCsv = (value: unknown) => {
      const textValue = String(value ?? "");
      const escaped = textValue.replace(/"/g, '""');

      return `"${escaped}"`;
    };

    const numberValue = (value: unknown) => {
      const number = Number(value || 0);

      return Number.isFinite(number) ? Math.round(number) : 0;
    };

    const entryTypeLabel = (value: string) => {
      return value === "income" ? "기타매출" : "창고정산/기타지출";
    };

    const rows: Array<Array<string | number>> = [
      ["루루동이 정산통계 내보내기"],
      ["생성일시", new Date().toLocaleString("ko-KR")],
      [],
      ["조회조건"],
      ["시작일", startDate || "전체"],
      ["종료일", endDate || "전체"],
      ["결제수단", paymentFilter],
      ["선택 방송 수", selectedBroadcastKeys.length > 0 ? selectedBroadcastKeys.length : "전체"],
      [],
      ["정산 요약"],
      ["항목", "금액", "건수/메모"],
      ["총주문액", numberValue(stats.totalOrderAmount), `${stats.orderCount.toLocaleString()}건`],
      ["완료매출", numberValue(stats.paidAmount), `${stats.paidCount.toLocaleString()}건`],
      ["무통장", numberValue(stats.bankAmount), `${stats.bankCount.toLocaleString()}건`],
      ["카드", numberValue(stats.cardAmount), `${stats.cardCount.toLocaleString()}건`],
      ["기타매출", numberValue(stats.manualIncomeAmount), `${stats.manualIncomeCount.toLocaleString()}건`],
      ["카드수수료", -numberValue(stats.actualCardFee), `카드 결제완료 기준 ${actualCardFeeRate}%`],
      ["창고정산/기타지출", -numberValue(stats.warehouseOtherExpense), `${stats.manualExpenseCount.toLocaleString()}건`],
      ["미입금/확인필요", numberValue(stats.unpaidAmount), "실수익 계산 제외"],
      ["실수익", numberValue(stats.netAmount), "완료매출 + 기타매출 - 지출"],
      [],
      ["방송별 정산 리스트"],
      [
        "방송/날짜",
        "날짜",
        "주문건수",
        "총주문액",
        "완료매출",
        "무통장",
        "카드",
        "기타매출",
        "카드수수료",
        "창고정산/기타지출",
        "미입금/확인필요",
        "실수익",
      ],
      ...broadcastRows.map((row) => [
        row.label,
        row.dateKey,
        row.count,
        numberValue(row.totalOrderAmount),
        numberValue(row.paidAmount),
        numberValue(row.bankAmount),
        numberValue(row.cardAmount),
        numberValue(row.manualIncomeAmount),
        -numberValue(row.actualCardFee),
        -numberValue(row.warehouseOtherExpense),
        numberValue(row.unpaidAmount),
        numberValue(row.netAmount),
      ]),
      [],
      ["추가 정산 내역"],
      ["날짜", "구분", "제목", "금액", "연결 방송", "메모"],
      ...manualEntriesInScope.map((entry) => [
        String(entry.entry_date || ""),
        entryTypeLabel(entry.entry_type),
        entry.title || "",
        entry.entry_type === "expense" ? -numberValue(entry.amount) : numberValue(entry.amount),
        entry.broadcast_label || "",
        entry.memo || "",
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const bom = "\ufeff";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const exportDate = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `ruru_settlement_${exportDate}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT STATS</div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">정산통계</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              방송별·기간별 완료매출, 카드수수료, 창고정산/기타지출, 실수익을 조회 중심으로 확인합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualPanelOpen(true)}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
            >
              + 정산 추가 입력
            </button>

            <button
              type="button"
              onClick={exportSummaryCsv}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              정산 CSV 내보내기
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800">
          기준: 완료매출은 입금확인/카드완료 주문만 잡습니다. 미입금/확인필요는 실수익 계산에서 제외합니다.
          카드수수료는 주문 당시 저장된 actual_card_fee_rate_applied를 우선 사용하고, 창고정산/기타지출은 다음 단계의 수동 지출 입력과 연결합니다.
        </div>
      </div>

      <SettlementFilterBar
        startDate={startDate}
        endDate={endDate}
        paymentFilter={paymentFilter}
        broadcastOptions={broadcastOptions}
        selectedBroadcastKeys={selectedBroadcastKeys}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onPaymentFilterChange={setPaymentFilter}
        onSelectedBroadcastKeysChange={setSelectedBroadcastKeys}
        onReset={resetFilters}
      />

      <SettlementSummaryCards stats={stats} actualCardFeeRate={actualCardFeeRate} />

      <SettlementCharts trend={trend} stats={stats} />

      <SettlementBroadcastTable rows={broadcastRows} />

      <div className="rounded-[30px] border border-orange-100 bg-orange-50 px-5 py-4 text-sm font-bold leading-6 text-orange-800">
        추가 정산 내역은 주문서와 별도로 정산에만 반영됩니다. 삭제는 완전삭제가 아니라 비활성 처리됩니다. 상세 모달과 수정이력 로그는 다음 단계에서 보강합니다.
      </div>

      {manualPanelOpen ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/35 backdrop-blur-[2px]">
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[1040px] flex-col overflow-hidden bg-slate-50 shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <div className="text-xs font-black tracking-[0.22em] text-violet-600">SETTLEMENT EXTRA ENTRY</div>
                <div className="mt-1 text-xl font-black text-slate-950">정산 추가 입력</div>
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
    </section>
  );
}
