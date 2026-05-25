"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";

type AnyRow = Record<string, any>;

type Props = {
  orderGroups?: AnyRow[];
  orders?: AnyRow[];
  broadcasts?: AnyRow[];
  settingsSummary?: {
    customerCardRate?: number;
    actualCardRate?: number;
    cardPaymentMinAmount?: number;
    defaultShippingFee?: number;
  };
};

const SETTING_KEYS = {
  actualCardFeeRate: "actual_card_fee_rate",
  customerCardExtraRate: "customer_card_extra_rate",
  cardPaymentMinAmount: "card_payment_min_amount",
} as const;

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = cleanText(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function won(value: unknown) {
  return `${Math.round(toNumber(value)).toLocaleString()}원`;
}

function percentText(value: unknown) {
  const number = toNumber(value);
  return `${number.toLocaleString()}%`;
}

function onlyDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function formatMoneyInput(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";

  return Number(digits).toLocaleString();
}

function rowStatusText(row: AnyRow) {
  return [
    row.admin_order_status_v2,
    row.order_manage_status,
    row.payment_status,
    row.deposit_status,
    row.status,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function isCanceled(row: AnyRow) {
  return /취소|환불|cancel|refund/i.test(rowStatusText(row));
}

function isPaymentDone(row: AnyRow) {
  const text = rowStatusText(row);

  return (
    /자동입금확인|수동입금확인|입금확인|결제완료|카드결제완료|카드완료|paid|confirmed|complete/i.test(text) ||
    Boolean(row.deposit_confirmed_at)
  );
}

function paymentMethod(row: AnyRow) {
  const raw = cleanText(row.payment_method || row.paymentMethod || row.pay_method);

  if (/카드|card/i.test(raw)) return "카드결제";
  if (/무통장|입금|bank/i.test(raw)) return "무통장입금";

  return raw || "기타";
}

function rowAmount(row: AnyRow) {
  return (
    toNumber(row.final_amount) ||
    toNumber(row.adjusted_total_price) ||
    toNumber(row.total_price) ||
    toNumber(row.total_amount) ||
    toNumber(row.order_amount) ||
    toNumber(row.payment_amount) ||
    toNumber(row.amount)
  );
}

function flattenOrders(orderGroups?: AnyRow[], orders?: AnyRow[]) {
  const list: AnyRow[] = [];
  const seen = new Set<string>();

  if (Array.isArray(orderGroups)) {
    orderGroups.forEach((group) => {
      const rows = Array.isArray(group?.rows) ? group.rows : [group?.first].filter(Boolean);
      rows.forEach((row: AnyRow) => {
        const key = cleanText(row?.id || row?.order_id || `${row?.order_lookup_code}-${row?.product_name}`);
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        if (row) list.push(row);
      });
    });
  }

  if (Array.isArray(orders)) {
    orders.forEach((row) => {
      const key = cleanText(row?.id || row?.order_id || `${row?.order_lookup_code}-${row?.product_name}`);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      if (row) list.push(row);
    });
  }

  return list;
}

function StatCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "blue" | "green" | "orange" | "red";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/50 text-blue-700"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50/50 text-emerald-700"
        : tone === "orange"
          ? "border-orange-100 bg-orange-50/50 text-orange-700"
          : tone === "red"
            ? "border-rose-100 bg-rose-50/50 text-rose-700"
            : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-[26px] border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      {sub ? <div className="mt-2 text-xs font-bold text-slate-400">{sub}</div> : null}
    </div>
  );
}

export default function AdminSettlementPanel({
  orderGroups,
  orders,
  broadcasts,
  settingsSummary,
}: Props) {
  const [actualCardFeeRate, setActualCardFeeRate] = useState(String(settingsSummary?.actualCardRate ?? 7));
  const [customerCardExtraRate, setCustomerCardExtraRate] = useState(String(settingsSummary?.customerCardRate ?? 10));
  const [cardPaymentMinAmount, setCardPaymentMinAmount] = useState(
    formatMoneyInput(String(settingsSummary?.cardPaymentMinAmount ?? 100000)),
  );
  const [saving, setSaving] = useState(false);

  const allRows = useMemo(() => flattenOrders(orderGroups, orders), [orderGroups, orders]);

  const stats = useMemo(() => {
    const validRows = allRows.filter((row) => !isCanceled(row));
    const paidRows = validRows.filter(isPaymentDone);

    const bankRows = paidRows.filter((row) => paymentMethod(row) === "무통장입금");
    const cardRows = paidRows.filter((row) => paymentMethod(row) === "카드결제");

    const totalOrderAmount = validRows.reduce((sum, row) => sum + rowAmount(row), 0);
    const paidAmount = paidRows.reduce((sum, row) => sum + rowAmount(row), 0);
    const bankAmount = bankRows.reduce((sum, row) => sum + rowAmount(row), 0);
    const cardAmount = cardRows.reduce((sum, row) => sum + rowAmount(row), 0);
    const unpaidAmount = Math.max(0, totalOrderAmount - paidAmount);
    const cardFeeExpense = Math.round(cardAmount * (toNumber(actualCardFeeRate) / 100));
    const netAmount = paidAmount - cardFeeExpense;

    return {
      totalOrderAmount,
      paidAmount,
      unpaidAmount,
      bankAmount,
      cardAmount,
      cardFeeExpense,
      netAmount,
      totalCount: validRows.length,
      paidCount: paidRows.length,
      bankCount: bankRows.length,
      cardCount: cardRows.length,
      broadcastCount: Array.isArray(broadcasts) ? broadcasts.length : 0,
    };
  }, [allRows, broadcasts, actualCardFeeRate]);

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
    const rows = [
      ["항목", "금액/값", "메모"],
      ["총 주문금액", stats.totalOrderAmount, "취소/환불 제외 주문 기준"],
      ["입금/결제완료", stats.paidAmount, "무통장+카드 완료 기준"],
      ["무통장 입금완료", stats.bankAmount, "입금확인 완료"],
      ["카드 결제완료", stats.cardAmount, "카드 완료"],
      ["카드수수료", stats.cardFeeExpense, `카드 결제완료 × ${actualCardFeeRate}%`],
      ["실수익", stats.netAmount, "입금/결제완료 - 카드수수료"],
      ["고객 카드 부가세율", `${customerCardExtraRate}%`, "주문서 고객 부과 설정"],
      ["카드결제 최소금액", toNumber(cardPaymentMinAmount), "주문서 카드결제 제한"],
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruru_settlement_summary_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const chartMax = Math.max(stats.bankAmount, stats.cardAmount, stats.cardFeeExpense, 1);

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">SETTLEMENT STATS</div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">정산통계</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              방송별·기간별 매출과 카드수수료, 고객 부가세 설정을 조회 중심으로 관리합니다.
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black text-slate-500">실제 카드수수료율</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={actualCardFeeRate}
                onChange={(event) => setActualCardFeeRate(onlyDigits(event.target.value))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <span className="text-sm font-black text-slate-500">%</span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-400">카드 결제완료 금액에서 지출로 차감합니다.</div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black text-slate-500">고객 카드 부가세율</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={customerCardExtraRate}
                onChange={(event) => setCustomerCardExtraRate(onlyDigits(event.target.value))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <span className="text-sm font-black text-slate-500">%</span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-400">현재 주문서 고객 부과 기준입니다.</div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black text-slate-500">카드결제 최소금액</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={cardPaymentMinAmount}
                onChange={(event) => setCardPaymentMinAmount(formatMoneyInput(event.target.value))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <span className="text-sm font-black text-slate-500">원</span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-400">고객 주문서 카드결제 제한 기준입니다.</div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? "저장중" : "정산 설정 저장"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-7 md:grid-cols-2">
        <StatCard label="총 주문금액" value={won(stats.totalOrderAmount)} sub={`${stats.totalCount.toLocaleString()}건`} tone="slate" />
        <StatCard label="입금/결제완료" value={won(stats.paidAmount)} sub={`${stats.paidCount.toLocaleString()}건`} tone="blue" />
        <StatCard label="무통장 입금완료" value={won(stats.bankAmount)} sub={`${stats.bankCount.toLocaleString()}건`} tone="green" />
        <StatCard label="카드 결제완료" value={won(stats.cardAmount)} sub={`${stats.cardCount.toLocaleString()}건`} tone="blue" />
        <StatCard label={`카드수수료(${percentText(actualCardFeeRate)})`} value={`-${won(stats.cardFeeExpense)}`} sub="지출 처리" tone="red" />
        <StatCard label="미입금/확인필요" value={won(stats.unpaidAmount)} sub="취소/환불 제외" tone="orange" />
        <StatCard label="실수익" value={won(stats.netAmount)} sub="완료금액 - 카드수수료" tone="green" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="text-lg font-black text-slate-950">결제수단별 정산 흐름</div>
          <div className="mt-1 text-xs font-bold text-slate-400">현재 조회된 주문 데이터 기준입니다.</div>

          <div className="mt-6 grid gap-4">
            {[
              ["무통장 입금완료", stats.bankAmount, "bg-emerald-500"],
              ["카드 결제완료", stats.cardAmount, "bg-blue-500"],
              [`카드수수료 ${percentText(actualCardFeeRate)}`, stats.cardFeeExpense, "bg-rose-500"],
            ].map(([label, amount, color]) => (
              <div key={String(label)}>
                <div className="mb-2 flex justify-between text-sm font-black text-slate-700">
                  <span>{label}</span>
                  <span>{won(amount)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${Math.max(4, Math.min(100, (toNumber(amount) / chartMax) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="text-lg font-black text-slate-950">다음 단계</div>
          <div className="mt-3 grid gap-3 text-sm font-bold text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">방송리스트 다중선택 필터</div>
            <div className="rounded-2xl bg-slate-50 p-4">수동 매출/지출 입력 DB 분리</div>
            <div className="rounded-2xl bg-slate-50 p-4">과거 데이터 추가/수정이력</div>
            <div className="rounded-2xl bg-slate-50 p-4">세무사용 엑셀 시트 분리 내보내기</div>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-orange-100 bg-orange-50 px-5 py-4 text-sm font-bold leading-6 text-orange-800">
        수동 매출/지출 저장과 과거 데이터 이관은 별도 DB 테이블과 수정이력 로그가 필요합니다. 이번 1차에서는 주문/입금 로직을 건드리지 않고 정산 설정과 조회용 통계만 먼저 안전하게 분리했습니다.
      </div>
    </section>
  );
}
