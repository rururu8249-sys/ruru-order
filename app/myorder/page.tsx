// app/myorder/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 긴급 수정:
// - customers.phone 컬럼 사용 안 함
// - customers.customer_phone만 사용
// - 기존 고객DB가 없어도 최근 7일 주문이 있으면 입력한 PIN으로 고객DB 자동 생성
// - 이후부터 전화번호 + PIN으로 주문조회 가능
// - orders는 customer_phone / phone 둘 다 조회

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const normalizePhone = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const won = (value: any) =>
  `${Number(value || 0).toLocaleString()}원`;

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

function cleanOption(value: any) {
  const text = String(value || "").trim();

  if (!text) return "";
  if (["없음", "없슴", "x", "X", "-", "none", "None", "NONE"].includes(text)) {
    return "";
  }

  return text;
}

function getCustomerStatusLabel(order: any) {
  const manageStatus = String(order.order_manage_status || "");
  const refundType = String(order.refund_type || "");

  if (manageStatus === "주문서취소") return "주문취소";
  if (manageStatus === "환불" && refundType === "부분환불") return "부분환불";
  if (manageStatus === "환불") return "환불완료";
  if (manageStatus === "출고완료") return "배송출발";
  if (manageStatus === "출고대기") return "출고준비중";
  if (manageStatus === "주문확인완료") return "확인완료";

  return "주문접수";
}

function getStatusClassName(label: string) {
  if (label === "주문취소") return "bg-red-100 text-red-700";
  if (label === "환불완료") return "bg-gray-200 text-gray-800";
  if (label === "부분환불") return "bg-orange-100 text-orange-700";
  if (label === "배송출발") return "bg-green-100 text-green-700";
  if (label === "출고준비중") return "bg-yellow-100 text-yellow-700";
  if (label === "확인완료") return "bg-blue-100 text-blue-700";

  return "bg-gray-100 text-gray-700";
}

export default function MyOrderPage() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";
    const savedNickname = localStorage.getItem("ruru_youtube_nickname") || "";

    if (savedPhone) {
      setPhone(savedPhone);
      setAutoLoggedIn(true);
      autoSearchOrders(savedPhone);
    }
  }, []);

  const autoSearchOrders = async (savedPhone: string) => {
    const cleanPhone = normalizePhone(savedPhone);

    if (cleanPhone.length < 10) return;

    setLoading(true);
    setOrders([]);
    setMessage("");

    try {
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

  const logoutCustomerInfo = () => {
    if (!confirm("저장된 고객정보를 이 기기에서 삭제할까요?")) return;

    [
      "ruru_customer_phone",
      "ruru_youtube_nickname",
      "ruru_customer_name",
      "ruru_customer_zipcode",
      "ruru_customer_address",
      "ruru_customer_detail_address",
      "ruru_auto_save_info",
    ].forEach((key) => localStorage.removeItem(key));

    setPhone("");
    setPin("");
    setOrders([]);
    setMessage("");
    setAutoLoggedIn(false);
    alert("저장된 고객정보를 삭제했습니다.");
  };

  const searchOrders = async () => {
    const cleanPhone = normalizePhone(phone);

    if (cleanPhone.length < 10) {
      alert("전화번호를 입력해주세요.");
      return;
    }

    if (!/^[0-9]{6}$/.test(pin)) {
      alert("PIN번호 6자리를 입력해주세요.");
      return;
    }

    setLoading(true);
    setOrders([]);
    setMessage("");

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .or(`customer_phone.eq.${cleanPhone},phone.eq.${cleanPhone}`)
        .gte("created_at", sevenDaysAgo.toISOString())
        .neq("is_permanently_deleted", true)
        .order("created_at", { ascending: false });

      if (orderError) throw orderError;

      if (!orderData || orderData.length === 0) {
        setMessage("최근 7일간 주문내역이 없습니다.");
        setLoading(false);
        return;
      }

      const { data: customerRows, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_phone", cleanPhone)
        .limit(1);

      if (customerError) throw customerError;

      const customer = customerRows?.[0] || null;
      const pinHash = await makePinHash(cleanPhone, pin);

      if (customer?.pin_hash || customer?.temp_pin_hash) {
        if (pinHash !== customer.pin_hash && pinHash !== customer.temp_pin_hash) {
          setMessage("전화번호 또는 PIN번호가 일치하지 않습니다.");
          setLoading(false);
          return;
        }
      } else {
        const firstOrder = orderData[0] || {};

        const { error: upsertError } = await supabase.from("customers").upsert(
          {
            youtube_nickname: firstOrder.youtube_nickname || "",
            customer_name: firstOrder.customer_name || "",
            customer_phone: cleanPhone,
            zipcode: firstOrder.zipcode || "",
            address: firstOrder.address || "",
            detail_address: firstOrder.detail_address || "",
            request_memo: firstOrder.request_memo || "",
            pin_hash: pinHash,
            pin_updated_at: new Date().toISOString(),
            last_order_at: firstOrder.created_at || new Date().toISOString(),
          },
          { onConflict: "customer_phone" }
        );

        if (upsertError) throw upsertError;
      }

      setOrders(orderData);
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
          {autoLoggedIn ? (
            <div className="grid gap-3">
              <div className="rounded-2xl bg-green-50 p-4">
                <div className="text-sm font-black text-green-700">
                  저장된 고객정보로 주문내역을 불러왔습니다.
                </div>
                <div className="mt-1 text-xs font-bold text-green-600">
                  전화번호: {phone}
                </div>
              </div>

              <button
                type="button"
                onClick={() => autoSearchOrders(phone)}
                disabled={loading}
                className="rounded-2xl bg-gray-950 p-4 font-black text-white disabled:opacity-50"
              >
                {loading ? "조회 중..." : "주문내역 새로고침"}
              </button>

              <button
                type="button"
                onClick={logoutCustomerInfo}
                className="rounded-2xl bg-gray-100 p-4 font-black text-gray-700"
              >
                로그아웃
              </button>
            </div>
          ) : (
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
                  onChange={(e) =>
                    setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                  }
                  placeholder="PIN번호(개인비밀번호)"
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
                📌 PIN번호(개인비밀번호)는 주문 및 주문조회 시 필요한 비밀번호입니다.
                <br />
                분실 시 재설정이 필요하니 꼭 기억해주세요.
              </div>
            </div>
          )}
        </section>

        {message && (
          <div className="mt-4 rounded-2xl bg-white p-4 text-center text-sm font-black text-gray-500 shadow-sm">
            {message}
          </div>
        )}

        <section className="mt-4 grid gap-3">
          {orders.map((order) => {
            const statusLabel = getCustomerStatusLabel(order);
            const optionText = [cleanOption(order.color), cleanOption(order.size)]
              .filter(Boolean)
              .join(" / ");

            return (
              <article
                key={order.id}
                className={`rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm ${
                  statusLabel === "주문취소" ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-gray-400">
                      {formatDate(order.created_at)}
                    </div>

                    <div
                      className={`mt-1 text-lg font-black ${
                        statusLabel === "주문취소" ? "line-through text-gray-400" : ""
                      }`}
                    >
                      {order.product_name || "상품명 없음"}
                    </div>

                    <div className="mt-1 text-sm font-bold text-gray-500">
                      {optionText}
                      {order.qty ? `${optionText ? " · " : ""}${order.qty}개` : ""}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${getStatusClassName(
                      statusLabel
                    )}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <span className="text-sm font-bold text-gray-500">결제금액</span>
                  <span
                    className={`text-xl font-black ${
                      statusLabel === "주문취소" ? "line-through text-gray-400" : ""
                    }`}
                  >
                    {won(order.adjusted_total_price || order.total_price)}
                  </span>
                </div>

                {order.cancel_reason && (
                  <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-600">
                    취소 사유: {order.cancel_reason}
                  </div>
                )}

                {order.request_memo && (
                  <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm font-bold text-gray-600">
                    요청사항: {order.request_memo}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <footer className="py-8 text-center text-[11px] font-bold text-gray-400">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
