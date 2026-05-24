"use client";

import { useMemo, useState } from "react";

type AnyRow = Record<string, any>;

type AdminOrderPaymentCancelActionProps = {
  group: {
    groupId?: string;
    first?: AnyRow;
    rows?: AnyRow[];
  };
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function statusText(row: AnyRow) {
  return [
    row.admin_order_status_v2,
    row.order_manage_status,
    row.admin_order_status,
    row.order_status,
  ]
    .filter(Boolean)
    .join(" ");
}

function isCardPayment(row: AnyRow) {
  return clean(row.payment_method).includes("카드");
}

function hasPaymentConfirmedRecord(rows: AnyRow[]) {
  return rows.some((row) => {
    const text = statusText(row);
    return /자동입금확인|수동입금확인|입금확인/.test(text) || Boolean(row.deposit_confirmed_at);
  });
}

function isCanceledOrder(rows: AnyRow[]) {
  return rows.some((row) => /주문취소|주문서취소|취소/.test(statusText(row)));
}

function buildOrderIds(rows: AnyRow[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}

export default function AdminOrderPaymentCancelAction({ group }: AdminOrderPaymentCancelActionProps) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const rows = group.rows || [];
  const first = group.first || rows[0] || {};
  const orderIds = useMemo(() => buildOrderIds(rows), [rows]);

  const isCanceled = isCanceledOrder(rows);

  const canCancelPaymentConfirm =
    rows.length > 0 &&
    !isCardPayment(first) &&
    hasPaymentConfirmedRecord(rows);

  const buttonLabel = isCanceled ? "취소주문 입금기록 정리" : "입금확인 취소";
  const guideText = isCanceled
    ? "주문서는 이미 취소된 상태입니다. 다만 입금확인 기록이 남아있어 정산에서 제외하려면 이 버튼을 사용하세요."
    : "입금확인을 잘못 처리한 경우에만 사용하세요. 주문서 자체 취소와는 별도 기능이며, 돈 확인 상태만 주문확인전으로 되돌립니다.";

  const runPaymentConfirmCancel = async () => {
    if (!canCancelPaymentConfirm || saving) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin-v2/payment-confirm-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds,
          orderGroupId: group.groupId || first.order_group_id || first.order_lookup_code || "",
          orderLookupCode: first.order_lookup_code || "",
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setErrorMessage(result?.message || "입금확인 취소 실패");
        return;
      }

      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  if (!canCancelPaymentConfirm) return null;

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={runPaymentConfirmCancel}
        disabled={saving}
        className="h-10 rounded-xl border border-slate-300 bg-white text-[13px] font-black text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400"
      >
        {saving ? "처리중..." : buttonLabel}
      </button>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-4 text-slate-500">
        {guideText}
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-black leading-4 text-red-700">
          입금확인 취소 오류: {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
