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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HOWTO_DEFAULT, parseHowtoSteps } from "@/lib/howto";
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
import OrderCustomerInfoIntro from "@/components/order/OrderCustomerInfoIntro";
import OrderCustomerInfoFormCard from "@/components/order/OrderCustomerInfoFormCard";
import CustomerPaymentGuideBottomSheet from "@/components/customer/CustomerPaymentGuideBottomSheet";
import CustomerPointGiftPopup from "@/components/customer/CustomerPointGiftPopup";
import CustomerInfoEditBottomSheet from "@/components/customer/CustomerInfoEditBottomSheet";
import SheetGrabber from "@/components/customer/SheetGrabber";
import { KakaoPostcodeEmbed } from "react-daum-postcode";
import CustomerOrderLookupBottomSheet, {
  type CustomerOrderLookupFilter,
  type CustomerOrderLookupGroup,
} from "@/components/customer/CustomerOrderLookupBottomSheet";
import OrderKakaoNicknameNotice from "@/components/order/OrderKakaoNicknameNotice";
import CustomerBlockedNotice from "@/components/customer/CustomerBlockedNotice";
import CustomerToastNotice from "@/components/customer/CustomerToastNotice";
import CustomerManualAddressPanel from "@/components/customer/CustomerManualAddressPanel";
import CustomerMissingDetailAddressPanel from "@/components/customer/CustomerMissingDetailAddressPanel";
import GroupBuyQuickSelect, { type GroupBuyQuickSelectProduct } from "@/components/order/GroupBuyQuickSelect";
import PWAInstallBanner from "@/components/PWAInstallBanner";


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
  is_visible?: boolean | null;
  product_type: string;
  shipping_type: string;
  combine_shipping: string;
  badge_type?: string;
  badge_types?: string[];
  color_options?: unknown;
  size_options?: unknown;
  size_option_enabled?: unknown;
  color_option_enabled?: unknown;
  color?: unknown;
  size?: unknown;
  colors?: unknown;
  sizes?: unknown;
  product_colors?: unknown;
  product_sizes?: unknown;
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
  in_shop?: boolean | null;
  mall_sort_order?: number;
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

const ORDER_LOOKUP_FILTERS = ["전체", "결제대기", "결제완료", "출고완료", "주문취소"] as const;
const ORDER_LOOKUP_PER_PAGE = 2;
const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";
const MENU_ITEM_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  textAlign: "left",
  textDecoration: "none",
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1px solid #E8E2DD",
  background: "#fff",
  fontSize: "14px",
  fontWeight: 700,
  color: "#222",
  cursor: "pointer",
};
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
  paymentMethod?: "무통장입금" | "카드결제" | "";
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
  // 사이즈가 8개에서 잘리던 문제 → 신발/의류 사이즈 전부(예: 220~290) 노출되게 상향
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 40);
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

// "없음입력 토글 ON" 신호 판별.
// 등록 화면(빠른등록/상품목록/상품등록 모두)이 토글 ON일 때 products.size_option_enabled 컬럼을 true로 저장하고,
// 고객 페이지는 select("*")로 그 컬럼을 그대로 받는다. 이 플래그가 진짜 토글 신호다.
// (일부 경로는 옵션값에 "없음" 글자를 같이 저장하므로, 그 경우도 보조 신호로 인정한다.)
function registeredProductNoneOptionEnabled(product: BroadcastProduct): boolean {
  const record = product as unknown as Record<string, unknown>;
  const note = (parseProductSuggestionNote(product.product_note) || {}) as Record<string, unknown>;

  const readFlag = (value: unknown) => {
    if (value === true) return true;
    if (typeof value === "number") return value === 1;
    return ["true", "1", "y", "yes"].includes(String(value ?? "").trim().toLowerCase());
  };

  if (
    readFlag(record.size_option_enabled) ||
    readFlag(record.sizeOptionEnabled) ||
    readFlag(note.size_option_enabled)
  ) {
    return true;
  }

  // 옵션값에 "없음"이 명시된 경우(예: color_options:["없음"])도 토글 ON으로 본다.
  const rawHasExplicitNone = (field: "color" | "size") =>
    getProductOptionSuggestions(product, field).some(
      (value) => String(value).trim() !== "" && normalizeEmptyProductOptionValue(value) === ""
    );

  return rawHasExplicitNone("color") || rawHasExplicitNone("size");
}

// 등록상품의 색상/사이즈 필드가 어떤 모드인지 field별 독립 판별한다.
// - "select": 실제 옵션값(블랙/화이트, 230~290 등)이 있어 고객이 골라야 함.
// - "none":   해당 field가 토글 ON(size/color_option_enabled=true) 또는 "없음" 명시 → 자동 "없음", 입력 불필요.
// - "input":  실옵션도 없고 토글도 OFF → 고객이 직접 입력해야 함.
function getRegisteredOptionMode(product: BroadcastProduct, field: "color" | "size"): "select" | "none" | "input" {
  if (getSelectableRegisteredOptions(product, field).length > 0) return "select";
  // field별 독립 판단: color는 color_option_enabled, size는 size_option_enabled
  const record = product as unknown as Record<string, unknown>;
  const note = (parseProductSuggestionNote(product.product_note) || {}) as Record<string, unknown>;
  const readFlag = (value: unknown) => {
    if (value === true) return true;
    if (typeof value === "number") return value === 1;
    return ["true", "1", "y", "yes"].includes(String(value ?? "").trim().toLowerCase());
  };
  if (field === "color") {
    if (readFlag(record.color_option_enabled) || readFlag(record.colorOptionEnabled) || readFlag(note.color_option_enabled)) return "none";
  } else {
    if (readFlag(record.size_option_enabled) || readFlag(record.sizeOptionEnabled) || readFlag(note.size_option_enabled)) return "none";
  }
  // 옵션값에 "없음" 계열이 명시된 경우도 해당 field만 none으로
  const hasExplicitNone = getProductOptionSuggestions(product, field).some(
    (value) => String(value).trim() !== "" && normalizeEmptyProductOptionValue(value) === ""
  );
  if (hasExplicitNone) return "none";
  return "input";
}

function registeredProductNeedsOptionSelect(product: BroadcastProduct): boolean {
  // 옵션을 골라야 하거나(select) 직접 입력해야 하는(input) 필드가 하나라도 있으면 시트를 거친다.
  // 둘 다 "none"(없음입력 토글 ON)인 상품만 시트 없이 바로 담긴다.
  return true;
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

const normalizeDetailImages = (value: unknown): string[] => {
  if (!value) return [];
  const arr: unknown[] = Array.isArray(value) ? value
    : (typeof value === "string" ? (() => { try { const p = JSON.parse(value); return Array.isArray(p) ? p : [value]; } catch { return [value]; } })() : []);
  return arr.map((v) => readOrderProductImageValue(v)).filter(Boolean);
};

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

// P4 상품카드용 — 방송중 배지(고정상품) / 품절(재고관리 ON + 재고 0) 판정 (읽기 전용)
function readOrderNoteObject(product: any): any {
  let note = product?.product_note;
  if (typeof note === "string") {
    try {
      note = JSON.parse(note);
    } catch {
      note = null;
    }
  }
  return note && typeof note === "object" ? note : null;
}

function isPinnedOrderProduct(product: any): boolean {
  const value = product?.is_pinned ?? product?.pinned;
  if (typeof value === "boolean") return value;
  return ["true", "1", "y", "yes", "상단", "고정"].includes(String(value ?? "").trim().toLowerCase());
}

// [2026-07-09 사장님 지침] 사이즈는 항상 "36(S)" 형태로 보여준다.
//   ⚠️ 표시 전용 — 저장되는 값(주문 옵션·재고 variant 키)은 원래 값 그대로다.
//      (라벨만 바꾸므로 기존 주문/재고와 절대 안 어긋난다)
const SIZE_NUM_TO_LETTER: Record<string, string> = { "36": "S", "38": "M", "40": "L", "42": "XL", "44": "XXL" };
const SIZE_LETTER_TO_NUM: Record<string, string> = { S: "36", M: "38", L: "40", XL: "42", XXL: "44" };
function sizeDisplayLabel(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (SIZE_NUM_TO_LETTER[v]) return `${v}(${SIZE_NUM_TO_LETTER[v]})`;
  const upper = v.toUpperCase();
  if (SIZE_LETTER_TO_NUM[upper]) return `${SIZE_LETTER_TO_NUM[upper]}(${upper})`;
  return v; // 매핑에 없는 사이즈(프리, 250 등)는 원래대로
}

function isSoldOutOrderProduct(product: any): boolean {
  const note = readOrderNoteObject(product);
  if (note?.stock_management_enabled !== true) return false; // 재고관리 OFF면 품절 처리 안 함(주문 막지 않음)

  // 옵션별 재고가 있으면 → 모든 옵션 stock<=0인지 체크
  const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
  if (variants.length > 0) {
    return variants.every((v: any) => Number(v.stock ?? 0) <= 0);
  }

  // 옵션 없는 상품 → 기존대로 전체 stock 체크
  const stock = Number(product?.stock ?? product?.total_stock);
  return Number.isFinite(stock) && stock <= 0;
}

// 재고 임박 표시 전용(읽기만·주문/재고 로직 무관)
// ※2026-07-05 사장님 지침: 옵션 상품은 "합산(총재고)" 표시 안 함 — 임박한 옵션만 옵션별로 표시.
// 옵션 없는(총재고) 상품 전용: 재고관리 중이고 남은 수량 1~5개일 때만 숫자 반환
function lowStockRemainOrderProduct(product: any, reservedQty = 0): number | null {
  const note = readOrderNoteObject(product);
  if (note?.stock_management_enabled !== true) return null;
  const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
  if (variants.length > 0) return null; // 옵션 상품은 합산 표시 금지 → lowStockOptionsOrderProduct가 담당
  const stock = Number(product?.stock ?? product?.total_stock);
  if (!Number.isFinite(stock)) return null;
  // [재고 홀드] 다른 고객이 담아둔(예약) 수량 반영 — 표시 전용
  const remain = Math.max(0, stock - Math.max(0, Number(reservedQty) || 0));
  return remain >= 1 && remain <= 5 ? remain : null;
}

// 옵션 상품 전용: 재고 1~5개인 "임박 옵션"만 [{label, stock}]로 반환 (재고관리 중일 때만)
function lowStockOptionsOrderProduct(product: any, reservedOf?: (color: unknown, size: unknown) => number): Array<{ label: string; stock: number }> {
  const note = readOrderNoteObject(product);
  if (note?.stock_management_enabled !== true) return [];
  const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
  if (variants.length === 0) return [];
  const norm = (s: unknown) => {
    const t = String(s ?? "").trim();
    return t === "없음" ? "" : t;
  };
  return variants
    .map((v: any) => ({
      label: [norm(v.color), norm(v.size)].filter(Boolean).join("/") || "기본",
      // [재고 홀드] 다른 고객 예약 수량 차감 — 표시 전용
      stock: Number(v.stock ?? 0) - Math.max(0, Number(reservedOf ? reservedOf(v.color, v.size) : 0) || 0),
    }))
    .filter((x: { stock: number }) => Number.isFinite(x.stock) && x.stock >= 1 && x.stock <= 5);
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
    // 쇼핑몰 진열(관리자 쇼핑몰 진열 탭) 신호 — 고객 그리드가 방송 OFF일 때 읽는다(보존만).
    in_shop: product?.in_shop ?? false,
    mall_sort_order: Number(product?.mall_sort_order ?? 999999),
    created_at: String(product?.created_at ?? ""),
    updated_at: String(product?.updated_at ?? ""),
    status: String(product?.status ?? "판매중"),
    is_visible: product?.is_visible ?? null,
    product_type: String(product?.product_type ?? ""),
    shipping_type: String(product?.shipping_type ?? product?.delivery_type ?? ""),
    badge_type: String(product?.badge_type ?? "none"),
    badge_types:
      Array.isArray((product as any)?.badge_types) && (product as any).badge_types.length
        ? (product as any).badge_types.map((x: any) => String(x))
        : product?.badge_type && product.badge_type !== "none"
          ? [String(product.badge_type)]
          : [],
    // 옵션/없음입력 토글 신호: 고객 옵션 판단(getRegisteredOptionMode)이 읽을 수 있게 그대로 통과시킨다.
    color_options: product?.color_options ?? null,
    size_options: product?.size_options ?? null,
    size_option_enabled: product?.size_option_enabled ?? null,
    color_option_enabled: product?.color_option_enabled ?? null,
    color: product?.color ?? null,
    size: product?.size ?? null,
    colors: product?.colors ?? null,
    sizes: product?.sizes ?? null,
    product_colors: product?.product_colors ?? null,
    product_sizes: product?.product_sizes ?? null,
    image_url: pickOrderProductImageUrl(product),
  } as BroadcastProduct;
}



export default function OrderPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [broadcast, setBroadcast] = useState<any | null>(null);
  const [broadcastProducts, setBroadcastProducts] = useState<BroadcastProduct[]>([]);
  const [groupBuyQuickProductsFromCatalog, setGroupBuyQuickProductsFromCatalog] = useState<BroadcastProduct[]>([]);
  // 쇼핑몰 열기/닫기(settings.shop_open) — 방송 OFF일 때만 영향. 기본 열림.
  const [shopOpen, setShopOpen] = useState(true);
  const [productSearchOpenIndex, setProductSearchOpenIndex] = useState<number | null>(null);
  const [productSearchText, setProductSearchText] = useState("");
  const [topProductSearchText, setTopProductSearchText] = useState("");
  const [showAllGroupBuyQuickProducts, setShowAllGroupBuyQuickProducts] = useState(false);

  useEffect(() => {
    const handleProductSearchOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-ruru-product-search-area]")) {
        return;
      }

      // 직접입력 추천 드롭다운만 닫는다. (메인 상품검색어는 비우지 않음)
      //   기존엔 setProductSearchText("")까지 해서, 담기 버튼(검색영역 밖) 탭 시
      //   pointerdown으로 검색이 지워지고 목록이 전체로 reflow→담기 클릭이 빗나가
      //   "초기화면으로 튀고 안 담김" 버그가 있었음.
      setProductSearchOpenIndex(null);
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
  // 받는사람(배송) — 주문자(입금/포인트 매칭 기준)와 분리. 비면 주문자 값으로 fallback.
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
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

  // [사장님 지침 2026-07-06] 결제수단 기본값 = 미선택("") — 고객이 직접 골라야 제출 가능(validate에서 차단)
  const [paymentMethod, setPaymentMethod] = useState<"무통장입금" | "카드결제" | "">("");
  const [items, setItems] = useState<OrderItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  // 중복 제출 방지: state는 반영이 느려 연타를 못 막으므로 ref로 즉시 빗장을 건다.
  const submitInFlightRef = useRef(false);
  // 멱등성: 같은 주문의 재시도는 같은 키를 재사용하고, 성공 후에만 다음 주문용으로 비운다.
  const pendingOrderKeyRef = useRef<{ groupId: string; lookupCode: string } | null>(null);
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
      // 경고/오류(입력 누락 안내 등)는 고객이 충분히 읽도록 더 오래 띄운다.
      const autoHideMs = autoType === "warning" || autoType === "error" ? 6000 : 3200;
      window.setTimeout(() => {
        setCustomerNotice((current) => (current.message === text ? { type: "info", message: "" } : current));
      }, autoHideMs);
    }
  };
  const [manualAddressOpen, setManualAddressOpen] = useState(false);
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);
  const addressPickedHandlerRef = useRef<((addr: string, zipcode: string) => void) | null>(null);
  const [missingDetailAddressConfirmOpen, setMissingDetailAddressConfirmOpen] = useState(false);
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
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [customerInfoEditSheetOpen, setCustomerInfoEditSheetOpen] = useState(false);
  const [customerInfoEditInitialScreen, setCustomerInfoEditInitialScreen] = useState<"info" | "shipping_list" | "shipping_form">("info");
  const [customerInfoEditSnapshot, setCustomerInfoEditSnapshot] = useState<{
    youtubeNickname: string;
    customerName: string;
    customerPhone: string;
    address: string;
    detailAddress: string;
  } | null>(null);
  const [orderLookupOpen, setOrderLookupOpen] = useState(false);
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [liveAlertOptin, setLiveAlertOptin] = useState(false);
  const [liveAlertSaving, setLiveAlertSaving] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [inquirySheetOpen, setInquirySheetOpen] = useState(false);
  const [noticeSheetOpen, setNoticeSheetOpen] = useState(false);
  // [2026-07-10] 주문 방법 팝업 — 관리자 설정(howto_enabled)이 켜져 있을 때만 뜬다.
  //   설정을 읽기 전엔 안 띄운다(꺼둔 상태로 깜빡이는 것 방지). loadOrderSettings에서 연다.
  const [howToOpen, setHowToOpen] = useState(false);
  const [howToSteps, setHowToSteps] = useState(HOWTO_DEFAULT.steps);
  const [howToWarn, setHowToWarn] = useState(HOWTO_DEFAULT.warn);
  const [videoOpen, setVideoOpen] = useState(true);
  const videoSlotRef = useRef<HTMLDivElement | null>(null);
  const livePlayerRef = useRef<HTMLDivElement | null>(null);
  const [videoClosed, setVideoClosed] = useState(false); // ✕로 완전 닫음
  const [miniPos, setMiniPos] = useState<{ left: number; top: number } | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [visibleProductCount, setVisibleProductCount] = useState(10);
  const [categoryFilter, setCategoryFilter] = useState<string>("전체");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [cartAddedOpen, setCartAddedOpen] = useState(false);
  const [cartAddedItem, setCartAddedItem] = useState<any | null>(null);
  // [UI] 담김 토스트 자동 소멸 (2.4초) — 모달 대신 비차단 토스트라 확인 클릭 불필요
  useEffect(() => {
    if (!cartAddedOpen) return;
    const t = setTimeout(() => setCartAddedOpen(false), 2400);
    return () => clearTimeout(t);
  }, [cartAddedOpen, cartAddedItem]);
  const [lightboxImage, setLightboxImage] = useState<string>("");
  const [orderLookupOrders, setOrderLookupOrders] = useState<any[]>([]);
  const [orderLookupFilter, setOrderLookupFilter] = useState<CustomerOrderLookupFilter>("전체");
  const [orderLookupPage, setOrderLookupPage] = useState(1);
  const [orderLookupVisibleCount, setOrderLookupVisibleCount] = useState(10);
  const [customerCardRate, setCustomerCardRate] = useState(10);
  const [actualCardFeeRate, setActualCardFeeRate] = useState(7);
  const [cardPaymentMinAmount, setCardPaymentMinAmount] = useState(100000);
  const [defaultShippingFee, setDefaultShippingFee] = useState(4000);
  const [remoteAreaShippingFee, setRemoteAreaShippingFee] = useState(6000);
  const [pointEarnRateForDisplay, setPointEarnRateForDisplay] = useState(0);
  const [noticeText, setNoticeText] = useState("");
  // 접속 팝업 공지(설정에서 문구/제목/글자크기/색상/ON·OFF 수정). 밴드 바로가기 + 24시간 안 보기 + 확인.
  const [popupNoticeEnabled, setPopupNoticeEnabled] = useState(false);
  const [popupNoticeTitle, setPopupNoticeTitle] = useState("");
  const [popupNoticeText, setPopupNoticeText] = useState("");
  const [popupNoticeFontSize, setPopupNoticeFontSize] = useState("normal"); // normal | large | xlarge
  const [popupNoticeColor, setPopupNoticeColor] = useState("#7B2D43"); // 제목·확인버튼 강조색
  const [popupBandUrl, setPopupBandUrl] = useState("https://band.us/@ruru8249");
  const [popupOpen, setPopupOpen] = useState(false);
  const [directInputEnabled, setDirectInputEnabled] = useState(true);
  const [combineShippingSettings, setCombineShippingSettings] =
    useState<CombineShippingSettings>(DEFAULT_COMBINE_SHIPPING_SETTINGS);
  const [alreadyPaidShipping, setAlreadyPaidShipping] = useState(false);
  const [paidShippingGroups, setPaidShippingGroups] = useState<PaidShippingGroups>({ ...EMPTY_PAID_SHIPPING_GROUPS });
  const [customerPointBalance, setCustomerPointBalance] = useState(0);
  const [shippingAddresses, setShippingAddresses] = useState<any[]>([]);
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
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [duplicateWarningPendingAction, setDuplicateWarningPendingAction] = useState<(() => void) | null>(null);

  // 미니 모드: 드래그 위치 or 기본 우하단, 화면 경계 clamp (리사이즈/회전 시 재적용)
  useLayoutEffect(() => {
    if (videoOpen || videoClosed) return;
    const p = livePlayerRef.current; if (!p) return;
    const place = () => {
      const w = 116, h = Math.round(w * 16 / 9), m = 12;
      const left = miniPos ? miniPos.left : (window.innerWidth - w - m);
      const top = miniPos ? miniPos.top : (window.innerHeight - h - 84);
      p.style.width = w + "px"; p.style.height = h + "px";
      p.style.left = Math.max(m, Math.min(left, window.innerWidth - w - m)) + "px";
      p.style.top = Math.max(m, Math.min(top, window.innerHeight - h - m)) + "px";
      p.style.borderRadius = "12px";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [videoOpen, videoClosed, miniPos]);

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

      // [사장님 지침 2026-07-06] 결제수단은 draft에서 복원하지 않음 — 매번 미선택으로 시작해 고객이 직접 선택
      // (예전 세션의 "카드결제"가 복원돼 기본 선택처럼 보이던 문제 차단. 상품/메모/포인트 입력은 계속 복원)

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
      paymentMethod !== "";

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
    // localStorage엔 배송지 목록이 없으므로, 저장된 번호가 있으면 DB에서 shipping_addresses를 채운다.
    const savedPhone = (typeof window !== "undefined" && window.localStorage.getItem("ruru_customer_phone")) || "";
    if (savedPhone.trim()) {
      void loadExistingCustomerByKakaoPhone(savedPhone);
    }
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
          // localStorage엔 배송지 목록이 없으므로 DB에서 shipping_addresses를 채운다.
          if (savedPhone.trim()) {
            await loadExistingCustomerByKakaoPhone(savedPhone);
          }
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
        "point_auto_earn_enabled",
        "point_earn_rate",
        "notice_text",
        "direct_input_enabled",
        "howto_enabled",
        "howto_steps",
        "popup_notice_enabled",
        "popup_notice_title",
        "popup_notice_text",
        "popup_notice_fontsize",
        "popup_notice_color",
        "popup_band_url",
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

    // 포인트 자동적립 안내 문구용 (자동적립 ON + 적립률>0 일 때만 N% 표시, OFF면 0=숨김)
    const pointAutoEarnEnabled =
      String((data || []).find((item: any) => item.key === "point_auto_earn_enabled")?.value || "").trim() === "true";
    const pointEarnRate = Math.min(100, Math.max(0, readNumber("point_earn_rate", 0)));
    setPointEarnRateForDisplay(pointAutoEarnEnabled ? pointEarnRate : 0);

    setNoticeText(String((data || []).find((i: any) => i.key === "notice_text")?.value || ""));
    setDirectInputEnabled(
      String((data || []).find((i: any) => i.key === "direct_input_enabled")?.value || "true").trim() !== "false",
    );

    // 주문 방법 팝업: 관리자 설정 ON + "오늘 하루 열지 않기"가 안 걸려 있으면 표시
    const howtoOn = String((data || []).find((i: any) => i.key === "howto_enabled")?.value || "true").trim() !== "false";
    const howtoCfg = parseHowtoSteps((data || []).find((i: any) => i.key === "howto_steps")?.value);
    setHowToSteps(howtoCfg.steps);
    setHowToWarn(howtoCfg.warn);
    if (howtoOn) {
      let hidden = false;
      try {
        const hideUntil = Number(localStorage.getItem("ruru_howto_hide_until") || "0");
        hidden = Number.isFinite(hideUntil) && Date.now() < hideUntil;
      } catch {
        hidden = false;
      }
      if (!hidden) setHowToOpen(true);
    }

    // 접속 팝업 공지: 설정값 반영 + "24시간 안 보기"가 안 걸려 있으면 접속하자마자 표시
    const pEnabled = String((data || []).find((i: any) => i.key === "popup_notice_enabled")?.value || "").trim() === "true";
    const pText = String((data || []).find((i: any) => i.key === "popup_notice_text")?.value || "");
    const pBand = String((data || []).find((i: any) => i.key === "popup_band_url")?.value || "").trim() || "https://band.us/@ruru8249";
    const pTitle = String((data || []).find((i: any) => i.key === "popup_notice_title")?.value || "");
    const pFont = String((data || []).find((i: any) => i.key === "popup_notice_fontsize")?.value || "").trim() || "normal";
    const pColor = String((data || []).find((i: any) => i.key === "popup_notice_color")?.value || "").trim() || "#7B2D43";
    setPopupNoticeEnabled(pEnabled);
    setPopupNoticeText(pText);
    setPopupBandUrl(pBand);
    setPopupNoticeTitle(pTitle);
    setPopupNoticeFontSize(pFont);
    setPopupNoticeColor(pColor);
    let suppressed = false;
    try {
      const hideUntil = Number(localStorage.getItem("ruru_popup_notice_hide_until") || "0");
      suppressed = Number.isFinite(hideUntil) && Date.now() < hideUntil;
    } catch {
      suppressed = false;
    }
    setPopupOpen(pEnabled && pText.trim().length > 0 && !suppressed);
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
    if (Array.isArray(customer?.shipping_addresses)) {
      setShippingAddresses(customer.shipping_addresses);
    }
    const nextNickname = String(customer?.youtube_nickname || "").trim();
    const nextName = String(customer?.customer_name || "").trim();
    const nextPhone = normalizePhone(customer?.customer_phone || fallbackPhone);
    // 기본배송지(isDefault, 없으면 [0]) 우선 — 배열 항목은 camelCase(detailAddress/zipcode). 배열 기본주소가 있으면 그걸,
    // 없으면 기존 단일 컬럼(snake_case) fallback. (배송지 변경이 배열에만 반영되던 주소 불일치 수정)
    const shippingArr = Array.isArray(customer?.shipping_addresses) ? customer.shipping_addresses : null;
    const defaultShippingAddr = shippingArr ? (shippingArr.find((a: any) => a?.isDefault) ?? shippingArr[0]) : null;
    const useDefaultShipping = Boolean(defaultShippingAddr && String(defaultShippingAddr.address || "").trim());
    const nextZipcode = useDefaultShipping ? String(defaultShippingAddr.zipcode || "").trim() : String(customer?.zipcode || "").trim();
    const nextAddress = useDefaultShipping ? String(defaultShippingAddr.address || "").trim() : String(customer?.address || "").trim();
    const nextDetailAddress = useDefaultShipping ? String(defaultShippingAddr.detailAddress || "").trim() : String(customer?.detail_address || "").trim();

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

    // 받는사람(배송) — 기본배송지의 받는 분/연락처. 없으면 주문자명/전화로 fallback.
    setRecipientName((useDefaultShipping ? String(defaultShippingAddr?.name || "").trim() : "") || nextName);
    setRecipientPhone((useDefaultShipping ? String(defaultShippingAddr?.phone || "").trim() : "") || nextPhone);

    if (nextPhone || nextNickname || nextName || nextAddress) {
      setHasSavedInfo(true);
      setCustomerMode("load");
    }

    return Boolean(nextNickname && nextPhone);
  };

  const loadExistingCustomerByKakaoPhone = async (phoneValue: string) => {
    const cleanPhone = normalizePhone(phoneValue);          // 표시/applyCustomerFromRow fallback(하이픈)
    const phoneKey = onlyNumber(phoneValue);                // DB customer_phone 키(숫자만, 2026-06-16 정규화)

    if (phoneKey.length < 10) return false;

    // DB는 숫자만으로 통일됨. 안전하게 숫자/하이픈 둘 다 조회(하이픈은 잔존 시 대비).
    const phoneValues = Array.from(new Set([phoneKey, cleanPhone].filter(Boolean)));

    // kakao_id가 있는 row 우선, 없으면 last_order_at 최신순
    const { data: allRows, error } = await supabase
      .from("customers")
      .select("*")
      .in("customer_phone", phoneValues)
      .order("last_order_at", { ascending: false })
      .limit(5);
    const data = allRows
      ? [...allRows].sort((a, b) => {
          const aHasKakao = a.kakao_id ? 1 : 0;
          const bHasKakao = b.kakao_id ? 1 : 0;
          if (bHasKakao !== aHasKakao) return bHasKakao - aHasKakao;
          const aAddr = Array.isArray(a.shipping_addresses) ? a.shipping_addresses.length : 0;
          const bAddr = Array.isArray(b.shipping_addresses) ? b.shipping_addresses.length : 0;
          return bAddr - aAddr;
        })
      : null;

    if (error) {
      console.error("카카오 기존 고객정보 조회 오류:", error.message);
      return false;
    }

    const customer = data?.[0];

    if (!customer) return false;

    // Phase1-2(중복 row 병합 + 전화번호 숫자키 통일)로 단일 row가 확정 조회됨 →
    // 빈배열 시 700ms 재조회 땜질 불필요(제거). 진실원천은 DB 단일 row 유지.
    return applyCustomerFromRow(customer, cleanPhone);
  };



  const loadGroupBuyQuickProductsFromCatalog = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*, image_url, main_image_url, external_image_url, detail_image_urls, image_path")
      .limit(1000);

    if (error) {
      console.log("등록상품 빠른선택 불러오기 오류", error.message);
      setGroupBuyQuickProductsFromCatalog([]);
      return;
    }

    const nextProducts = (data || [])
      .map((product: any) => normalizeOrderProductRow(product))
      .filter((product) => product.product_name.trim())
      .filter((product) => (product.status !== "숨김" || productSuggestionEnabled(product)) && product.status !== "deleted");

    setGroupBuyQuickProductsFromCatalog(nextProducts);
  };

  const loadBroadcast = async () => {
    await loadGroupBuyQuickProductsFromCatalog();

    // 쇼핑몰 열기/닫기 상태(settings.shop_open) — 값 "false"면 닫힘, 그 외/없음은 열림(기본).
    const { data: shopSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "shop_open")
      .maybeSingle();
    setShopOpen(String(shopSetting?.value ?? "").trim().toLowerCase() !== "false");

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

  // [라이브 동기화] 방송 ON 동안 45초마다 방송 상품(고정상품 포함) 재조회 — 관리자가 "지금 띄운 상품"을 바꾸면
  // 고객 목록 맨 위 강조 카드가 자동 반영. 읽기 전용 폴링(탭이 보일 때만), 주문/돈 로직 무관.
  useEffect(() => {
    const on = String(broadcast?.status || "").toUpperCase() === "ON";
    const bid = broadcast?.id;
    if (!on || !bid) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadBroadcastProducts(bid);
    }, 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcast?.status, broadcast?.id]);

  const loadBroadcastProducts = async (broadcastId: string | number) => {
    const { data, error } = await supabase
      .from("broadcast_products")
      .select("product_id, sort_order, products(*)")
      .eq("broadcast_id", broadcastId);

    if (error) {
      console.log("방송상품 불러오기 오류", error.message);
      setBroadcastProducts([]);
      return;
    }

    const nextProducts = (data || [])
      .map((row: any) => (row.products ? { ...row.products, __bpSort: row.sort_order } : null))
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
        // 카드 이미지: 기존엔 image_url/main_image_url/thumbnail_url을 빠뜨려 broadcast 상품 이미지가 안 떴음.
        // 카탈로그(normalizeOrderProductRow)와 동일하게 메인 이미지를 사전 해석해 보존한다.
        image_url: pickOrderProductImageUrl(product),
        main_image_url: product.main_image_url ?? null,
        thumbnail_url: product.thumbnail_url ?? null,
        is_pinned: Boolean(product.is_pinned) || Boolean(product.pinned),
        pinned: Boolean(product.pinned) || Boolean(product.is_pinned),
        pinned_at: String(product.pinned_at ?? ""),
        sort_order: Number(product.__bpSort ?? product.sort_order ?? product.display_order ?? 999999),
        display_order: Number(product.display_order ?? product.sort_order ?? 999999),
        created_at: String(product.created_at ?? ""),
        updated_at: String(product.updated_at ?? ""),
        stock: Number(product.stock || 0),
        status: product.status || "판매중",
        is_visible: product.is_visible ?? null,
        product_type: product.product_type || "방송상품",
        shipping_type: product.shipping_type || "일반",
        combine_shipping: product.combine_shipping || "Y",
        badge_type: String(product.badge_type || "none"),
        badge_types:
          Array.isArray((product as any)?.badge_types) && (product as any).badge_types.length
            ? (product as any).badge_types.map((x: any) => String(x))
            : product.badge_type && product.badge_type !== "none"
              ? [String(product.badge_type)]
              : [],
        // 옵션/없음입력 토글 신호: 고객 옵션 판단(getRegisteredOptionMode)이 읽을 수 있게 그대로 통과시킨다.
        color_options: product.color_options ?? null,
        size_options: product.size_options ?? null,
        size_option_enabled: product.size_option_enabled ?? null,
        color_option_enabled: product.color_option_enabled ?? null,
        color: product.color ?? null,
        size: product.size ?? null,
        colors: product.colors ?? null,
        sizes: product.sizes ?? null,
        product_colors: product.product_colors ?? null,
        product_sizes: product.product_sizes ?? null,
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
    // 관리자 수동 시간설정이 켜져있고 "지금 유효"하면 방송 ON이어도 시간범위를 우선한다.
    //   (방송을 껐다 켜거나 쇼핑몰 모드여도, 이 범위 안이면 created_at 기준으로 합배송)
    if (isCombineShippingActiveNow(sourceSettings)) {
      return {
        ...sourceSettings,
        enabled: true,
        startAt: sourceSettings.startAt,
        endAt: sourceSettings.endAt,
      };
    }

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

    // 합배 기준: 방송 ON이면 "같은 방송(broadcast_id)"으로 직접 묶는다.
    //   기존엔 시간 window(사실상 한국시간 '그날')로만 조회해서, 방송을 여러 날 켜두거나
    //   자정을 넘기면 다음날 주문에 배송비가 또 붙던 버그가 있었음(날짜·타임존·started_at 파싱에 흔들림).
    //   broadcast_id 직접 매칭은 날짜와 무관하게 같은 방송이면 합배(같은 주소 한정)됨.
    //   방송 OFF(쇼핑몰 모드)거나 broadcast 미로드면 기존 시간 window로 폴백.
    //   단, 관리자 수동 시간설정이 지금 유효하면 방송 무관하게 시간 window(created_at) 기준을 우선한다.
    const adminWindowActive = isCombineShippingActiveNow(loadedSettings);
    const activeBroadcastIdForCombine = String(broadcast?.id || "").trim();
    const combineByBroadcastId =
      !adminWindowActive &&
      activeBroadcastIdForCombine.length > 0 &&
      String(broadcast?.status || "").trim().toUpperCase() === "ON";

    let combineQuery = supabase
      .from("orders")
      .select("id, product_id, customer_phone, shipping_fee, adjusted_shipping_fee, order_manage_status, created_at, zipcode, address, detail_address, broadcast_id")
      .in("customer_phone", phoneValues);

    combineQuery = combineByBroadcastId
      ? combineQuery.eq("broadcast_id", activeBroadcastIdForCombine)
      : combineQuery.gte("created_at", settings.startAt).lte("created_at", settings.endAt);

    const { data, error } = await combineQuery.limit(100);

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
      scope: "profile_nickname,profile_image,phone_number,shipping_address",
    });

    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  };

  // 담기 완료 직후 주문서(오늘의 상품/담긴 상품) 영역으로 부드럽게 스크롤.
  // 모든 담기 경로에서 일관되게 쓰도록 공용 헬퍼로 분리.
  const scrollToOrderProductList = () => {
    if (typeof window === "undefined") return;

    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    window.setTimeout(() => {
      document
        .getElementById("orderProductListSection")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
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
        .eq("customer_phone", onlyNumber(loginPhone))
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
      // 배송지 배열 + 기본배송지(isDefault, 없으면 [0]) 우선 (applyCustomerFromRow와 동일 기준). 없으면 단일 컬럼 fallback.
      if (Array.isArray(customer.shipping_addresses)) setShippingAddresses(customer.shipping_addresses);
      const shippingArr = Array.isArray(customer.shipping_addresses) ? customer.shipping_addresses : null;
      const defaultShippingAddr = shippingArr ? (shippingArr.find((a: any) => a?.isDefault) ?? shippingArr[0]) : null;
      const useDefaultShipping = Boolean(defaultShippingAddr && String(defaultShippingAddr.address || "").trim());
      const nextZipcode = useDefaultShipping ? String(defaultShippingAddr.zipcode || "").trim() : (customer.zipcode || "");
      const nextAddress = useDefaultShipping ? String(defaultShippingAddr.address || "").trim() : (customer.address || "");
      const nextDetailAddress = useDefaultShipping ? String(defaultShippingAddr.detailAddress || "").trim() : (customer.detail_address || "");

      setYoutubeNickname(nextNickname);
      setCustomerName(nextName);
      setCustomerPhone(cleanPhone);
      setZipcode(nextZipcode);
      setAddress(nextAddress);
      setDetailAddress(nextDetailAddress);
      // 받는사람(배송) — 기본배송지의 받는 분/연락처, 없으면 주문자로 fallback.
      setRecipientName((useDefaultShipping ? String(defaultShippingAddr.name || "").trim() : "") || nextName);
      setRecipientPhone((useDefaultShipping ? String(defaultShippingAddr.phone || "").trim() : "") || cleanPhone);
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
      await saveCustomer(customerInfoEditSnapshot?.customerPhone);
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

  // react-daum-postcode(KakaoPostcodeEmbed)를 state로 띄운다.
  // iOS 카카오톡 인앱브라우저의 about:blank/팝업차단 이슈를 라이브러리 embed 방식으로 회피.
  const openAddressSearch = (onPicked?: (addr: string, zipcode: string) => void) => {
    addressPickedHandlerRef.current = onPicked ?? null;
    setAddressSearchOpen(true);
  };

  const handleAddressSearchComplete = (data: any) => {
    const nextAddress = data.roadAddress || data.jibunAddress || "";
    const nextZipcode = data.zonecode || "";

    setAddressSearchOpen(false);
    const onPicked = addressPickedHandlerRef.current;
    addressPickedHandlerRef.current = null;

    if (onPicked) {
      onPicked(nextAddress, nextZipcode);
      return;
    }

    setAddress(nextAddress);
    setZipcode(nextZipcode);

    setTimeout(() => {
      const detailInput = document.querySelector<HTMLInputElement>(
        "input[placeholder='상세주소를 입력해주세요']"
      );
      detailInput?.focus();
    }, 100);
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

  const topSearchMatches = useMemo(() => {
    const query = topProductSearchText.trim();

    if (!query) return [];

    const suggestionProducts = [...groupBuyQuickProductsFromCatalog, ...broadcastProducts];

    return suggestionProducts
      .filter((product) => product && product.product_name.trim())
      .filter((product) => productSuggestionEnabled(product))
      .filter((product) => productMatchesSuggestion(product, query))
      .slice(0, 6);
  }, [broadcastProducts, groupBuyQuickProductsFromCatalog, topProductSearchText]);

  const quickGroupBuyProducts = useMemo(() => {
    // 두 모드 절대 안 섞임:
    // - 방송 모드(ON): 방송에 담은 broadcast_products만 노출. 카탈로그(in_shop 포함) 전부 제외.
    // - 쇼핑몰 모드(OFF): in_shop=true 진열분만. (진열 0개면 빈 화면 방지로 전체 카탈로그 fallback)
    const broadcastOn = String(broadcast?.status || "").toUpperCase() === "ON";
    let catalogForGrid: BroadcastProduct[] = [];
    if (!broadcastOn) {
      catalogForGrid = groupBuyQuickProductsFromCatalog.filter(
        (product) => (product as any)?.in_shop === true,
      );
      if (catalogForGrid.length === 0) catalogForGrid = groupBuyQuickProductsFromCatalog;
    }

    const mergedProducts = [...catalogForGrid, ...broadcastProducts];

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
          .filter((product) => product && product.status !== "숨김" && product.status !== "deleted")
          // 고객 노출(is_visible)이 명시적으로 false인 상품만 그리드에서 제외. (기존 registered_order_enabled 필터는 검색만(search_only) 상품을 빠뜨려서 교체)
          .filter((product) => (product as any).is_visible !== false)
          .map((product) => [String(product.id), product]),
      ).values(),
    );

    return uniqueProducts.sort((a, b) => {
      // 방송 OFF(쇼핑몰 모드): mall_sort_order 오름차순 우선 (방송 ON은 아래 기존 로직 그대로)
      if (!broadcastOn) {
        const mallA = readQuickProductSortNumber((a as any).mall_sort_order);
        const mallB = readQuickProductSortNumber((b as any).mall_sort_order);
        if (mallA !== mallB) return mallA - mallB;
        return String(b.created_at || b.updated_at || b.id).localeCompare(String(a.created_at || a.updated_at || a.id));
      }

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
  }, [broadcastProducts, groupBuyQuickProductsFromCatalog, broadcast?.status]);

  // ============ [재고 홀드] 담는 즉시 서버에 예약(15분) — 다른 고객 화면·품절 판정에 즉시 차감 반영 ============
  // ⚠️ 진짜 재고 차감/복구는 기존 제출 RPC·취소 복구가 단일 소유(무변경). 이 예약은 표시용 선점 전용이라
  //    API가 죽어도 담기/제출/입금/정산 전부 정상 동작(오버셀은 제출 RPC가 원래 막고 있음).
  const [reservedByVariant, setReservedByVariant] = useState<Record<string, number>>({});
  const [reservedByProduct, setReservedByProduct] = useState<Record<string, number>>({});
  const cartSessionKeyRef = useRef<string>("");
  const getCartSessionKey = () => {
    if (cartSessionKeyRef.current) return cartSessionKeyRef.current;
    try {
      let k = localStorage.getItem("ruru_cart_session_key") || "";
      if (!k) {
        k = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("ruru_cart_session_key", k);
      }
      cartSessionKeyRef.current = k;
      return k;
    } catch {
      return "";
    }
  };
  const reservationVariantKey = (pid: string, color: unknown, size: unknown) => {
    const norm = (s: unknown) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
    return `${pid}|${norm(color)}|${norm(size)}`;
  };
  const fetchCartReservations = async () => {
    try {
      const ids = quickGroupBuyProducts.map((p: any) => String(p?.id ?? "")).filter(Boolean);
      if (ids.length === 0) return;
      const res = await fetch(`/api/cart-reservations?ids=${encodeURIComponent(ids.join(","))}&exclude=${encodeURIComponent(getCartSessionKey())}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setReservedByVariant(data.byVariant || {});
        setReservedByProduct(data.byProduct || {});
      }
    } catch { /* 예약 조회 실패해도 화면·주문 정상 */ }
  };
  const syncCartReservations = async () => {
    try {
      const key = getCartSessionKey();
      if (!key) return;
      const payload = items
        .filter((it) => it.product_id && String(it.product_name || "").trim())
        .map((it) => ({ productId: String(it.product_id), color: String(it.color || ""), size: String(it.size || ""), qty: Math.max(0, Math.min(99, Number(it.qty) || 0)) }))
        .filter((r) => r.qty > 0);
      await fetch("/api/cart-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", sessionKey: key, phone: onlyNumber(customerPhone || ""), items: payload }),
      });
    } catch { /* 실패해도 주문 흐름 무영향 */ }
  };
  // 담긴 상품 변경 → 1.5초 디바운스 예약 동기화(주문서 비우면 예약 해제와 동일·제출 성공 시 items 리셋으로 자동 해제)
  useEffect(() => {
    if (!hasSavedInfo) return;
    const t = setTimeout(() => { void syncCartReservations().then(() => fetchCartReservations()); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hasSavedInfo]);
  // 45초마다: 내 예약 연장(하트비트) + 다른 고객 예약 반영 (탭 보일 때만)
  useEffect(() => {
    if (!hasSavedInfo) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void syncCartReservations().then(() => fetchCartReservations());
    }, 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSavedInfo, quickGroupBuyProducts.length]);

  // P4 상품목록 무한스크롤: 센티넬이 보이면 10개씩 더 노출 (센티넬이 조건부로 (재)마운트되므로 재부착)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleProductCount((c) => c + 10);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleProductCount, quickGroupBuyProducts.length]);

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
      color: options?.color ?? normalizeEmptyProductOptionValue(fallbackColor),
      size: options?.size ?? normalizeEmptyProductOptionValue(fallbackSize),
      qty: String(Math.max(1, Number(options?.qty || 1))),
      product_price: nextProductPrice,
      shipping_type: product.shipping_type || "일반",
      combine_shipping: product.combine_shipping || "Y",
    };

    const normColor = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
    let didAdd = true;
    let clampedItem: any = null;
    setItems((prev) => {
      const maxQty = (() => {
        try {
          const note = typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note;
          const mgmtOn = (note as any)?.stock_management_enabled === true || (product as any).stock_management_enabled === true;
          if (!mgmtOn) return 999;
          const variants = Array.isArray((note as any)?.stock_variants) ? (note as any).stock_variants : [];
          if (variants.length === 0) return 999;
          const matched = variants.find((v: any) => normColor(String(v.color ?? "")) === normColor(nextItem.color) && normColor(String(v.size ?? "")) === normColor(nextItem.size));
          return matched ? Number(matched.stock) : 999;
        } catch { return 999; }
      })();
      // 개인당 구매제한(상품관리 설정). 이 카트 안 수량만 캡(과거 누적은 서버가 최종 방어).
      const limitQty = (() => {
        try {
          const note = typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note;
          if ((note as any)?.purchase_limit_enabled !== true) return Infinity;
          const n = Math.floor(Number((note as any)?.purchase_limit_qty || 0));
          return Number.isFinite(n) && n > 0 ? n : Infinity;
        } catch { return Infinity; }
      })();
      const effMax = Math.min(maxQty, limitQty);
      // 더 작은 제약이 구매제한이면 구매제한 안내, 아니면 재고 안내
      const limitMsg = (cap: number) =>
        limitQty <= maxQty && Number.isFinite(limitQty)
          ? "1인당 최대 " + limitQty + "개까지 구매할 수 있어요."
          : "재고가 부족해요. 최대 " + cap + "개까지 담을 수 있어요.";
      const addQty = Number(nextItem.qty) || 1;
      const sameIndex = nextItem.product_id ? prev.findIndex((item) => item.product_id === nextItem.product_id && normColor(item.color) === normColor(nextItem.color) && normColor(item.size) === normColor(nextItem.size) && item.product_name.trim() !== "") : -1;
      if (sameIndex >= 0) {
        const existingQty = Number(prev[sameIndex].qty) || 1;
        const newQty = Math.min(existingQty + addQty, effMax);
        if (newQty <= existingQty) { showCustomerNotice(limitMsg(effMax)); didAdd = false; return prev; }
        clampedItem = { ...prev[sameIndex], qty: String(Math.min(addQty, effMax)) };
        return prev.map((item, index) => index === sameIndex ? { ...item, qty: String(newQty) } : item);
      }
      const clampedQty = Math.min(addQty, effMax);
      if (clampedQty < addQty) showCustomerNotice(limitMsg(clampedQty));
      clampedItem = clampedQty !== addQty ? { ...nextItem, qty: String(clampedQty) } : nextItem;
      const emptyIndex = prev.findIndex((item) => !item.product_name.trim());
      if (emptyIndex >= 0) return prev.map((item, index) => (index === emptyIndex ? clampedItem : item));
      return [...prev, clampedItem];
    });

    setProductSearchOpenIndex(null);
    // 검색어는 유지 — 담기 후 검색이 풀려 전체목록이 떠 "안 담긴 것처럼" 보이던 혼란 방지.
    //   (담은 결과는 cart 카운트/토스트로 확인, 같은 검색으로 계속 담기 편함)
    // P6. 담기 완료 — confetti + "주문서에 담았어요!" 토스트(주문서 보기 / 계속 담기)
    if (didAdd) { setCartAddedItem(clampedItem); setCartAddedOpen(true); }
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

  // 동일 상품 + 동일 옵션(색상/사이즈)으로 이미 제출된 주문이 있는지 확인.
  // 방송 모드: customer_phone + broadcast_id 일치, 쇼핑몰 모드: customer_phone + 오늘 날짜.
  const checkDuplicateOrder = async (params: { productId?: string; productName: string; color: string; size: string }): Promise<boolean> => {
    const cleanPhone = normalizePhone(customerPhone);
    const nick = youtubeNickname.trim();
    // 전화번호(10자리+) 또는 닉네임 중 하나라도 있어야 조회. 둘 다 없으면 검사 안 함.
    if (cleanPhone.length < 10 && !nick) return false;
    const nm = (s: unknown) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
    // 취소 주문 판정(기존 표준 정규식 재사용) — 취소된 주문은 중복으로 보지 않음.
    const CANCELED_RE = /주문서취소|주문취소|취소|환불|cancel|refund/i;
    try {
      // 번호 정확일치 OR 닉네임 정확일치(번호 오타 시에도 닉네임으로 잡음). 닉네임 값은 PostgREST or 구문 안전을 위해 따옴표 래핑.
      const orParts: string[] = [];
      if (cleanPhone.length >= 10) orParts.push(`customer_phone.eq.${cleanPhone}`);
      if (nick && !nick.includes('"')) orParts.push(`youtube_nickname.eq."${nick}"`);
      if (orParts.length === 0) return false;
      let query = supabase
        .from("orders")
        .select("id, product_id, product_name, color, size, broadcast_id, created_at, order_manage_status, admin_order_status_v2")
        .or(orParts.join(","));
      if (broadcast?.id) {
        query = query.eq("broadcast_id", broadcast.id);
      } else {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        query = query.gte("created_at", start.toISOString());
      }
      const { data, error } = await query.limit(300);
      if (error || !Array.isArray(data)) return false;
      const targetId = String(params.productId ?? "").trim();
      const targetName = String(params.productName ?? "").trim();
      const tc = nm(params.color);
      const ts = nm(params.size);
      return data.some((o: any) => {
        // 취소된 주문은 제외(재주문 허용)
        const statusText = `${o.order_manage_status ?? ""} ${o.admin_order_status_v2 ?? ""}`;
        if (CANCELED_RE.test(statusText)) return false;
        const sameProduct =
          (targetId && String(o.product_id ?? "").trim() === targetId) ||
          (targetName && String(o.product_name ?? "").trim() === targetName);
        return sameProduct && nm(o.color) === tc && nm(o.size) === ts;
      });
    } catch {
      return false;
    }
  };

  const confirmRegisteredOptionSelectSheet = async () => {
    const product = registeredOptionSelectProduct;
    if (!product) return;

    const colorMode = getRegisteredOptionMode(product, "color");
    const sizeMode = getRegisteredOptionMode(product, "size");

    // none(없음입력 토글 ON)은 입력/선택 불필요. select는 선택 강제, input은 직접입력 강제.
    if (colorMode !== "none" && !normalizeEmptyProductOptionValue(registeredOptionColor)) {
      showCustomerNotice(
        colorMode === "input"
          ? "색상을 입력해주세요."
          : "색상을 선택해주세요."
      );
      return;
    }

    if (sizeMode !== "none" && !normalizeEmptyProductOptionValue(registeredOptionSize)) {
      showCustomerNotice(
        sizeMode === "input"
          ? "사이즈를 입력해주세요."
          : "사이즈를 선택해주세요."
      );
      return;
    }

    const note = (() => { try { return typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note; } catch { return null; } })();
    const variants = Array.isArray((note as any)?.stock_variants) ? (note as any).stock_variants : [];
    const stockMgmtEnabled = (() => { try { const n = typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note; return (n as any)?.stock_management_enabled === true || (product as any).stock_management_enabled === true; } catch { return false; } })();
    if (variants.length > 0 && stockMgmtEnabled) {
      const nm = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
      const matched = variants.find((v: any) => nm(v.color) === nm(registeredOptionColor) && nm(v.size) === nm(registeredOptionSize));
      if (matched && Number(matched.stock) <= 0) {
        showCustomerNotice("선택한 옵션(" + [registeredOptionColor, registeredOptionSize].filter(Boolean).join("/") + ")의 재고가 없습니다.");
        return;
      }
    }

    const doAdd = () => {
      addRegisteredProductToOrderItems(product, {
        color: registeredOptionColor,
        size: registeredOptionSize,
        qty: registeredOptionQty,
      });
      closeRegisteredOptionSelectSheet();
    };

    const isDuplicate = await checkDuplicateOrder({
      productId: String(product.id ?? ""),
      productName: product.product_name,
      color: registeredOptionColor,
      size: registeredOptionSize,
    });
    if (isDuplicate) {
      setDuplicateWarningPendingAction(() => doAdd);
      setDuplicateWarningOpen(true);
      return;
    }
    doAdd();
  };

  const selectQuickGroupBuyProduct = (product: BroadcastProduct) => {
    if (registeredProductNeedsOptionSelect(product)) {
      openRegisteredOptionSelectSheet(product);
      return;
    }

    // 옵션 없는 상품: 바로 담기
    addRegisteredProductToOrderItems(product);
  };

  // [딥링크] /order?p=상품ID — 방송 채팅 고정메시지 링크로 들어온 고객에게 해당 상품을 자동으로 열어줌.
  // 표시/담기 UI만 트리거(담기 버튼 클릭과 동일 경로). 주문 제출·돈 로직 무관. 1회만 실행.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (!hasSavedInfo) return; // 로그인/정보확인 끝난 화면에서만
    if (quickGroupBuyProducts.length === 0) return;
    let pid = "";
    try { pid = new URLSearchParams(window.location.search).get("p") || ""; } catch { deepLinkHandledRef.current = true; return; }
    if (!pid.trim()) { deepLinkHandledRef.current = true; return; }
    deepLinkHandledRef.current = true;
    const target = quickGroupBuyProducts.find((pr: any) => String(pr?.id ?? "") === pid.trim());
    if (!target) return; // 목록에 없으면(내려간 상품 등) 조용히 무시
    if (isSoldOutOrderProduct(target as any)) { showCustomerNotice("앗, 링크의 상품은 품절됐어요. 다른 상품을 둘러봐 주세요."); return; }
    setTimeout(() => { try { selectQuickGroupBuyProduct(target as BroadcastProduct); } catch { /* 무시 */ } }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSavedInfo, quickGroupBuyProducts]);

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
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [{ ...emptyItem }];
    });
  };

  const saveCustomer = async (previousPhone?: string) => {
    const cleanPhone = normalizePhone(customerPhone);        // 표시/localStorage용(하이픈)
    // DB customer_phone 키는 숫자만(2026-06-16 정규화 + 주문 RPC 정합). 번호변경 시 옛 키로 조회해 중복 방지.
    const phoneKey = onlyNumber(customerPhone);
    const prevClean = onlyNumber(previousPhone || "");
    const lookupPhone = prevClean && prevClean !== phoneKey ? prevClean : phoneKey;

    const customerData: any = {
      youtube_nickname: youtubeNickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: phoneKey,
      zipcode: zipcode.trim(),
      address: address.trim(),
      detail_address: detailAddress.trim(),
      request_memo: requestMemo.trim(),
      last_order_at: new Date().toISOString(),
    };


    const { data: rows, error: findError } = await supabase
      .from("customers")
      .select("id")
      .eq("customer_phone", lookupPhone)
      .limit(1);

    if (findError) throw findError;

    if (rows && rows.length > 0) {
      const { error } = await supabase
        .from("customers")
        .update(customerData)
        .eq("customer_phone", lookupPhone);

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

  useEffect(() => {
    const key = onlyNumber(customerPhone || "");
    if (!key || key.length < 10) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("customers")
        .select("live_alert_optin").eq("customer_phone", key).limit(1);
      if (!cancelled && data && data[0]) setLiveAlertOptin(!!data[0].live_alert_optin);
    })();
    return () => { cancelled = true; };
  }, [customerPhone]);

  const saveLiveAlertOptin = async (next: boolean) => {
    const key = onlyNumber(customerPhone || "");
    if (!key || key.length < 10) { alert("로그인 후 신청할 수 있어요."); return; }
    setLiveAlertSaving(true);
    try {
      const patch = {
        live_alert_optin: next,
        live_alert_optin_at: next ? new Date().toISOString() : null,
        live_alert_optin_source: next ? "order_rail" : null,
      };
      const { data: existing } = await supabase.from("customers")
        .select("id").eq("customer_phone", key).limit(1);
      if (existing && existing.length > 0) {
        await supabase.from("customers").update(patch).eq("customer_phone", key);
      } else {
        await supabase.from("customers").insert({
          customer_phone: key,
          youtube_nickname: youtubeNickname.trim() || "",
          customer_name: customerName.trim() || "",
          ...patch,
        });
      }
      setLiveAlertOptin(next);
      setAlertSheetOpen(false);
    } finally { setLiveAlertSaving(false); }
  };

  const saveShippingAddresses = async (addresses: any[]) => {
    setShippingAddresses(addresses);
    const phoneKey = onlyNumber(customerPhone);  // DB customer_phone 키는 숫자만(2026-06-16 정규화)
    if (!phoneKey || phoneKey.length < 10) return;
    // customers row가 아직 없으면(신규 사용자가 배송지부터 추가) insert로 보완해 DB 유실을 막는다.
    const { data: existing } = await supabase.from("customers").select("id").eq("customer_phone", phoneKey).limit(1);
    if (existing && existing.length > 0) {
      await supabase.from("customers").update({ shipping_addresses: addresses }).eq("customer_phone", phoneKey);
    } else {
      await supabase.from("customers").insert({ customer_phone: phoneKey, youtube_nickname: youtubeNickname.trim() || "", customer_name: customerName.trim() || "", shipping_addresses: addresses });
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

    // [검증 강화 2026-07-06] 01X 시작 10~11자리만 허용 — 잘못된 번호는 입금매칭·알림톡·배송 연락 전부 깨짐
    if (!/^01[016789][0-9]{7,8}$/.test(cleanPhone)) {
      showCustomerNotice("휴대폰 번호를 확인해주세요. 01로 시작하는 10~11자리만 가능합니다.");
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
        showCustomerNotice("금액을 입력해주세요.");
        return false;
      }

      if (toNumber(item.product_price) < 1) {
        showCustomerNotice("금액을 1원 이상으로 입력해주세요.");
        return false;
      }
    }

    // 안전망: 시트를 거치지 않은 경로로 담겼더라도, 등록상품이 "직접입력 필요"(없음입력 토글 OFF)인데
    // 색상/사이즈가 비어 있으면 제출을 막는다. (토글 ON=none / 옵션 있는 상품=select 은 막지 않음)
    for (const item of validItems) {
      const matchedProduct = findMatchedBroadcastProduct(item, broadcastProducts);
      if (!matchedProduct) continue;

      if (getRegisteredOptionMode(matchedProduct, "color") === "input" && !normalizeEmptyProductOptionValue(item.color)) {
        showCustomerNotice("색상을 입력해주세요.");
        return false;
      }

      if (getRegisteredOptionMode(matchedProduct, "size") === "input" && !normalizeEmptyProductOptionValue(item.size)) {
        showCustomerNotice("사이즈를 입력해주세요.");
        return false;
      }
    }

    if (!paymentMethod) {
      showCustomerNotice("결제 방법을 선택해주세요. (무통장입금 또는 카드결제)");
      return false;
    }

    if (paymentMethod === "카드결제" && (productAmount + shippingFee) < cardPaymentMinAmount) {
      showCustomerNotice(`카드결제는 택배비 포함 ${cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.`);
      return false;
    }

    if (!hasPrivacyConsent && !hasSavedOrderCustomerInfo && !privacyConsentChecked) {
      showCustomerNotice("개인정보 수집·이용 및 배송정보 제공 안내 확인이 필요합니다.");
      return false;
    }

    return true;
  };

  const submitOrder = async (options?: { allowMissingDetailAddress?: boolean }) => {
    // 연타/중복 제출 차단: 이미 처리 중이면 즉시 무시 (ref는 즉시 반영되어 state보다 안전)
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);

    try {
      const blockCheck = await refreshCustomerBlockStatus(customerPhone);

      if (blockCheck.blocked) {
        return; // (입금확인 모달은 2026-07-06 제거된 죽은 코드 — 닫을 것 없음)
      }

      if (!validate(options)) return;

      if (!hasPrivacyConsent && privacyConsentChecked && typeof window !== "undefined") {
        window.localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, PRIVACY_CONSENT_VERSION);
        setHasPrivacyConsent(true);
      }

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

      // 멱등성: 재시도 시 같은 키를 재사용한다. 성공한 뒤에만(아래 성공 분기) 새 키로 비운다.
      if (!pendingOrderKeyRef.current) {
        pendingOrderKeyRef.current = {
          groupId: crypto.randomUUID(),
          lookupCode: `RURU-${Date.now().toString(36).toUpperCase()}`,
        };
      }
      const groupId = pendingOrderKeyRef.current.groupId;
      const lookupCode = pendingOrderKeyRef.current.lookupCode;
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
          recipient_name: recipientName.trim() || customerName.trim(),
          recipient_phone: onlyNumber(recipientPhone) || cleanPhone,
          // 안 바뀌는 카카오 정체성 — 주문에 찍어두면 전화/이름 수정돼도 고객 조회가 안 깨짐
          // (주문 RPC 무관, 제출 직후 order_group_id로만 별도 UPDATE).
          kakao_id:
            typeof window !== "undefined"
              ? (localStorage.getItem("ruru_kakao_id") || "").trim()
              : "",
        }),
      });

      const orderSubmitPayload = await orderSubmitResponse.json().catch(() => null);

      if (!orderSubmitResponse.ok || !orderSubmitPayload?.ok) {
        throw new Error(orderSubmitPayload?.message || "주문 저장 실패");
      }

      // 제출 성공(서버가 신규 저장 또는 멱등 중복감지로 기존 주문을 반환) → 다음 주문은 새 키 사용
      pendingOrderKeyRef.current = null;

      const savedPointUsedAmount = toNumber(orderSubmitPayload?.point_used_amount);
      const savedPointOriginalAmount = toNumber(orderSubmitPayload?.point_original_amount) || appliedTotalAmount;
      const savedFinalAmount = Math.max(0, savedPointOriginalAmount - savedPointUsedAmount);

      if (savedPointUsedAmount > 0) {
        setCustomerPointBalance((current) => Math.max(0, Number(current || 0) - savedPointUsedAmount));
      }

      setDone({
        nickname: youtubeNickname.trim(),
        name: customerName.trim(),
        paymentMethod: paymentMethod === "카드결제" ? "카드결제" : "무통장입금",
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
      setOrderSheetOpen(false);

      clearOrderDraftData();

      setItems([{ ...emptyItem }]);
      setRequestMemo("");
      setPaymentMethod("");
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
      // 재시도를 위해 pendingOrderKeyRef는 비우지 않는다(같은 키 재사용 → 서버가 멱등 처리).
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
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

  const openCustomerInfoEditBottomSheet = (screen: "info" | "shipping_list" | "shipping_form" = "info") => {
    setCustomerInfoEditSnapshot({
      youtubeNickname,
      customerName,
      customerPhone,
      address,
      detailAddress,
    });
    setCustomerInfoEditInitialScreen(screen);
    setCustomerInfoEditSheetOpen(true);
  };

  const closeCustomerInfoEditBottomSheet = () => {
    if (customerInfoEditSnapshot) {
      setYoutubeNickname(customerInfoEditSnapshot.youtubeNickname);
      setCustomerName(customerInfoEditSnapshot.customerName);
      setCustomerPhone(customerInfoEditSnapshot.customerPhone);
      // 주소(address/detailAddress/zipcode)는 배송지 시트에서 확정된 현재 값을 유지한다.
      // (배송지 변경은 저장된 동작이므로 취소가 옛 주소로 되돌리면 안 됨.) 닉네임/이름/전화만 복원.
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

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}년 ${month}월 ${day}일 (${weekday}) ${hour}:${minute}`;
  };

  const ruruOrderLookupText = (value: unknown) => String(value || "").trim();

  // 고객 표시용 상태: filterKey(필터 카테고리 4종)와 displayText(배지 6종, 이모지 포함)를 함께 반환.
  // ⚠️ 관리자 페이지 용어/로직과 무관. 고객 주문조회 표시 전용.
  const ruruOrderLookupStatus = (
    order: any,
  ): { filterKey: CustomerOrderLookupFilter; displayText: string } => {
    // 1) 주문취소 최우선
    const cancelText = [
      order?.payment_status,
      order?.paymentStatus,
      order?.order_manage_status,
      order?.order_status,
      order?.admin_status,
      order?.admin_order_status_v2,
      order?.status,
    ]
      .map(ruruOrderLookupText)
      .join(" ");

    if (/주문서취소|주문취소|취소|환불|cancel|refund/i.test(cancelText)) {
      return { filterKey: "주문취소", displayText: "❌ 주문취소" };
    }

    // 2) 출고완료
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

    if (/출고완료|택배출고|배송출발|배송완료|송장|shipped/i.test(deliveryText)) {
      return { filterKey: "출고완료", displayText: "🚚 출고완료" };
    }

    // 3) 결제상태 (무통장 vs 카드)
    const paymentText = [
      order?.payment_status,
      order?.deposit_status,
      order?.admin_order_status_v2,
      order?.order_manage_status,
      order?.order_status,
      order?.admin_status,
      order?.status,
    ]
      .map(ruruOrderLookupText)
      .join(" ");

    const isCard = /카드/.test(ruruOrderLookupText(order?.payment_method)) || /card/i.test(paymentText);

    if (isCard) {
      if (/카드결제완료|card_paid|결제완료/i.test(paymentText)) {
        return { filterKey: "결제완료", displayText: "✅ 결제완료" };
      }
      return { filterKey: "결제대기", displayText: "💳 카결대기" };
    }

    // 무통장입금
    if (/입금확인|자동입금|수동입금|입금완료|확인완료|출고준비|결제완료|bank_paid|auto_paid|manual_paid/i.test(paymentText)) {
      return { filterKey: "결제완료", displayText: "✅ 결제완료" };
    }

    return { filterKey: "결제대기", displayText: "💰 입금대기" };
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
    setOrderLookupVisibleCount(10);

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

  const ruruOrderLookupPaymentMethod = (order: any) => {
    const m = ruruOrderLookupText(order?.payment_method);
    if (/카드/.test(m)) return "카드결제";
    if (/무통장|계좌|이체|입금/.test(m)) return "무통장입금";
    return m || "무통장입금";
  };

  // 같은 order_group_id 끼리 묶어 주문서 단위 그룹으로 만든다. (orders는 created_at desc → 그룹도 최신순)
  const orderLookupGroups: CustomerOrderLookupGroup[] = (() => {
    const map = new Map<string, any[]>();
    for (const order of orderLookupOrders) {
      const key =
        ruruOrderLookupText(order?.order_group_id) ||
        ruruOrderLookupText(order?.id) ||
        `${order?.created_at || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }

    return Array.from(map.entries()).map(([key, rows]) => {
      const head = rows[0];
      const status = ruruOrderLookupStatus(head);
      // 상품금액(배송비·카드수수료 제외) = product_price × qty (adjusted_product_price 우선)
      const rowProductAmount = (o: any) =>
        Number(o?.adjusted_product_price ?? Number(o?.product_price ?? 0) * Number(o?.qty ?? o?.quantity ?? 1));
      // 실배송비 / 카드수수료 / 결제금액(전부 포함)
      const rowShippingFee = (o: any) => Number(o?.adjusted_shipping_fee ?? o?.shipping_fee ?? 0);
      const rowCardExtra = (o: any) => Number(o?.vat_amount ?? 0);
      const rowTotalAmount = (o: any) =>
        Number(o?.final_amount ?? o?.adjusted_total_price ?? o?.total_price ?? o?.product_price ?? 0);

      const sumBy = (fn: (o: any) => number) =>
        rows.reduce((sum, o) => {
          const v = fn(o);
          return sum + (Number.isFinite(v) ? v : 0);
        }, 0);

      const productSubtotal = sumBy(rowProductAmount);
      const shippingTotal = sumBy(rowShippingFee);
      const cardExtraTotal = sumBy(rowCardExtra);
      const total = sumBy(rowTotalAmount);

      return {
        id: key,
        orderCode: ruruOrderLookupOrderCode(head),
        dateText: ruruOrderLookupDateText(head?.created_at),
        statusLabel: status.filterKey,
        statusDisplayText: status.displayText,
        deliveryLabel: status.filterKey === "출고완료" ? "출고완료" : "확인중",
        paymentMethodLabel: ruruOrderLookupPaymentMethod(head),
        // [송장 표시] 그룹 내 첫 송장 등록 행 기준 (읽기 전용)
        trackingNumber: (() => { const r = rows.find((o: any) => String(o?.tracking_number || "").trim()); return r ? String((r as any).tracking_number).trim() : ""; })(),
        trackingCompany: (() => { const r = rows.find((o: any) => String(o?.tracking_number || "").trim()); return r ? String((r as any).tracking_company || "").trim() : ""; })(),
        productAmountText: ruruOrderLookupWon(productSubtotal),
        shippingFeeText: shippingTotal > 0 ? ruruOrderLookupWon(shippingTotal) : "무료",
        cardExtraText: cardExtraTotal > 0 ? ruruOrderLookupWon(cardExtraTotal) : "",
        totalAmountText: ruruOrderLookupWon(total),
        products: rows.map((o) => ({
          name: ruruOrderLookupProductName(o),
          optionText: ruruOrderLookupOptionText(o),
          quantityText: ruruOrderLookupQuantityText(o),
          amountText: ruruOrderLookupWon(rowProductAmount(o)),
        })),
      };
    });
  })();

  const orderLookupFilteredGroups =
    orderLookupFilter === "전체"
      ? orderLookupGroups
      : orderLookupGroups.filter((g) => g.statusLabel === orderLookupFilter);

  const orderLookupVisibleGroups = orderLookupFilteredGroups.slice(0, orderLookupVisibleCount);
  const orderLookupHasMore = orderLookupVisibleCount < orderLookupFilteredGroups.length;

  const buttonBase = "transition-all duration-150 active:scale-[0.97]";


  // [정리 2026-07-06] 입금확인 모달(OrderDepositConfirmModal)은 "띄우지 않는" 죽은 코드였음 → 사용 코드 제거
  const handleSubmitOrderClick = () => {
    if (!validate()) return;

    // data-ruru-order-submit-direct-with-payment-sheet="v1"
    // 주문서 제출 전 기존 입금확인 모달은 띄우지 않습니다.
    // 무통장입금 주문은 저장 성공 후 공통 입금안내 바텀시트로 안내합니다.
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
    // 직접입력 창을 미완성(상품명/수량/금액 누락)으로 닫으면 그 항목이 카트에 남아
    // 수량0으로 제출을 막으므로 정리한다. 완성 항목/등록상품(product_id)은 보존.
    setItems((prev) => {
      const target = prev[directInputTargetIndex];
      if (!target || target.product_id) return prev;
      const incomplete = !target.product_name.trim() || !toNumber(target.qty) || !toNumber(target.product_price);
      if (!incomplete) return prev;
      const next = prev.filter((_, i) => i !== directInputTargetIndex);
      return next.length > 0 ? next : [{ ...emptyItem }];
    });
  };

  const confirmDirectInputSheet = async () => {
    const targetItem = items[directInputTargetIndex];

    if (!targetItem) {
      showCustomerNotice("직접입력 상품 정보를 다시 확인해주세요.", "warning");
      return;
    }

    // 빈 칸이 어디인지 바로 알 수 있게 한 칸씩 안내하고, 비어 있으면 담기를 막는다.
    if (!targetItem.product_name.trim()) {
      showCustomerNotice("상품명을 입력해주세요.", "warning");
      return;
    }

    if (!normalizeEmptyProductOptionValue(targetItem.color)) {
      showCustomerNotice("색상을 입력해주세요.", "warning");
      return;
    }

    if (!normalizeEmptyProductOptionValue(targetItem.size)) {
      showCustomerNotice("사이즈를 입력해주세요.", "warning");
      return;
    }

    if (!toNumber(targetItem.qty)) {
      showCustomerNotice("수량을 입력해주세요.", "warning");
      return;
    }

    if (!toNumber(targetItem.product_price)) {
      showCustomerNotice("금액을 입력해주세요.", "warning");
      return;
    }

    const doFinalize = () => {
      setProductSearchText("");
      setProductSearchOpenIndex(null);
      setDirectInputProductSearchMode(false);
      setDirectInputOpen(false);
      scrollToOrderProductList();
    };

    const isDuplicate = await checkDuplicateOrder({
      productId: String(targetItem.product_id ?? ""),
      productName: targetItem.product_name,
      color: targetItem.color,
      size: targetItem.size,
    });
    if (isDuplicate) {
      setDuplicateWarningPendingAction(() => doFinalize);
      setDuplicateWarningOpen(true);
      return;
    }
    doFinalize();
  };

  const TopCustomerNav = () => {
    const safeGreetingName = youtubeNickname || customerName || "고객";
    const safePointText = `${Math.max(0, Number(customerPointBalance || 0)).toLocaleString()}원`;
    const isTopNavEditActive = isEditingCustomerInfo || isEditMode || customerInfoEditSheetOpen;
    const topNavActiveButtonClass = "shrink-0 whitespace-nowrap rounded-full bg-rose-deep px-2.5 py-1.5 text-[12px] font-black text-white transition active:scale-[0.97]";
    const topNavInactiveButtonClass = "shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-black text-slate-700 transition active:scale-[0.97] active:border-rose-deep active:bg-rose-deep active:text-white";

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

    const cartCount = items.filter(
      (it) => it.product_name.trim() || it.color.trim() || it.size.trim() || it.product_price.trim(),
    ).length;

    return (
      <header style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff", borderBottom: "1px solid #E8E2DD", padding: "10px 12px" }}>
        <div style={{ margin: "0 auto", width: "100%", maxWidth: "560px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <Link href="/order" style={{ flexShrink: 0, fontSize: "19px", fontWeight: 800, letterSpacing: "-0.04em", color: "#7A1E47", textDecoration: "none" }}>루루동이</Link>
            {broadcast ? (
              <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, color: "#fff", background: "#C0392B", borderRadius: "4px", padding: "2px 6px", letterSpacing: "0.02em" }}>LIVE</span>
            ) : null}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "14px", fontWeight: 800, color: "#7A1E47" }}>👋 {safeGreetingName}님!</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "38px", padding: "0 13px", borderRadius: "99px", border: "1px solid #E7C9D4", background: "#F9EEF3", fontSize: "13px", fontWeight: 800, color: "#7A1E47", whiteSpace: "nowrap" }}>
              🪙 {`${Math.max(0, Number(customerPointBalance || 0)).toLocaleString()}P`}
            </div>
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

  // P3. 방송 영상 — 방송 ON + 유튜브 URL 있을 때만
  const isBroadcastOn = String(broadcast?.status || "").toUpperCase() === "ON";
  const broadcastYoutubeUrl = String(broadcast?.youtube_live_url || broadcast?.youtube_url || "").trim();
  const videoEmbedSrc = useMemo(() => {
    if (!broadcastYoutubeUrl) return "";
    try {
      const u = new URL(broadcastYoutubeUrl);
      let id = "";
      if (u.hostname.includes("youtu.be")) id = u.pathname.replace("/", "").trim();
      else if (u.searchParams.get("v")) id = u.searchParams.get("v") || "";
      else {
        const m = u.pathname.match(/\/(?:live|embed)\/([^/?]+)/);
        if (m?.[1]) id = m[1];
      }
      return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : "";
    } catch {
      return "";
    }
  }, [broadcastYoutubeUrl]);

  const directInputItem = items[directInputTargetIndex] || null;
  const registeredOptionDetailImages = registeredOptionSelectProduct
    ? normalizeDetailImages(registeredOptionSelectProduct.detail_image_urls)
    : [];
  const registeredOptionDescription = registeredOptionSelectProduct
    ? String(registeredOptionSelectProduct.product_description || registeredOptionSelectProduct.detail_description || registeredOptionSelectProduct.description || "").trim()
    : "";
  // [상세UI] 상단 썸네일 스트립용: 대표(커버) + 상세사진 통합(중복 제거). Baymard: 숨은 썸네일은 노출로 신호.
  const registeredOptionAllImages = registeredOptionSelectProduct
    ? Array.from(new Set([pickOrderProductImageUrl(registeredOptionSelectProduct), ...registeredOptionDetailImages].filter(Boolean)))
    : [];
  const registeredOptionStockVariants: { color: string; size: string; stock: number }[] = (() => {
    if (!registeredOptionSelectProduct) return [];
    try {
      const note = typeof registeredOptionSelectProduct.product_note === "string"
        ? JSON.parse(registeredOptionSelectProduct.product_note)
        : (registeredOptionSelectProduct.product_note as any);
      const stockMgmtOn = (note as any)?.stock_management_enabled === true || (registeredOptionSelectProduct as any)?.stock_management_enabled === true;
      if (!stockMgmtOn) return [];
      return Array.isArray((note as any)?.stock_variants) ? (note as any).stock_variants : [];
    } catch { return []; }
  })();
  const isSoldOutColorSize = (color: string, size: string) => {
    const nc = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
    // [재고 홀드] 다른 고객이 담아둔(예약) 수량까지 빼고 품절 판정 — 표시 전용(실차감은 제출 RPC)
    const pid = String(registeredOptionSelectProduct?.id ?? "");
    return registeredOptionStockVariants.length > 0 &&
      registeredOptionStockVariants.some((v) => {
        if (nc(v.color) !== nc(color) || nc(v.size) !== nc(size)) return false;
        const reserved = pid ? Number(reservedByVariant[reservationVariantKey(pid, v.color, v.size)] || 0) : 0;
        return Number(v.stock) - Math.max(0, reserved) <= 0;
      });
  };
  const registeredOptionColorChoices = registeredOptionSelectProduct
    ? getSelectableRegisteredOptions(registeredOptionSelectProduct, "color")
    : [];
  const registeredOptionSizeChoices = registeredOptionSelectProduct
    ? getSelectableRegisteredOptions(registeredOptionSelectProduct, "size")
    : [];
  const registeredOptionColorMode = registeredOptionSelectProduct
    ? getRegisteredOptionMode(registeredOptionSelectProduct, "color")
    : "none";
  const registeredOptionSizeMode = registeredOptionSelectProduct
    ? getRegisteredOptionMode(registeredOptionSelectProduct, "size")
    : "none";
  const registeredOptionPrice = registeredOptionSelectProduct ? Number(registeredOptionSelectProduct.price || 0) : 0;
  const registeredOptionTotalPrice = Math.max(1, registeredOptionQty) * (Number.isFinite(registeredOptionPrice) ? registeredOptionPrice : 0);
  const allOptionsSoldOut = registeredOptionSelectProduct ? isSoldOutOrderProduct(registeredOptionSelectProduct) : false;

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

  // [UI] 사이드 레일 아이콘 — 3D 이모지 → 딥로즈 단색 라인 SVG (기능·핸들러 무변경, 에셋만 교체)
  const railIconSvg = (name: string, stroke: string) => {
    const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none" as const, stroke, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    switch (name) {
      case "live":
        return (<svg {...common}><circle cx="12" cy="12" r="9" /><polygon points="10,8.5 16,12 10,15.5" fill={stroke} stroke="none" /></svg>);
      case "bell":
        return (<svg {...common}><path d="M18 8.5a6 6 0 0 0-12 0c0 6.3-2 7.5-2 7.5h16s-2-1.2-2-7.5" /><path d="M10.3 19.5a2 2 0 0 0 3.4 0" /></svg>);
      case "notice":
        return (<svg {...common}><path d="M3 10.5v3" /><path d="M6.5 9.2 18 4.5v15L6.5 14.8z" /><path d="M9.5 15.5v2.3a1.8 1.8 0 0 0 3.6 0v-1" /></svg>);
      case "box":
        return (<svg {...common}><path d="M21 8 12 3.5 3 8v8l9 4.5 9-4.5z" /><path d="M3 8l9 4.5L21 8" /><path d="M12 12.5V20" /></svg>);
      case "user":
        return (<svg {...common}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c0-3.8 3.3-5.7 7.5-5.7s7.5 1.9 7.5 5.7" /></svg>);
      case "chat":
        return (<svg {...common}><path d="M21 11.6a8.4 8.4 0 0 1-8.6 8.2c-1.5 0-2.9-.35-4.1-1L3 20l1.2-4A8.2 8.2 0 1 1 21 11.6z" /></svg>);
      case "refresh":
        return (<svg {...common}><path d="M20 11.5a8 8 0 1 0-2.2 6" /><path d="M20 5.5v6h-6" /></svg>);
      default:
        return null;
    }
  };
  const railCircle = (active: boolean): CSSProperties => ({ width: "44px", height: "44px", borderRadius: "50%", background: active ? "#7B2D43" : "#F2ECEE", display: "flex", alignItems: "center", justifyContent: "center" });
  const liveSideRail = (
    <div style={{ width: "52px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "11px", paddingTop: "2px" }}>
      <button type="button" disabled={!(isBroadcastOn && broadcastYoutubeUrl)} onClick={isBroadcastOn && broadcastYoutubeUrl ? () => window.open(broadcastYoutubeUrl, "_blank") : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: isBroadcastOn && broadcastYoutubeUrl ? "pointer" : "default", opacity: isBroadcastOn && broadcastYoutubeUrl ? 1 : 0.4 }}>
        <span style={railCircle(false)}>{railIconSvg("live", "#C0392B")}</span>
        <span style={{ fontSize: "9px", color: "#C0392B", fontWeight: 600 }}>라이브참여</span>
      </button>
      <button type="button" onClick={() => setAlertSheetOpen(true)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(liveAlertOptin)}>{railIconSvg("bell", liveAlertOptin ? "#fff" : "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: liveAlertOptin ? "#7B2D43" : "#555", fontWeight: 600 }}>{liveAlertOptin ? "알림 ON" : "방송알림"}</span>
      </button>
      <button type="button" onClick={() => setNoticeSheetOpen(true)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(false)}>{railIconSvg("notice", "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: "#555", fontWeight: 500 }}>공지</span>
      </button>
      <button type="button" onClick={() => openOrderLookupBottomSheet()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(false)}>{railIconSvg("box", "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: "#555", fontWeight: 500 }}>주문내역</span>
      </button>
      <button type="button" onClick={() => openCustomerInfoEditBottomSheet()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(false)}>{railIconSvg("user", "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: "#555", fontWeight: 500 }}>회원정보</span>
      </button>
      <button type="button" onClick={() => setInquirySheetOpen(true)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(false)}>{railIconSvg("chat", "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: "#555", fontWeight: 500 }}>문의</span>
      </button>
      <button type="button" onClick={() => window.location.reload()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
        <span style={railCircle(false)}>{railIconSvg("refresh", "#7B2D43")}</span>
        <span style={{ fontSize: "9px", color: "#555", fontWeight: 500 }}>새로고침</span>
      </button>
    </div>
  );

  return (
    <OrderPageShell>
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>
      {hasSavedInfo && <TopCustomerNav />}
      <PWAInstallBanner />

      {/* 접속 팝업 공지 — 카톡 로그인 후 주문서 첫 화면에 표시. 밴드 바로가기 + 24시간 안 보기 + 확인. 모든 모바일 대응. */}
      {popupOpen && hasSavedInfo ? (
        <div
          onClick={() => setPopupOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "380px", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "22px", boxShadow: "0 24px 70px rgba(0,0,0,0.32)", overflow: "hidden", border: `2.5px solid ${popupNoticeColor}` }}
          >
            {/* 색상 헤더 바 (제목 비우면 안 뜸) */}
            {popupNoticeTitle.trim() ? (
              <div style={{ background: popupNoticeColor, color: "#fff", padding: "15px 18px", fontSize: "19px", fontWeight: 800, textAlign: "center", letterSpacing: "0.3px" }}>{popupNoticeTitle}</div>
            ) : null}
            <div style={{ padding: "20px 18px 6px", overflowY: "auto" }}>
              {/* 점선 테두리 콘텐츠 박스 */}
              <div
                style={{
                  background: `${popupNoticeColor}0D`,
                  border: `1.5px dashed ${popupNoticeColor}66`,
                  borderRadius: "16px",
                  padding: "18px 16px",
                  fontSize: popupNoticeFontSize === "xlarge" ? "21px" : popupNoticeFontSize === "large" ? "19px" : "17px",
                  fontWeight: 600,
                  color: "#1A1A1A",
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  textAlign: "center",
                  wordBreak: "keep-all",
                }}
              >
                {popupNoticeText}
              </div>
            </div>
            <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {popupBandUrl ? (
                <a
                  href={popupBandUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", height: "54px", borderRadius: "13px", background: "#03C75A", color: "#fff", fontSize: "16px", fontWeight: 800, textDecoration: "none" }}
                >
                  👉 루루동이 밴드 바로가기
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setPopupOpen(false)}
                style={{ height: "54px", borderRadius: "13px", background: popupNoticeColor, color: "#fff", border: "none", fontSize: "16px", fontWeight: 800, cursor: "pointer" }}
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem("ruru_popup_notice_hide_until", String(Date.now() + 24 * 60 * 60 * 1000)); } catch {}
                  setPopupOpen(false);
                }}
                style={{ height: "46px", borderRadius: "13px", background: "#F5F3F0", color: "#888", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}
              >
                24시간 동안 열지 않기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CustomerPointGiftPopup />

      {/* P3. 방송 영상 — 방송 ON/OFF 상관없이 항상 표시 (좌:영상 / 우:라이브참여·공지) */}
      {hasSavedInfo ? (
        <section style={{ margin: "8px auto 0", width: "100%", maxWidth: "560px" }}>
          {!isBroadcastOn ? (
            <div style={{ display: "flex", gap: "8px", padding: "12px 16px 14px", borderBottom: "0.5px solid #E5E1DC" }}>
              {/* [UI] 쇼핑몰 모드: 방송 자리 빈 박스를 컴팩트하게 — 첫 화면에 상품이 바로 보이게 (방송 ON 영상 영역은 무변경) */}
              <div style={{ flex: 1, position: "relative", background: "#F6E7ED", borderRadius: "12px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center", padding: "26px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: "#a98792", background: "#fff", padding: "4px 11px", borderRadius: "99px", marginBottom: "10px" }}>🛍 쇼핑몰 모드</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#b09aa1", marginBottom: "8px" }}>지금은 라이브 방송 중이 아니에요</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#7B2D43", marginBottom: "10px", lineHeight: 1.35 }}>그래도 지금 바로<br />구매하실 수 있어요!</div>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "#9a7e87", lineHeight: 1.55, marginBottom: "20px" }}>마음에 드는 상품 언제든 주문 가능해요</div>
                  <button type="button" onClick={() => { document.getElementById("ruru-shop-top")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#7B2D43", color: "#fff", fontSize: "14px", fontWeight: 700, padding: "11px 20px", borderRadius: "99px", border: "none", cursor: "pointer" }}>🛒 상품 보러가기</button>
                </div>
              </div>
              {liveSideRail}
            </div>
          ) : (
          <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "0.5px solid #E5E1DC" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 800, color: "#C0392B" }}>
              <span style={{ fontSize: "9px" }}>●</span> LIVE 방송 중
            </span>
            <button type="button" onClick={() => { if (videoClosed) { setVideoClosed(false); setVideoOpen(true); } else { setVideoOpen((v) => !v); } }} style={{ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: "#7A1E47", cursor: "pointer" }}>{videoClosed ? "영상 보기 ▼" : (videoOpen ? "접기 ▲" : "펼치기 ▼")}</button>
          </div>
          {isBroadcastOn && !videoClosed ? (
          <>
          <div style={videoOpen ? { display: "flex", gap: "8px", padding: "0 14px 12px", borderBottom: "0.5px solid #E5E1DC" } : { height: 0, padding: 0, overflow: "hidden", border: "none" }}>
            <div ref={videoSlotRef} style={{ flex: 1, position: "relative", aspectRatio: "9 / 16", background: "#141414", borderRadius: "10px", overflow: "hidden" }}>
              {videoEmbedSrc ? (
                <div
                  ref={livePlayerRef}
                  style={videoOpen
                    ? { position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "10px", zIndex: 0, overflow: "hidden", background: "#141414" }
                    : { position: "fixed", zIndex: 45, width: "116px", height: "206px", overflow: "hidden", background: "#141414", borderRadius: "12px", boxShadow: "0 6px 20px rgba(0,0,0,0.28)" }}
                >
                  <iframe src={videoEmbedSrc} title="루루동이 라이브" style={{ width: "100%", height: "100%", border: "none", display: "block" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                  {!videoOpen && (
                    <>
                      <div
                        onPointerDown={(e) => {
                          const p = livePlayerRef.current; if (!p) return;
                          const rect = p.getBoundingClientRect();
                          const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
                          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                          const move = (ev: PointerEvent) => {
                            const w = rect.width, h = rect.height, m = 12;
                            let nl = ev.clientX - offX, nt = ev.clientY - offY;
                            nl = Math.max(m, Math.min(nl, window.innerWidth - w - m));
                            nt = Math.max(m, Math.min(nt, window.innerHeight - h - m));
                            setMiniPos({ left: nl, top: nt });
                          };
                          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                        style={{ position: "absolute", inset: 0, cursor: "move", touchAction: "none", zIndex: 1 }}
                      />
                      <button type="button" aria-label="펼치기" onPointerDown={(e) => e.stopPropagation()} onClick={() => setVideoOpen(true)} style={{ position: "absolute", top: "6px", left: "6px", zIndex: 2, width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "13px", cursor: "pointer" }}>⤢</button>
                      <button type="button" aria-label="닫기" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setVideoClosed(true); }} style={{ position: "absolute", top: "6px", right: "6px", zIndex: 2, width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "13px", cursor: "pointer" }}>✕</button>
                      <div style={{ position: "absolute", bottom: "6px", left: "6px", zIndex: 2, background: "#C0392B", color: "#fff", fontSize: "8px", fontWeight: 600, padding: "1px 5px", borderRadius: "99px", pointerEvents: "none" }}>● LIVE</div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "28px", opacity: 0.3 }}>📺</span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.5, marginTop: "6px" }}>현재 방송 중이<br />아닙니다</span>
                </div>
              )}
            </div>
            {videoOpen ? liveSideRail : null}
          </div>
          {videoOpen ? (
          <div style={{ padding: "9px 14px", borderBottom: "0.5px solid #E5E1DC", fontSize: "12px", fontWeight: 700, color: "#555" }}>
            {broadcast ? (
              <span>{ruruOrderLookupDateText(broadcast.started_at)} · {String(broadcast.broadcast_public_title || broadcast.public_title || "").trim() || "라이브 방송"}</span>
            ) : (
              <span>다음 방송을 기다려주세요 🙏</span>
            )}
          </div>
          ) : null}
          </>
          ) : null}
          </>
          )}
        </section>
      ) : null}

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
          {customerInfoMissing && (
            <section className="mt-3 rounded-[18px] border border-orange-200 bg-orange-50 p-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-orange-800">
              배송정보 확인이 필요합니다. 상단 [정보수정]에서 이름, 전화번호, 주소를 먼저 저장해주세요.
            </section>
          )}

          {/* P4. 상품 목록 — 검색 + 2열 격자 + 페이지네이션 (시안). quickGroupBuyProducts / selectQuickGroupBuyProduct 재사용 */}
          {(() => {
            // 쇼핑몰 닫힘(방송 OFF + shop_open=false)이면 그리드 대신 준비중 안내. 방송 ON이면 무관(항상 그리드).
            if (!isBroadcastOn && !shopOpen) {
              return (
                <section style={{ margin: "12px auto 0", width: "100%", maxWidth: "560px" }}>
                  <div style={{ padding: "44px 26px", textAlign: "center", color: "#7A1E47", fontSize: "16px", fontWeight: 800, border: "1px solid #D9C5CC", borderRadius: "16px", background: "#fff", lineHeight: 1.8 }}>
                    🛍 쇼핑몰 준비 중입니다
                    <div style={{ marginTop: "6px", fontSize: "13px", fontWeight: 600, color: "#ABA5A0" }}>잠시 후 다시 찾아주세요.</div>
                  </div>
                </section>
              );
            }
            const q = productSearchText.trim();
            const filtered = quickGroupBuyProducts.filter((p) => {
              if (q && !productMatchesSuggestion(p as BroadcastProduct, q)) return false;
              if (categoryFilter !== "전체") {
                const note = parseProductSuggestionNote((p as any).product_note);
                const cat = String((note as any)?.category ?? (p as any).category ?? (p as any).product_category ?? "").trim();
                if (cat !== categoryFilter) return false;
              }
              return true;
            });
            // 방송/쇼핑몰 상품 목록은 전부 표시(무한스크롤이 일부 기기에서 10개에서 멈추던 문제 해결).
            //   상품 수(방송 담긴분/카탈로그 ≤ 80)라 한 번에 렌더해도 가벼움.
            const visibleItems = filtered;
            // 카테고리 탭: 기본(의류/신발/잡화) + 상품에 실제로 쓰인 커스텀 카테고리(음식 등) 자동 노출
            const PRESET_CATS = ["의류", "신발", "잡화"];
            const presentCats = Array.from(
              new Set(
                quickGroupBuyProducts
                  .map((p) => {
                    const note = parseProductSuggestionNote((p as any).product_note);
                    return String((note as any)?.category ?? (p as any).category ?? (p as any).product_category ?? "").trim();
                  })
                  .filter(Boolean)
              )
            );
            const extraCats = presentCats.filter((c) => !PRESET_CATS.includes(c)).sort();
            const categoryTabs = ["전체", ...PRESET_CATS, ...extraCats];
            return (
              <section id="ruru-shop-top" style={{ margin: "12px auto 0", width: "100%", maxWidth: "560px", scrollMarginTop: "70px" }}>
                <input
                  value={productSearchText}
                  onChange={(e) => { setProductSearchText(e.target.value); setProductPage(1); setVisibleProductCount(10); }}
                  placeholder="🔍 상품 이름 검색"
                  style={{ width: "100%", height: "48px", boxSizing: "border-box", border: "1px solid #D9C5CC", borderRadius: "14px", padding: "0 16px", fontSize: "15px", fontWeight: 700, color: "#333", outline: "none" }}
                />
                <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {categoryTabs.map((cat) => {
                    const on = categoryFilter === cat;
                    return (
                      <button key={cat} type="button" onClick={() => { setCategoryFilter(cat); setVisibleProductCount(10); }} style={{ flex: 1, height: "36px", borderRadius: "999px", border: on ? "none" : "1px solid #D9C5CC", background: on ? "#7A1E47" : "#fff", color: on ? "#fff" : "#7A1E47", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>{cat}</button>
                    );
                  })}
                </div>
                {visibleItems.length === 0 ? (
                  <div style={{ marginTop: "14px", padding: "26px", textAlign: "center", color: "#999", fontSize: "14px", fontWeight: 700 }}>찾는 상품이 없어요. 아래 직접 입력으로 담아주세요.</div>
                ) : (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column" }}>
                    {visibleItems.map((product) => {
                      const img = pickOrderProductImageUrl(product);
                      const pinned = isPinnedOrderProduct(product);
                      const sold = (() => {
                        if (isSoldOutOrderProduct(product)) return true;
                        // 주문서에 담긴 수량 + 다른 고객 홀드(예약) 합산 후 재고 초과 체크
                        const productIdStr = String(product.id ?? "");
                        if (!productIdStr) return false;
                        try {
                          const note = typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note;
                          if (note?.stock_management_enabled !== true) return false;
                          const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
                          const normC = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
                          if (variants.length === 0) {
                            // 총재고(옵션 없는) 상품: 다른 고객 홀드 + 내 주문서 수량 반영
                            const totalStock = Number((product as any)?.stock ?? (product as any)?.total_stock);
                            if (!Number.isFinite(totalStock)) return false;
                            const inCartTotal = items
                              .filter((item) => item.product_id === productIdStr)
                              .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                            const reservedTotal = Number(reservedByProduct[productIdStr] || 0);
                            return inCartTotal + reservedTotal >= totalStock;
                          }
                          return variants.every((v: any) => {
                            const maxStock = Number(v.stock ?? 0);
                            const inCart = items
                              .filter((item) => item.product_id === productIdStr && normC(item.color) === normC(String(v.color ?? "")) && normC(item.size) === normC(String(v.size ?? "")))
                              .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                            const reserved = Number(reservedByVariant[reservationVariantKey(productIdStr, v.color, v.size)] || 0);
                            return inCart + reserved >= maxStock;
                          });
                        } catch { return false; }
                      })();
                      const badgeType = String((product as unknown as Record<string, unknown>)?.badge_type || "").trim().toLowerCase();
                      const badges =
                        Array.isArray((product as any).badge_types) && (product as any).badge_types.length
                          ? (product as any).badge_types.map((x: any) => String(x).trim().toLowerCase())
                          : badgeType && badgeType !== "none"
                            ? [badgeType]
                            : [];
                      return (
                        <div
                          key={String(product.id)}
                          style={isBroadcastOn && pinned
                            ? { padding: "12px", margin: "8px 0 12px", borderRadius: "14px", border: "1.5px solid #7A1E47", background: "#FDF3F7", boxShadow: "0 4px 16px rgba(122,30,71,0.10)" }
                            : { padding: "13px 0", borderBottom: "0.5px solid #E5E1DC" }}
                        >
                          {/* [UI] 방송 ON + 고정상품 = "지금 소개 중" 강조 카드 — 채팅에서 말하는 상품과 사이트 첫 화면 동기화 */}
                          {isBroadcastOn && pinned ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", fontSize: "12px", fontWeight: 900, color: "#7A1E47" }}>
                              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#E8340A", animation: "shimmer 1.2s ease-in-out infinite" }} />
                              지금 방송에서 소개 중
                            </div>
                          ) : null}
                          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <div onClick={() => { if (img) setLightboxImage(img); }} style={{ position: "relative", flexShrink: 0, width: "84px", height: "84px", borderRadius: "10px", background: "#F0EBE8", overflow: "hidden", cursor: img ? "zoom-in" : "default" }}>
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                            {sold ? (
                              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", borderRadius: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ color: "white", fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>SOLD OUT</span>
                              </div>
                            ) : null}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", gap: "4px", marginBottom: "4px", flexWrap: "wrap" }}>
                              {isBroadcastOn && pinned ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "#E8340A", borderRadius: "5px", padding: "2px 6px" }}>🔴 라이브</span> : null}
                              {!isBroadcastOn && pinned ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "#7A1E47", borderRadius: "5px", padding: "2px 6px" }}>📌 추천</span> : null}
                              {badges.includes("new") ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#0F6E56", background: "#E7F3EE", borderRadius: "5px", padding: "2px 6px" }}>NEW</span> : null}
                              {badges.includes("hot") ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#C0392B", background: "#FBEAE7", borderRadius: "5px", padding: "2px 6px", animation: "shimmer 1.5s ease-in-out infinite" }}>HOT</span> : null}
                              {badges.includes("limit") ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#854F0B", background: "#FBF1E0", borderRadius: "5px", padding: "2px 6px" }}>한정</span> : null}
                              {!sold ? (() => {
                                // 옵션 상품: 임박 옵션만 옵션별 표시(합산 금지) / 단일 상품: N개 남음 — 다른 고객 홀드 반영
                                const pidForLow = String(product.id ?? "");
                                const lowOpts = lowStockOptionsOrderProduct(product, (c, s) => Number(reservedByVariant[reservationVariantKey(pidForLow, c, s)] || 0));
                                if (lowOpts.length > 0) {
                                  // 가장 급한(재고 적은) 순으로 최대 2개만, "외 N" 같은 축약 표현은 헷갈려서 안 씀(사장님 지침)
                                  const shown = [...lowOpts].sort((a, b) => a.stock - b.stock).slice(0, 2).map((o) => `${o.label} ${o.stock}개`).join(" · ");
                                  return <span style={{ fontSize: "10px", fontWeight: 800, color: "#C0392B", background: "#FBEAE7", borderRadius: "5px", padding: "2px 6px" }}>🔥 {shown} 남음</span>;
                                }
                                const remain = lowStockRemainOrderProduct(product, Number(reservedByProduct[pidForLow] || 0));
                                return remain !== null ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#C0392B", background: "#FBEAE7", borderRadius: "5px", padding: "2px 6px" }}>🔥 {remain}개 남음</span> : null;
                              })() : null}
                              {badges.includes("pick") ? <span style={{ borderRadius: "4px", fontSize: "9px", fontWeight: 700, padding: "2px 6px", background: "#FFF8E7", color: "#B8860B" }}>⭐ MD픽</span> : null}
                              {badges.includes("direct") ? <span style={{ borderRadius: "4px", fontSize: "9px", fontWeight: 700, padding: "2px 6px", background: "#E8F0FE", color: "#1D4ED8" }}>🛒 바로구매</span> : null}
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#222", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.product_name}</div>
                            {/* 바로구매 부가설명 유지(사장님 지침: 배지만으론 신규 고객이 뜻을 모름) + 가격 위계 강화 15→17px */}
                            {badges.includes("direct") ? (<div style={{ fontSize: 11, color: "#8A8A8A", marginTop: 2, lineHeight: 1.3 }}>방송 접수 없이 지금 바로 구매 가능</div>) : null}
                            <div style={{ marginTop: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                              <span style={{ fontSize: "17px", fontWeight: 800, color: "#7A1E47" }}>{won(Number(product.price || 0))}</span>
                              <button
                                type="button"
                                disabled={sold}
                                onClick={() => selectQuickGroupBuyProduct(product as BroadcastProduct)}
                                style={{ flexShrink: 0, height: "32px", padding: "0 16px", borderRadius: "8px", border: "none", background: sold ? "#ccc" : "#7A1E47", color: "#fff", fontSize: "12px", fontWeight: 800, cursor: sold ? "default" : "pointer" }}
                              >
                                {sold ? "품절" : "담기"}
                              </button>
                            </div>
                          </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {directInputEnabled ? (
                  <button type="button" onClick={openDirectInputSheet} style={{ marginTop: "12px", width: "100%", border: "1px solid #D9C5CC", background: "#fff", borderRadius: "14px", padding: "13px", fontSize: "14px", fontWeight: 800, color: "#7A1E47", cursor: "pointer" }}>+ 상품을 못 찾으셨나요? 직접 입력하기</button>
                ) : null}
              </section>
            );
          })()}

          {orderSheetOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 35, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setOrderSheetOpen(false); }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "430px", maxHeight: "92dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#E5E1DC", margin: "12px auto 0", flexShrink: 0 }} />
              <div style={{ flexShrink: 0, padding: "12px 18px", borderBottom: "0.5px solid #E5E1DC", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: "17px", fontWeight: 800, color: "#1A1A1A" }}>주문서 확인</span>
                </div>
                <button type="button" onClick={() => setOrderSheetOpen(false)} aria-label="닫기" style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#F5F3F0", border: "none", color: "#888", fontSize: "15px", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {/* 🚚 배송지 카드 */}
                <div style={{ margin: "12px 16px 0", border: "1px solid #E5E1DC", borderRadius: "12px", padding: "12px 14px", background: "#FAF8F6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#1A1A1A" }}>🚚 배송지</span>
                    <button type="button" onClick={() => openCustomerInfoEditBottomSheet("shipping_list")} style={{ border: "1px solid #D9C5CC", background: "#fff", color: "#7A1E47", borderRadius: "8px", padding: "4px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>변경</button>
                  </div>
                  <div style={{ fontSize: "12px", color: "#444", lineHeight: 1.8 }}>
                    <div>닉네임: {youtubeNickname.trim() || "-"}</div>
                    <div>받는 분: {(recipientName.trim() || customerName.trim()) || "-"}</div>
                    <div>연락처: {formatPhone(recipientPhone.trim() || customerPhone) || "-"}</div>
                    <div>주소: {address.trim() ? `${address.trim()}${detailAddress.trim() ? " " + detailAddress.trim() : ""}` : "주소 미입력"}</div>
                  </div>
                </div>
            {selectedItemEntries.length === 0 ? (
              <div style={{ padding: "40px 18px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 800, color: "#1A1A1A" }}>아직 담은 상품이 없습니다.</p>
                <p style={{ marginTop: "6px", fontSize: "12px", fontWeight: 600, color: "#ABA5A0", lineHeight: 1.6 }}>상품목록에서 [담기]를 누르거나 [직접 입력]으로 담아주세요.</p>
              </div>
            ) : (
              <div>
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
                  const itemAmount = toNumber(item.product_price) * toNumber(item.qty);

                  return (
                    <article
                      key={`selected-item-${index}`}
                      style={{ padding: "12px 18px", borderBottom: "0.5px solid #E5E1DC", display: "flex", gap: "10px", alignItems: "flex-start" }}
                    >
                      <div style={{ width: "54px", height: "54px", borderRadius: "8px", background: "#F0EBE8", flexShrink: 0, overflow: "hidden" }}>
                        {imageUrl ? (
                          <img src={imageUrl} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800, color: "#ABA5A0", textAlign: "center", padding: "0 4px" }}>{itemSourceLabel}</div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product_name || "상품명 없음"}</div>
                        <div style={{ fontSize: "11px", color: "#ABA5A0", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemHasNoOptions ? "옵션 없음" : `${optionColorText} / ${optionSizeText}`} · 단가 {won(toNumber(item.product_price))}</div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", gap: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: toNumber(item.qty) > 0 ? "#6B6460" : "#e74c3c" }}>수량 {toNumber(item.qty)}개</span>
                          <span style={{ flexShrink: 0, fontSize: "14px", fontWeight: 700, color: "#7A1E47" }}>{won(itemAmount)}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeItem(index)} aria-label="상품 삭제"
                        style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "#F0EBE8", color: "#999", fontSize: "13px", cursor: "pointer", lineHeight: 1, alignSelf: "flex-start" }}>✕</button>
                    </article>
                  );
                })}
              </div>
            )}

            <section style={{ padding: "16px 18px", borderTop: "0.5px solid #E5E1DC" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#1A1A1A", marginBottom: "12px" }}>결제 방법을 선택해 주세요.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {(["무통장입금", "카드결제"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    style={{ minHeight: "68px", borderRadius: "16px", padding: "12px", textAlign: "left", border: paymentMethod === method ? "2px solid #7A1E47" : "1px solid #E5E1DC", background: paymentMethod === method ? "#F9EEF3" : "#fff", cursor: "pointer" }}
                  >
                    <span style={{ display: "block", fontSize: "15px", fontWeight: 800, color: paymentMethod === method ? "#7A1E47" : "#444" }}>
                      {method === "카드결제" ? `카드결제 (+${cardRateForCustomer}%)` : method}
                    </span>
                    <span style={{ marginTop: "4px", display: "block", fontSize: "11px", fontWeight: 800, lineHeight: 1.3, color: paymentMethod === method ? "#7A1E47" : "#999" }}>
                      {method === "무통장입금" ? "입금자명·금액 확인" : "카톡채널 결제 문의"}
                    </span>
                  </button>
                ))}
              </div>

              {paymentMethod === "카드결제" && (
                <div style={{ marginTop: "12px", borderRadius: "16px", border: "1px solid #E5E1DC", background: "#F9EEF3", padding: "12px", fontSize: "13px", fontWeight: 800, lineHeight: 1.6, color: "#7A1E47" }}>
                  ⓘ 카드결제는 택배비 포함 {cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.
                  <br />
                  주문서 제출 후 카톡채널로 문의 남겨주세요.
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
                  className="min-h-[88px] w-full resize-none rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-[15px] font-bold leading-relaxed tracking-[-0.04em] outline-none focus:border-rose-deep"
                />
              </label>
            </section>

            <section
              data-ruru-price-section="redesigned"
              style={{ padding: "16px 18px", borderTop: "0.5px solid #E5E1DC" }}
            >
              <div className="min-w-0">
                <p className="text-[12px] font-black tracking-[-0.04em]" style={{ color: "#7A1E47" }}>
                  최종 확인
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
                  paymentMethod={paymentMethod === "카드결제" ? "카드결제" : "무통장입금"}
                  customerPointBalance={customerPointBalance}
                  customerPointLoading={customerPointLoading}
                  pointUseInput={commaNumberText(pointUseInput)}
                  pointUsedAmount={selectedPointUseAmount}
                  finalAmount={finalPaymentAmount}
                  pointEarnRate={pointEarnRateForDisplay}
                  showPointUse={customerPointBalance >= 1000 && totalAmount > 0}
                  onPointUseInputChange={(value) => setPointUseInput(onlyNumber(value))}
                  onUseAllPoints={() => setPointUseInput(String(Math.min(customerPointBalance, totalAmount)))}
                />
              </div>

              {!hasPrivacyConsent && !hasSavedOrderCustomerInfo && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[22px] bg-rose-soft p-4 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-rose-deep ring-1 ring-rose-line active:scale-[0.99]">
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
                    className="mt-1 h-5 w-5 shrink-0 accent-rose-deep"
                  />
                  <span>
                    [필수] 개인정보 수집·이용 및 배송정보 제공 안내를 확인했습니다.
                    <br />
                    <span className="text-slate-500">한 번 동의하면 다음부터 다시 묻지 않습니다.</span>
                  </span>
                </label>
              )}
            </section>
              </div>

              <div style={{ flexShrink: 0, padding: "12px 18px calc(12px + env(safe-area-inset-bottom))", borderTop: "0.5px solid #E5E1DC", background: "#fff" }}>
                <button
                  type="button"
                  onClick={handleSubmitOrderClick}
                  disabled={submitting || customerBlockStatus.blocked}
                  style={{ width: "100%", padding: "14px", background: submitting || customerBlockStatus.blocked ? "#cbd5e1" : "#7A1E47", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 700, cursor: submitting || customerBlockStatus.blocked ? "default" : "pointer" }}
                >
                  {customerBlockStatus.blocked ? "주문 제한됨" : submitting ? "제출 중..." : `${won(finalPaymentAmount)} 주문서 제출 →`}
                </button>
              </div>
            </div>
          </div>
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

            {addressSearchOpen ? (
              <div
                onClick={(e) => { if (e.target === e.currentTarget) setAddressSearchOpen(false); }}
                style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 12px" }}
              >
                <div style={{ width: "100%", maxWidth: "480px", height: "80vh", background: "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden", position: "relative" }}>
                  <KakaoPostcodeEmbed
                    onComplete={handleAddressSearchComplete}
                    onClose={(state) => { if (state === "FORCE_CLOSE") setAddressSearchOpen(false); }}
                    autoClose={false}
                    style={{ width: "100%", height: "100%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setAddressSearchOpen(false)}
                    style={{ position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 1, background: "#f1f1f1", border: "none", borderRadius: "20px", fontSize: "14px", color: "#555", cursor: "pointer", padding: "8px 24px", fontWeight: 700 }}
                  >✕ 닫기</button>
                </div>
              </div>
            ) : null}

            <CustomerMissingDetailAddressPanel
              open={missingDetailAddressConfirmOpen}
              onClose={() => setMissingDetailAddressConfirmOpen(false)}
              onConfirm={submitOrderWithoutDetailAddress}
            />

            {customerBlockStatus.blocked ? <CustomerBlockedNotice /> : null}

          {/* 상품 이미지 크게 보기 (lightbox) */}
          {lightboxImage ? (
            <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", padding: "20px" }} onClick={() => setLightboxImage("")}>
              <button type="button" onClick={() => setLightboxImage("")} aria-label="닫기" style={{ position: "absolute", top: "16px", right: "16px", width: "44px", height: "44px", borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "22px", cursor: "pointer" }}>✕</button>
              <img src={lightboxImage} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "12px" }} />
            </div>
          ) : null}

          {/* [UI] 담기 완료 — 차단형 모달 → 비차단 자동소멸 토스트 (방송 중 연속 담기 안 끊기게. 하단바가 담은 개수 표시 담당) */}
          {cartAddedOpen && (
            <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(92px + env(safe-area-inset-bottom))", zIndex: 140, maxWidth: "88%", background: "rgba(52,20,31,0.93)", color: "#fff", borderRadius: "14px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", pointerEvents: "none" }}>
              <span style={{ flexShrink: 0, width: "22px", height: "22px", borderRadius: "50%", background: "#0F6E56", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 900 }}>✓</span>
              <span style={{ minWidth: 0, fontSize: "13px", fontWeight: 800, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cartAddedItem ? `${String(cartAddedItem.product_name || "상품")} ${Number(cartAddedItem.qty) || 1}개 담았어요` : "주문서에 담았어요"}
              </span>
            </div>
          )}

          {duplicateWarningOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: "0 24px" }} onClick={(e) => { if (e.target === e.currentTarget) { setDuplicateWarningOpen(false); setDuplicateWarningPendingAction(null); } }}>
              <div style={{ width: "320px", maxWidth: "100%", background: "#fff", borderRadius: "20px", padding: "24px 22px", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#C0392B", textAlign: "center" }}>🚨 잠깐! 이미 담은 상품이에요</div>
                <div style={{ marginTop: "10px", fontSize: "14px", fontWeight: 600, color: "#555", textAlign: "center", lineHeight: 1.6 }}>중복 주문 아닌가요? 그래도 추가하시겠어요?</div>
                <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button type="button" onClick={() => { setDuplicateWarningOpen(false); setDuplicateWarningPendingAction(null); }} style={{ height: "50px", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "15px", fontWeight: 800, color: "#666", cursor: "pointer" }}>취소</button>
                  <button type="button" onClick={() => { const action = duplicateWarningPendingAction; setDuplicateWarningOpen(false); setDuplicateWarningPendingAction(null); action?.(); }} style={{ height: "50px", borderRadius: "14px", border: "none", background: "#7A1E47", fontSize: "15px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>그래도 담기</button>
                </div>
              </div>
            </div>
          )}

          {registeredOptionSelectProduct && (
            <div style={{ position: "fixed", inset: 0, zIndex: 128, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) closeRegisteredOptionSelectSheet(); }}>
              <div data-sheet style={{ width: "100%", maxWidth: "430px", maxHeight: "92dvh", display: "flex", flexDirection: "column", background: "#fff", borderTopLeftRadius: "26px", borderTopRightRadius: "26px", overflow: "hidden" }}>
                <div style={{ flexShrink: 0, borderBottom: "1px solid #F0EAE0", padding: "12px 16px 16px" }}>
                  <SheetGrabber onClose={closeRegisteredOptionSelectSheet} style={{ margin: "0 auto 6px" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div onClick={() => { const u = pickOrderProductImageUrl(registeredOptionSelectProduct); if (u) setLightboxImage(u); }} style={{ width: "60px", height: "60px", flexShrink: 0, borderRadius: "12px", overflow: "hidden", background: "#F0EBE8", cursor: pickOrderProductImageUrl(registeredOptionSelectProduct) ? "zoom-in" : "default" }}>
                      {pickOrderProductImageUrl(registeredOptionSelectProduct) ? (
                        <img src={pickOrderProductImageUrl(registeredOptionSelectProduct)} alt={registeredOptionSelectProduct.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{registeredOptionSelectProduct.product_name}</div>
                      <div style={{ marginTop: "3px", fontSize: "15px", fontWeight: 800, color: "#7A1E47" }}>{registeredOptionPrice > 0 ? won(registeredOptionPrice) : "가격 직접입력"}</div>
                    </div>
                  </div>
                  {registeredOptionAllImages.length > 1 ? (
                    <div style={{ display: "flex", gap: "6px", marginTop: "10px", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "2px" }}>
                      {registeredOptionAllImages.map((img, i) => (
                        <img key={`thumb-${i}`} src={img} alt="" onClick={() => setLightboxImage(img)} style={{ width: "46px", height: "46px", flexShrink: 0, borderRadius: "8px", objectFit: "cover", cursor: "zoom-in", border: "1px solid #EEE7E1", background: "#F0EBE8" }} />
                      ))}
                    </div>
                  ) : null}
                </div>

                <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "16px" }}>
                  {registeredOptionColorMode === "none" && registeredOptionSizeMode === "none" ? (
                    <div style={{ padding: "12px 16px 0", fontSize: "12px", color: "#ABA5A0" }}>
                      이 상품은 옵션이 없습니다. 수량만 선택해 주세요.
                    </div>
                  ) : null}
                  {registeredOptionColorChoices.length > 0 ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>색상</div>
                      {registeredOptionColorChoices.length <= 4 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {registeredOptionColorChoices.map((option) => {
                            const selected = registeredOptionColor === option;
                            const soldOut = isSoldOutColorSize(option, registeredOptionSize);
                            return (
                              <button key={`c-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionColor((prev) => prev === option ? "" : option); }} style={{ height: "44px", borderRadius: "12px", border: `1.5px solid ${selected ? "#7A1E47" : "#E8E2DD"}`, background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", fontSize: "14px", fontWeight: 800, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? option + " (품절)" : option}</button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {registeredOptionColorChoices.map((option) => {
                            const selected = registeredOptionColor === option;
                            const soldOut = isSoldOutColorSize(option, registeredOptionSize);
                            return (
                              <button key={`c-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionColor((prev) => prev === option ? "" : option); }} style={{ height: "34px", borderRadius: "999px", padding: "0 14px", border: `1.5px solid ${selected ? "#7A1E47" : "#E8E2DD"}`, background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? option + " (품절)" : option}</button>
                            );
                          })}
                        </div>
                      )}
                      {!registeredOptionColor.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>색상을 선택해주세요</div> : null}
                    </div>
                  ) : null}

                  {/* [UI] 옵션 없는 상품의 "없음" 죽은 칸 제거 — 안내 문구가 이미 있음 */}

                  {registeredOptionColorMode === "input" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>색상</div>
                      <input value={registeredOptionColor} onChange={(e) => setRegisteredOptionColor(e.target.value)} placeholder="색상을 입력해주세요" style={{ height: "46px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: `1.5px solid ${!registeredOptionColor.trim() ? "#E8B5B0" : "#E8E2DD"}`, background: "#fff", padding: "0 14px", fontSize: "15px", fontWeight: 700, color: "#222", outline: "none" }} />
                      {!registeredOptionColor.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>색상을 입력해주세요</div> : null}
                    </div>
                  ) : null}

                  {registeredOptionSizeChoices.length > 0 ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>사이즈</div>
                      {registeredOptionSizeChoices.length <= 4 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {registeredOptionSizeChoices.map((option) => {
                            const selected = registeredOptionSize === option;
                            const soldOut = isSoldOutColorSize(registeredOptionColor, option);
                            return (
                              <button key={`s-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionSize((prev) => prev === option ? "" : option); }} style={{ height: "44px", borderRadius: "12px", border: `1.5px solid ${selected ? "#7A1E47" : "#E8E2DD"}`, background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", fontSize: "14px", fontWeight: 800, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? sizeDisplayLabel(option) + " (품절)" : sizeDisplayLabel(option)}</button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {registeredOptionSizeChoices.map((option) => {
                            const selected = registeredOptionSize === option;
                            const soldOut = isSoldOutColorSize(registeredOptionColor, option);
                            return (
                              <button key={`s-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionSize((prev) => prev === option ? "" : option); }} style={{ height: "34px", borderRadius: "999px", padding: "0 14px", border: `1.5px solid ${selected ? "#7A1E47" : "#E8E2DD"}`, background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? sizeDisplayLabel(option) + " (품절)" : sizeDisplayLabel(option)}</button>
                            );
                          })}
                        </div>
                      )}
                      {!registeredOptionSize.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>사이즈를 선택해주세요</div> : null}
                    </div>
                  ) : null}

                  {/* [UI] 옵션 없는 상품의 "없음" 죽은 칸 제거 — 안내 문구가 이미 있음 */}

                  {registeredOptionSizeMode === "input" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>사이즈</div>
                      <input value={registeredOptionSize} onChange={(e) => setRegisteredOptionSize(e.target.value)} placeholder="사이즈를 입력해주세요" style={{ height: "46px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: `1.5px solid ${!registeredOptionSize.trim() ? "#E8B5B0" : "#E8E2DD"}`, background: "#fff", padding: "0 14px", fontSize: "15px", fontWeight: 700, color: "#222", outline: "none" }} />
                      {!registeredOptionSize.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>사이즈를 입력해주세요</div> : null}
                    </div>
                  ) : null}

                  {registeredOptionDetailImages.length > 0 || registeredOptionDescription ? (
                    <div style={{ marginTop: "16px", borderTop: "1px solid #F0EAE0", paddingTop: "14px" }}>
                      <div style={{ marginBottom: "10px", fontSize: "14px", fontWeight: 800, color: "#333" }}>상품 상세</div>
                      {registeredOptionDetailImages.length > 0 ? (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {registeredOptionDetailImages.map((img, i) => (
                            <img key={i} src={img} alt="" onClick={() => setLightboxImage(img)} style={{ width: "100%", borderRadius: "10px", objectFit: "cover", cursor: "zoom-in", background: "#F0EBE8" }} />
                          ))}
                        </div>
                      ) : null}
                      {registeredOptionDescription ? (
                        <div style={{ marginTop: "10px", fontSize: "13px", color: "#555", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{registeredOptionDescription}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "1px solid #F0EAE0", background: "#fff", padding: "16px 18px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 800, color: "#333" }}>수량</span>
                  <div style={{ display: "grid", gridTemplateColumns: "40px 44px 40px", height: "44px", borderRadius: "12px", border: "1px solid #E8E2DD", overflow: "hidden" }}>
                    <button type="button" onClick={() => setRegisteredOptionQty((c) => Math.max(1, c - 1))} style={{ borderRight: "1px solid #F0EAE0", background: "#fff", fontSize: "18px", fontWeight: 800, color: "#555", cursor: "pointer" }}>−</button>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 800, color: "#222" }}>{registeredOptionQty}</div>
                    <button type="button" onClick={() => {
                      const maxStock = (() => {
                        if (!registeredOptionSelectProduct || registeredOptionStockVariants.length === 0) return 999;
                        const nm2 = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
                        const matched = registeredOptionStockVariants.find((v: any) => nm2(v.color) === nm2(registeredOptionColor) && nm2(v.size) === nm2(registeredOptionSize));
                        return matched ? Number(matched.stock) : 999;
                      })();
                      setRegisteredOptionQty((c) => Math.min(c + 1, maxStock));
                    }} style={{ borderLeft: "1px solid #F0EAE0", background: "#fff", fontSize: "18px", fontWeight: 800, color: "#7A1E47", cursor: "pointer" }}>+</button>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#999" }}>선택금액</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#222" }}>{registeredOptionTotalPrice > 0 ? won(registeredOptionTotalPrice) : "가격 직접입력"}</div>
                  </div>
                </div>

                <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: "10px", borderTop: "1px solid #F0EAE0", background: "#fff", padding: "14px 18px calc(16px + env(safe-area-inset-bottom))" }}>
                  <button type="button" onClick={closeRegisteredOptionSelectSheet} style={{ height: "52px", borderRadius: "16px", border: "none", background: "#F1ECEE", fontSize: "16px", fontWeight: 800, color: "#666", cursor: "pointer" }}>닫기</button>
                  {allOptionsSoldOut ? (
                    <button type="button" disabled style={{ height: "52px", borderRadius: "16px", border: "none", background: "#ccc", fontSize: "16px", fontWeight: 800, color: "#fff", cursor: "not-allowed" }}>품절</button>
                  ) : (
                    <button type="button" onClick={confirmRegisteredOptionSelectSheet} style={{ height: "52px", borderRadius: "16px", border: "none", background: "#7A1E47", fontSize: "16px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>주문서에 담기</button>
                  )}
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
                        추천에 없는 상품을 직접 입력
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
                          className="h-13 min-w-0 w-full rounded-[18px] border border-rose-deep bg-white px-4 text-[17px] font-black tracking-[-0.05em] text-slate-950 outline-none focus:border-rose-deep"
                        />
                      </label>

                      {productSearchOpenIndex === directInputTargetIndex && productSearchText.trim().length > 0 ? (
                        <div className={directInputProductSearchMode ? "max-h-[32dvh] overscroll-contain overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2" : "max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2"}>
                          <div className="px-3 py-2 text-[11px] font-bold tracking-[-0.03em] text-slate-400">
                            혹시 이 상품인가요? (눌러서 자동입력)
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
                                  className="w-full rounded-xl px-3 py-2 text-left hover:bg-white active:scale-[0.99]"
                                >
                                  <div className="line-clamp-1 text-[13px] font-bold leading-5 tracking-[-0.04em] text-slate-600">
                                    {product.product_name}
                                  </div>
                                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-400">
                                    <span className="min-w-0 truncate">
                                      {productSuggestionKeywords(product).slice(0, 3).join(", ") || "등록상품"}
                                    </span>
                                    <span className="shrink-0 text-slate-500">{won(Number(product.price || 0))}</span>
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
                          className="h-12 min-w-0 w-full rounded-[17px] border border-slate-200 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none focus:border-rose-deep"
                        />
                      </label>

                      <label className="min-w-0 grid gap-2">
                        <span className="text-[14px] font-black tracking-[-0.04em] text-slate-700">옵션 / 사이즈</span>
                        <input
                          value={directInputItem.size}
                          onChange={(event) => updateItem(directInputTargetIndex, "size", event.target.value)}
                          placeholder="사이즈입력"
                          className="h-12 min-w-0 w-full rounded-[17px] border border-slate-200 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none focus:border-rose-deep"
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
                            className="border-l border-slate-100 text-[18px] font-black text-rose-deep"
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

                    <div className="rounded-2xl bg-rose-soft px-4 py-3 text-[13px] font-black leading-5 tracking-[-0.04em] text-rose-deep">
                      방송에서 안내받은 상품명, 옵션, 금액을 입력해 주세요. 색상·사이즈를 직접 입력해 주세요.
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
                        className="h-14 rounded-[22px] bg-rose-deep text-[17px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(216,90,48,0.28)]"
                      >
                        주문서에 담기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!orderSheetOpen && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-4">
            <div className="mx-auto max-w-[560px]" style={{ display: "flex" }}>
              {(() => {
                const cartCount = items.filter((it) => it.product_name.trim()).length;
                const isEmpty = cartCount === 0;
                return (
                  <button
                    type="button"
                    onClick={() => { if (isEmpty) return; setOrderSheetOpen(true); window.setTimeout(() => document.getElementById("orderSheetSection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}
                    disabled={isEmpty}
                    style={{ flex: 1, height: "54px", borderRadius: "14px", border: "none", background: isEmpty ? "#E5E1DC" : "#7A1E47", color: isEmpty ? "#9A9590" : "#fff", fontSize: "15px", fontWeight: 800, cursor: isEmpty ? "default" : "pointer" }}
                  >
                    {isEmpty ? "담은 상품이 없어요" : `🛒 담은 상품 ${cartCount}개 · 확인하기 →`}
                  </button>
                );
              })()}
            </div>
          </div>
          )}
        </>
      )}

        {howToOpen ? (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget) setHowToOpen(false); }}
          >
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "430px", paddingBottom: "24px", maxHeight: "92dvh", overflowY: "auto" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#E5E1DC", margin: "12px auto 18px" }} />
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#1A1A1A", padding: "0 20px", marginBottom: "18px" }}>📌 주문 방법</div>

              {/* [2026-07-10] 3단계 내용은 관리자 설정(howto_steps)에서 수정. 설정이 없으면 기본 문구. */}
              <div style={{ padding: "0 20px" }}>
                {howToSteps.map((step, i) => {
                  const last = i === howToSteps.length - 1;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "13px 0", borderBottom: last ? "none" : "0.5px solid #E5E1DC" }}>
                      <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#7A1E47", color: "#fff", fontSize: "14px", fontWeight: 800, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{step.title}</div>
                        {step.desc ? <div style={{ fontSize: "12px", color: "#6B6460", marginTop: "3px" }}>{step.desc}</div> : null}
                        {last && howToWarn.trim() ? (
                          <span style={{ fontSize: "11px", color: "#C0392B", background: "#FFF0F0", borderRadius: "6px", padding: "4px 8px", display: "inline-block", marginTop: "4px", lineHeight: 1.6 }}>{howToWarn}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 20px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => { localStorage.setItem("ruru_howto_hide_until", String(Date.now() + 86400000)); setHowToOpen(false); }}
                  style={{ border: "1px solid #E5E1DC", background: "#fff", borderRadius: "10px", padding: "11px", fontSize: "13px", color: "#ABA5A0", cursor: "pointer", width: "100%" }}
                >
                  오늘 하루 열지 않기
                </button>
                <button
                  type="button"
                  onClick={() => setHowToOpen(false)}
                  style={{ background: "#7A1E47", color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 700, cursor: "pointer", width: "100%" }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {alertSheetOpen ? (
          <div onClick={() => setAlertSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#fff", borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "20px 18px 26px" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#E0DAD3", margin: "2px auto 12px" }} />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "17px", fontWeight: 800, color: "#7B2D43" }}>🔔 방송 시작 알림을 받으시겠어요?</span>
                <button type="button" onClick={() => setAlertSheetOpen(false)} aria-label="닫기" style={{ border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: "13px", color: "#666", lineHeight: 1.6, marginBottom: "18px" }}>신청하면 라이브 시작 때 카카오 알림톡으로 알려드려요. 신청 시 알림 수신에 동의하며, 언제든 끌 수 있어요.</div>
              {liveAlertOptin ? (
                <button type="button" disabled={liveAlertSaving} onClick={() => saveLiveAlertOptin(false)} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #D9C5CC", background: "#fff", color: "#7A1E47", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>알림 끄기</button>
              ) : (
                <button type="button" disabled={liveAlertSaving} onClick={() => saveLiveAlertOptin(true)} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>{liveAlertSaving ? "처리중..." : "방송 알림 받기"}</button>
              )}
            </div>
          </div>
        ) : null}

        {inquirySheetOpen ? (
          <div onClick={() => setInquirySheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#fff", borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "18px" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#E0DAD3", margin: "2px auto 12px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: "#7B2D43" }}>문의하기</span>
                <button type="button" onClick={() => setInquirySheetOpen(false)} aria-label="닫기" style={{ border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>
              </div>
              {/* [2026-07-10 사장님 지침] 카톡채널 = 1:1 문의 주 채널 → 가로 한 줄 단독 배치.
                  나머지(유튜브·밴드·인스타)는 아래 한 줄 3칸. 링크 주소는 전부 기존 그대로. */}
              <a
                href="https://pf.kakao.com/_RMxaqX"
                target="_blank"
                rel="noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "15px 12px", borderRadius: "12px", background: "#FEE500", textDecoration: "none", marginBottom: "8px" }}
              >
                {/* 카카오톡 말풍선 아이콘(노란 배경 + 갈색 말풍선 = 카카오 공식 조합) */}
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path
                    fill="#3C1E1E"
                    d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9 0 0 0 .2.1.2h.2c.3-.1 2.7-1.8 3.4-2.3.6.1 1.3.2 2 .2 5.1 0 9.2-3.3 9.2-7.2S17.1 3 12 3z"
                  />
                </svg>
                <span style={{ fontSize: "15px", color: "#3C1E1E", fontWeight: 800 }}>카톡채널로 문의하기</span>
              </a>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                <a href="https://youtube.com/channel/UCBbrUWUnHvq5Ldpxgy5GdMw?si=2wsmT_wEinvKzzEF" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "12px 4px", borderRadius: "10px", background: "#F5F3F0", textDecoration: "none" }}><span style={{ fontSize: "18px" }}>▶️</span><span style={{ fontSize: "11px", color: "#6B6460", fontWeight: 600 }}>유튜브</span></a>
                <a href="https://band.us/@ruru8249" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "12px 4px", borderRadius: "10px", background: "#F5F3F0", textDecoration: "none" }}><span style={{ fontSize: "18px" }}>🎵</span><span style={{ fontSize: "11px", color: "#6B6460", fontWeight: 600 }}>밴드</span></a>
                <a href="https://www.instagram.com/ruru8249_?igsh=MXR3Z2xnYmI1cG0ybQ==" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "12px 4px", borderRadius: "10px", background: "#F5F3F0", textDecoration: "none" }}><span style={{ fontSize: "18px" }}>📷</span><span style={{ fontSize: "11px", color: "#6B6460", fontWeight: 600 }}>인스타</span></a>
              </div>
            </div>
          </div>
        ) : null}

        {noticeSheetOpen ? (
          <div onClick={() => setNoticeSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#fff", borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "18px", maxHeight: "70vh", overflowY: "auto" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#E0DAD3", margin: "2px auto 12px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: "#7B2D43" }}>📢 공지사항</span>
                <button type="button" onClick={() => setNoticeSheetOpen(false)} aria-label="닫기" style={{ border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ background: "#F9EEF3", borderLeft: "3px solid #7A1E47", borderRadius: "8px", padding: "13px", fontSize: "14px", color: "#3a2f33", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{noticeText && noticeText.trim() ? noticeText : "등록된 공지가 없어요."}</div>
            </div>
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
          paymentMethod={done?.paymentMethod || (paymentMethod === "카드결제" ? "카드결제" : "무통장입금")}
          items={done?.items || []}
          productAmount={done?.productAmount || 0}
          shippingFee={done?.shippingFee || 0}
          totalAmount={done?.totalAmount || 0}
          pointUsedAmount={done?.pointUsedAmount || 0}
          finalAmount={done?.finalAmount}
          liveAlertOptin={liveAlertOptin}
          liveAlertSaving={liveAlertSaving}
          onLiveAlertRequest={() => { void saveLiveAlertOptin(true); }}
        />

        <CustomerInfoEditBottomSheet
          open={customerInfoEditSheetOpen}
          youtubeNickname={youtubeNickname}
          customerName={customerName}
          customerPhone={formatPhone(customerPhone)}
          youtubeNicknameError={youtubeNicknameError}
          onYoutubeNicknameChange={setYoutubeNickname}
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={(value) => setCustomerPhone(normalizePhone(value))}
          shippingAddresses={shippingAddresses}
          onSaveShippingAddresses={saveShippingAddresses}
          onSelectShippingAddress={(addr, detail, name, phone, zipcode) => {
            setAddress(addr);
            setDetailAddress(detail);
            // 배송지 선택 시 받는사람(이름/연락처)만 갱신. 주문자(입금/포인트 매칭 기준)는 불변.
            if (name) setRecipientName(name);
            if (phone) setRecipientPhone(phone);
            if (zipcode) setZipcode(zipcode);
          }}
          onOpenAddressSearchForForm={(onPicked) => openAddressSearch(onPicked)}
          onClose={closeCustomerInfoEditBottomSheet}
          onSave={completeEditCustomerInfo}
          initialScreen={customerInfoEditInitialScreen}
        />

        <CustomerOrderLookupBottomSheet
          open={orderLookupOpen}
          groups={orderLookupVisibleGroups}
          activeFilter={orderLookupFilter}
          filters={ORDER_LOOKUP_FILTERS}
          hasMore={orderLookupHasMore}
          onFilterChange={(filter) => {
            setOrderLookupFilter(filter);
            setOrderLookupVisibleCount(10);
          }}
          onLoadMore={() => setOrderLookupVisibleCount((c) => c + 10)}
          onClose={() => setOrderLookupOpen(false)}
          onOpenPaymentGuide={() => {
            setOrderLookupOpen(false);
            setPaymentGuideOpen(true);
          }}
        />

      <footer className="py-8 text-center text-[11px] font-bold tracking-[-0.03em] text-slate-400">
        © 2024 RURUDONGI. All rights reserved.
      </footer>
    </OrderPageShell>
  );
}
