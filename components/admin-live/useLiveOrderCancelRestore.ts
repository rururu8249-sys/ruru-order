"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
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
      showAdminToast("상태 변경할 주문 ID가 없습니다.", "warning");
      return;
    }

    const isCancel = nextStatus === "cancel";

    // [2026-08-20] 입금확인된 주문인지 — deposit_confirmed_at 이 있으면 paidAt 이 채워진다(liveOrderAdapter 335행).
    //   카드결제는 입금확인 취소 API가 거부하므로(카드미결제로 되돌리기 사용) 대상에서 뺀다.
    const isCardOrder = String(order.paymentMethod || "").includes("카드");
    const shouldReleaseDeposit = isCancel && Boolean(order.paidAt) && !isCardOrder;

    const confirmMessage = isCancel
      ? [
          "이 주문서를 주문서취소 상태로 변경할까요?",
          "",
          "주문금액·상품·배송비는 변경하지 않습니다.",
          "포인트·재고는 자동으로 복구됩니다.",
          ...(shouldReleaseDeposit
            ? [
                "입금확인된 주문이라 입금 연결도 함께 풀립니다.",
                "입금내역이 '미확인'으로 돌아가, 손님이 다시 낸 주문서에 자동입금확인이 붙습니다.",
              ]
            : []),
          "자동입금확인·송장·정산 계산에서는 취소 상태로 처리됩니다.",
        ].join("\n")
      : [
          "주문서취소 상태를 다시 복구할까요?",
          "",
          "상태는 주문확인전으로 돌아갑니다.",
          "입금확인은 자동으로 되살리지 않습니다.",
          "필요하면 입금확인을 다시 처리하세요.",
        ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return;

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

      if (isCancel) {
        const { data, error } = await (supabase as any).rpc("cancel_order_and_restore_points", {
          p_order_ids: rowIds,
          p_cancel_status: CANCELED_STATUS,
          p_admin_memo: "admin-live 주문서취소 자동 포인트 복구",
        });

        if (error) {
          showAdminToast("주문서취소 실패\n\n" + error.message, "error");
          return;
        }

        const restoredTotal = Number(data?.restored_total || 0);
        const restoredText =
          restoredTotal > 0
            ? `\n포인트 ${restoredTotal.toLocaleString("ko-KR")}원 자동복구 완료`
            : "";

        showAdminToast(`주문서취소 처리됐습니다.${restoredText}`, "success");
      } else {
        const { error } = await supabase
          .from("orders")
          .update(patch)
          .in("id", rowIds);

        if (error) {
          showAdminToast("주문서복구 실패\n\n" + error.message, "error");
          return;
        }

        showAdminToast("주문서복구 처리됐습니다.", "success");
      }

      // 재고 정합: 취소=재고 복구 / 복구(취소해제)=재고 재차감.
      // 별도 RPC(restore_order_inventory) — 돈/포인트/취소 RPC와 분리. 실패해도 주문 처리는 유지(비차단).
      try {
        const { error: invError } = await (supabase as any).rpc("restore_order_inventory", {
          p_order_ids: rowIds,
          p_mode: isCancel ? "restore" : "deduct",
        });
        if (invError) {
          showAdminToast(
            `재고 자동${isCancel ? "복구" : "재차감"} 실패 — 주문은 처리됨. 재고를 직접 확인하세요.\n${invError.message}`,
            "warning",
          );
        }
      } catch (invErr: any) {
        showAdminToast(
          `재고 처리 중 오류(주문은 처리됨): ${invErr?.message || invErr}`,
          "warning",
        );
      }

      // [2026-08-20 근본수정] 입금확인된 주문을 취소하면 입금 연결도 함께 푼다.
      //   기존엔 취소해도 입금이 그 주문에 묶인 채 남아서, 손님이 옵션을 고쳐 다시 낸 새 주문서에
      //   붙을 입금이 없어 자동입금확인이 되지 않았다(사장님이 [취소주문 입금기록 정리]를 따로 눌러야만 풀림).
      //   ⚠️ 새 돈 로직을 만들지 않는다 — 이미 쓰던 /api/admin-v2/payment-confirm-cancel 을 그대로 호출한다.
      //      그 API는 취소 상태를 유지한 채(keepCanceled) orders.deposit_confirmed_at 만 지우고
      //      연결된 deposits 를 match_status='미확인' + 연결 컬럼 null 로 되돌린다.
      //   실패해도 취소 자체는 유지 — 위 재고 복구와 동일한 비차단 패턴.
      if (shouldReleaseDeposit) {
        try {
          const response = await fetch("/api/admin-v2/payment-confirm-cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderIds: rowIds,
              orderGroupId: order.groupId || "",
              orderLookupCode: order.orderNo || "",
            }),
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.ok) {
            showAdminToast(
              "입금 연결 해제 실패 — 주문은 취소됐습니다.\n[취소주문 입금기록 정리]를 눌러 직접 풀어주세요." +
                (result?.message ? `\n${result.message}` : ""),
              "warning",
            );
          } else {
            showAdminToast("입금 연결도 풀었습니다. 입금내역이 '미확인'으로 돌아갔습니다.", "success");
          }
        } catch (payErr: any) {
          showAdminToast(
            `입금 연결 해제 중 오류(주문은 취소됨): ${payErr?.message || payErr}\n[취소주문 입금기록 정리]를 눌러주세요.`,
            "warning",
          );
        }
      }

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
