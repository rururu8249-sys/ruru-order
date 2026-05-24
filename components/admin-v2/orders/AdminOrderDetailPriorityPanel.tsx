"use client";

// components/admin-v2/orders/AdminOrderDetailPriorityPanel.tsx
// 목적: 주문상세 최상단에서 지금 해야 할 일과 처리 버튼을 한눈에 보여줌
// 주의: UI 액션 연결 전용. 자동입금확인, 금액계산, 정산, 송장 로직 없음.

import { useState } from "react";
import type { OrderGroup } from "@/lib/admin-v2/types";
import { money } from "@/lib/admin-v2/formatters";
import {
  getOrderStatusValue,
  isBankUnpaid,
  isCardUnpaid,
  paymentStatusMeta,
} from "@/lib/admin-v2/orderHelpers";
import { getDeliveryStageStatusLabel } from "@/lib/admin-v2/statusDisplay";
import AdminOrderPaymentCancelAction from "./AdminOrderPaymentCancelAction";
import AdminOrderDangerActionGuide from "./AdminOrderDangerActionGuide";

type Props = {
  group: OrderGroup;
  onStatusChange: (group: OrderGroup, nextStatus: string) => Promise<void>;
  onOpenManualMatch: (group: OrderGroup) => void;
};

function chipClass(tone: "danger" | "warn" | "good" | "blue" | "neutral") {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-700";
}

export default function AdminOrderDetailPriorityPanel({
  group,
  onStatusChange,
  onOpenManualMatch,
}: Props) {
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const first = group.first;
  const rawStatus = getOrderStatusValue(first);
  const paymentMeta = paymentStatusMeta(first);
  const deliveryStage = getDeliveryStageStatusLabel(rawStatus);

  const canceled = rawStatus === "주문취소" || rawStatus === "주문서취소";
  const bankUnpaid = isBankUnpaid(first);
  const cardUnpaid = isCardUnpaid(first);
  const shipped = rawStatus === "출고완료" || Boolean(first.shipped_at);
  const hasTracking = Boolean(String(first.tracking_number || "").trim());

  let title = "처리 상태 확인";
  let desc = "주문상태와 배송처리를 확인하세요.";
  let tone: "danger" | "warn" | "good" | "blue" | "neutral" = "neutral";

  if (canceled) {
    title = "주문서 취소 상태";
    desc = "주문서가 폐기된 상태입니다. 다시 살릴 때만 주문서복구를 누르세요.";
    tone = "danger";
  } else if (bankUnpaid) {
    title = "입금관리";
    desc = "입금확인을 잘못 처리한 경우에는 입금확인 취소를 사용하세요. 새 입금 확인은 입금매칭 또는 입금내역 없이 수동확인을 사용하세요.";
    tone = "warn";
  } else if (cardUnpaid) {
    title = "카드결제 확인 필요";
    desc = "카드결제완료를 잘못 처리한 경우에는 카드미결제로 되돌리기를 사용하세요. 주문 자체를 없애야 할 때만 주문서 자체 취소를 사용하세요.";
    tone = "warn";
  } else if (!shipped) {
    title = hasTracking ? "출고완료 처리 필요" : "배송처리 필요";
    desc = hasTracking
      ? "송장번호가 있습니다. 발송완료 처리 여부를 확인하세요."
      : "결제는 끝났고, 송장/배송처리 확인이 필요합니다.";
    tone = "blue";
  } else {
    title = "처리완료 확인";
    desc = "결제와 발송 처리가 완료된 주문입니다.";
    tone = "good";
  }

  const runStatusAction = async (actionKey: string, nextStatus: string, messageLines: string[]) => {
    const ok = window.confirm(messageLines.join("\n"));
    if (!ok) return;

    setSavingAction(actionKey);
    try {
      await onStatusChange(group, nextStatus);
    } finally {
      setSavingAction(null);
    }
  };

  const cancelOrder = () => {
    runStatusAction("cancel", "주문취소", [
      "이 주문서를 주문서 취소 상태로 변경할까요?",
      "",
      "중요: 주문상태만 변경합니다.",
      "환불, 입금내역 연결 해제, 정산 차감은 자동 처리하지 않습니다.",
      "돈 관련 처리는 별도로 확인해야 합니다.",
    ]);
  };

  const restoreOrder = () => {
    runStatusAction("restore", "미설정", [
      "주문서취소 상태를 다시 주문서복구 처리할까요?",
      "",
      "상태는 미설정으로 돌아갑니다.",
      "주문서복구는 주문서를 다시 살리는 기능이며 입금확인 기록은 자동으로 변경하지 않습니다.",
    ]);
  };

  const confirmWithoutDeposit = () => {
    runStatusAction("manual-paid", "수동입금확인", [
      "입금내역 매칭 없이 결제완료 처리할까요?",
      "",
      "주문상태는 결제완료(수동)으로 표시됩니다.",
      "deposits 입금내역과는 연결하지 않습니다.",
      "실제 결제/입금 확인이 끝난 경우에만 진행하세요.",
    ]);
  };

  const confirmCardPaid = () => {
    runStatusAction("card-paid", "카드결제완료", [
      "카드결제완료 처리할까요?",
      "",
      "실제 카드결제 확인이 끝난 경우에만 진행하세요.",
      "입금내역 매칭과는 별개로 처리됩니다.",
    ]);
  };

  const buttonBase =
    "h-10 rounded-xl px-3 text-[13px] font-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${chipClass(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <div className="text-[13px] font-black opacity-70">지금 해야 할 일</div>
          <div className="mt-1 text-[26px] font-black tracking-[-0.06em]">
            {title}
          </div>
          <div className="mt-1 text-[13px] font-bold opacity-80">
            {desc}
          </div>
        </div>

        <div className="grid min-w-[240px] gap-1.5 rounded-2xl bg-white/80 p-3 text-[12px] font-black">
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">주문상태</span>
            <span>{paymentMeta.label}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">배송처리</span>
            <span>{deliveryStage}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">최종금액</span>
            <span className="text-red-600">{money(group.totalAmount)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <AdminOrderPaymentCancelAction group={group} />

        {canceled ? (
          <button
            type="button"
            onClick={restoreOrder}
            disabled={savingAction !== null}
            className={`${buttonBase} border border-emerald-300 bg-white text-emerald-700`}
          >
            {savingAction === "restore" ? "처리중..." : "🔄 주문서복구"}
          </button>
        ) : bankUnpaid ? (
          <>
            <button
              type="button"
              onClick={() => onOpenManualMatch(group)}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-blue-300 bg-white text-blue-700`}
            >
              입금 매칭하기
            </button>
            <button
              type="button"
              onClick={confirmWithoutDeposit}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-slate-300 bg-white text-slate-800`}
            >
              {savingAction === "manual-paid" ? "처리중..." : "입금내역 없이 수동확인"}
            </button>
            <AdminOrderDangerActionGuide />
            <button
              type="button"
              onClick={cancelOrder}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-red-200 bg-white text-red-600`}
            >
              {savingAction === "cancel" ? "처리중..." : "주문서 자체 취소"}
            </button>
          </>
        ) : cardUnpaid ? (
          <>
            <button
              type="button"
              onClick={confirmCardPaid}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-blue-300 bg-white text-blue-700 md:col-span-2`}
            >
              {savingAction === "card-paid" ? "처리중..." : "카드결제완료 처리"}
            </button>
            <AdminOrderDangerActionGuide />
            <button
              type="button"
              onClick={cancelOrder}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-red-200 bg-white text-red-600`}
            >
              {savingAction === "cancel" ? "처리중..." : "주문서 자체 취소"}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-white/80 px-4 py-3 text-[13px] font-black text-neutral-700 md:col-span-2">
              결제완료 상태입니다. 송장 입력은 아래 C. 입금 · 출고 영역에서 처리하세요.
            </div>
            <AdminOrderDangerActionGuide />
            <button
              type="button"
              onClick={cancelOrder}
              disabled={savingAction !== null}
              className={`${buttonBase} border border-red-200 bg-white text-red-600`}
            >
              {savingAction === "cancel" ? "처리중..." : "주문서 자체 취소"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
