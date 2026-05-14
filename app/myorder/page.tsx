// app/myorder/page.tsx
// 전체 교체용
// 고객 주문조회: 주문서취소 표시, 취소사유 표시, 취소 주문내역 가운데줄 표시

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const won = (value: any) =>
  `${Number(value || 0).toLocaleString()}원`;

const getOrderTotal = (order: any) =>
  Number(order.adjusted_total_price || order.total_price || 0);

const getDisplayStatus = (order: any) => {
  if (order.order_manage_status === "주문서취소") return "주문서취소";
  if (order.order_manage_status === "환불" && order.refund_type === "부분환불") return "부분환불";
  if (order.order_manage_status === "환불") return "환불";
  return order.order_manage_status || "주문확인전";
};

export default function MyOrderPage() {
  const [keyword, setKeyword] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const searchOrders = async () => {
    if (!keyword.trim()) {
      alert("닉네임 / 이름 / 전화번호 / 주문번호 중 하나를 입력해주세요.");
      return;
    }

    setLoading(true);

    const text = keyword.trim();
    const phone = text.replace(/[^0-9]/g, "");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(
        [
          `youtube_nickname.ilike.%${text}%`,
          `customer_name.ilike.%${text}%`,
          `order_lookup_code.ilike.%${text}%`,
          phone ? `customer_phone.ilike.%${phone}%` : `customer_phone.ilike.%${text}%`,
        ].join(",")
      )
      .order("created_at", { ascending: false });

    if (error) {
      alert("주문조회 오류: " + error.message);
      setLoading(false);
      return;
    }

    setOrders(data || []);
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gray-100 p-5 text-gray-900">
      <div className="max-w-3xl mx-auto">
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-5">
          <h1 className="text-3xl font-extrabold mb-2">주문내역 조회</h1>
          <p className="text-gray-600 mb-5">
            닉네임 / 이름 / 전화번호 / 주문번호로 조회할 수 있습니다.
          </p>

          <div className="grid md:grid-cols-[1fr_160px] gap-3">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchOrders();
              }}
              placeholder="예) 루루동이 / 홍길동 / 01012345678 / 주문번호"
              className="w-full border rounded-2xl p-4"
            />

            <button
              onClick={searchOrders}
              className="bg-black text-white rounded-2xl p-4 font-bold"
            >
              조회하기
            </button>
          </div>
        </section>

        {loading && (
          <section className="bg-white rounded-3xl border p-6 text-center font-bold">
            불러오는중...
          </section>
        )}

        {!loading && orders.length === 0 && (
          <section className="bg-white rounded-3xl border p-6 text-center text-gray-500">
            조회된 주문이 없습니다.
          </section>
        )}

        <div className="grid gap-4">
          {orders.map((order) => {
            const status = getDisplayStatus(order);
            const isCanceled = status === "주문서취소";

            return (
              <section
                key={order.id}
                className={`rounded-3xl border shadow-sm p-5 ${
                  isCanceled
                    ? "bg-red-50 border-red-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-xl font-extrabold">
                      {order.youtube_nickname || "-"}
                    </div>
                    <div className="text-gray-600">
                      {order.customer_name || "-"}
                    </div>
                  </div>

                  <div
                    className={`px-4 py-2 rounded-full text-sm font-extrabold ${
                      isCanceled
                        ? "bg-red-600 text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {status}
                  </div>
                </div>

                {isCanceled && (
                  <div className="bg-white border border-red-200 rounded-2xl p-4 mb-4">
                    <div className="font-extrabold text-red-700">
                      주문이 취소되었습니다.
                    </div>
                    <div className="text-sm text-red-700 mt-1">
                      취소 사유: {order.cancel_reason || "-"}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-2xl border p-4">
                  <div
                    className={`text-lg font-extrabold ${
                      isCanceled ? "line-through text-gray-400" : ""
                    }`}
                  >
                    {order.product_name || "상품명 없음"}
                  </div>

                  <div
                    className={`mt-2 text-gray-600 ${
                      isCanceled ? "line-through text-gray-400" : ""
                    }`}
                  >
                    {order.color || "없음"} / {order.size || "없음"} / {order.qty || 0}개
                  </div>

                  <div
                    className={`mt-3 text-xl font-extrabold ${
                      isCanceled ? "line-through text-gray-400" : ""
                    }`}
                  >
                    {won(getOrderTotal(order))}
                  </div>
                </div>

                {!isCanceled && order.order_manage_status === "환불" && (
                  <div className="mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <div className="font-extrabold text-orange-700">
                      {order.refund_type || "환불"} / {won(order.refund_amount || 0)}
                    </div>
                    <div className="text-sm text-orange-700 mt-1">
                      환불 메모: {order.refund_memo || "-"}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
