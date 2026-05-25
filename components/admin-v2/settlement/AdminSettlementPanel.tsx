"use client";

import { useMemo, useState } from "react";
import type { AnyRow, PaymentFilter, SettlementSettingsSummary } from "./settlementTypes";
import {
  buildBroadcastOptions,
  buildBroadcastRows,
  buildDailyTrend,
  calculateStats,
  filterRows,
  flattenOrders,
  toNumber,
} from "./settlementUtils";
import SettlementFilterBar from "./SettlementFilterBar";
import SettlementSummaryCards from "./SettlementSummaryCards";
import SettlementCharts from "./SettlementCharts";
import SettlementBroadcastTable from "./SettlementBroadcastTable";

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

  const actualRateNumber = toNumber(actualCardFeeRate);
  const stats = useMemo(() => calculateStats(filteredRows, actualRateNumber), [filteredRows, actualRateNumber]);
  const trend = useMemo(() => buildDailyTrend(filteredRows, actualRateNumber), [filteredRows, actualRateNumber]);
  const broadcastRows = useMemo(() => {
    return buildBroadcastRows(filteredRows, broadcastOptions, actualRateNumber);
  }, [filteredRows, broadcastOptions, actualRateNumber]);

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setPaymentFilter("전체");
    setSelectedBroadcastKeys([]);
  };

  const exportSummaryCsv = () => {
    const summaryRows = [
      ["구분", "값", "메모"],
      ["총주문액", stats.totalOrderAmount, "취소/환불 제외 주문 기준"],
      ["완료매출", stats.paidAmount, "무통장+카드 완료 기준"],
      ["무통장", stats.bankAmount, "입금확인 완료"],
      ["카드", stats.cardAmount, "카드 완료"],
      ["카드수수료", stats.actualCardFee, `카드 결제완료 × ${actualCardFeeRate}% 또는 주문 저장 수수료율`],
      ["창고정산/기타지출", stats.warehouseOtherExpense, "수동 지출 연결 예정"],
      ["지출합계", stats.totalExpense, "카드수수료 + 창고정산/기타지출"],
      ["미입금/확인필요", stats.unpaidAmount, "실수익 계산 제외"],
      ["실수익", stats.netAmount, "완료매출 - 지출합계"],
    ];

    const broadcastHeader = [
      "방송/날짜",
      "주문건수",
      "총주문액",
      "완료매출",
      "무통장",
      "카드",
      "카드수수료",
      "창고정산/기타지출",
      "미입금/확인필요",
      "실수익",
    ];

    const broadcastCsvRows = broadcastRows.map((row) => [
      row.label,
      row.count,
      row.totalOrderAmount,
      row.paidAmount,
      row.bankAmount,
      row.cardAmount,
      row.actualCardFee,
      row.warehouseOtherExpense,
      row.unpaidAmount,
      row.netAmount,
    ]);

    const csv = [
      ["[정산 요약]"],
      ...summaryRows,
      [],
      ["[방송별 정산]"],
      broadcastHeader,
      ...broadcastCsvRows,
      [],
      ["[필터]"],
      ["시작일", startDate || "전체"],
      ["종료일", endDate || "전체"],
      ["결제수단", paymentFilter],
      ["방송선택", selectedBroadcastKeys.length === 0 ? "전체보기" : `${selectedBroadcastKeys.length}개 선택`],
      ["참고", `deposits 전달 ${Array.isArray(deposits) ? deposits.length : 0}건`],
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `ruru_settlement_stats_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

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

          <button
            type="button"
            onClick={exportSummaryCsv}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            엑셀용 CSV 내보내기
          </button>
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
        수동 매출/지출 입력, 창고정산/기타지출 반영, 과거 데이터 추가, 수정이력은 별도 DB 테이블이 필요합니다. 다음 단계에서 주문 데이터와 분리해서 안전하게 추가합니다.
      </div>
    </section>
  );
}
