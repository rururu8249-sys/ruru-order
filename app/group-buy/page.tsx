// app/group-buy/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/group-buy/page.tsx
//
// 공구상품 내부 주문 UX 정리본
// - /order 이동 없음
// - 상품카드 → 사진보러가기 → 바로주문 → 페이지 안에서 주문폼 펼침
// - 주문서 작성 페이지와 같은 톤/문구/입력 UX 적용
// - 기존고객: 전화번호 + 주문 비밀번호 6자리로 확인
// - 신규고객: 닉네임/이름/전화번호/주소/배송메모/주문 비밀번호 저장
// - 저장된 고객정보가 있으면 불필요한 입력영역 숨김
// - 배송: 일반배송=방송상품+합배송 가능 공구상품, 업체배송=별도배송

"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    daum?: any;
  }
}

type GroupProduct = {
  id: string;
  productName: string;
  price: number;
  stockStatus: "주문가능" | "품절" | "마감임박";
  deliveryType: "일반배송" | "업체배송" | "합배송불가" | "별도배송";
  canCombineShipping: boolean;
  shortDesc: string;
  photoUrl?: string;
  imageUrl?: string;
  optionPlaceholder?: string;
};

type CustomerSession = {
  id?: number;
  youtube_nickname: string;
  customer_name: string;
  customer_phone: string;
  zipcode: string;
  address: string;
  detail_address: string;
  pin_code: string;
};

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const NORMAL_SHIPPING_FEE = 4000;
const VENDOR_SHIPPING_FEE = 4000;

const groupProducts: GroupProduct[] = [
  {
    id: "test-normal-1",
    productName: "테스트 일반배송 공구상품",
    price: 39000,
    stockStatus: "주문가능",
    deliveryType: "일반배송",
    canCombineShipping: true,
    shortDesc: "방송상품과 합배송 가능한 일반배송 테스트 상품입니다.",
    photoUrl: "https://www.youtube.com/@rururu8249",
    imageUrl: "",
    optionPlaceholder: "색상/사이즈 또는 옵션을 적어주세요",
  },
  {
    id: "test-vendor-1",
    productName: "테스트 업체배송 공구상품",
    price: 59000,
    stockStatus: "주문가능",
    deliveryType: "업체배송",
    canCombineShipping: false,
    shortDesc: "업체에서 따로 출고되는 별도배송 테스트 상품입니다.",
    photoUrl: "https://pf.kakao.com/_RMxaqX",
    imageUrl: "",
    optionPlaceholder: "옵션 없음 또는 수량만 작성",
  },
];

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

const isNormalDeliveryProduct = (product: GroupProduct) => {
  return product.deliveryType === "일반배송" || product.canCombineShipping;
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

function TopCustomerNav({
  hasSession,
  onEdit,
  onLogout,
}: {
  hasSession: boolean;
  onEdit: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="sticky top-3 z-30 mb-4 flex items-center justify-between gap-2 rounded-full border border-[#f4e7e9] bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(30,20,20,0.08)] backdrop-blur">
      <div className="shrink-0 text-[13px] font-black tracking-[-0.04em] text-[#ff4b60]">
        📺 루루동이
      </div>

      <div className="flex items-center gap-2 text-[12px] font-black tracking-[-0.04em]">
        <Link href="/" className="whitespace-nowrap px-1 py-2 text-[#ff4b60] transition active:scale-[0.97]">
          🏠 HOME
        </Link>
        {hasSession && (
          <>
            <span className="text-[#e1d4d5]">/</span>
            <button
              type="button"
              onClick={onEdit}
              className="whitespace-nowrap px-1 py-2 text-[#5f5555] transition active:scale-[0.97]"
            >
              정보변경
            </button>
            <span className="text-[#e1d4d5]">/</span>
            <button
              type="button"
              onClick={onLogout}
              className="whitespace-nowrap px-1 py-2 text-[#5f5555] transition active:scale-[0.97]"
            >
              로그아웃
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StockBadge({ status }: { status: GroupProduct["stockStatus"] }) {
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
  const label = isNormal ? "일반배송 · 합배송 가능" : "업체배송 · 별도배송";
  const color = isNormal ? "bg-[#edf8f4] text-[#29916f]" : "bg-[#fff2f4] text-[#ff4b60]";

  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-[#f6f3f3] px-3 py-1 text-[12px] font-black text-[#5f5555]">
        {product.deliveryType}
      </span>
      <span className={`rounded-full px-3 py-1 text-[12px] font-black ${color}`}>{label}</span>
    </div>
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
  const [openedProductId, setOpenedProductId] = useState<string | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerMode, setCustomerMode] = useState<"saved" | "load" | "new">("load");

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [showLoginPin, setShowLoginPin] = useState(false);

  const [nickname, setNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [requestMemo, setRequestMemo] = useState("");

  const [qty, setQty] = useState("1");
  const [optionText, setOptionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState("");

  useEffect(() => {
    const cleanup = blockCustomerCopyEvents();

    const scriptId = "daum-postcode-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      document.body.appendChild(script);
    }

    const saved = localStorage.getItem("ruru_customer_session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CustomerSession;
        setSession(parsed);
        fillCustomerForm(parsed);
        setCustomerMode("saved");
      } catch {
        localStorage.removeItem("ruru_customer_session");
      }
    }

    return cleanup;
  }, []);

  const selectedProduct = useMemo(() => {
    return groupProducts.find((product) => product.id === openedProductId) || null;
  }, [openedProductId]);

  const productAmount = selectedProduct ? selectedProduct.price * Number(qty || 0) : 0;
  const shippingFee = selectedProduct
    ? isNormalDeliveryProduct(selectedProduct)
      ? NORMAL_SHIPPING_FEE
      : VENDOR_SHIPPING_FEE
    : 0;
  const totalAmount = productAmount + shippingFee;

  const fillCustomerForm = (customer: CustomerSession) => {
    setNickname(customer.youtube_nickname || "");
    setCustomerName(customer.customer_name || "");
    setCustomerPhone(onlyNumber(customer.customer_phone || ""));
    setZipcode(customer.zipcode || "");
    setAddress(customer.address || "");
    setDetailAddress(customer.detail_address || "");
    setPinCode(onlyNumber(customer.pin_code || "").slice(0, 6));
  };

  const saveSession = (customer: CustomerSession) => {
    setSession(customer);
    localStorage.setItem("ruru_customer_session", JSON.stringify(customer));
    fillCustomerForm(customer);
    setPinConfirm("");
    setCustomerMode("saved");
  };

  const logout = () => {
    localStorage.removeItem("ruru_customer_session");
    setSession(null);
    setIsEditingCustomer(false);
    setCustomerMode("load");
    setLoginPhone("");
    setLoginPin("");
    setNickname("");
    setCustomerName("");
    setCustomerPhone("");
    setPinCode("");
    setPinConfirm("");
    setLoginPin("");
    setShowLoginPin(false);
    setShowPin(false);
    setShowPinConfirm(false);
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");
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

  const loadCustomerByPin = async () => {
    const phone = onlyNumber(loginPhone);
    const pin = onlyNumber(loginPin).slice(0, 6);

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return;
    }

    if (pin.length !== 6) {
      alert("주문 비밀번호 숫자 6자리를 입력해주세요.");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .eq("pin_code", pin)
      .limit(1);

    if (error) {
      alert("고객정보 불러오기 오류\n\n" + error.message);
      return;
    }

    const customer = data?.[0];
    if (!customer) {
      alert("일치하는 고객정보가 없습니다.\n전화번호와 주문 비밀번호를 확인해주세요.");
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
      pin_code: customer.pin_code || pin,
    };

    saveSession(nextSession);
    setIsEditingCustomer(false);
    alert("고객정보를 불러왔습니다. 바로 주문 가능합니다.");
  };

  const validateCustomerForm = () => {
    const phone = onlyNumber(customerPhone);
    const pin = onlyNumber(pinCode).slice(0, 6);

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

    if (pin.length !== 6) {
      alert("주문 비밀번호는 숫자 6자리로 입력해주세요.");
      return false;
    }

    if (customerMode === "new" && pin !== onlyNumber(pinConfirm).slice(0, 6)) {
      alert("비밀번호 확인이 일치하지 않습니다.");
      return false;
    }

    return true;
  };

  const saveCustomerInfo = async () => {
    if (!validateCustomerForm()) return null;

    const phone = onlyNumber(customerPhone);
    const pin = onlyNumber(pinCode).slice(0, 6);

    const customerData = {
      youtube_nickname: nickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: phone,
      zipcode,
      address,
      detail_address: detailAddress.trim(),
      pin_code: pin,
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
        pin_code: data.pin_code || pin,
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
      pin_code: data.pin_code || pin,
    };

    saveSession(nextSession);
    setIsEditingCustomer(false);
    return nextSession;
  };

  const submitGroupOrder = async () => {
    if (!selectedProduct) return;

    if (selectedProduct.stockStatus === "품절") {
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

    setIsSubmitting(true);

    try {
      const customer = session && !isEditingCustomer ? session : await saveCustomerInfo();
      if (!customer) return;

      const orderGroupId = crypto.randomUUID();
      const orderLookupCode = generateLookupCode();
      const isNormal = isNormalDeliveryProduct(selectedProduct);
      const finalShippingFee = isNormal ? NORMAL_SHIPPING_FEE : VENDOR_SHIPPING_FEE;
      const finalTotal = selectedProduct.price * Number(qty) + finalShippingFee;

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

        customer_match_status: session ? "PIN 로그인 고객" : "신규/수정 고객",
        customer_match_memo: isNormal
          ? "공구상품 일반배송: 방송상품 및 일반배송 공구상품과 합배송 가능"
          : "공구상품 업체배송: 별도배송 상품",

        request_memo: requestMemo.trim(),
        save_as_default_address: true,

        product_name: selectedProduct.productName,
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

        combine_shipping_applied: false,
        combine_shipping_memo: isNormal
          ? "일반배송 상품: 방송상품 + 합배송 가능 공구상품은 배송비 1회 기준"
          : "업체배송 상품: 일반배송과 별도 배송비 발생",

        shipping_status: isNormal ? "일반배송" : "업체배송",
        admin_status: "관리자 확인 전",
        order_status: "주문완료신청",

        payment_method: "무통장입금",
        vat_amount: 0,
      };

      const { error } = await supabase.from("orders").insert([orderRow]);
      if (error) throw error;

      setCompleteMessage(`주문완료신청 완료! 주문조회번호: ${orderLookupCode}`);
      setQty("1");
      setOptionText("");
      setRequestMemo("");
      setOpenedProductId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      alert("주문 저장 실패\n\n" + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOrderForm = (productId: string) => {
    setOpenedProductId((prev) => (prev === productId ? null : productId));
    setCompleteMessage("");
    setQty("1");
    setOptionText("");
    setRequestMemo("");
    if (session) {
      setCustomerMode("saved");
      setIsEditingCustomer(false);
    } else {
      setCustomerMode("load");
    }
  };

  return (
    <main
      className="min-h-screen select-none bg-[#fffafa] px-4 py-6 text-[#171717]"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-[480px]">
        <TopCustomerNav
          hasSession={Boolean(session)}
          onEdit={() => {
            setIsEditingCustomer(true);
            setCustomerMode("new");
          }}
          onLogout={logout}
        />

        {completeMessage && (
          <section className="mb-4 rounded-[28px] border border-green-200 bg-green-50 p-5 shadow-sm">
            <div className="text-[18px] font-black text-green-700">✅ {completeMessage}</div>
            <p className="mt-2 text-[13px] font-bold leading-relaxed text-green-700">
              입금 후 카톡채널로 입금내역 캡처와 유튜브 닉네임을 남겨주세요.
            </p>
          </section>
        )}

        <header className="mb-5 rounded-[32px] border border-[#f4e7e9] bg-white px-5 py-6 shadow-[0_16px_40px_rgba(30,20,20,0.06)]">
          <div className="inline-flex rounded-full bg-[#fff1a8] px-3 py-1 text-[12px] font-black text-[#2b2416]">
            🛍 상시 주문
          </div>

          <h1 className="mt-3 text-[38px] font-black leading-tight tracking-[-0.07em] text-[#151515]">
            공구상품
          </h1>

          <p className="mt-2 text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-[#7b6d6d]">
            사진 확인 후 이 페이지에서 바로 주문하세요.
            <br />다른 주문서 화면으로 이동하지 않습니다.
          </p>
        </header>

        <section className="mb-4 rounded-[28px] bg-[#fff2f4] p-5">
          <div className="text-[16px] font-black text-[#d7475b]">📌 배송비 기준</div>
          <p className="mt-2 text-[13px] font-bold leading-relaxed tracking-[-0.03em] text-[#d7475b]">
            일반배송 = 방송상품 + 합배송 가능 공구상품입니다.
            <br />업체배송 = 별도배송입니다.
            <br />일반+일반은 배송비 1회, 일반+업체는 배송비 2회 기준입니다.
          </p>
        </section>

        {groupProducts.length === 0 ? (
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
              const canOrder = product.stockStatus !== "품절";
              const isOpened = openedProductId === product.id;
              const isNormal = isNormalDeliveryProduct(product);

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-[30px] border border-[#f1ecec] bg-white shadow-[0_14px_35px_rgba(30,20,20,0.07)]"
                >
                  {product.imageUrl && (
                    <div className="h-[210px] w-full bg-[#fff7f8]">
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StockBadge status={product.stockStatus} />
                      <DeliveryBadge product={product} />
                    </div>

                    <h2 className="break-keep text-[23px] font-black leading-snug tracking-[-0.05em] text-[#151515]">
                      {product.productName}
                    </h2>

                    <p className="mt-2 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
                      {product.shortDesc}
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
                      {product.photoUrl ? (
                        <a
                          href={product.photoUrl}
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
                            {product.productName}
                          </h3>
                          <p className="mt-1 text-[13px] font-bold leading-relaxed text-[#777]">
                            주문서 작성 화면과 같은 방식으로 진행됩니다.
                          </p>
                        </div>

                        <div className="rounded-[24px] bg-[#fff7f8] p-4">
                          <div className="text-[18px] font-black text-[#151515]">
                            주문자 정보
                          </div>

                          {session && !isEditingCustomer ? (
                            <div className="mt-4 rounded-[22px] bg-green-50 p-4">
                              <div className="text-[14px] font-black text-green-700">
                                
                              </div>
                              <p className="mt-1 text-[13px] font-bold leading-relaxed text-green-700">
                                {session.customer_name}님 / {formatPhone(session.customer_phone)}
                                <br />
                                📍 {session.address} {session.detail_address}
                              </p>
                              <p className="mt-2 text-[12px] font-bold leading-relaxed text-green-700/80">
                                로그아웃 전까지 이 정보로 바로 주문됩니다.
                                수정이 필요하면 상단 [정보변경]을 눌러주세요.
                              </p>
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
                                    전화번호와 주문 비밀번호로 저장된 정보를 불러옵니다.
                                  </p>
                                  <div className="mt-3 grid gap-3">
                                    <TextInput
                                      value={formatPhone(loginPhone)}
                                      onChange={(value) => setLoginPhone(onlyNumber(value))}
                                      placeholder="전화번호"
                                      inputMode="numeric"
                                    />
                                    <div className="relative">
                                      <input
                                        value={loginPin}
                                        onChange={(event) =>
                                          setLoginPin(onlyNumber(event.target.value).slice(0, 6))
                                        }
                                        placeholder="주문 비밀번호 (숫자 6자리)"
                                        type={showLoginPin ? "text" : "password"}
                                        inputMode="numeric"
                                        className="w-full rounded-[20px] border border-[#f0e6e7] bg-[#fffafa] px-4 py-4 pr-14 text-[15px] font-bold outline-none transition focus:border-[#ff6b7a] focus:bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowLoginPin((value) => !value)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-500 transition active:scale-[0.97]"
                                      >
                                        {showLoginPin ? "숨김" : "보기"}
                                      </button>
                                    </div>
                                    <PressButton
                                      onClick={loadCustomerByPin}
                                      className="rounded-[20px] bg-[#171717] px-4 py-4 text-[15px] font-black text-white"
                                    >
                                      확인
                                    </PressButton>
                                  </div>
                                </div>
                              )}

                              {customerMode === "new" && (
                                <div className="mt-4 rounded-[22px] bg-white p-4">
                                  <div className="rounded-2xl bg-[#fff1a8] p-3 text-xs font-black leading-relaxed text-[#2b2416]">
                                    💡 닉네임 · 이름 · 연락처 · 주소는 최초 1회만 입력하면 됩니다.
                                    <br />
                                    저장 후에는 다음 주문부터 자동으로 불러옵니다.
                                  </div>

                                  <div className="mt-3 rounded-2xl bg-pink-50 p-3 text-xs font-bold leading-relaxed text-pink-700">
                                    🔒 주문 비밀번호는 주문서 작성 및 주문조회에 사용하는 비밀번호입니다.
                                    <br />
                                    숫자 6자리로 입력하고 꼭 기억해주세요.
                                  </div>

                                  <div className="mt-3 grid gap-3">
                                    <TextInput value={nickname} onChange={setNickname} placeholder="유튜브 닉네임" />
                                    <TextInput value={customerName} onChange={setCustomerName} placeholder="이름" />
                                    <TextInput
                                      value={formatPhone(customerPhone)}
                                      onChange={(value) => setCustomerPhone(onlyNumber(value))}
                                      placeholder="전화번호"
                                      inputMode="numeric"
                                    />
                                    <div className="relative">
                                      <input
                                        value={pinCode}
                                        onChange={(event) =>
                                          setPinCode(onlyNumber(event.target.value).slice(0, 6))
                                        }
                                        placeholder="주문 비밀번호 (숫자 6자리)"
                                        type={showPin ? "text" : "password"}
                                        inputMode="numeric"
                                        className="w-full rounded-[20px] border border-[#f0e6e7] bg-[#fffafa] px-4 py-4 pr-14 text-[15px] font-bold outline-none transition focus:border-[#ff6b7a] focus:bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPin((value) => !value)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-500 transition active:scale-[0.97]"
                                      >
                                        {showPin ? "숨김" : "보기"}
                                      </button>
                                    </div>

                                    <div className="relative">
                                      <input
                                        value={pinConfirm}
                                        onChange={(event) =>
                                          setPinConfirm(onlyNumber(event.target.value).slice(0, 6))
                                        }
                                        placeholder="비밀번호 확인"
                                        type={showPinConfirm ? "text" : "password"}
                                        inputMode="numeric"
                                        className="w-full rounded-[20px] border border-[#f0e6e7] bg-[#fffafa] px-4 py-4 pr-14 text-[15px] font-bold outline-none transition focus:border-[#ff6b7a] focus:bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPinConfirm((value) => !value)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-500 transition active:scale-[0.97]"
                                      >
                                        {showPinConfirm ? "숨김" : "보기"}
                                      </button>
                                    </div>
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
                            placeholder={product.optionPlaceholder || "옵션/색상/사이즈 없으면 없음"}
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

                        <div className="mt-4 rounded-[22px] bg-[#fffafa] p-4 text-[14px] font-bold text-[#5f5555]">
                          <div className="flex justify-between">
                            <span>상품금액</span>
                            <span>{won(productAmount)}</span>
                          </div>
                          <div className="mt-2 flex justify-between">
                            <span>{isNormal ? "일반배송비" : "업체배송비"}</span>
                            <span>{won(shippingFee)}</span>
                          </div>
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
