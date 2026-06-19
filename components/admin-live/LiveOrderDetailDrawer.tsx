"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrder, LiveOrderItem } from "./types";
import { isLiveOrderCanceled, useLiveOrderCancelRestore } from "./useLiveOrderCancelRestore";
import LiveOrderItemEditCard from "./LiveOrderItemEditCard";
import type { LiveOrderItemEditSaveResult } from "./useLiveOrderItemEdit";
import { useLiveOrderItemAdd, createInitialLiveOrderItemAddForm, type LiveOrderItemAddForm, type LiveOrderRegisteredAddInput } from "./useLiveOrderItemAdd";
import { useLiveOrderItemDelete } from "./useLiveOrderItemDelete";
import LiveOrderRegisteredProductPicker from "./LiveOrderRegisteredProductPicker";
import LiveOrderDangerActionGuide from "./LiveOrderDangerActionGuide";

type Props = {
  order: LiveOrder;
  onOpenManualMatch?: (order: LiveOrder) => void;
  onClose?: () => void;
  onAfterStatusChange?: () => void | Promise<void>;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getItemName(item: LiveOrderItem) {
  return clean(item.productName) || "상품명 없음";
}

function getItemOption(item: LiveOrderItem) {
  return clean(item.optionText) || "옵션 없음";
}

function getCustomerAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    address?: string | null;
    detailAddress?: string | null;
    detail_address?: string | null;
    customerAddress?: string | null;
    shippingAddress?: string | null;
  };

  const baseAddress = clean(row.address) || clean(row.customerAddress) || clean(row.shippingAddress);
  const detailAddress = clean(row.detailAddress) || clean(row.detail_address);

  return [baseAddress, detailAddress].filter(Boolean).join(" ");
}

function getCustomerDeliveryMemo(order: LiveOrder) {
  const row = order as LiveOrder & {
    deliveryMemo?: string | null;
    requestMemo?: string | null;
    request_memo?: string | null;
    shippingMemo?: string | null;
    shipping_memo?: string | null;
    specialNote?: string | null;
    special_note?: string | null;
  };

  return (
    clean(row.deliveryMemo) ||
    clean(row.requestMemo) ||
    clean(row.request_memo) ||
    clean(row.shippingMemo) ||
    clean(row.shipping_memo) ||
    clean(row.specialNote) ||
    clean(row.special_note)
  );
}

function formatFullDateTime(value: string | null | undefined, fallback?: string | null) {
  if (!value) return fallback || "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback || value || "-";

  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd} ${weekdays[date.getDay()]} ${hh}:${mi}`;
}

function getPaymentStatusLabel(order: LiveOrder) {
  if (order.paymentStatus === "canceled") return "주문서취소";
  if (order.paymentStatus === "manual_match_needed") return "매칭필요";
  if (order.paymentStatus === "manual_paid") return "수동입금확인";
  if (order.paymentStatus === "auto_paid") return "자동입금확인";
  if (order.paymentStatus === "card_paid") return "카드결제완료";
  if (order.paymentStatus === "card_unpaid") return "카드미결제";
  if (order.paymentStatus === "unpaid") return "입금대기";
  return "입금확인";
}

function getPaymentStatusClass(order: LiveOrder) {
  if (order.paymentStatus === "canceled") return "border-danger-tx bg-danger-bg text-danger-tx";
  if (order.paymentStatus === "manual_match_needed") return "border-warn-tx bg-warn-bg text-warn-tx";
  if (order.paymentStatus === "manual_paid") return "border-ok-tx bg-ok-bg text-ok-tx";
  if (["auto_paid", "paid"].includes(order.paymentStatus)) {
    return "border-ok-tx bg-ok-bg text-ok-tx";
  }
  if (order.paymentStatus === "card_paid") return "border-info-tx bg-info-bg text-info-tx";
  if (["unpaid", "card_unpaid"].includes(order.paymentStatus)) return "border-danger-tx bg-danger-bg text-danger-tx";
  return "border-line bg-surface-2 text-ink-soft";
}

export default function LiveOrderDetailDrawer({ order, onOpenManualMatch, onClose, onAfterStatusChange }: Props) {
  const [cardStatusAction, setCardStatusAction] = useState<"" | "card-paid" | "card-unpaid">("");
  const [paymentCancelAction, setPaymentCancelAction] = useState(false);
  const [paymentCancelError, setPaymentCancelError] = useState("");
  const [manualConfirmAction, setManualConfirmAction] = useState(false);

  // 고객/배송 정보 인라인 편집 (돈 무관 필드만: 이름/전화/우편·주소·상세주소/배송메모)
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editZipcode, setEditZipcode] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editDetailAddress, setEditDetailAddress] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const [localOrder, setLocalOrder] = useState(order);
  const [refreshingDetail, setRefreshingDetail] = useState(false);

  useEffect(() => {
    setLocalOrder(order);
  }, [order]);

  const handleItemSaved = async (result: LiveOrderItemEditSaveResult) => {
    setRefreshingDetail(true);

    try {
      setLocalOrder((previousOrder) => {
        const previousItems = Array.isArray(previousOrder.items) ? previousOrder.items : [];
        const nextItems = previousItems.map((item) => {
          if (String(item.id) !== String(result.rowId)) return item;

          return {
            ...item,
            productName: result.productName,
            color: result.color,
            size: result.size,
            optionText: [result.color, result.size].filter(Boolean).join(" / ") || "옵션 없음",
            qty: result.qty,
            unitPrice: result.unitPrice,
            amount: result.productTotal,
            productEditCount: Number(item.productEditCount || 0) + (result.productChanged ? 1 : 0),
            amountEditCount: Number(item.amountEditCount || 0) + (result.amountChanged ? 1 : 0),
          };
        });

        const nextTotalQty = nextItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const nextProductAmount = nextItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const nextTotalAmount = nextProductAmount + Number(previousOrder.shippingFee || 0);

        return {
          ...previousOrder,
          items: nextItems,
          totalQty: nextTotalQty,
          totalAmount: nextTotalAmount,
          itemSummary: nextItems
            .map((item) => [item.productName, item.color, item.size].filter(Boolean).join(" / "))
            .filter(Boolean)
            .join(" | "),
        };
      });

      await onAfterStatusChange?.();
    } finally {
      setRefreshingDetail(false);
    }
  };

  // 직접입력 상품 추가 (#3 1단계) — 재고 무관, 같은 그룹에 새 행 INSERT
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addForm, setAddForm] = useState<LiveOrderItemAddForm>(createInitialLiveOrderItemAddForm());
  const { adding, addDirectItem, addRegisteredItem } = useLiveOrderItemAdd();
  const { deletingId, deleteItem } = useLiveOrderItemDelete();

  const handleDeleteItem = async (item: LiveOrderItem) => {
    const ok = await deleteItem(Number(item.id), clean(item.productName) || "상품");
    if (!ok) return;

    setRefreshingDetail(true);
    try {
      setLocalOrder((previousOrder) => {
        const nextItems = (Array.isArray(previousOrder.items) ? previousOrder.items : []).filter(
          (it) => String(it.id) !== String(item.id)
        );
        const nextProductAmount = nextItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
        return {
          ...previousOrder,
          items: nextItems,
          totalQty: nextItems.reduce((sum, it) => sum + Number(it.qty || 0), 0),
          totalAmount: nextProductAmount + Number(previousOrder.shippingFee || 0),
        };
      });
      await onAfterStatusChange?.();
    } finally {
      setRefreshingDetail(false);
    }
  };

  const handleAddDirectItem = async () => {
    const result = await addDirectItem(localOrder, addForm);
    if (!result) return;

    setRefreshingDetail(true);
    try {
      setLocalOrder((previousOrder) => {
        const previousItems = Array.isArray(previousOrder.items) ? previousOrder.items : [];
        const newItem = {
          id: String(result.rowId),
          productName: result.productName,
          optionText: [result.color, result.size].filter(Boolean).join(" / ") || "옵션 없음",
          color: result.color,
          size: result.size,
          qty: result.qty,
          unitPrice: result.unitPrice,
          amount: result.productTotal,
        } as (typeof previousItems)[number];

        const nextItems = [...previousItems, newItem];
        const nextProductAmount = nextItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        return {
          ...previousOrder,
          items: nextItems,
          totalQty: nextItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
          totalAmount: nextProductAmount + Number(previousOrder.shippingFee || 0),
        };
      });

      setAddForm(createInitialLiveOrderItemAddForm());
      setShowAddForm(false);
      await onAfterStatusChange?.();
    } finally {
      setRefreshingDetail(false);
    }
  };

  const handleAddRegisteredItem = async (input: LiveOrderRegisteredAddInput): Promise<boolean> => {
    const result = await addRegisteredItem(localOrder, input);
    if (!result) return false;

    setRefreshingDetail(true);
    try {
      setLocalOrder((previousOrder) => {
        const previousItems = Array.isArray(previousOrder.items) ? previousOrder.items : [];
        const newItem = {
          id: String(result.rowId),
          productName: result.productName,
          optionText: [result.color, result.size].filter(Boolean).join(" / ") || "옵션 없음",
          color: result.color,
          size: result.size,
          qty: result.qty,
          unitPrice: result.unitPrice,
          amount: result.productTotal,
        } as (typeof previousItems)[number];

        const nextItems = [...previousItems, newItem];
        const nextProductAmount = nextItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        return {
          ...previousOrder,
          items: nextItems,
          totalQty: nextItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
          totalAmount: nextProductAmount + Number(previousOrder.shippingFee || 0),
        };
      });

      setShowPicker(false);
      await onAfterStatusChange?.();
    } finally {
      setRefreshingDetail(false);
    }
    return true;
  };

  const orderForView = localOrder;
  const items = Array.isArray(orderForView.items) ? orderForView.items : [];
  const isCanceled = isLiveOrderCanceled(orderForView);
  const productAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const shippingFee = Number(orderForView.shippingFee || 0);

  const rawOrderForCardDisplay = order as any;
  const paymentMethodForCardDisplay = String(
    rawOrderForCardDisplay.paymentMethod ??
      rawOrderForCardDisplay.payment_method ??
      rawOrderForCardDisplay.payment_type ??
      ""
  );
  const isCardPaymentDisplay = paymentMethodForCardDisplay.includes("카드");
  const cardPaymentExtraAmount =
    Number(
      rawOrderForCardDisplay.cardExtraAmount ??
        rawOrderForCardDisplay.card_extra_amount ??
        rawOrderForCardDisplay.vat_amount ??
        rawOrderForCardDisplay.vatAmount ??
        0
    ) || 0;
  const cardPaymentExpectedTotal =
    Number(
      rawOrderForCardDisplay.cardPaymentTotalAmount ??
        rawOrderForCardDisplay.card_payment_total_amount ??
        rawOrderForCardDisplay.adjusted_total_price ??
        rawOrderForCardDisplay.adjustedTotalPrice ??
        rawOrderForCardDisplay.total_price ??
        rawOrderForCardDisplay.totalPrice ??
        rawOrderForCardDisplay.final_amount ??
        rawOrderForCardDisplay.finalAmount ??
        0
    ) ||
    productAmount + shippingFee + cardPaymentExtraAmount;

  const totalAmount = productAmount + shippingFee;
  const pointOriginalAmount =
    Number(
      (orderForView as any).pointOriginalAmount ??
        (orderForView as any).point_original_amount ??
        rawOrderForCardDisplay.pointOriginalAmount ??
        rawOrderForCardDisplay.point_original_amount ??
        0
    ) || totalAmount;
  const pointUsedAmount =
    Number(
      (orderForView as any).pointUsedAmount ??
        (orderForView as any).point_used_amount ??
        rawOrderForCardDisplay.pointUsedAmount ??
        rawOrderForCardDisplay.point_used_amount ??
        0
    ) || 0;
  const finalPaymentAmount =
    Number(
      (orderForView as any).finalAmount ??
        (orderForView as any).final_amount ??
        rawOrderForCardDisplay.finalAmount ??
        rawOrderForCardDisplay.final_amount ??
        0
    ) || (pointUsedAmount > 0 ? Math.max(0, pointOriginalAmount - pointUsedAmount) : totalAmount);
  const isCardOrder = String(orderForView.paymentMethod || "").includes("카드");
  const isCardPaid = orderForView.paymentStatus === "card_paid";
  const isCardUnpaid = orderForView.paymentStatus === "card_unpaid";

  const canCancelPaymentConfirm =
    ["paid", "auto_paid", "manual_paid"].includes(orderForView.paymentStatus) ||
    (orderForView.paymentStatus === "canceled" && Boolean(orderForView.paidAtFull));

  const showCardStatusActions = !isCanceled && isCardOrder && (isCardPaid || isCardUnpaid);
  const customerAddressText = getCustomerAddress(orderForView);
  const customerDeliveryMemoText = getCustomerDeliveryMemo(orderForView);

  const { savingAction, cancelOrder, restoreOrder } = useLiveOrderCancelRestore({
    order: orderForView,
    onAfterStatusChange,
    onClose,
  });

  const handlePaymentConfirmCancel = async () => {
    if (!canCancelPaymentConfirm || paymentCancelAction) return;

    setPaymentCancelAction(true);
    setPaymentCancelError("");

    try {
      const currentOrder = orderForView as any;

      const response = await fetch("/api/admin-v2/payment-confirm-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGroupId:
            currentOrder.groupId ||
            currentOrder.orderGroupId ||
            currentOrder.order_group_id ||
            "",
          orderLookupCode:
            currentOrder.orderNumber ||
            currentOrder.orderLookupCode ||
            currentOrder.order_lookup_code ||
            "",
          orderIds: currentOrder.orderIds || currentOrder.order_ids || [],
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setPaymentCancelError(result?.message || "입금확인 취소 실패");
        return;
      }

      window.location.reload();
    } catch (error) {
      setPaymentCancelError(error instanceof Error ? error.message : String(error));
    } finally {
      setPaymentCancelAction(false);
    }
  };

  // 카카오(다음) 주소검색 — order/page.tsx와 동일 방식 재사용
  const loadDaumPostcodeScript = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return reject();
      if ((window as any).daum?.Postcode) return resolve();
      const existing = document.querySelector<HTMLScriptElement>("script[data-daum-postcode='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      script.dataset.daumPostcode = "true";
      script.onload = () => resolve();
      script.onerror = reject;
      document.body.appendChild(script);
    });

  const openAddressSearch = async () => {
    try {
      await loadDaumPostcodeScript();
      if (!(window as any).daum?.Postcode) {
        showAdminToast("주소검색을 불러오지 못했습니다. 직접 입력해주세요.", "warning");
        return;
      }
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          setEditAddress(data.roadAddress || data.jibunAddress || "");
          setEditZipcode(data.zonecode || "");
        },
      }).open();
    } catch {
      showAdminToast("주소검색을 불러오지 못했습니다. 직접 입력해주세요.", "warning");
    }
  };

  const startEditCustomer = () => {
    const row = order as any;
    setEditName(clean(row.name) || clean(row.customerName) || clean(row.customer_name));
    setEditPhone(clean(orderForView.phone) || clean(row.phone) || clean(row.customer_phone));
    setEditZipcode(clean(row.zipcode) || clean(row.zip_code));
    setEditAddress(clean(row.address) || clean(row.customerAddress) || clean(row.shippingAddress));
    setEditDetailAddress(clean(row.detailAddress) || clean(row.detail_address));
    setEditMemo(clean(row.requestMemo) || clean(row.request_memo) || clean(row.deliveryMemo));
    setEditingCustomer(true);
  };

  // 고객/배송 정보 저장: 돈/입금/포인트 컬럼은 건드리지 않고 고객·주소·메모만 orders UPDATE.
  const handleSaveCustomerFields = async () => {
    if (savingCustomer) return;
    const rowIds = items.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (rowIds.length === 0) {
      showAdminToast("저장할 주문 행을 찾지 못했습니다.", "warning");
      return;
    }
    const phoneDigits = editPhone.replace(/[^0-9]/g, "");
    setSavingCustomer(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          customer_name: editName.trim(),
          customer_phone: phoneDigits,
          phone: phoneDigits,
          zipcode: editZipcode.trim(),
          address: editAddress.trim(),
          detail_address: editDetailAddress.trim(),
          request_memo: editMemo.trim(),
        })
        .in("id", rowIds);
      if (error) {
        showAdminToast("고객정보 저장 실패\n\n" + error.message, "error");
        return;
      }
      showAdminToast("고객/배송 정보가 저장됐습니다.", "success");
      setEditingCustomer(false);
      await onAfterStatusChange?.();
    } finally {
      setSavingCustomer(false);
    }
  };

  // 입금대기 → 수동 입금확인: 기존 입금확인 로직(/api/admin-v2/manual-payment-confirm-without-deposit) 재사용. 새 로직 없음.
  const handleManualConfirm = async () => {
    if (manualConfirmAction) return;

    const ok = await showAdminConfirm(
      [
        "이 주문을 수동 입금확인 처리할까요?",
        "",
        "통장 입금내역 없이 관리자가 직접 입금확인합니다.",
        "실제 입금이 확인된 경우에만 진행하세요.",
      ].join("\n"),
    );
    if (!ok) return;

    setManualConfirmAction(true);
    try {
      const currentOrder = orderForView as any;
      const orderIds =
        currentOrder.orderIds ||
        currentOrder.order_ids ||
        items.map((item) => item.id).filter(Boolean);
      const response = await fetch("/api/admin-v2/manual-payment-confirm-without-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGroupId:
            currentOrder.groupId ||
            currentOrder.orderGroupId ||
            currentOrder.order_group_id ||
            "",
          orderIds,
          expectedAmount: finalPaymentAmount || totalAmount,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        showAdminToast("수동 입금확인 실패\n\n" + (result?.message || ""), "error");
        return;
      }
      showAdminToast("수동 입금확인 처리됐습니다.", "success");
      await onAfterStatusChange?.();
      onClose?.();
    } finally {
      setManualConfirmAction(false);
    }
  };

  const handleCardPaymentStatusChange = async (
    nextStatus: "카드결제완료" | "주문확인전",
    action: "card-paid" | "card-unpaid"
  ) => {
    if (!isCardOrder) {
      showAdminToast("카드결제 주문에서만 처리할 수 있습니다.", "warning");
      return;
    }

    const rowIds = items
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id));

    if (rowIds.length === 0) {
      showAdminToast("상태 변경할 주문 ID가 없습니다.", "warning");
      return;
    }

    const confirmMessage =
      nextStatus === "카드결제완료"
        ? [
            "카드결제완료 처리할까요?",
            "",
            "실제 카드결제가 확인된 경우에만 진행하세요.",
            "주문상태만 카드결제완료로 변경합니다.",
          ].join("\n")
        : [
            "카드결제완료 상태를 카드미결제로 되돌릴까요?",
            "",
            "주문상태는 주문확인전으로 돌아갑니다.",
            "결제방식은 카드결제로 유지됩니다.",
            "금액/상품/배송/송장/자동입금 로직은 변경하지 않습니다.",
          ].join("\n");

    if (!(await showAdminConfirm(confirmMessage))) return;

    setCardStatusAction(action);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
        })
        .in("id", rowIds);

      if (error) {
        showAdminToast("카드결제 상태 변경 실패\n\n" + error.message, "error");
        return;
      }

      showAdminToast(nextStatus === "카드결제완료" ? "카드결제완료 처리됐습니다." : "카드미결제로 되돌렸습니다.", "success");

      await onAfterStatusChange?.();
      onClose?.();
    } finally {
      setCardStatusAction("");
    }
  };


  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-surface">
      {/* 목업 B panel-header */}
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[15px] font-black text-ink">주문 상세</span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose?.();
          }}
          className="text-2xl leading-none text-ink-mute transition hover:text-ink"
          aria-label="주문상세 닫기"
        >
          ×
        </button>
      </header>

      {/* 목업 B panel-body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* 주문번호 · 날짜 */}
        <div className="mb-2.5 text-[11px] font-bold text-ink-mute">
          {order.orderNo || "주문번호 없음"} · {formatFullDateTime(order.createdAt, orderForView.submittedAt)}
        </div>

        {/* 배송주소 rose박스 + 고객정보 편집(기존 핸들러 유지) */}
        <section className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[11px] font-black text-ink-mute">배송주소</div>
            {!isCanceled ? (
              editingCustomer ? (
                <button type="button" onClick={() => setEditingCustomer(false)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft">취소</button>
              ) : (
                <button type="button" onClick={startEditCustomer} className="rounded-lg border border-rose-line bg-surface px-2.5 py-1 text-[11px] font-black text-rose-deep hover:bg-rose-soft">✎ 편집</button>
              )
            ) : null}
          </div>

          {editingCustomer ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black text-ink-mute">이름
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
                </label>
                <label className="grid gap-1 text-[10px] font-black text-ink-mute">전화
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} inputMode="numeric" className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
                </label>
              </div>
              <div className="grid gap-1 text-[10px] font-black text-ink-mute">우편번호 · 주소
                <div className="flex gap-2">
                  <input value={editZipcode} onChange={(e) => setEditZipcode(e.target.value)} placeholder="우편번호" className="h-9 w-[96px] rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
                  <button type="button" onClick={openAddressSearch} className="h-9 shrink-0 rounded-lg bg-rose-deep px-3 text-[12px] font-black text-white hover:bg-rose-deep">주소검색</button>
                </div>
                <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="기본주소" className="mt-1 h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
                <input value={editDetailAddress} onChange={(e) => setEditDetailAddress(e.target.value)} placeholder="상세주소" className="mt-1 h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
              </div>
              <label className="grid gap-1 text-[10px] font-black text-ink-mute">배송메모
                <input value={editMemo} onChange={(e) => setEditMemo(e.target.value)} placeholder="배송 요청사항" className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
              </label>
              <button type="button" onClick={handleSaveCustomerFields} disabled={savingCustomer} className="mt-1 h-9 w-full rounded-lg bg-emerald-600 text-[13px] font-black text-white hover:bg-emerald-700 disabled:bg-surface-3">
                {savingCustomer ? "저장중..." : "✔ 고객/배송 정보 저장"}
              </button>
              <div className="rounded-lg bg-warn-bg px-2.5 py-1.5 text-[10px] font-bold leading-4 text-warn-tx">상품명·옵션·금액은 아래 상품 카드에서 수정합니다. 여기선 고객·주소·메모만 저장됩니다(배송비/합계 미변경).</div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-keep rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] font-bold leading-5 text-ink">
              {customerAddressText || "주소 정보 없음"}
            </div>
          )}
        </section>

        {/* 고객정보 그리드 (목업 B: 닉네임/이름/연락처/결제방법) */}
        <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Info label="닉네임" value={orderForView.nickname || "-"} strong />
          <Info label="이름(주문자)" value={order.name || "-"} />
          <Info label="연락처(주문자)" value={orderForView.phone || "-"} />
          <Info label="결제방법" value={orderForView.paymentMethod || "-"} />
          {((order as any).recipientName || (order as any).recipientPhone) ? (
            <>
              <Info label="받는 분(배송)" value={(order as any).recipientName || order.name || "-"} strong />
              <Info label="받는분 연락처" value={(order as any).recipientPhone || orderForView.phone || "-"} />
            </>
          ) : null}
        </div>

        {/* 상태 배지 + 안내 (기존 로직) */}
        <div className={`rounded-xl border px-3 py-2 text-xs font-black ${getPaymentStatusClass(orderForView)}`}>
          {getPaymentStatusLabel(orderForView)}
          {orderForView.paidAt ? <span className="ml-2 font-bold opacity-70">{orderForView.paidAt}</span> : null}
        </div>

        {["manual_paid", "auto_paid", "paid"].includes(orderForView.paymentStatus) ? (
          <div className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11px] font-bold leading-4 text-ink-soft">
            입금확인 주문입니다. 입금확인을 잘못 처리한 경우에는 [입금확인 취소]를 사용하세요. 주문 자체를 없애야 하는 경우에만 [주문서 자체 취소]를 사용하세요.
          </div>
        ) : null}

        {paymentCancelError ? (
          <div className="mt-2 rounded-xl border border-danger-tx bg-danger-bg px-3 py-2 text-[11px] font-black leading-4 text-danger-tx">
            입금확인 취소 오류: {paymentCancelError}
          </div>
        ) : null}

        {/* 주문 내역 (목업 B) */}
        <section className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-black text-ink-mute">주문 내역 ({items.length}건)</h3>
            <div className="flex items-center gap-2">
              {refreshingDetail ? (
                <span className="rounded-full bg-rose-soft px-2 py-1 text-[10px] font-black text-rose-deep">상세정보 갱신중...</span>
              ) : null}
              {!isCanceled ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPicker(false);
                      setShowAddForm((v) => !v);
                    }}
                    className="rounded-lg border border-rose-line bg-rose-soft px-2 py-1 text-[11px] font-black text-rose-deep hover:bg-rose-soft"
                  >
                    {showAddForm ? "닫기" : "+ 직접입력 추가"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setShowPicker((v) => !v);
                    }}
                    className="rounded-lg border border-rose-line bg-rose-soft px-2 py-1 text-[11px] font-black text-rose-deep hover:bg-rose-soft"
                  >
                    {showPicker ? "닫기" : "+ 등록상품 추가"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-4 text-center text-xs font-bold text-ink-mute">주문 품목이 없습니다.</div>
            ) : (
              items.map((item, index) => (
                <LiveOrderItemEditCard
                  key={`${item.id}-${index}`}
                  item={item}
                  index={index}
                  disabled={isCanceled}
                  onAfterSave={handleItemSaved}
                  canDelete={!isCanceled && items.length > 1}
                  deleting={deletingId === String(item.id)}
                  onDelete={() => handleDeleteItem(item)}
                />
              ))
            )}
          </div>

          {showAddForm && !isCanceled ? (
            <div className="mt-2 space-y-2 rounded-2xl border border-rose-line bg-rose-soft/50 p-3">
              <div className="text-[11px] font-black text-ink-soft">직접입력 상품 추가 (재고 차감 없음)</div>
              <input
                value={addForm.productName}
                onChange={(e) => setAddForm((f) => ({ ...f, productName: e.target.value }))}
                placeholder="상품명"
                className="w-full rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
              />
              <div className="flex gap-2">
                <input
                  value={addForm.color}
                  onChange={(e) => setAddForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="색상(선택)"
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
                />
                <input
                  value={addForm.size}
                  onChange={(e) => setAddForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="사이즈(선택)"
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={addForm.qty}
                  onChange={(e) => setAddForm((f) => ({ ...f, qty: e.target.value.replace(/[^\d]/g, "") }))}
                  inputMode="numeric"
                  placeholder="수량"
                  className="w-20 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
                />
                <input
                  value={addForm.unitPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, unitPrice: e.target.value.replace(/[^\d]/g, "") }))}
                  inputMode="numeric"
                  placeholder="단가(원)"
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
                />
              </div>
              <button
                type="button"
                disabled={adding}
                onClick={handleAddDirectItem}
                className="w-full rounded-lg bg-rose-deep px-3 py-2 text-[13px] font-black text-white disabled:opacity-50"
              >
                {adding ? "추가 중..." : "이 주문에 추가"}
              </button>
            </div>
          ) : null}

          {showPicker && !isCanceled ? (
            <LiveOrderRegisteredProductPicker
              onAdd={handleAddRegisteredItem}
              onClose={() => setShowPicker(false)}
              adding={adding}
            />
          ) : null}
        </section>

        {/* 금액 요약 (목업 B) */}
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex items-center justify-between py-1 text-[12px]"><span className="text-ink-soft">상품금액</span><span className="font-black text-ink">{money(productAmount)}</span></div>
          <div className="flex items-center justify-between py-1 text-[12px]"><span className="text-ink-soft">배송비</span><span className="font-black text-ink">{money(shippingFee)}</span></div>
          {isCardPaymentDisplay && cardPaymentExtraAmount > 0 ? (
            <div className="flex items-center justify-between py-1 text-[12px]"><span className="text-ink-soft">카드추가금</span><span className="font-black text-ink">{money(cardPaymentExtraAmount)}</span></div>
          ) : null}
          {pointUsedAmount > 0 ? (
            <div className="flex items-center justify-between py-1 text-[12px]"><span className="text-ink-soft">포인트 사용</span><span className="font-black text-rose-deep">-{money(pointUsedAmount)}</span></div>
          ) : null}
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2 text-[14px] font-black">
            <span className="text-ink">{pointUsedAmount > 0 ? "최종 결제금액" : "총 결제금액"}</span>
            <span className="text-ink">{money(pointUsedAmount > 0 ? finalPaymentAmount : cardPaymentExpectedTotal)}</span>
          </div>
        </div>

        {/* 액션 버튼 (목업 B action-btns: 수동입금확인 green / 입금매칭 rose / 취소 red) — 기존 조건/핸들러 그대로 */}
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-3">
          {!isCanceled && canCancelPaymentConfirm ? (
            <button
              type="button"
              onClick={handlePaymentConfirmCancel}
              disabled={paymentCancelAction}
              className="h-10 w-full rounded-xl border border-line bg-surface text-[13px] font-black text-ink shadow-sm hover:bg-surface-2 active:scale-[0.99] disabled:bg-surface-2 disabled:text-ink-mute"
            >
              {paymentCancelAction ? "처리중..." : "입금확인 취소"}
            </button>
          ) : null}

          {showCardStatusActions ? (
            <>
              {isCardUnpaid ? (
                <button
                  type="button"
                  onClick={() => handleCardPaymentStatusChange("카드결제완료", "card-paid")}
                  disabled={Boolean(cardStatusAction)}
                  className="h-10 w-full rounded-xl bg-cardpay text-[13px] font-black text-white shadow-sm hover:bg-cardpay-hover active:scale-[0.99] disabled:bg-surface-3"
                >
                  {cardStatusAction === "card-paid" ? "처리중..." : "카드결제완료 처리"}
                </button>
              ) : null}

              {isCardPaid ? (
                <>
                  <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-[11px] font-bold leading-4 text-purple-700">
                    카드결제완료 주문입니다. 결제완료 처리를 잘못한 경우에는 [카드미결제로 되돌리기]를 사용하세요. 주문 자체를 없애야 하는 경우에만 [주문서 자체 취소]를 사용하세요.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCardPaymentStatusChange("주문확인전", "card-unpaid")}
                    disabled={Boolean(cardStatusAction)}
                    className="h-10 w-full rounded-xl border border-rose-line bg-rose-soft text-[13px] font-black text-rose-deep shadow-sm hover:bg-rose-soft active:scale-[0.99] disabled:bg-surface-2 disabled:text-ink-mute"
                  >
                    {cardStatusAction === "card-unpaid" ? "처리중..." : "카드미결제로 되돌리기"}
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {!isCanceled && orderForView.paymentStatus === "unpaid" ? (
            <button
              type="button"
              onClick={handleManualConfirm}
              disabled={manualConfirmAction}
              className="h-10 w-full rounded-xl bg-emerald-600 text-[13px] font-black text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] disabled:bg-surface-3"
            >
              {manualConfirmAction ? "처리중..." : "수동 입금확인"}
            </button>
          ) : null}

          {!isCanceled && orderForView.paymentStatus === "manual_match_needed" && onOpenManualMatch ? (
            <button
              type="button"
              onClick={() => onOpenManualMatch(order)}
              className="h-10 w-full rounded-xl border border-rose-line bg-rose-soft text-[13px] font-black text-rose-deep shadow-sm hover:bg-rose-soft active:scale-[0.99]"
            >
              입금 매칭에서 찾기
            </button>
          ) : null}

          {isCanceled ? (
            <>
              <button
                type="button"
                onClick={restoreOrder}
                disabled={Boolean(savingAction)}
                className="h-10 w-full rounded-xl bg-rose-deep text-[13px] font-black text-white shadow-sm hover:bg-rose-deep active:scale-[0.99] disabled:bg-surface-3"
              >
                {savingAction === "restore" ? "처리중..." : "주문서복구"}
              </button>

              {canCancelPaymentConfirm && !isCardOrder ? (
                <>
                  <div className="rounded-xl border border-warn-tx bg-warn-bg px-3 py-2 text-[11px] font-bold leading-4 text-warn-tx">
                    주문서는 이미 취소된 상태입니다. 다만 입금확인 기록이 남아있어 정산에서 제외하려면 [취소주문 입금기록 정리]를 사용하세요.
                  </div>
                  <button
                    type="button"
                    onClick={handlePaymentConfirmCancel}
                    disabled={paymentCancelAction}
                    className="h-10 w-full rounded-xl border border-warn-tx bg-surface text-[13px] font-black text-warn-tx shadow-sm hover:bg-warn-bg active:scale-[0.99] disabled:bg-surface-2 disabled:text-ink-mute"
                  >
                    {paymentCancelAction ? "처리중..." : "취소주문 입금기록 정리"}
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <LiveOrderDangerActionGuide />
              <button
                type="button"
                onClick={cancelOrder}
                disabled={Boolean(savingAction)}
                className="h-10 w-full rounded-xl border border-danger-tx bg-danger-bg text-[13px] font-black text-danger-tx shadow-sm hover:bg-danger-bg active:scale-[0.99] disabled:bg-surface-2 disabled:text-ink-mute"
              >
                {savingAction === "cancel" ? "처리중..." : "주문서 자체 취소"}
              </button>
            </>
          )}
        </div>

        <section className="mt-3">
          <div className="mb-1 text-[11px] font-black text-ink-mute">배송메모 / 특이사항</div>
          <div className="min-h-[56px] rounded-lg bg-surface-2 p-3 text-[12px] font-bold leading-6 text-ink-soft">
            {customerDeliveryMemoText || "입력 없음"}
          </div>
        </section>
      </div>
    </aside>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-black text-ink-mute">{label}</div>
      <div className={["mt-0.5 truncate text-sm text-ink", strong ? "font-black" : "font-bold"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm font-black text-ink-soft">{label}</span>
      <span className="text-base font-black text-ink">{money(value)}</span>
    </div>
  );
}
