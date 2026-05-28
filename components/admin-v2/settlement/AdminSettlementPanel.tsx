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
      return value === "income" ? "기타매출" : "창고/기타 지출";
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
      ["전체 주문금액(취소 제외)", moneyText(stats.totalOrderAmount), countText(stats.orderCount), "취소/환불 제외 주문 기준"],
      ["완료매출", moneyText(stats.paidAmount), countText(stats.paidCount), "입금확인완료 + 카드결제완료 기준"],
      ["무통장 완료매출", moneyText(stats.bankAmount), countText(stats.bankCount), "입금확인완료 기준"],
      ["카드 완료매출", moneyText(stats.cardAmount), countText(stats.cardCount), "카드결제완료 기준"],
      ["기타매출", moneyText(stats.manualIncomeAmount), countText(stats.manualIncomeCount), "추가 정산 입력 기준"],
      ["카드수수료", moneyText(-numberValue(stats.actualCardFee)), "", `카드 결제완료 기준 ${actualCardFeeRate}% 또는 주문 저장 수수료율`],
      ["창고/기타 지출", moneyText(-numberValue(stats.warehouseOtherExpense)), countText(stats.manualExpenseCount), "추가 정산 입력 기준"],
      ["총지출", moneyText(-numberValue(stats.totalExpense)), "", "카드수수료 + 창고/기타 지출"],
      ["결제대기 금액", moneyText(stats.unpaidAmount), "", "실수익 계산 제외"],
      ["실수익", moneyText(stats.netAmount), "", "완료매출 + 기타매출 - 카드수수료 - 창고/기타 지출"],
      [],
      ["2. 일자별 정산 내역"],
      [
        "정산일자",
        "주문건수",
        "전체 주문금액(취소 제외)",
        "완료매출",
        "무통장 완료매출",
        "카드 완료매출",
        "기타매출",
        "카드수수료",
        "창고/기타 지출",
        "결제대기 금액",
        "실수익",
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
      ["카드수수료 기준", `${actualCardFeeRate}%`],
      ["파일 생성 기준", "루루동이 /admin-live 정산통계"],
      ["산식", "실수익 = 완료매출 + 기타매출 - 카드수수료 - 창고/기타 지출"],
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

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT STATS</div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">정산통계</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              방송별·기간별 완료매출, 카드수수료, 창고/기타 지출, 실수익을 조회 중심으로 확인합니다.
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
          기준: 완료매출은 입금확인완료/카드결제완료 주문만 잡습니다. 결제대기 금액은 실수익 계산에서 제외합니다.
          카드수수료는 주문 당시 저장된 actual_card_fee_rate_applied를 우선 사용하고, 창고/기타 지출은 다음 단계의 정산 추가 입력과 연결합니다.
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

      <SettlementCharts trend={trend} stats={stats} broadcastRows={broadcastRows} periodLabel={effectivePeriod.label} />

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
