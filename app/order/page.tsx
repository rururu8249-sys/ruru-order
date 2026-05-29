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
  CUSTOMER_SESSION_VERSION_KEY,
  YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY,
  clearLegacyCustomerSessionIfNeeded,
  isYoutubeNicknameConfirmVersionCurrent,
  markYoutubeNicknameConfirmVersionCurrent,
} from "@/lib/customer/customerSession";
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
import OrderCompletePaymentNotice from "@/components/order/OrderCompletePaymentNotice";
import OrderKakaoNicknameNotice from "@/components/order/OrderKakaoNicknameNotice";
import CustomerBlockedNotice from "@/components/customer/CustomerBlockedNotice";
import CustomerToastNotice from "@/components/customer/CustomerToastNotice";
import CustomerManualAddressPanel from "@/components/customer/CustomerManualAddressPanel";
import CustomerMissingDetailAddressPanel from "@/components/customer/CustomerMissingDetailAddressPanel";
import GroupBuyQuickSelect, { type GroupBuyQuickSelectProduct } from "@/components/order/GroupBuyQuickSelect";

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
  shipping_type?: string;
  combine_shipping?: string;
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
  product_note?: unknown;
  description?: string;
  detail_description?: string;
  product_description?: string;
  detail_image_urls?: unknown;
  images?: unknown;
  product_images?: unknown;
  is_pinned?: boolean;
  pinned?: boolean;
  pinned_at?: string;
  sort_order?: number;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
  image_url?: string;
  thumbnail_url?: string;
  main_image_url?: string;
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
  pointUsedAmount: number;
  finalAmount: number;
};

type CustomerBlockStatus = {
  blocked: boolean;
  checking: boolean;
  message: string;
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
  shipping_type: "일반",
  combine_shipping: "Y",
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


type ProductSuggestionNote = {
  name_suggestion_enabled?: boolean;
  suggestion_keywords?: string[];
  stock_variants?: Array<{ color?: string; size?: string; stock?: number }>;
  colors?: string[] | string;
  sizes?: string[] | string;
  registered_order_enabled?: boolean;
};

function parseProductSuggestionNote(raw: unknown): ProductSuggestionNote | null {
  if (!raw) return null;

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ProductSuggestionNote;
  }

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();

  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ProductSuggestionNote;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeSuggestionText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function productSuggestionEnabled(product: BroadcastProduct) {
  const note = parseProductSuggestionNote(product.product_note);

  return note?.name_suggestion_enabled !== false;
}

function productSuggestionKeywords(product: BroadcastProduct) {
  const note = parseProductSuggestionNote(product.product_note);

  if (!Array.isArray(note?.suggestion_keywords)) {
    return [];
  }

  return note.suggestion_keywords
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean);
}

function productMatchesSuggestion(product: BroadcastProduct, query: string) {
  const normalizedQuery = normalizeSuggestionText(query);

  if (!normalizedQuery) {
    return false;
  }

  const targets = [
    product.product_name,
    ...productSuggestionKeywords(product),
  ].map((target) => normalizeSuggestionText(String(target || "")));

  return targets.some((target) => target.includes(normalizedQuery));
}


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

function splitProductOptionValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item): string[] => splitProductOptionValue(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,.\/|·\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueOptionValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 8);
}

function getProductOptionSuggestions(product: BroadcastProduct, field: "color" | "size"): string[] {
  const note = parseProductSuggestionNote(product.product_note);
  const record = product as unknown as Record<string, unknown>;
  const values: string[] = [];

  if (Array.isArray(note?.stock_variants)) {
    for (const variant of note.stock_variants) {
      const value = field === "color" ? variant.color : variant.size;

      if (typeof value === "string" && value.trim()) {
        values.push(value.trim());
      }
    }
  }

  if (field === "color") {
    values.push(...splitProductOptionValue(note?.colors));
    values.push(...splitProductOptionValue(record.colors));
    values.push(...splitProductOptionValue(record.color_options));
    values.push(...splitProductOptionValue(record.color));
  } else {
    values.push(...splitProductOptionValue(note?.sizes));
    values.push(...splitProductOptionValue(record.sizes));
    values.push(...splitProductOptionValue(record.size_options));
    values.push(...splitProductOptionValue(record.size));
  }

  return uniqueOptionValues(values);
}

function findMatchedBroadcastProduct(item: OrderItem, products: BroadcastProduct[]): BroadcastProduct | null {
  const itemName = normalizeSuggestionText(item.product_name);

  if (!itemName) {
    return null;
  }

  return (
    products.find((product) => normalizeSuggestionText(product.product_name) === itemName) ||
    products.find((product) => normalizeSuggestionText(product.product_name).includes(itemName)) ||
    null
  );
}


function productIsGroupBuy(product: BroadcastProduct): boolean {
  const typeValue = String(product.product_type ?? "").trim().toLowerCase();

  return (
    typeValue === "group_buy" ||
    typeValue === "group-buy" ||
    typeValue === "gonggu" ||
    typeValue.includes("group") ||
    typeValue.includes("공구")
  );
}

function productRegisteredOrderEnabled(product: BroadcastProduct): boolean {
  const note = parseProductSuggestionNote(product.product_note);

  return note?.registered_order_enabled !== false;
}

function productDeliveryLabel(product: BroadcastProduct): string {
  const record = product as unknown as Record<string, unknown>;
  const shippingType = String(record.shipping_type ?? record.delivery_type ?? "").trim().toLowerCase();

  if (
    shippingType.includes("vendor") ||
    shippingType.includes("company") ||
    shippingType.includes("direct") ||
    shippingType.includes("업체")
  ) {
    return "업체배송";
  }

  return "일반배송";
}


function readOrderProductImageValue(value: unknown): string {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = readOrderProductImageValue(item);

      if (imageUrl) {
        return imageUrl;
      }
    }

    return "";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      readOrderProductImageValue(record.image_url) ||
      readOrderProductImageValue(record.thumbnail_url) ||
      readOrderProductImageValue(record.main_image_url) ||
      readOrderProductImageValue(record.url) ||
      ""
    );
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http") || trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    return readOrderProductImageValue(JSON.parse(trimmed));
  } catch {
    return "";
  }
}

function pickOrderProductImageUrl(product: any): string {
  return (
    readOrderProductImageValue(product?.image_url) ||
    readOrderProductImageValue(product?.thumbnail_url) ||
    readOrderProductImageValue(product?.main_image_url) ||
    readOrderProductImageValue(product?.product_image_url) ||
    readOrderProductImageValue(product?.image_urls) ||
    readOrderProductImageValue(product?.images) ||
    readOrderProductImageValue(product?.product_images) ||
    readOrderProductImageValue(product?.product_note) ||
    ""
  );
}



function OrderInputClearButton({
  show,
  label,
  onClear,
}: {
  show: boolean;
  label: string;
  onClear: () => void;
}) {
  if (!show) return null;

  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
      className="absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs font-black leading-none text-slate-500 active:scale-95"
    >
      ×
    </button>
  );
}


function readRegisteredProductOptionText(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = readRegisteredProductOptionText(item);
      if (text) return text;
    }

    return "";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priorityKeys = ["value", "label", "name", "text", "title", "option"];

    for (const key of priorityKeys) {
      const text = readRegisteredProductOptionText(record[key]);
      if (text) return text;
    }
  }

  return "";
}

function pickRegisteredProductOptionText(product: BroadcastProduct, keys: string[]): string {
  const record = product as unknown as Record<string, unknown>;
  const note = parseProductSuggestionNote(product.product_note) as Record<string, unknown>;
  const sources = [record, note];

  for (const source of sources) {
    for (const key of keys) {
      const text = readRegisteredProductOptionText(source[key]);
      if (text) return text;
    }
  }

  return "없음";
}


function normalizeOrderProductRow(product: any): BroadcastProduct {
  const price = Number(product?.price ?? product?.sale_price ?? product?.selling_price ?? 0);

  return {
    id: product?.id,
    product_name: String(product?.product_name ?? product?.name ?? ""),
    price: Number.isFinite(price) ? price : 0,
    product_note: product?.product_note ?? product?.note ?? product?.memo ?? "",
    description: String(product?.description ?? ""),
    detail_description: String(product?.detail_description ?? ""),
    product_description: String(product?.product_description ?? ""),
    detail_image_urls: product?.detail_image_urls ?? product?.detailImageUrls ?? product?.detail_images ?? null,
    images: product?.images ?? null,
    product_images: product?.product_images ?? null,
    is_pinned: Boolean(product?.is_pinned) || Boolean(product?.pinned),
    pinned: Boolean(product?.pinned) || Boolean(product?.is_pinned),
    pinned_at: String(product?.pinned_at ?? ""),
    sort_order: Number(product?.sort_order ?? product?.display_order ?? 999999),
    display_order: Number(product?.display_order ?? product?.sort_order ?? 999999),
    created_at: String(product?.created_at ?? ""),
    updated_at: String(product?.updated_at ?? ""),
    status: String(product?.status ?? "판매중"),
    product_type: String(product?.product_type ?? ""),
    shipping_type: String(product?.shipping_type ?? product?.delivery_type ?? ""),
    image_url: pickOrderProductImageUrl(product),
  } as BroadcastProduct;
}



export default function OrderPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [broadcast, setBroadcast] = useState<any | null>(null);
  const [broadcastProducts, setBroadcastProducts] = useState<BroadcastProduct[]>([]);
  const [groupBuyQuickProductsFromCatalog, setGroupBuyQuickProductsFromCatalog] = useState<BroadcastProduct[]>([]);
  const [productSearchOpenIndex, setProductSearchOpenIndex] = useState<number | null>(null);
  const [productSearchText, setProductSearchText] = useState("");
  const [showAllGroupBuyQuickProducts, setShowAllGroupBuyQuickProducts] = useState(false);

  useEffect(() => {
    const handleProductSearchOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-ruru-product-search-area]")) {
        return;
      }

      setProductSearchOpenIndex(null);
      setProductSearchText("");
    };

    document.addEventListener("pointerdown", handleProductSearchOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleProductSearchOutsidePointerDown);
    };
  }, []);


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
  const [customerMode, setCustomerMode] = useState<"load" | "new">("load");
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [kakaoNickname, setKakaoNickname] = useState("");
  const [youtubeNicknameError, setYoutubeNicknameError] = useState("");
  const [isKakaoLoginReturn, setIsKakaoLoginReturn] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"무통장입금" | "카드결제">("무통장입금");
  const [items, setItems] = useState<OrderItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [customerBlockStatus, setCustomerBlockStatus] = useState<CustomerBlockStatus>({
    blocked: false,
    checking: false,
    message: "",
  });
  const [customerNotice, setCustomerNotice] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
  }>({
    type: "info",
    message: "",
  });

  const closeCustomerNotice = () => {
    setCustomerNotice({ type: "info", message: "" });
  };

  const showCustomerNotice = (message: unknown, type?: "info" | "success" | "warning" | "error") => {
    const text = String(message ?? "").trim();

    if (!text) return;

    const autoType =
      type ||
      (text.includes("완료") || text.includes("확인되었습니다") || text.includes("복사") || text.includes("저장되었습니다")
        ? "success"
        : text.includes("오류") || text.includes("실패") || text.includes("없습니다")
          ? "error"
          : "warning");

    setCustomerNotice({ type: autoType, message: text });

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setCustomerNotice((current) => (current.message === text ? { type: "info", message: "" } : current));
      }, 3200);
    }
  };
  const [manualAddressOpen, setManualAddressOpen] = useState(false);
  const [missingDetailAddressConfirmOpen, setMissingDetailAddressConfirmOpen] = useState(false);
  const [showDepositConfirmModal, setShowDepositConfirmModal] = useState(false);
  const PRIVACY_CONSENT_VERSION = "2026-05-24-v1";
  const PRIVACY_CONSENT_STORAGE_KEY = "ruru_privacy_consent_version";
  const [hasPrivacyConsent, setHasPrivacyConsent] = useState(false);
  const [privacyConsentChecked, setPrivacyConsentChecked] = useState(false);
  const hasSavedOrderCustomerInfo = Boolean(
    youtubeNickname.trim() && customerName.trim() && customerPhone.trim()
  );
  const [done, setDone] = useState<DoneData | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [customerCardRate, setCustomerCardRate] = useState(10);
  const [actualCardFeeRate, setActualCardFeeRate] = useState(7);
  const [cardPaymentMinAmount, setCardPaymentMinAmount] = useState(100000);
  const [defaultShippingFee, setDefaultShippingFee] = useState(4000);
  const [remoteAreaShippingFee, setRemoteAreaShippingFee] = useState(6000);
  const [combineShippingSettings, setCombineShippingSettings] =
    useState<CombineShippingSettings>(DEFAULT_COMBINE_SHIPPING_SETTINGS);
  const [alreadyPaidShipping, setAlreadyPaidShipping] = useState(false);
  const [customerPointBalance, setCustomerPointBalance] = useState(0);
  const [customerPointLoading, setCustomerPointLoading] = useState(false);
  const [pointUseInput, setPointUseInput] = useState("");

  const isRemoteAreaShippingAddress = isRemoteAreaAddress(zipcode, address, detailAddress);
  const generalShippingFee = Number(broadcast?.shipping_fee ?? defaultShippingFee);
  const baseShippingFee = isRemoteAreaShippingAddress
    ? Math.max(remoteAreaShippingFee, generalShippingFee)
    : generalShippingFee;
  const isVendorShippingItem = (item: Pick<OrderItem, "shipping_type" | "combine_shipping">) => {
    const shippingType = String(item.shipping_type || "").trim().toLowerCase();

    return (
      shippingType.includes("vendor") ||
      shippingType.includes("company") ||
      shippingType.includes("direct") ||
      shippingType.includes("업체")
    );
  };

  const getChargeableShippingItems = (targetItems: OrderItem[]) =>
    targetItems.filter((item) =>
      String(item.product_name || "").trim() &&
      toNumber(item.qty) > 0 &&
      toNumber(item.product_price) > 0
    );

  const calculateShippingFeeBreakdown = (
    targetItems: OrderItem[],
    paidGeneralShipping: boolean,
  ) => {
    const chargeableItems = getChargeableShippingItems(targetItems);
    const hasVendorShipping = chargeableItems.some((item) => isVendorShippingItem(item));
    const hasGeneralShipping = chargeableItems.some((item) => !isVendorShippingItem(item));

    const normalShippingFee = hasGeneralShipping && !paidGeneralShipping ? baseShippingFee : 0;
    const vendorShippingFee = hasVendorShipping ? baseShippingFee : 0;

    return {
      normalShippingFee,
      vendorShippingFee,
      totalShippingFee: normalShippingFee + vendorShippingFee,
    };
  };

  const shippingFeeBreakdown = calculateShippingFeeBreakdown(items, alreadyPaidShipping);
  const shippingFee = shippingFeeBreakdown.totalShippingFee;
  const cardRateForCustomer = customerCardRate;

  const isAutoLoggedIn =
    hasSavedInfo &&
    !isKakaoLoginReturn &&
    !isEditingCustomerInfo &&
    !isEditMode &&
    Boolean(customerPhone && youtubeNickname && customerName);

  type OperatorTestOrderFlags = {
    isTestOrder: boolean;
    testOrderReason: string;
    operatorTestPhone: string | null;
    excludeFromSettlement: boolean;
    excludeFromPaymentMatch: boolean;
    excludeFromShipping: boolean;
    excludeFromPicking: boolean;
  };

  const EMPTY_OPERATOR_TEST_ORDER_FLAGS: OperatorTestOrderFlags = {
    isTestOrder: false,
    testOrderReason: "",
    operatorTestPhone: null,
    excludeFromSettlement: false,
    excludeFromPaymentMatch: false,
    excludeFromShipping: false,
    excludeFromPicking: false,
  };

  const getOperatorTestOrderFlags = async (phoneValue: string): Promise<OperatorTestOrderFlags> => {
    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      return EMPTY_OPERATOR_TEST_ORDER_FLAGS;
    }

    try {
      const response = await fetch(`/api/customer-test-account?phone=${encodeURIComponent(cleanPhone)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || !payload?.isOperatorTestAccount) {
        return EMPTY_OPERATOR_TEST_ORDER_FLAGS;
      }

      return {
        isTestOrder: true,
        testOrderReason: "운영자 테스트 계정 주문",
        operatorTestPhone: cleanPhone,
        excludeFromSettlement: Boolean(payload.excludeFromSettlement),
        excludeFromPaymentMatch: Boolean(payload.excludeFromPaymentMatch),
        excludeFromShipping: Boolean(payload.excludeFromShipping),
        excludeFromPicking: Boolean(payload.excludeFromPicking),
      };
    } catch {
      return EMPTY_OPERATOR_TEST_ORDER_FLAGS;
    }
  };

  const refreshCustomerBlockStatus = async (phoneValue: string) => {
    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      const result = { blocked: false, checking: false, message: "" };
      setCustomerBlockStatus(result);
      return result;
    }

    setCustomerBlockStatus((current) => ({ ...current, checking: true }));

    try {
      const response = await fetch(`/api/customer-block-check?phone=${encodeURIComponent(cleanPhone)}`, {
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "차단 여부 확인 실패");
      }

      const result = {
        blocked: Boolean(payload.blocked),
        checking: false,
        message: Boolean(payload.blocked) ? "현재 주문서 작성이 제한되어 있습니다." : "",
      };

      setCustomerBlockStatus(result);
      return result;
    } catch {
      const result = { blocked: false, checking: false, message: "" };
      setCustomerBlockStatus(result);
      return result;
    }
  };

  useEffect(() => {
    loadOrderSettings();
    loadBroadcast();
    clearLegacyCustomerSessionIfNeeded();
    loadSavedCustomerInfo();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanPhone = normalizePhone(customerPhone);

    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setCustomerBlockStatus({ blocked: false, checking: false, message: "" });
      return;
    }

    const timer = window.setTimeout(() => {
      refreshCustomerBlockStatus(cleanPhone);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [customerPhone]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedConsentVersion = window.localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) || "";
    if (savedConsentVersion === PRIVACY_CONSENT_VERSION) {
      setHasPrivacyConsent(true);
      setPrivacyConsentChecked(true);
    }
  }, []);

  // 저장된 고객정보가 있으면 개인정보 동의 완료 처리
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasSavedCustomerInfo = Boolean(
      youtubeNickname.trim() &&
        customerName.trim() &&
        customerPhone.trim()
    );

    if (!hasSavedCustomerInfo) return;

    window.localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, PRIVACY_CONSENT_VERSION);
                      setHasPrivacyConsent(true);
    setHasPrivacyConsent(true);
    setPrivacyConsentChecked(true);
  }, [youtubeNickname, customerName, customerPhone]);

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
          const nicknameConfirmed = isYoutubeNicknameConfirmVersionCurrent();

          setHasSavedInfo(true);
          setIsEditingCustomerInfo(false);
          setShowSavedCustomerDetail(false);
          setCustomerMode("load");
          setIsCustomerInfoOpen(false);
          setIsKakaoLoginReturn(!nicknameConfirmed);
          window.history.replaceState(null, "", "/order");
          return;
        }

        if (!hasSavedYoutubeNickname && savedPhone.trim()) {
          const restored = await loadExistingCustomerByKakaoPhone(savedPhone);

          if (restored) {
            markYoutubeNicknameConfirmVersionCurrent();
            const nicknameConfirmed = isYoutubeNicknameConfirmVersionCurrent();

            setHasSavedInfo(true);
            setIsEditingCustomerInfo(false);
            setShowSavedCustomerDetail(false);
            setCustomerMode("load");
            setIsCustomerInfoOpen(false);
            setIsKakaoLoginReturn(!nicknameConfirmed);
            window.history.replaceState(null, "", "/order");

            if (nicknameConfirmed) {
              setTimeout(() => {
                document.getElementById("orderProductInputSection")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }, 250);
            }
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
  }, [
    customerPhone,
    zipcode,
    address,
    detailAddress,
    combineShippingSettings.enabled,
    combineShippingSettings.startAt,
    combineShippingSettings.endAt,
    broadcast?.id,
    broadcast?.status,
    broadcast?.started_at,
    broadcast?.created_at,
  ]);


  const loadOrderSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", [
        "customer_card_extra_rate",
        "actual_card_fee_rate",
        "card_payment_min_amount",
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

    const nextCustomerCardRate = Math.min(20, Math.max(0, readNumber("customer_card_extra_rate", 10)));
    const nextActualCardFeeRate = Math.min(20, Math.max(0, readNumber("actual_card_fee_rate", 7)));
    const nextCardPaymentMinAmount = Math.max(0, Math.round(readNumber("card_payment_min_amount", 100000)));
    const nextDefaultShippingFee = Math.max(0, readNumber("default_shipping_fee", 4000));
    const nextRemoteAreaShippingFee = Math.max(nextDefaultShippingFee, readNumber("remote_area_shipping_fee", 6000));

    setCustomerCardRate(nextCustomerCardRate);
    setActualCardFeeRate(nextActualCardFeeRate);
    setCardPaymentMinAmount(nextCardPaymentMinAmount);
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

    if (nextNickname) {
      markYoutubeNicknameConfirmVersionCurrent();
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

    if (nextAddress || nextDetailAddress) {
      setCustomerNotice({
        type: "info",
        message: [
          "저장된 주문자 정보",
          `닉네임: ${nextNickname || "-"} / 이름: ${nextName || "-"}`,
          `전화번호: ${nextPhone || "-"}`,
          `주소: ${[nextAddress, nextDetailAddress].filter(Boolean).join(" ") || "-"}`,
          "주문자 정보가 다르면 상단메뉴 [정보수정]에서 변경해주세요.",
        ]
          .filter(Boolean)
          .join("\n"),
      });
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



  const loadGroupBuyQuickProductsFromCatalog = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*, image_url, main_image_url, external_image_url, detail_image_urls, image_path")
      .neq("status", "숨김")
      .limit(80);

    if (error) {
      console.log("등록상품 빠른선택 불러오기 오류", error.message);
      setGroupBuyQuickProductsFromCatalog([]);
      return;
    }

    const nextProducts = (data || [])
      .map((product: any) => normalizeOrderProductRow(product))
      .filter((product) => product.product_name.trim())
      .filter((product) => product.status !== "숨김");

    setGroupBuyQuickProductsFromCatalog(nextProducts);
  };

  const loadBroadcast = async () => {
    await loadGroupBuyQuickProductsFromCatalog();

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
      .filter((product: any) => product)
      .map((product: any) => ({
        id: product.id,
        product_name: product.product_name || "",
        price: Number(product.price || 0),
        product_note: product.product_note ?? null,
        description: String(product.description ?? ""),
        detail_description: String(product.detail_description ?? ""),
        product_description: String(product.product_description ?? ""),
        detail_image_urls: product.detail_image_urls ?? product.detailImageUrls ?? product.detail_images ?? null,
        images: product.images ?? null,
        product_images: product.product_images ?? null,
        is_pinned: Boolean(product.is_pinned) || Boolean(product.pinned),
        pinned: Boolean(product.pinned) || Boolean(product.is_pinned),
        pinned_at: String(product.pinned_at ?? ""),
        sort_order: Number(product.sort_order ?? product.display_order ?? 999999),
        display_order: Number(product.display_order ?? product.sort_order ?? 999999),
        created_at: String(product.created_at ?? ""),
        updated_at: String(product.updated_at ?? ""),
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

  const normalizeShippingAddressPart = (
    value: unknown,
    options: { removeParentheses?: boolean } = {},
  ) => {
    let nextValue = String(value || "");

    if (options.removeParentheses) {
      nextValue = nextValue.replace(/\([^)]*\)/g, " ");
    }

    return nextValue
      .replace(/\s+/g, " ")
      .replace(/[-‐-‒–—―]/g, "-")
      .trim();
  };

  const hashShippingAddressText = (value: string) => {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
  };

  const getShippingAddressSignature = (
    zipcodeValue: unknown,
    addressValue: unknown,
    detailAddressValue: unknown,
  ) => {
    const normalized = [
      normalizeShippingAddressPart(zipcodeValue),
      normalizeShippingAddressPart(addressValue, { removeParentheses: true }),
      normalizeShippingAddressPart(detailAddressValue),
    ]
      .filter(Boolean)
      .join("|");

    return normalized ? hashShippingAddressText(normalized) : "";
  };

  const currentShippingAddressSignature = getShippingAddressSignature(zipcode, address, detailAddress);

  const resolveCurrentCombineShippingSettings = (sourceSettings: CombineShippingSettings): CombineShippingSettings => {
    const activeBroadcastId = String(broadcast?.id || "").trim();
    const activeBroadcastStatus = String(broadcast?.status || "").trim().toUpperCase();
    const activeBroadcastStartAt = String(broadcast?.started_at || broadcast?.created_at || "").trim();

    if (activeBroadcastId && activeBroadcastStatus === "ON" && activeBroadcastStartAt) {
      const startedAtTime = new Date(activeBroadcastStartAt).getTime();

      if (Number.isFinite(startedAtTime)) {
        return {
          ...sourceSettings,
          enabled: true,
          startAt: new Date(startedAtTime).toISOString(),
          endAt: "2999-12-31T23:59:59.999Z",
        };
      }
    }

    const lookupWindow = resolveCombineShippingLookupWindow(sourceSettings);

    return {
      ...sourceSettings,
      enabled: true,
      startAt: lookupWindow.startAt,
      endAt: lookupWindow.endAt,
    };
  };

  const getCombineShippingLocalKey = (
    phoneValue: string,
    settings: CombineShippingSettings,
    addressSignature = currentShippingAddressSignature,
  ) => {
    const cleanPhone = normalizePhone(phoneValue);
    const safeAddressSignature = addressSignature || "no-address";

    return [
      "ruru_combine_shipping_paid_v2",
      cleanPhone,
      safeAddressSignature,
      settings.startAt || "no_start",
      settings.endAt || "no_end",
    ].join(":");
  };

  const hasPaidShippingInThisBrowser = (
    phoneValue: string,
    settings: CombineShippingSettings,
    addressSignature = currentShippingAddressSignature,
  ) => {
    if (typeof window === "undefined") return false;

    const key = getCombineShippingLocalKey(phoneValue, settings, addressSignature);
    const savedValue = window.localStorage.getItem(key);

    if (savedValue !== "Y") return false;

    const endMs = new Date(settings.endAt).getTime();

    if (!Number.isFinite(endMs)) return false;

    return Date.now() <= endMs;
  };

  const markPaidShippingInThisBrowser = (
    phoneValue: string,
    settings: CombineShippingSettings,
    addressSignature = currentShippingAddressSignature,
  ) => {
    if (typeof window === "undefined") return;

    const cleanPhone = normalizePhone(phoneValue);

    if (cleanPhone.length < 10) return;
    if (!settings.startAt || !settings.endAt) return;
    if (!addressSignature) return;

    const key = getCombineShippingLocalKey(cleanPhone, settings, addressSignature);

    window.localStorage.setItem(key, "Y");
  };

  const checkAlreadyPaidShipping = async (phoneValue = customerPhone) => {
    const cleanPhone = normalizePhone(phoneValue);
    const addressSignature = currentShippingAddressSignature;

    if (cleanPhone.length < 10 || !addressSignature) {
      setAlreadyPaidShipping(false);
      return false;
    }

    const loadedSettings = await loadCombineShippingSettings();
    const settings = resolveCurrentCombineShippingSettings(loadedSettings);

    if (hasPaidShippingInThisBrowser(cleanPhone, settings, addressSignature)) {
      setAlreadyPaidShipping(true);
      return true;
    }

    const formattedPhone = formatOrderPhone(cleanPhone);
    const phoneValues = Array.from(new Set([cleanPhone, formattedPhone].filter(Boolean)));

    const { data, error } = await supabase
      .from("orders")
      .select("id, customer_phone, shipping_fee, adjusted_shipping_fee, order_manage_status, created_at, zipcode, address, detail_address")
      .in("customer_phone", phoneValues)
      .gte("created_at", settings.startAt)
      .lte("created_at", settings.endAt)
      .limit(100);

    if (error) {
      console.log("기존 배송비 확인 오류", error.message);
      setAlreadyPaidShipping(false);
      return false;
    }

    const hasShipping = (data || []).some((order: any) => {
      if (!hasPaidShippingFee(order)) return false;

      const orderAddressSignature = getShippingAddressSignature(
        order.zipcode,
        order.address,
        order.detail_address,
      );

      return Boolean(orderAddressSignature && orderAddressSignature === addressSignature);
    });

    if (hasShipping) {
      markPaidShippingInThisBrowser(cleanPhone, settings, addressSignature);
    }

    setAlreadyPaidShipping(hasShipping);
    return hasShipping;
  };

  const logoutCustomerInfo = () => {

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

    
      showCustomerNotice("로그아웃되었습니다. 오늘도 좋은 하루 보내세요 😊", "success");

    if (typeof window !== "undefined") {
      window.location.replace("/home");
    }
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
      showCustomerNotice("카카오 로그인 설정값이 없습니다. 관리자에게 문의해주세요.");
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
    markYoutubeNicknameConfirmVersionCurrent();
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
      showCustomerNotice("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      showCustomerNotice("전화번호를 정확히 입력해주세요.");
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
        showCustomerNotice("일치하는 고객정보가 없습니다.\n이름과 전화번호를 확인해주세요.");
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

      showCustomerNotice("확인되었습니다. 바로 상품 입력으로 이동했어요.");
    } catch (error: any) {
      showCustomerNotice("확인 중 오류가 발생했습니다.\n\n" + error.message);
    }
  };

  const completeEditCustomerInfo = async () => {
    const cleanPhone = normalizePhone(customerPhone);

    if (!youtubeNickname.trim()) {
      showCustomerNotice("유튜브 닉네임을 입력해주세요.");
      return;
    }

    if (!customerName.trim()) {
      showCustomerNotice("이름을 입력해주세요.");
      return;
    }

    if (cleanPhone.length < 10) {
      showCustomerNotice("전화번호를 정확히 입력해주세요.");
      return;
    }

    if (!address.trim()) {
      showCustomerNotice("주소를 입력해주세요.");
      return;
    }

    try {
      await saveCustomer();
      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);
      setPin("");
      
      showCustomerNotice("고객정보수정이 완료되었습니다.");
    } catch (error: any) {
      showCustomerNotice("고객정보 저장 오류: " + error.message);
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

  const applyManualAddress = (nextAddress: string) => {
    const cleanAddress = nextAddress.trim();

    if (!cleanAddress) {
      showCustomerNotice("주소를 입력해주세요.", "warning");
      return;
    }

    setAddress(cleanAddress);
    setManualAddressOpen(false);

    setTimeout(() => {
      const detailInput = document.querySelector<HTMLInputElement>(
        'input[placeholder*="상세주소"]'
      );
      detailInput?.focus();
    }, 80);
  };

  const openAddressSearch = async () => {
    const manualAddress = () => {
      setManualAddressOpen(true);
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

  const cardExtraBaseAmount = productAmount + shippingFee;
  const cardExtra = paymentMethod === "카드결제"
    ? Math.round(cardExtraBaseAmount * (cardRateForCustomer / 100))
    : 0;
  const totalAmount = productAmount + shippingFee + cardExtra;

  const selectedPointUseAmount = useMemo(() => {
    const currentPoints = Math.max(0, Number(customerPointBalance || 0));
    const requestedPoints = toNumber(pointUseInput);
    const payableAmount = Math.max(0, Number(totalAmount || 0));

    if (currentPoints < 1000) return 0;
    if (requestedPoints <= 0) return 0;
    if (payableAmount <= 0) return 0;

    return Math.min(currentPoints, requestedPoints, payableAmount);
  }, [customerPointBalance, pointUseInput, totalAmount]);

  const finalPaymentAmount = Math.max(0, totalAmount - selectedPointUseAmount);

  useEffect(() => {
    let alive = true;
    const cleanPhone = normalizePhone(customerPhone);

    if (cleanPhone.length < 10) {
      setCustomerPointBalance(0);
      setCustomerPointLoading(false);
      setPointUseInput("");

      return () => {
        alive = false;
      };
    }

    const loadCustomerPoints = async () => {
      setCustomerPointLoading(true);

      try {
        const response = await fetch(`/api/customer-points?phone=${encodeURIComponent(cleanPhone)}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "포인트 조회 실패");
        }

        const nextPoints = Math.max(0, Number(payload.current_points || 0));

        if (!alive) return;

        setCustomerPointBalance(nextPoints);

        if (nextPoints < 1000) {
          setPointUseInput("");
        }
      } catch {
        if (!alive) return;

        setCustomerPointBalance(0);
        setPointUseInput("");
      } finally {
        if (alive) {
          setCustomerPointLoading(false);
        }
      }
    };

    void loadCustomerPoints();

    return () => {
      alive = false;
    };
  }, [customerPhone]);

  useEffect(() => {
    setPointUseInput((current) => {
      const currentText = String(current || "").trim();

      if (!currentText) return current;

      if (customerPointBalance < 1000 || totalAmount <= 0) {
        return "";
      }

      const currentAmount = toNumber(currentText);
      const maxUsableAmount = Math.min(customerPointBalance, totalAmount);

      if (currentAmount > maxUsableAmount) {
        return String(maxUsableAmount);
      }

      return String(currentAmount);
    });
  }, [customerPointBalance, totalAmount]);

  const filteredBroadcastProducts = useMemo(() => {
    const suggestionProducts = [...groupBuyQuickProductsFromCatalog, ...broadcastProducts];

    return suggestionProducts
      .filter((product) => product && product.status !== "숨김")
      .filter((product) => productSuggestionEnabled(product))
      .filter((product) => productMatchesSuggestion(product, productSearchText))
      .slice(0, 6);
  }, [broadcastProducts, groupBuyQuickProductsFromCatalog, productSearchText]);

  const quickGroupBuyProducts = useMemo(() => {
    const mergedProducts = [...groupBuyQuickProductsFromCatalog, ...broadcastProducts];

    const readPinnedQuickProductValue = (value: unknown) => {
      if (typeof value === "boolean") return value;

      const text = String(value ?? "").trim().toLowerCase();

      return ["true", "1", "y", "yes", "상단", "고정"].includes(text);
    };

    const readQuickProductSortNumber = (value: unknown) => {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : 999999;
    };

    const uniqueProducts = Array.from(
      new Map(
        mergedProducts
          .filter((product) => product && product.status !== "숨김")
          .filter((product) => productRegisteredOrderEnabled(product))
          .map((product) => [String(product.id), product]),
      ).values(),
    );

    return uniqueProducts.sort((a, b) => {
      const pinnedA = readPinnedQuickProductValue(a.is_pinned) || readPinnedQuickProductValue(a.pinned) ? 1 : 0;
      const pinnedB = readPinnedQuickProductValue(b.is_pinned) || readPinnedQuickProductValue(b.pinned) ? 1 : 0;

      if (pinnedA !== pinnedB) return pinnedB - pinnedA;

      if (pinnedA && pinnedB) {
        const pinnedAtA = String(a.pinned_at || "");
        const pinnedAtB = String(b.pinned_at || "");

        if (pinnedAtA !== pinnedAtB) return pinnedAtB.localeCompare(pinnedAtA);
      }

      const sortA = readQuickProductSortNumber(a.sort_order ?? a.display_order);
      const sortB = readQuickProductSortNumber(b.sort_order ?? b.display_order);

      if (sortA !== sortB) return sortA - sortB;

      return String(b.created_at || b.updated_at || b.id).localeCompare(String(a.created_at || a.updated_at || a.id));
    });
  }, [broadcastProducts, groupBuyQuickProductsFromCatalog]);

  const visibleQuickGroupBuyProducts = showAllGroupBuyQuickProducts
    ? quickGroupBuyProducts
    : quickGroupBuyProducts.slice(0, 3);


  const selectBroadcastProduct = (index: number, product: BroadcastProduct) => {
    const productColor = pickRegisteredProductOptionText(product, [
      "color",
      "colors",
      "product_color",
      "product_colors",
      "color_option",
      "color_options",
      "option_color",
    ]);
    const productSize = pickRegisteredProductOptionText(product, [
      "size",
      "sizes",
      "product_size",
      "product_sizes",
      "size_option",
      "size_options",
      "option_size",
    ]);

    updateItem(index, "color", productColor || "없음");
    updateItem(index, "size", productSize || "없음");

    const productPrice = Number(product.price || 0);

    updateItem(index, "product_name", product.product_name);

    updateItem(index, "shipping_type", product.shipping_type || "일반");
    updateItem(index, "combine_shipping", product.combine_shipping || "Y");

    if (toNumber(items[index]?.qty) <= 0) {
      updateItem(index, "qty", "1");
    }

    if (Number.isFinite(productPrice) && productPrice > 0) {
      updateItem(index, "product_price", String(Math.round(productPrice)));
    } else {
      updateItem(index, "product_price", "");
    }

    setProductSearchOpenIndex(null);
    setProductSearchText("");
  };


  const selectQuickGroupBuyProduct = (product: BroadcastProduct) => {
    const emptyIndex = items.findIndex((item) => !item.product_name.trim());

    if (emptyIndex >= 0) {
      selectBroadcastProduct(emptyIndex, product);
      return;
    }

    const productPrice = Number(product.price || 0);
    const nextProductPrice = Number.isFinite(productPrice) && productPrice > 0 ? String(Math.round(productPrice)) : "";
    const productColor = pickRegisteredProductOptionText(product, [
      "color",
      "colors",
      "product_color",
      "product_colors",
      "color_option",
      "color_options",
      "option_color",
    ]);
    const productSize = pickRegisteredProductOptionText(product, [
      "size",
      "sizes",
      "product_size",
      "product_sizes",
      "size_option",
      "size_options",
      "option_size",
    ]);

    const nextItem: OrderItem = {
      product_name: product.product_name,
      color: productColor || "없음",
      size: productSize || "없음",
      qty: "1",
      product_price: nextProductPrice,
      shipping_type: product.shipping_type || "일반",
      combine_shipping: product.combine_shipping || "Y",
    };

    setItems((prev) => [...prev, nextItem]);
    setProductSearchOpenIndex(null);
    setProductSearchText("");
  };

  const getItemOptionSuggestions = (item: OrderItem, field: "color" | "size") => {
    const product = findMatchedBroadcastProduct(item, broadcastProducts);

    return product ? getProductOptionSuggestions(product, field) : [];
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

  const validate = (options?: { allowMissingDetailAddress?: boolean }) => {
    const cleanPhone = normalizePhone(customerPhone);

    if (!youtubeNickname.trim()) {
      showCustomerNotice("유튜브 닉네임을 입력해주세요.");
      return false;
    }

    if (!customerName.trim()) {
      showCustomerNotice("이름을 입력해주세요.");
      return false;
    }

    if (cleanPhone.length < 10) {
      showCustomerNotice("전화번호를 정확히 입력해주세요.");
      return false;
    }


    if (!address.trim()) {
      showCustomerNotice("주소를 입력해주세요.");
      return false;
    }

    if (!detailAddress.trim() && !options?.allowMissingDetailAddress) {
      setMissingDetailAddressConfirmOpen(true);
      return false;
    }

    const validItems = items.filter(
      (item) =>
        item.product_name.trim() ||
        item.color.trim() ||
        item.size.trim() ||
        item.product_price.trim()
    );

    if (validItems.length === 0) {
      showCustomerNotice("상품명을 입력해주세요.");
      return false;
    }

    for (const item of validItems) {
      if (!item.product_name.trim()) {
        showCustomerNotice("상품명을 입력해주세요.");
        return false;
      }

      if (!String(item.color || "").trim()) {
        showCustomerNotice("색상을 입력해주세요.\n색상이 없으면 '없음'이라고 입력해주세요.");
        return false;
      }

      if (!String(item.size || "").trim()) {
        showCustomerNotice("사이즈를 입력해주세요.\n사이즈가 없으면 '없음'이라고 입력해주세요.");
        return false;
      }

      if (!toNumber(item.qty)) {
        showCustomerNotice("수량을 입력해주세요.");
        return false;
      }

      if (!toNumber(item.product_price)) {
        showCustomerNotice("상품금액을 입력해주세요.");
        return false;
      }

      if (toNumber(item.product_price) < 1) {
        showCustomerNotice("상품금액은 1원 이상으로 입력해주세요.");
        return false;
      }
    }

    if (paymentMethod === "카드결제" && productAmount < cardPaymentMinAmount) {
      showCustomerNotice(`카드결제는 ${cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.`);
      return false;
    }

    if (!hasPrivacyConsent && !hasSavedOrderCustomerInfo && !privacyConsentChecked) {
      showCustomerNotice("개인정보 수집·이용 및 배송정보 제공 안내 확인이 필요합니다.");
      return false;
    }

    return true;
  };

  const submitOrder = async (options?: { allowMissingDetailAddress?: boolean }) => {
    const blockCheck = await refreshCustomerBlockStatus(customerPhone);

    if (blockCheck.blocked) {
      setShowDepositConfirmModal(false);
      return;
    }

    if (!validate(options)) return;

    if (!hasPrivacyConsent && privacyConsentChecked && typeof window !== "undefined") {
      window.localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, PRIVACY_CONSENT_VERSION);
      setHasPrivacyConsent(true);
    }

    setSubmitting(true);

    try {
      const cleanPhone = normalizePhone(customerPhone);
      const operatorTestOrderFlags = await getOperatorTestOrderFlags(cleanPhone);
      const paidShippingBeforeSubmit = await checkAlreadyPaidShipping(cleanPhone);
      const validItems = items.filter(
        (item) =>
          item.product_name.trim() ||
          item.color.trim() ||
          item.size.trim() ||
          item.product_price.trim()
      );
      const appliedShippingFeeBreakdown = calculateShippingFeeBreakdown(validItems, paidShippingBeforeSubmit);
      const appliedShippingFee = appliedShippingFeeBreakdown.totalShippingFee;
      const appliedCardExtra =
        paymentMethod === "카드결제"
          ? Math.round((productAmount + appliedShippingFee) * (cardRateForCustomer / 100))
          : 0;
      const appliedTotalAmount = productAmount + appliedShippingFee + appliedCardExtra;
      const latestCombineSettings = await loadCombineShippingSettings();
      const markCombineSettings = resolveCurrentCombineShippingSettings(latestCombineSettings);

      await saveCustomer();

      const groupId = crypto.randomUUID();
      const lookupCode = `RURU-${Date.now().toString(36).toUpperCase()}`;
      const broadcastName =
        broadcast?.broadcast_public_title ||
        broadcast?.public_title ||
        "현재 방송";

      const chargedShippingGroups = new Set<"normal" | "vendor">();

      const orderRows = validItems.map((item) => {
        const qty = toNumber(item.qty);
        const price = toNumber(item.product_price);
        const itemTotal = price * qty;
        const rowShippingGroup = isVendorShippingItem(item) ? "vendor" : "normal";
        let rowShippingFee = 0;

        if (rowShippingGroup === "normal") {
          if (!paidShippingBeforeSubmit && !chargedShippingGroups.has("normal")) {
            rowShippingFee = baseShippingFee;
          }
        } else if (!chargedShippingGroups.has("vendor")) {
          rowShippingFee = baseShippingFee;
        }

        chargedShippingGroups.add(rowShippingGroup);
        const rowCardExtra =
          paymentMethod === "카드결제"
            ? Math.round((itemTotal + rowShippingFee) * (cardRateForCustomer / 100))
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

          is_test_order: operatorTestOrderFlags.isTestOrder,
          test_order_reason: operatorTestOrderFlags.isTestOrder ? operatorTestOrderFlags.testOrderReason : null,
          operator_test_phone: operatorTestOrderFlags.isTestOrder ? operatorTestOrderFlags.operatorTestPhone : null,
          exclude_from_settlement: operatorTestOrderFlags.excludeFromSettlement,
          exclude_from_payment_match: operatorTestOrderFlags.excludeFromPaymentMatch,
          exclude_from_shipping: operatorTestOrderFlags.excludeFromShipping,
          exclude_from_picking: operatorTestOrderFlags.excludeFromPicking,

          memo: itemLabel(item),
          special_note: requestMemo.trim(),
        };
      });

      const requestedPointUseAmount = toNumber(pointUseInput);
      const appliedPointUseAmount =
        customerPointBalance >= 1000
          ? Math.min(requestedPointUseAmount, customerPointBalance, appliedTotalAmount)
          : 0;

      const orderSubmitResponse = await fetch("/api/customer-orders/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          orderRows,
          point_use_amount: appliedPointUseAmount,
          customer_phone: cleanPhone,
          youtube_nickname: youtubeNickname.trim(),
          customer_name: customerName.trim(),
        }),
      });

      const orderSubmitPayload = await orderSubmitResponse.json().catch(() => null);

      if (!orderSubmitResponse.ok || !orderSubmitPayload?.ok) {
        throw new Error(orderSubmitPayload?.message || "주문 저장 실패");
      }

      const savedPointUsedAmount = toNumber(orderSubmitPayload?.point_used_amount);
      const savedPointOriginalAmount = toNumber(orderSubmitPayload?.point_original_amount) || appliedTotalAmount;
      const savedFinalAmount = Math.max(0, savedPointOriginalAmount - savedPointUsedAmount);

      if (savedPointUsedAmount > 0) {
        setCustomerPointBalance((current) => Math.max(0, Number(current || 0) - savedPointUsedAmount));
      }

      setDone({
        nickname: youtubeNickname.trim(),
        name: customerName.trim(),
        paymentMethod,
        items: validItems,
        totalQty,
        productAmount,
        shippingFee: appliedShippingFee,
        cardExtra: appliedCardExtra,
        customerCardRate: cardRateForCustomer,
        totalAmount: appliedTotalAmount,
        pointUsedAmount: savedPointUsedAmount,
        finalAmount: savedFinalAmount,
      });

      setItems([{ ...emptyItem }]);
      setRequestMemo("");
      setPaymentMethod("무통장입금");
      setPointUseInput("");
      setPin("");

      if (appliedShippingFeeBreakdown.normalShippingFee > 0) {
        markPaidShippingInThisBrowser(cleanPhone, markCombineSettings);
      }

      setAlreadyPaidShipping(paidShippingBeforeSubmit || appliedShippingFeeBreakdown.normalShippingFee > 0);

      setIsEditingCustomerInfo(false);
      setIsCustomerInfoOpen(false);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      showCustomerNotice("주문서 제출 오류: " + error.message);
    }

    setSubmitting(false);
  };

  const submitOrderWithoutDetailAddress = async () => {
    setMissingDetailAddressConfirmOpen(false);
    await submitOrder({ allowMissingDetailAddress: true });
  };

  const copyBankAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1800);
    } catch {
      showCustomerNotice(BANK_ACCOUNT);
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
      <main className="min-h-screen bg-[#f5f8ff] px-3 py-4 text-[#151923] select-none sm:px-4 sm:py-6" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
        <section className="mx-auto w-full max-w-md">
          <TopCustomerNav />

          <OrderCompletePaymentNotice
            nickname={done.nickname}
            name={done.name}
            paymentMethod={done.paymentMethod}
            productAmount={done.productAmount}
            shippingFee={done.shippingFee}
            totalAmount={done.totalAmount}
            pointUsedAmount={done.pointUsedAmount}
            finalAmount={done.finalAmount}
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
<section id="orderProductInputSection" className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-black">함께 주문 가능 상품</h2>
          <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">필요한 상품은 선택하고, 목록에 없으면 아래 상품명에 직접 적어주세요.</p>



          <div className="mt-4 grid gap-4">
            <GroupBuyQuickSelect
              products={quickGroupBuyProducts as GroupBuyQuickSelectProduct[]}
              onSelect={(product) => selectQuickGroupBuyProduct(product as BroadcastProduct)}
            />

            {items.map((item, index) => (
              <div key={index} className="rounded-[26px] border border-blue-100 bg-white p-3.5 shadow-[0_10px_22px_rgba(30,64,175,0.06)] sm:p-4">
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
                  <div data-ruru-product-search-area className="relative">
                    <div className="relative min-w-0 [&>input]:w-full [&>input]:min-w-0 [&>input]:pr-10">
<input
                      value={item.product_name}
                      onFocus={() => {
                        if (broadcastProducts.length + groupBuyQuickProductsFromCatalog.length > 0) {
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
  <OrderInputClearButton
    show={String(item.product_name ?? "").length > 0}
    label="상품명 지우기"
    onClear={() => updateItem(index, "product_name", "")}
  />
</div>

                    {productSearchOpenIndex === index && productSearchText.trim().length > 0 && broadcastProducts.length + groupBuyQuickProductsFromCatalog.length > 0 && (
                      <div className="absolute left-0 right-0 top-[58px] z-40 max-h-72 overflow-auto rounded-3xl border border-blue-100 bg-white p-2 shadow-[0_18px_45px_rgba(30,20,20,0.15)]">
                        <div className="px-3 py-2 text-xs font-black text-blue-600">
                          추천 상품명
                        </div>

                        {filteredBroadcastProducts.length === 0 ? (
                          <div className="px-3 py-4 text-sm font-bold text-gray-500">
                            추천 상품명이 없어요. 방송에서 안내된 상품명 그대로 입력해주세요.
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
                                  {productSuggestionKeywords(product).length > 0 ? (
                                    <div className="mt-1 truncate text-xs font-bold text-gray-500">
                                      {productSuggestionKeywords(product).slice(0, 5).join(", ")}
                                    </div>
                                  ) : null}
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

                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    <div className="relative min-w-0 [&>input]:w-full [&>input]:min-w-0 [&>input]:pr-10">
<input
                      value={item.color}
                      onChange={(event) => updateItem(index, "color", event.target.value)}
                      placeholder="색상"
                      className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />
  <OrderInputClearButton
    show={String(item.color ?? "").length > 0}
    label="색상 지우기"
    onClear={() => updateItem(index, "color", "")}
  />
</div>

                    <div className="relative min-w-0 [&>input]:w-full [&>input]:min-w-0 [&>input]:pr-10">
<input
                      value={item.size}
                      onChange={(event) => updateItem(index, "size", event.target.value)}
                      placeholder="사이즈"
                      className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                    />
  <OrderInputClearButton
    show={String(item.size ?? "").length > 0}
    label="사이즈 지우기"
    onClear={() => updateItem(index, "size", "")}
  />
</div>
                    {(() => {
                      const colorSuggestions = getItemOptionSuggestions(item, "color");
                      const sizeSuggestions = getItemOptionSuggestions(item, "size");

                      if (colorSuggestions.length === 0 && sizeSuggestions.length === 0) {
                        return null;
                      }

                      return (
                        <div data-ruru-option-suggestions className="col-span-2 -mt-1 space-y-2 rounded-2xl bg-blue-50/60 p-3">
                          {colorSuggestions.length > 0 ? (
                            <div>
                              <div className="mb-1 text-[11px] font-black text-blue-600">색상 추천</div>
                              <div className="flex flex-wrap gap-1.5">
                                {colorSuggestions.map((option) => (
                                  <button
                                    key={`color-${option}`}
                                    type="button"
                                    onClick={() => updateItem(index, "color", option)}
                                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-gray-700 shadow-sm ring-1 ring-blue-100"
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {sizeSuggestions.length > 0 ? (
                            <div>
                              <div className="mb-1 text-[11px] font-black text-blue-600">사이즈 추천</div>
                              <div className="flex flex-wrap gap-1.5">
                                {sizeSuggestions.map((option) => (
                                  <button
                                    key={`size-${option}`}
                                    type="button"
                                    onClick={() => updateItem(index, "size", option)}
                                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-gray-700 shadow-sm ring-1 ring-blue-100"
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}

                  </div>

                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
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
                        placeholder="금액"
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
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
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
                {`💳 카드결제는 ${cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.`}
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
              customerPointBalance={customerPointBalance}
              customerPointLoading={customerPointLoading}
              pointUseInput={pointUseInput}
              pointUsedAmount={selectedPointUseAmount}
              finalAmount={finalPaymentAmount}
              showPointUse={customerPointBalance >= 1000 && totalAmount > 0}
              onPointUseInputChange={(value) => setPointUseInput(onlyNumber(value))}
              onUseAllPoints={() => setPointUseInput(String(Math.min(customerPointBalance, totalAmount)))}
            />

            {!hasPrivacyConsent && !hasSavedOrderCustomerInfo && (
              <label className="flex cursor-pointer items-start gap-3 rounded-[22px] bg-blue-50 p-4 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-blue-900 ring-1 ring-blue-100 active:scale-[0.99]">
                <input
                  type="checkbox"
                  checked={privacyConsentChecked}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPrivacyConsentChecked(checked);
                    if (checked && typeof window !== "undefined") {
                      window.localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, PRIVACY_CONSENT_VERSION);
                    }
                  }}
                  className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                />
                <span>
                  [필수] 개인정보 수집·이용 및 배송정보 제공 안내를 확인했습니다.
                  <br />
                  <span className="text-slate-500">한 번 동의하면 다음부터 다시 묻지 않습니다.</span>
                </span>
              </label>
            )}

                        <CustomerToastNotice
              open={Boolean(customerNotice.message)}
              type={customerNotice.type}
              message={customerNotice.message}
              onClose={closeCustomerNotice}
            />

            <CustomerManualAddressPanel
              open={manualAddressOpen}
              defaultValue={address}
              onClose={() => setManualAddressOpen(false)}
              onSubmit={applyManualAddress}
            />

            <CustomerMissingDetailAddressPanel
              open={missingDetailAddressConfirmOpen}
              onClose={() => setMissingDetailAddressConfirmOpen(false)}
              onConfirm={submitOrderWithoutDetailAddress}
            />

            {customerBlockStatus.blocked ? (
              <CustomerBlockedNotice />
            ) : null}

            <button
              type="button"
              onClick={handleSubmitOrderClick}
              disabled={submitting || customerBlockStatus.blocked}
              className={`${buttonBase} rounded-2xl bg-blue-500 p-5 text-lg font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50`}
            >
              {customerBlockStatus.blocked ? "주문 제한됨" : submitting ? "제출 중..." : "주문서 제출하기"}
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
