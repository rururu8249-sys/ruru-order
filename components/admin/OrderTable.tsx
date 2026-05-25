// components/admin/OrderTable.tsx
// 전체 교체용
// 환불 UX 개선 버전: 상태 드롭다운에서 환불/부분환불 선택 시 팝업 처리

"use client";

import { showAdminToast } from "@/lib/adminToast";

import { useMemo, useState } from "react";

type OrderTableProps = {
  orders: any[];

  viewMode: "card" | "table";
  setViewMode: (mode: "card" | "table") => void;

  updateOrderStatus: (
    orderId: number,
    status: string
  ) => void;
};

const STATUS_OPTIONS = [
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "거파",
  "환불",
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "주문확인완료":
      return "bg-blue-100 text-blue-700 border-blue-200";

    case "출고대기":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";

    case "출고완료":
      return "bg-green-100 text-green-700 border-green-200";

    case "부분환불":
      return "bg-orange-100 text-orange-700 border-orange-200";

    case "환불":
      return "bg-gray-200 text-gray-800 border-gray-300";

    case "거파":
      return "bg-red-100 text-red-700 border-red-200";

    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const onlyNumber = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const formatNumber = (value: any) =>
  Number(onlyNumber(String(value || "")) || 0).toLocaleString();

const formatWon = (value: any) =>
  `${Number(value || 0).toLocaleString()}원`;

const getOrderTotal = (order: any) =>
  Number(
    order.adjusted_total_price ||
      order.total_price ||
      0
  );

const getItemText = (order: any) => {
  const name = order.product_name || "상품명 없음";
  const color = order.color || "없음";
  const size = order.size || "없음";
  const qty = order.qty || 1;

  return `${name} / ${color} / ${size} x${qty}`;
};

export default function OrderTable({
  orders,
  viewMode,
  setViewMode,
  updateOrderStatus,
}: OrderTableProps) {
  const [refundModalOrder, setRefundModalOrder] =
    useState<any | null>(null);

  const [refundType, setRefundType] =
    useState<"전액환불" | "부분환불">("전액환불");

  const [refundAmountText, setRefundAmountText] =
    useState("");

  const [refundMemo, setRefundMemo] =
    useState("");

  const [refundRecords, setRefundRecords] =
    useState<
      Record<
        number,
        {
          type: "전액환불" | "부분환불";
          amount: number;
          memo: string;
        }
      >
    >({});

  const openRefundModal = (
    order: any,
    type: "전액환불" | "부분환불"
  ) => {
    const total = getOrderTotal(order);

    setRefundModalOrder(order);
    setRefundType(type);
    setRefundAmountText(
      type === "전액환불" ? total.toLocaleString() : ""
    );
    setRefundMemo("");
  };

  const closeRefundModal = () => {
    setRefundModalOrder(null);
    setRefundType("전액환불");
    setRefundAmountText("");
    setRefundMemo("");
  };

  const saveRefund = () => {
    if (!refundModalOrder?.id) return;

    const amount =
      refundType === "전액환불"
        ? getOrderTotal(refundModalOrder)
        : Number(onlyNumber(refundAmountText));

    if (refundType === "부분환불" && amount <= 0) {
      showAdminToast("부분환불 금액을 입력해주세요.", "warning");
      return;
    }

    if (!refundMemo.trim()) {
      showAdminToast("환불 사유/메모를 입력해주세요.", "warning");
      return;
    }

    setRefundRecords((prev) => ({
      ...prev,
      [refundModalOrder.id]: {
        type: refundType,
        amount,
        memo: refundMemo.trim(),
      },
    }));

    updateOrderStatus(
      refundModalOrder.id,
      refundType === "전액환불"
        ? "환불"
        : "부분환불"
    );

    closeRefundModal();
  };

  const rows = useMemo(() => {
    return orders.map((order) => {
      const status =
        order.order_manage_status ||
        "주문확인전";

      const refundRecord =
        refundRecords[order.id];

      return {
        ...order,
        displayStatus: refundRecord
          ? refundRecord.type === "전액환불"
            ? "환불"
            : "부분환불"
          : status,
        refundRecord,
      };
    });
  }, [orders, refundRecords]);

  const handleStatusChange = (
    order: any,
    nextStatus: string
  ) => {
    if (nextStatus === "환불") {
      openRefundModal(order, "전액환불");
      return;
    }

    if (nextStatus === "부분환불") {
      openRefundModal(order, "부분환불");
      return;
    }

    updateOrderStatus(order.id, nextStatus);
  };

  return (
    <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <div className="text-2xl font-extrabold">
            주문 관리
          </div>

          <div className="text-sm text-gray-500 mt-1">
            주문상태 / 환불 / 출고관리
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("card")}
            className={`px-5 py-3 rounded-2xl font-bold ${
              viewMode === "card"
                ? "bg-black text-white"
                : "bg-gray-100 text-black"
            }`}
          >
            카드형
          </button>

          <button
            onClick={() => setViewMode("table")}
            className={`px-5 py-3 rounded-2xl font-bold ${
              viewMode === "table"
                ? "bg-black text-white"
                : "bg-gray-100 text-black"
            }`}
          >
            테이블형
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] border-collapse">
            <thead>
              <tr className="bg-gray-100 text-sm">
                <th className="p-3 text-left w-[180px]">
                  상태
                </th>
                <th className="p-3 text-left w-[180px]">
                  닉네임 / 이름
                </th>
                <th className="p-3 text-left">
                  주문내역
                </th>
                <th className="p-3 text-left w-[120px]">
                  수량
                </th>
                <th className="p-3 text-left w-[150px]">
                  금액
                </th>
                <th className="p-3 text-left w-[150px]">
                  배송비
                </th>
                <th className="p-3 text-left w-[240px]">
                  환불내역
                </th>
                <th className="p-3 text-left w-[160px]">
                  전화번호
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((order) => {
                const status = order.displayStatus;
                const refundRecord = order.refundRecord;

                return (
                  <tr
                    key={order.id}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="p-3">
                      <select
                        value={status}
                        onChange={(e) =>
                          handleStatusChange(
                            order,
                            e.target.value
                          )
                        }
                        className={`w-full px-3 py-2 rounded-xl font-bold border ${getStatusColor(
                          status
                        )}`}
                      >
                        {[
                          ...STATUS_OPTIONS.slice(0, 4),
                          "부분환불",
                          ...STATUS_OPTIONS.slice(4),
                        ].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-3">
                      <div className="font-extrabold">
                        {order.youtube_nickname || "-"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {order.customer_name || "-"}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-bold">
                        {order.product_name || "상품명 없음"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {order.color || "없음"} / {order.size || "없음"}
                      </div>
                    </td>

                    <td className="p-3 font-bold">
                      {order.qty || 0}개
                    </td>

                    <td className="p-3 font-extrabold">
                      {formatWon(getOrderTotal(order))}
                    </td>

                    <td className="p-3">
                      {formatWon(
                        order.final_shipping_fee ??
                          order.shipping_fee
                      )}
                    </td>

                    <td className="p-3">
                      {refundRecord ? (
                        <div
                          className={`rounded-2xl p-3 border ${
                            refundRecord.type === "전액환불"
                              ? "bg-gray-50"
                              : "bg-orange-50 border-orange-200"
                          }`}
                        >
                          <div className="font-extrabold">
                            {refundRecord.type} /{" "}
                            {formatWon(refundRecord.amount)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {refundRecord.memo}
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">
                          -
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      {order.customer_phone || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((order) => {
            const status = order.displayStatus;
            const refundRecord = order.refundRecord;

            return (
              <div
                key={order.id}
                className="border rounded-3xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-2xl font-extrabold">
                        {order.youtube_nickname || "-"}
                      </div>
                      <div className="text-gray-500">
                        {order.customer_name || "-"}
                      </div>
                    </div>

                    <div className="text-sm text-gray-500 mt-1">
                      {order.customer_phone || "-"}
                    </div>
                  </div>

                  <select
                    value={status}
                    onChange={(e) =>
                      handleStatusChange(
                        order,
                        e.target.value
                      )
                    }
                    className={`px-3 py-2 rounded-xl font-bold border ${getStatusColor(
                      status
                    )}`}
                  >
                    {[
                      ...STATUS_OPTIONS.slice(0, 4),
                      "부분환불",
                      ...STATUS_OPTIONS.slice(4),
                    ].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-gray-50 rounded-2xl border p-4">
                  <div className="font-bold text-lg">
                    {getItemText(order)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-gray-50 rounded-2xl border p-4">
                    <div className="text-sm text-gray-500">
                      결제금액
                    </div>
                    <div className="text-xl font-extrabold">
                      {formatWon(getOrderTotal(order))}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl border p-4">
                    <div className="text-sm text-gray-500">
                      배송비
                    </div>
                    <div className="text-xl font-extrabold">
                      {formatWon(
                        order.final_shipping_fee ??
                          order.shipping_fee
                      )}
                    </div>
                  </div>
                </div>

                {refundRecord && (
                  <div className="mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <div className="font-extrabold">
                      {refundRecord.type} /{" "}
                      {formatWon(refundRecord.amount)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {refundRecord.memo}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {refundModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-200">
            <div className="text-2xl font-extrabold mb-1">
              환불 처리
            </div>

            <div className="text-sm text-gray-500 mb-5">
              {refundModalOrder.youtube_nickname || "-"} /{" "}
              {refundModalOrder.customer_name || "-"}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => {
                  setRefundType("전액환불");
                  setRefundAmountText(
                    getOrderTotal(refundModalOrder).toLocaleString()
                  );
                }}
                className={`p-4 rounded-2xl font-bold border ${
                  refundType === "전액환불"
                    ? "bg-black text-white"
                    : "bg-gray-50"
                }`}
              >
                전액환불
              </button>

              <button
                onClick={() => {
                  setRefundType("부분환불");
                  setRefundAmountText("");
                }}
                className={`p-4 rounded-2xl font-bold border ${
                  refundType === "부분환불"
                    ? "bg-black text-white"
                    : "bg-gray-50"
                }`}
              >
                부분환불
              </button>
            </div>

            <div className="mb-4">
              <div className="text-sm font-bold mb-2">
                환불금액
              </div>

              <div className="relative">
                <input
                  value={refundAmountText}
                  disabled={refundType === "전액환불"}
                  onChange={(e) =>
                    setRefundAmountText(
                      formatNumber(e.target.value)
                    )
                  }
                  placeholder="0"
                  className="w-full border rounded-2xl p-4 pr-12 font-bold text-lg disabled:bg-gray-100"
                />

                <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">
                  원
                </div>
              </div>

              {refundType === "전액환불" && (
                <div className="text-xs text-gray-500 mt-2">
                  전액환불은 주문 총액이 자동 입력됩니다.
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="text-sm font-bold mb-2">
                환불사유 / 메모
              </div>

              <textarea
                value={refundMemo}
                onChange={(e) =>
                  setRefundMemo(e.target.value)
                }
                placeholder="예) 품절 전액환불 / 상품 1개 부분환불 / 고객 요청"
                className="w-full border rounded-2xl p-4 min-h-[110px]"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveRefund}
                className="flex-1 bg-black text-white p-4 rounded-2xl font-extrabold"
              >
                저장
              </button>

              <button
                onClick={closeRefundModal}
                className="flex-1 bg-gray-200 text-black p-4 rounded-2xl font-extrabold"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
