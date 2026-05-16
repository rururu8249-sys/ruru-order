// app/myorder/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 주문번호 조회 제거.
// 전화번호 + PIN번호 6자리로 최근 7일 주문조회.

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const normalizePhone = (value: string) => String(value || "").replace(/[^0-9]/g, "");
const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

async function sha256(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makePinHash(phone: string, pin: string) {
  return sha256(`ruru:${normalizePhone(phone)}:${pin}`);
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyOrderPage() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const searchOrders = async () => {
    const cleanPhone = normalizePhone(phone);

    if (cleanPhone.length < 10) {
      alert("전화번호를 입력해주세요.");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      alert("PIN번호 6자리를 입력해주세요.");
      return;
    }

    setLoading(true);
    setOrders([]);
    setMessage("");

    try {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_phone", cleanPhone)
        .maybeSingle();

      if (customerError) throw customerError;

      if (!customer?.pin_hash) {
        setMessage("등록된 고객정보가 없거나 PIN번호가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }

      const pinHash = await makePinHash(cleanPhone, pin);

      if (pinHash !== customer.pin_hash && pinHash !== customer.temp_pin_hash) {
        setMessage("전화번호 또는 PIN번호가 일치하지 않습니다.");
        setLoading(false);
        return;
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_phone", cleanPhone)
        .gte("created_at", sevenDaysAgo.toISOString())
        .neq("is_permanently_deleted", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setMessage("최근 7일간 주문내역이 없습니다.");
      } else {
        setOrders(data);
      }
    } catch (error: any) {
      alert("주문조회 오류: " + error.message);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#fbf7f8] px-4 py-7 text-gray-950">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-5 text-center">
          <div className="text-sm font-black text-pink-400">RURU ORDER</div>
          <h1 className="mt-1 text-4xl font-black">주문조회</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            전화번호와 PIN번호로 최근 7일 주문내역을 확인합니다.
          </p>
        </header>

        <section className="rounded-[2rem] border border-pink-100 bg-white p-5 shadow-[0_18px_45px_rgba(255,120,160,0.13)]">
          <div className="grid gap-3">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호"
              inputMode="numeric"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <div className="relative">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="PIN번호 6자리"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 pr-14 font-bold outline-none focus:border-pink-300"
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-gray-500"
              >
                {showPin ? "숨김" : "보기"}
              </button>
            </div>

            <button
              onClick={searchOrders}
              disabled={loading}
              className="rounded-2xl bg-gray-950 p-4 font-black text-white disabled:opacity-50"
            >
              {loading ? "조회 중..." : "최근 주문조회"}
            </button>

            <div className="rounded-2xl bg-pink-50 p-3 text-xs font-bold leading-relaxed text-pink-700">
              📌 PIN번호는 주문 및 주문조회 시 필요한 비밀번호입니다.
              <br />
              분실 시 재설정이 필요하니 꼭 기억해주세요.
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-4 rounded-2xl bg-white p-4 text-center text-sm font-black text-gray-500 shadow-sm">
            {message}
          </div>
        )}

        <section className="mt-4 grid gap-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-gray-400">
                    {formatDate(order.created_at)}
                  </div>
                  <div className="mt-1 text-lg font-black">
                    {order.product_name || "상품명 없음"}
                  </div>
                  <div className="mt-1 text-sm font-bold text-gray-500">
                    {[order.color, order.size].filter((v) => v && v !== "없음").join(" / ")}
                    {order.qty ? ` · ${order.qty}개` : ""}
                  </div>
                </div>

                <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
                  {order.order_manage_status || order.order_status || "주문접수"}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <span className="text-sm font-bold text-gray-500">결제금액</span>
                <span className="text-xl font-black">{won(order.adjusted_total_price || order.total_price)}</span>
              </div>

              {order.request_memo && (
                <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm font-bold text-gray-600">
                  요청사항: {order.request_memo}
                </div>
              )}
            </article>
          ))}
        </section>

        <footer className="py-8 text-center text-[11px] font-bold text-gray-400">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
