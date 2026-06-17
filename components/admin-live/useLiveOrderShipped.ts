"use client";

// 목적: 라이브 주문서에서 선택한 주문을 "출고완료" 처리 / "출고완료 해제" (일괄)
// 안전 원칙:
//   - 주문상태(admin_order_status_v2 / order_manage_status)와 출고시간(shipped_at)만 변경
//   - 출고완료 처리 시 직전 입금상태를 shipped_prev_status에 보관 → 입금 배지 보존 + 정확한 해제
//   - 출고시간(shipped_at)은 최초 1회만 기록(기존 값 보존), 해제 시 제거
//   - 금액/상품/배송비/입금내역(deposit_confirmed_at)/포인트/정산/자동매칭 로직은 일절 변경하지 않음
//   - "출고완료"·"출고대기"는 모두 결제완료(PAID_STATUS_VALUES) 상태라 입금판정이 깨지지 않음
//   ⚠️ shipped_prev_status 컬럼 필요: supabase/sql/orders_shipped_prev_status.sql 실행해야 보존 동작

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrder } from "./types";

type SavingAction = "" | "ship" | "unship";

const SHIPPED_STATUS = "출고완료";
const READY_STATUS = "출고대기";
const PAID_STATUSES_FOR_SHIP: LiveOrder["paymentStatus"][] = [
  "paid",
  "auto_paid",
  "manual_paid",
  "card_paid",
];

function collectRowIds(orders: LiveOrder[]) {
  const ids: number[] = [];
  orders.forEach((order) => {
    const fromRowIds = Array.isArray(order.rowIds) ? order.rowIds : [];
    const fromItems = Array.isArray(order.items)
      ? order.items.map((item) => Number(item.id))
      : [];
    [...fromRowIds, ...fromItems].forEach((id) => {
      const numeric = Number(id);
      if (Number.isFinite(numeric) && numeric > 0) ids.push(numeric);
    });
  });
  return Array.from(new Set(ids));
}

type UseLiveOrderShippedArgs = {
  onAfterStatusChange?: () => void | Promise<void>;
};

export function useLiveOrderShipped({ onAfterStatusChange }: UseLiveOrderShippedArgs) {
  const [savingAction, setSavingAction] = useState<SavingAction>("");

  // 출고완료 처리: 선택 주문 중 "결제완료 + 미취소"만 대상
  const markShipped = async (orders: LiveOrder[]): Promise<boolean> => {
    const target = orders.filter(
      (order) =>
        order.paymentStatus !== "canceled" &&
        PAID_STATUSES_FOR_SHIP.includes(order.paymentStatus)
    );
    const skipped = orders.length - target.length;

    if (target.length === 0) {
      showAdminToast("출고완료로 바꿀 결제완료 주문이 없습니다.\n(미결제·취소 주문은 제외됩니다)", "warning");
      return false;
    }

    const rowIds = collectRowIds(target);
    if (rowIds.length === 0) {
      showAdminToast("출고완료 처리할 주문 ID가 없습니다.", "warning");
      return false;
    }

    const confirmMessage = [
      `선택한 결제완료 주문 ${target.length}건을 출고완료로 변경할까요?`,
      skipped > 0 ? `(미결제·취소 ${skipped}건은 자동 제외됩니다)` : "",
      "",
      "주문금액/상품/배송비/입금내역/포인트는 변경하지 않습니다.",
      "주문상태만 출고완료로 바꾸고 출고시간을 기록합니다.",
      "입금 배지는 그대로 유지되고, 고객 주문조회에 '출고완료'로 표시됩니다.",
    ]
      .filter(Boolean)
      .join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return false;

    setSavingAction("ship");
    try {
      // 현재 상태 조회 (직전 입금상태 보관 + 이미 출고완료 행 제외)
      const { data: rows, error: fetchError } = await supabase
        .from("orders")
        .select("id, admin_order_status_v2, order_manage_status, shipped_prev_status")
        .in("id", rowIds);

      if (fetchError) {
        showAdminToast("출고완료 처리 실패(조회)\n\n" + fetchError.message, "error");
        return false;
      }

      // 직전상태 보관이 필요한 행 그룹(아직 출고완료 아님 + 보관값 없음) / 상태만 바꿀 행
      const prevSaveGroups = new Map<string, number[]>();
      const statusOnlyIds: number[] = [];
      (rows || []).forEach((row: any) => {
        const current = String(row.admin_order_status_v2 || row.order_manage_status || "").trim();
        if (current === SHIPPED_STATUS) return; // 이미 출고완료 → 변경 불필요
        const savedPrev = String(row.shipped_prev_status || "").trim();
        if (savedPrev) {
          statusOnlyIds.push(Number(row.id)); // 보관값 보존(덮어쓰지 않음)
        } else {
          if (!prevSaveGroups.has(current)) prevSaveGroups.set(current, []);
          prevSaveGroups.get(current)!.push(Number(row.id));
        }
      });

      // 1) 직전상태 보관 + 출고완료
      for (const [prev, ids] of prevSaveGroups) {
        if (ids.length === 0) continue;
        const { error } = await supabase
          .from("orders")
          .update({
            admin_order_status_v2: SHIPPED_STATUS,
            order_manage_status: SHIPPED_STATUS,
            shipped_prev_status: prev || null,
          })
          .in("id", ids);
        if (error) {
          showAdminToast("출고완료 처리 실패\n\n" + error.message, "error");
          return false;
        }
      }

      // 2) 보관값이 이미 있는 행: 상태만 출고완료
      if (statusOnlyIds.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update({
            admin_order_status_v2: SHIPPED_STATUS,
            order_manage_status: SHIPPED_STATUS,
          })
          .in("id", statusOnlyIds);
        if (error) {
          showAdminToast("출고완료 처리 실패\n\n" + error.message, "error");
          return false;
        }
      }

      // 3) 출고시간: 아직 비어있는 행에만 기록(최초 출고시간 보존)
      const { error: timeError } = await supabase
        .from("orders")
        .update({ shipped_at: new Date().toISOString() })
        .in("id", rowIds)
        .is("shipped_at", null);

      if (timeError) {
        showAdminToast("출고완료로 변경됐지만 출고시간 기록은 실패했습니다.\n\n" + timeError.message, "warning");
        await onAfterStatusChange?.();
        return true;
      }

      showAdminToast(`출고완료 ${target.length}건 처리됐습니다.`, "success");
      await onAfterStatusChange?.();
      return true;
    } finally {
      setSavingAction("");
    }
  };

  // 출고완료 해제: 선택 주문 중 현재 "출고완료"인 행만 직전 상태로 복원(없으면 출고대기), 출고시간 제거
  const unmarkShipped = async (orders: LiveOrder[]): Promise<boolean> => {
    const target = orders.filter((order) => order.paymentStatus !== "canceled");
    const rowIds = collectRowIds(target);

    if (rowIds.length === 0) {
      showAdminToast("선택한 주문이 없습니다.", "warning");
      return false;
    }

    const confirmMessage = [
      "선택한 주문 중 '출고완료' 상태인 건을 해제할까요?",
      "",
      "출고완료 처리 직전 상태(입금확인 등)로 되돌리고 출고시간을 지웁니다.",
      "(직전 상태 기록이 없으면 '출고대기'로 되돌립니다)",
      "출고완료가 아닌 주문은 변경하지 않습니다.",
      "금액/입금/포인트/정산은 변경하지 않습니다.",
    ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return false;

    setSavingAction("unship");
    try {
      const { data: rows, error: fetchError } = await supabase
        .from("orders")
        .select("id, admin_order_status_v2, shipped_prev_status")
        .in("id", rowIds);

      if (fetchError) {
        showAdminToast("출고완료 해제 실패(조회)\n\n" + fetchError.message, "error");
        return false;
      }

      // 현재 출고완료인 행만 복원 대상. 복원 상태값별로 그룹.
      const restoreGroups = new Map<string, number[]>();
      (rows || []).forEach((row: any) => {
        if (String(row.admin_order_status_v2 || "").trim() !== SHIPPED_STATUS) return;
        const restoreTo = String(row.shipped_prev_status || "").trim() || READY_STATUS;
        if (!restoreGroups.has(restoreTo)) restoreGroups.set(restoreTo, []);
        restoreGroups.get(restoreTo)!.push(Number(row.id));
      });

      if (restoreGroups.size === 0) {
        showAdminToast("선택한 주문 중 출고완료 상태가 없습니다.", "warning");
        return false;
      }

      for (const [restoreTo, ids] of restoreGroups) {
        if (ids.length === 0) continue;
        const { error } = await supabase
          .from("orders")
          .update({
            admin_order_status_v2: restoreTo,
            order_manage_status: restoreTo,
            shipped_at: null,
            shipped_prev_status: null,
          })
          .in("id", ids)
          .eq("admin_order_status_v2", SHIPPED_STATUS); // 현재 출고완료 행만 가드

        if (error) {
          showAdminToast("출고완료 해제 실패\n\n" + error.message, "error");
          return false;
        }
      }

      showAdminToast("출고완료를 해제했습니다. (직전 상태로 복원)", "success");
      await onAfterStatusChange?.();
      return true;
    } finally {
      setSavingAction("");
    }
  };

  return {
    savingAction,
    markShipped,
    unmarkShipped,
  };
}
