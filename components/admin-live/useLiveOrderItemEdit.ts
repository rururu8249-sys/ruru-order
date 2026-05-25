"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrderItem } from "./types";

export type LiveOrderItemEditForm = {
  productName: string;
  color: string;
  size: string;
  qty: string;
  unitPrice: string;
};

export type LiveOrderItemEditSaveResult = {
  rowId: number;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number;
  productTotal: number;
  nextTotal: number;
  productChanged: boolean;
  amountChanged: boolean;
};

type SaveArgs = {
  item: LiveOrderItem;
  form: LiveOrderItemEditForm;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOnly(value: unknown) {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function toNumber(value: unknown) {
  const parsed = Number(numberOnly(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHistory(value: unknown) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildMemo(productName: string, color: string, size: string, qty: number) {
  return [productName, color, size, `x${qty}`].filter(Boolean).join(" ");
}

function valuesChanged(a: unknown, b: unknown) {
  return clean(a) !== clean(b);
}

export function createInitialLiveOrderItemEditForm(item: LiveOrderItem): LiveOrderItemEditForm {
  return {
    productName: clean(item.productName === "상품명 없음" ? "" : item.productName),
    color: clean(item.color || ""),
    size: clean(item.size || ""),
    qty: String(Number(item.qty || 1) || 1),
    unitPrice: String(Number(item.unitPrice || item.amount || 0) || 0),
  };
}

export function useLiveOrderItemEdit(onAfterSave?: (result: LiveOrderItemEditSaveResult) => void | Promise<void>) {
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const saveItem = async ({ item, form }: SaveArgs) => {
    const rowId = Number(item.id);

    if (!Number.isFinite(rowId) || rowId <= 0) {
      showAdminToast("수정할 주문 ID가 없습니다.", "warning");
      return false;
    }

    const productName = clean(form.productName);
    const color = clean(form.color);
    const size = clean(form.size);
    const qty = toNumber(form.qty);
    const unitPrice = toNumber(form.unitPrice);

    if (!productName) {
      showAdminToast("상품명을 입력해주세요.", "warning");
      return false;
    }

    if (!qty || qty <= 0) {
      showAdminToast("수량은 1개 이상이어야 합니다.", "warning");
      return false;
    }

    if (unitPrice <= 0) {
      showAdminToast("금액은 1원 이상이어야 합니다.", "warning");
      return false;
    }

    const confirmMessage = [
      "상품/옵션/수량/금액을 수정할까요?",
      "",
      "변경 전 값은 item_change_history에 누적됩니다.",
      "상품금액과 총 결제예정금액은 수정값 기준으로 다시 계산됩니다.",
      "배송비/카드수수료/입금확인 상태는 변경하지 않습니다.",
    ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return false;

    setSavingItemId(String(item.id));

    try {
      const { data: current, error: loadError } = await supabase
        .from("orders")
        .select(
          "id, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, adjusted_shipping_fee, vat_amount, total_price, adjusted_total_price, final_amount, memo, item_change_history"
        )
        .eq("id", rowId)
        .single();

      if (loadError || !current) {
        showAdminToast("현재 주문값을 불러오지 못했습니다.\n\n" + (loadError?.message || ""), "error");
        return false;
      }

      const shippingFee = Number(current.adjusted_shipping_fee ?? current.shipping_fee ?? 0) || 0;
      const cardExtra = Number(current.vat_amount ?? 0) || 0;
      const productTotal = unitPrice * qty;
      const nextTotal = productTotal + shippingFee + cardExtra;

      const productChanged =
        valuesChanged(current.product_name, productName) ||
        valuesChanged(current.color, color) ||
        valuesChanged(current.size, size) ||
        Number(current.qty || 0) !== qty;

      const amountChanged =
        Number(current.product_price || 0) !== unitPrice ||
        Number(current.adjusted_product_price || 0) !== productTotal ||
        Number(current.adjusted_total_price || current.total_price || 0) !== nextTotal;

      if (!productChanged && !amountChanged) {
        showAdminToast("변경된 내용이 없습니다.", "info");
        return false;
      }

      const previousHistory = normalizeHistory(current.item_change_history);

      const historyEntry = {
        changed_at: new Date().toISOString(),
        source: "admin-live-order-detail",
        row_id: rowId,
        product_changed: productChanged,
        amount_changed: amountChanged,
        before: {
          product_name: current.product_name ?? "",
          color: current.color ?? "",
          size: current.size ?? "",
          qty: Number(current.qty || 0),
          product_price: Number(current.product_price || 0),
          adjusted_product_price: Number(current.adjusted_product_price || 0),
          adjusted_total_price: Number(current.adjusted_total_price || current.total_price || 0),
          final_amount: current.final_amount ?? null,
        },
        after: {
          product_name: productName,
          color,
          size,
          qty,
          product_price: unitPrice,
          adjusted_product_price: productTotal,
          adjusted_total_price: nextTotal,
          final_amount: current.final_amount !== null && current.final_amount !== undefined ? nextTotal : null,
        },
      };

      const patch: Record<string, unknown> = {
        product_name: productName,
        color,
        size,
        qty,
        product_price: unitPrice,
        adjusted_product_price: productTotal,
        adjusted_total_price: nextTotal,
        total_price: nextTotal,
        memo: buildMemo(productName, color, size, qty),
        item_change_history: [...previousHistory, historyEntry],
      };

      if (current.final_amount !== null && current.final_amount !== undefined) {
        patch.final_amount = nextTotal;
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", rowId);

      if (updateError) {
        showAdminToast("상품/금액 수정 실패\n\n" + updateError.message, "error");
        return false;
      }

      const result: LiveOrderItemEditSaveResult = {
        rowId,
        productName,
        color,
        size,
        qty,
        unitPrice,
        productTotal,
        nextTotal,
        productChanged,
        amountChanged,
      };

      showAdminToast("상품/옵션/수량/금액 수정이 완료됐습니다.", "success");
      await onAfterSave?.(result);
      return result;
    } finally {
      setSavingItemId(null);
    }
  };

  return {
    savingItemId,
    saveItem,
  };
}
