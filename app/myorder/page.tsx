"use client";

import { getCustomerOrderStatusLabel } from "@/lib/admin-v2/statusDisplay";

// app/myorder/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/myorder/page.tsx
//
// 주문조회 v8
// - PIN/주문비밀번호 제거
// - 이름 + 전화번호로 최근 7일 주문조회
// - 고객 페이지 퍼가기 방지 유지

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import MyOrderPageHero from "@/components/myorder/MyOrderPageHero";
import MyOrderBankAccountCard from "@/components/myorder/MyOrderBankAccountCard";
import MyOrderLookupForm from "@/components/myorder/MyOrderLookupForm";
import MyOrderResultCard from "@/components/myorder/MyOrderResultCard";
import MyOrderEmptyState from "@/components/myorder/MyOrderEmptyState";
import MyOrderPagination from "@/components/myorder/MyOrderPagination";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";
const BANK_NAME = "새마을금고";
const BANK_ACCOUNT = "9002186993725";
const BANK_HOLDER = "유혜원";

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
  const manageStatus = String(order.order_manage_status || order.admin_order_status_v2 || "");
  const refundType = String(order.refund_type || "");

  if (manageStatus === "환불" && refundType === "부분환불") return "부분환불";
  if (manageStatus === "환불") return "환불완료";

  return getCustomerOrderStatusLabel(manageStatus || order.order_status);
}

function getStatusClassName(label: string) {
  if (label === "주문서 취소") return "bg-red-100 text-red-700";
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
  const [orderPage, setOrderPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [hasCustomerInfo, setHasCustomerInfo] = useState(false);

  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem("ruru_customer_name") || "";
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";

    if (savedName) setCustomerName(savedName);
    if (savedPhone) setPhone(savedPhone);

    if (savedName && savedPhone) {
      setHasCustomerInfo(true);

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
    setHasCustomerInfo(true);

    setOrders(data || []);
    setOrderPage(1);
    setLoading(false);
  };



  const isLoggedIn = hasCustomerInfo;

  const copyBankAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1800);
    } catch {
      alert(BANK_ACCOUNT);
    }
  };

  const ORDERS_PER_PAGE = 2;
  const totalOrderPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const visibleOrders = orders.slice(
    (safeOrderPage - 1) * ORDERS_PER_PAGE,
    safeOrderPage * ORDERS_PER_PAGE
  );


  return (
    <main
      className="min-h-screen select-none bg-[#f5f8ff] px-4 py-6 text-[#151923]"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-md">
        <CustomerTopNav />

        <MyOrderPageHero isLoggedIn={isLoggedIn} customerName={customerName} />

        {isLoggedIn && (
          <MyOrderBankAccountCard
            bankName={BANK_NAME}
            bankAccount={BANK_ACCOUNT}
            bankHolder={BANK_HOLDER}
            copyDone={copyDone}
            onCopy={copyBankAccount}
          />
        )}

        {!isLoggedIn && (
          <MyOrderLookupForm
            customerName={customerName}
            formattedPhone={formatPhone(phone)}
            loading={loading}
            onNameChange={setCustomerName}
            onPhoneChange={(value) => setPhone(normalizePhone(value))}
            onSubmit={() => loadOrders()}
          />
        )}


        {searched && orders.length === 0 && <MyOrderEmptyState />}

        {orders.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[24px] font-black tracking-[-0.07em] text-[#151923]">
                최근 주문내역
              </h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[12px] font-black text-blue-700 ring-1 ring-blue-100">
                최근 7일
              </span>
            </div>

            <div className="grid gap-4">
              {visibleOrders.map((order) => {
                const label = getCustomerStatusLabel(order);
                const optionText = [cleanOption(order.color), cleanOption(order.size)]
                  .filter(Boolean)
                  .join(" / ");

                return (
                  <MyOrderResultCard
                    key={order.id}
                    order={order}
                    label={label}
                    statusClassName={getStatusClassName(label)}
                    optionText={optionText}
                    formattedDate={formatDate(order.created_at)}
                    amountText={won(order.adjusted_total_price || order.total_price || 0)}
                  />
                );
              })}

                <MyOrderPagination
                  page={safeOrderPage}
                  totalPages={totalOrderPages}
                  onPageChange={setOrderPage}
                />
            </div>
          </section>
        )}

        <footer className="mt-8 border-t border-[#ead8c8] pt-5 text-center text-xs font-bold text-[#9b8d82]">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
