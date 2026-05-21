"use client";

import { useEffect, useState } from "react";
import type {
  MoneyEditLogRow,
  OrderGroup,
  OrderRow,
  StatusChangeLogRow,
} from "@/lib/admin-v2/types";
import {
  displayOrderPhone,
  formatDateLabel,
  money,
  moneyInput,
  moneyNumber,
} from "@/lib/admin-v2/formatters";
import {
  buildProductSummaryFromRow,
  getAdminMemo,
  getLegacyProductMemo,
  getOrderStatusLabel,
  getOrderStatusValue,
  getShippingExcelMemo,
  getShippingRequestMemo,
  getSpecialNote,
  orderBaseAmount,
  paymentStatusMeta,
} from "@/lib/admin-v2/orderHelpers";
import AdminOrderDetailSummary from "@/components/admin-v2/orders/AdminOrderDetailSummary";
import AdminOrderMemoSection from "@/components/admin-v2/orders/AdminOrderMemoSection";
import AdminOrderDetailPriorityPanel from "@/components/admin-v2/orders/AdminOrderDetailPriorityPanel";

export default function AdminOrderDetailBlock({
  group,
  moneyEditLogs,
  statusChangeLogs,
  onTrackingChange,
  onFinalAmountChange,
}: {
  group: OrderGroup;
  moneyEditLogs: MoneyEditLogRow[];
  statusChangeLogs: StatusChangeLogRow[];
  onTrackingChange: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
  onFinalAmountChange: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  const first = group.first;
  const paymentMeta = paymentStatusMeta(first);
  const address = [first.address, first.detail_address].filter(Boolean).join(" ");
  const shippingRequestMemo = getShippingRequestMemo(first);
  const shippingExcelMemo = getShippingExcelMemo(first);
  const adminMemo = getAdminMemo(first);
  const specialNote = getSpecialNote(first);
  const legacyProductMemo = getLegacyProductMemo(first);
  const productSummary = group.rows.map((row) => buildProductSummaryFromRow(row)).join(" / ");

  return (
    <div className="grid gap-3 bg-neutral-50 px-3 py-3">
      <AdminOrderDetailPriorityPanel group={group} />
      <AdminOrderDetailSummary
        phoneText={displayOrderPhone(first)}
        addressText={address || "-"}
        productSummaries={group.rows.map((row) => `${buildProductSummaryFromRow(row)} · 현재 최종 ${money(orderBaseAmount(row))}`)}
        paymentStatusText={`${paymentMeta.label} · ${paymentMeta.desc}`}
        depositConfirmedText={first.deposit_confirmed_at ? formatDateLabel(first.deposit_confirmed_at) : "미확인"}
        shippedAtText={first.shipped_at ? formatDateLabel(first.shipped_at) : "미처리"}
        trackingText={`${first.tracking_company || "로젠"} ${first.tracking_number || "미등록"}`}
        adminMemo={adminMemo || "없음"}
      />

      <AdminOrderMemoSection
        shippingExcelMemo={shippingExcelMemo}
        productSummary={productSummary}
        legacyProductMemo={legacyProductMemo}
        adminMemo={adminMemo}
        specialNote={specialNote}
      />

      <TrackingEditor group={group} onSave={onTrackingChange} />

      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">💰 최종정산금액 수정</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
              원본 금액은 건드리지 않고 final_amount만 저장합니다. 수정 사유는 필수입니다.
            </div>
          </div>
          <div className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">
            돈 로직: 사유 없이 수정 금지
          </div>
        </div>

        <div className="grid gap-2">
          {group.rows.map((row) => (
            <FinalAmountEditor key={row.id} row={row} onSave={onFinalAmountChange} />
          ))}
        </div>
      </div>

      <MoneyEditLogPanel logs={moneyEditLogs} />
      <StatusChangeLogPanel logs={statusChangeLogs} />
    </div>
  );
}

function StatusChangeLogPanel({ logs }: { logs: StatusChangeLogRow[] }) {
  return (
    <details className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">🔁 상태 변경이력</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
              필요할 때만 펼쳐서 확인합니다.
            </div>
          </div>
          <div className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-black text-neutral-600">
            {logs.length}건
          </div>
        </div>
      </summary>

      <div className="mt-3">
        {logs.length === 0 ? (
          <div className="rounded-xl bg-neutral-50 p-3 text-center text-[12px] font-bold text-neutral-400">
            상태 변경이력이 없습니다.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-1 rounded-xl bg-neutral-50 p-2 text-[12px] font-bold text-neutral-700 md:grid-cols-[128px_1fr_160px] md:items-center">
                <div className="font-black text-neutral-500">{formatDateLabel(log.changed_at)}</div>
                <div>
                  <span className="font-black text-amber-700">{getOrderStatusLabel(log.before_status)}</span>
                  <span className="mx-1 text-neutral-400">→</span>
                  <span className="font-black text-blue-700">{getOrderStatusLabel(log.after_status)}</span>
                  <span className="ml-2 text-neutral-500">
                    {log.payment_method || "-"}
                    {log.deposit_confirmed_at_after ? ` · 입금확인 ${formatDateLabel(log.deposit_confirmed_at_after)}` : ""}
                  </span>
                </div>
                <div className="text-neutral-500 md:text-right">
                  {log.changed_by || "admin-v2"} · 주문ID {log.order_id || "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function MoneyEditLogPanel({ logs }: { logs: MoneyEditLogRow[] }) {
  return (
    <details className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">🧾 금액 수정이력</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
              돈 관련 이력은 필요할 때만 펼쳐서 확인합니다.
            </div>
          </div>
          <div className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-black text-neutral-600">
            {logs.length}건
          </div>
        </div>
      </summary>

      <div className="mt-3">
        {logs.length === 0 ? (
          <div className="rounded-xl bg-neutral-50 p-3 text-center text-[12px] font-bold text-neutral-400">
            금액 수정이력이 없습니다.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-1 rounded-xl bg-neutral-50 p-2 text-[12px] font-bold text-neutral-700 md:grid-cols-[128px_1fr_160px] md:items-center">
                <div className="font-black text-neutral-500">{formatDateLabel(log.changed_at)}</div>
                <div>
                  <span className="font-black text-red-700">{money(log.before_numeric)}</span>
                  <span className="mx-1 text-neutral-400">→</span>
                  <span className="font-black text-blue-700">{money(log.after_numeric)}</span>
                  <span className="ml-2 text-neutral-500">사유: {log.reason || "-"}</span>
                </div>
                <div className="text-neutral-500 md:text-right">
                  {log.changed_by || "admin-v2"} · 주문ID {log.order_id}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

const TRACKING_COMPANIES = ["로젠", "CJ대한통운", "한진", "롯데", "우체국", "기타"];

function TrackingEditor({
  group,
  onSave,
}: {
  group: OrderGroup;
  onSave: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
}) {
  const first = group.first;
  const [trackingCompany, setTrackingCompany] = useState(first.tracking_company || "로젠");
  const [trackingNumber, setTrackingNumber] = useState(first.tracking_number || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTrackingCompany(first.tracking_company || "로젠");
    setTrackingNumber(first.tracking_number || "");
  }, [first.tracking_company, first.tracking_number]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(group, trackingCompany, trackingNumber);
    } finally {
      setSaving(false);
    }
  };

  const shippedAtText = first.shipped_at ? formatDateLabel(first.shipped_at) : "아직 출고완료 처리 전";
  const trackingMissingAfterShip = getOrderStatusValue(first) === "출고완료" && !String(first.tracking_number || "").trim();

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-black">🚚 송장/출고 관리</div>
          <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
            같은 주문묶음 전체에 동일한 택배사/송장번호를 저장합니다. 택배 엑셀 배송메모는 request_memo만 사용해야 합니다.
          </div>
        </div>
        <div className={`rounded-lg px-2 py-1 text-[11px] font-black ${trackingMissingAfterShip ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>
          {trackingMissingAfterShip ? "출고완료인데 송장없음" : `출고시간 ${shippedAtText}`}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[150px_minmax(180px,1fr)_86px]">
        <select
          value={trackingCompany}
          onChange={(event) => setTrackingCompany(event.target.value)}
          className="h-10 rounded-lg border border-neutral-200 bg-white px-2 text-[14px] font-black outline-none focus:border-neutral-950"
        >
          {TRACKING_COMPANIES.map((company) => (
            <option key={company} value={company}>{company}</option>
          ))}
        </select>

        <input
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value.replace(/\s+/g, ""))}
          inputMode="numeric"
          className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[15px] font-black outline-none focus:border-neutral-950"
          placeholder="송장번호 입력"
        />

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 rounded-lg bg-neutral-950 px-3 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {saving ? "저장중" : "저장"}
        </button>
      </div>
    </div>
  );
}

function FinalAmountEditor({
  row,
  onSave,
}: {
  row: OrderRow;
  onSave: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  const currentAmount = orderBaseAmount(row);
  const [amountText, setAmountText] = useState(String(currentAmount));
  const [reason, setReason] = useState(row.admin_price_memo || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmountText(String(orderBaseAmount(row)));
    setReason(row.admin_price_memo || "");
  }, [row.final_amount, row.adjusted_total_price, row.total_price, row.admin_price_memo]);

  const save = async () => {
    const nextAmount = moneyNumber(amountText);
    setSaving(true);
    try {
      await onSave(row, nextAmount, reason);
    } finally {
      setSaving(false);
    }
  };

  const hasFinalOverride = row.final_amount !== null && row.final_amount !== undefined;

  return (
    <div className="grid gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-2 lg:grid-cols-[minmax(220px,1fr)_130px_150px_minmax(200px,1fr)_82px] lg:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-black text-neutral-800">
          {[row.product_name, row.color, row.size].filter(Boolean).join(" / ") || "상품명 없음"}
        </div>
        <div className="mt-0.5 text-[11px] font-bold text-neutral-500">
          원본 {money(row.total_price)} · 기준계산 {money(row.adjusted_total_price ?? row.total_price)} · 최종정산 {hasFinalOverride ? `${money(row.final_amount)} 직접수정됨` : "미수정"}
        </div>
      </div>
      <div className="text-[12px] font-black text-neutral-600 lg:text-right">현재 최종 {money(currentAmount)}</div>
      <input
        value={Number(amountText || 0).toLocaleString()}
        onChange={(event) => setAmountText(moneyInput(event.target.value))}
        inputMode="numeric"
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-right text-[14px] font-black outline-none focus:border-neutral-950"
        placeholder="최종금액"
      />
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-[13px] font-bold outline-none focus:border-neutral-950"
        placeholder="수정사유 필수 예: 부분환불"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="h-9 rounded-lg bg-neutral-950 px-2 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {saving ? "저장중" : "저장"}
      </button>
    </div>
  );
}
