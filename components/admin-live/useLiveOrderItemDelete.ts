"use client";

// 목적: 관리자 주문상세에서 주문내역의 상품 1줄 삭제 (#3 2단계).
//   admin_delete_order_item RPC 호출 — 등록상품은 재고 복구 후 행 삭제, 직접입력은 그냥 행 삭제.
//   가드(RPC측): 그룹 마지막 상품·포인트 사용 항목은 삭제 막고 주문취소로 유도.
//   입금내역/정산 무변경. 금액↓ 시 운영자가 '입금확인 취소'로 재매칭(합의 정책).

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function useLiveOrderItemDelete(onAfter?: () => void | Promise<void>) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteItem = async (rowId: number, label: string): Promise<boolean> => {
    if (!Number.isFinite(rowId) || rowId <= 0) {
      showAdminToast("삭제할 항목 ID가 없습니다.", "warning");
      return false;
    }

    const ok = await showAdminConfirm(
      [
        `'${label}' 상품을 이 주문에서 삭제할까요?`,
        "",
        "등록상품이면 재고가 자동 복구됩니다.",
        "주문 총 결제금액이 그만큼 줄어듭니다.",
        "이미 입금확인된 주문이면 필요 시 '입금확인 취소'로 다시 매칭하세요.",
      ].join("\n")
    );
    if (!ok) return false;

    setDeletingId(String(rowId));
    try {
      const { data, error } = await (supabase as any).rpc("admin_delete_order_item", {
        p_order_id: rowId,
        p_admin_memo: "admin-live 주문상세 상품삭제",
      });
      const res = (data || {}) as any;

      if (error || res?.ok !== true) {
        showAdminToast("상품 삭제 실패\n\n" + (error?.message || res?.message || "알 수 없는 오류"), "error");
        return false;
      }

      showAdminToast(res.restored ? "상품을 삭제하고 재고를 복구했습니다." : "상품을 삭제했습니다.", "success");
      await onAfter?.();
      return true;
    } finally {
      setDeletingId(null);
    }
  };

  return { deletingId, deleteItem };
}
