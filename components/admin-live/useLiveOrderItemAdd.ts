"use client";

// 목적: 관리자 주문상세에서 기존 주문에 "직접입력 상품"을 1줄 추가 (#3 1단계).
// 설계(추정 금지, 제출 RPC/route 공식과 동일):
//   - flat orders 테이블 → 같은 order_group_id로 새 행 INSERT (그룹 공유필드는 첫 행에서 복사).
//   - 직접입력 = product_id 없음 → 재고 차감 없음(기존 자동차감 RPC와 동일 정책).
//   - 금액: 상품금액 = 단가×수량. 카드결제면 vat = round(상품금액 × customer_card_extra_rate_applied/100)
//           (submit route 130~137과 동일 공식, 그 주문의 수수료율 그대로 적용). total = 상품금액 + vat.
//   - 택배비는 기존 행에 이미 있으므로 추가 행은 shipping_fee 0 (중복 방지, submit route 141~142와 동일).
//   - 상태(admin_order_status_v2/order_manage_status 등)는 첫 행 그대로 복사 → 그룹 결제/배송 상태 일관.
//   - 입금내역(deposit_confirmed_at)/포인트차감/정산/자동매칭 로직은 건드리지 않음.
//     (입금확인된 주문에 추가하면 총액↑ → 운영자가 "입금확인 취소"로 재매칭 — 합의된 정책)

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrder } from "./types";

export type LiveOrderItemAddForm = {
  productName: string;
  color: string;
  size: string;
  qty: string;
  unitPrice: string;
};

export type LiveOrderItemAddResult = {
  rowId: number;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number;
  productTotal: number; // 상품금액(단가×수량, vat 제외)
};

// 등록상품(재고차감) 추가 입력 — 옵션(색상/사이즈)은 상품 variant에서 그대로 전달(재고 키 일치 보장)
export type LiveOrderRegisteredAddInput = {
  productId: number;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number;
};

// 첫 행에서 그대로 복사할 "그룹 공유" 컬럼(주문자/받는사람/주소/방송/결제수단/상태/제외플래그 등)
const SHARED_KEYS = [
  "created_at", // 원 주문 시각 복사 → 추가해도 주문일이 '오늘'로 튀지 않고 같은 그룹/날짜 유지
  "order_group_id",
  "order_lookup_code",
  "broadcast_id",
  "broadcast_name",
  "broadcast_public_title",
  "broadcast_admin_subtitle",
  "youtube_nickname",
  "customer_name",
  "customer_phone",
  "phone",
  "recipient_name",
  "recipient_phone",
  "zipcode",
  "address",
  "detail_address",
  "request_memo",
  "payment_method",
  "customer_card_extra_rate_applied",
  "actual_card_fee_rate_applied",
  "order_status",
  "admin_status",
  "order_manage_status",
  "admin_order_status_v2",
  "shipping_status",
  "is_test_order",
  "test_order_reason",
  "operator_test_phone",
  "exclude_from_settlement",
  "exclude_from_payment_match",
  "exclude_from_shipping",
  "exclude_from_picking",
  "customer_id",
];

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

export function createInitialLiveOrderItemAddForm(): LiveOrderItemAddForm {
  return { productName: "", color: "", size: "", qty: "1", unitPrice: "" };
}

export function useLiveOrderItemAdd(onAfter?: (result: LiveOrderItemAddResult) => void | Promise<void>) {
  const [adding, setAdding] = useState(false);

  const addDirectItem = async (order: LiveOrder, form: LiveOrderItemAddForm): Promise<LiveOrderItemAddResult | false> => {
    const firstRowId = Array.isArray(order.rowIds) && order.rowIds.length > 0
      ? Number(order.rowIds[0])
      : Number(order.items?.[0]?.id);

    if (!Number.isFinite(firstRowId) || firstRowId <= 0) {
      showAdminToast("기준 주문 행을 찾을 수 없습니다.", "warning");
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
      `이 주문에 직접입력 상품을 추가할까요?`,
      "",
      `${productName}${color || size ? ` (${[color, size].filter(Boolean).join(" / ")})` : ""} · ${qty}개 · ${(unitPrice * qty).toLocaleString("ko-KR")}원`,
      "",
      "직접입력 상품이라 재고는 차감하지 않습니다.",
      "주문 총 결제금액이 추가 금액만큼 늘어납니다.",
      "이미 입금확인된 주문이면 금액이 바뀌니, 필요 시 '입금확인 취소'로 다시 매칭하세요.",
    ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return false;

    setAdding(true);
    try {
      // 기준(첫) 행 조회 — 그룹 공유필드 복사용
      const { data: firstRow, error: loadError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", firstRowId)
        .single();

      if (loadError || !firstRow) {
        showAdminToast("기준 주문 정보를 불러오지 못했습니다.\n\n" + (loadError?.message || ""), "error");
        return false;
      }

      const productTotal = unitPrice * qty;
      const isCard = String((firstRow as any).payment_method || "") === "카드결제";
      const cardRate = Number((firstRow as any).customer_card_extra_rate_applied || 0) || 0;
      const actualCardRate = Number((firstRow as any).actual_card_fee_rate_applied || 0) || 0;
      const cardExtra = isCard ? Math.round(productTotal * (cardRate / 100)) : 0;
      const actualCardFee = isCard ? Math.round(productTotal * (actualCardRate / 100)) : 0;
      const nextTotal = productTotal + cardExtra;

      // 그룹 공유필드 복사(실제 존재하는 컬럼만 = select * 결과 키)
      const payload: Record<string, unknown> = {};
      SHARED_KEYS.forEach((key) => {
        if (key in (firstRow as any)) payload[key] = (firstRow as any)[key];
      });

      // 추가 항목(직접입력) 값
      payload.product_id = null;
      payload.product_name = productName;
      payload.color = color || null;
      payload.size = size || null;
      payload.qty = qty;
      payload.product_price = unitPrice;
      payload.adjusted_product_price = productTotal;
      payload.shipping_fee = 0;
      payload.adjusted_shipping_fee = 0;
      payload.vat_amount = cardExtra;
      payload.total_price = nextTotal;
      payload.adjusted_total_price = nextTotal;
      payload.final_amount = nextTotal;
      payload.memo = [productName, color, size, `x${qty}`].filter(Boolean).join(" ");

      // 선택 컬럼: 첫 행에 존재할 때만 세팅(스키마 차이 안전)
      if ("actual_card_fee_amount" in (firstRow as any)) payload.actual_card_fee_amount = actualCardFee;
      if ("point_used_amount" in (firstRow as any)) payload.point_used_amount = 0;
      if ("point_original_amount" in (firstRow as any)) payload.point_original_amount = nextTotal;

      const { data: inserted, error: insertError } = await supabase
        .from("orders")
        .insert(payload)
        .select("id")
        .single();

      if (insertError || !inserted) {
        showAdminToast("상품 추가 실패\n\n" + (insertError?.message || "알 수 없는 오류"), "error");
        return false;
      }

      const result: LiveOrderItemAddResult = {
        rowId: Number((inserted as any).id),
        productName,
        color,
        size,
        qty,
        unitPrice,
        productTotal,
      };

      showAdminToast("직접입력 상품을 추가했습니다.", "success");
      await onAfter?.(result);
      return result;
    } finally {
      setAdding(false);
    }
  };

  // 등록상품 추가 — admin_add_order_item RPC 호출(재고 차감/카드 vat/그룹필드 복사는 RPC가 처리).
  //   색상/사이즈는 선택한 variant 객체에서 그대로 전달 → 재고 키 불일치 방지.
  //   재고 부족·옵션 없음 시 RPC가 예외를 던지므로 추가가 막힘(돈/재고 보호).
  const addRegisteredItem = async (
    order: LiveOrder,
    input: LiveOrderRegisteredAddInput
  ): Promise<LiveOrderItemAddResult | false> => {
    const firstRowId = Array.isArray(order.rowIds) && order.rowIds.length > 0
      ? Number(order.rowIds[0])
      : Number(order.items?.[0]?.id);

    if (!Number.isFinite(firstRowId) || firstRowId <= 0) {
      showAdminToast("기준 주문 행을 찾을 수 없습니다.", "warning");
      return false;
    }

    const productId = Number(input.productId);
    const productName = clean(input.productName);
    const color = clean(input.color);
    const size = clean(input.size);
    const qty = toNumber(input.qty);
    const unitPrice = toNumber(input.unitPrice);

    if (!Number.isFinite(productId) || productId <= 0) {
      showAdminToast("상품을 선택해주세요.", "warning");
      return false;
    }
    if (!productName) {
      showAdminToast("상품명이 없습니다.", "warning");
      return false;
    }
    if (!qty || qty <= 0) {
      showAdminToast("수량은 1개 이상이어야 합니다.", "warning");
      return false;
    }
    if (unitPrice <= 0) {
      showAdminToast("단가는 1원 이상이어야 합니다.", "warning");
      return false;
    }

    const optionLabel = [color, size].filter(Boolean).join(" / ");
    const confirmMessage = [
      `이 주문에 등록상품을 추가할까요?`,
      "",
      `${productName}${optionLabel ? ` (${optionLabel})` : ""} · ${qty}개 · ${(unitPrice * qty).toLocaleString("ko-KR")}원`,
      "",
      "등록상품이라 재고가 그만큼 차감됩니다(재고 부족 시 추가되지 않습니다).",
      "주문 총 결제금액이 추가 금액만큼 늘어납니다.",
      "이미 입금확인된 주문이면 금액이 바뀌니, 필요 시 '입금확인 취소'로 다시 매칭하세요.",
    ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return false;

    setAdding(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_add_order_item", {
        p_ref_order_id: firstRowId,
        p_product_id: productId,
        p_product_name: productName,
        p_color: color,
        p_size: size,
        p_qty: qty,
        p_unit_price: unitPrice,
        p_admin_memo: "admin-live 주문상세 등록상품 추가",
      });
      const res = (data || {}) as any;

      if (error || res?.ok !== true) {
        showAdminToast("등록상품 추가 실패\n\n" + (error?.message || res?.message || "알 수 없는 오류"), "error");
        return false;
      }

      const newId = Number(res.new_order_id);
      const productTotal = Number(res.product_total) || unitPrice * qty;

      const result: LiveOrderItemAddResult = {
        rowId: newId,
        productName,
        color,
        size,
        qty,
        unitPrice,
        productTotal,
      };

      showAdminToast("등록상품을 추가하고 재고를 차감했습니다.", "success");
      await onAfter?.(result);
      return result;
    } finally {
      setAdding(false);
    }
  };

  return { adding, addDirectItem, addRegisteredItem };
}
