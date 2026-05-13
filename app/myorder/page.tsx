"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: number;
  created_at: string;
  broadcast_name: string;
  youtube_nickname: string;
  product_name: string;
  color: string;
  size: string;
  qty: number;
  total_price: number;
  payment_method: string;
  admin_status: string;
  order_status: string;
};

export default function MyOrderPage() {
  const [nickname, setNickname] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const formatWon = (value: number) =>
    `${Number(value || 0).toLocaleString()}원`;

  const searchOrders = async () => {
    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .ilike("youtube_nickname", `%${nickname}%`)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setOrders(data || []);
  };

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-3">
          주문내역 조회
        </h1>

        <div className="text-gray-400 mb-8 leading-7">
          유튜브 닉네임으로<br />
          최근 주문내역을 확인할 수 있습니다.
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="유튜브 닉네임 입력"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="flex-1 p-4 rounded-xl bg-black border border-zinc-700"
            />

            <button
              onClick={searchOrders}
              className="bg-yellow-400 text-black font-bold px-6 rounded-xl"
            >
              조회
            </button>
          </div>
        </div>

        <div className="grid gap-5">
          {orders.map((order) => {
            const isCanceled =
              order.order_status === "주문취소";

            return (
              <div
                key={order.id}
                className={`rounded-2xl p-5 border ${
                  isCanceled
                    ? "bg-zinc-950 border-red-900 opacity-70"
                    : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-xl font-bold">
                      {order.product_name}
                    </div>

                    <div className="text-gray-400 text-sm mt-1">
                      {order.broadcast_name || "방송"}
                    </div>
                  </div>

                  {isCanceled ? (
                    <div className="bg-red-700 px-3 py-2 rounded-xl font-bold">
                      주문취소
                    </div>
                  ) : (
                    <div className="bg-green-700 px-3 py-2 rounded-xl font-bold">
                      주문진행
                    </div>
                  )}
                </div>

                <div className="bg-black rounded-2xl border border-zinc-700 overflow-hidden">
                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      색상
                    </div>
                    <div className="p-3">
                      {order.color}
                    </div>
                  </div>

                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      사이즈
                    </div>
                    <div className="p-3">
                      {order.size}
                    </div>
                  </div>

                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      주문수량
                    </div>
                    <div className="p-3">
                      {order.qty}개
                    </div>
                  </div>

                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      결제방식
                    </div>
                    <div className="p-3">
                      {order.payment_method}
                    </div>
                  </div>

                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      관리자확인
                    </div>

                    <div
                      className={`p-3 font-bold ${
                        order.admin_status ===
                        "관리자 확인 완료"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {order.admin_status}
                    </div>
                  </div>

                  <div className="grid grid-cols-[110px_1fr]">
                    <div className="p-3 text-gray-400 bg-zinc-950">
                      최종금액
                    </div>

                    <div className="p-3 text-yellow-400 text-xl font-bold">
                      {formatWon(order.total_price)}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-gray-500 mt-4">
                  주문시간 :
                  {" "}
                  {new Date(order.created_at).toLocaleString(
                    "ko-KR"
                  )}
                </div>
              </div>
            );
          })}

          {!loading && orders.length === 0 && (
            <div className="bg-zinc-900 rounded-2xl p-10 text-center text-gray-400">
              조회된 주문내역이 없습니다.
            </div>
          )}

          {loading && (
            <div className="bg-zinc-900 rounded-2xl p-10 text-center">
              주문내역 조회중...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}