"use client";

// app/myorder/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 주문조회 v8
// - PIN/주문비밀번호 제거
// - 이름 + 전화번호로 최근 7일 주문조회
// - 고객 페이지 퍼가기 방지 유지

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const normalizePhone = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const formatPhone = (value: string) => {
  const numbers = normalizePhone(value);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

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

  return order.order_status || "주문접수";
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
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem("ruru_customer_name") || "";
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";

    if (savedName) setCustomerName(savedName);
    if (savedPhone) setPhone(savedPhone);

    if (savedName && savedPhone) {
      setTimeout(() => {
        void loadOrders(savedName, savedPhone);
      }, 100);
    }
  }, []);

  const loadOrders = async (nameValue = customerName, phoneValue = phone) => {
    const name = String(nameValue || "").trim();
    const cleanPhone = normalizePhone(phoneValue);

    if (!name) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return;
    }

    setLoading(true);
    setSearched(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_name", name)
      .eq("customer_phone", cleanPhone)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      alert("주문조회 오류: " + error.message);
      return;
    }

    localStorage.setItem("ruru_customer_name", name);
    localStorage.setItem("ruru_customer_phone", cleanPhone);

    setOrders(data || []);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("ruru_customer_name");
    localStorage.removeItem("ruru_customer_phone");
    localStorage.removeItem("ruru_youtube_nickname");
    localStorage.removeItem("ruru_customer_zipcode");
    localStorage.removeItem("ruru_customer_address");
    localStorage.removeItem("ruru_customer_detail_address");
    setCustomerName("");
    setPhone("");
    setOrders([]);
    setSearched(false);
    alert("로그아웃되었습니다. 오늘도 좋은 하루 보내세요 :)");
  };

  return (
    <main
      className="min-h-screen select-none bg-[#fbf7f8] px-4 py-6 text-gray-950"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-md">
        <div className="sticky top-3 z-40 mx-auto mb-4 flex w-full max-w-[456px] items-center justify-between rounded-full border border-[#f3e5e7] bg-white/95 px-4 py-3 shadow-[0_10px_24px_rgba(30,20,20,0.07)] backdrop-blur">
          <Link
            href="/"
            className="shrink-0 text-[14px] font-black tracking-[-0.04em] text-[#ff4b60] transition active:scale-[0.97]"
          >
            🏠 HOME
          </Link>

          <div className="flex items-center gap-2 text-[13px] font-black tracking-[-0.04em] text-[#5f5555]">
            <Link href="/myorder" className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]">
              주문조회
            </Link>
            <span className="text-[#e1d4d5]">/</span>
            <Link href="/order" className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]">
              정보수정
            </Link>
            <span className="text-[#e1d4d5]">/</span>
            <button
              type="button"
              onClick={logout}
              className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]"
            >
              로그아웃
            </button>
          </div>
        </div>

        <header className="mb-5 text-center">
          <div className="text-sm font-black text-pink-400">RURU ORDER</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight">주문조회</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            이름과 전화번호로 최근 7일 주문내역을 확인합니다.
          </p>
        </header>

        <section className="rounded-[2rem] border border-pink-100 bg-white p-5 shadow-[0_18px_45px_rgba(255,120,160,0.13)]">
          <div className="grid gap-3">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="이름"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <input
              value={formatPhone(phone)}
              onChange={(event) => setPhone(normalizePhone(event.target.value))}
              placeholder="전화번호"
              inputMode="numeric"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <button
              type="button"
              onClick={() => loadOrders()}
              disabled={loading}
              className="rounded-2xl bg-gray-950 p-4 font-black text-white transition active:scale-[0.97] disabled:opacity-60"
            >
              {loading ? "조회중..." : "확인"}
            </button>
          </div>
        </section>

        {searched && orders.length === 0 && (
          <section className="mt-4 rounded-[1.5rem] border border-gray-100 bg-white p-5 text-center text-sm font-bold text-gray-500 shadow-sm">
            최근 7일간 주문내역이 없습니다.
          </section>
        )}

        <section className="mt-4 grid gap-4">
          {orders.map((order) => {
            const label = getCustomerStatusLabel(order);
            const optionText = [cleanOption(order.color), cleanOption(order.size)]
              .filter(Boolean)
              .join(" / ");

            return (
              <article
                key={order.id}
                className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-gray-400">
                      {formatDate(order.created_at)}
                    </div>
                    <h2 className="mt-2 text-xl font-black">
                      {order.product_name || "주문상품"}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-gray-500">
                      {optionText || "옵션 없음"} · {order.qty || 1}개
                    </p>
                  </div>

                  <span className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClassName(label)}`}>
                    {label}
                  </span>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-500">결제금액</span>
                    <span className="text-xl font-black">
                      {won(order.adjusted_total_price || order.total_price || 0)}
                    </span>
                  </div>

                  {order.cancel_reason && (
                    <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-600">
                      취소 사유: {order.cancel_reason}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="mt-8 border-t border-gray-200 pt-5 text-center text-xs font-bold text-gray-400">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
