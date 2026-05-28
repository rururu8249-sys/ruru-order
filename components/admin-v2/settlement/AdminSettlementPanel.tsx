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
import SettlementFilterBar from "./SettlementFilterBar";
import SettlementCharts from "./SettlementCharts";
import SettlementBroadcastTable from "./SettlementBroadcastTable";
import SettlementBroadcastEndReportTable from "./SettlementBroadcastEndReportTable";
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

  const moneyFlowItems = [
    {
      step: "1",
      label: "주문서 총금액",
      value: won(stats.totalOrderAmount),
      sub: `${stats.orderCount.toLocaleString()}건`,
      icon: "🧾",
      cardClass: "border-blue-100 bg-blue-50/40",
      badgeClass: "bg-blue-600 text-white",
      valueClass: "text-slate-950",
    },
    {
      step: "2",
      label: "결제완료 매출",
      value: won(stats.paidAmount),
      sub: `${stats.paidCount.toLocaleString()}건`,
      icon: "💳",
      cardClass: "border-blue-100 bg-white",
      badgeClass: "bg-blue-600 text-white",
      valueClass: "text-blue-700",
    },
    {
      step: "3",
      label: "아직 못 받은 금액",
      value: won(stats.unpaidAmount),
      sub: "현재 실수익 계산 제외",
      icon: "⏳",
      cardClass: "border-orange-100 bg-orange-50/40",
      badgeClass: "bg-orange-500 text-white",
      valueClass: "text-orange-700",
    },
    {
      step: "4",
      label: "빠지는 돈",
      value: `-${won(stats.totalExpense)}`,
      sub: `카드 수수료 ${actualCardFeeRate}% + 창고/기타 지출`,
      icon: "➖",
      cardClass: "border-slate-200 bg-white",
      badgeClass: "bg-slate-700 text-white",
      valueClass: "text-slate-950",
    },
    {
      step: "5",
      label: "현재 실수익",
      value: won(stats.netAmount),
      sub: "결제완료 매출 + 추가 정산 수익 - 빠지는 돈",
      icon: "💰",
      cardClass: "border-emerald-100 bg-emerald-50/50 ring-1 ring-emerald-100",
      badgeClass: "bg-emerald-600 text-white",
      valueClass: "text-emerald-700",
    },
  ];

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT STATS</div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">정산통계</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              주문이 얼마 들어왔고, 실제 받은 돈과 아직 못 받은 돈, 빠지는 돈, 현재 실수익을 한눈에 봅니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualPanelOpen(true)}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
            >
              + 정산 추가 입력
            </button>

            <button
              type="button"
              onClick={exportSummaryCsv}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              정산 CSV 내보내기
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["today", "오늘"],
              ["week", "이번 주"],
              ["month", "이번 달"],
              ["lastMonth", "지난 달"],
              ["year", "올해"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyQuickRange(key)}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100"
              >
                {label}
              </button>
            ))}

            <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-500">
              직접 선택
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600">
              <span className="text-xs text-slate-400">연도</span>
              <select
                value={selectedSettlementYear}
                onChange={(event) => applyYearFilter(event.target.value)}
                className="bg-transparent font-black outline-none"
              >
                {availableSettlementYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600">
              <span className="text-xs text-slate-400">월</span>
              <select
                value={selectedSettlementMonth}
                onChange={(event) => applyMonthFilter(event.target.value)}
                className="bg-transparent font-black outline-none"
              >
                <option value="all">전체</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
                  <option key={month} value={month}>
                    {Number(month)}월
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="pt-4">
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
        </div>
      </div>

      <div className="rounded-[34px] border border-blue-100 bg-white p-5 shadow-[0_18px_45px_rgba(37,99,235,0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black tracking-[0.2em] text-blue-600">MONEY FLOW</div>
            <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">돈 흐름 5단계</div>
          </div>
          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">
            초보자 기준 핵심만 표시
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1.1fr]">
          {moneyFlowItems.map((item, index) => (
            <div key={item.label} className="contents">
              <div
                className={`min-h-[124px] rounded-[26px] border px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] ${item.cardClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${item.badgeClass}`}>
                      {item.step}
                    </div>
                    <div className="mt-3 text-sm font-black text-slate-500">{item.label}</div>
                    <div className={`mt-2 truncate text-2xl font-black tracking-[-0.06em] ${item.valueClass}`}>{item.value}</div>
                    <div className="mt-1 truncate text-[11px] font-bold text-slate-400">{item.sub}</div>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-lg shadow-sm">
                    {item.icon}
                  </div>
                </div>
              </div>

              {index < moneyFlowItems.length - 1 ? (
                <div className="hidden items-center justify-center text-2xl font-black text-blue-300 xl:flex">
                  →
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
        <div className="rounded-[30px] border border-blue-100 bg-blue-50/45 p-5 shadow-[0_14px_35px_rgba(37,99,235,0.06)]">
          <div className="text-xs font-black tracking-[0.2em] text-blue-600">ONE LINE SUMMARY</div>
          <div className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">한 줄 요약</div>

          <div className="mt-4 grid gap-2 text-sm font-bold leading-6 text-slate-700">
            <p>① 이번 기간 주문서 총금액은 <span className="font-black text-slate-950">{won(stats.totalOrderAmount)}</span>입니다.</p>
            <p>② 그중 실제로 결제가 끝난 금액은 <span className="font-black text-blue-700">{won(stats.paidAmount)}</span>입니다.</p>
            <p>③ 아직 못 받은 금액은 <span className="font-black text-orange-700">{won(stats.unpaidAmount)}</span>입니다.</p>
            <p>④ 카드 수수료와 창고/기타 지출을 빼면 현재 실수익은 <span className="font-black text-emerald-700">{won(stats.netAmount)}</span>입니다.</p>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.2em] text-blue-600">TO DO</div>
              <div className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">지금 처리할 일</div>
            </div>
            <div className="text-xs font-bold text-slate-400">방송 끝나고 바로 확인할 것</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/45 px-4 py-3">
              <div className="text-xs font-black text-slate-500">아직 못 받은 금액 확인</div>
              <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-orange-700">{won(stats.unpaidAmount)}</div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/45 px-4 py-3">
              <div className="text-xs font-black text-slate-500">결제완료 매출 확인</div>
              <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-blue-700">{stats.paidCount.toLocaleString()}건</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-black text-slate-500">창고/기타 지출 입력</div>
              <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-800">{stats.manualExpenseCount.toLocaleString()}건</div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
              <div className="text-xs font-black text-slate-500">방송종료 요약 확인</div>
              <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-blue-700">{broadcastEndReportsInScope.length.toLocaleString()}건</div>
            </div>
          </div>
        </div>
      </div>

      <SettlementBroadcastTable rows={broadcastRows} />

      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <button
          type="button"
          onClick={() => setSettlementDetailOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition hover:bg-slate-50"
        >
          <div>
            <div className="text-lg font-black text-slate-950">세부 보기</div>
            <div className="mt-1 text-xs font-bold text-slate-400">
              차트, 무통장/카드 상세, 기존회원/신규회원, 방송종료 요약은 필요할 때만 확인합니다.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-blue-700 shadow-sm">
            {settlementDetailOpen ? "접기" : "열기"}
          </div>
        </button>

        {settlementDetailOpen ? (
          <div className="grid gap-5 border-t border-slate-100 p-5">
            <SettlementCharts trend={trend} stats={stats} broadcastRows={broadcastRows} periodLabel={effectivePeriod.label} />

            <SettlementBroadcastEndReportTable
              rows={broadcastEndReportsInScope}
              loading={broadcastEndReportsLoading}
              tableReady={broadcastEndReportsReady}
            />

            <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold leading-6 text-blue-900">
              추가 정산 내역은 주문서와 별도로 정산에만 반영됩니다. 삭제는 완전삭제가 아니라 비활성 처리됩니다. 상세 모달과 수정이력 로그는 다음 단계에서 보강합니다.
            </div>
          </div>
        ) : null}
      </div>

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
