"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import type { AnyRow, PaymentFilter, SettlementSettingsSummary } from "./settlementTypes";
import {
  buildBroadcastOptions,
  buildBroadcastRows,
  buildDailyTrend,
  calculateStats,
  filterRows,
  flattenOrders,
  formatMoneyInput,
  toNumber,
} from "./settlementUtils";
import SettlementSettingsCard from "./SettlementSettingsCard";
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

const SETTING_KEYS = {
  actualCardFeeRate: "actual_card_fee_rate",
  customerCardExtraRate: "customer_card_extra_rate",
  cardPaymentMinAmount: "card_payment_min_amount",
} as const;

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
  const [actualCardFeeRate, setActualCardFeeRate] = useState(String(settingsSummary?.actualCardRate ?? 7));
  const [customerCardExtraRate, setCustomerCardExtraRate] = useState(String(settingsSummary?.customerCardRate ?? 10));
  const [cardPaymentMinAmount, setCardPaymentMinAmount] = useState(
    formatMoneyInput(String(settingsSummary?.cardPaymentMinAmount ?? 100000)),
  );
  const [saving, setSaving] = useState(false);

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

  const saveSettings = async () => {
    const actualFee = Math.min(20, Math.max(0, toNumber(actualCardFeeRate)));
    const customerRate = Math.min(20, Math.max(0, toNumber(customerCardExtraRate)));
    const minAmount = Math.max(0, Math.round(toNumber(cardPaymentMinAmount)));

    setSaving(true);

    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: SETTING_KEYS.actualCardFeeRate, value: String(actualFee) },
          { key: SETTING_KEYS.customerCardExtraRate, value: String(customerRate) },
          { key: SETTING_KEYS.cardPaymentMinAmount, value: String(minAmount) },
        ],
        { onConflict: "key" },
      );

      if (error) {
        showAdminToast("정산 설정 저장 실패\n\n" + error.message, "error");
        return;
      }

      setActualCardFeeRate(String(actualFee));
      setCustomerCardExtraRate(String(customerRate));
      setCardPaymentMinAmount(formatMoneyInput(String(minAmount)));
      showAdminToast("정산 설정을 저장했습니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  const exportSummaryCsv = () => {
    const summaryRows = [
      ["구분", "값", "메모"],
      ["총 주문금액", stats.totalOrderAmount, "취소/환불 제외 주문 기준"],
      ["입금/결제완료", stats.paidAmount, "무통장+카드 완료 기준"],
      ["무통장 입금완료", stats.bankAmount, "입금확인 완료"],
      ["카드 결제완료", stats.cardAmount, "카드 완료"],
      ["카드수수료", stats.actualCardFee, `카드 결제완료 × ${actualCardFeeRate}% 또는 주문 저장 수수료율`],
      ["고객 카드추가금", stats.customerCardExtra, "주문서 고객 부과 카드 추가금"],
      ["실수익", stats.netAmount, "입금/결제완료 - 카드수수료"],
      ["미입금/확인필요", stats.unpaidAmount, "취소/환불 제외"],
      ["수동 매출/지출", "다음 단계", "별도 DB와 수정이력 필요"],
    ];

    const broadcastHeader = [
      "방송/날짜",
      "주문건수",
      "총 주문금액",
      "입금/결제완료",
      "무통장",
      "카드",
      "카드수수료",
      "카드추가금",
      "미입금",
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
      row.customerCardExtra,
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
              방송별·기간별 매출, 결제수단, 카드수수료, 실수익을 조회 중심으로 확인합니다.
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
          기준: 주문금액은 final_amount → adjusted_total_price → total_price 순서로 계산합니다. 카드수수료는 주문 당시 저장된 actual_card_fee_rate_applied를 우선 사용하고, 없으면 현재 설정값을 적용합니다.
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

      <SettlementSettingsCard
        actualCardFeeRate={actualCardFeeRate}
        customerCardExtraRate={customerCardExtraRate}
        cardPaymentMinAmount={cardPaymentMinAmount}
        saving={saving}
        onActualCardFeeRateChange={setActualCardFeeRate}
        onCustomerCardExtraRateChange={setCustomerCardExtraRate}
        onCardPaymentMinAmountChange={setCardPaymentMinAmount}
        onSave={saveSettings}
      />

      <div className="rounded-[30px] border border-orange-100 bg-orange-50 px-5 py-4 text-sm font-bold leading-6 text-orange-800">
        수동 매출/지출 입력, 과거 데이터 추가, 수정이력은 별도 DB 테이블이 필요합니다. 다음 단계에서 주문 데이터와 분리해서 안전하게 추가합니다.
      </div>
    </section>
  );
}
