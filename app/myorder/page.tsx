"use client";

// app/myorder/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 기능 유지:
// - customers.phone 컬럼 사용 안 함
// - customers.customer_phone만 사용
// - 기존 고객DB가 없어도 최근 7일 주문이 있으면 입력한 PIN으로 고객DB 자동 생성
// - 이후부터 전화번호 + PIN으로 주문조회 가능
// - orders는 customer_phone / phone 둘 다 조회
//
// 디자인 변경:
// - 홈화면 리뉴얼 톤에 맞춘 모바일 우선 핑크/화이트 카드형 UI
// - 기존 주문조회 로직은 유지

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const normalizePhone = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

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


const blockCustomerCopyEvents = () => {
  const block = (event: Event) => event.preventDefault();

  const blockKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const isMac = event.metaKey;
    const isWin = event.ctrlKey;

    if (
      event.key === "F12" ||
      ((isWin || isMac) && ["c", "x", "u"].includes(key)) ||
      (isWin && event.shiftKey && ["i", "j"].includes(key)) ||
      (isMac && event.altKey && ["i", "j"].includes(key))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", block);
  document.addEventListener("keydown", blockKey);

  return () => {
    document.removeEventListener("contextmenu", block);
    document.removeEventListener("copy", block);
    document.removeEventListener("cut", block);
    document.removeEventListener("dragstart", block);
    document.removeEventListener("selectstart", block);
    document.removeEventListener("keydown", blockKey);
  };
};

export default function MyOrderPage() {
  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";

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


  const TopCustomerNav = () => (
    <div className="sticky top-3 z-30 mb-4 flex items-center justify-between gap-3 rounded-full border border-[#f4e7e9] bg-white/95 p-2 shadow-[0_12px_30px_rgba(30,20,20,0.08)] backdrop-blur">
      <Link
        href="/"
        className="flex min-h-[44px] items-center justify-center rounded-full bg-[#fff2f4] px-4 text-[14px] font-black text-[#ff4b60] transition active:scale-[0.97]"
      >
        🏠 HOME
      </Link>

      <button
        type="button"
        onClick={logoutCustomerInfo}
        className="flex min-h-[44px] items-center justify-center rounded-full bg-[#f5f2f2] px-4 text-[14px] font-black text-[#5f5555] transition active:scale-[0.97]"
      >
        로그아웃
      </button>
    </div>
  );

  return (
    <main className="min-h-screen select-none bg-[#fffafa] px-4 py-6 text-[#171717]" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <section className="mx-auto w-full max-w-[480px]">
        <TopCustomerNav />
        <header className="mb-5 rounded-[32px] border border-[#f4e7e9] bg-white px-5 py-6 text-center shadow-[0_16px_40px_rgba(30,20,20,0.06)]">

          <div className="mx-auto inline-flex rounded-full bg-[#fff1a8] px-3 py-1 text-[12px] font-black text-[#2b2416]">
            📦 최근 7일 주문
          </div>

          <h1 className="mt-3 text-[38px] font-black leading-tight tracking-[-0.07em] text-[#151515]">
            주문조회
          </h1>

          <p className="mt-2 text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-[#7b6d6d]">
            전화번호와 PIN번호로 최근 7일 주문내역을 확인합니다.
          </p>
        </header>

        <section className="rounded-[32px] border border-[#f4e7e9] bg-white p-5 shadow-[0_18px_45px_rgba(255,120,160,0.13)]">
          {autoLoggedIn ? (
            <div className="grid gap-3">
              <div className="rounded-[24px] bg-[#ecfff3] p-4">
                <div className="text-[14px] font-black text-green-700">
                  저장된 고객정보로 주문내역을 불러왔습니다.
                </div>
                <div className="mt-1 text-[12px] font-bold text-green-600">
                  전화번호: {phone}
                </div>
              </div>

              <button
                type="button"
                onClick={() => autoSearchOrders(phone)}
                disabled={loading}
                className="rounded-[22px] bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a] p-4 text-[16px] font-black text-white shadow-[0_14px_28px_rgba(255,76,98,0.22)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "조회 중..." : "주문내역 새로고침"}
              </button>

              <button
                type="button"
                onClick={logoutCustomerInfo}
                className="rounded-[22px] bg-[#f5f2f2] p-4 text-[16px] font-black text-[#5f5555] transition active:scale-[0.98]"
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
                className="w-full rounded-[22px] border border-[#eee4e5] bg-[#fffafa] p-4 text-[16px] font-bold outline-none transition placeholder:text-[#b8abab] focus:border-[#ff94a0] focus:bg-white"
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
                  className="w-full rounded-[22px] border border-[#eee4e5] bg-[#fffafa] p-4 pr-16 text-[16px] font-bold outline-none transition placeholder:text-[#b8abab] focus:border-[#ff94a0] focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[#777] shadow-sm transition active:scale-[0.96]"
                >
                  {showPin ? "숨김" : "보기"}
                </button>
              </div>

              <button
                onClick={searchOrders}
                disabled={loading}
                className="rounded-[22px] bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a] p-4 text-[16px] font-black text-white shadow-[0_14px_28px_rgba(255,76,98,0.22)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "조회 중..." : "최근 주문조회"}
              </button>

              <div className="rounded-[22px] bg-[#fff2f4] p-4 text-[12px] font-bold leading-relaxed tracking-[-0.03em] text-[#d7475b]">
                📌 PIN번호(개인비밀번호)는 주문 및 주문조회 시 필요한 비밀번호입니다.
                <br />
                분실 시 재설정이 필요하니 꼭 기억해주세요.
              </div>
            </div>
          )}
        </section>

        {message && (
          <div className="mt-4 rounded-[24px] border border-[#f1ecec] bg-white p-4 text-center text-[14px] font-black text-[#777] shadow-[0_12px_30px_rgba(30,20,20,0.06)]">
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
                className={`rounded-[28px] border border-[#f1ecec] bg-white p-5 shadow-[0_14px_35px_rgba(30,20,20,0.06)] ${
                  statusLabel === "주문취소" ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-black text-[#aaa]">
                      {formatDate(order.created_at)}
                    </div>

                    <div
                      className={`mt-1 break-keep text-[19px] font-black leading-snug tracking-[-0.04em] ${
                        statusLabel === "주문취소"
                          ? "line-through text-gray-400"
                          : "text-[#151515]"
                      }`}
                    >
                      {order.product_name || "상품명 없음"}
                    </div>

                    <div className="mt-1 text-[14px] font-bold text-[#777]">
                      {optionText}
                      {order.qty ? `${optionText ? " · " : ""}${order.qty}개` : ""}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-black ${getStatusClassName(
                      statusLabel
                    )}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#f1ecec] pt-4">
                  <span className="text-[14px] font-bold text-[#777]">결제금액</span>
                  <span
                    className={`text-[22px] font-black ${
                      statusLabel === "주문취소"
                        ? "line-through text-gray-400"
                        : "text-[#151515]"
                    }`}
                  >
                    {won(order.adjusted_total_price || order.total_price)}
                  </span>
                </div>

                {order.cancel_reason && (
                  <div className="mt-3 rounded-[20px] bg-red-50 p-3 text-[14px] font-bold text-red-600">
                    취소 사유: {order.cancel_reason}
                  </div>
                )}

                {order.request_memo && (
                  <div className="mt-3 rounded-[20px] bg-[#f8f5f5] p-3 text-[14px] font-bold text-[#666]">
                    요청사항: {order.request_memo}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <footer className="py-8 text-center text-[11px] font-bold text-[#aaa]">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
