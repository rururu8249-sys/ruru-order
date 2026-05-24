// app/order/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/order/page.tsx
//
// 최종 복구/수정본
// - 기존고객/신규고객 선택 화면 제거
// - 저장된 고객정보 자동 입력
// - [정보수정] 버튼 / [로그아웃] 버튼
// - 주문상품 모든 칸 필수: 상품명/색상/사이즈/수량/상품금액
// - 색상/사이즈 없으면 고객이 "없음" 입력해야 제출 가능
// - 상품금액 쉼표 자동
// - 주문 완료 화면에서 새 입금/결제 안내 컴포넌트 사용
// - 폭죽/오토바이 애니메이션 포함
// - 무통장 계좌 안내는 주문서 작성 중간에 노출하지 않음
// - 홈/로그아웃 상단 버튼 추가
// - 주문자 정보 기존고객/신규고객 탭 방식 적용
// - 색상은 한글/영어/공백 허용, 사이즈는 한글/영어/숫자/공백 허용
// - 고객페이지 기본 퍼가기 방지 적용
// - 상품명은 자유 입력, 상품 1칸 1개 안내문 추가
// - 상품금액 1원 미만 제출 금지

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isRemoteAreaAddress } from "@/lib/order/shippingAddress";
import { formatOrderPhone, normalizeOrderPhone } from "@/lib/order/phone";
import {
  COMBINE_SHIPPING_SETTING_KEYS,
  DEFAULT_COMBINE_SHIPPING_SETTINGS,
  hasPaidShippingFee,
  isCombineShippingActiveNow,
  parseCombineShippingSettings,
  resolveCombineShippingLookupWindow,
  type CombineShippingSettings,
} from "@/lib/admin-v2/combineShipping";
import OrderPageShell from "@/components/order/OrderPageShell";
import OrderCustomerTopNav from "@/components/order/OrderCustomerTopNav";
import OrderPriceSummaryBox from "@/components/order/OrderPriceSummaryBox";
import OrderDepositConfirmModal from "@/components/order/OrderDepositConfirmModal";
import OrderCustomerInfoIntro from "@/components/order/OrderCustomerInfoIntro";
import OrderCustomerInfoFormCard from "@/components/order/OrderCustomerInfoFormCard";
import OrderProductInputGuideDetail from "@/components/order/OrderProductInputGuideDetail";
import OrderCompletePaymentNotice from "@/components/order/OrderCompletePaymentNotice";
import OrderKakaoNicknameNotice from "@/components/order/OrderKakaoNicknameNotice";

declare global {
  interface Window {
    daum?: any;
  }
}

type OrderItem = {
  product_name: string;
  color: string;
  size: string;
  qty: string;
  product_price: string;
};

type BroadcastProduct = {
  id: string | number;
  product_name: string;
  price: number;
  stock: number;
  status: string;
  product_type: string;
  shipping_type: string;
  combine_shipping: string;
};

type DoneData = {
  nickname: string;
  name: string;
  paymentMethod: "무통장입금" | "카드결제";
  items: OrderItem[];
  totalQty: number;
  productAmount: number;
  shippingFee: number;
  cardExtra: number;
  customerCardRate: number;
  totalAmount: number;
};

const BANK_NAME = "새마을금고";
const BANK_ACCOUNT = "9002186993725";
const BANK_HOLDER = "유혜원";
const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const emptyItem: OrderItem = {
  product_name: "",
  color: "",
  size: "",
  qty: "",
  product_price: "",
};

const onlyNumber = (value: string) => String(value || "").replace(/[^0-9]/g, "");
const normalizePhone = (value: string) => normalizeOrderPhone(value);
const formatPhone = (value: string) => formatOrderPhone(value);
const toNumber = (value: any) => Number(String(value || "0").replace(/[^0-9]/g, "")) || 0;
const moneyText = (value: any) => toNumber(value).toLocaleString();
const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

const hideNone = (value: any) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (["없음", "없슴", "x", "X", "-", "none", "None", "NONE"].includes(text)) return "";
  return text;
};

const itemLabel = (item: OrderItem) => {
  const qty = toNumber(item.qty);

  return [
    item.product_name.trim(),
    hideNone(item.color),
    hideNone(item.size),
    qty ? `x${qty}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};



const cleanColorText = (value: string) =>
  String(value || "").replace(/[0-9]/g, "").slice(0, 30);

const cleanSizeText = (value: string) =>
  String(value || "").slice(0, 30);

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

export default function OrderPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [broadcast, setBroadcast] = useState<any | null>(null);
  const [broadcastProducts, setBroadcastProducts] = useState<BroadcastProduct[]>([]);
  const [productSearchOpenIndex, setProductSearchOpenIndex] = useState<number | null>(null);
  const [productSearchText, setProductSearchText] = useState("");

  const [youtubeNickname, setYoutubeNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [requestMemo, setRequestMemo] = useState("");

  const [pin, setPin] = useState("");
  const [autoSaveInfo, setAutoSaveInfo] = useState(true);
  const [hasSavedInfo, setHasSavedInfo] = useState(false);
  const [isEditingCustomerInfo, setIsEditingCustomerInfo] = useState(false);
  const [isCustomerInfoOpen, setIsCustomerInfoOpen] = useState(false);
  const [showSavedCustomerDetail, setShowSavedCustomerDetail] = useState(false);
  const [showProductGuideDetail, setShowProductGuideDetail] = useState(false);
  const [customerMode, setCustomerMode] = useState<"load" | "new">("load");
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [kakaoNickname, setKakaoNickname] = useState("");
  const [youtubeNicknameError, setYoutubeNicknameError] = useState("");
  const [isKakaoLoginReturn, setIsKakaoLoginReturn] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"무통장입금" | "카드결제">("무통장입금");
  const [items, setItems] = useState<OrderItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [showDepositConfirmModal, setShowDepositConfirmModal] = useState(false);
  const PRIVACY_CONSENT_VERSION = "2026-05-24-v1";
  const PRIVACY_CONSENT_STORAGE_KEY = "ruru_privacy_consent_version";
  const [hasPrivacyConsent, setHasPrivacyConsent] = useState(false);
  const [privacyConsentChecked, setPrivacyConsentChecked] = useState(false);
  const [done, setDone] = useState<DoneData | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [customerCardRate, setCustomerCardRate] = useState(10);
  const [defaultShippingFee, setDefaultShippingFee] = useState(4000);
  const [remoteAreaShippingFee, setRemoteAreaShippingFee] = useState(6000);
  const [combineShippingSettings, setCombineShippingSettings] =
    useState<CombineShippingSettings>(DEFAULT_COMBINE_SHIPPING_SETTINGS);
  const [alreadyPaidShipping, setAlreadyPaidShipping] = useState(false);

  const actualCardFeeRate = 7;
  const isRemoteAreaShippingAddress = isRemoteAreaAddress(zipcode, address, detailAddress);
  const generalShippingFee = Number(broadcast?.shipping_fee ?? defaultShippingFee);
  const baseShippingFee = isRemoteAreaShippingAddress
    ? Math.max(remoteAreaShippingFee, generalShippingFee)
    : generalShippingFee;
  const shippingFee = alreadyPaidShipping ? 0 : baseShippingFee;
  const cardRateForCustomer = customerCardRate;

  const isAutoLoggedIn =
    hasSavedInfo &&
    !isKakaoLoginReturn &&
    !isEditingCustomerInfo &&
    !isEditMode &&
    Boolean(customerPhone && youtubeNickname && customerName);

  useEffect(() => {
    loadOrderSettings();
    loadBroadcast();
    loadSavedCustomerInfo();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedConsentVersion = window.localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) || "";
    if (savedConsentVersion === PRIVACY_CONSENT_VERSION) {
      setHasPrivacyConsent(true);
      setPrivacyConsentChecked(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const cameFromKakao = params.get("kakao") === "1";
    const nextMode = params.get("mode");
    const savedKakaoNickname = window.localStorage.getItem("ruru_kakao_nickname") || "";

    if (savedKakaoNickname) {
      setKakaoNickname(savedKakaoNickname);
    }

    if (cameFromKakao) {
      const handleKakaoReturn = async () => {
        const savedPhone = window.localStorage.getItem("ruru_customer_phone") || "";
        const savedYoutubeNickname = window.localStorage.getItem("ruru_youtube_nickname") || "";
        const savedName = window.localStorage.getItem("ruru_customer_name") || "";
        const savedAddress = window.localStorage.getItem("ruru_customer_address") || "";
        const savedDetailAddress = window.localStorage.getItem("ruru_customer_detail_address") || "";

        const hasSavedYoutubeNickname = Boolean(savedYoutubeNickname.trim());
        const hasSavedCustomerInfo = Boolean(
          savedPhone.trim() &&
            savedName.trim() &&
            savedAddress.trim() &&
            savedDetailAddress.trim()
        );

        if (hasSavedYoutubeNickname && hasSavedCustomerInfo) {
          setIsKakaoLoginReturn(false);
          setHasSavedInfo(true);
          setIsEditingCustomerInfo(false);
          setShowSavedCustomerDetail(false);
          setCustomerMode("load");
          setIsCustomerInfoOpen(false);
          window.history.replaceState(null, "", "/order");
          return;
        }

        if (!hasSavedYoutubeNickname && savedPhone.trim()) {
          const restored = await loadExistingCustomerByKakaoPhone(savedPhone);

          if (restored) {
            setIsKakaoLoginReturn(false);
            setHasSavedInfo(true);
            setIsEditingCustomerInfo(false);
            setShowSavedCustomerDetail(false);
            setCustomerMode("load");
            setIsCustomerInfoOpen(false);
            window.history.replaceState(null, "", "/order");

            setTimeout(() => {
              document.getElementById("orderProductInputSection")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 250);
            return;
          }
        }

        if (hasSavedYoutubeNickname && !hasSavedCustomerInfo) {
          setIsKakaoLoginReturn(false);
          setHasSavedInfo(false);
          setIsEditingCustomerInfo(true);
          setShowSavedCustomerDetail(false);
          setCustomerMode("new");
          setIsCustomerInfoOpen(true);
          window.history.replaceState(null, "", "/order");
          return;
        }

        setIsKakaoLoginReturn(true);

        if (!hasSavedCustomerInfo) {
          setIsEditingCustomerInfo(false);
          setShowSavedCustomerDetail(false);
          setCustomerMode("new");
          setIsCustomerInfoOpen(true);
        }

        window.history.replaceState(null, "", "/order");
      };

      void handleKakaoReturn();
      return;
    }

    if (nextMode === "edit") return;

    const savedPhone = window.localStorage.getItem("ruru_customer_phone") || "";
    const savedYoutubeNickname = window.localStorage.getItem("ruru_youtube_nickname") || "";
    const savedName = window.localStorage.getItem("ruru_customer_name") || "";

    if (!(savedPhone && savedYoutubeNickname && savedName)) {
      window.location.replace("/");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextMode = new URLSearchParams(window.location.search).get("mode");
    if (nextMode !== "edit") return;

    setIsEditMode(true);
    setIsEditingCustomerInfo(true);
    setCustomerMode("new");
    setIsCustomerInfoOpen(true);
  }, []);

  useEffect(() => {
    if (!isEditMode) return;
    if (isEditingCustomerInfo) return;
    if (!hasSavedInfo) return;
    if (!customerPhone || !youtubeNickname || !customerName) return;

    setIsEditMode(false);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/order");
    }
  }, [isEditMode, isEditingCustomerInfo, hasSavedInfo, customerPhone, youtubeNickname, customerName]);

  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  useEffect(() => {
    if (isEditingCustomerInfo) {
      setIsCustomerInfoOpen(true);
      return;
    }

    if (hasSavedInfo) {
      setIsCustomerInfoOpen(false);
      setCustomerMode("load");
      return;
    }

    if (isKakaoLoginReturn) {
      setIsCustomerInfoOpen(true);
      setCustomerMode("new");
      return;
    }

    setIsCustomerInfoOpen(true);
    setCustomerMode("load");
  }, [hasSavedInfo, isEditingCustomerInfo, isKakaoLoginReturn]);

  useEffect(() => {
    const cleanPhone = normalizePhone(customerPhone);

    if (cleanPhone.length < 10) {
      setAlreadyPaidShipping(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void checkAlreadyPaidShipping(cleanPhone);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [customerPhone, combineShippingSettings.enabled, combineShippingSettings.startAt, combineShippingSettings.endAt]);


  const loadOrderSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", [
        "customer_card_extra_rate",
        "default_shipping_fee",
        "remote_area_shipping_fee",
        ...COMBINE_SHIPPING_SETTING_KEYS,
      ]);

    if (error) {
      console.log("설정 불러오기 오류", error.message);
      return;
    }

    const readNumber = (key: string, fallback: number) => {
      const found = (data || []).find((item: any) => item.key === key);
      const parsed = Number(found?.value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const nextCustomerCardRate = Math.min(10, Math.max(0, readNumber("customer_card_extra_rate", 10)));
    const nextDefaultShippingFee = Math.max(0, readNumber("default_shipping_fee", 4000));
    const nextRemoteAreaShippingFee = Math.max(nextDefaultShippingFee, readNumber("remote_area_shipping_fee", 6000));

    setCustomerCardRate(nextCustomerCardRate);
    setDefaultShippingFee(nextDefaultShippingFee);
    setRemoteAreaShippingFee(nextRemoteAreaShippingFee);
    setCombineShippingSettings(parseCombineShippingSettings(data));
  };

  const loadSavedCustomerInfo = () => {
    const savedPhone = localStorage.getItem("ruru_customer_phone") || "";
    const savedNickname = localStorage.getItem("ruru_youtube_nickname") || "";
    const savedName = localStorage.getItem("ruru_customer_name") || "";
    const savedZipcode = localStorage.getItem("ruru_customer_zipcode") || "";
    const savedAddress = localStorage.getItem("ruru_customer_address") || "";
    const savedDetailAddress = localStorage.getItem("ruru_customer_detail_address") || "";

    if (savedPhone || savedNickname || savedName || savedAddress) {
      setHasSavedInfo(true);
      setCustomerMode("load");
    }

    if (savedPhone) setCustomerPhone(savedPhone);
    if (savedNickname) setYoutubeNickname(savedNickname);
    if (savedName) setCustomerName(savedName);
    if (savedZipcode) setZipcode(savedZipcode);
    if (savedAddress) setAddress(savedAddress);
    if (savedDetailAddress) setDetailAddress(savedDetailAddress);
  };

  const applyCustomerFromRow = (customer: any, fallbackPhone = "") => {
    const nextNickname = String(customer?.youtube_nickname || "").trim();
    const nextName = String(customer?.customer_name || "").trim();
    const nextPhone = normalizePhone(customer?.customer_phone || fallbackPhone);
    const nextZipcode = String(customer?.zipcode || "").trim();
    const nextAddress = String(customer?.address || "").trim();
    const nextDetailAddress = String(customer?.detail_address || "").trim();

    if (nextNickname) {
      setYoutubeNickname(nextNickname);
      localStorage.setItem("ruru_youtube_nickname", nextNickname);
    }

    if (nextName) {
      setCustomerName(nextName);
      localStorage.setItem("ruru_customer_name", nextName);
    }

    if (nextPhone) {
      setCustomerPhone(nextPhone);
      localStorage.setItem("ruru_customer_phone", nextPhone);
    }

    if (nextZipcode) {
      setZipcode(nextZipcode);
      localStorage.setItem("ruru_customer_zipcode", nextZipcode);
    }

    if (nextAddress) {
      setAddress(nextAddress);
      localStorage.setItem("ruru_customer_address", nextAddress);
    }

    if (nextDetailAddress) {
      setDetailAddress(nextDetailAddress);
      localStorage.setItem("ruru_customer_detail_address", nextDetailAddress);
    }

    if (nextPhone || nextNickname || nextName || nextAddress) {
      setHasSavedInfo(true);
      setCustomerMode("load");
    }

    return Boolean(nextNickname && nextPhone);
  };

  const loadExistingCustomerByKakaoPhone = async (phoneValue: string) => {
    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10) return false;

    const phoneValues = Array.from(
      new Set([
        cleanPhone,
        cleanPhone.length === 11
          ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7, 11)}`
          : cleanPhone,
      ]),
    );

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .in("customer_phone", phoneValues)
      .order("last_order_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("카카오 기존 고객정보 조회 오류:", error.message);
      return false;
    }

    const customer = data?.[0];

    if (!customer) return false;

    return applyCustomerFromRow(customer, cleanPhone);
  };


  const loadBroadcast = async () => {
    const { data, error } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("status", "ON")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log("방송정보 불러오기 오류", error.message);
      setBroadcast(null);
      setBroadcastProducts([]);
      return;
    }

    if (!data) {
      setBroadcast(null);
      setBroadcastProducts([]);
      return;
    }

    setBroadcast(data);
    await loadBroadcastProducts(data.id);
  };

  const loadBroadcastProducts = async (broadcastId: string | number) => {
    const { data, error } = await supabase
      .from("broadcast_products")
      .select("product_id, products(*)")
      .eq("broadcast_id", broadcastId);

    if (error) {
      console.log("방송상품 불러오기 오류", error.message);
      setBroadcastProducts([]);
      return;
    }

    const nextProducts = (data || [])
      .map((row: any) => row.products)
      .filter((product: any) => product && product.status !== "숨김")
      .map((product: any) => ({
        id: product.id,
        product_name: product.product_name || "",
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
        status: product.status || "판매중",
        product_type: product.product_type || "방송상품",
        shipping_type: product.shipping_type || "일반",
        combine_shipping: product.combine_shipping || "Y",
      }));

    setBroadcastProducts(nextProducts);
  };


  const loadCombineShippingSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", COMBINE_SHIPPING_SETTING_KEYS);

    if (error) {
      console.log("합배송 설정 불러오기 오류", error.message);
      return combineShippingSettings;
    }

    const nextSettings = parseCombineShippingSettings(data);
    setCombineShippingSettings(nextSettings);

    return nextSettings;
  };

  const getCombineShippingLocalKey = (
    phoneValue: string,
    settings: CombineShippingSettings
  ) => {
    const cleanPhone = normalizePhone(phoneValue);

    return [
      "ruru_combine_shipping_paid",
      cleanPhone,
      settings.startAt || "no_start",
      settings.endAt || "no_end",
    ].join(":");
  };

  const hasPaidShippingInThisBrowser = (
    phoneValue: string,
    settings: CombineShippingSettings
  ) => {
    if (typeof window === "undefined") return false;

    const key = getCombineShippingLocalKey(phoneValue, settings);
    const savedValue = window.localStorage.getItem(key);

    if (savedValue !== "Y") return false;

    const endMs = new Date(settings.endAt).getTime();

    if (!Number.isFinite(endMs)) return false;

    return Date.now() <= endMs;
  };

  const markPaidShippingInThisBrowser = (
    phoneValue: string,
    settings: CombineShippingSettings
  ) => {
    if (typeof window === "undefined") return;

    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10) return;
    if (!settings.startAt || !settings.endAt) return;

    const key = getCombineShippingLocalKey(cleanPhone, settings);

    window.localStorage.setItem(key, "Y");
  };

  const checkAlreadyPaidShipping = async (phoneValue = customerPhone) => {
    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10) {
      setAlreadyPaidShipping(false);
      return false;
    }

    const loadedSettings = await loadCombineShippingSettings();
    const lookupWindow = resolveCombineShippingLookupWindow(loadedSettings);
    const settings: CombineShippingSettings = {
      ...loadedSettings,
      enabled: true,
      startAt: lookupWindow.startAt,
      endAt: lookupWindow.endAt,
    };

    if (hasPaidShippingInThisBrowser(cleanPhone, settings)) {
      setAlreadyPaidShipping(true);
      return true;
    }

    const formattedPhone =
      cleanPhone.length === 11
        ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7, 11)}`
        : cleanPhone;

    const phoneValues = Array.from(new Set([cleanPhone, formattedPhone]));

    const { data, error } = await supabase
      .from("orders")
      .select("id, customer_phone, shipping_fee, adjusted_shipping_fee, order_manage_status, created_at")
      .in("customer_phone", phoneValues)
      .gte("created_at", settings.startAt)
      .lte("created_at", settings.endAt)
      .limit(100);

    if (error) {
      console.log("기존 배송비 확인 오류", error.message);
      setAlreadyPaidShipping(false);
      return false;
    }

    const hasShipping = (data || []).some((order: any) => hasPaidShippingFee(order));

    if (hasShipping) {
      markPaidShippingInThisBrowser(cleanPhone, settings);
    }

    setAlreadyPaidShipping(hasShipping);
    return hasShipping;
  };


  const logoutCustomerInfo = () => {
    if (!confirm("로그아웃할까요?\n\n즐거운 쇼핑 되셨길 바라요 😊\n좋은 하루 보내세요 💙")) return;

    [
      "ruru_customer_phone",
      "ruru_youtube_nickname",
      "ruru_customer_name",
      "ruru_customer_zipcode",
      "ruru_customer_address",
      "ruru_customer_detail_address",
    ].forEach((key) => localStorage.removeItem(key));

    setYoutubeNickname("");
    setCustomerName("");
    setCustomerPhone("");
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");
    
    setLoginName("");
    setLoginPhone("");
    setHasSavedInfo(false);
    setShowSavedCustomerDetail(false);
    setIsEditingCustomerInfo(false);
    setIsCustomerInfoOpen(true);
    setCustomerMode("load");

    
  };

  const startEditCustomerInfo = () => {
    setIsEditingCustomerInfo(true);
    setIsCustomerInfoOpen(true);
    setCustomerMode("new");
    
    setTimeout(() => {
      document.getElementById("youtubeNicknameInput")?.focus();
    }, 100);
  };

  const cancelEditCustomerInfo = () => {
    setIsEditingCustomerInfo(false);
    
    loadSavedCustomerInfo();
    setIsCustomerInfoOpen(false);
    setCustomerMode("load");
  };

  const openNewCustomerInfoForm = () => {
    setIsEditingCustomerInfo(false);
    setShowSavedCustomerDetail(false);
    setCustomerMode("new");
    setIsCustomerInfoOpen(true);

    window.setTimeout(() => {
      document.getElementById("youtubeNicknameInput")?.focus();
    }, 100);
  };

  const startKakaoLogin = () => {
    if (typeof window === "undefined") return;

    const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY || "";

    if (!restApiKey) {
      alert("카카오 로그인 설정값이 없습니다. 관리자에게 문의해주세요.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const params = new URLSearchParams({
      client_id: restApiKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "profile_nickname,phone_number,shipping_address",
    });

    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  };

  const scrollToProductInput = () => {
    window.setTimeout(() => {
      const target =
        document.getElementById("orderProductInputSection") ||
        document.getElementById("firstProductNameInput");

      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      document.getElementById("firstProductNameInput")?.focus();
    }, 150);
  };

  const handleYoutubeNicknameChange = (value: string) => {
    setYoutubeNickname(value);
    setYoutubeNicknameError("");
  };

  const getDuplicateYoutubeNicknameMessage = async (nicknameValue: string, phoneValue: string) => {
    const cleanNickname = nicknameValue.trim();
    const cleanPhone = normalizePhone(phoneValue);

    if (!cleanNickname) return "";

    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_phone, youtube_nickname")
      .eq("youtube_nickname", cleanNickname)
      .limit(3);

    if (error) {
      console.error("유튜브 닉네임 중복 확인 오류:", error.message);
      return "";
    }

    const duplicated = (data || []).some((customer: any) => {
      const existingPhone = normalizePhone(customer?.customer_phone || "");
      return Boolean(existingPhone && cleanPhone && existingPhone !== cleanPhone);
    });

    if (!duplicated) return "";

    return [
      "이미 사용 중인 유튜브 닉네임입니다.",
      "",
      "주문 확인이 정확히 되도록",
      "닉네임 뒤에 전화번호 끝 4자리를 붙여 입력해 주세요.",
      "",
      "예) 홍길동1234",
    ].join("\n");
  };

  const confirmKakaoYoutubeNickname = async () => {
    const cleanNickname = youtubeNickname.trim();

    if (!cleanNickname) {
      setYoutubeNicknameError("유튜브 라이브 채팅에 보이는 닉네임을 입력해 주세요.");
      return;
    }

    const duplicateMessage = await getDuplicateYoutubeNicknameMessage(cleanNickname, customerPhone);

    if (duplicateMessage) {
      setYoutubeNicknameError(duplicateMessage);
      return;
    }

    setYoutubeNicknameError("");
    localStorage.setItem("ruru_youtube_nickname", cleanNickname);
    setYoutubeNickname(cleanNickname);
    setIsKakaoLoginReturn(false);

    const hasRequiredCustomerInfo = Boolean(
      customerName.trim() &&
      normalizePhone(customerPhone).length >= 10 &&
      address.trim() &&
      detailAddress.trim()
    );

    if (hasRequiredCustomerInfo) {
      setHasSavedInfo(true);
      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);
      setCustomerMode("load");
      scrollToProductInput();
      return;
    }

    setHasSavedInfo(false);
    setIsEditingCustomerInfo(true);
    setCustomerMode("new");
    setIsCustomerInfoOpen(true);

    window.setTimeout(() => {
      document.getElementById("customerNameInput")?.focus();
    }, 100);
  };


  const loadCustomerByNamePhone = async () => {
    const cleanName = String(loginName || "").trim();
    const cleanPhone = normalizePhone(loginPhone);

    if (!cleanName) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_phone", cleanPhone)
        .eq("customer_name", cleanName)
        .limit(1);

      if (error) throw error;

      const customer = data?.[0];

      if (!customer) {
        alert("일치하는 고객정보가 없습니다.\n이름과 전화번호를 확인해주세요.");
        return;
      }

      const nextNickname = customer.youtube_nickname || "";
      const nextName = customer.customer_name || "";
      const nextZipcode = customer.zipcode || "";
      const nextAddress = customer.address || "";
      const nextDetailAddress = customer.detail_address || "";

      setYoutubeNickname(nextNickname);
      setCustomerName(nextName);
      setCustomerPhone(cleanPhone);
      setZipcode(nextZipcode);
      setAddress(nextAddress);
      setDetailAddress(nextDetailAddress);
      setRequestMemo(customer.request_memo || "");

      localStorage.setItem("ruru_youtube_nickname", nextNickname);
      localStorage.setItem("ruru_customer_name", nextName);
      localStorage.setItem("ruru_customer_phone", cleanPhone);
      localStorage.setItem("ruru_customer_zipcode", nextZipcode);
      localStorage.setItem("ruru_customer_address", nextAddress);
      localStorage.setItem("ruru_customer_detail_address", nextDetailAddress);

      setHasSavedInfo(true);
      setShowSavedCustomerDetail(false);
      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);
      setCustomerMode("load");

      void checkAlreadyPaidShipping(cleanPhone);

      alert("확인되었습니다. 바로 상품 입력으로 이동했어요.");
    } catch (error: any) {
      alert("확인 중 오류가 발생했습니다.\n\n" + error.message);
    }
  };

  const completeEditCustomerInfo = async () => {
    const cleanPhone = normalizePhone(customerPhone);

    if (!youtubeNickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    if (!customerName.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return;
    }

    if (!address.trim()) {
      alert("주소를 입력해주세요.");
      return;
    }

    try {
      await saveCustomer();
      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);
      setPin("");
      
      alert("고객정보수정이 완료되었습니다.");
    } catch (error: any) {
      alert("고객정보 저장 오류: " + error.message);
    }
  };

  const loadDaumPostcodeScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject();
        return;
      }

      if (window.daum?.Postcode) {
        resolve();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>(
        "script[data-daum-postcode='true']"
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve());
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      script.dataset.daumPostcode = "true";
      script.onload = () => resolve();
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const openAddressSearch = async () => {
    const manualAddress = () => {
      const typedAddress = window.prompt(
        "주소검색창이 안 뜨면 주소를 직접 입력해주세요.\n\n예) 서울 강남구 테헤란로 123"
      );

      if (typedAddress && typedAddress.trim()) {
        setAddress(typedAddress.trim());

        setTimeout(() => {
          const detailInput = document.querySelector<HTMLInputElement>(
            "input[placeholder='상세주소를 입력해주세요']"
          );
          detailInput?.focus();
        }, 100);
      }
    };

    try {
      await loadDaumPostcodeScript();

      if (!window.daum?.Postcode) {
        manualAddress();
        return;
      }

      new window.daum.Postcode({
        oncomplete: (data: any) => {
          const nextAddress = data.roadAddress || data.jibunAddress || "";
          const nextZipcode = data.zonecode || "";

          setAddress(nextAddress);
          setZipcode(nextZipcode);

          setTimeout(() => {
            const detailInput = document.querySelector<HTMLInputElement>(
              "input[placeholder='상세주소를 입력해주세요']"
            );
            detailInput?.focus();
          }, 100);
        },
        onclose: () => {},
      }).open();
    } catch (error) {
      manualAddress();
    }
  };

  const productAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + toNumber(item.product_price) * toNumber(item.qty);
    }, 0);
  }, [items]);

  const totalQty = useMemo(() => {
    return items.reduce((sum, item) => sum + toNumber(item.qty), 0);
  }, [items]);

  const cardExtra = paymentMethod === "카드결제"
    ? Math.round(productAmount * (cardRateForCustomer / 100))
    : 0;

  const totalAmount = productAmount + shippingFee + cardExtra;

  const filteredBroadcastProducts = useMemo(() => {
    const word = productSearchText.trim().toLowerCase();

    return broadcastProducts.filter((product) => {
      if (!word) return true;
      return String(product.product_name || "").toLowerCase().includes(word);
    });
  }, [broadcastProducts, productSearchText]);

  const selectBroadcastProduct = (index: number, product: BroadcastProduct) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              product_name: product.product_name,
              product_price: String(product.price || ""),
            }
          : item
      )
    );

    setProductSearchOpenIndex(null);
    setProductSearchText("");
  };

  const updateItem = (index: number, key: keyof OrderItem, value: string) => {
    const safeValue =
      key === "color"
        ? cleanColorText(value)
        : key === "size"
          ? cleanSizeText(value)
          : value;

    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: safeValue,
            }
          : item
      )
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...emptyItem }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const saveCustomer = async () => {
    const cleanPhone = normalizePhone(customerPhone);

    const customerData: any = {
      youtube_nickname: youtubeNickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: cleanPhone,
      zipcode: zipcode.trim(),
      address: address.trim(),
      detail_address: detailAddress.trim(),
      request_memo: requestMemo.trim(),
      last_order_at: new Date().toISOString(),
    };


    const { data: rows, error: findError } = await supabase
      .from("customers")
      .select("id")
      .eq("customer_phone", cleanPhone)
      .limit(1);

    if (findError) throw findError;

    if (rows && rows.length > 0) {
      const { error } = await supabase
        .from("customers")
        .update(customerData)
        .eq("customer_phone", cleanPhone);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("customers").insert(customerData);
      if (error) throw error;
    }

    if (autoSaveInfo) {
      localStorage.setItem("ruru_youtube_nickname", youtubeNickname.trim());
      localStorage.setItem("ruru_customer_name", customerName.trim());
      localStorage.setItem("ruru_customer_phone", cleanPhone);
      localStorage.setItem("ruru_customer_zipcode", zipcode.trim());
      localStorage.setItem("ruru_customer_address", address.trim());
      localStorage.setItem("ruru_customer_detail_address", detailAddress.trim());
      setHasSavedInfo(true);
      setCustomerMode("load");
    }
  };

  const validate = () => {
    const cleanPhone = normalizePhone(customerPhone);

    if (!youtubeNickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return false;
    }

    if (!customerName.trim()) {
      alert("이름을 입력해주세요.");
      return false;
    }

    if (cleanPhone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return false;
    }


    if (!address.trim()) {
      alert("주소를 입력해주세요.");
      return false;
    }

    if (!detailAddress.trim()) {
      const ok = confirm(
        "상세주소가 비어 있습니다.\n\n아파트/빌라/오피스텔은 동·호수 누락 시 배송이 지연될 수 있습니다.\n\n정말 상세주소 없이 제출할까요?"
      );

      if (!ok) {
        return false;
      }
    }

    const validItems = items.filter(
      (item) =>
        item.product_name.trim() ||
        item.color.trim() ||
        item.size.trim() ||
        item.product_price.trim()
    );

    if (validItems.length === 0) {
      alert("상품명을 입력해주세요.");
      return false;
    }

    for (const item of validItems) {
      if (!item.product_name.trim()) {
        alert("상품명을 입력해주세요.");
        return false;
      }

      if (!String(item.color || "").trim()) {
        alert("색상을 입력해주세요.\n색상이 없으면 '없음'이라고 입력해주세요.");
        return false;
      }

      if (!String(item.size || "").trim()) {
        alert("사이즈를 입력해주세요.\n사이즈가 없으면 '없음'이라고 입력해주세요.");
        return false;
      }

      if (!toNumber(item.qty)) {
        alert("수량을 입력해주세요.");
        return false;
      }

      if (!toNumber(item.product_price)) {
        alert("상품금액을 입력해주세요.");
        return false;
      }

      if (toNumber(item.product_price) < 1) {
        alert("상품금액은 1원 이상으로 입력해주세요.");
        return false;
      }
    }

    if (paymentMethod === "카드결제" && productAmount < 100000) {
      alert("카드결제는 10만원 이상 구매 시 가능합니다.");
      return false;
    }

    if (!hasPrivacyConsent && !privacyConsentChecked) {
      alert("개인정보 수집·이용 및 배송정보 제공 안내 확인이 필요합니다.");
      return false;
    }

    return true;
  };

  const submitOrder = async () => {
    if (!validate()) return;

    if (!hasPrivacyConsent && privacyConsentChecked && typeof window !== "undefined") {
      window.localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, PRIVACY_CONSENT_VERSION);
      setHasPrivacyConsent(true);
    }

    setSubmitting(true);

    try {
      const cleanPhone = normalizePhone(customerPhone);
      const paidShippingBeforeSubmit = await checkAlreadyPaidShipping(cleanPhone);
      const appliedShippingFee = paidShippingBeforeSubmit ? 0 : baseShippingFee;
      const appliedTotalAmount = productAmount + appliedShippingFee + cardExtra;
      const latestCombineSettings = await loadCombineShippingSettings();
      const latestLookupWindow = resolveCombineShippingLookupWindow(latestCombineSettings);
      const markCombineSettings: CombineShippingSettings = {
        ...latestCombineSettings,
        enabled: true,
        startAt: latestLookupWindow.startAt,
        endAt: latestLookupWindow.endAt,
      };

      await saveCustomer();

      const validItems = items.filter(
        (item) =>
          item.product_name.trim() ||
          item.color.trim() ||
          item.size.trim() ||
          item.product_price.trim()
      );

      const groupId = crypto.randomUUID();
      const lookupCode = `RURU-${Date.now().toString(36).toUpperCase()}`;
      const broadcastName =
        broadcast?.broadcast_public_title ||
        broadcast?.public_title ||
        "현재 방송";

      const orderRows = validItems.map((item, index) => {
        const qty = toNumber(item.qty);
        const price = toNumber(item.product_price);
        const itemTotal = price * qty;
        const rowShippingFee = index === 0 ? appliedShippingFee : 0;
        const rowCardExtra =
          paymentMethod === "카드결제"
            ? Math.round(itemTotal * (cardRateForCustomer / 100))
            : 0;

        return {
          order_group_id: groupId,
          order_lookup_code: lookupCode,

          broadcast_id: broadcast?.id || null,
          broadcast_name: broadcastName,
          broadcast_public_title: broadcastName,
          broadcast_admin_subtitle:
            broadcast?.broadcast_admin_subtitle ||
            broadcast?.admin_subtitle ||
            "",

          youtube_nickname: youtubeNickname.trim(),
          customer_name: customerName.trim(),
          customer_phone: cleanPhone,
          phone: cleanPhone,

          zipcode: zipcode.trim(),
          address: address.trim(),
          detail_address: detailAddress.trim(),
          request_memo: requestMemo.trim(),

          product_name: item.product_name.trim(),
          color: String(item.color || "").trim(),
          size: String(item.size || "").trim(),
          qty,
          product_price: price,
          shipping_fee: rowShippingFee,
          total_price: itemTotal + rowShippingFee + rowCardExtra,

          adjusted_product_price: itemTotal,
          adjusted_shipping_fee: rowShippingFee,
          adjusted_total_price: itemTotal + rowShippingFee + rowCardExtra,

          payment_method: paymentMethod,
          vat_amount: rowCardExtra,
          customer_card_extra_rate_applied: paymentMethod === "카드결제" ? cardRateForCustomer : 0,
          actual_card_fee_rate_applied: paymentMethod === "카드결제" ? actualCardFeeRate : 0,

          order_status: "주문완료",
          admin_status: "관리자 확인 전",
          order_manage_status: "주문확인전",
          shipping_status: "합배송중",

          memo: itemLabel(item),
          special_note: requestMemo.trim(),
        };
      });

      const { error } = await supabase.from("orders").insert(orderRows);
      if (error) throw error;

      setDone({
        nickname: youtubeNickname.trim(),
        name: customerName.trim(),
        paymentMethod,
        items: validItems,
        totalQty,
        productAmount,
        shippingFee: appliedShippingFee,
        cardExtra,
        customerCardRate: cardRateForCustomer,
        totalAmount: appliedTotalAmount,
      });

      setItems([{ ...emptyItem }]);
      setRequestMemo("");
      setPaymentMethod("무통장입금");
      setPin("");

      if (appliedShippingFee > 0) {
        markPaidShippingInThisBrowser(cleanPhone, markCombineSettings);
      }

      setAlreadyPaidShipping(true);

      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      alert("주문서 제출 오류: " + error.message);
    }

    setSubmitting(false);
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

  const buttonBase = "transition-all duration-150 active:scale-[0.97]";


  const DEPOSIT_CONFIRM_HIDE_UNTIL_KEY = "ruru_deposit_confirm_hide_until";

  const shouldSkipDepositConfirm = () => {
    if (typeof window === "undefined") return false;

    const hideUntil = Number(localStorage.getItem(DEPOSIT_CONFIRM_HIDE_UNTIL_KEY) || 0);
    return Number.isFinite(hideUntil) && hideUntil > Date.now();
  };

  const handleSubmitOrderClick = () => {
    if (!validate()) return;

    if (paymentMethod !== "무통장입금") {
      submitOrder();
      return;
    }

    if (productAmount <= 0 || totalAmount <= 0) {
      submitOrder();
      return;
    }

    if (shouldSkipDepositConfirm()) {
      submitOrder();
      return;
    }

    setShowDepositConfirmModal(true);
  };

  const handleDepositConfirmSubmit = (hideFor24Hours: boolean) => {
    if (hideFor24Hours && typeof window !== "undefined") {
      localStorage.setItem(
        DEPOSIT_CONFIRM_HIDE_UNTIL_KEY,
        String(Date.now() + 24 * 60 * 60 * 1000),
      );
    }

    setShowDepositConfirmModal(false);
    submitOrder();
  };

  const TopCustomerNav = () => (
    <OrderCustomerTopNav
      isLoggedIn={hasSavedInfo}
      greetingName={youtubeNickname || customerName}
      onEditInfo={startEditCustomerInfo}
      onLogout={logoutCustomerInfo}
    />
  );

  if (done) {
    return (
      <main className="min-h-screen bg-[#f5f8ff] px-4 py-6 text-[#151923] select-none" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
        <section className="mx-auto w-full max-w-md">
          <TopCustomerNav />

          <OrderCompletePaymentNotice
            nickname={done.nickname}
            name={done.name}
            paymentMethod={done.paymentMethod}
            productAmount={done.productAmount}
            shippingFee={done.shippingFee}
            totalAmount={done.totalAmount}
            bankName={BANK_NAME}
            bankAccount={BANK_ACCOUNT}
            bankHolder={BANK_HOLDER}
            items={done.items}
          />

        <footer className="py-8 text-center text-[11px] font-bold text-[#9b8d82]">
            {FOOTER_TEXT}
          </footer>
        </section>
      </main>
    );
  }

  return (
    <OrderPageShell>
        {hasSavedInfo && <TopCustomerNav />}

        {isKakaoLoginReturn && !isAutoLoggedIn && (
          <OrderKakaoNicknameNotice
            kakaoNickname={kakaoNickname}
            youtubeNickname={youtubeNickname}
            errorMessage={youtubeNicknameError}
            onYoutubeNicknameChange={handleYoutubeNicknameChange}
            onConfirm={confirmKakaoYoutubeNickname}
          />
        )}

        {!isAutoLoggedIn && (isEditingCustomerInfo || customerMode === "new") && (
          <OrderCustomerInfoIntro mode={isEditingCustomerInfo ? "edit" : "check"} />
        )}

        {!isAutoLoggedIn && (isEditingCustomerInfo || customerMode === "new") && (
          <OrderCustomerInfoFormCard
            isEdit={isEditingCustomerInfo}
            youtubeNickname={youtubeNickname}
            customerName={customerName}
            customerPhone={formatPhone(customerPhone)}
            address={address}
            detailAddress={detailAddress}
            onYoutubeNicknameChange={setYoutubeNickname}
            onCustomerNameChange={setCustomerName}
            onCustomerPhoneChange={(value) => setCustomerPhone(normalizePhone(value))}
            onAddressChange={setAddress}
            onDetailAddressChange={setDetailAddress}
            onOpenAddressSearch={openAddressSearch}
            onCancel={cancelEditCustomerInfo}
            onConfirm={completeEditCustomerInfo}
          />
        )}

        {isAutoLoggedIn && (
          <>
<section id="orderProductInputSection" className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">주문상품</h2>

          <div className="mt-4 rounded-[1.4rem] bg-blue-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="break-keep text-sm font-black leading-relaxed text-blue-700">
                ⚠️ 상품은 1칸에 1개씩 · 금액은 택배비 제외
              </div>

              <button
                type="button"
                onClick={() => setShowProductGuideDetail((value) => !value)}
                className={`${buttonBase} shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-blue-700`}
              >
                {showProductGuideDetail ? "내용닫기 ▲" : "내용보기 ▼"}
              </button>
            </div>

            <OrderProductInputGuideDetail
              show={showProductGuideDetail}
              broadcastActive={Boolean(broadcast)}
              broadcastProductCount={broadcastProducts.length}
            />
          </div>

          <div className="mt-4 grid gap-4">
            {items.map((item, index) => (
              <div key={index} className="rounded-[26px] border border-blue-100 bg-white p-4 shadow-[0_10px_22px_rgba(30,64,175,0.06)]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-black">상품 {index + 1}</div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className={`${buttonBase} rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600`}
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div className="grid gap-3">
                  <div className="relative">
                    <input
                      value={item.product_name}
                      onFocus={() => {
                        if (broadcastProducts.length > 0) {
                          setProductSearchOpenIndex(index);
                          setProductSearchText(item.product_name);
                        }
                      }}
                      onChange={(event) => {
                        updateItem(index, "product_name", event.target.value);
                        setProductSearchOpenIndex(index);
                        setProductSearchText(event.target.value);
                      }}
                      id={index === 0 ? "firstProductNameInput" : undefined}
                      placeholder="상품명"
                      className="w-full rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />

                    {productSearchOpenIndex === index && broadcastProducts.length > 0 && (
                      <div className="absolute left-0 right-0 top-[58px] z-40 max-h-72 overflow-auto rounded-3xl border border-blue-100 bg-white p-2 shadow-[0_18px_45px_rgba(30,20,20,0.15)]">
                        <div className="px-3 py-2 text-xs font-black text-blue-600">
                          오늘 방송상품 선택
                        </div>

                        {filteredBroadcastProducts.length === 0 ? (
                          <div className="px-3 py-4 text-sm font-bold text-gray-500">
                            검색된 방송상품이 없습니다. 직접 입력해주세요.
                          </div>
                        ) : (
                          filteredBroadcastProducts.map((product) => (
                            <button
                              key={String(product.id)}
                              type="button"
                              onClick={() => selectBroadcastProduct(index, product)}
                              className={`${buttonBase} mb-1 w-full rounded-2xl px-3 py-3 text-left hover:bg-blue-50`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate font-black text-gray-950">
                                    {product.product_name}
                                  </div>
                                  <div className="mt-1 text-xs font-bold text-gray-500">
                                    재고 {product.stock || 0}개 · {product.shipping_type}배송 · 합배송 {product.combine_shipping === "N" ? "불가" : "가능"}
                                  </div>
                                </div>

                                <div className="shrink-0 text-sm font-black text-blue-600">
                                  {won(product.price)}
                                </div>
                              </div>
                            </button>
                          ))
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setProductSearchOpenIndex(null);
                            setProductSearchText("");
                          }}
                          className={`${buttonBase} mt-1 w-full rounded-2xl bg-gray-100 p-3 text-sm font-black text-gray-600`}
                        >
                          직접입력 계속하기
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={item.color}
                      onChange={(event) => updateItem(index, "color", event.target.value)}
                      placeholder="색상"
                      className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />

                    <input
                      value={item.size}
                      onChange={(event) => updateItem(index, "size", event.target.value)}
                      placeholder="사이즈"
                      className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={item.qty}
                      onChange={(event) => updateItem(index, "qty", onlyNumber(event.target.value))}
                      placeholder="수량"
                      inputMode="numeric"
                      className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />

                    <div className="relative">
                      <input
                        value={item.product_price ? moneyText(item.product_price) : ""}
                        onChange={(event) =>
                          updateItem(index, "product_price", onlyNumber(event.target.value))
                        }
                        placeholder="상품금액"
                        inputMode="numeric"
                        className="w-full rounded-2xl border border-gray-200 bg-white p-4 pr-10 font-bold"
                      />

                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">
                        원
                      </span>
                    </div>
                  </div>

                  {item.product_name && (
                    <div className="rounded-2xl bg-white p-3 text-sm font-black text-gray-600">
                      {itemLabel(item)} / {won(toNumber(item.product_price) * toNumber(item.qty))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className={`${buttonBase} rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4 font-black text-blue-700`}
            >
              + 상품 추가하기
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">결제방식 / 요청사항</h2>

          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["무통장입금", "카드결제"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`${buttonBase} rounded-2xl p-4 font-black ${
                    paymentMethod === method
                      ? method === "카드결제"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-950 text-white"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            {paymentMethod === "카드결제" && (
              <div className="rounded-2xl bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-700">
                💳 카드결제는 10만원 이상 구매 시 가능합니다.
                <br />
                주문서 작성 후 카톡채널 문의 부탁드립니다.
              </div>
            )}

            <textarea
              value={requestMemo}
              onChange={(event) => setRequestMemo(event.target.value)}
              placeholder="요청사항(선택) / 배송메모"
              className="min-h-[100px] rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-blue-400"
            />

            {alreadyPaidShipping && (
              <div className="rounded-2xl bg-green-50 p-3 text-xs font-black leading-relaxed text-green-700">
                ✅ 합배송 가능 주문으로 확인되어 이번 주문서 배송비는 0원입니다.
              </div>
            )}

            {!alreadyPaidShipping && isRemoteAreaShippingAddress && (
              <div className="rounded-2xl bg-amber-50 p-3 text-xs font-black leading-relaxed text-amber-800 ring-1 ring-amber-100">
                🏝️ 제주/도서/산간 배송지로 확인되어 배송비 {won(baseShippingFee)}가 적용됩니다.
              </div>
            )}

            <OrderPriceSummaryBox
              productAmount={productAmount}
              shippingFee={shippingFee}
              cardExtra={cardExtra}
              totalAmount={totalAmount}
              paymentMethod={paymentMethod}
            />

            {!hasPrivacyConsent && (
              <label className="flex cursor-pointer items-start gap-3 rounded-[22px] bg-blue-50 p-4 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-blue-900 ring-1 ring-blue-100 active:scale-[0.99]">
                <input
                  type="checkbox"
                  checked={privacyConsentChecked}
                  onChange={(event) => setPrivacyConsentChecked(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                />
                <span>
                  [필수] 개인정보 수집·이용 및 배송정보 제공 안내를 확인했습니다.
                  <br />
                  <span className="text-slate-500">최초 1회 동의 후 다음 주문부터는 다시 표시되지 않습니다.</span>
                </span>
              </label>
            )}

            <button
              type="button"
              onClick={handleSubmitOrderClick}
              disabled={submitting}
              className={`${buttonBase} rounded-2xl bg-blue-500 p-5 text-lg font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50`}
            >
              {submitting ? "제출 중..." : "주문서 제출하기"}
            </button>
          </div>
        </section>
          </>
        )}

        <OrderDepositConfirmModal
          open={showDepositConfirmModal}
          nickname={youtubeNickname || customerName}
          totalAmount={totalAmount}
          onConfirm={handleDepositConfirmSubmit}
        />

        <footer className="py-8 text-center text-[11px] font-bold text-[#9b8d82]">
          {FOOTER_TEXT}
        </footer>
    </OrderPageShell>
  );
}
