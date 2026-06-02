"use client";

import CustomerToastNotice from "@/components/customer/CustomerToastNotice";

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
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import MyOrderPageHero from "@/components/myorder/MyOrderPageHero";
import CustomerPaymentGuideBottomSheet from "@/components/customer/CustomerPaymentGuideBottomSheet";
import MyOrderLookupForm from "@/components/myorder/MyOrderLookupForm";
import MyOrderResultCard from "@/components/myorder/MyOrderResultCard";
import MyOrderEmptyState from "@/components/myorder/MyOrderEmptyState";
import MyOrderPagination from "@/components/myorder/MyOrderPagination";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";
const BANK_NAME = "새마을금고";
const BANK_ACCOUNT = "9002186993725";
const BANK_HOLDER = "유혜원";

const MY_ORDER_FILTERS = ["전체", "입금대기", "입금확인", "출고완료"] as const;
type MyOrderFilter = (typeof MY_ORDER_FILTERS)[number];

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
  if (label === "확인완료") return "bg-coral-100 text-coral-700";

  return "bg-gray-100 text-gray-700";
}

function getMyOrderFilterLabel(label: string): MyOrderFilter {
  if (label === "배송출발" || label === "출고완료") return "출고완료";

  const paidLabels = [
    "입금확인완료",
    "입금확인",
    "자동입금확인",
    "수동입금확인",
    "확인완료",
    "출고준비중",
    "결제완료",
    "카드결제완료",
  ];

  if (paidLabels.includes(label)) return "입금확인";

  return "입금대기";
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

  const [customerNotice, setCustomerNotice] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  }>({ message: "", type: "info" });

  const showCustomerNotice = (
    message: string,
    type: "info" | "success" | "warning" | "error" = "warning"
  ) => {
    setCustomerNotice({ message, type });
  };

  const closeCustomerNotice = () => {
    setCustomerNotice((current) => ({ ...current, message: "" }));
  };

  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderFilter, setOrderFilter] = useState<MyOrderFilter>("전체");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [nicknameCopyDone, setNicknameCopyDone] = useState(false);
  const [paymentGuideOpen, setPaymentGuideOpen] = useState(false);
  const [customerNickname, setCustomerNickname] = useState("");
  const [hasCustomerInfo, setHasCustomerInfo] = useState(false);

  const [isLegacyMode, setIsLegacyMode] = useState(false);

  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const legacyMode = params.get("legacy") === "1";
    setIsLegacyMode(legacyMode);

    const savedName = localStorage.getItem("ruru_customer_name") || "";
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";
    const savedNickname =
      localStorage.getItem("ruru_youtube_nickname") ||
      localStorage.getItem("ruru_customer_nickname") ||
      "";

    if (savedName) setCustomerName(savedName);
    if (savedPhone) setPhone(savedPhone);
    if (savedNickname) setCustomerNickname(savedNickname);

    if (savedPhone) {
      setHasCustomerInfo(true);

      setTimeout(() => {
        void loadOrders(savedName, savedPhone, legacyMode);
      }, 100);
    }
  }, []);

  const loadOrders = async (
    nameValue = customerName,
    phoneValue = phone,
    legacyOverride?: boolean
  ) => {
    const name = String(nameValue || "").trim();
    const cleanPhone = normalizePhone(phoneValue);

    const useLegacyNameFilter =
      typeof legacyOverride === "boolean" ? legacyOverride : isLegacyMode;

    if (useLegacyNameFilter && !name) {
      showCustomerNotice("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      showCustomerNotice("전화번호를 정확히 입력해주세요.");
      return;
    }

    setLoading(true);
    setSearched(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let query = supabase
      .from("orders")
      .select("*")
      .eq("customer_phone", cleanPhone)
      .gte("created_at", sevenDaysAgo.toISOString());

    if (useLegacyNameFilter) {
      query = query.eq("customer_name", name);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      showCustomerNotice("주문조회 오류: " + error.message, "error");
      return;
    }

    if (name) {
      localStorage.setItem("ruru_customer_name", name);
    }
    localStorage.setItem("ruru_customer_phone", cleanPhone);
    setHasCustomerInfo(true);

    setOrders(data || []);
    setOrderPage(1);
    setOrderFilter("전체");
    setLoading(false);
  };



  const isLoggedIn = hasCustomerInfo;

  const copyBankAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1800);
    } catch {
      showCustomerNotice(BANK_ACCOUNT, "success");
    }
  };

  const copyDepositNickname = async () => {
    const nickname = String(depositNickname || "").trim();

    if (!nickname) {
      showCustomerNotice("복사할 닉네임이 없습니다.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(nickname);
      setNicknameCopyDone(true);
      setTimeout(() => setNicknameCopyDone(false), 1800);
    } catch {
      showCustomerNotice(nickname, "success");
    }
  };

  const ORDERS_PER_PAGE = 2;
  const filteredOrders =
    orderFilter === "전체"
      ? orders
      : orders.filter((order) => {
          const label = getCustomerStatusLabel(order);
          return getMyOrderFilterLabel(label) === orderFilter;
        });
  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const visibleOrders = filteredOrders.slice(
    (safeOrderPage - 1) * ORDERS_PER_PAGE,
    safeOrderPage * ORDERS_PER_PAGE
  );

  const depositNickname =
    String(orders[0]?.youtube_nickname || "").trim() ||
    String(orders[0]?.nickname || "").trim() ||
    String(customerNickname || "").trim() ||
    String(customerName || "").trim();


  return (
    <main
      className="min-h-screen select-none bg-[#fdf5f1] px-3 py-4 text-[#151923] sm:px-4 sm:py-6"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
        <CustomerToastNotice
          open={Boolean(customerNotice.message)}
          type={customerNotice.type}
          message={customerNotice.message}
          onClose={closeCustomerNotice}
        />

        <CustomerPaymentGuideBottomSheet
          open={paymentGuideOpen}
          depositNickname={depositNickname}
          bankName={BANK_NAME}
          bankAccount={BANK_ACCOUNT}
          bankHolder={BANK_HOLDER}
          nicknameCopyDone={nicknameCopyDone}
          bankCopyDone={copyDone}
          onCopyNickname={copyDepositNickname}
          onCopyBankAccount={copyBankAccount}
          onClose={() => setPaymentGuideOpen(false)}
        />

      <section className="mx-auto w-full max-w-md">
        <CustomerTopNav activeTab="myorder" variant="compact" />

        <MyOrderPageHero isLoggedIn={isLoggedIn} customerName={customerName} />

        {isLoggedIn && (
          <section
            data-ruru-myorder-payment-guide-button="shell-v1"
            className="mt-3 rounded-[20px] bg-white p-3 ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-black tracking-[-0.04em] text-coral-700">
                  입금계좌
                </p>
                <p className="mt-0.5 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                  계좌정보는 필요할 때만 확인할 수 있어요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentGuideOpen(true)}
                className="shrink-0 rounded-[16px] bg-coral-600 px-4 py-3 text-[13px] font-black tracking-[-0.04em] text-white shadow-[0_10px_22px_rgba(216,90,48,0.20)] transition active:scale-[0.98]"
              >
                입금 계좌 보기
              </button>
            </div>
          </section>
        )}

        {isLegacyMode && !isLoggedIn && (
          <MyOrderLookupForm
            customerName={customerName}
            formattedPhone={formatPhone(phone)}
            loading={loading}
            onNameChange={setCustomerName}
            onPhoneChange={(value) => setPhone(normalizePhone(value))}
            onSubmit={() => loadOrders()}
          />
        )}

        {!isLegacyMode && !isLoggedIn && (
          <section className="mt-4 rounded-[26px] bg-white p-4 text-center shadow-[0_10px_24px_rgba(30,64,175,0.08)] ring-1 ring-coral-100 min-[390px]:rounded-[28px] min-[390px]:p-5">
            <h2 className="text-[22px] font-black tracking-[-0.06em] text-[#151923]">
              카카오 간편주문 후 조회 가능
            </h2>
            <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              주문조회는 카카오 간편주문에 저장된 전화번호 기준으로 확인됩니다.
            </p>
            <Link
              href="/"
              className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-coral-600 px-4 py-3 text-[16px] font-black text-white shadow-[0_12px_26px_rgba(216,90,48,0.22)] transition active:scale-[0.98]"
            >
              카카오로 간편 주문 시작
            </Link>
          </section>
        )}


        {searched && orders.length === 0 && <MyOrderEmptyState />}

        {orders.length > 0 && (
          <section
            data-ruru-myorder-list="shell-v2"
            className="mt-4"
          >
            <div className="mb-3 rounded-[20px] bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-black tracking-[-0.04em] text-coral-700">
                    주문내역
                  </p>
                  <h2 className="mt-0.5 text-[20px] font-black leading-tight tracking-[-0.06em] text-slate-950">
                    최근 주문내역
                  </h2>
                </div>

                <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100">
                  {filteredOrders.length}/{orders.length}건
                </span>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {MY_ORDER_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setOrderFilter(filter);
                      setOrderPage(1);
                    }}
                    className={
                      orderFilter === filter
                        ? "min-h-[34px] rounded-full bg-coral-700 px-2 text-[11px] font-black tracking-[-0.04em] text-white transition active:scale-[0.98]"
                        : "min-h-[34px] rounded-full bg-slate-50 px-2 text-[11px] font-black tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100 transition active:scale-[0.98]"
                    }
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length > 0 ? (
              <div className="grid gap-2.5">
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
                      amountText={won(order.final_amount ?? order.adjusted_total_price ?? order.total_price ?? 0)}
                    />
                  );
                })}

                <MyOrderPagination
                  page={safeOrderPage}
                  totalPages={totalOrderPages}
                  onPageChange={setOrderPage}
                />
              </div>
            ) : (
              <div className="rounded-[20px] bg-white p-4 text-center ring-1 ring-slate-200">
                <p className="text-[14px] font-black tracking-[-0.04em] text-slate-700">
                  선택한 상태의 주문내역이 없습니다.
                </p>
              </div>
            )}
          </section>
        )}

        <footer className="mt-8 border-t border-[#ead8c8] pt-5 text-center text-xs font-bold text-[#9b8d82]">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
