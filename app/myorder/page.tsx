// app/myorder/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 적용:
// - 주문조회번호만으로 조회
// - 주문서 작성완료 시점 기준 실제 날짜 최근 7일만 조회
// - 조회 실패 문구: 최근 7일간 주문내역이 존재하지 않습니다.
// - 주문조회번호 입력칸만 우클릭/복사/붙여넣기 허용
// - 고객 주문조회에 주문시간 표시
// - 주문취소/환불/부분환불 상태 표시 개선

"use client";

import { supabase } from "@/lib/supabase";
import { useState } from "react";

const formatWon = (value: number) => `${Number(value || 0).toLocaleString()}원`;

const formatDateTime = (value: string) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const getCustomerStatusLabel = (order: any) => {
  const manageStatus = String(order.order_manage_status || "");
  const refundType = String(order.refund_type || "");

  if (manageStatus === "주문서취소") return "주문취소";
  if (manageStatus === "환불" && refundType === "부분환불") return "부분환불";
  if (manageStatus === "환불") return "환불완료";
  if (manageStatus === "출고완료") return "배송출발";
  if (manageStatus === "출고대기") return "출고준비중";
  if (manageStatus === "주문확인완료") return "확인완료";

  return "주문접수";
};

const getStatusClassName = (label: string) => {
  if (label === "주문취소") return "bg-red-100 text-red-700";
  if (label === "환불완료") return "bg-gray-200 text-gray-800";
  if (label === "부분환불") return "bg-orange-100 text-orange-700";
  if (label === "배송출발") return "bg-green-100 text-green-700";
  if (label === "출고준비중") return "bg-yellow-100 text-yellow-700";
  if (label === "확인완료") return "bg-blue-100 text-blue-700";

  return "bg-gray-100 text-gray-700";
};

export default function MyOrderPage() {
  const [lookupCode, setLookupCode] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLookup = async () => {
    const code = lookupCode.trim().toUpperCase();

    if (!code) {
      alert("주문조회번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("");
    setOrders([]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_lookup_code", code)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    setIsLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("최근 7일간 주문내역이 존재하지 않습니다.");
      return;
    }

    setOrders(data);
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="max-w-2xl mx-auto">

        <section className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-6 md:p-8">
          <div className="text-sm font-extrabold text-gray-500 mb-2">
            ORDER LOOKUP
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold">
            주문조회
          </h1>

          <p className="mt-3 text-gray-500 font-bold leading-relaxed">
            주문완료 후 발급된 주문조회번호로만 조회할 수 있습니다.
            <br />
            주문서 작성완료 시점 기준 최근 7일간만 조회 가능합니다.
          </p>

          <div className="mt-6 grid gap-3">
            <input
              data-security-allow="true"
              type="text"
              placeholder="예) RURU-260516-0418-X8Q2M9"
              className="w-full rounded-2xl border border-gray-300 bg-gray-50 px-5 py-4 text-lg font-bold outline-none focus:border-black"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
            />

            <button
              onClick={handleLookup}
              disabled={isLoading}
              className="w-full bg-black text-white rounded-2xl py-4 text-lg font-extrabold disabled:opacity-50"
            >
              {isLoading ? "조회중..." : "조회하기"}
            </button>
          </div>
        </section>

        {message && (
          <section className="mt-6 rounded-3xl border border-gray-300 bg-white p-6 text-center text-gray-500 font-bold">
            {message}
          </section>
        )}

        {orders.length > 0 && (
          <section className="mt-6 grid gap-4">
            {orders.map((order) => {
              const statusLabel = getCustomerStatusLabel(order);
              const isCanceled = statusLabel === "주문취소";
              const isRefunded =
                statusLabel === "환불완료" ||
                statusLabel === "부분환불";

              const shouldStrike = isCanceled || isRefunded;

              return (
                <article
                  key={order.id}
                  className={`rounded-3xl border p-5 shadow-sm ${
                    isCanceled
                      ? "border-red-200 bg-red-50"
                      : isRefunded
                      ? "border-orange-200 bg-orange-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="font-extrabold text-lg">
                        {order.youtube_nickname || "-"}
                      </div>

                      <div className="text-sm text-gray-500 font-bold mt-1">
                        주문시간 {formatDateTime(order.created_at)}
                      </div>

                      <div className="text-xs text-gray-400 font-bold mt-1">
                        {order.order_lookup_code || "-"}
                      </div>
                    </div>

                    <div
                      className={`rounded-full px-3 py-1 text-xs font-extrabold ${getStatusClassName(
                        statusLabel
                      )}`}
                    >
                      {statusLabel}
                    </div>
                  </div>

                  <div className={shouldStrike ? "line-through text-gray-400" : ""}>
                    <div className="text-2xl font-extrabold">
                      {order.product_name || "상품명 없음"}
                    </div>

                    <div className="mt-2 text-gray-600 font-bold">
                      {(order.color && order.color !== "없음") ? order.color : ""}
                      {(order.color && order.color !== "없음" && order.size && order.size !== "없음") ? " / " : ""}
                      {(order.size && order.size !== "없음") ? order.size : ""}
                      {" / "}
                      {order.qty || 0}개
                    </div>

                    <div className="mt-3 text-xl font-extrabold">
                      {formatWon(order.adjusted_total_price || order.total_price)}
                    </div>
                  </div>

                  {isCanceled && order.cancel_reason && (
                    <div className="mt-4 rounded-2xl bg-white border border-red-200 p-4 text-red-700 font-bold">
                      취소 사유: {order.cancel_reason}
                    </div>
                  )}

                  {isRefunded && order.refund_memo && (
                    <div className="mt-4 rounded-2xl bg-white border border-orange-200 p-4 text-orange-700 font-bold">
                      환불 메모: {order.refund_memo}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

      </div>
    </main>
  );
}
