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

"use client";

import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function MyOrderPage() {
  const [lookupCode, setLookupCode] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const formatWon = (value: number) => `${Number(value || 0).toLocaleString()}원`;

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
              placeholder="예) RURU-260515-ABCD"
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
              const isCanceled =
                order.order_status === "주문서취소" ||
                order.admin_status === "주문서취소" ||
                order.order_manage_status === "주문서취소";

              const isRefunded =
                order.refund_type === "환불" ||
                order.refund_type === "부분환불" ||
                order.order_status === "환불" ||
                order.admin_status === "환불";

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
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-extrabold text-lg">
                      {order.youtube_nickname || "-"}
                    </div>

                    <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-700">
                      {order.order_status || order.admin_status || "주문완료신청"}
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
