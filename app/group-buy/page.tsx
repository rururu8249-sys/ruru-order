// app/group-buy/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/group-buy/page.tsx
//
// 공구상품 내부 주문 UX 정리본
// - /order 이동 없음
// - 상품카드 → 사진보러가기 → 바로주문 → 페이지 안에서 주문폼 펼침
// - 주문서 작성 페이지와 같은 톤/문구/입력 UX 적용
// - 저장된 고객정보가 있으면 불필요한 입력영역 숨김
// - 배송: 일반배송=방송상품+합배송 가능 공구상품, 업체배송=별도배송
// - 관리자 products 테이블에서 공구상품/판매중 상품 자동 노출
// - 주문서작성과 동일한 결제방식 UI/UX 적용
// - 공구상품 로그인 정보를 주문서작성 localStorage와 동기화

"use client";

import {
  CUSTOMER_SESSION_VERSION_KEY,
  YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY,
  clearLegacyCustomerSessionIfNeeded,
  isCustomerSessionVersionCurrent,
  isYoutubeNicknameConfirmVersionCurrent,
} from "@/lib/customer/customerSession";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import CommonCustomerTopNav from "@/components/customer/CustomerTopNav";
import { useEffect, useMemo, useState } from "react";
import GroupBuyPageHero from "@/components/group-buy/GroupBuyPageHero";
import GroupBuyDeliveryNotice from "@/components/group-buy/GroupBuyDeliveryNotice";

declare global {
  interface Window {
    daum?: any;
  }
}

type GroupProduct = {
  id: string | number;
  product_name: string;
  description: string;
  price: number;
  stock: number;
  shipping_type: "일반" | "업체";
  combine_shipping: "Y" | "N";
  product_type: "공구상품" | "방송상품";
  external_image_url: string;
  image_url: string;
  status: "판매중" | "품절" | "숨김";
  sort_order: number;
};

type CustomerSession = {
  id?: number;
  youtube_nickname: string;
  customer_name: string;
  customer_phone: string;
  zipcode: string;
  address: string;
  detail_address: string;
};

const NORMAL_SHIPPING_FEE = 4000;
const VENDOR_SHIPPING_FEE = 4000;
const BANK_NAME = "새마을금고";
const BANK_ACCOUNT = "9002186993725";
const BANK_HOLDER = "유혜원";
const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const CARD_RATE_FOR_CUSTOMER = 10;

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

const onlyNumber = (value: string) => String(value || "").replace(/[^0-9]/g, "");
const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

const normalizeName = (value: string) =>
  String(value || "")
    .replace(/\s/g, "")
    .replace(/[(){}\[\],.·ㆍ\-_/]/g, "")
    .toLowerCase();

const formatPhone = (value: string) => {
  const numbers = onlyNumber(value);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

const maskName = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= 1) return `${text}*`;
  if (text.length === 2) return `${text[0]}*`;
  return `${text[0]}${"*".repeat(Math.max(1, text.length - 2))}${text[text.length - 1]}`;
};

const maskNickname = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= 1) return `${text}*`;
  return `${text[0]}${"*".repeat(Math.min(2, text.length - 1))}`;
};

const maskPhone = (value: string) => {
  const numbers = onlyNumber(value);
  if (numbers.length >= 11) return `${numbers.slice(0, 3)}-****-${numbers.slice(7, 11)}`;
  if (numbers.length >= 7) return `${numbers.slice(0, 3)}-****`;
  return formatPhone(numbers);
};

const maskAddress = (base: string, detail: string) => {
  const full = `${String(base || "").trim()} ${String(detail || "").trim()}`.trim();
  if (!full) return "-";

  const parts = full.split(/\s+/);
  if (parts.length <= 2) return `${parts[0] || ""} ***`.trim();

  const last = parts[parts.length - 1] || "";
  const maskedLast = last.length <= 1 ? "*" : `${last[0]}${"*".repeat(Math.min(3, last.length - 1))}`;

  return [...parts.slice(0, -1), maskedLast].join(" ");
};


const isNormalDeliveryProduct = (product: GroupProduct) => {
  return product.shipping_type === "일반" && product.combine_shipping === "Y";
};

const getProductStockStatus = (product: GroupProduct) => {
  if (product.status === "품절" || Number(product.stock || 0) <= 0) return "품절";
  if (Number(product.stock || 0) <= 3) return "마감임박";
  return "주문가능";
};

const generateLookupCode = () => {
  const date = new Date();
  const yymmdd =
    String(date.getFullYear()).slice(2) +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RURU-${yymmdd}-${random}`;
};

function PressButton({
  children,
  className,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${className} transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function TopCustomerNav({ onEdit, onLogout }: { onEdit: () => void; onLogout: () => void }) {
  return (
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
        <button
          type="button"
          onClick={onEdit}
          className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]"
        >
          정보수정
        </button>
        <span className="text-[#e1d4d5]">/</span>
        <button
          type="button"
          onClick={onLogout}
          className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

function StockBadge({ status }: { status: "주문가능" | "품절" | "마감임박" }) {
  const className =
    status === "품절"
      ? "bg-gray-200 text-gray-700"
      : status === "마감임박"
        ? "bg-orange-100 text-orange-700"
        : "bg-green-100 text-green-700";

  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{status}</span>;
}

function DeliveryBadge({ product }: { product: GroupProduct }) {
  const isNormal = isNormalDeliveryProduct(product);
  const label = isNormal ? "🟢 합배송 가능" : "🔴 별도배송";
  const color = isNormal ? "bg-[#edf8f4] text-[#29916f]" : "bg-[#fff2f4] text-[#ff4b60]";

  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-black ${color}`}>{label}</span>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder: string;
  inputMode?: "text" | "numeric";
  readOnly?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className="w-full rounded-[22px] border border-[#eee4e5] bg-[#fffafa] px-4 py-4 text-[15px] font-bold outline-none transition placeholder:text-[#9ca3af] focus:border-[#ff94a0] focus:bg-white"
    />
  );
}

export default function GroupBuyPage() {
  const [groupProducts, setGroupProducts] = useState<GroupProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [openedProductId, setOpenedProductId] = useState<string | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [showSavedCustomerDetail, setShowSavedCustomerDetail] = useState(false);
  const [showDeliveryGuideDetail, setShowDeliveryGuideDetail] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerMode, setCustomerMode] = useState<"saved" | "load" | "new">("load");

  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("");

  const [nickname, setNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [requestMemo, setRequestMemo] = useState("");

  const [qty, setQty] = useState("1");
  const [optionText, setOptionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState("");
  const [completePaymentMethod, setCompletePaymentMethod] = useState<"무통장입금" | "카드결제">("무통장입금");
  const [completeTotalAmount, setCompleteTotalAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"무통장입금" | "카드결제">("무통장입금");
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    const cleanup = blockCustomerCopyEvents();
    loadGroupProducts();

    const scriptId = "daum-postcode-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      document.body.appendChild(script);
    }

    clearLegacyCustomerSessionIfNeeded();

    const canUseSavedCustomerSession =
      isCustomerSessionVersionCurrent() && isYoutubeNicknameConfirmVersionCurrent();

    const saved = canUseSavedCustomerSession ? localStorage.getItem("ruru_customer_session") : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CustomerSession;
        setSession(parsed);
        fillCustomerForm(parsed);
        setCustomerMode("saved");
      } catch {
        localStorage.removeItem("ruru_customer_session");
      }
    } else {
      const savedPhone = localStorage.getItem("ruru_customer_phone") || "";
      const savedNickname = localStorage.getItem("ruru_youtube_nickname") || "";
      const savedName = localStorage.getItem("ruru_customer_name") || "";
      const savedZipcode = localStorage.getItem("ruru_customer_zipcode") || "";
      const savedAddress = localStorage.getItem("ruru_customer_address") || "";
      const savedDetailAddress = localStorage.getItem("ruru_customer_detail_address") || "";

      if (savedPhone && savedName) {
        const parsed: CustomerSession = {
          youtube_nickname: savedNickname,
          customer_name: savedName,
          customer_phone: savedPhone,
          zipcode: savedZipcode,
          address: savedAddress,
          detail_address: savedDetailAddress,
        };
        setSession(parsed);
        localStorage.setItem("ruru_customer_session", JSON.stringify(parsed));
        fillCustomerForm(parsed);
        setCustomerMode("saved");
      }
    }

    return cleanup;
  }, []);

  const selectedProduct = useMemo(() => {
    return groupProducts.find((product) => String(product.id) === openedProductId) || null;
  }, [groupProducts, openedProductId]);

  const loadGroupProducts = async () => {
    setLoadingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("product_type", "공구상품")
      .eq("status", "판매중")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: false });

    if (error) {
      alert("공구상품 불러오기 실패\n\n" + error.message);
      setLoadingProducts(false);
      return;
    }

    setGroupProducts((data || []) as GroupProduct[]);
    setLoadingProducts(false);
  };

  const productAmount = selectedProduct ? selectedProduct.price * Number(qty || 0) : 0;
  const shippingFee = selectedProduct
    ? isNormalDeliveryProduct(selectedProduct)
      ? NORMAL_SHIPPING_FEE
      : VENDOR_SHIPPING_FEE
    : 0;
  const cardExtra = paymentMethod === "카드결제"
    ? Math.round(productAmount * (CARD_RATE_FOR_CUSTOMER / 100))
    : 0;
  const totalAmount = productAmount + shippingFee + cardExtra;

  const fillCustomerForm = (customer: CustomerSession) => {
    setNickname(customer.youtube_nickname || "");
    setCustomerName(customer.customer_name || "");
    setCustomerPhone(onlyNumber(customer.customer_phone || ""));
    setZipcode(customer.zipcode || "");
    setAddress(customer.address || "");
    setDetailAddress(customer.detail_address || "");
  };

  const saveSession = (customer: CustomerSession) => {
    setSession(customer);
    localStorage.setItem("ruru_customer_session", JSON.stringify(customer));

    localStorage.setItem("ruru_youtube_nickname", customer.youtube_nickname || "");
    localStorage.setItem("ruru_customer_name", customer.customer_name || "");
    localStorage.setItem("ruru_customer_phone", onlyNumber(customer.customer_phone || ""));
    localStorage.setItem("ruru_customer_zipcode", customer.zipcode || "");
    localStorage.setItem("ruru_customer_address", customer.address || "");
    localStorage.setItem("ruru_customer_detail_address", customer.detail_address || "");

    fillCustomerForm(customer);
    setCustomerMode("saved");
  };

  const logout = () => {
    localStorage.removeItem("ruru_customer_session");
    localStorage.removeItem("ruru_customer_phone");
    localStorage.removeItem("ruru_youtube_nickname");
    localStorage.removeItem("ruru_customer_name");
    localStorage.removeItem("ruru_customer_zipcode");
    localStorage.removeItem("ruru_customer_address");
    localStorage.removeItem("ruru_customer_detail_address");
    localStorage.removeItem(CUSTOMER_SESSION_VERSION_KEY);
    localStorage.removeItem(YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY);
    localStorage.removeItem("ruru_kakao_id");
    localStorage.removeItem("ruru_kakao_nickname");

    setSession(null);
    setShowSavedCustomerDetail(false);
    setIsEditingCustomer(false);
    setCustomerMode("load");

    setLoginName("");
    setLoginPhone("");

    setNickname("");
    setCustomerName("");
    setCustomerPhone("");
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");

    alert("로그아웃되었습니다. 오늘도 좋은 하루 보내세요 :)");
  };

  const openAddressSearch = () => {
    if (!window.daum?.Postcode) {
      alert("주소검색을 불러오는 중입니다. 잠시 후 다시 눌러주세요.");
      return;
    }

    new window.daum.Postcode({
      oncomplete: function (data: any) {
        setZipcode(data.zonecode);
        setAddress(data.roadAddress || data.jibunAddress);
      },
    }).open();
  };

  const loadCustomerByNamePhone = async () => {
    const cleanName = String(loginName || "").trim();
    const phone = onlyNumber(loginPhone);

    if (!cleanName) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .eq("customer_name", cleanName)
      .limit(1);

    if (error) {
      alert("고객정보 확인 오류\n\n" + error.message);
      return;
    }

    const customer = data?.[0];
    if (!customer) {
      alert("일치하는 고객정보가 없습니다.\n이름과 전화번호를 확인해주세요.");
      return;
    }

    const nextSession: CustomerSession = {
      id: customer.id,
      youtube_nickname: customer.youtube_nickname || "",
      customer_name: customer.customer_name || "",
      customer_phone: customer.customer_phone || phone,
      zipcode: customer.zipcode || "",
      address: customer.address || "",
      detail_address: customer.detail_address || "",
    };

    saveSession(nextSession);
    setShowSavedCustomerDetail(false);
    setIsEditingCustomer(false);
    alert("확인되었습니다. 바로 주문 가능합니다.");
  };

  const validateCustomerForm = () => {
    const phone = onlyNumber(customerPhone);
    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return false;
    }

    if (!customerName.trim()) {
      alert("주문자 이름을 입력해주세요.");
      return false;
    }

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return false;
    }

    if (!zipcode || !address || !detailAddress.trim()) {
      alert("주소검색 후 상세주소까지 입력해주세요.");
      return false;
    }


    return true;
  };

  const saveCustomerInfo = async () => {
    if (!validateCustomerForm()) return null;

    const phone = onlyNumber(customerPhone);
    const customerData = {
      youtube_nickname: nickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: phone,
      zipcode,
      address,
      detail_address: detailAddress.trim(),
      last_order_at: new Date().toISOString(),
      is_default_address: true,
    };

    const { data: existing, error: findError } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .limit(1);

    if (findError) throw findError;

    const current = existing?.[0];

    if (current) {
      const previousNames =
        normalizeName(current.customer_name || "") !== normalizeName(customerName)
          ? `${current.previous_names || ""} ${current.customer_name || ""}`.trim()
          : current.previous_names || "";

      const previousNicknames =
        normalizeName(current.youtube_nickname || "") !== normalizeName(nickname)
          ? `${current.previous_nicknames || ""} ${current.youtube_nickname || ""}`.trim()
          : current.previous_nicknames || "";

      const { data, error } = await supabase
        .from("customers")
        .update({ ...customerData, previous_names: previousNames, previous_nicknames: previousNicknames })
        .eq("id", current.id)
        .select("*")
        .single();

      if (error) throw error;

      const nextSession: CustomerSession = {
        id: data.id,
        youtube_nickname: data.youtube_nickname || "",
        customer_name: data.customer_name || "",
        customer_phone: data.customer_phone || phone,
        zipcode: data.zipcode || "",
        address: data.address || "",
        detail_address: data.detail_address || "",
      };

      saveSession(nextSession);
      setIsEditingCustomer(false);
      return nextSession;
    }

    const { data, error } = await supabase.from("customers").insert(customerData).select("*").single();
    if (error) throw error;

    const nextSession: CustomerSession = {
      id: data.id,
      youtube_nickname: data.youtube_nickname || "",
      customer_name: data.customer_name || "",
      customer_phone: data.customer_phone || phone,
      zipcode: data.zipcode || "",
      address: data.address || "",
      detail_address: data.detail_address || "",
    };

    saveSession(nextSession);
    setIsEditingCustomer(false);
    return nextSession;
  };

  const submitGroupOrder = async () => {
    if (!selectedProduct) return;

    if (getProductStockStatus(selectedProduct) === "품절") {
      alert("품절 상품은 주문할 수 없습니다.");
      return;
    }

    if (!optionText.trim()) {
      alert("옵션/색상/사이즈를 입력해주세요.\n없으면 '없음'이라고 입력해주세요.");
      return;
    }

    if (!qty || Number(qty) <= 0) {
      alert("수량을 입력해주세요.");
      return;
    }

    if (paymentMethod === "카드결제" && productAmount < 100000) {
      alert("카드결제는 10만원 이상 구매 시 가능합니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const customer = session && !isEditingCustomer ? session : await saveCustomerInfo();
      if (!customer) return;

      const orderGroupId = crypto.randomUUID();
      const orderLookupCode = generateLookupCode();
      const isNormal = isNormalDeliveryProduct(selectedProduct);
      const finalShippingFee = isNormal ? NORMAL_SHIPPING_FEE : VENDOR_SHIPPING_FEE;
      const finalProductAmount = selectedProduct.price * Number(qty);
      const finalCardExtra =
        paymentMethod === "카드결제"
          ? Math.round(finalProductAmount * (CARD_RATE_FOR_CUSTOMER / 100))
          : 0;
      const finalTotal = finalProductAmount + finalShippingFee + finalCardExtra;

      const orderRow = {
        order_group_id: orderGroupId,
        order_lookup_code: orderLookupCode,

        broadcast_id: null,
        broadcast_name: "공구상품",
        broadcast_public_title: "공구상품",
        broadcast_admin_subtitle: isNormal ? "일반배송 공구상품" : "업체배송 공구상품",

        youtube_nickname: customer.youtube_nickname,
        customer_name: customer.customer_name,
        customer_phone: onlyNumber(customer.customer_phone),

        zipcode: customer.zipcode,
        address: customer.address,
        detail_address: customer.detail_address,
        address_type: "공구상품 고객입력",

        customer_match_status: session ? "기존 고객" : "신규/수정 고객",
        customer_match_memo: isNormal
          ? "공구상품 일반배송: 방송상품 및 일반배송 공구상품과 합배송 가능"
          : "공구상품 업체배송: 별도배송 상품",

        request_memo: requestMemo.trim(),
        save_as_default_address: true,

        product_name: selectedProduct.product_name,
        color: optionText.trim() || "없음",
        size: "공구상품",
        qty: Number(qty),
        product_price: selectedProduct.price,

        shipping_fee: finalShippingFee,
        original_shipping_fee: finalShippingFee,
        final_shipping_fee: finalShippingFee,
        adjusted_shipping_fee: finalShippingFee,
        total_price: finalTotal,
        adjusted_total_price: finalTotal,
        adjusted_product_price: finalProductAmount,

        combine_shipping_applied: false,
        combine_shipping_memo: isNormal
          ? "일반배송 상품: 방송상품 + 합배송 가능 공구상품은 배송비 1회 기준"
          : "업체배송 상품: 일반배송과 별도 배송비 발생",

        shipping_status: isNormal ? "일반배송" : "업체배송",
        admin_status: "관리자 확인 전",
        order_status: "주문완료신청",

        payment_method: paymentMethod,
        vat_amount: finalCardExtra,
      };

      const { error } = await supabase.from("orders").insert([orderRow]);
      if (error) throw error;

      setCompleteMessage(`주문완료신청 완료! 주문조회번호: ${orderLookupCode}`);
      setCompletePaymentMethod(paymentMethod);
      setCompleteTotalAmount(finalTotal);
      setQty("1");
      setOptionText("");
      setRequestMemo("");
      setPaymentMethod("무통장입금");
      setOpenedProductId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      alert("주문 저장 실패\n\n" + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyBankAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1800);
    } catch {
      alert(BANK_ACCOUNT);
    }
  };

  const openOrderForm = (productId: string | number) => {
    const nextProductId = String(productId);
    setOpenedProductId((prev) => (prev === nextProductId ? null : nextProductId));
    setCompleteMessage("");
    setQty("1");
    setOptionText("");
    setRequestMemo("");
    setPaymentMethod("무통장입금");
    if (session) {
      setCustomerMode("saved");
      setIsEditingCustomer(false);
    } else {
      setCustomerMode("load");
    }
  };

  return (
    <main
      className="min-h-screen select-none bg-[#f5f8ff] px-4 py-6 text-[#151923]"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-[456px]">
        <CommonCustomerTopNav />

        {completeMessage && (
          <section className="mb-4 rounded-[28px] border border-green-200 bg-green-50 p-5 shadow-sm">
            <div className="text-[18px] font-black text-green-700">✅ {completeMessage}</div>

            <div className="mt-4 rounded-[22px] bg-white p-4">
              <div className="flex items-center justify-between text-[14px] font-bold text-[#5f5555]">
                <span>최종 결제금액</span>
                <span className="text-[22px] font-black text-[#151515]">
                  {won(completeTotalAmount)}
                </span>
              </div>
            </div>

            {completePaymentMethod === "무통장입금" ? (
              <div className="mt-4 rounded-[22px] bg-yellow-50 p-4">
                <div className="text-[14px] font-black text-yellow-700">입금계좌 안내</div>
                <div className="mt-2 text-[13px] font-bold text-yellow-700">{BANK_NAME}</div>
                <div className="mt-1 text-[26px] font-black tracking-[-0.04em] text-[#151515]">
                  {BANK_ACCOUNT}
                </div>
                <div className="mt-1 text-[17px] font-black text-[#151515]">{BANK_HOLDER}</div>

                <button
                  type="button"
                  onClick={copyBankAccount}
                  className="mt-3 w-full rounded-[18px] bg-[#171717] px-4 py-4 text-[14px] font-black text-white transition active:scale-[0.97]"
                >
                  {copyDone ? "✓ 계좌번호가 복사되었습니다" : "계좌번호 복사"}
                </button>

                <p className="mt-3 text-[13px] font-bold leading-relaxed text-yellow-700">
                  입금 후 카톡채널로 입금내역 캡처와 유튜브 닉네임을 남겨주세요.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] bg-blue-50 p-4 text-center">
                <div className="text-[16px] font-black text-blue-700">카드결제 안내</div>
                <p className="mt-2 text-[13px] font-bold leading-relaxed text-blue-700">
                  카드결제는 카톡채널로 문의 주시면 관리자 확인 후 결제 링크를 보내드립니다.
                </p>
                <a
                  href={KAKAO_CHANNEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block rounded-[18px] bg-blue-600 px-4 py-4 text-[14px] font-black text-white transition active:scale-[0.97]"
                >
                  카톡채널 문의하기
                </a>
              </div>
            )}
          </section>
        )}
        <GroupBuyPageHero />

        <GroupBuyDeliveryNotice />

        {loadingProducts ? (
          <section className="rounded-[30px] border border-[#f1ecec] bg-white p-6 text-center shadow-[0_14px_35px_rgba(30,20,20,0.07)]">
            <div className="text-[44px]">⏳</div>
            <h2 className="mt-3 text-[25px] font-black tracking-[-0.055em] text-[#151515]">
              공구상품 불러오는 중
            </h2>
            <p className="mt-3 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
              관리자에 등록된 공구상품을 확인하고 있습니다.
            </p>
          </section>
        ) : groupProducts.length === 0 ? (
          <section className="rounded-[30px] border border-[#f1ecec] bg-white p-6 text-center shadow-[0_14px_35px_rgba(30,20,20,0.07)]">
            <div className="text-[44px]">🛍</div>
            <h2 className="mt-3 text-[25px] font-black tracking-[-0.055em] text-[#151515]">
              공구상품 준비 중
            </h2>
            <p className="mt-3 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
              등록된 공구상품이 아직 없습니다.
              <br />상품이 등록되면 카드형으로 표시됩니다.
            </p>
          </section>
        ) : (
          <section className="grid gap-4">
            {groupProducts.map((product) => {
              const productStockStatus = getProductStockStatus(product);
              const canOrder = productStockStatus !== "품절";
              const isOpened = openedProductId === String(product.id);
              const isNormal = isNormalDeliveryProduct(product);

              return (
                <article
                  key={String(product.id)}
                  className="overflow-hidden rounded-[30px] border border-[#f1ecec] bg-white shadow-[0_14px_35px_rgba(30,20,20,0.07)]"
                >
                  {product.image_url && (
                    <div className="h-[210px] w-full bg-[#fff7f8]">
                      <img
                        src={product.image_url}
                        alt={product.product_name}
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StockBadge status={productStockStatus} />
                      <DeliveryBadge product={product} />
                    </div>

                    <h2 className="break-keep text-[23px] font-black leading-snug tracking-[-0.05em] text-[#151515]">
                      {product.product_name}
                    </h2>

                    <p className="mt-2 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
                      {product.description || "상품 사진 확인 후 주문해주세요."}
                    </p>

                    <div className="mt-4 rounded-[22px] bg-[#fffafa] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-[#777]">상품금액</span>
                        <span className="text-[24px] font-black tracking-[-0.05em] text-[#151515]">
                          {won(product.price)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[13px] font-bold text-[#777]">
                        <span>배송비</span>
                        <span>{isNormal ? won(NORMAL_SHIPPING_FEE) : won(VENDOR_SHIPPING_FEE)}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {product.external_image_url ? (
                        <a
                          href={product.external_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-[20px] bg-[#f5f2f2] px-4 py-4 text-center text-[14px] font-black text-[#5f5555] transition active:scale-[0.97]"
                        >
                          사진보러가기
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="rounded-[20px] bg-[#f5f2f2] px-4 py-4 text-center text-[14px] font-black text-[#aaa]"
                        >
                          사진 준비중
                        </button>
                      )}

                      <PressButton
                        disabled={!canOrder}
                        onClick={() => openOrderForm(product.id)}
                        className={`rounded-[20px] px-4 py-4 text-center text-[14px] font-black text-white ${
                          canOrder
                            ? "bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a]"
                            : "bg-gray-300"
                        }`}
                      >
                        {canOrder ? (isOpened ? "주문닫기" : "바로주문") : "품절"}
                      </PressButton>
                    </div>

                    {isOpened && (
                      <section className="mt-5 rounded-[28px] border border-[#f4e7e9] bg-white p-5 shadow-[0_10px_28px_rgba(20,15,15,0.04)]">
                        <div className="mb-4">
                          <div className="inline-flex rounded-full bg-[#fff1a8] px-3 py-1 text-[12px] font-black text-[#2b2416]">
                            📝 바로주문
                          </div>
                          <h3 className="mt-3 text-[24px] font-black tracking-[-0.055em] text-[#151515]">
                            {product.product_name}
                          </h3>
                          <p className="mt-1 text-[13px] font-bold leading-relaxed text-[#777]">
                            주문서 작성 화면과 같은 방식으로 진행됩니다.
                          </p>
                        </div>

                        <div className="rounded-[24px] bg-[#fff7f8] p-4">
                          <div className="text-[18px] font-black text-[#151515]">
                            주문자 정보
                          </div>

                          {(!session || isEditingCustomer) && (
                            <div className="mt-3 rounded-2xl bg-[#fff1a8] p-3 text-xs font-black leading-relaxed text-[#2b2416]">
                              💡 최초 1회만 입력하면 다음 주문부터 자동 입력됩니다.
                            </div>
                          )}

                          {session && !isEditingCustomer ? (
                            <div className="mt-4 rounded-[22px] bg-green-50 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[14px] font-black text-green-700">
                                  ✅ {session.customer_name || session.youtube_nickname}님 로그인중
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setShowSavedCustomerDetail((value) => !value)}
                                  className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-green-700 transition active:scale-[0.97]"
                                >
                                  {showSavedCustomerDetail ? "내용닫기 ▲" : "내용보기 ▼"}
                                </button>
                              </div>

                              {showSavedCustomerDetail && (
                                <div className="mt-3 rounded-[18px] bg-white p-3 text-[12px] font-bold leading-relaxed text-green-800">
                                  <div>닉네임: {maskNickname(session.youtube_nickname)}</div>
                                  <div>이름: {maskName(session.customer_name)}</div>
                                  <div>전화번호: {maskPhone(session.customer_phone)}</div>
                                  <div>주소: {maskAddress(session.address, session.detail_address)}</div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {isEditingCustomer ? (
                                <div className="mt-4 rounded-[20px] bg-white p-2">
                                  <div className="rounded-[16px] bg-[#ff4b60] px-3 py-3 text-center text-[13px] font-black text-white">
                                    정보수정
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 grid grid-cols-2 gap-2 rounded-[20px] bg-white p-2">
                                  <PressButton
                                    onClick={() => setCustomerMode("load")}
                                    className={`rounded-[16px] px-3 py-3 text-[13px] font-black ${
                                      customerMode === "load"
                                        ? "bg-[#171717] text-white"
                                        : "bg-[#f5f2f2] text-[#5f5555]"
                                    }`}
                                  >
                                    기존 고객
                                  </PressButton>
                                  <PressButton
                                    onClick={() => setCustomerMode("new")}
                                    className={`rounded-[16px] px-3 py-3 text-[13px] font-black ${
                                      customerMode === "new"
                                        ? "bg-[#ff4b60] text-white"
                                        : "bg-[#f5f2f2] text-[#5f5555]"
                                    }`}
                                  >
                                    신규/직접입력
                                  </PressButton>
                                </div>
                              )}

                              {customerMode === "load" && (
                                <div className="mt-4 rounded-[22px] bg-white p-4">
                                  <div className="text-[14px] font-black text-[#315f9f]">
                                    기존 고객 정보 불러오기
                                  </div>
                                  <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#6b7280]">
                                    이름과 전화번호로 저장된 정보를 확인합니다.
                                  </p>
                                  <div className="mt-3 grid gap-3">
                                    <TextInput
                                      value={loginName}
                                      onChange={setLoginName}
                                      placeholder="이름"
                                    />
                                    <TextInput
                                      value={formatPhone(loginPhone)}
                                      onChange={(value) => setLoginPhone(onlyNumber(value))}
                                      placeholder="전화번호"
                                      inputMode="numeric"
                                    />
                                    <PressButton
                                      onClick={loadCustomerByNamePhone}
                                      className="rounded-[20px] bg-[#171717] px-4 py-4 text-[15px] font-black text-white"
                                    >
                                      확인
                                    </PressButton>
                                  </div>
                                </div>
                              )}

                              {customerMode === "new" && (
                                <div className="mt-4 rounded-[22px] bg-white p-4">
                                  <div className="mt-3 grid gap-3">
                                    <TextInput value={nickname} onChange={setNickname} placeholder="유튜브 닉네임" />
                                    <TextInput value={customerName} onChange={setCustomerName} placeholder="이름" />
                                    <TextInput
                                      value={formatPhone(customerPhone)}
                                      onChange={(value) => setCustomerPhone(onlyNumber(value))}
                                      placeholder="전화번호"
                                      inputMode="numeric"
                                    />
                                    <PressButton
                                      onClick={openAddressSearch}
                                      className="rounded-[20px] bg-[#171717] px-4 py-4 text-[15px] font-black text-white"
                                    >
                                      주소검색
                                    </PressButton>
                                    <TextInput value={address} placeholder="기본주소" readOnly />
                                    <TextInput value={detailAddress} onChange={setDetailAddress} placeholder="상세주소 예) 101동 1001호" />
                                    <PressButton
                                      onClick={async () => {
                                        try {
                                          await saveCustomerInfo();
                                          alert("정보가 저장되었습니다.");
                                        } catch (error: any) {
                                          alert("정보 저장 실패\n\n" + error.message);
                                        }
                                      }}
                                      className="rounded-[20px] bg-[#ff4b60] px-4 py-4 text-[15px] font-black text-white"
                                    >
                                      정보저장
                                    </PressButton>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3">
                          <TextInput
                            value={optionText}
                            onChange={setOptionText}
                            placeholder="옵션/색상/사이즈 없으면 없음"
                          />
                          <TextInput
                            value={qty}
                            onChange={(value) => setQty(onlyNumber(value))}
                            placeholder="수량"
                            inputMode="numeric"
                          />
                          <textarea
                            placeholder="배송메모 / 요청사항 선택"
                            value={requestMemo}
                            onChange={(event) => setRequestMemo(event.target.value)}
                            className="min-h-[92px] w-full rounded-[22px] border border-[#eee4e5] bg-[#fffafa] px-4 py-4 text-[15px] font-bold outline-none transition placeholder:text-[#9ca3af] focus:border-[#ff94a0] focus:bg-white"
                          />
                        </div>

                        <div className="mt-4 rounded-[22px] border border-[#eee4e5] bg-white p-4">
                          <div className="text-[16px] font-black text-[#151515]">결제방식</div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod("무통장입금")}
                              className={`rounded-[18px] px-3 py-4 text-[14px] font-black transition active:scale-[0.97] ${
                                paymentMethod === "무통장입금"
                                  ? "bg-[#171717] text-white"
                                  : "bg-[#f5f2f2] text-[#5f5555]"
                              }`}
                            >
                              무통장입금
                            </button>

                            <button
                              type="button"
                              onClick={() => setPaymentMethod("카드결제")}
                              className={`rounded-[18px] px-3 py-4 text-[14px] font-black transition active:scale-[0.97] ${
                                paymentMethod === "카드결제"
                                  ? "bg-blue-600 text-white"
                                  : "bg-[#f5f2f2] text-[#5f5555]"
                              }`}
                            >
                              카드결제
                            </button>
                          </div>

                          {paymentMethod === "무통장입금" ? (
                            <div className="mt-3 rounded-[18px] bg-yellow-50 p-3 text-[12px] font-bold leading-relaxed text-yellow-700">
                              주문완료 후 입금계좌가 안내됩니다.
                            </div>
                          ) : (
                            <div className="mt-3 rounded-[18px] bg-blue-50 p-3 text-[12px] font-bold leading-relaxed text-blue-700">
                              카드결제는 10만원 이상 가능하며, 카드결제 부가세 10%가 추가됩니다.
                              주문완료 후 카톡채널로 결제 링크를 요청해주세요.
                            </div>
                          )}
                        </div>

                        <div className="mt-4 rounded-[22px] bg-[#fffafa] p-4 text-[14px] font-bold text-[#5f5555]">
                          <div className="flex justify-between">
                            <span>상품금액</span>
                            <span>{won(productAmount)}</span>
                          </div>
                          <div className="mt-2 flex justify-between">
                            <span>{isNormal ? "일반배송비" : "업체배송비"}</span>
                            <span>{won(shippingFee)}</span>
                          </div>
                          {paymentMethod === "카드결제" && (
                            <div className="mt-2 flex justify-between text-blue-600">
                              <span>카드결제 부가세 10%</span>
                              <span>{won(cardExtra)}</span>
                            </div>
                          )}
                          <div className="mt-3 flex justify-between border-t border-[#eee5e5] pt-3 text-[20px] font-black text-[#151515]">
                            <span>최종금액</span>
                            <span>{won(totalAmount)}</span>
                          </div>
                        </div>

                        <PressButton
                          disabled={isSubmitting}
                          onClick={submitGroupOrder}
                          className="mt-4 w-full rounded-[22px] bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a] px-4 py-5 text-[18px] font-black text-white shadow-[0_12px_26px_rgba(255,76,98,0.22)]"
                        >
                          {isSubmitting ? "주문 저장중..." : "주문완료신청"}
                        </PressButton>
                      </section>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <footer className="py-8 text-center">
          <p className="text-[15px] font-medium tracking-[-0.04em] text-[#5f5555]">
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className="mx-auto mt-5 h-px w-full bg-[#eee5e5]" />
          <p className="mt-4 text-[12px] text-[#aaa]">
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
