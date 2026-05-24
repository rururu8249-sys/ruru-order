"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrder } from "./types";

type SavingAction = "" | "cancel" | "restore";

type UseLiveOrderCancelRestoreArgs = {
  order: LiveOrder;
  onAfterStatusChange?: () => void | Promise<void>;
  onClose?: () => void;
};

const CANCELED_STATUS = "주문취소";
const RESTORED_ADMIN_STATUS = "미설정";
const RESTORED_MANAGE_STATUS = "주문확인전";

function getOrderRowIds(order: LiveOrder) {
  const fromRowIds = Array.isArray(order.rowIds) ? order.rowIds : [];
  const fromItems = Array.isArray(order.items)
    ? order.items.map((item) => Number(item.id))
    : [];

  return Array.from(
    new Set([...fromRowIds, ...fromItems].filter((id) => Number.isFinite(id) && id > 0))
  );
}

export function isLiveOrderCanceled(order: LiveOrder) {
  return order.paymentStatus === "canceled";
}

export function useLiveOrderCancelRestore({
  order,
  onAfterStatusChange,
  onClose,
}: UseLiveOrderCancelRestoreArgs) {
  const [savingAction, setSavingAction] = useState<SavingAction>("");

  const updateOrderStatus = async (nextStatus: "cancel" | "restore") => {
    const rowIds = getOrderRowIds(order);

    if (rowIds.length === 0) {
      alert("상태 변경할 주문 ID가 없습니다.");
      return;
    }

    const isCancel = nextStatus === "cancel";

    const confirmMessage = isCancel
      ? [
          "이 주문서를 주문서취소 상태로 변경할까요?",
          "",
          "주문금액/상품/배송비/입금내역은 변경하지 않습니다.",
          "주문상태만 주문취소로 변경합니다.",
          "자동입금확인·송장·정산 계산에서는 취소 상태로 처리됩니다.",
        ].join("\n")
      : [
          "주문서취소 상태를 다시 복구할까요?",
          "",
          "상태는 주문확인전으로 돌아갑니다.",
          "입금확인은 자동으로 되살리지 않습니다.",
          "필요하면 입금확인을 다시 처리하세요.",
        ].join("\n");

    if (!window.confirm(confirmMessage)) return;

    setSavingAction(nextStatus);

    try {
      const patch = isCancel
        ? {
            admin_order_status_v2: CANCELED_STATUS,
            order_manage_status: CANCELED_STATUS,
          }
        : {
            admin_order_status_v2: RESTORED_ADMIN_STATUS,
            order_manage_status: RESTORED_MANAGE_STATUS,
          };

      const { error } = await supabase
        .from("orders")
        .update(patch)
        .in("id", rowIds);

      if (error) {
        alert((isCancel ? "주문서취소 실패" : "주문서복구 실패") + "\n\n" + error.message);
        return;
      }

      alert(isCancel ? "주문서취소 처리됐습니다." : "주문서복구 처리됐습니다.");

      await onAfterStatusChange?.();
      onClose?.();
    } finally {
      setSavingAction("");
    }
  };

  return {
    savingAction,
    cancelOrder: () => updateOrderStatus("cancel"),
    restoreOrder: () => updateOrderStatus("restore"),
  };
}
