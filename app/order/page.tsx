// app/order/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/order/page.tsx
//
// 최종 복구/수정본
// - 기존고객/신규고객 선택 화면 제거
// - 저장된 고객정보 자동 입력
// - [정보수정] 버튼 / [로그아웃] 버튼
// - 주문상품 모든 칸 필수: 상품명/색상/사이즈/수량/상품금액
// - 색상/사이즈가 없으면 빈값으로 제출 가능
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
const normalizeEmptyProductOptionValue = (value: unknown) => {
  // data-ruru-no-auto-none-option="enabled"
  // 등록상품 선택 시 색상/사이즈 옵션이 비어 있으면 고객 입력칸도 빈칸으로 유지합니다.
  // 고객이 직접 "없음"을 입력하는 것은 직접입력 onChange에서 그대로 처리됩니다.
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) return "";

  if (["없음", "없슴", "색상없음", "사이즈없음", "옵션없음", "x", "X", "-", "none", "None", "NONE"].includes(text)) {
    return "";
  }

  return text;
};


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
import CustomerPaymentGuideBottomSheet from "@/components/customer/CustomerPaymentGuideBottomSheet";
import CustomerInfoEditBottomSheet from "@/components/customer/CustomerInfoEditBottomSheet";
import CustomerOrderLookupBottomSheet, {
  type CustomerOrderLookupFilter,
  type CustomerOrderLookupItem,
} from "@/components/customer/CustomerOrderLookupBottomSheet";
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
  product_id?: string;
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

type PaidShippingGroups = { normal: boolean; vendor: boolean };

const EMPTY_PAID_SHIPPING_GROUPS: PaidShippingGroups = { normal: false, vendor: false };

const normalizePaidShippingGroups = (value: boolean | PaidShippingGroups): PaidShippingGroups => {
  if (typeof value === "boolean") {
    return { normal: value, vendor: value };
  }

  return {
    normal: Boolean(value?.normal),
    vendor: Boolean(value?.vendor),
  };
};

const resolveShippingGroupFromValue = (value: unknown): "normal" | "vendor" => {
  const record = (value || {}) as Record<string, unknown>;
  const shippingType = String(record.shipping_type ?? record.delivery_type ?? "").trim().toLowerCase();
  const combineShipping = String(record.combine_shipping ?? "").trim().toUpperCase();

  if (
    shippingType.includes("vendor") ||
    shippingType.includes("업체") ||
    combineShipping === "N"
  ) {
    return "vendor";
  }

  return "normal";
};

const BANK_NAME = "새마을금고";
const BANK_ACCOUNT = "9002186993725";
const BANK_HOLDER = "유혜원";

const ORDER_LOOKUP_FILTERS = ["전체", "입금대기", "입금확인", "출고완료"] as const;
const ORDER_LOOKUP_PER_PAGE = 2;
const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";
const ORDER_FIRST_GUIDE_HIDE_UNTIL_KEY = "ruru_order_first_guide_hide_until";

const emptyItem: OrderItem = {
  product_id: "",
  product_name: "",
  color: "",
  size: "",
  qty: "",
  product_price: "",
  shipping_type: "일반",
  combine_shipping: "Y",
};

const ORDER_DRAFT_STORAGE_KEY = "ruru_order_draft_v1";

type OrderDraftData = {
  items?: OrderItem[];
  paymentMethod?: "무통장입금" | "카드결제";
  requestMemo?: string;
  pointUseInput?: string;
  savedAt?: number;
};

const readOrderDraftText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

const isMeaningfulOrderItem = (item: Partial<OrderItem> | undefined) => {
  if (!item) return false;

  return Boolean(
    readOrderDraftText(item.product_name).trim() ||
      readOrderDraftText(item.color).trim() ||
      readOrderDraftText(item.size).trim() ||
      readOrderDraftText(item.qty).trim() ||
      readOrderDraftText(item.product_price).trim()
  );
};

const normalizeOrderDraftItem = (value: unknown): OrderItem | null => {
  const record = (value || {}) as Record<string, unknown>;
  const productId = readOrderDraftText(record.product_id).trim();

  const nextItem: OrderItem = {
    ...(productId ? { product_id: productId } : {}),
    product_name: readOrderDraftText(record.product_name),
    color: readOrderDraftText(record.color),
    size: readOrderDraftText(record.size),
    qty: readOrderDraftText(record.qty),
    product_price: readOrderDraftText(record.product_price),
    shipping_type: readOrderDraftText(record.shipping_type),
    combine_shipping: readOrderDraftText(record.combine_shipping),
  };

  return isMeaningfulOrderItem(nextItem) ? nextItem : null;
};

const normalizeOrderDraftItems = (value: unknown): OrderItem[] => {
  if (!Array.isArray(value)) return [{ ...emptyItem }];

  const nextItems = value
    .map((item) => normalizeOrderDraftItem(item))
    .filter((item): item is OrderItem => Boolean(item));

  return nextItems.length > 0 ? nextItems : [{ ...emptyItem }];
};

const readOrderDraftData = (): OrderDraftData | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(ORDER_DRAFT_STORAGE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as OrderDraftData;
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch {
    return null;
  }
};

const writeOrderDraftData = (draft: OrderDraftData) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ORDER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // 임시저장 실패는 주문서 작성 자체를 막지 않습니다.
  }
};

const clearOrderDraftData = () => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ORDER_DRAFT_STORAGE_KEY);
  } catch {
    // 임시저장 삭제 실패는 주문 저장 로직에 영향을 주지 않습니다.
  }
};


const onlyNumber = (value: string) => String(value || "").replace(/[^0-9]/g, "");
const normalizePhone = (value: string) => normalizeOrderPhone(value);
const formatPhone = (value: string) => formatOrderPhone(value);
const toNumber = (value: any) => Number(String(value || "0").replace(/[^0-9]/g, "")) || 0;
const moneyText = (value: any) => toNumber(value).toLocaleString();
const commaNumberText = (value: any) => {
  const digits = onlyNumber(String(value || ""));
  return digits ? Number(digits).toLocaleString() : "";
};
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
  const noteRecord = (note || {}) as Record<string, unknown>;
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
    values.push(...splitProductOptionValue(noteRecord.color_options));
    values.push(...splitProductOptionValue(noteRecord.product_colors));
    values.push(...splitProductOptionValue(noteRecord.option_color));
    values.push(...splitProductOptionValue(record.colors));
    values.push(...splitProductOptionValue(record.color_options));
    values.push(...splitProductOptionValue(record.product_colors));
    values.push(...splitProductOptionValue(record.option_color));
    values.push(...splitProductOptionValue(record.color));
  } else {
    values.push(...splitProductOptionValue(note?.sizes));
    values.push(...splitProductOptionValue(noteRecord.size_options));
    values.push(...splitProductOptionValue(noteRecord.product_sizes));
    values.push(...splitProductOptionValue(noteRecord.option_size));
    values.push(...splitProductOptionValue(record.sizes));
    values.push(...splitProductOptionValue(record.size_options));
    values.push(...splitProductOptionValue(record.product_sizes));
    values.push(...splitProductOptionValue(record.option_size));
    values.push(...splitProductOptionValue(record.size));
  }

  return uniqueOptionValues(values);
}

function getSelectableRegisteredOptions(product: BroadcastProduct, field: "color" | "size"): string[] {
  return getProductOptionSuggestions(product, field)
    .map((value) => normalizeEmptyProductOptionValue(value))
    .map((value) => value.trim())
    .filter(Boolean);
}

function registeredProductNeedsOptionSelect(product: BroadcastProduct): boolean {
  return (
    getSelectableRegisteredOptions(product, "color").length > 0 ||
    getSelectableRegisteredOptions(product, "size").length > 0
  );
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
  const [nicknameCopyDone, setNicknameCopyDone] = useState(false);
  const [paymentGuideOpen, setPaymentGuideOpen] = useState(false);
  const [firstOrderGuideOpen, setFirstOrderGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hideUntil = Number(window.localStorage.getItem(ORDER_FIRST_GUIDE_HIDE_UNTIL_KEY) || 0);
    if (!hideUntil || Date.now() > hideUntil) {
      setFirstOrderGuideOpen(true);
    }
  }, []);

  const closeFirstOrderGuide = (hideToday: boolean) => {
    if (hideToday && typeof window !== "undefined") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      window.localStorage.setItem(ORDER_FIRST_GUIDE_HIDE_UNTIL_KEY, String(endOfToday.getTime()));
    }

    setFirstOrderGuideOpen(false);
  };
  const [customerInfoEditSheetOpen, setCustomerInfoEditSheetOpen] = useState(false);
  const [customerInfoEditSnapshot, setCustomerInfoEditSnapshot] = useState<{
    youtubeNickname: string;
    customerName: string;
    customerPhone: string;
    address: string;
    detailAddress: string;
  } | null>(null);
  const [orderLookupOpen, setOrderLookupOpen] = useState(false);
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [orderLookupOrders, setOrderLookupOrders] = useState<any[]>([]);
  const [orderLookupFilter, setOrderLookupFilter] = useState<CustomerOrderLookupFilter>("전체");
  const [orderLookupPage, setOrderLookupPage] = useState(1);
  const [customerCardRate, setCustomerCardRate] = useState(10);
  const [actualCardFeeRate, setActualCardFeeRate] = useState(7);
  const [cardPaymentMinAmount, setCardPaymentMinAmount] = useState(100000);
  const [defaultShippingFee, setDefaultShippingFee] = useState(4000);
  const [remoteAreaShippingFee, setRemoteAreaShippingFee] = useState(6000);
  const [combineShippingSettings, setCombineShippingSettings] =
    useState<CombineShippingSettings>(DEFAULT_COMBINE_SHIPPING_SETTINGS);
  const [alreadyPaidShipping, setAlreadyPaidShipping] = useState(false);
  const [paidShippingGroups, setPaidShippingGroups] = useState<PaidShippingGroups>({ ...EMPTY_PAID_SHIPPING_GROUPS });
  const [customerPointBalance, setCustomerPointBalance] = useState(0);
  const [customerPointLoading, setCustomerPointLoading] = useState(false);
  const [pointUseInput, setPointUseInput] = useState("");
  const [directInputOpen, setDirectInputOpen] = useState(false);
  const [directInputKeyboardInset, setDirectInputKeyboardInset] = useState(0);
  const [directInputProductSearchMode, setDirectInputProductSearchMode] = useState(false);
  const [directInputTargetIndex, setDirectInputTargetIndex] = useState(0);
  const [registeredOptionSelectProduct, setRegisteredOptionSelectProduct] = useState<BroadcastProduct | null>(null);
  const [registeredOptionColor, setRegisteredOptionColor] = useState("");
  const [registeredOptionSize, setRegisteredOptionSize] = useState("");
  const [registeredOptionQty, setRegisteredOptionQty] = useState(1);

  useEffect(() => {
    if (!directInputOpen || typeof window === "undefined") {
      setDirectInputKeyboardInset(0);
      return;
    }

    const viewport = window.visualViewport;

    const updateKeyboardInset = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const nextInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);

      setDirectInputKeyboardInset(nextInset > 80 ? Math.min(Math.round(nextInset), 360) : 0);
    };

    updateKeyboardInset();

    viewport?.addEventListener("resize", updateKeyboardInset);
    viewport?.addEventListener("scroll", updateKeyboardInset);
    window.addEventListener("resize", updateKeyboardInset);

    return () => {
      viewport?.removeEventListener("resize", updateKeyboardInset);
      viewport?.removeEventListener("scroll", updateKeyboardInset);
      window.removeEventListener("resize", updateKeyboardInset);
    };
  }, [directInputOpen]);

  const [orderDraftRestored, setOrderDraftRestored] = useState(false);

  useEffect(() => {
    const draft = readOrderDraftData();

    if (draft) {
      const draftItems = normalizeOrderDraftItems(draft.items);

      setItems(draftItems);

      if (draft.paymentMethod === "무통장입금" || draft.paymentMethod === "카드결제") {
        setPaymentMethod(draft.paymentMethod);
      }

      if (typeof draft.requestMemo === "string") {
        setRequestMemo(draft.requestMemo);
      }

      if (typeof draft.pointUseInput === "string") {
        setPointUseInput(onlyNumber(draft.pointUseInput));
      }
    }

    setOrderDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!orderDraftRestored || done) return;

    const draftItems = normalizeOrderDraftItems(items);
    const hasMeaningfulDraft =
      draftItems.some((item) => isMeaningfulOrderItem(item)) ||
      requestMemo.trim() ||
      pointUseInput.trim() ||
      paymentMethod !== "무통장입금";

    if (!hasMeaningfulDraft) {
      clearOrderDraftData();
      return;
    }

    writeOrderDraftData({
      items: draftItems,
      paymentMethod,
      requestMemo,
      pointUseInput,
      savedAt: Date.now(),
    });
  }, [orderDraftRestored, items, paymentMethod, requestMemo, pointUseInput, done]);

  const isRemoteAreaShippingAddress = isRemoteAreaAddress(zipcode, address, detailAddress);
  // 배송비 기준은 관리자 설정값(settings.default_shipping_fee)을 우선 적용합니다.
  // 기존 broadcast.shipping_fee는 방송 생성 당시 값이 남아 설정 변경(예: 0원)을 막을 수 있어
  // 고객 주문서 계산에서는 사용하지 않습니다.
  const generalShippingFee = Math.max(0, Number(defaultShippingFee || 0));
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

  const isCanceledOrderForCombineShipping = (order: { order_manage_status?: unknown }) => {
    const statusText = String(order?.order_manage_status || "").trim().toLowerCase();

    return /주문서취소|주문취소|취소|환불|cancel|refund/.test(statusText);
  };

  const calculateShippingFeeBreakdown = (
    targetItems: OrderItem[],
    paidShippingBeforeSubmitValue: boolean | PaidShippingGroups,
  ) => {
    const paidShippingGroups = normalizePaidShippingGroups(paidShippingBeforeSubmitValue);
    const chargeableItems = getChargeableShippingItems(targetItems);

    const hasNormalShippingItem = chargeableItems.some(
      (item) => resolveShippingGroupFromValue(item) === "normal",
    );
    const hasVendorShippingItem = chargeableItems.some(
      (item) => resolveShippingGroupFromValue(item) === "vendor",
    );

    const normalShippingFee =
      hasNormalShippingItem && !paidShippingGroups.normal ? baseShippingFee : 0;
    const vendorShippingFee =
      hasVendorShippingItem && !paidShippingGroups.vendor ? baseShippingFee : 0;

    return {
      normalShippingFee,
      vendorShippingFee,
      totalShippingFee: normalShippingFee + vendorShippingFee,
    };
  };

  const shippingFeeBreakdown = calculateShippingFeeBreakdown(items, paidShippingGroups);
  const shippingFee = shippingFeeBreakdown.totalShippingFee;
  const chargeableShippingItemsForNotice = getChargeableShippingItems(items);
  const hasNormalShippingItemForNotice = chargeableShippingItemsForNotice.some(
    (item) => resolveShippingGroupFromValue(item) === "normal",
  );
  const hasVendorShippingItemForNotice = chargeableShippingItemsForNotice.some(
    (item) => resolveShippingGroupFromValue(item) === "vendor",
  );
  const isFreeShippingEvent = baseShippingFee <= 0;
  const shippingNoticeText = (() => {
    if (chargeableShippingItemsForNotice.length <= 0) return "";

    if (shippingFee > 0) {
      if (shippingFeeBreakdown.normalShippingFee > 0 && shippingFeeBreakdown.vendorShippingFee > 0) {
        return `일반배송과 업체배송이 함께 있어 배송비가 각각 적용됩니다. 총 배송비 ${won(shippingFee)}입니다.`;
      }

      if (shippingFeeBreakdown.vendorShippingFee > 0 && paidShippingGroups.normal) {
        return `기존 일반배송 주문과는 별도 출고되는 업체배송 상품이라 배송비 ${won(shippingFee)}이 추가 적용됩니다.`;
      }

      if (shippingFeeBreakdown.normalShippingFee > 0 && paidShippingGroups.vendor) {
        return `기존 업체배송 주문과는 별도 출고되는 일반배송 상품이라 배송비 ${won(shippingFee)}이 적용됩니다.`;
      }

      if (shippingFeeBreakdown.vendorShippingFee > 0) {
        return `업체배송 상품 배송비 ${won(shippingFee)}이 적용됩니다.`;
      }

      if (isRemoteAreaShippingAddress) {
        return `제주/도서/산간 배송지 기준 배송비 ${won(shippingFee)}이 적용됩니다.`;
      }

      return `배송비 ${won(shippingFee)}이 적용됩니다.`;
    }

    if (isFreeShippingEvent) {
      return "무료배송 이벤트가 적용되어 이번 주문서 배송비는 0원입니다.";
    }

    if (hasNormalShippingItemForNotice && hasVendorShippingItemForNotice && paidShippingGroups.normal && paidShippingGroups.vendor) {
      return "기존 일반배송/업체배송 주문과 각각 합배송되어 이번 주문서 배송비는 0원입니다.";
    }

    if (hasVendorShippingItemForNotice && paidShippingGroups.vendor && !hasNormalShippingItemForNotice) {
      return "기존 업체배송 주문과 합배송되어 이번 주문서 배송비는 0원입니다.";
    }

    if (hasNormalShippingItemForNotice && paidShippingGroups.normal && !hasVendorShippingItemForNotice) {
      return "기존 일반배송 주문과 합배송되어 이번 주문서 배송비는 0원입니다.";
    }

    if (hasVendorShippingItemForNotice && paidShippingGroups.vendor) {
      return "기존 업체배송 주문과 합배송되어 이번 주문서 배송비는 0원입니다.";
    }

    if (hasNormalShippingItemForNotice && paidShippingGroups.normal) {
      return "기존 일반배송 주문과 합배송되어 이번 주문서 배송비는 0원입니다.";
    }

    return "합배송/무료배송 조건으로 이번 주문서 배송비는 0원입니다.";
  })();
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
      .limit(80);

    if (error) {
      console.log("등록상품 빠른선택 불러오기 오류", error.message);
      setGroupBuyQuickProductsFromCatalog([]);
      return;
    }

    const nextProducts = (data || [])
      .map((product: any) => normalizeOrderProductRow(product))
      .filter((product) => product.product_name.trim())
      .filter((product) => product.status !== "숨김" || productSuggestionEnabled(product));

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

  const checkAlreadyPaidShippingGroups = async (phoneValue = customerPhone): Promise<PaidShippingGroups> => {
    const cleanPhone = normalizePhone(phoneValue);
    const addressSignature = currentShippingAddressSignature;

    if (cleanPhone.length < 10 || !addressSignature) {
      setAlreadyPaidShipping(false);
      setPaidShippingGroups({ ...EMPTY_PAID_SHIPPING_GROUPS });
      return { ...EMPTY_PAID_SHIPPING_GROUPS };
    }

    const loadedSettings = await loadCombineShippingSettings();
    const settings = resolveCurrentCombineShippingSettings(loadedSettings);

    const formattedPhone = formatOrderPhone(cleanPhone);
    const phoneValues = Array.from(new Set([cleanPhone, formattedPhone].filter(Boolean)));

    const { data, error } = await supabase
      .from("orders")
      .select("id, product_id, customer_phone, shipping_fee, adjusted_shipping_fee, order_manage_status, created_at, zipcode, address, detail_address")
      .in("customer_phone", phoneValues)
      .gte("created_at", settings.startAt)
      .lte("created_at", settings.endAt)
      .limit(100);

    if (error) {
      console.log("기존 배송비 확인 오류", error.message);
      setAlreadyPaidShipping(false);
      setPaidShippingGroups({ ...EMPTY_PAID_SHIPPING_GROUPS });
      return { ...EMPTY_PAID_SHIPPING_GROUPS };
    }

    const activeCombineShippingOrders = (data || []).filter(
      (order: any) => !isCanceledOrderForCombineShipping(order),
    );

    const paidShippingOrders = activeCombineShippingOrders.filter((order: any) => {
      if (!hasPaidShippingFee(order)) return false;

      const orderAddressSignature = getShippingAddressSignature(
        order.zipcode,
        order.address,
        order.detail_address,
      );

      return Boolean(orderAddressSignature && orderAddressSignature === addressSignature);
    });

    const productIds = Array.from(
      new Set(
        paidShippingOrders
          .map((order: any) => String(order?.product_id || "").trim())
          .filter(Boolean),
      ),
    );

    const productShippingMap = new Map<string, Record<string, unknown>>();

    if (productIds.length > 0) {
      const { data: products, error: productError } = await supabase
        .from("products")
        .select("id, shipping_type, combine_shipping, product_type")
        .in("id", productIds);

      if (productError) {
        console.log("배송비 상품유형 확인 오류", productError.message);
      } else {
        (products || []).forEach((product: any) => {
          productShippingMap.set(String(product.id), product);
        });
      }
    }

    const groups: PaidShippingGroups = { ...EMPTY_PAID_SHIPPING_GROUPS };

    paidShippingOrders.forEach((order: any) => {
      const productId = String(order?.product_id || "").trim();
      const product = productId ? productShippingMap.get(productId) : null;
      const group = product ? resolveShippingGroupFromValue(product) : "normal";

      groups[group] = true;
    });

    if (groups.normal || groups.vendor) {
      markPaidShippingInThisBrowser(cleanPhone, settings, addressSignature);
    }

    setPaidShippingGroups(groups);
    setAlreadyPaidShipping(groups.normal || groups.vendor);
    return groups;
  };

  const checkAlreadyPaidShipping = async (phoneValue = customerPhone) => {
    const groups = await checkAlreadyPaidShippingGroups(phoneValue);
    return groups.normal || groups.vendor;
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
    setAlreadyPaidShipping(false);
    setPaidShippingGroups({ ...EMPTY_PAID_SHIPPING_GROUPS });
    
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
      setCustomerInfoEditSheetOpen(false);
      setCustomerInfoEditSnapshot(null);
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
      .filter((product) => product && product.product_name.trim())
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

    updateItem(index, "color", normalizeEmptyProductOptionValue(productColor));
    updateItem(index, "size", normalizeEmptyProductOptionValue(productSize));

    const productPrice = Number(product.price || 0);

    updateItem(index, "product_id", String(product.id ?? ""));
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


  const addRegisteredProductToOrderItems = (
    product: BroadcastProduct,
    options?: { color?: string; size?: string; qty?: number }
  ) => {
    const productPrice = Number(product.price || 0);
    const nextProductPrice = Number.isFinite(productPrice) && productPrice > 0 ? String(Math.round(productPrice)) : "";

    const fallbackColor = pickRegisteredProductOptionText(product, [
      "color",
      "colors",
      "product_color",
      "product_colors",
      "color_option",
      "color_options",
      "option_color",
    ]);
    const fallbackSize = pickRegisteredProductOptionText(product, [
      "size",
      "sizes",
      "product_size",
      "product_sizes",
      "size_option",
      "size_options",
      "option_size",
    ]);

    const nextItem: OrderItem = {
      product_id: String(product.id ?? ""),
      product_name: product.product_name,
      color: normalizeEmptyProductOptionValue(options?.color ?? fallbackColor),
      size: normalizeEmptyProductOptionValue(options?.size ?? fallbackSize),
      qty: String(Math.max(1, Number(options?.qty || 1))),
      product_price: nextProductPrice,
      shipping_type: product.shipping_type || "일반",
      combine_shipping: product.combine_shipping || "Y",
    };

    setItems((prev) => {
      const emptyIndex = prev.findIndex((item) => !item.product_name.trim());

      if (emptyIndex >= 0) {
        return prev.map((item, index) => (index === emptyIndex ? nextItem : item));
      }

      return [...prev, nextItem];
    });

    setProductSearchOpenIndex(null);
    setProductSearchText("");
  };

  const openRegisteredOptionSelectSheet = (product: BroadcastProduct) => {
    setRegisteredOptionSelectProduct(product);
    setRegisteredOptionColor("");
    setRegisteredOptionSize("");
    setRegisteredOptionQty(1);
  };

  const closeRegisteredOptionSelectSheet = () => {
    setRegisteredOptionSelectProduct(null);
    setRegisteredOptionColor("");
    setRegisteredOptionSize("");
    setRegisteredOptionQty(1);
  };

  const confirmRegisteredOptionSelectSheet = () => {
    const product = registeredOptionSelectProduct;
    if (!product) return;

    const colorOptions = getSelectableRegisteredOptions(product, "color");
    const sizeOptions = getSelectableRegisteredOptions(product, "size");

    if (colorOptions.length > 0 && !registeredOptionColor.trim()) {
      showCustomerNotice("색상을 선택해주세요.");
      return;
    }

    if (sizeOptions.length > 0 && !registeredOptionSize.trim()) {
      showCustomerNotice("사이즈를 선택해주세요.");
      return;
    }

    addRegisteredProductToOrderItems(product, {
      color: registeredOptionColor,
      size: registeredOptionSize,
      qty: registeredOptionQty,
    });

    closeRegisteredOptionSelectSheet();
  };

  const selectQuickGroupBuyProduct = (product: BroadcastProduct) => {
    if (registeredProductNeedsOptionSelect(product)) {
      openRegisteredOptionSelectSheet(product);
      return;
    }

    addRegisteredProductToOrderItems(product);
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
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
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

      // 색상/사이즈는 옵션이 없는 상품도 있어 빈값 제출을 허용합니다.

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
      const paidShippingGroupsBeforeSubmit = await checkAlreadyPaidShippingGroups(cleanPhone);
      const paidShippingBeforeSubmit = paidShippingGroupsBeforeSubmit.normal || paidShippingGroupsBeforeSubmit.vendor;
      const validItems = items.filter(
        (item) =>
          item.product_name.trim() ||
          item.color.trim() ||
          item.size.trim() ||
          item.product_price.trim()
      );
      const appliedShippingFeeBreakdown = calculateShippingFeeBreakdown(validItems, paidShippingGroupsBeforeSubmit);
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
        const rowShippingGroup = resolveShippingGroupFromValue(item);
        let rowShippingFee = 0;

        if (rowShippingGroup === "normal") {
          if (!paidShippingGroupsBeforeSubmit.normal && !chargedShippingGroups.has("normal")) {
            rowShippingFee = baseShippingFee;
          }
        } else if (!paidShippingGroupsBeforeSubmit.vendor && !chargedShippingGroups.has("vendor")) {
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

          product_id: item.product_id ? item.product_id : null,
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

      setPaymentGuideOpen(true);

      clearOrderDraftData();

      setItems([{ ...emptyItem }]);
      setRequestMemo("");
      setPaymentMethod("무통장입금");
      setPointUseInput("");
      setPin("");

      const nextPaidShippingGroupsAfterSubmit: PaidShippingGroups = {
        normal: paidShippingGroupsBeforeSubmit.normal || appliedShippingFeeBreakdown.normalShippingFee > 0,
        vendor: paidShippingGroupsBeforeSubmit.vendor || appliedShippingFeeBreakdown.vendorShippingFee > 0,
      };

      if (appliedShippingFeeBreakdown.totalShippingFee > 0) {
        markPaidShippingInThisBrowser(cleanPhone, markCombineSettings);
      }

      setPaidShippingGroups(nextPaidShippingGroupsAfterSubmit);
      setAlreadyPaidShipping(nextPaidShippingGroupsAfterSubmit.normal || nextPaidShippingGroupsAfterSubmit.vendor);

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

  const copyDepositNickname = async () => {
    const nickname = String(done?.nickname || youtubeNickname || customerName || "").trim();

    if (!nickname) {
      showCustomerNotice("복사할 닉네임이 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(nickname);
      setNicknameCopyDone(true);
      setTimeout(() => setNicknameCopyDone(false), 1800);
    } catch {
      showCustomerNotice(nickname);
    }
  };

  const openCustomerInfoEditBottomSheet = () => {
    setCustomerInfoEditSnapshot({
      youtubeNickname,
      customerName,
      customerPhone,
      address,
      detailAddress,
    });
    setCustomerInfoEditSheetOpen(true);
  };

  const closeCustomerInfoEditBottomSheet = () => {
    if (customerInfoEditSnapshot) {
      setYoutubeNickname(customerInfoEditSnapshot.youtubeNickname);
      setCustomerName(customerInfoEditSnapshot.customerName);
      setCustomerPhone(customerInfoEditSnapshot.customerPhone);
      setAddress(customerInfoEditSnapshot.address);
      setDetailAddress(customerInfoEditSnapshot.detailAddress);
    }

    setYoutubeNicknameError("");
    setCustomerInfoEditSheetOpen(false);
    setCustomerInfoEditSnapshot(null);
  };

  const ruruOrderLookupWon = (value: unknown) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "0원";
    return `${amount.toLocaleString()}원`;
  };

  const ruruOrderLookupDateText = (value: unknown) => {
    if (!value) return "-";

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "-";

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${month}월 ${day}일 ${hour}:${minute}`;
  };

  const ruruOrderLookupText = (value: unknown) => String(value || "").trim();

  const ruruOrderLookupStatusLabel = (order: any): CustomerOrderLookupFilter => {
    const deliveryText = [
      order?.delivery_status,
      order?.shipping_status,
      order?.tracking_number,
      order?.invoice_number,
      order?.waybill_number,
      order?.order_manage_status,
      order?.admin_status,
    ]
      .map(ruruOrderLookupText)
      .join(" ");

    if (/출고완료|택배출고|배송출발|배송완료|송장/.test(deliveryText)) {
      return "출고완료";
    }

    const paymentText = [
      order?.payment_status,
      order?.deposit_status,
      order?.admin_order_status_v2,
      order?.order_manage_status,
      order?.order_status,
      order?.admin_status,
      order?.status,
      order?.payment_method,
    ]
      .map(ruruOrderLookupText)
      .join(" ");

    if (/입금확인|자동입금|수동입금|결제완료|카드결제완료|확인완료|출고준비/.test(paymentText)) {
      return "입금확인";
    }

    return "입금대기";
  };

  const ruruOrderLookupProductName = (order: any) =>
    ruruOrderLookupText(order?.product_name) ||
    ruruOrderLookupText(order?.representative_product_name) ||
    ruruOrderLookupText(order?.item_name) ||
    ruruOrderLookupText(order?.title) ||
    "주문상품";

  const ruruOrderLookupOptionText = (order: any) =>
    [order?.color, order?.size, order?.option, order?.product_option]
      .map(ruruOrderLookupText)
      .filter(Boolean)
      .join(" / ");

  const ruruOrderLookupQuantityText = (order: any) => {
    const quantity = Number(order?.qty ?? order?.quantity ?? order?.count ?? 0);
    return Number.isFinite(quantity) && quantity > 0 ? `${quantity}개` : "";
  };

  const ruruOrderLookupOrderCode = (order: any) => {
    const ruruCode =
      ruruOrderLookupText(order?.order_lookup_code) ||
      ruruOrderLookupText(order?.order_code) ||
      ruruOrderLookupText(order?.customer_order_code) ||
      ruruOrderLookupText(order?.customer_order_number) ||
      ruruOrderLookupText(order?.public_order_code) ||
      ruruOrderLookupText(order?.public_order_number) ||
      ruruOrderLookupText(order?.order_number) ||
      ruruOrderLookupText(order?.order_no) ||
      ruruOrderLookupText(order?.code);

    if (ruruCode) return ruruCode.startsWith("RURU-") ? ruruCode : `RURU-${ruruCode}`;

    const shortCode = ruruOrderLookupText(order?.short_code);
    if (shortCode) return shortCode.startsWith("RURU-") ? shortCode : `RURU-${shortCode}`;

    const rawIdForRuruFallbackOnly = ruruOrderLookupText(order?.id);
    const createdAt = ruruOrderLookupText(order?.created_at);

    if (!rawIdForRuruFallbackOnly) return "-";

    const cleanId = rawIdForRuruFallbackOnly.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    const tail = cleanId.slice(-6).padStart(6, "0");

    if (!createdAt) return `RURU-${tail}`;

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return `RURU-${tail}`;

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `RURU-${month}${day}-${tail}`;
  };

  const loadOrderLookupOrders = async () => {
    const savedPhone =
      typeof window !== "undefined" ? localStorage.getItem("ruru_customer_phone") || "" : "";
    const cleanPhone = normalizeOrderPhone(String(customerPhone || savedPhone || ""));

    setOrderLookupOpen(true);
    setOrderLookupLoading(true);
    setOrderLookupPage(1);

    if (!cleanPhone) {
      setOrderLookupOrders([]);
      setOrderLookupLoading(false);
      showCustomerNotice("전화번호 저장 후 주문조회가 가능합니다.", "error");
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_phone", cleanPhone)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setOrderLookupOrders([]);
      setOrderLookupLoading(false);
      showCustomerNotice("주문조회 오류: " + error.message, "error");
      return;
    }

    setOrderLookupOrders(data || []);
    setOrderLookupLoading(false);
  };

  const openOrderLookupBottomSheet = () => {
    setOrderLookupFilter("전체");
    setOrderLookupPage(1);
    loadOrderLookupOrders();
  };

  const orderLookupAllItems: CustomerOrderLookupItem[] = orderLookupOrders.map((order) => {
    const statusLabel = ruruOrderLookupStatusLabel(order);
    const finalAmount =
      order?.final_amount ??
      order?.adjusted_total_price ??
      order?.total_price ??
      order?.product_price ??
      0;

    return {
      id: order?.id ?? `${order?.created_at || ""}-${ruruOrderLookupProductName(order)}`,
      productName: ruruOrderLookupProductName(order),
      optionText: ruruOrderLookupOptionText(order),
      quantityText: ruruOrderLookupQuantityText(order),
      amountText: ruruOrderLookupWon(finalAmount),
      statusLabel,
      deliveryLabel: statusLabel === "출고완료" ? "출고완료" : "확인중",
      dateText: ruruOrderLookupDateText(order?.created_at),
      orderCode: ruruOrderLookupOrderCode(order),
    };
  });

  const orderLookupFilteredItems =
    orderLookupFilter === "전체"
      ? orderLookupAllItems
      : orderLookupAllItems.filter((item) => item.statusLabel === orderLookupFilter);

  const orderLookupTotalPages = Math.max(
    1,
    Math.ceil(orderLookupFilteredItems.length / ORDER_LOOKUP_PER_PAGE),
  );
  const orderLookupSafePage = Math.min(orderLookupPage, orderLookupTotalPages);
  const orderLookupVisibleItems = orderLookupFilteredItems.slice(
    (orderLookupSafePage - 1) * ORDER_LOOKUP_PER_PAGE,
    orderLookupSafePage * ORDER_LOOKUP_PER_PAGE,
  );

  const buttonBase = "transition-all duration-150 active:scale-[0.97]";


  const DEPOSIT_CONFIRM_HIDE_UNTIL_KEY = "ruru_deposit_confirm_hide_until";

  const shouldSkipDepositConfirm = () => {
    if (typeof window === "undefined") return false;

    const hideUntil = Number(localStorage.getItem(DEPOSIT_CONFIRM_HIDE_UNTIL_KEY) || 0);
    return Number.isFinite(hideUntil) && hideUntil > Date.now();
  };

  const handleSubmitOrderClick = () => {
    if (!validate()) return;

    // data-ruru-order-submit-direct-with-payment-sheet="v1"
    // 주문서 제출 전 기존 입금확인 모달은 띄우지 않습니다.
    // 무통장입금 주문은 저장 성공 후 공통 입금안내 바텀시트로 안내합니다.
    submitOrder();
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

  const selectedItemEntries = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.product_name.trim());

  const getRecordText = (record: Record<string, unknown> | undefined, keys: string[]) => {
    if (!record) return "";

    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }

    return "";
  };

  const findSourceProductForItem = (item: OrderItem) => {
    const itemRecord = item as unknown as Record<string, unknown>;
    const itemProductId = getRecordText(itemRecord, ["product_id", "productId", "id"]);
    const itemProductName = item.product_name.trim();

    const sourceProducts = [
      ...quickGroupBuyProducts,
      ...broadcastProducts,
      ...groupBuyQuickProductsFromCatalog,
    ] as unknown[];

    return sourceProducts.find((source) => {
      if (!source || typeof source !== "object") return false;

      const sourceRecord = source as Record<string, unknown>;
      const sourceProductId = getRecordText(sourceRecord, ["id", "product_id", "productId"]);
      const sourceProductName = getRecordText(sourceRecord, ["product_name", "name", "title"]);

      if (itemProductId && sourceProductId && itemProductId === sourceProductId) return true;
      if (itemProductName && sourceProductName && itemProductName === sourceProductName) return true;

      return false;
    }) as Record<string, unknown> | undefined;
  };

  const getImageUrlFromRecord = (record: Record<string, unknown> | undefined) => {
    if (!record) return "";

    const directImageUrl = getRecordText(record, [
      "image_url",
      "main_image_url",
      "thumbnail_url",
      "product_image_url",
      "imageUrl",
      "image",
      "thumbnail",
      "photo_url",
      "photo",
    ]);

    if (directImageUrl) return directImageUrl;

    const dynamicImageKey = Object.keys(record).find((key) => {
      const lowerKey = key.toLowerCase();
      const value = record[key];

      return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        (lowerKey.includes("image") || lowerKey.includes("thumb") || lowerKey.includes("photo")) &&
        (value.startsWith("http") || value.startsWith("/") || value.startsWith("data:image"))
      );
    });

    if (!dynamicImageKey) return "";

    const value = record[dynamicImageKey];
    return typeof value === "string" ? value.trim() : "";
  };

  const isDirectInputItem = (item: OrderItem) => {
    return !findSourceProductForItem(item);
  };

  const getOrderItemImageUrl = (item: OrderItem) => {
    const itemRecord = item as unknown as Record<string, unknown>;
    const sourceRecord = findSourceProductForItem(item);

    return getImageUrlFromRecord(itemRecord) || getImageUrlFromRecord(sourceRecord);
  };

  const openDirectInputSheet = () => {
    const emptyIndex = items.findIndex((item) => !item.product_name.trim());

    if (emptyIndex >= 0) {
      setDirectInputTargetIndex(emptyIndex);
      setDirectInputOpen(true);
      return;
    }

    setDirectInputTargetIndex(items.length);
    addItem();
    setDirectInputOpen(true);
  };

  const openDirectInputEditSheet = (index: number) => {
    setDirectInputTargetIndex(index);
    setDirectInputOpen(true);
  };

  const closeDirectInputSheet = () => {
    setProductSearchText("");
    setProductSearchOpenIndex(null);
    setDirectInputProductSearchMode(false);
    setDirectInputOpen(false);
  };

  const confirmDirectInputSheet = () => {
    const targetItem = items[directInputTargetIndex];

    if (!targetItem) {
      showCustomerNotice("직접입력 상품 정보를 다시 확인해주세요.", "warning");
      return;
    }

    const missingFields: string[] = [];

    if (!targetItem.product_name.trim()) missingFields.push("상품명");
    if (!targetItem.color.trim()) missingFields.push("옵션 / 색상");
    if (!targetItem.size.trim()) missingFields.push("옵션 / 사이즈");
    if (!toNumber(targetItem.qty)) missingFields.push("수량");
    if (!toNumber(targetItem.product_price)) missingFields.push("금액");

    if (missingFields.length > 0) {
      const optionMissing =
        missingFields.includes("옵션 / 색상") || missingFields.includes("옵션 / 사이즈");

      showCustomerNotice(
        `아래 항목을 입력해주세요: ${missingFields.join(", ")}${optionMissing ? " / 옵션이 없는 상품은 “없음”이라고 입력해주세요." : ""}`,
        "warning"
      );
      return;
    }

    setProductSearchText("");
    setProductSearchOpenIndex(null);
    setDirectInputProductSearchMode(false);
    setDirectInputOpen(false);
  };

  const TopCustomerNav = () => {
    const safeGreetingName = youtubeNickname || customerName || "고객";
    const safePointText = `${Math.max(0, Number(customerPointBalance || 0)).toLocaleString()}원`;
    const isTopNavEditActive = isEditingCustomerInfo || isEditMode || customerInfoEditSheetOpen;
    const topNavActiveButtonClass = "rounded-full bg-blue-700 px-3 py-1.5 text-[12px] font-black text-white";
    const topNavInactiveButtonClass = "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-700";

    const handleTopNavOrderClick = (event: { preventDefault: () => void }) => {
      if (!isTopNavEditActive) return;

      event.preventDefault();
      setIsEditingCustomerInfo(false);
      setIsEditMode(false);
      setCustomerMode("load");
      setIsCustomerInfoOpen(false);

      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/order");
      }
    };

    return (
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#f8fafc]/95 px-2 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Link href="/order" className="text-[17px] font-black tracking-[-0.05em] text-slate-950">
              루루동이 LIVE
            </Link>

            <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-black tracking-[-0.04em] text-amber-800">
              RD포인트 {safePointText}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold tracking-[-0.04em] text-slate-700">
              {safeGreetingName}님 안녕하세요
            </p>

            <nav className="flex shrink-0 items-center gap-1">
              <Link
                href="/order"
                onClick={handleTopNavOrderClick}
                className={isTopNavEditActive ? topNavInactiveButtonClass : topNavActiveButtonClass}
              >
                주문서
              </Link>
              <button
                type="button"
                onClick={openOrderLookupBottomSheet}
                className={topNavInactiveButtonClass}
              >
                주문조회
              </button>
              <button
                type="button"
                onClick={openCustomerInfoEditBottomSheet}
                className={isTopNavEditActive ? topNavActiveButtonClass : topNavInactiveButtonClass}
              >
                정보수정
              </button>
            </nav>
          </div>
        </div>
      </header>
    );
  };


  const customerInfoMissing =
    !youtubeNickname.trim() ||
    !customerName.trim() ||
    normalizePhone(customerPhone).length < 10 ||
    !address.trim() ||
    !detailAddress.trim();

  const directInputItem = items[directInputTargetIndex] || null;
  const registeredOptionColorChoices = registeredOptionSelectProduct
    ? getSelectableRegisteredOptions(registeredOptionSelectProduct, "color")
    : [];
  const registeredOptionSizeChoices = registeredOptionSelectProduct
    ? getSelectableRegisteredOptions(registeredOptionSelectProduct, "size")
    : [];
  const registeredOptionPrice = registeredOptionSelectProduct ? Number(registeredOptionSelectProduct.price || 0) : 0;
  const registeredOptionTotalPrice = Math.max(1, registeredOptionQty) * (Number.isFinite(registeredOptionPrice) ? registeredOptionPrice : 0);

  if (isKakaoLoginReturn && !isAutoLoggedIn) {
    return (
      <OrderPageShell>
        <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <OrderKakaoNicknameNotice
            kakaoNickname={kakaoNickname}
            youtubeNickname={youtubeNickname}
            errorMessage={youtubeNicknameError}
            onYoutubeNicknameChange={handleYoutubeNicknameChange}
            onConfirm={confirmKakaoYoutubeNickname}
          />
        </section>
      </OrderPageShell>
    );
  }

  return (
    <OrderPageShell>
      {hasSavedInfo && <TopCustomerNav />}

      {!isAutoLoggedIn && (isEditingCustomerInfo || customerMode === "new") && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <OrderCustomerInfoIntro mode={isEditingCustomerInfo ? "edit" : "check"} />

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
        </section>
      )}

      {isAutoLoggedIn && (
        <>
          <section className="mt-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
              모바일 간편주문
            </p>
            <h1 className="mt-1 text-[26px] font-black tracking-[-0.08em] text-slate-950">
              주문서 작성
            </h1>
            <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
              상품목록에서 [담기]를 누르거나, 직접 입력으로 상품을 담아주세요.
            </p>
            <p className="mt-2 break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-400">
              담은 상품과 금액 확인 후 [주문서 제출]을 눌러주세요.
            </p>

            {customerInfoMissing && (
              <div className="mt-3 rounded-[18px] border border-orange-200 bg-orange-50 p-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-orange-800">
                배송정보 확인이 필요합니다. 상단 [정보수정]에서 이름, 전화번호, 주소를 먼저 저장해주세요.
              </div>
            )}
          </section>

          <section
            id="orderProductInputSection"
            className="mt-3 w-full max-w-full overflow-hidden rounded-[24px] border border-blue-200 bg-blue-50 p-4 shadow-sm"
          >
            <h2 className="text-[22px] font-black leading-tight tracking-[-0.07em] text-slate-950">
              방송에서 주문한 상품 찾기
            </h2>
            <p className="mt-2 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-blue-700">
              이름만 쳐도 가격까지 떠요. 못 찾으면 직접 입력도 돼요.
            </p>

            <button
              type="button"
              onClick={openDirectInputSheet}
              className={`${buttonBase} mt-4 w-full rounded-[18px] bg-blue-600 px-3 py-4 text-[17px] font-black tracking-[-0.04em] text-white`}
            >
              상품 찾기 / 직접 입력
            </button>
          </section>

          <section className="mt-3 w-full max-w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-4">
              <h2 className="text-[17px] font-black tracking-[-0.06em] text-slate-950">
                상품목록
              </h2>
              <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
                주문할 상품의 [담기]를 눌러주세요.
              </p>
            </div>

            <div className="w-full max-w-full overflow-hidden">
              <GroupBuyQuickSelect
                products={quickGroupBuyProducts as GroupBuyQuickSelectProduct[]}
                getSelectLabel={(product) =>
                  "담기"
                }
                onSelect={(product) => selectQuickGroupBuyProduct(product as BroadcastProduct)}
              />
            </div>
          </section>

          <section className="mt-3 w-full max-w-full overflow-hidden rounded-[24px] border border-blue-100 bg-blue-50/40 p-3 shadow-sm">
            <div className="mb-4">
              <h2 className="text-[17px] font-black tracking-[-0.06em] text-slate-950">
                주문서 확인
              </h2>
              <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
                담은 상품과 금액을 확인해 주세요.
              </p>
            </div>

            {selectedItemEntries.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <p className="text-[14px] font-black tracking-[-0.04em] text-slate-700">
                  아직 담은 상품이 없습니다.
                </p>
                <p className="mt-1 break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
                  상품목록에서 [담기]를 누르거나 [직접 입력]으로 담아주세요.
                </p>
              </div>
            ) : (
              <div className="grid w-full max-w-full gap-2 overflow-hidden">
                {selectedItemEntries.map(({ item, index }) => {
                  const matchedRegisteredProduct = findMatchedBroadcastProduct(item, broadcastProducts);
                  const itemIsRegisteredProduct = Boolean(item.product_id || matchedRegisteredProduct);
                  const imageUrl = matchedRegisteredProduct
                    ? pickOrderProductImageUrl(matchedRegisteredProduct)
                    : getOrderItemImageUrl(item);
                  const optionColorText = normalizeEmptyProductOptionValue(item.color) || "없음";
                  const optionSizeText = normalizeEmptyProductOptionValue(item.size) || "없음";
                  const itemHasNoOptions = optionColorText === "없음" && optionSizeText === "없음";
                  const canInlineChangeQty = itemIsRegisteredProduct && itemHasNoOptions;
                  const itemSourceLabel = itemIsRegisteredProduct ? "선택상품" : "직접입력";
                  const itemAmount = toNumber(item.product_price) * (toNumber(item.qty) || 1);

                  return (
                    <article
                      key={`selected-item-${index}`}
                      data-ruru-selected-item-card="wide-compact-v1"
                      className="rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                    >
                      <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-2.5">
                        <div className="h-[78px] w-[78px] overflow-hidden rounded-[16px] bg-slate-100 ring-1 ring-slate-200">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.product_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-black leading-tight tracking-[-0.04em] text-slate-400">
                              {itemSourceLabel}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1">
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
                                  상품 {index + 1}
                                </span>
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tracking-[-0.04em] ring-1 ${
                                    itemIsRegisteredProduct
                                      ? "bg-blue-50 text-blue-700 ring-blue-100"
                                      : "bg-amber-50 text-amber-700 ring-amber-100"
                                  }`}
                                >
                                  {itemSourceLabel}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              {!canInlineChangeQty && (
                                <button
                                  type="button"
                                  onClick={() => openDirectInputEditSheet(index)}
                                  className={`${buttonBase} rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-black tracking-[-0.04em] text-blue-700`}
                                >
                                  수정
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className={`${buttonBase} rounded-full border border-red-100 bg-white px-2 py-1 text-[11px] font-black tracking-[-0.04em] text-red-500`}
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          <h3 className="mt-0.5 line-clamp-2 break-keep pr-1 text-[16px] font-black leading-snug tracking-[-0.06em] text-slate-950">
                            {item.product_name || "상품명 없음"}
                          </h3>

                          <p className="mt-1 min-w-0 truncate text-[12px] font-bold tracking-[-0.04em] text-slate-500">
                            {itemHasNoOptions ? "옵션 없음" : `${optionColorText} / ${optionSizeText}`} · 단가 {won(toNumber(item.product_price))}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 rounded-[16px] bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                        {canInlineChangeQty ? (
                          <div
                            data-ruru-selected-item-inline-qty="enabled"
                            className="grid h-10 w-[116px] grid-cols-3 overflow-hidden rounded-[14px] border border-slate-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() => updateItem(index, "qty", String(Math.max(1, (toNumber(item.qty) || 1) - 1)))}
                              className="flex items-center justify-center text-[18px] font-black text-slate-700 active:bg-slate-50"
                              aria-label="수량 줄이기"
                            >
                              -
                            </button>
                            <div className="flex items-center justify-center border-x border-slate-100 text-[15px] font-black tracking-[-0.04em] text-slate-950">
                              {toNumber(item.qty) || 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => updateItem(index, "qty", String((toNumber(item.qty) || 1) + 1))}
                              className="flex items-center justify-center text-[18px] font-black text-blue-700 active:bg-blue-50"
                              aria-label="수량 늘리기"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div
                            data-ruru-selected-item-qty-readonly="enabled"
                            className="rounded-[14px] bg-white px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-slate-600 ring-1 ring-slate-200"
                          >
                            수량 {toNumber(item.qty) || 1}개
                          </div>
                        )}

                        <div className="min-w-0 text-right">
                          <p className="text-[10px] font-black tracking-[-0.04em] text-slate-400">
                            상품금액
                          </p>
                          <p className="text-[21px] font-black leading-tight tracking-[-0.07em] text-blue-700">
                            {won(itemAmount)}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-3 rounded-[24px] border border-blue-100 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
                  04 결제방식
                </p>
                <h2 className="mt-1 text-[18px] font-black tracking-[-0.06em] text-slate-950">
                  결제 방법을 선택해 주세요.
                </h2>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black tracking-[-0.04em] text-slate-500">
                필수 확인
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["무통장입금", "카드결제"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`${buttonBase} min-h-[68px] rounded-[20px] px-3 py-3 text-left tracking-[-0.04em] ${
                    paymentMethod === method
                      ? "border-2 border-blue-600 bg-blue-50 text-blue-800 shadow-[0_10px_22px_rgba(37,99,235,0.10)]"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span className="block text-[15px] font-black">
                    {method}
                  </span>
                  <span
                    className={`mt-1 block text-[11px] font-black leading-snug ${
                      paymentMethod === method ? "text-blue-700" : "text-slate-400"
                    }`}
                  >
                    {method === "무통장입금" ? "입금자명·금액 확인" : "카톡채널 결제 문의"}
                  </span>
                </button>
              ))}
            </div>

            {paymentMethod === "카드결제" && (
              <div className="mt-3 rounded-[20px] border border-blue-100 bg-blue-50 p-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-blue-800">
                카드결제는 {cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.
                <br />
                주문서 작성 후 카톡채널 문의 부탁드립니다.
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-2 block text-[13px] font-black tracking-[-0.04em] text-slate-700">
                요청사항
              </span>
              <textarea
                value={requestMemo}
                onChange={(event) => setRequestMemo(event.target.value)}
                placeholder="예) 문 앞에 놓아주세요 / 배송 전 연락주세요"
                className="min-h-[88px] w-full resize-none rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-[15px] font-bold leading-relaxed tracking-[-0.04em] outline-none focus:border-blue-600"
              />
            </label>
          </section>

          <section
            data-ruru-price-section="redesigned"
            className="mt-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
                05 최종 확인
              </p>
              <h2 className="mt-1 text-[18px] font-black tracking-[-0.06em] text-slate-950">
                결제금액 확인
              </h2>
              <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
                상품금액, 배송비, 포인트 사용 금액을 확인해주세요.
              </p>
            </div>

            {shippingNoticeText && (
              <div
                className={`mt-3 rounded-[20px] p-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] ${
                  shippingFee > 0
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
                    : "bg-green-50 text-green-700 ring-1 ring-green-100"
                }`}
              >
                {shippingFee > 0 ? "🚚" : "✅"} {shippingNoticeText}
              </div>
            )}

            <div data-ruru-price-summary-wrapper="flat" className="mt-4">
              <OrderPriceSummaryBox
                productAmount={productAmount}
                shippingFee={shippingFee}
                cardExtra={cardExtra}
                totalAmount={totalAmount}
                paymentMethod={paymentMethod}
                customerPointBalance={customerPointBalance}
                customerPointLoading={customerPointLoading}
                pointUseInput={commaNumberText(pointUseInput)}
                pointUsedAmount={selectedPointUseAmount}
                finalAmount={finalPaymentAmount}
                showPointUse={customerPointBalance >= 1000 && totalAmount > 0}
                onPointUseInputChange={(value) => setPointUseInput(onlyNumber(value))}
                onUseAllPoints={() => setPointUseInput(String(Math.min(customerPointBalance, totalAmount)))}
              />
            </div>

            {!hasPrivacyConsent && !hasSavedOrderCustomerInfo && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[22px] bg-blue-50 p-4 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-blue-900 ring-1 ring-blue-100 active:scale-[0.99]">
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

            {customerBlockStatus.blocked ? <CustomerBlockedNotice /> : null}
          </section>

          {registeredOptionSelectProduct && (
            <div className="fixed inset-0 z-[128] flex items-end bg-black/45 px-2 pb-0 sm:px-3">
              <div className="mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl">
                <div className="shrink-0 border-b border-slate-100 p-4">
                  <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200" />
                  <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
                    옵션을 선택해 주세요
                  </p>
                  <h2 className="mt-1 break-keep text-[24px] font-black leading-tight tracking-[-0.08em] text-slate-950">
                    색상 · 사이즈 선택
                  </h2>
                  <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
                    선택한 옵션 그대로 주문서에 들어갑니다. 빠뜨리지 말고 확인해주세요.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="rounded-[24px] bg-slate-50 p-4 ring-1 ring-slate-100">
                    <h3 className="break-keep text-[18px] font-black leading-snug tracking-[-0.06em] text-slate-950">
                      {registeredOptionSelectProduct.product_name}
                    </h3>
                    <p className="mt-1 text-[15px] font-black text-blue-700">
                      {registeredOptionPrice > 0 ? won(registeredOptionPrice) : "가격 직접입력"}
                    </p>
                  </div>

                  {registeredOptionColorChoices.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-[14px] font-black tracking-[-0.04em] text-slate-800">
                        색상
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {registeredOptionColorChoices.map((option) => (
                          <button
                            key={`registered-color-${option}`}
                            type="button"
                            onClick={() => setRegisteredOptionColor(option)}
                            className={`min-h-12 rounded-[16px] border px-3 text-[14px] font-black tracking-[-0.04em] ${
                              registeredOptionColor === option
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {registeredOptionSizeChoices.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-[14px] font-black tracking-[-0.04em] text-slate-800">
                        사이즈
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {registeredOptionSizeChoices.map((option) => (
                          <button
                            key={`registered-size-${option}`}
                            type="button"
                            onClick={() => setRegisteredOptionSize(option)}
                            className={`min-h-12 rounded-[16px] border px-2 text-[14px] font-black tracking-[-0.04em] ${
                              registeredOptionSize === option
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-[0.82fr_1.18fr] gap-3">
                    <label className="grid gap-2">
                      <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">수량</span>
                      <div className="grid h-12 grid-cols-[42px_1fr_42px] overflow-hidden rounded-[17px] border border-slate-200 bg-white">
                        <button
                          type="button"
                          onClick={() => setRegisteredOptionQty((current) => Math.max(1, current - 1))}
                          className="border-r border-slate-100 text-[18px] font-black text-slate-700"
                        >
                          -
                        </button>
                        <div className="flex items-center justify-center text-[16px] font-black tracking-[-0.04em] text-slate-950">
                          {registeredOptionQty}
                        </div>
                        <button
                          type="button"
                          onClick={() => setRegisteredOptionQty((current) => current + 1)}
                          className="border-l border-slate-100 text-[18px] font-black text-blue-700"
                        >
                          +
                        </button>
                      </div>
                    </label>

                    <div className="grid gap-2">
                      <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">선택금액</span>
                      <div className="flex h-12 items-center justify-end rounded-[17px] border border-slate-200 bg-white px-3 text-[14px] font-black tracking-[-0.04em] text-slate-950">
                        {registeredOptionTotalPrice > 0 ? won(registeredOptionTotalPrice) : "가격 직접입력"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 grid grid-cols-[0.85fr_1.15fr] gap-3 border-t border-slate-100 bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={closeRegisteredOptionSelectSheet}
                    className="h-14 rounded-[20px] bg-slate-100 text-[16px] font-black tracking-[-0.05em] text-slate-700"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={confirmRegisteredOptionSelectSheet}
                    className="h-14 rounded-[20px] bg-blue-600 text-[16px] font-black tracking-[-0.05em] text-white shadow-sm"
                  >
                    주문서에 담기
                  </button>
                </div>
              </div>
            </div>
          )}

          {directInputOpen && directInputItem && (
            <div className="fixed inset-0 z-[130] bg-slate-950/55 backdrop-blur-[2px]">
              <div
                data-ruru-direct-input-shell="direct-input-shell-v2"
                className={directInputProductSearchMode ? "absolute inset-x-0 bottom-0 mx-auto max-h-[95dvh] w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-24px_80px_rgba(15,23,42,0.25)]" : "absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-24px_80px_rgba(15,23,42,0.25)]"}
                style={{
                  bottom: directInputProductSearchMode ? "0px" : directInputKeyboardInset > 0 ? `${directInputKeyboardInset}px` : "0px",
                }}
              >
                <div className="mx-auto mt-2.5 h-1.5 w-16 rounded-full bg-slate-200" />

                <div className="max-h-[calc(95dvh-18px)] overflow-x-hidden overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
                  <div data-ruru-direct-input-no-top-close="enabled" className="mb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-[27px] font-black leading-none tracking-[-0.08em] text-slate-950">
                        상품 직접 입력
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-500">
                        직접 적어야 할 때 사용
                      </span>
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 overflow-x-hidden">
                    <div data-ruru-product-search-area className={directInputProductSearchMode ? "sticky top-0 z-20 grid gap-2 rounded-b-2xl bg-white pb-2" : "grid gap-2"}>
                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">상품명</span>
                        <input
                          value={directInputItem.product_name}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateItem(directInputTargetIndex, "product_name", nextValue);
                            setProductSearchText(nextValue);
                            setProductSearchOpenIndex(directInputTargetIndex);
                            setDirectInputProductSearchMode(true);
                          }}
                          onFocus={(event) => {
                            const target = event.currentTarget;
                            setProductSearchText(directInputItem.product_name);
                            setProductSearchOpenIndex(directInputTargetIndex);
                            setDirectInputProductSearchMode(true);

                            if (typeof window !== "undefined") {
                              window.setTimeout(() => {
                                target.scrollIntoView({ block: "start", behavior: "smooth" });
                              }, 80);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                              setDirectInputProductSearchMode(false);
                            }
                          }}
                          onBlur={() => {
                            if (typeof window !== "undefined") {
                              window.setTimeout(() => {
                                setDirectInputProductSearchMode(false);
                              }, 160);
                            } else {
                              setDirectInputProductSearchMode(false);
                            }
                          }}
                          placeholder="상품명을 입력해주세요"
                          className="h-13 min-w-0 w-full rounded-[18px] border border-blue-500 bg-white px-4 text-[17px] font-black tracking-[-0.05em] text-slate-950 outline-none focus:border-blue-700"
                        />
                      </label>

                      {productSearchOpenIndex === directInputTargetIndex && productSearchText.trim().length > 0 ? (
                        <div className={directInputProductSearchMode ? "max-h-[44dvh] overscroll-contain overflow-y-auto rounded-2xl border border-blue-100 bg-white p-2 shadow-[0_14px_35px_rgba(15,23,42,0.12)]" : "max-h-52 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-2 shadow-[0_14px_35px_rgba(15,23,42,0.12)]"}>
                          <div className="px-3 py-2 text-[12px] font-black tracking-[-0.03em] text-blue-600">
                            직접입력 추천 상품명
                          </div>

                          {filteredBroadcastProducts.length === 0 ? (
                            <div className="px-3 py-4 text-[13px] font-bold leading-5 text-slate-500">
                              추천 상품명이 없어요. 방송에서 안내한 상품명 그대로 입력해주세요.
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {filteredBroadcastProducts.map((product) => (
                                <button
                                  key={String(product.id)}
                                  type="button"
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                  }}
                                  onClick={() => {
                                    selectBroadcastProduct(directInputTargetIndex, product);
                                    setProductSearchText("");
                                    setProductSearchOpenIndex(null);
                                    setDirectInputProductSearchMode(false);

                                    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                                      document.activeElement.blur();
                                    }
                                  }}
                                  className="w-full rounded-2xl px-3 py-3 text-left hover:bg-blue-50 active:scale-[0.99]"
                                >
                                  <div className="line-clamp-2 text-[14px] font-black leading-5 tracking-[-0.04em] text-slate-950">
                                    {product.product_name}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2 text-[12px] font-black text-slate-500">
                                    <span className="min-w-0 truncate">
                                      {productSuggestionKeywords(product).slice(0, 3).join(", ") || "등록상품"}
                                    </span>
                                    <span className="shrink-0 text-blue-600">{won(Number(product.price || 0))}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid min-w-0 grid-cols-2 gap-3">
                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">옵션 / 색상</span>
                        <input
                          value={directInputItem.color}
                          onChange={(event) => updateItem(directInputTargetIndex, "color", event.target.value)}
                          placeholder="색상입력"
                          className="h-12 min-w-0 w-full rounded-[17px] border border-slate-200 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">옵션 / 사이즈</span>
                        <input
                          value={directInputItem.size}
                          onChange={(event) => updateItem(directInputTargetIndex, "size", event.target.value)}
                          placeholder="사이즈입력"
                          className="h-12 min-w-0 w-full rounded-[17px] border border-slate-200 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none focus:border-blue-600"
                        />
                      </label>
                    </div>

                    <div data-ruru-direct-input-amount-same-row="enabled" className="grid min-w-0 grid-cols-[0.82fr_1.18fr] gap-3">
                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">수량</span>
                        <div className="grid h-12 grid-cols-[42px_1fr_42px] overflow-hidden rounded-[17px] border border-slate-200 bg-white">
                          <button
                            type="button"
                            onClick={() => updateItem(directInputTargetIndex, "qty", String(Math.max(1, (toNumber(directInputItem.qty) || 1) - 1)))}
                            className="border-r border-slate-100 text-[18px] font-black text-slate-700"
                          >
                            -
                          </button>
                          <input
                            value={directInputItem.qty}
                            onChange={(event) => updateItem(directInputTargetIndex, "qty", onlyNumber(event.target.value))}
                            inputMode="numeric"
                            className="min-w-0 text-center text-[16px] font-black tracking-[-0.04em] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(directInputTargetIndex, "qty", String((toNumber(directInputItem.qty) || 0) + 1))}
                            className="border-l border-slate-100 text-[18px] font-black text-blue-700"
                          >
                            +
                          </button>
                        </div>
                      </label>

                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">금액</span>
                        <div className="flex h-12 min-w-0 items-center rounded-[17px] border border-slate-200 bg-white px-3">
                          <input
                            value={directInputItem.product_price ? Number(directInputItem.product_price).toLocaleString("ko-KR") : ""}
                            onChange={(event) => updateItem(directInputTargetIndex, "product_price", onlyNumber(event.target.value))}
                            inputMode="numeric"
                            placeholder="0"
                            className="min-w-0 flex-1 text-right text-[14px] font-black tracking-[-0.04em] outline-none"
                          />
                          <span className="ml-1.5 shrink-0 text-[13px] font-black text-slate-400">원</span>
                        </div>
                      </label>
                    </div>

                    <div className="rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-black leading-5 tracking-[-0.04em] text-blue-800">
                      방송에서 안내받은 상품명, 옵션, 금액을 입력해 주세요. 옵션이 없으면 “없음”이라고 적어주세요.
                    </div>

                    <div className="grid min-w-0 grid-cols-[0.8fr_1.2fr] gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeDirectInputSheet}
                        className="h-14 rounded-[22px] bg-slate-100 text-[17px] font-black tracking-[-0.05em] text-slate-700"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={confirmDirectInputSheet}
                        className="h-14 rounded-[22px] bg-blue-700 text-[17px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)]"
                      >
                        주문서에 담기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-4">
            <div className="mx-auto flex max-w-[560px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black tracking-[-0.04em] text-slate-400">
                  총 결제금액
                </p>
                <p className="truncate text-[20px] font-black tracking-[-0.08em] text-slate-950">
                  {won(finalPaymentAmount)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubmitOrderClick}
                disabled={submitting || customerBlockStatus.blocked}
                className={`${buttonBase} h-14 min-w-[154px] rounded-[22px] bg-blue-700 px-5 text-[16px] font-black tracking-[-0.05em] text-white shadow-lg shadow-blue-700/20 disabled:bg-slate-300 disabled:shadow-none`}
              >
                {customerBlockStatus.blocked ? "주문 제한됨" : submitting ? "제출 중..." : "주문서 제출"}
              </button>
            </div>
          </div>
        </>
      )}

        {firstOrderGuideOpen ? (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/35 px-3 pb-3">
            <section
              role="dialog"
              aria-modal="true"
              className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-24px_80px_rgba(15,23,42,0.25)] ring-1 ring-white/70"
            >
              <div className="grid gap-4 p-5">
                <div className="text-center">
                  <div className="text-[24px] font-black tracking-[-0.07em] text-slate-950">
                    처음이신가요?
                  </div>
                </div>

                <div className="grid gap-3 rounded-[24px] bg-slate-50 p-4 text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-700 ring-1 ring-slate-100">
                  <p>이 안내를 닫으면 상품목록이 보입니다.</p>
                  <p>상품목록에서 주문할 상품의 <span className="font-black text-blue-700">[담기]</span>를 눌러주세요.</p>
                  <p>직접 적어야 할 상품은 <span className="font-black text-slate-950">[직접 입력]</span>을 사용해 주세요.</p>
                  <p>담은 상품과 금액을 확인한 뒤 <span className="font-black text-blue-700">[주문서 제출]</span>을 눌러주세요.</p>
                  <p className="text-[14px] text-amber-700">입금자명과 금액이 다르면 입금확인이 늦어질 수 있어요.</p>
                </div>

                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <button
                    type="button"
                    onClick={() => closeFirstOrderGuide(true)}
                    className="min-h-[54px] rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-[15px] font-black tracking-[-0.05em] text-slate-700 transition active:scale-[0.98]"
                  >
                    오늘 하루 보지 않기
                  </button>
                  <button
                    type="button"
                    onClick={() => closeFirstOrderGuide(false)}
                    className="min-h-[54px] rounded-[18px] bg-blue-600 px-3 py-3 text-[17px] font-black tracking-[-0.05em] text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)] transition active:scale-[0.98]"
                  >
                    확인
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        <CustomerPaymentGuideBottomSheet
          open={paymentGuideOpen}
          depositNickname={done?.nickname || youtubeNickname || customerName}
          bankName={BANK_NAME}
          bankAccount={BANK_ACCOUNT}
          bankHolder={BANK_HOLDER}
          nicknameCopyDone={nicknameCopyDone}
          bankCopyDone={copyDone}
          onCopyNickname={copyDepositNickname}
          onCopyBankAccount={copyBankAccount}
          onClose={() => setPaymentGuideOpen(false)}
          isOrderComplete={Boolean(done)}
          paymentMethod={done?.paymentMethod || paymentMethod}
          items={done?.items || []}
          productAmount={done?.productAmount || 0}
          shippingFee={done?.shippingFee || 0}
          totalAmount={done?.totalAmount || 0}
          pointUsedAmount={done?.pointUsedAmount || 0}
          finalAmount={done?.finalAmount}
        />

        <CustomerInfoEditBottomSheet
          open={customerInfoEditSheetOpen}
          youtubeNickname={youtubeNickname}
          customerName={customerName}
          customerPhone={formatPhone(customerPhone)}
          address={address}
          detailAddress={detailAddress}
          youtubeNicknameError={youtubeNicknameError}
          onYoutubeNicknameChange={setYoutubeNickname}
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={(value) => setCustomerPhone(normalizePhone(value))}
          onAddressChange={setAddress}
          onDetailAddressChange={setDetailAddress}
          onOpenAddressSearch={openAddressSearch}
          onClose={closeCustomerInfoEditBottomSheet}
          onSave={completeEditCustomerInfo}
        />

        <CustomerOrderLookupBottomSheet
          open={orderLookupOpen}
          items={orderLookupVisibleItems}
          activeFilter={orderLookupFilter}
          page={orderLookupSafePage}
          totalPages={orderLookupTotalPages}
          filters={ORDER_LOOKUP_FILTERS}
          onFilterChange={(filter) => {
            setOrderLookupFilter(filter);
            setOrderLookupPage(1);
          }}
          onPageChange={setOrderLookupPage}
          onClose={() => setOrderLookupOpen(false)}
          onOpenPaymentGuide={() => {
            setOrderLookupOpen(false);
            setPaymentGuideOpen(true);
          }}
        />

      <OrderDepositConfirmModal
        open={showDepositConfirmModal}
        nickname={youtubeNickname || customerName}
        totalAmount={finalPaymentAmount}
        originalTotalAmount={totalAmount}
        pointUsedAmount={selectedPointUseAmount}
        finalAmount={finalPaymentAmount}
        onClose={() => setShowDepositConfirmModal(false)}
        onConfirm={handleDepositConfirmSubmit}
      />

      <footer className="py-8 text-center text-[11px] font-bold tracking-[-0.03em] text-slate-400">
        © 2024 RURUDONGI. All rights reserved.
      </footer>
    </OrderPageShell>
  );
}
