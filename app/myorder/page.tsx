"use client";

import CustomerToastNotice from "@/components/customer/CustomerToastNotice";

// [㊲] 상태 표시는 lib/customerOrderStatusView 한 곳(주문서 화면 「주문내역」 창과 같은 판정)
import { CUSTOMER_ORDER_FILTERS, myOrderFilterOf, myOrderStatusLabel, type CustomerOrderFilter } from "@/lib/customerOrderStatusView";

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
import {
  CUSTOMER_ORDER_LOOKUP_LIMIT,
  customerOrderLookupSinceIso,
  buildOrderLookupOrFilter,
  orderLookupPhoneValues,
  applyCustomerOrderVisibleWindow,
} from "@/lib/customerOrderLookup";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import CustomerBottomNav from "@/components/customer/CustomerBottomNav";
import MyOrderPageHero from "@/components/myorder/MyOrderPageHero";
import CustomerPaymentGuideBottomSheet from "@/components/customer/CustomerPaymentGuideBottomSheet";
import MyOrderLookupForm from "@/components/myorder/MyOrderLookupForm";
import MyOrderResultCard from "@/components/myorder/MyOrderResultCard";
import MyOrderEmptyState from "@/components/myorder/MyOrderEmptyState";
import MyOrderPagination from "@/components/myorder/MyOrderPagination";
// [2026-09-08] 표시용 입금계좌는 설정 › 상점 정보에서 온다(하드코딩 제거). 못 읽으면 예전 값 그대로.
import { useGuideBank, useShopInfo } from "@/lib/useShopInfo";
import { pendingOrderGuideBank } from "@/lib/shopInfo";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";
// [2026-09-08] BANK_NAME/BANK_ACCOUNT/BANK_HOLDER 는 MyOrderPage 안에서 useShopInfo() 로 받는다.

// [㊲] 「주문취소」 필터 추가 — 취소·환불이 예전엔 입금대기에 섞였다.
const MY_ORDER_FILTERS = CUSTOMER_ORDER_FILTERS;
type MyOrderFilter = "전체" | CustomerOrderFilter;

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

// [㊲] 원래 이 자리 계산을 lib 로 옮김(내용 동일) — 주문서 화면과 같이 쓰려고.
function getCustomerStatusLabel(order: any) {
  return myOrderStatusLabel(order);
}

function getStatusClassName(label: string) {
  if (label === "주문서 취소" || label === "주문서취소" || label === "주문취소") return "bg-red-100 text-red-700";
  if (label === "환불완료") return "bg-gray-200 text-gray-800";
  if (label === "부분환불") return "bg-orange-100 text-orange-700";
  if (label === "배송출발") return "bg-green-100 text-green-700";
  if (label === "출고준비중") return "bg-yellow-100 text-yellow-700";
  if (label === "확인완료") return "bg-coral-100 text-coral-700";

  return "bg-gray-100 text-gray-700";
}

// [㊲] 취소·환불 → 「주문취소」(예전엔 「주문서취소」를 몰라 입금대기로 갔다). 나머지 규칙은 그대로(lib).
function getMyOrderFilterLabel(label: string): MyOrderFilter {
  return myOrderFilterOf(label);
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
  // [2026-09-08] 손님에게 보여주는 입금계좌 — 설정 › 상점 정보. 표시·복사 전용(입금 판정과 무관).
  const shopInfo = useShopInfo();
  // [㉜ 4단계] 주문내역 새 모양 — ?preview=s4 (기본값 UI_PREVIEW_DEFAULTS.s4). ?ui=v1 손님은 예전 그대로. 표시 전용.
  const v2 = useCustomerUiStage("s4");
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
  // [2026-10-23] 「입금 계좌 보기」 = ①입금 기다리는 최근 주문에 기록된 계좌(손님이 실제 안내받은 계좌) ②없으면 설정 「고객별 계좌 노출 방식」 계좌.
  //   예전엔 무조건 기존 계좌라, 노출 방식으로 농협을 골라도 여기만 새마을로 나왔다. 표시·복사 전용(입금 판정과 무관).
  const guideBank = useGuideBank();
  const GUIDE_BANK = { id: "primary" as const, bankName: guideBank?.bankName || shopInfo.bankName, bankAccount: guideBank?.bankAccount || shopInfo.bankAccount, bankHolder: guideBank?.bankHolder || shopInfo.bankHolder };
  const shownBank = pendingOrderGuideBank(orders, GUIDE_BANK, (o) => myOrderFilterOf(myOrderStatusLabel(o)) === "입금대기", guideBank?.accepted);
  const BANK_NAME = shownBank.bankName;
  const BANK_ACCOUNT = shownBank.bankAccount;
  const BANK_HOLDER = shownBank.bankHolder;
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

    if (cleanPhone.length < 9) {
      showCustomerNotice("전화번호를 정확히 입력해주세요.");
      return;
    }

    setLoading(true);
    setSearched(true);

    // [2026-08-29] 조회 기간을 7일 → CUSTOMER_ORDER_LOOKUP_DAYS 로. 사유는 lib/customerOrderLookup.ts 참고.
    //   (해외원정방송은 배송에 2~3주가 걸리는데 7일이 지나면 주문내역이 화면에서 사라졌다)
    // 카카오 정체성(안 바뀌는 값). 관리자가 전화/이름/주소를 수정해도 이 값으로 조회하면 주문이 안 사라진다.
    const rawKakaoId =
      typeof window !== "undefined"
        ? (localStorage.getItem("ruru_kakao_id") || "").trim()
        : "";
    const orFilter = buildOrderLookupOrFilter(rawKakaoId, cleanPhone);

    let query = supabase
      .from("orders")
      .select("*")
      .gte("created_at", customerOrderLookupSinceIso());

    if (orFilter) {
      // 카카오 로그인: kakao_id 일치(주문에 찍힌 것) OR 옛 주문(kakao_id 없음)은 전화번호로 폴백 → 누락 없이 둘 다.
      query = query.or(orFilter);
    } else {
      // 카카오 정체성이 없으면(레거시/비카카오) 번호로 — 모든 저장형식(숫자/하이픈)으로 찾는다.
      query = query.in("customer_phone", orderLookupPhoneValues(cleanPhone));
      if (useLegacyNameFilter) {
        query = query.eq("customer_name", name);
      }
    }

    // [2026-08-29] 기간을 늘린 만큼 상한을 둔다(기존에는 상한이 아예 없었다).
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(CUSTOMER_ORDER_LOOKUP_LIMIT);

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

    setOrders(await applyCustomerOrderVisibleWindow(supabase, data || [])); // [㊿] 14일(해외배송 주문서 30일)만 보이게
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

  const ORDERS_PER_PAGE = v2 ? 10 : 2; // [㉜ 4단계] 새 모양 10건 — 조회 쿼리·필터 무변경(화면 나누기만)
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

  const allOrdersCanceled =
    orders.length > 0 && orders.every((order) => getMyOrderFilterLabel(getCustomerStatusLabel(order)) === "주문취소");

  const depositNickname =
    String(orders[0]?.youtube_nickname || "").trim() ||
    String(orders[0]?.nickname || "").trim() ||
    String(customerNickname || "").trim() ||
    String(customerName || "").trim();


  return (
    <main
      className={v2 ? "min-h-screen select-none bg-white px-4 py-4 text-[#111111] sm:py-6" : "min-h-screen select-none bg-[#F6F4F2] px-3 py-4 text-[#151923] sm:px-4 sm:py-6"}
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
        <CustomerTopNav activeTab="myorder" variant="compact" bottomNav />

        <MyOrderPageHero isLoggedIn={isLoggedIn} customerName={customerName} />

        {/* [㊲] 주문이 전부 취소·환불이면 「입금 계좌 보기」 숨김(낼 돈이 없는데 계좌를 보여주지 않게) */}
        {isLoggedIn && !allOrdersCanceled && (
          <section
            data-ruru-myorder-payment-guide-button="shell-v1"
            className={v2 ? "mt-3 rounded-[8px] bg-[#F5F5F5] p-4" : "mt-3 rounded-[20px] bg-white p-3 ring-1 ring-slate-200"}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={v2 ? "text-[14px] font-bold text-[#111111]" : "text-[12px] font-black tracking-[-0.04em] text-coral-700"}>
                  입금계좌
                </p>
                <p className={v2 ? "mt-0.5 break-keep text-[14px] font-normal leading-relaxed text-[#707072]" : "mt-0.5 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600"}>
                  계좌정보는 필요할 때만 확인할 수 있어요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentGuideOpen(true)}
                className={v2 ? "shrink-0 min-h-[44px] rounded-full bg-[#111111] px-5 text-[15px] font-semibold text-white transition active:scale-[0.97]" : "shrink-0 rounded-[16px] bg-coral-600 px-4 py-3 text-[13px] font-black tracking-[-0.04em] text-white shadow-[0_10px_22px_rgba(216,90,48,0.20)] transition active:scale-[0.98]"}
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
          <section className={v2 ? "mt-4 rounded-[8px] bg-[#F5F5F5] p-5 text-center" : "mt-4 rounded-[26px] bg-white p-4 text-center shadow-[0_10px_24px_rgba(30,64,175,0.08)] ring-1 ring-coral-100 min-[390px]:rounded-[28px] min-[390px]:p-5"}>
            <h2 className={v2 ? "text-[22px] font-bold text-[#111111]" : "text-[22px] font-black tracking-[-0.06em] text-[#151923]"}>
              카카오 간편주문 후 조회 가능
            </h2>
            <p className={v2 ? "mt-2 break-keep text-[15px] font-normal leading-relaxed text-[#39393B]" : "mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600"}>
              주문조회는 카카오 간편주문에 저장된 전화번호 기준으로 확인됩니다.
            </p>
            <Link
              href="/"
              className={v2 ? "mt-4 flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#111111] px-4 text-[16px] font-semibold text-white transition active:scale-[0.97]" : "mt-4 flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-coral-600 px-4 py-3 text-[16px] font-black text-white shadow-[0_12px_26px_rgba(216,90,48,0.22)] transition active:scale-[0.98]"}
            >
              카카오톡으로 간편 주문 시작
            </Link>
          </section>
        )}


        {searched && !loading && orders.length === 0 && <MyOrderEmptyState />}

        {orders.length > 0 && (
          <section
            data-ruru-myorder-list="shell-v2"
            className="mt-4"
          >
            <div className={v2 ? "mb-3 border-b border-[#E5E5E5] pb-4" : "mb-3 rounded-[20px] bg-white p-3 ring-1 ring-slate-200"}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {v2 ? null : (
                  <p className="text-[12px] font-black tracking-[-0.04em] text-coral-700">
                    주문내역
                  </p>
                  )}
                  <h2 className={v2 ? "text-[20px] font-bold leading-tight text-[#111111]" : "mt-0.5 text-[20px] font-black leading-tight tracking-[-0.06em] text-slate-950"}>
                    최근 주문내역
                  </h2>
                </div>

                <span className={v2 ? "shrink-0 rounded-full border border-[#CACACB] bg-white px-3 py-1 text-[13px] font-semibold text-[#39393B]" : "shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100"}>
                  {filteredOrders.length}/{orders.length}건
                </span>
              </div>

              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {MY_ORDER_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setOrderFilter(filter);
                      setOrderPage(1);
                    }}
                    className={
                      v2
                        ? orderFilter === filter
                          ? "min-h-[44px] rounded-full bg-[#111111] px-0 text-[13px] font-semibold whitespace-nowrap text-white transition active:scale-[0.97]"
                          : "min-h-[44px] rounded-full border border-[#CACACB] bg-white px-0 text-[13px] font-semibold whitespace-nowrap text-[#111111] transition active:scale-[0.97]"
                        : orderFilter === filter
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
              <div className={v2 ? "rounded-[8px] bg-[#F5F5F5] p-5 text-center" : "rounded-[20px] bg-white p-4 text-center ring-1 ring-slate-200"}>
                <p className={v2 ? "text-[15px] font-normal text-[#39393B]" : "text-[14px] font-black tracking-[-0.04em] text-slate-700"}>
                  선택한 상태의 주문내역이 없습니다.
                </p>
              </div>
            )}
          </section>
        )}

        <footer className={v2 ? "mt-8 border-t border-[#E5E5E5] pt-5 text-center text-[13px] font-normal text-[#707072]" : "mt-8 border-t border-[#ead8c8] pt-5 text-center text-xs font-bold text-[#9b8d82]"}>
          <div className="mb-2">
            <a href="/terms" className="underline underline-offset-2">이용약관</a>
            <span aria-hidden="true"> · </span>
            <a href="/privacy" className="underline underline-offset-2">개인정보처리방침</a>
          </div>
          {FOOTER_TEXT}
        </footer>
        {/* [㊾] 아래 5칸 메뉴에 안 가리게(새 모양만 — 옛 화면엔 아래 메뉴 없음) */}
        {v2 ? <div aria-hidden="true" style={{ height: "calc(84px + env(safe-area-inset-bottom))" }} /> : null}
      </section>
      <CustomerBottomNav active="orders" />
    </main>
  );
}
