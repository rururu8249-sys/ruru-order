"use client";

// 목적: 관리자 주문상세에서 주문내역의 상품 1줄 삭제 (#3 2단계).
//   admin_delete_order_item RPC 호출 — 등록상품은 재고 복구 후 행 삭제, 직접입력은 그냥 행 삭제.
//   가드(RPC측): 그룹 마지막 상품·포인트 사용 항목은 삭제 막고 주문취소로 유도.
//   입금내역/정산 무변경. 금액↓ 시 운영자가 '입금확인 취소'로 재매칭(합의 정책).

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** [2026-11-01] 확인창 없이 RPC 만 부른다 — 「일부 취소 · 카드 다시 결제」 창이 자기 확인창을 쓰려고 뺀 것. 부르는 RPC·인자는 아래 훅과 같다. */
export async function deleteOrderItemRow(
  rowId: number,
  memo: string,
  record?: { kind?: "card_repay" | "delete"; cardTotalBefore?: number }
): Promise<{ ok: boolean; message: string; restored: boolean; pointMoved: number }> {
  // [2026-11-07] 지우기 «직전»에 그 줄 사본을 남긴다(주문상세에 줄 그어 보이게). 사본을 못 남기면 지우지 않는다.
  let recordId: number | null = null;
  try {
    const r = await fetch("/api/admin-live/order-removed-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId, kind: record?.kind || "delete", cardTotalBefore: record?.cardTotalBefore ?? null, memo }),
    });
    const p = await r.json().catch(() => null);
    if (!r.ok || p?.ok !== true) {
      return { ok: false, message: `빼기 전에 기록을 남기지 못해 멈췄어요: ${String(p?.message || r.status)}`, restored: false, pointMoved: 0 };
    }
    recordId = Number(p.id) || null;
  } catch (e) {
    return { ok: false, message: `빼기 전에 기록을 남기지 못해 멈췄어요: ${String((e as Error)?.message || e)}`, restored: false, pointMoved: 0 };
  }
  const { data, error } = await (supabase as any).rpc("admin_delete_order_item", {
    p_order_id: rowId,
    p_admin_memo: memo,
  });
  const res = (data || {}) as any;
  if (error || res?.ok !== true) {
    // 줄이 안 지워졌으니 방금 남긴 사본은 지운다(실패해도 화면은 남은 줄과 겹치는 사본을 안 보여 줌)
    if (recordId) void fetch(`/api/admin-live/order-removed-items?id=${recordId}`, { method: "DELETE" }).catch(() => {});
    return { ok: false, message: String(error?.message || res?.message || "알 수 없는 오류"), restored: false, pointMoved: 0 };
  }
  return { ok: true, message: "", restored: Boolean(res.restored), pointMoved: Number(res.point_moved || 0) };
}

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
        "이 상품에 포인트가 쓰였으면 남는 상품으로 자동으로 옮겨집니다.",
        "주문 총 결제금액이 그만큼 줄어듭니다.",
        "이미 입금확인된 주문이면 필요 시 '입금확인 취소'로 다시 매칭하세요.",
      ].join("\n")
    );
    if (!ok) return false;

    setDeletingId(String(rowId));
    try {
      const res = await deleteOrderItemRow(rowId, "admin-live 주문상세 상품삭제");

      if (!res.ok) {
        showAdminToast("상품 삭제 실패\n\n" + res.message, "error");
        return false;
      }

      const movedPoint = res.pointMoved;
      const parts = ["상품을 삭제했습니다."];
      if (res.restored) parts.push("재고 복구 완료.");
      if (movedPoint > 0) parts.push(`포인트 ${movedPoint.toLocaleString()}원은 남은 상품으로 옮겼습니다.`);
      showAdminToast(parts.join(" "), "success");
      await onAfter?.();
      return true;
    } finally {
      setDeletingId(null);
    }
  };

  return { deletingId, deleteItem };
}
