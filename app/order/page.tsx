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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import CustomerPointGiftPopup from "@/components/customer/CustomerPointGiftPopup";
import CustomerInfoEditBottomSheet from "@/components/customer/CustomerInfoEditBottomSheet";
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

const ORDER_LOOKUP_FILTERS = ["전체", "입금대기", "입금완료", "출고완료", "주문취소"] as const;
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
    is_visible: product?.is_visible ?? null,
    product_type: String(product?.product_type ?? ""),
    shipping_type: String(product?.shipping_type ?? product?.delivery_type ?? ""),
    badge_type: String(product?.badge_type ?? "none"),
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
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const hideUntil = Number(localStorage.getItem("ruru_howto_hide_until") || 0);
    return Date.now() > hideUntil;
  });
  const [videoOpen, setVideoOpen] = useState(true);
  const [productPage, setProductPage] = useState(1);
  const [visibleProductCount, setVisibleProductCount] = useState(10);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [cartAddedOpen, setCartAddedOpen] = useState(false);
  const [cartAddedItem, setCartAddedItem] = useState<any | null>(null);
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
      .filter((product) => (product.status !== "숨김" || productSuggestionEnabled(product)) && product.status !== "deleted");

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
        // 카드 이미지: 기존엔 image_url/main_image_url/thumbnail_url을 빠뜨려 broadcast 상품 이미지가 안 떴음.
        // 카탈로그(normalizeOrderProductRow)와 동일하게 메인 이미지를 사전 해석해 보존한다.
        image_url: pickOrderProductImageUrl(product),
        main_image_url: product.main_image_url ?? null,
        thumbnail_url: product.thumbnail_url ?? null,
        is_pinned: Boolean(product.is_pinned) || Boolean(product.pinned),
        pinned: Boolean(product.pinned) || Boolean(product.is_pinned),
        pinned_at: String(product.pinned_at ?? ""),
        sort_order: Number(product.sort_order ?? product.display_order ?? 999999),
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
          .filter((product) => product && product.status !== "숨김" && product.status !== "deleted")
          // 고객 노출(is_visible)이 명시적으로 false인 상품만 그리드에서 제외. (기존 registered_order_enabled 필터는 검색만(search_only) 상품을 빠뜨려서 교체)
          .filter((product) => (product as any).is_visible !== false)
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
      const addQty = Number(nextItem.qty) || 1;
      const sameIndex = nextItem.product_id ? prev.findIndex((item) => item.product_id === nextItem.product_id && normColor(item.color) === normColor(nextItem.color) && normColor(item.size) === normColor(nextItem.size) && item.product_name.trim() !== "") : -1;
      if (sameIndex >= 0) {
        const existingQty = Number(prev[sameIndex].qty) || 1;
        const newQty = Math.min(existingQty + addQty, maxQty);
        if (newQty <= existingQty) { showCustomerNotice("재고가 부족해요. 최대 " + maxQty + "개까지 담을 수 있어요."); didAdd = false; return prev; }
        clampedItem = { ...prev[sameIndex], qty: String(Math.min(addQty, maxQty)) };
        return prev.map((item, index) => index === sameIndex ? { ...item, qty: String(newQty) } : item);
      }
      const clampedQty = Math.min(addQty, maxQty);
      if (clampedQty < addQty) showCustomerNotice("재고가 부족해요. " + clampedQty + "개로 조정했어요.");
      clampedItem = clampedQty !== addQty ? { ...nextItem, qty: String(clampedQty) } : nextItem;
      const emptyIndex = prev.findIndex((item) => !item.product_name.trim());
      if (emptyIndex >= 0) return prev.map((item, index) => (index === emptyIndex ? clampedItem : item));
      return [...prev, clampedItem];
    });

    setProductSearchOpenIndex(null);
    setProductSearchText("");
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

  const confirmRegisteredOptionSelectSheet = () => {
    const product = registeredOptionSelectProduct;
    if (!product) return;

    const colorMode = getRegisteredOptionMode(product, "color");
    const sizeMode = getRegisteredOptionMode(product, "size");

    // none(없음입력 토글 ON)은 입력/선택 불필요. select는 선택 강제, input은 직접입력 강제.
    if (colorMode !== "none" && !registeredOptionColor.trim()) {
      showCustomerNotice(
        colorMode === "input"
          ? "색상을 입력해주세요. 색상이 없으면 “없음”이라고 적어주세요."
          : "색상을 선택해주세요."
      );
      return;
    }

    if (sizeMode !== "none" && !registeredOptionSize.trim()) {
      showCustomerNotice(
        sizeMode === "input"
          ? "사이즈를 입력해주세요. 사이즈가 없으면 “없음”이라고 적어주세요."
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

    // 옵션 없는 상품: 바로 담기
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

  const saveCustomer = async (previousPhone?: string) => {
    const cleanPhone = normalizePhone(customerPhone);
    // 번호 변경 시 옛 번호 row를 찾아 갱신해 중복 row 생성을 막는다(옛 번호 없으면 현재 번호로 조회).
    const prevClean = normalizePhone(previousPhone || "");
    const lookupPhone = prevClean && prevClean !== cleanPhone ? prevClean : cleanPhone;

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

  const saveShippingAddresses = async (addresses: any[]) => {
    setShippingAddresses(addresses);
    const cleanPhone = normalizePhone(customerPhone);
    if (!cleanPhone || cleanPhone.length < 10) return;
    // customers row가 아직 없으면(신규 사용자가 배송지부터 추가) insert로 보완해 DB 유실을 막는다.
    const { data: existing } = await supabase.from("customers").select("id").eq("customer_phone", cleanPhone).limit(1);
    if (existing && existing.length > 0) {
      await supabase.from("customers").update({ shipping_addresses: addresses }).eq("customer_phone", cleanPhone);
    } else {
      await supabase.from("customers").insert({ customer_phone: cleanPhone, youtube_nickname: youtubeNickname.trim() || "", customer_name: customerName.trim() || "", shipping_addresses: addresses });
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

      if (getRegisteredOptionMode(matchedProduct, "color") === "input" && !item.color.trim()) {
        showCustomerNotice("색상을 입력해주세요. 색상이 없으면 “없음”이라고 적어주세요.");
        return false;
      }

      if (getRegisteredOptionMode(matchedProduct, "size") === "input" && !item.size.trim()) {
        showCustomerNotice("사이즈를 입력해주세요. 사이즈가 없으면 “없음”이라고 적어주세요.");
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
    // 연타/중복 제출 차단: 이미 처리 중이면 즉시 무시 (ref는 즉시 반영되어 state보다 안전)
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);

    try {
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
      setOrderSheetOpen(false);

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
        return { filterKey: "입금완료", displayText: "✅ 카결완료" };
      }
      return { filterKey: "입금대기", displayText: "💳 카결대기" };
    }

    // 무통장입금
    if (/입금확인|자동입금|수동입금|입금완료|확인완료|출고준비|결제완료|bank_paid|auto_paid|manual_paid/i.test(paymentText)) {
      return { filterKey: "입금완료", displayText: "✅ 입금완료" };
    }

    return { filterKey: "입금대기", displayText: "💰 입금대기" };
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

    // 빈 칸이 어디인지 바로 알 수 있게 한 칸씩 안내하고, 비어 있으면 담기를 막는다.
    if (!targetItem.product_name.trim()) {
      showCustomerNotice("상품명을 입력해주세요.", "warning");
      return;
    }

    if (!targetItem.color.trim()) {
      showCustomerNotice("색상을 입력해주세요. 색상이 없으면 “없음”이라고 적어주세요.", "warning");
      return;
    }

    if (!targetItem.size.trim()) {
      showCustomerNotice("사이즈를 입력해주세요. 사이즈가 없으면 “없음”이라고 적어주세요.", "warning");
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

    setProductSearchText("");
    setProductSearchOpenIndex(null);
    setDirectInputProductSearchMode(false);
    setDirectInputOpen(false);
    scrollToOrderProductList();
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
            <button
              type="button"
              onClick={() => setMenuSheetOpen(true)}
              aria-label="메뉴 보기"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", justifyContent: "center", height: "38px", padding: "0 14px", borderRadius: "10px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "13px", fontWeight: 800, color: "#7A1E47", cursor: "pointer" }}
            >
              ☰ 메뉴보기
            </button>
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
    return registeredOptionStockVariants.length > 0 &&
      registeredOptionStockVariants.some((v) => nc(v.color) === nc(color) && nc(v.size) === nc(size) && Number(v.stock) <= 0);
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

  return (
    <OrderPageShell>
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>
      {hasSavedInfo && <TopCustomerNav />}

      <CustomerPointGiftPopup />

      {/* P3. 방송 영상 — 방송 ON/OFF 상관없이 항상 표시 (좌:영상 / 우:라이브참여·공지) */}
      {hasSavedInfo ? (
        <section style={{ margin: "8px auto 0", width: "100%", maxWidth: "560px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "0.5px solid #E5E1DC" }}>
            <div style={{ background: "#141414", minHeight: "200px", position: "relative", overflow: "hidden" }}>
              {isBroadcastOn && videoEmbedSrc ? (
                <iframe
                  src={videoEmbedSrc}
                  title="루루동이 라이브"
                  style={{ width: "100%", height: "100%", border: "none", position: "absolute", inset: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "28px", opacity: 0.3 }}>📺</span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.5, marginTop: "6px" }}>현재 방송 중이<br />아닙니다</span>
                </div>
              )}
            </div>
            <div style={{ background: "#fff", minHeight: "200px", display: "flex", flexDirection: "column", padding: "10px", gap: "8px" }}>
              <button
                type="button"
                disabled={!(isBroadcastOn && broadcastYoutubeUrl)}
                onClick={isBroadcastOn && broadcastYoutubeUrl ? () => window.open(broadcastYoutubeUrl, "_blank") : undefined}
                style={{ background: "#E8340A", color: "#fff", border: "none", borderRadius: "8px", padding: "11px 6px", fontSize: "12px", fontWeight: 700, opacity: isBroadcastOn && broadcastYoutubeUrl ? 1 : 0.4, cursor: isBroadcastOn && broadcastYoutubeUrl ? "pointer" : "default" }}
              >
                🔴 라이브 참여하기
              </button>
              <div style={{ flex: 1, background: "#F9EEF3", borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid #7A1E47", overflowY: "auto" }}>
                {noticeText.trim() ? (
                  <>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#7A1E47", marginBottom: "5px" }}>📌 공지</div>
                    <div style={{ fontSize: "14px", color: "#1A1A1A", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{noticeText}</div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ padding: "9px 14px", borderBottom: "0.5px solid #E5E1DC", fontSize: "12px", fontWeight: 700, color: "#555" }}>
            {broadcast ? (
              <span>{ruruOrderLookupDateText(broadcast.started_at)} · {String(broadcast.broadcast_public_title || broadcast.public_title || "").trim() || "라이브 방송"}</span>
            ) : (
              <span>다음 방송을 기다려주세요 🙏</span>
            )}
          </div>
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
            const q = productSearchText.trim();
            const filtered = quickGroupBuyProducts.filter((p) => !q || productMatchesSuggestion(p as BroadcastProduct, q));
            const visibleItems = filtered.slice(0, visibleProductCount);
            return (
              <section style={{ margin: "12px auto 0", width: "100%", maxWidth: "560px" }}>
                <input
                  value={productSearchText}
                  onChange={(e) => { setProductSearchText(e.target.value); setProductPage(1); setVisibleProductCount(10); }}
                  placeholder="🔍 상품 이름 검색"
                  style={{ width: "100%", height: "48px", boxSizing: "border-box", border: "1px solid #D9C5CC", borderRadius: "14px", padding: "0 16px", fontSize: "15px", fontWeight: 700, color: "#333", outline: "none" }}
                />
                {visibleItems.length === 0 ? (
                  <div style={{ marginTop: "14px", padding: "26px", textAlign: "center", color: "#999", fontSize: "14px", fontWeight: 700 }}>찾는 상품이 없어요. 아래 직접 입력으로 담아주세요.</div>
                ) : (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column" }}>
                    {visibleItems.map((product) => {
                      const img = pickOrderProductImageUrl(product);
                      const pinned = isPinnedOrderProduct(product);
                      const sold = (() => {
                        if (isSoldOutOrderProduct(product)) return true;
                        // 주문서에 담긴 수량 합산 후 재고 초과 체크
                        const productIdStr = String(product.id ?? "");
                        if (!productIdStr) return false;
                        try {
                          const note = typeof product.product_note === "string" ? JSON.parse(product.product_note) : product.product_note;
                          if (note?.stock_management_enabled !== true) return false;
                          const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
                          if (variants.length === 0) return false;
                          return variants.every((v: any) => {
                            const maxStock = Number(v.stock ?? 0);
                            const normC = (s: string) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
                            const inCart = items
                              .filter((item) => item.product_id === productIdStr && normC(item.color) === normC(String(v.color ?? "")) && normC(item.size) === normC(String(v.size ?? "")))
                              .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                            return inCart >= maxStock;
                          });
                        } catch { return false; }
                      })();
                      const badgeType = String((product as unknown as Record<string, unknown>)?.badge_type || "").trim().toLowerCase();
                      return (
                        <div
                          key={String(product.id)}
                          style={{ display: "flex", gap: "12px", alignItems: "center", padding: "13px 0", borderBottom: "0.5px solid #E5E1DC" }}
                        >
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
                              {badgeType === "new" ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#0F6E56", background: "#E7F3EE", borderRadius: "5px", padding: "2px 6px" }}>NEW</span> : null}
                              {badgeType === "hot" ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#C0392B", background: "#FBEAE7", borderRadius: "5px", padding: "2px 6px", animation: "shimmer 1.5s ease-in-out infinite" }}>HOT</span> : null}
                              {badgeType === "limit" ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#854F0B", background: "#FBF1E0", borderRadius: "5px", padding: "2px 6px" }}>한정</span> : null}
                              {badgeType === "pick" ? <span style={{ borderRadius: "4px", fontSize: "9px", fontWeight: 700, padding: "2px 6px", background: "#FFF8E7", color: "#B8860B" }}>⭐ MD픽</span> : null}
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#222", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.product_name}</div>
                            <div style={{ marginTop: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                              <span style={{ fontSize: "15px", fontWeight: 800, color: "#7A1E47" }}>{won(Number(product.price || 0))}</span>
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
                      );
                    })}
                  </div>
                )}
                {filtered.length > visibleProductCount ? (
                  <div ref={sentinelRef} style={{ height: "1px", marginBottom: "8px" }} />
                ) : null}
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
                    <div>받는 분: {customerName.trim() || "-"}</div>
                    <div>연락처: {formatPhone(customerPhone) || "-"}</div>
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
                  const itemAmount = toNumber(item.product_price) * (toNumber(item.qty) || 1);

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
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#6B6460" }}>수량 {toNumber(item.qty) || 1}개</span>
                          <span style={{ flexShrink: 0, fontSize: "14px", fontWeight: 700, color: "#7A1E47" }}>{won(itemAmount)}</span>
                        </div>
                      </div>
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
                  ⓘ 카드결제는 {cardPaymentMinAmount.toLocaleString()}원 이상 구매 시 가능합니다.
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
                  paymentMethod={paymentMethod}
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
                  {customerBlockStatus.blocked ? "주문 제한됨" : submitting ? "제출 중..." : "주문서 제출 →"}
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

          {/* 담기 완료 — 심플 (확인 ✓ + 주문서 보기 / 계속 담기) */}
          {cartAddedOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }} onClick={(e) => { if (e.target === e.currentTarget) setCartAddedOpen(false); }}>
              <div style={{ width: "320px", maxWidth: "88%", background: "#fff", borderRadius: "20px", padding: "24px 22px", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#7B2D43", textAlign: "center" }}>주문서에 담았어요 ✓</div>
                {cartAddedItem ? (
                  <div style={{ marginTop: "16px", background: "#FAF6F7", borderRadius: "14px", padding: "14px 16px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#222", lineHeight: 1.4 }}>{cartAddedItem.product_name}</div>
                    {(() => {
                      const norm = (s: any) => { const t = String(s ?? "").trim(); return t === "없음" ? "" : t; };
                      const opt = [norm(cartAddedItem.color), norm(cartAddedItem.size)].filter(Boolean).join(" / ");
                      return opt ? <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#888" }}>{opt}</div> : null;
                    })()}
                    <div style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#666" }}>수량 {cartAddedItem.qty}개</span>
                      <span style={{ fontSize: "16px", fontWeight: 800, color: "#7B2D43" }}>{(() => { const total = (Number(cartAddedItem.product_price) || 0) * (Number(cartAddedItem.qty) || 1); return total > 0 ? won(total) : "가격 직접입력"; })()}</span>
                    </div>
                  </div>
                ) : null}
                <div style={{ marginTop: "18px" }}>
                  <button type="button" onClick={() => setCartAddedOpen(false)} style={{ width: "100%", height: "50px", borderRadius: "14px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}>확인</button>
                </div>
              </div>
            </div>
          )}

          {registeredOptionSelectProduct && (
            <div style={{ position: "fixed", inset: 0, zIndex: 128, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) closeRegisteredOptionSelectSheet(); }}>
              <div style={{ width: "100%", maxWidth: "430px", maxHeight: "92dvh", display: "flex", flexDirection: "column", background: "#fff", borderTopLeftRadius: "26px", borderTopRightRadius: "26px", overflow: "hidden" }}>
                <div style={{ flexShrink: 0, borderBottom: "1px solid #F0EAE0", padding: "16px" }}>
                  <div style={{ margin: "0 auto 12px", width: "52px", height: "5px", borderRadius: "3px", background: "#E8E2DD" }} />
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#7A1E47" }}>옵션을 선택해 주세요</div>
                  <div style={{ marginTop: "4px", fontSize: "17px", fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{registeredOptionSelectProduct.product_name}</div>
                  <div style={{ marginTop: "2px", fontSize: "15px", fontWeight: 800, color: "#7A1E47" }}>{registeredOptionPrice > 0 ? won(registeredOptionPrice) : "가격 직접입력"}</div>
                </div>

                <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "16px" }}>
                  {registeredOptionDetailImages.length > 0 && (
                    <div style={{ overflowX: "auto", display: "flex", gap: "8px", padding: "12px 16px 0", WebkitOverflowScrolling: "touch" }}>
                      {registeredOptionDetailImages.map((img, i) => (
                        <img key={i} src={img} alt="" onClick={() => setLightboxImage(img)}
                          style={{ width: "90px", height: "90px", borderRadius: "8px", objectFit: "cover", flexShrink: 0, cursor: "pointer", background: "#F0EBE8" }} />
                      ))}
                    </div>
                  )}
                  {registeredOptionDescription && (
                    <div style={{ padding: "10px 16px 0", fontSize: "12px", color: "#555", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {registeredOptionDescription}
                    </div>
                  )}
                  {registeredOptionColorChoices.length === 0 && registeredOptionSizeChoices.length === 0 ? (
                    <div style={{ padding: "12px 16px 0", fontSize: "12px", color: "#ABA5A0" }}>
                      이 상품은 옵션이 없습니다. 수량만 선택해 주세요.
                    </div>
                  ) : null}
                  {registeredOptionColorChoices.length > 0 ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>색상</div>
                      {registeredOptionColorChoices.length >= 4 ? (
                        <div style={{ overflowX: "auto", display: "flex", gap: "6px", paddingBottom: "4px", WebkitOverflowScrolling: "touch", marginBottom: "14px" }}>
                          {registeredOptionColorChoices.map((option) => {
                            const selected = registeredOptionColor === option;
                            const soldOut = isSoldOutColorSize(option, registeredOptionSize);
                            return (
                              <button
                                key={`c-${option}`}
                                type="button"
                                onClick={() => { if (soldOut) return; setRegisteredOptionColor(option); }}
                                style={{ flexShrink: 0, minWidth: "44px", height: "40px", borderRadius: "10px", border: selected ? "1.5px solid #7A1E47" : "1.5px solid #E8E2DD", background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", cursor: "pointer", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", opacity: soldOut ? 0.4 : 1 }}
                              >
                                {soldOut ? option + " (품절)" : option}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {registeredOptionColorChoices.map((option) => {
                            const soldOut = isSoldOutColorSize(option, registeredOptionSize);
                            return (
                              <button key={`c-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionColor(option); }} style={{ minHeight: "46px", borderRadius: "14px", border: `1.5px solid ${registeredOptionColor === option ? "#7A1E47" : "#E8E2DD"}`, background: registeredOptionColor === option ? "#7A1E47" : "#fff", color: registeredOptionColor === option ? "#fff" : "#444", fontSize: "14px", fontWeight: 800, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? option + " (품절)" : option}</button>
                            );
                          })}
                        </div>
                      )}
                      {!registeredOptionColor.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>색상을 선택해주세요</div> : null}
                    </div>
                  ) : null}

                  {registeredOptionColorMode === "none" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>색상</div>
                      <div style={{ height: "46px", display: "flex", alignItems: "center", padding: "0 14px", borderRadius: "14px", border: "1.5px solid #E8E2DD", background: "#F7F4F1", fontSize: "15px", fontWeight: 700, color: "#ABA5A0" }}>없음</div>
                    </div>
                  ) : null}

                  {registeredOptionColorMode === "input" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>색상</div>
                      <input value={registeredOptionColor} onChange={(e) => setRegisteredOptionColor(e.target.value)} placeholder="색상을 입력해주세요. 없으면 “없음”" style={{ height: "46px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: `1.5px solid ${!registeredOptionColor.trim() ? "#E8B5B0" : "#E8E2DD"}`, background: "#fff", padding: "0 14px", fontSize: "15px", fontWeight: 700, color: "#222", outline: "none" }} />
                      {!registeredOptionColor.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>색상을 입력해주세요</div> : null}
                    </div>
                  ) : null}

                  {registeredOptionSizeChoices.length > 0 ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>사이즈</div>
                      {registeredOptionSizeChoices.length >= 4 ? (
                        <div style={{ overflowX: "auto", display: "flex", gap: "6px", paddingBottom: "4px", WebkitOverflowScrolling: "touch", marginBottom: "14px" }}>
                          {registeredOptionSizeChoices.map((option) => {
                            const selected = registeredOptionSize === option;
                            const soldOut = isSoldOutColorSize(registeredOptionColor, option);
                            return (
                              <button
                                key={`s-${option}`}
                                type="button"
                                onClick={() => { if (soldOut) return; setRegisteredOptionSize(option); }}
                                style={{ flexShrink: 0, minWidth: "44px", height: "40px", borderRadius: "10px", border: selected ? "1.5px solid #7A1E47" : "1.5px solid #E8E2DD", background: selected ? "#7A1E47" : "#fff", color: selected ? "#fff" : "#444", cursor: "pointer", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", opacity: soldOut ? 0.4 : 1 }}
                              >
                                {soldOut ? option + " (품절)" : option}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                          {registeredOptionSizeChoices.map((option) => {
                            const soldOut = isSoldOutColorSize(registeredOptionColor, option);
                            return (
                              <button key={`s-${option}`} type="button" onClick={() => { if (soldOut) return; setRegisteredOptionSize(option); }} style={{ minHeight: "46px", borderRadius: "14px", border: `1.5px solid ${registeredOptionSize === option ? "#7A1E47" : "#E8E2DD"}`, background: registeredOptionSize === option ? "#7A1E47" : "#fff", color: registeredOptionSize === option ? "#fff" : "#444", fontSize: "14px", fontWeight: 800, cursor: "pointer", opacity: soldOut ? 0.4 : 1 }}>{soldOut ? option + " (품절)" : option}</button>
                            );
                          })}
                        </div>
                      )}
                      {!registeredOptionSize.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>사이즈를 선택해주세요</div> : null}
                    </div>
                  ) : null}

                  {registeredOptionSizeMode === "none" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>사이즈</div>
                      <div style={{ height: "46px", display: "flex", alignItems: "center", padding: "0 14px", borderRadius: "14px", border: "1.5px solid #E8E2DD", background: "#F7F4F1", fontSize: "15px", fontWeight: 700, color: "#ABA5A0" }}>없음</div>
                    </div>
                  ) : null}

                  {registeredOptionSizeMode === "input" ? (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333" }}>사이즈</div>
                      <input value={registeredOptionSize} onChange={(e) => setRegisteredOptionSize(e.target.value)} placeholder="사이즈를 입력해주세요. 없으면 “없음”" style={{ height: "46px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: `1.5px solid ${!registeredOptionSize.trim() ? "#E8B5B0" : "#E8E2DD"}`, background: "#fff", padding: "0 14px", fontSize: "15px", fontWeight: 700, color: "#222", outline: "none" }} />
                      {!registeredOptionSize.trim() ? <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#C0392B" }}>사이즈를 입력해주세요</div> : null}
                    </div>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "0.82fr 1.18fr", gap: "12px", borderTop: "1px solid #F0EAE0", background: "#fff", padding: "12px 16px 0" }}>
                  <div>
                    <div style={{ marginBottom: "6px", fontSize: "13px", fontWeight: 800, color: "#333" }}>수량</div>
                    <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 42px", height: "46px", borderRadius: "14px", border: "1px solid #E8E2DD", overflow: "hidden" }}>
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
                  </div>
                  <div>
                    <div style={{ marginBottom: "6px", fontSize: "13px", fontWeight: 800, color: "#333" }}>선택금액</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: "46px", borderRadius: "14px", border: "1px solid #E8E2DD", background: "#fff", padding: "0 14px", fontSize: "15px", fontWeight: 800, color: "#222" }}>{registeredOptionTotalPrice > 0 ? won(registeredOptionTotalPrice) : "가격 직접입력"}</div>
                  </div>
                </div>

                <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: "10px", borderTop: "1px solid #F0EAE0", background: "#fff", padding: "12px 12px calc(12px + env(safe-area-inset-bottom))" }}>
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

              <div style={{ padding: "0 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "13px 0", borderBottom: "0.5px solid #E5E1DC" }}>
                  <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#7A1E47", color: "#fff", fontSize: "14px", fontWeight: 800, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>1</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>방송 채팅창에 이렇게 입력해 주세요!</div>
                    <div style={{ fontSize: "12px", color: "#6B6460", marginTop: "3px" }}>상품명 + 사이즈/색상 + 수량 + 저요!</div>
                    <span style={{ fontSize: "11px", color: "#7A1E47", background: "#F9EEF3", borderRadius: "6px", padding: "4px 8px", display: "inline-block", marginTop: "4px" }}>예) 운동화 블랙 255 1개 저요!</span>
                    <span style={{ fontSize: "11px", color: "#7A1E47", background: "#F9EEF3", borderRadius: "6px", padding: "4px 8px", display: "inline-block", marginTop: "3px" }}>예) 페미닌워시 핑크 150ml 2개 저요!</span>
                    <span style={{ fontSize: "11px", color: "#7A1E47", fontWeight: 700, marginTop: "8px", display: "block" }}>✅ 루루언니 접수 완료 확인 후 →</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "13px 0", borderBottom: "0.5px solid #E5E1DC" }}>
                  <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#7A1E47", color: "#fff", fontSize: "14px", fontWeight: 800, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>2</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>여기서 그 상품 담고 주문서 제출</div>
                    <div style={{ fontSize: "12px", color: "#6B6460", marginTop: "3px" }}>목록에서 찾아 담기를 눌러주세요</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "13px 0" }}>
                  <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#7A1E47", color: "#fff", fontSize: "14px", fontWeight: 800, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>3</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>안내 계좌로 입금</div>
                    <span style={{ fontSize: "11px", color: "#C0392B", background: "#FFF0F0", borderRadius: "6px", padding: "4px 8px", display: "inline-block", marginTop: "4px" }}>⚠️ 입금자명 · 금액이 닉네임 · 주문서와 정확히 일치해야 자동 확인돼요</span>
                  </div>
                </div>
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

        {menuSheetOpen ? (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setMenuSheetOpen(false); }}
          >
            <div style={{ width: "100%", maxWidth: "560px", background: "#fff", borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "18px", maxHeight: "82vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: "#7B2D43" }}>메뉴</span>
                <button type="button" onClick={() => setMenuSheetOpen(false)} aria-label="닫기" style={{ border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button type="button" onClick={() => { setMenuSheetOpen(false); openOrderLookupBottomSheet(); }} style={MENU_ITEM_STYLE}>📦 최근 7일 주문</button>
                <button type="button" onClick={() => { setMenuSheetOpen(false); openCustomerInfoEditBottomSheet(); }} style={MENU_ITEM_STYLE}>✏️ 정보수정</button>
                <div style={{ ...MENU_ITEM_STYLE, cursor: "default", justifyContent: "space-between" }}>
                  <span>🌐 내 포인트</span>
                  <span style={{ color: "#7B2D43", fontWeight: 800 }}>{`${Math.max(0, Number(customerPointBalance || 0)).toLocaleString()}P`}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "12px" }}>
                <a href="https://youtube.com/channel/UCBbrUWUnHvq5Ldpxgy5GdMw?si=2wsmT_wEinvKzzEF" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "10px 4px", borderRadius: "10px", background: "#F5F3F0", cursor: "pointer", textDecoration: "none" }}>
                  <span style={{ fontSize: "18px" }}>▶️</span>
                  <span style={{ fontSize: "10px", color: "#6B6460", fontWeight: 500 }}>유튜브</span>
                </a>
                <a href="https://pf.kakao.com/_RMxaqX" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "10px 4px", borderRadius: "10px", background: "#F5F3F0", cursor: "pointer", textDecoration: "none" }}>
                  <span style={{ fontSize: "18px" }}>💬</span>
                  <span style={{ fontSize: "10px", color: "#6B6460", fontWeight: 500 }}>카톡채널</span>
                </a>
                <a href="https://band.us/@ruru8249" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "10px 4px", borderRadius: "10px", background: "#F5F3F0", cursor: "pointer", textDecoration: "none" }}>
                  <span style={{ fontSize: "18px" }}>🎵</span>
                  <span style={{ fontSize: "10px", color: "#6B6460", fontWeight: 500 }}>밴드</span>
                </a>
                <a href="https://www.instagram.com/ruru8249_?igsh=MXR3Z2xnYmI1cG0ybQ==" target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "10px 4px", borderRadius: "10px", background: "#F5F3F0", cursor: "pointer", textDecoration: "none" }}>
                  <span style={{ fontSize: "18px" }}>📷</span>
                  <span style={{ fontSize: "10px", color: "#6B6460", fontWeight: 500 }}>인스타</span>
                </a>
              </div>
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
          youtubeNicknameError={youtubeNicknameError}
          onYoutubeNicknameChange={setYoutubeNickname}
          onCustomerNameChange={setCustomerName}
          onCustomerPhoneChange={(value) => setCustomerPhone(normalizePhone(value))}
          shippingAddresses={shippingAddresses}
          onSaveShippingAddresses={saveShippingAddresses}
          onSelectShippingAddress={(addr, detail, name, phone, zipcode) => {
            setAddress(addr);
            setDetailAddress(detail);
            if (name) setCustomerName(name);
            if (phone) setCustomerPhone(normalizePhone(phone));
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
