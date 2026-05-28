"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import type { AnyRow, PaymentFilter, SettlementBroadcastEndReport, SettlementManualEntry, SettlementSettingsSummary } from "./settlementTypes";
import {
  buildBroadcastOptions,
  buildBroadcastRows,
  buildDailyTrend,
  calculateStats,
  filterManualEntries,
  filterRows,
  flattenOrders,
  toNumber,
  won,
} from "./settlementUtils";
import SettlementMoneyFlowDashboard from "./SettlementMoneyFlowDashboard";
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

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStartKey(dateKey = getLocalDateKey()) {
  const [yearText, monthText] = String(dateKey || getLocalDateKey()).split("-");
  const year = Number(yearText) || new Date().getFullYear();
  const month = Number(monthText) || new Date().getMonth() + 1;

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function getEffectiveSettlementPeriod(startDate: string, endDate: string) {
  const todayKey = getLocalDateKey();

  if (startDate && endDate) {
    return {
      startDate,
      endDate,
      label: "선택기간 기준",
    };
  }

  if (startDate && !endDate) {
    return {
      startDate,
      endDate: todayKey,
      label: "시작일~오늘 기준",
    };
  }

  if (!startDate && endDate) {
    return {
      startDate: getMonthStartKey(endDate),
      endDate,
      label: "종료일 월 기준",
    };
  }

  return {
    startDate: getMonthStartKey(todayKey),
    endDate: todayKey,
    label: "기간 미설정 · 이번 달 자동조회",
  };
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
  const [broadcastEndReports, setBroadcastEndReports] = useState<SettlementBroadcastEndReport[]>([]);
  const [broadcastEndReportsLoading, setBroadcastEndReportsLoading] = useState(false);
  const [broadcastEndReportsReady, setBroadcastEndReportsReady] = useState(true);
  const [manualPanelOpen, setManualPanelOpen] = useState(false);
  const [settlementDetailOpen, setSettlementDetailOpen] = useState(false);

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


  const loadBroadcastEndReports = useCallback(async () => {
    setBroadcastEndReportsLoading(true);

    try {
      const response = await fetch("/api/admin-live/broadcast-end-reports", {
        method: "GET",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.ok !== true) {
        const message = String(payload?.message || "방송종료 요약 리스트를 불러오지 못했습니다.");
        const missingTable =
          message.includes("broadcast_end_reports") ||
          message.includes("schema cache") ||
          message.includes("does not exist");

        setBroadcastEndReportsReady(!missingTable);

        if (!missingTable) {
          showAdminToast("방송종료 요약 리스트 불러오기 실패\n\n" + message, "error");
        }

        setBroadcastEndReports([]);
        return;
      }

      setBroadcastEndReportsReady(true);
      setBroadcastEndReports(Array.isArray(payload.reports) ? payload.reports : []);
    } finally {
      setBroadcastEndReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadManualEntries();
    loadBroadcastEndReports();
  }, [loadManualEntries, loadBroadcastEndReports]);

  const allRows = useMemo(() => flattenOrders(orderGroups, orders), [orderGroups, orders]);

  const broadcastOptions = useMemo(() => {
    return buildBroadcastOptions(allRows, broadcasts);
  }, [allRows, broadcasts]);

  const effectivePeriod = useMemo(() => getEffectiveSettlementPeriod(startDate, endDate), [startDate, endDate]);
  const effectiveStartDate = effectivePeriod.startDate;
  const effectiveEndDate = effectivePeriod.endDate;

  const filteredRows = useMemo(() => {
    return filterRows({
      rows: allRows,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      selectedBroadcastKeys,
      paymentFilter,
    });
  }, [allRows, effectiveStartDate, effectiveEndDate, selectedBroadcastKeys, paymentFilter]);

  const manualEntriesInScope = useMemo(() => {
    return filterManualEntries({
      entries: manualEntries,
      startDate,
      endDate,
      selectedBroadcastKeys,
      paymentFilter,
    });
  }, [manualEntries, effectiveStartDate, effectiveEndDate, selectedBroadcastKeys, paymentFilter]);


  const broadcastEndReportsInScope = useMemo(() => {
    const selected = new Set(selectedBroadcastKeys);

    return broadcastEndReports.filter((report) => {
      const rawDateKey = String(report.broadcast_date || report.ended_at || report.created_at || "").slice(0, 10);
      const dateKey = rawDateKey || "";

      if (effectiveStartDate && dateKey && dateKey < effectiveStartDate) return false;
      if (effectiveEndDate && dateKey && dateKey > effectiveEndDate) return false;

      if (selected.size > 0) {
        const dateKeyOption = `date:${dateKey}`;
        const broadcastId = String(report.broadcast_id || "");

        if (!selected.has(dateKeyOption) && !selected.has(broadcastId)) return false;
      }

      return true;
    });
  }, [broadcastEndReports, effectiveStartDate, effectiveEndDate, selectedBroadcastKeys]);

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

    const moneyText = (value: unknown) => {
      return `${numberValue(value).toLocaleString("ko-KR")}원`;
    };

    const countText = (value: unknown) => {
      return `${numberValue(value).toLocaleString("ko-KR")}건`;
    };

    const entryTypeLabel = (value: string) => {
      return value === "income" ? "추가 정산 수익" : "창고/기타 지출";
    };

    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];

    const formatKoreanDate = (value: unknown) => {
      const raw = String(value || "").slice(0, 10);

      if (!raw) return "전체";

      const [yearText, monthText, dayText] = raw.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);

      if (!year || !month || !day) return raw;

      const date = new Date(year, month - 1, day);
      const weekday = Number.isFinite(date.getTime()) ? weekdayNames[date.getDay()] : "";

      return `${year}년 ${month}월 ${day}일${weekday ? `(${weekday})` : ""}`;
    };

    const formatKoreanDateTime = (date = new Date()) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekday = weekdayNames[date.getDay()] || "";
      const hour = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");

      return `${year}년 ${month}월 ${day}일(${weekday}) ${hour}:${minute}`;
    };

    const reportPeriod = `${formatKoreanDate(effectiveStartDate)} ~ ${formatKoreanDate(effectiveEndDate)}`;

    const selectedBroadcastLabel =
      selectedBroadcastKeys.length > 0 ? `${selectedBroadcastKeys.length.toLocaleString()}개 선택` : "전체보기";

    const rows: Array<Array<string | number>> = [
      ["루루동이 정산통계 보고서"],
      ["조회기간", reportPeriod],
      ["조회 기준", effectivePeriod.label],
      ["생성일시", formatKoreanDateTime()],
      ["결제수단 조건", paymentFilter],
      ["방송리스트 조건", selectedBroadcastLabel],
      ["작성 기준", "/admin-live 정산통계 기준"],
      ["주의", "세무 제출 전 실제 입금내역·카드정산·창고정산 자료와 최종 대조하세요."],
      [],
      ["1. 정산 요약"],
      ["항목", "금액", "건수", "설명"],
      ["주문서 총금액(취소 제외)", moneyText(stats.totalOrderAmount), countText(stats.orderCount), "취소/환불 제외 주문 기준"],
      ["결제완료 매출", moneyText(stats.paidAmount), countText(stats.paidCount), "입금확인완료 + 카드결제완료 기준"],
      ["무통장 결제완료", moneyText(stats.bankAmount), countText(stats.bankCount), "입금확인완료 기준"],
      ["카드 결제완료", moneyText(stats.cardAmount), countText(stats.cardCount), "카드결제완료 기준"],
      ["추가 정산 수익", moneyText(stats.manualIncomeAmount), countText(stats.manualIncomeCount), "추가 정산 입력 기준"],
      ["카드 수수료", moneyText(-numberValue(stats.actualCardFee)), "", `카드 결제완료 기준 ${actualCardFeeRate}% 또는 주문 저장 수수료율`],
      ["창고/기타 지출", moneyText(-numberValue(stats.warehouseOtherExpense)), countText(stats.manualExpenseCount), "추가 정산 입력 기준"],
      ["총지출", moneyText(-numberValue(stats.totalExpense)), "", "카드 수수료 + 창고/기타 지출"],
      ["아직 못 받은 금액", moneyText(stats.unpaidAmount), "", "실수익 계산 제외"],
      ["현재 실수익", moneyText(stats.netAmount), "", "결제완료 매출 + 추가 정산 수익 - 카드 수수료 - 창고/기타 지출"],
      [],
      ["2. 일자별 정산 내역"],
      [
        "정산일자",
        "주문건수",
        "주문서 총금액(취소 제외)",
        "결제완료 매출",
        "무통장 결제완료",
        "카드 결제완료",
        "추가 정산 수익",
        "카드 수수료",
        "창고/기타 지출",
        "아직 못 받은 금액",
        "현재 실수익",
      ],
      ...broadcastRows.map((row) => [
        formatKoreanDate(row.dateKey),
        countText(row.count),
        moneyText(row.totalOrderAmount),
        moneyText(row.paidAmount),
        moneyText(row.bankAmount),
        moneyText(row.cardAmount),
        moneyText(row.manualIncomeAmount),
        moneyText(-numberValue(row.actualCardFee)),
        moneyText(-numberValue(row.warehouseOtherExpense)),
        moneyText(row.unpaidAmount),
        moneyText(row.netAmount),
      ]),
      [],
      ["3. 추가 정산 내역"],
      ["반영일자", "구분", "제목", "금액", "메모"],
      ...manualEntriesInScope.map((entry) => [
        formatKoreanDate(entry.entry_date),
        entryTypeLabel(entry.entry_type),
        entry.title || "",
        entry.entry_type === "expense" ? moneyText(-numberValue(entry.amount)) : moneyText(entry.amount),
        entry.memo || "",
      ]),
      [],
      ["4. 참고"],
      ["deposits 전달 건수", countText(Array.isArray(deposits) ? deposits.length : 0)],
      ["카드 수수료 기준", `${actualCardFeeRate}%`],
      ["파일 생성 기준", "루루동이 /admin-live 정산통계"],
      ["산식", "현재 실수익 = 결제완료 매출 + 추가 정산 수익 - 카드 수수료 - 창고/기타 지출"],
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const bom = "\ufeff";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const exportDate = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `ruru_settlement_report_${exportDate}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const localDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const applyQuickRange = (range: string) => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);

    if (range === "today") {
      setStartDate(localDateKey(today));
      setEndDate(localDateKey(today));
      return;
    }

    if (range === "week") {
      const day = today.getDay() === 0 ? 7 : today.getDay();
      start.setDate(today.getDate() - day + 1);
      setStartDate(localDateKey(start));
      setEndDate(localDateKey(end));
      return;
    }

    if (range === "month") {
      start.setDate(1);
      setStartDate(localDateKey(start));
      setEndDate(localDateKey(end));
      return;
    }

    if (range === "lastMonth") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(localDateKey(firstDay));
      setEndDate(localDateKey(lastDay));
      return;
    }

    if (range === "year") {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      const lastDay = new Date(today.getFullYear(), 11, 31);
      setStartDate(localDateKey(firstDay));
      setEndDate(localDateKey(lastDay));
    }
  };

  const availableSettlementYears = useMemo(() => {
    const years = new Set<string>();
    const sourceRows = [
      ...(Array.isArray(allRows) ? allRows : []),
      ...(Array.isArray(broadcastEndReports) ? broadcastEndReports : []),
    ] as Array<Record<string, unknown>>;

    sourceRows.forEach((row) => {
      const rawDate = String(
        row.dateKey ||
          row.broadcast_date ||
          row.ended_at ||
          row.created_at ||
          row.entry_date ||
          "",
      );
      const year = rawDate.slice(0, 4);

      if (/^\d{4}$/.test(year)) years.add(year);
    });

    if (years.size === 0) years.add(String(new Date().getFullYear()));

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [allRows, broadcastEndReports]);

  const selectedSettlementYear = (startDate || endDate || localDateKey(new Date())).slice(0, 4);
  const isFullYearRange = startDate.endsWith("-01-01") && endDate.endsWith("-12-31");
  const selectedSettlementMonth = isFullYearRange ? "all" : (startDate || "").slice(5, 7) || "all";

  const applyYearFilter = (year: string) => {
    if (!/^\d{4}$/.test(year)) return;

    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  const applyMonthFilter = (month: string) => {
    const year = selectedSettlementYear || String(new Date().getFullYear());

    if (month === "all") {
      applyYearFilter(year);
      return;
    }

    if (!/^\d{2}$/.test(month)) return;

    const monthIndex = Number(month) - 1;
    const firstDay = new Date(Number(year), monthIndex, 1);
    const lastDay = new Date(Number(year), monthIndex + 1, 0);

    setStartDate(localDateKey(firstDay));
    setEndDate(localDateKey(lastDay));
  };

  return (
    <section className="grid gap-5">
      <SettlementMoneyFlowDashboard
        stats={stats}
        actualCardFeeRate={actualCardFeeRate}
        startDate={startDate}
        endDate={endDate}
        paymentFilter={paymentFilter}
        broadcastOptions={broadcastOptions}
        selectedBroadcastKeys={selectedBroadcastKeys}
        broadcastRows={broadcastRows}
        trend={trend}
        effectivePeriodLabel={effectivePeriod.label}
        broadcastEndReportsInScope={broadcastEndReportsInScope}
        broadcastEndReportsLoading={broadcastEndReportsLoading}
        broadcastEndReportsReady={broadcastEndReportsReady}
        settlementDetailOpen={settlementDetailOpen}
        availableSettlementYears={availableSettlementYears}
        selectedSettlementYear={selectedSettlementYear}
        selectedSettlementMonth={selectedSettlementMonth}
        onOpenManualPanel={() => setManualPanelOpen(true)}
        onExportSummaryCsv={exportSummaryCsv}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onPaymentFilterChange={setPaymentFilter}
        onSelectedBroadcastKeysChange={setSelectedBroadcastKeys}
        onResetFilters={resetFilters}
        onQuickRange={applyQuickRange}
        onYearFilter={applyYearFilter}
        onMonthFilter={applyMonthFilter}
        onToggleSettlementDetail={() => setSettlementDetailOpen((current) => !current)}
      />

      {manualPanelOpen ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/35 backdrop-blur-[2px]">
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[1040px] flex-col overflow-hidden bg-slate-50 shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT EXTRA ENTRY</div>
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
