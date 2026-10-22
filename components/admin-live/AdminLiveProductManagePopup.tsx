"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { createDraftBroadcast, setBroadcastFeedNotice } from "./liveBroadcastController";
import { brandWordmarkThumbnail, productAutoThumbUrl, productNameThumbnail } from "@/lib/brandWordmarkThumbnail";
import { adminDetailSearch, buildDetailChatLine, detailProducts, type DetailProduct } from "@/lib/productDetailModel";
import { buildChatAnnounceText } from "@/lib/chatAnnounce";
import { savedWidgetAutoMatches, savedWidgetPinMatches, widgetPinTargetBroadcastId } from "@/lib/widgetPinState";
import { readPinHistory, recordPinHistory } from "@/lib/pinHistory";
import {
  parseWidgetHistory,
  parseWidgetRotation,
  recordWidgetHistory,
  type WidgetHistoryEntry,
  type WidgetProductTarget,
  type WidgetRotationConfig,
} from "@/lib/widgetProductLibrary";
import { splitOptionText } from "@/lib/optionSplit";
import { normalizeProductSearchText, productSearchMatches } from "@/lib/productSearch";
import { productPage } from "@/lib/productPagination";
import ProductPagination from "./ProductPagination";
import ProductToolbar from "./ProductToolbar";
import { resolveBrandCatalog, resolveAdminBrandTarget, searchBrandDetails, type BrandProductLink } from "@/lib/productBrandLinks";
import ProductBrandMoveDialog from "./ProductBrandMoveDialog";

type ProductRow = Record<string, unknown>;

export type ProductManageTab = "broadcast" | "shop" | "products";

type Props = {
  activeBroadcastId?: string | number | null;
  onClose: () => void;
  // 닫힘/재오픈 사이 탭 위치 보존(수정 후 보던 탭 유지)
  initialTab?: ProductManageTab;
  onTabChange?: (tab: ProductManageTab) => void;
  // 닫힘/재오픈 사이 검색어 보존(수정 후 보던 검색 유지)
  initialSearch?: string;
  onSearchChange?: (search: string) => void;
  /** [2026-09-08 5단계] 페이지 안에 그대로(상품 메뉴). 팝업 껍데기·✕ 없음, 포털 안 씀 */
  embedded?: boolean;
  headerTarget?: HTMLElement | null;
};

// [2026-10-21 a2-9] 분류 칩은 고정 목록이 아니라 실제 등록된 분류에서 만든다(DB 실측: 의류 454·화장품 72·없음 69·신발 50·잡화 50·향수 42 …).
const NO_CATEGORY_KEY = "__none__";
// [2026-10-21 a2-9] 세 탭 머리줄·검색칸·정렬 select 공통 모양(DESIGN-ADMIN: 입력·보조 36px·13/14px·검정 글자)
const TAB_TITLE_STYLE: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "var(--color-ink)" };
const TAB_SEARCH_STYLE: React.CSSProperties = { width: "100%", height: "36px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 12px", margin: "0 0 8px", fontSize: "14px", fontWeight: 500, outline: "none", color: "var(--color-ink)", boxSizing: "border-box" };
const TAB_SORT_STYLE: React.CSSProperties = { height: "36px", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "13px", fontWeight: 700, padding: "0 8px", cursor: "pointer" };

// --- pick helpers ---
function pickString(row: ProductRow | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function pickNumber(row: ProductRow, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function pickBoolean(row: ProductRow, keys: string[], fallback = false) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const n = value.toLowerCase().trim();
      if (["true", "1", "yes", "y", "on", "visible", "판매중", "노출"].includes(n)) return true;
      if (["false", "0", "no", "n", "off", "hidden", "숨김", "품절"].includes(n)) return false;
    }
  }
  return fallback;
}

function pickArray(row: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map((i) => String(i || "").trim()).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map((i) => String(i || "").trim()).filter(Boolean);
        } catch {
          return [trimmed];
        }
      }
      return splitOptionText(trimmed);   // [2026-09-08] 쉼표만 구분 — lib/optionSplit.ts
    }
  }
  return [];
}

// [2026-07-23 사장님 지침] 조합형 상품은 세부상품명(예: "로스트 체리")으로도 검색되게 —
//   고객 주문페이지 comboNamesMatchOrderProduct와 동일 기준(공백 제거·소문자).
//   평소 상품(combo_mode 없음)은 false 반환 → 기존 상품명 검색 결과 무변경. 표시(필터) 전용.
function comboNamesMatch(p: ProductRow, rawQuery: string): boolean {
  const q = normalizeProductSearchText(rawQuery);
  if (!q) return false;
  const note = parseProductNote(p);
  if (note.combo_mode !== true) return false;
  return pickArray(p, ["color_options"]).some((n) => productSearchMatches(n, q));
}

function parseProductNote(p: ProductRow): Record<string, unknown> {
  const raw = (p as { product_note?: unknown }).product_note;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

// [2026-08-31] 📢 채팅 문구 생성은 lib/chatAnnounce.ts 로 분리 — 컨트롤타워 「현재상품 복사」와 문구 공용.

// [2026-10-21 a2-6] 줄 버튼 공통 모양(DESIGN-ADMIN: 보조 = 흰 바탕 1px 선, 주 = 검정, 위험 = 빨간 글자만). 32px.
const rowBtn: React.CSSProperties = { flexShrink: 0, height: "32px", padding: "0 12px", fontSize: "12px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", cursor: "pointer", minHeight: "32px" };
const rowBtnPrimary: React.CSSProperties = { ...rowBtn, color: "#fff", background: "var(--color-ink)", border: "1px solid var(--color-ink)" };
const rowBtnDanger: React.CSSProperties = { ...rowBtn, color: "var(--color-danger-tx)" };
// [2026-10-21 a2-10] 방송 상품 줄 상태 배지(DESIGN-ADMIN §5: 12/600·높이 24·8px). 소개 중=검정 바탕 흰 글자, 순환=중립, 순환 제외=연한 글자.
const ROT_BADGE_BASE: React.CSSProperties = { flexShrink: 0, display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" };
const ROT_BADGE_LIVE: React.CSSProperties = { ...ROT_BADGE_BASE, color: "#fff", background: "var(--color-ink)" };
const ROT_BADGE_ON: React.CSSProperties = { ...ROT_BADGE_BASE, color: "var(--color-ink-soft)", background: "var(--color-surface-2)" };
const ROT_BADGE_OFF: React.CSSProperties = { ...ROT_BADGE_BASE, color: "var(--color-ink-mute)", background: "var(--color-surface)", border: "1px solid var(--color-line)" };
// [2026-10-21 a2-10 사장님] 숨긴 상품은 「눈 + 빨간 사선」 선 아이콘(이모지 금지)
const HIDDEN_EYE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--color-ink-mute)" }}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4 20 20 4" stroke="var(--color-danger-tx)" strokeWidth="2.2" />
  </svg>
);

function productName(p: ProductRow) {
  return pickString(p, ["product_name", "name", "title"], "상품명 없음");
}

function productPrice(p: ProductRow) {
  return pickNumber(p, ["price", "sale_price", "selling_price"], 0);
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function isBrandGroupProduct(p: ProductRow) {
  const note = parseProductNote(p);
  const group = note.brand_group;
  return Boolean(group && typeof group === "object" && !Array.isArray(group) && (group as Record<string, unknown>).enabled === true);
}

function productPriceLabel(p: ProductRow) {
  return isBrandGroupProduct(p) ? `최저가 ${money(productPrice(p))} 부터 ~` : money(productPrice(p));
}

function mainImage(p: ProductRow) {
  const direct = pickString(p, ["image_url", "cover_image_url", "main_image_url", "thumbnail_url"], "");
  if (direct) return resolveProductImageUrl(direct);
  const group = parseProductNote(p).brand_group;
  if (group && typeof group === "object" && !Array.isArray(group) && (group as Record<string, unknown>).enabled === true) {
    const record = group as Record<string, unknown>;
    return brandWordmarkThumbnail(String(record.brand_en || ""), String(record.brand_ko || productName(p)));
  }
  if (direct) return resolveProductImageUrl(direct);
  const images = pickArray(p, ["images", "image_urls", "detail_image_urls"]);
  if (images[0]) return resolveProductImageUrl(images[0]);
  // [2026-09-03] 사진 없는 상품 = 손님 화면과 동일하게 상품명 자동 그림 → 글자 카드 (표시 전용, 회색 네모 제거)
  const cat = String((parseProductNote(p) as Record<string, unknown>).category || "");
  return productAutoThumbUrl(productName(p), cat) || productNameThumbnail(productName(p), cat);
}

function shippingLabel(p: ProductRow) {
  const t = pickString(p, ["shipping_type", "delivery_type"], "normal");
  if (t === "vendor" || t === "vendor2") return "업체배송";
  if (t === "free") return "무료배송";
  return "일반배송";
}

function saleModeLabel(p: ProductRow) {
  const m = pickString(p, ["sale_mode"], "both");
  if (m === "broadcast") return "방송전용";
  if (m === "shop") return "쇼핑몰전용";
  return "방송+쇼핑몰";
}

function productCategory(p: ProductRow) {
  const note = parseProductNote(p);
  return String((note as { category?: unknown }).category || "").trim();
}

const productId = (p: ProductRow) => pickString(p, ["id", "product_id"], "");

// [2026-08-13] 목록 정렬 — 화면 표시 순서만 바꾼다. 저장(sort_order/mall_sort_order)은 안 건드림.
type ProductSortKey = "manual" | "name" | "price_asc" | "price_desc" | "recent";
const PRODUCT_SORT_OPTIONS: Array<{ key: ProductSortKey; label: string }> = [
  { key: "manual", label: "진열 순서 (드래그)" },
  { key: "name", label: "이름순" },
  { key: "price_asc", label: "낮은 가격순" },
  { key: "price_desc", label: "높은 가격순" },
  { key: "recent", label: "최신 등록순" },
];
function productCreatedAt(p: ProductRow) {
  const t = new Date(String((p as Record<string, unknown>).created_at || "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

const PRODUCT_CREATED_AT_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function productCreatedAtLabel(p: ProductRow) {
  const raw = String((p as Record<string, unknown>).created_at || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = PRODUCT_CREATED_AT_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}
function sortProductRows(rows: ProductRow[], key: ProductSortKey) {
  if (key === "manual") return rows;
  const copy = [...rows];
  if (key === "name") return copy.sort((a, b) => productName(a).localeCompare(productName(b), "ko"));
  if (key === "price_asc") return copy.sort((a, b) => productPrice(a) - productPrice(b));
  if (key === "price_desc") return copy.sort((a, b) => productPrice(b) - productPrice(a));
  return copy.sort((a, b) => productCreatedAt(b) - productCreatedAt(a)); // recent
}

export default function AdminLiveProductManagePopup({ activeBroadcastId, onClose, initialTab, onTabChange, initialSearch, onSearchChange, embedded = false, headerTarget }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [brandLinks, setBrandLinks] = useState<BrandProductLink[]>([]);
  const [brandMove, setBrandMove] = useState<{source:ProductRow;undoParentId?:string}|null>(null);
  const brandCatalog = useMemo(() => resolveBrandCatalog(products, brandLinks), [products, brandLinks]);
  const [rotationIds, setRotationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ProductManageTab>(initialTab === "shop" || initialTab === "products" ? initialTab : "broadcast");   // 예전 기록(history) 탭 값이 와도 방송 진열로
  const [search, setSearch] = useState(initialSearch ?? "");
  const [category, setCategory] = useState("전체");
  const [productPageNumber, setProductPageNumber] = useState(1);
  const [productPageSize, setProductPageSize] = useState(20);
  const [lightbox, setLightbox] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [isNarrow, setIsNarrow] = useState(false);
  const [bcListOpen, setBcListOpen] = useState(true);
  useEffect(() => { setBcListOpen(!isNarrow); }, [isNarrow]); // 데스크톱=열림, 모바일=접힘 기본
  // 위젯 설정(일괄) 화면
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const [wsSelected, setWsSelected] = useState<Set<string>>(new Set());
  const [wsSaving, setWsSaving] = useState(false);

  // 방송 상품 탭(broadcast)
  const [bcList, setBcList] = useState<Array<{ id: string; title: string; started_at: string; status: string }>>([]);
  const [bcSelId, setBcSelId] = useState("");
  const [bcProducts, setBcProducts] = useState<ProductRow[]>([]);
  const [bcLoading, setBcLoading] = useState(false);
  const [bcBusy, setBcBusy] = useState(false);
  const [bcPinBusy, setBcPinBusy] = useState(false);
  // [2026-09-25 사장님 요청] 방송 목록 기간 필터 — 표시 전용(읽기). 기본 최근 30일.
  const [bcDateFilter, setBcDateFilter] = useState<"recent30" | "recent90" | "all" | "custom">("recent30");
  const [bcCustomFrom, setBcCustomFrom] = useState<string>(""); // YYYY-MM-DD
  const [bcCustomTo, setBcCustomTo] = useState<string>("");     // YYYY-MM-DD
  const [bcSearch, setBcSearch] = useState<string>("");         // 방송 이름 검색
  // [2026-10-03] 한 번이라도 고정한 상품은 서버 settings에 계속 보관한다.
  // 기존 브라우저 localStorage 기록은 첫 로드 때 idempotent merge하여 과거 목록도 최대한 살린다.
  const [widgetHistory, setWidgetHistory] = useState<WidgetHistoryEntry[]>([]);
  const [widgetRotation, setWidgetRotation] = useState<WidgetRotationConfig>({ mode: "all", paused: false, targets: [] });
  // [2026-10-21 a2-10] 방송 상품 줄 체크(순환 넣기/빼기용) — 이 화면 안에서만, 저장 안 함
  const [bcRotSel, setBcRotSel] = useState<Set<string>>(new Set());
  const widgetLibraryLoadSeqRef = useRef(0);
  const [bcWidgetPin, setBcWidgetPin] = useState<{ mode: "auto" | "pin"; productId: string; detailName: string }>({ mode: "auto", productId: "", detailName: "" });
  const [bcExpanded, setBcExpanded] = useState<Set<string>>(new Set());
  // 새 방송 만들기 모달
  const [newBcOpen, setNewBcOpen] = useState(false);
  const [newBcTitle, setNewBcTitle] = useState("");
  // 선택 복사(지난 방송 상품 → 새 방송): product_id 순서 배열. null이면 일반 새 방송
  const [bcCopyMode, setBcCopyMode] = useState(false);
  const [bcCopySel, setBcCopySel] = useState<Set<string>>(new Set());
  const [newBcCopyIds, setNewBcCopyIds] = useState<string[] | null>(null);
  // 상품 담기 피커
  const [bcPickerOpen, setBcPickerOpen] = useState(false);
  const [bcPickerSel, setBcPickerSel] = useState<Set<string>>(new Set());
  const [bcPickerSearch, setBcPickerSearch] = useState("");
  // 피커 방송 필터: 특정 지난 방송에 담았던 상품만 보기 (""=전체 창고, ids null=전체)
  const [bcPickerFromBcId, setBcPickerFromBcId] = useState("");
  // [2026-08-21] 피커 등록일 필터 — "YYYY.MM.DD" (""=사용 안 함). 화면 표시만 거르고 저장 경로 무변경.
  const [bcPickerDate, setBcPickerDate] = useState("");
  const [bcPickerFromIds, setBcPickerFromIds] = useState<Set<string> | null>(null);
  // 드래그 순서변경
  const [bcDragPid, setBcDragPid] = useState<string | null>(null);
  const [bcDragOver, setBcDragOver] = useState<number | null>(null);

  // 쇼핑몰 진열 탭(shop) — products.in_shop / mall_sort_order 사용
  const [shopRows, setShopRows] = useState<ProductRow[]>([]);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [shopPickerSel, setShopPickerSel] = useState<Set<string>>(new Set());
  const [shopPickerSearch, setShopPickerSearch] = useState("");
  // 드래그 순서변경
  const [shopDragPid, setShopDragPid] = useState<string | null>(null);
  const [shopDragOver, setShopDragOver] = useState<number | null>(null);
  const productListScrollRef = useRef<HTMLDivElement | null>(null);

  // 방송상품 드래그 중 가장자리 자동 스크롤 (sort_order/저장 로직 무관, UX만)
  const bcScrollRef = useRef<HTMLDivElement>(null);
  const bcAutoScrollRef = useRef<{ raf: number; dir: number; speed: number }>({ raf: 0, dir: 0, speed: 0 });
  const handleBcDragAutoScroll = (e: React.DragEvent) => {
    const el = bcScrollRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 64;
    const y = e.clientY;
    let dir = 0, dist = 0;
    if (y < rect.top + edge) { dir = -1; dist = rect.top + edge - y; }
    else if (y > rect.bottom - edge) { dir = 1; dist = y - (rect.bottom - edge); }
    const s = bcAutoScrollRef.current;
    s.dir = dir; s.speed = Math.min(22, Math.max(4, dist / 3));
    if (dir !== 0 && !s.raf) {
      const step = () => {
        const el2 = bcScrollRef.current;
        if (el2 && bcAutoScrollRef.current.dir !== 0) {
          el2.scrollTop += bcAutoScrollRef.current.dir * bcAutoScrollRef.current.speed;
          bcAutoScrollRef.current.raf = requestAnimationFrame(step);
        } else { bcAutoScrollRef.current.raf = 0; }
      };
      s.raf = requestAnimationFrame(step);
    }
    if (dir === 0 && s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  };
  const stopBcAutoScroll = () => { const s = bcAutoScrollRef.current; if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0; s.dir = 0; };

  // 쇼핑몰 진열 탭 드래그 중 가장자리 자동 스크롤 (mall_sort_order/저장 로직 무관, UX만)
  const shopScrollRef = useRef<HTMLDivElement>(null);
  const shopAutoScrollRef = useRef<{ raf: number; dir: number; speed: number }>({ raf: 0, dir: 0, speed: 0 });
  const handleShopDragAutoScroll = (e: React.DragEvent) => {
    const el = shopScrollRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 64;
    const y = e.clientY;
    let dir = 0, dist = 0;
    if (y < rect.top + edge) { dir = -1; dist = rect.top + edge - y; }
    else if (y > rect.bottom - edge) { dir = 1; dist = y - (rect.bottom - edge); }
    const s = shopAutoScrollRef.current;
    s.dir = dir; s.speed = Math.min(22, Math.max(4, dist / 3));
    if (dir !== 0 && !s.raf) {
      const step = () => {
        const el2 = shopScrollRef.current;
        if (el2 && shopAutoScrollRef.current.dir !== 0) {
          el2.scrollTop += shopAutoScrollRef.current.dir * shopAutoScrollRef.current.speed;
          shopAutoScrollRef.current.raf = requestAnimationFrame(step);
        } else { shopAutoScrollRef.current.raf = 0; }
      };
      s.raf = requestAnimationFrame(step);
    }
    if (dir === 0 && s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  };
  const stopShopAutoScroll = () => { const s = shopAutoScrollRef.current; if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0; s.dir = 0; };

  // 방송/쇼핑몰 탭 상품명 검색 필터 (기존 search state 재사용, 표시 전용)
  // [2026-07-23] 조합형이면 세부상품명 매칭도 허용(comboNamesMatch — 평소 상품은 항상 false)
  const nameMatch = (p: ProductRow) =>
    !search.trim() ||
    productSearchMatches(productName(p), search) ||
    productSearchMatches(brandCatalog.bySourceId.get(productId(p))?.detailName ?? '', search) ||
    searchBrandDetails(brandCatalog, productId(p), search).length > 0 ||
    comboNamesMatch(p, search) ||
    adminDetailSearch(p, search).length > 0;

  // 모바일(≤640) 감지 — 방송상품 탭 2단→세로 스택
  useEffect(() => {
    const check = () => setIsNarrow(typeof window !== "undefined" && window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 상품 fetch (기존 loadProducts 재사용)
  const loadProducts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const allProducts: ProductRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("products").select("*").order("id").range(offset, offset + 999);
        if (error) throw error;
        const page = (data || []) as ProductRow[];
        allProducts.push(...page);
        if (page.length < 1000) break;
      }
      const response = await fetch('/api/admin-live/product-brand-catalog', { cache: 'no-store' });
      const catalog = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(catalog?.links)) throw new Error(catalog?.error || '브랜드 연결을 확인하지 못했습니다.');
      // Validate before either state update: unresolved relations cannot expose duplicate roots.
      resolveBrandCatalog(allProducts, catalog.links);
      setProducts(allProducts);
      setBrandLinks(catalog.links);
    } catch (e) {
      setProducts([]);
      setBrandLinks([]);
      showAdminToast("상품 불러오기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const postWidgetLibrary = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin-live/widget-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.ok === false) throw new Error(json?.error || `요청 실패(${response.status})`);
    return json as Record<string, unknown>;
  };

  const loadWidgetLibrary = async (broadcastIdValue: string) => {
    const requestSeq = ++widgetLibraryLoadSeqRef.current;
    try {
      const query = broadcastIdValue ? `?broadcastId=${encodeURIComponent(broadcastIdValue)}` : "";
      const response = await fetch(`/api/admin-live/widget-library${query}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || json?.ok === false) throw new Error(json?.error || "목록을 불러오지 못했습니다.");

      let history = parseWidgetHistory(json?.history);
      const legacy = readPinHistory();
      if (legacy.length > 0) {
        const merged = await postWidgetLibrary({ action: "merge", entries: legacy });
        history = parseWidgetHistory(merged.history);
      }
      const rotation = parseWidgetRotation(json?.rotation);
      if (requestSeq !== widgetLibraryLoadSeqRef.current) return;
      setWidgetHistory(history);
      setWidgetRotation(rotation);
    } catch (error) {
      if (requestSeq !== widgetLibraryLoadSeqRef.current) return;
      // 서버 목록이 잠시 실패해도 이 컴퓨터의 기존 기록은 바로 쓸 수 있게 유지한다.
      setWidgetHistory(parseWidgetHistory(readPinHistory()));
      setWidgetRotation({ mode: "all", paused: false, targets: [] });
      showAdminToast("자주 사용한 위젯 목록을 불러오지 못했습니다. 이 컴퓨터의 기존 기록을 표시합니다.\n\n" + (error instanceof Error ? error.message : String(error)), "warning");
    }
  };

  const recordWidgetUsage = async (input: WidgetProductTarget & { label: string }) => {
    recordPinHistory(input);
    setWidgetHistory((previous) => recordWidgetHistory(previous, input));
    try {
      const json = await postWidgetLibrary({ action: "record", target: input, label: input.label });
      setWidgetHistory(parseWidgetHistory(json.history));
    } catch {
      // 기록 저장은 방송 고정 성공 여부와 분리한다. 다음 로드에서 로컬 기록을 다시 병합한다.
    }
  };

  const saveWidgetRotation = async (next: WidgetRotationConfig) => {
    const targetBroadcastId = widgetPinTargetBroadcastId(bcSelId, activeBroadcastId);
    if (!targetBroadcastId) {
      showAdminToast("자동 순환은 현재 진행 중인 방송에서만 변경할 수 있습니다.", "warning");
      return false;
    }
    try {
      const json = await postWidgetLibrary({ action: "saveRotation", broadcastId: targetBroadcastId, rotation: next });
      const saved = parseWidgetRotation(json.rotation);
      setWidgetRotation(saved);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      return true;
    } catch (error) {
      showAdminToast("자동 순환 설정 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      return false;
    }
  };

  // 현재 방송의 순환 목록(broadcast_products) product_id 세트
  const loadRotationIds = async () => {
    if (!activeBroadcastId) {
      setRotationIds(new Set());
      return;
    }
    const { data } = await supabase
      .from("broadcast_products")
      .select("product_id")
      .eq("broadcast_id", activeBroadcastId);
    setRotationIds(new Set(((data as { product_id: unknown }[]) || []).map((r) => String(r.product_id))));
  };

  useEffect(() => {
    void loadProducts();
    void loadRotationIds();
    const onUpdated = () => {
      void loadProducts(true);
      void loadRotationIds();
    };
    window.addEventListener("ruru-live-product-updated", onUpdated);
    return () => window.removeEventListener("ruru-live-product-updated", onUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBroadcastId]);

  useEffect(() => {
    if (tab !== "broadcast") return;
    const targetId = bcSelId;
    queueMicrotask(() => void loadWidgetLibrary(targetId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bcSelId]);

  // 현재 탭을 부모(Dashboard)에 보고 → 닫힘/재오픈 사이 탭 위치 보존
  useEffect(() => {
    onTabChange?.(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 현재 검색어를 부모(Dashboard)에 보고 → 닫힘/재오픈 사이 검색어 보존
  useEffect(() => {
    onSearchChange?.(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // 방송 상품 탭: 방송 목록 로드 (읽기 전용)
  const loadBroadcastList = async (preferId?: string) => {
    setBcLoading(true);
    try {
      const { data } = await supabase
        .from("broadcasts")
        .select("id, public_title, started_at, status")
        .neq("is_deleted", true)
        .order("started_at", { ascending: false })
        .limit(120);
      const list = ((data as Array<Record<string, unknown>>) || []).map((b) => ({
        id: String(b.id),
        title: String(b.public_title || "제목 없음"),
        started_at: String(b.started_at || ""),
        status: String(b.status || ""),
      }));
      setBcList(list);
      setBcSelId((cur) => {
        if (preferId && list.some((b) => b.id === preferId)) return preferId;
        if (cur && list.some((b) => b.id === cur)) return cur;
        const active = activeBroadcastId ? list.find((b) => b.id === String(activeBroadcastId)) : null;
        return active ? active.id : (list[0]?.id || "");
      });
    } finally {
      setBcLoading(false);
    }
  };

  // ＋새 방송: 모달의 제목으로 껍데기 생성(켜지 않음). 기존 ON 방송은 안 건드림.
  const submitNewBroadcast = async () => {
    const title = newBcTitle.trim();
    if (!title || bcBusy) return;
    setBcBusy(true);
    try {
      const created = await createDraftBroadcast(title);
      // 선택 복사: 지난 방송에서 체크한 상품들을 새 방송에 그대로 연결(broadcast_products insert만, 상품 데이터 복사 아님)
      let copiedCount = 0;
      if (newBcCopyIds && newBcCopyIds.length > 0) {
        const toInsert = newBcCopyIds.map((pid, i) => ({ broadcast_id: String(created.id), product_id: pid, sort_order: i, is_visible: true }));
        const { error: copyErr } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: toInsert });
        if (copyErr) {
          showAdminToast("방송은 생성됐지만 상품 복사에 실패했습니다.\n\n" + copyErr.message, "warning");
        } else {
          copiedCount = toInsert.length;
        }
      }
      await loadBroadcastList(String(created.id));
      // 방송 목록 전용 신호 — Dashboard가 broadcasts 배열을 다시 로드하도록(상품 패널용 ruru-live-product-updated와 분리)
      window.dispatchEvent(new Event("ruru-broadcast-list-updated"));
      if (copiedCount > 0) window.dispatchEvent(new Event("ruru-live-product-updated"));
      setNewBcOpen(false);
      setNewBcTitle("");
      setNewBcCopyIds(null);
      setBcCopyMode(false);
      setBcCopySel(new Set());
      showAdminToast(copiedCount > 0 ? `방송이 생성됐고 상품 ${copiedCount}개를 담았어요.` : "방송이 생성됐습니다. 상품을 담아주세요.", "success");
    } catch (e) {
      const err = e as { message?: string; code?: string };
      showAdminToast("새 방송 생성 실패\n\n" + (err?.message ?? err?.code ?? "알 수 없는 오류"), "error");
    } finally {
      setBcBusy(false);
    }
  };

  // 방송 숨기기(소프트 삭제): is_deleted=true만 update(진짜 DELETE 아님). ON 방송은 금지.
  const handleHideBroadcast = async (b: { id: string; title: string; status: string }) => {
    if (bcBusy) return;
    if (String(b.status || "").toUpperCase() === "ON") {
      showAdminToast("켜진 방송은 숨길 수 없습니다. 먼저 방송을 종료해주세요.", "warning");
      return;
    }
    const okHide = await showAdminConfirm(`'${b.title}' 방송을 목록에서 숨길까요?\n\n데이터는 보존되며 복구 가능합니다.`, { title: "방송 숨기기", confirmText: "숨기기", cancelText: "취소", tone: "warning" });
    if (!okHide) return;
    setBcBusy(true);
    try {
      const { error } = await adminCatalogWrite({ table: "broadcasts", op: "update", values: { is_deleted: true }, filters: [{ type: "eq", col: "id", val: b.id }] });
      if (error) throw error;
      if (bcSelId === b.id) setBcSelId("");
      await loadBroadcastList();
      window.dispatchEvent(new Event("ruru-broadcast-list-updated"));
    } catch (e) {
      const err = e as { message?: string; code?: string };
      showAdminToast("방송 숨기기 실패\n\n" + (err?.message ?? err?.code ?? "알 수 없는 오류"), "error");
    } finally {
      setBcBusy(false);
    }
  };

  useEffect(() => {
    if (tab === "broadcast" && bcList.length === 0) void loadBroadcastList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadBcWidgetPin = async (broadcastId: string) => {
    if (!broadcastId) { setBcWidgetPin({ mode: "auto", productId: "", detailName: "" }); return; }
    const { data } = await supabase.from("broadcasts").select("widget_pin_mode,widget_pin_product_id,widget_pin_detail_name").eq("id", broadcastId).maybeSingle();
    const row = (data || {}) as Record<string, unknown>;
    setBcWidgetPin({
      mode: String(row.widget_pin_mode || "auto") === "pin" ? "pin" : "auto",
      productId: String(row.widget_pin_product_id ?? ""),
      detailName: String(row.widget_pin_detail_name ?? "").trim(),
    });
  };

  const [bcSort, setBcSort] = useState<ProductSortKey>("manual");
  const bcProductsView = useMemo(() => {
    if (bcSort !== "manual") return sortProductRows(bcProducts, bcSort);
    if (bcWidgetPin.mode !== "pin" || !bcWidgetPin.productId) return bcProducts;
    const idx = bcProducts.findIndex((p) => productId(p) === bcWidgetPin.productId);
    if (idx <= 0) return bcProducts;
    const copy = [...bcProducts]; const [top] = copy.splice(idx, 1); return [top, ...copy];
  }, [bcProducts, bcWidgetPin.mode, bcWidgetPin.productId, bcSort]);

  // [2026-09-25] 방송 목록 기간 + 이름 검색 필터 — 표시 전용. bcList 원본은 그대로 두고 렌더만 거른다.
  //   [사장님 요청] 지금 선택된 방송·방송 중(ON)인 방송은 기간/검색 필터와 상관없이 «항상 맨 위»에 고정.
  const bcListView = useMemo(() => {
    const q = bcSearch.trim().toLowerCase();
    // 기간 하한(from)·상한(to) 계산 (started_at 기준)
    let fromTs = -Infinity;
    let toTs = Infinity;
    if (bcDateFilter === "recent30") fromTs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    else if (bcDateFilter === "recent90") fromTs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    else if (bcDateFilter === "custom") {
      if (bcCustomFrom) { const d = new Date(`${bcCustomFrom}T00:00:00`); if (!Number.isNaN(d.getTime())) fromTs = d.getTime(); }
      if (bcCustomTo) { const d = new Date(`${bcCustomTo}T23:59:59`); if (!Number.isNaN(d.getTime())) toTs = d.getTime(); }
    }
    const isAlwaysTop = (b: { id: string; status: string }) => b.id === bcSelId || String(b.status || "").toUpperCase() === "ON";
    const passesFilter = (b: { started_at: string; title: string }) => {
      if (q && !b.title.toLowerCase().includes(q)) return false;
      if (bcDateFilter === "all") return true;
      const t = new Date(b.started_at).getTime();
      if (Number.isNaN(t)) return false; // 날짜 없는 방송은 기간 필터에선 숨김(전체에서만 보임)
      return t >= fromTs && t <= toTs;
    };
    // 고정(선택·ON)은 bcList 순서(started_at 내림차순) 그대로 맨 위, 나머지는 필터 통과분만.
    const top = bcList.filter(isAlwaysTop);
    const topIds = new Set(top.map((b) => b.id));
    const rest = bcList.filter((b) => !topIds.has(b.id) && passesFilter(b));
    return [...top, ...rest];
  }, [bcList, bcDateFilter, bcCustomFrom, bcCustomTo, bcSearch, bcSelId]);

  // [2026-08-13] 드래그 허용 조건 — 「진열 순서」 + 검색 안 함 + 복사모드 아님 + 저장 중 아님.
  //   (고정 여부는 더 이상 조건이 아니다 — ID 기준 순서변경이라 안 엉킴)
  const bcDragEnabled = !bcBusy && !search.trim() && !bcCopyMode && bcSort === "manual";

  // 선택 방송의 broadcast_products 목록 로드 (sort_order순, products와 매칭)
  const reloadBcProducts = async (selId: string) => {
    if (!selId) {
      setBcProducts([]);
      return;
    }
    const { data: links } = await supabase
      .from("broadcast_products")
      .select("product_id, sort_order")
      .eq("broadcast_id", selId)
      .order("sort_order", { ascending: true });
    const ids = ((links as { product_id: unknown }[]) || []).map((r) => String(r.product_id));
    const byId = new Map(products.map((p) => [productId(p), p]));
    const rows = ids.map((pid) => byId.get(pid)).filter(Boolean) as ProductRow[];
    setBcProducts(rows);
  };

  useEffect(() => {
    if (tab !== "broadcast") return;
    void reloadBcProducts(bcSelId);
    void loadBcWidgetPin(bcSelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bcSelId, products]);

  // 방송 변경 시 선택 복사 상태 초기화
  useEffect(() => {
    setBcCopyMode(false);
    setBcCopySel(new Set());
  }, [bcSelId]);

  // 선택 복사 토글
  const toggleBcCopyPick = (pid: string) => {
    setBcCopySel((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // 선택 복사 → 새 방송 모달 열기 (bcProducts 순서 유지)
  const openNewBcWithCopy = () => {
    const ids = bcProducts.map((p) => productId(p)).filter((pid) => pid && bcCopySel.has(pid));
    if (ids.length === 0) {
      showAdminToast("복사할 상품을 먼저 선택하세요.", "warning");
      return;
    }
    setNewBcCopyIds(ids);
    setNewBcTitle("");
    setNewBcOpen(true);
  };

  // 이미 담긴 product_id 세트 (피커 비활성용)
  const bcAddedIds = useMemo(() => new Set(bcProducts.map((p) => productId(p))), [bcProducts]);

  // 상품 빼기: 한 방송의 한 상품만 삭제 (다른 방송 영향 없음)
  const removeBcProduct = async (pid: string) => {
    if (!bcSelId || !pid || bcBusy) return;
    setBcBusy(true);
    try {
      const { error } = await adminCatalogWrite({
        table: "broadcast_products",
        op: "delete",
        filters: [
          { type: "eq", col: "broadcast_id", val: bcSelId },
          { type: "eq", col: "product_id", val: pid },
        ],
      });
      if (error) throw error;
      await reloadBcProducts(bcSelId);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (e) {
      showAdminToast("상품 빼기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBcBusy(false);
    }
  };

  // 상품 담기 피커 열기
  const openBcPicker = () => {
    if (!bcSelId) {
      showAdminToast("먼저 방송을 선택하세요.", "warning");
      return;
    }
    setBcPickerSel(new Set());
    setBcPickerSearch("");
    setBcPickerFromBcId("");
    setBcPickerFromIds(null);
    setBcPickerDate("");
    setBcPickerOpen(true);
  };

  // [2026-08-21] 상품 등록일(created_at, 로컬 날짜) 문자열 — 피커 등록일 필터용
  const productRegDate = (p: ProductRow): string => {
    const t = new Date(String((p as Record<string, unknown>).created_at || ""));
    if (Number.isNaN(t.getTime())) return "";
    return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
  };

  // 등록일별 상품 수 (삭제 제외, 최신 날짜부터 30일치) — 칩/드롭다운에 개수 표시
  const bcPickerDateGroups = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of products) {
      if (pickString(p, ["status"], "") === "deleted") continue;
      const d = productRegDate(p);
      if (d) cnt[d] = (cnt[d] || 0) + 1;
    }
    return Object.entries(cnt).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);
  }, [products]);

  const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`; })();
  const yesterdayStr = (() => { const t = new Date(Date.now() - 86400000); return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`; })();
  const todayCount = bcPickerDateGroups.find(([d]) => d === todayStr)?.[1] || 0;
  const yesterdayCount = bcPickerDateGroups.find(([d]) => d === yesterdayStr)?.[1] || 0;

  // 피커 방송 필터 변경: 그 방송의 broadcast_products product_id 로드 (읽기 전용)
  const changeBcPickerFrom = async (bid: string) => {
    setBcPickerFromBcId(bid);
    if (!bid) {
      setBcPickerFromIds(null);
      return;
    }
    const { data } = await supabase
      .from("broadcast_products")
      .select("product_id")
      .eq("broadcast_id", bid);
    setBcPickerFromIds(new Set(((data as { product_id: unknown }[]) || []).map((r) => String(r.product_id))));
  };

  const toggleBcPick = (id: string) => {
    setBcPickerSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 선택 상품들을 broadcast_products에 담기 (sort_order = 기존 최대+1씩, NOT NULL 채움)
  const confirmBcPick = async () => {
    if (!bcSelId || bcPickerSel.size === 0 || bcBusy) return;
    setBcBusy(true);
    try {
      const { data: existing } = await supabase
        .from("broadcast_products")
        .select("sort_order")
        .eq("broadcast_id", bcSelId);
      let maxSort = 0;
      ((existing as { sort_order: unknown }[]) || []).forEach((r) => {
        maxSort = Math.max(maxSort, Number(r.sort_order || 0));
      });
      const toInsert = Array.from(bcPickerSel)
        .filter((pid) => !bcAddedIds.has(pid))
        .map((pid) => ({ broadcast_id: bcSelId, product_id: pid, sort_order: ++maxSort, is_visible: true }));
      if (toInsert.length === 0) {
        setBcPickerOpen(false);
        return;
      }
      const { error } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: toInsert });
      if (error) throw error;
      setBcPickerOpen(false);
      await reloadBcProducts(bcSelId);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`${toInsert.length}개 상품을 방송에 담았어요.`, "success");
    } catch (e) {
      showAdminToast("상품 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBcBusy(false);
    }
  };

  // 순서 이동(↑↓): 새 순서대로 sort_order 0..n-1 재기록 (해당 방송만)
  // 드래그앤드롭 순서변경: from→to 재배열 후 sort_order 0..n-1 재기록 (해당 방송만)
  const reorderBc = async (from: number, to: number) => {
    if (bcBusy || from === to || from < 0 || to < 0 || from >= bcProducts.length || to >= bcProducts.length) return;
    const ordered = [...bcProducts];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setBcProducts(ordered); // 낙관적 갱신
    setBcBusy(true);
    try {
      for (let i = 0; i < ordered.length; i++) {
        const pid = productId(ordered[i]);
        if (!pid) continue;
        const { error } = await adminCatalogWrite({
          table: "broadcast_products",
          op: "update",
          values: { sort_order: i },
          filters: [
            { type: "eq", col: "broadcast_id", val: bcSelId },
            { type: "eq", col: "product_id", val: pid },
          ],
        });
        if (error) throw error;
      }
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (e) {
      const err = e as { message?: string; code?: string };
      showAdminToast("순서 변경 실패\n\n" + (err?.message ?? err?.code ?? "알 수 없는 오류"), "error");
      await reloadBcProducts(bcSelId);
    } finally {
      setBcBusy(false);
    }
  };

  // [2026-08-13] 순번(i)이 아니라 **상품 ID**로 순서 변경.
  //   화면이 고정(📌)·검색으로 재배치돼 있어도 실제 목록(bcProducts)에서 두 상품의
  //   진짜 위치를 찾아 옮기므로 어긋나지 않는다. 저장 로직(reorderBc)은 그대로 재사용.
  const reorderBcByPid = (fromPid: string, toPid: string) => {
    if (!fromPid || !toPid || fromPid === toPid) return;
    const from = bcProducts.findIndex((p) => productId(p) === fromPid);
    const to = bcProducts.findIndex((p) => productId(p) === toPid);
    if (from < 0 || to < 0) return;
    void reorderBc(from, to);
  };

  // 재고임박 필터 (전체 상품 탭): 재고관리 중 && 재고 3개 이하
  const [lowOnly, setLowOnly] = useState(false);
  // 정렬 (전체 상품 탭): 기본(고정 우선)/최신 등록순/재고 적은순 — 표시 순서만, 데이터 무변경
  const [sortKey, setSortKey] = useState<"default" | "latest" | "stock_low">("latest");

  const filtered = useMemo(() => {
    const q = normalizeProductSearchText(search);
    const list = brandCatalog.roots.filter((p) => {
      if (pickString(p, ["status", "product_status"], "") === "deleted") return false;
      if (category === NO_CATEGORY_KEY) { if (productCategory(p)) return false; }
      else if (category !== "전체" && productCategory(p) !== category) return false;
      if (lowOnly) {
        const s = lowStockOf(p);
        if (s === null || s > 3) return false;
      }
      // 관리자 검색은 숨김 세부상품까지 포함해 정확한 상세상품명을 찾는다.
      // 대표상품명이 직접 검색된 경우는 대표카드만 보여주고, 세부상품명이 검색된 경우만 아래에서 자동 펼친다.
      if (q && !productSearchMatches(productName(p), q) && searchBrandDetails(brandCatalog, productId(p), search).length === 0) return false;
      return true;
    });
    // 정렬: 재고 적은순(재고관리 상품 우선, 미관리·재고없음은 뒤로)
    if (sortKey === "stock_low") {
      const val = (p: ProductRow) => {
        const m = stockMetaOf(p);
        return m.managed && m.stock !== null ? m.stock : Number.POSITIVE_INFINITY;
      };
      return list.sort((a, b) => val(a) - val(b));
    }
    // 정렬: 최신 등록순 (created_at 내림차순, 파싱 실패는 뒤로)
    if (sortKey === "latest") {
      const ts = (p: ProductRow) => {
        const t = new Date(String((p as Record<string, unknown>).created_at || "")).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      return list.sort((a, b) => ts(b) - ts(a));
    }
    // 기본: 저장된 상품 순서를 그대로 유지한다.
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandCatalog, search, category, lowOnly, sortKey]);

  const productPagination = productPage(filtered, productPageNumber, productPageSize);
  const visible = productPagination.items;
  useEffect(() => {
    setProductPageNumber(1);
  }, [tab, search, category, lowOnly, sortKey, productPageSize]);
  // Keep state in range after deleting the last row on a page or refreshing data.
  useEffect(() => {
    if (productPageNumber !== productPagination.page) setProductPageNumber(productPagination.page);
  }, [productPageNumber, productPagination.page]);
  useEffect(() => {
    productListScrollRef.current?.scrollTo({ top: 0 });
  }, [productPagination.page, search, category, lowOnly, sortKey, productPageSize]);
  const changeProductPage = (page: number) => {
    setProductPageNumber(page);
  };

  // 분류 칩 = 실제 데이터에서(삭제 제외). 2개 이상인 분류만 칩으로(1개짜리 오타·브랜드명은 「전체」에서 검색), 분류 없는 상품이 있으면 「분류 없음」 칩.
  const categories = useMemo(() => {
    const count = new Map<string, number>();
    let none = 0;
    for (const p of brandCatalog.roots) {
      if (pickString(p, ["status", "product_status"], "") === "deleted") continue;
      const c = productCategory(p);
      if (!c) { none += 1; continue; }
      count.set(c, (count.get(c) || 0) + 1);
    }
    const list: Array<{ key: string; label: string }> = [{ key: "전체", label: "전체" }];
    for (const [c, n] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
      if (n >= 2) list.push({ key: c, label: `${c} ${n}` });
    }
    if (none > 0) list.push({ key: NO_CATEGORY_KEY, label: `분류 없음 ${none}` });
    return list;
  }, [brandCatalog]);

  // [2026-08-13] 쇼핑몰 진열 탭 정렬 (표시 전용)
  const [shopSort, setShopSort] = useState<ProductSortKey>("manual");
  const shopRowsView = useMemo(() => sortProductRows(shopRows, shopSort), [shopRows, shopSort]);
  const shopDragEnabled = !shopBusy && !search.trim() && shopSort === "manual";
  const reorderShopByPid = (fromPid: string, toPid: string) => {
    if (!fromPid || !toPid || fromPid === toPid) return;
    const from = shopRows.findIndex((p) => productId(p) === fromPid);
    const to = shopRows.findIndex((p) => productId(p) === toPid);
    if (from < 0 || to < 0) return;
    void reorderShop(from, to);
  };

  // 쇼핑몰 진열 목록: in_shop=true & 삭제 아님 & is_visible, mall_sort_order 오름차순
  const reloadShop = () => {
    const rows = products
      .filter((p) => {
        if (pickString(p, ["status"], "") === "deleted") return false;
        if (!pickBoolean(p, ["in_shop"], false)) return false;
        return pickBoolean(p, ["is_visible"], true);
      })
      .sort((a, b) => pickNumber(a, ["mall_sort_order"], 999999) - pickNumber(b, ["mall_sort_order"], 999999));
    setShopRows(rows);
  };

  useEffect(() => {
    if (tab !== "shop") return;
    reloadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, products]);

  // 이미 진열(in_shop=true)인 product_id 세트 (피커 비활성용)
  const shopAddedIds = useMemo(
    () => new Set(products.filter((p) => pickBoolean(p, ["in_shop"], false)).map((p) => productId(p))),
    [products],
  );

  // 쇼핑몰에서 빼기: in_shop 컬럼만 false (다른 컬럼 무변경)
  const removeFromShop = async (pid: string) => {
    if (!pid || shopBusy) return;
    setShopBusy(true);
    try {
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { in_shop: false }, filters: [{ type: "eq", col: "id", val: pid }] });
      if (error) throw error;
      setShopRows((prev) => prev.filter((p) => productId(p) !== pid)); // 낙관적
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (e) {
      showAdminToast("쇼핑몰 빼기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
      reloadShop();
    } finally {
      setShopBusy(false);
    }
  };

  // [2026-10-21 a2-6] 숨기기/보이기 — products.status 판매중↔숨김 (등록 폼 「고객 노출」과 같은 값, 손님 화면 전체에서 안 보임).
  //   판매중·숨김 두 값만 토글. 그 외(품절 등)는 건드리지 않는다. 재고·가격·주문 무접촉.
  const [hideBusyId, setHideBusyId] = useState("");
  const isProductHidden = (p: ProductRow) => pickString(p, ["status"], "") === "숨김";
  const canToggleHidden = (p: ProductRow) => ["판매중", "숨김", ""].includes(pickString(p, ["status"], ""));
  const toggleProductHidden = async (p: ProductRow) => {
    const pid = productId(p);
    if (!pid || hideBusyId || !canToggleHidden(p)) return;
    const next = isProductHidden(p) ? "판매중" : "숨김";
    setHideBusyId(pid);
    try {
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { status: next }, filters: [{ type: "eq", col: "id", val: pid }] });
      if (error) throw error;
      showAdminToast(next === "숨김" ? "손님 화면에서 숨겼어요." : "손님 화면에 다시 보여요.", "success");
      await loadProducts(true);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (e) {
      showAdminToast((next === "숨김" ? "숨기기" : "보이기") + " 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setHideBusyId("");
    }
  };

  const openShopPicker = () => {
    setShopPickerSel(new Set());
    setShopPickerSearch("");
    setShopPickerOpen(true);
  };

  const toggleShopPick = (id: string) => {
    setShopPickerSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 쇼핑몰에 진열: in_shop=true + mall_sort_order(기존 최대+1, NOT NULL 채움). 다른 컬럼 무변경
  const confirmShopPick = async () => {
    if (shopPickerSel.size === 0 || shopBusy) return;
    setShopBusy(true);
    try {
      let maxSort = -1;
      products.forEach((p) => {
        if (pickBoolean(p, ["in_shop"], false)) maxSort = Math.max(maxSort, pickNumber(p, ["mall_sort_order"], 0));
      });
      const ids = Array.from(shopPickerSel).filter((pid) => !shopAddedIds.has(pid));
      for (const pid of ids) {
        maxSort += 1;
        const { error } = await adminCatalogWrite({
          table: "products",
          op: "update",
          values: { in_shop: true, mall_sort_order: maxSort },
          filters: [{ type: "eq", col: "id", val: pid }],
        });
        if (error) throw error;
      }
      setShopPickerOpen(false);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`${ids.length}개 상품을 쇼핑몰에 담았어요.`, "success");
    } catch (e) {
      // supabase 에러는 Error 인스턴스가 아니라 {message, code} 객체라 String(e)가 [object Object]가 된다.
      const err = e as { message?: string; code?: string };
      showAdminToast("쇼핑몰 진열 실패\n\n" + (err?.message ?? err?.code ?? "알 수 없는 오류"), "error");
    } finally {
      setShopBusy(false);
    }
  };

  // 순서 이동(↑↓): 새 순서대로 mall_sort_order 0..n-1 재기록 (in_shop 목록만, 다른 컬럼 무변경)
  // 드래그앤드롭 순서변경: from→to 재배열 후 mall_sort_order 0..n-1 재기록 (mall_sort_order 컬럼만)
  const reorderShop = async (from: number, to: number) => {
    if (shopBusy || from === to || from < 0 || to < 0 || from >= shopRows.length || to >= shopRows.length) return;
    const ordered = [...shopRows];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setShopRows(ordered); // 낙관적 갱신
    setShopBusy(true);
    try {
      for (let i = 0; i < ordered.length; i++) {
        const pid = productId(ordered[i]);
        if (!pid) continue;
        const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { mall_sort_order: i }, filters: [{ type: "eq", col: "id", val: pid }] });
        if (error) throw error;
      }
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (e) {
      const err = e as { message?: string; code?: string };
      showAdminToast("순서 변경 실패\n\n" + (err?.message ?? err?.code ?? "알 수 없는 오류"), "error");
      reloadShop();
    } finally {
      setShopBusy(false);
    }
  };

  const broadcastPinKey = (productIdValue: string, detailName = "") => `${productIdValue}|${detailName}`;
  const findBroadcastProduct = (id:string):ProductRow|undefined => {
    const direct=bcProducts.find(row=>productId(row)===id);
    const link=brandCatalog.bySourceId.get(id);
    const source=direct ?? (link && bcProducts.some(row=>productId(row)===link.parentId)?products.find(row=>productId(row)===id):undefined);
    return source?resolveAdminBrandTarget(products,brandCatalog,source).product:undefined;
  };
  const isBroadcastPinned = (productIdValue: string, detailName = "") => {
    const row=products.find(product=>productId(product)===productIdValue);
    const target=row?resolveAdminBrandTarget(products,brandCatalog,row,detailName):null;
    return bcWidgetPin.mode === "pin" && bcWidgetPin.productId === (target?productId(target.product):String(productIdValue)) && bcWidgetPin.detailName === String(target?.detailName ?? detailName).trim();
  };
  // [2026-09-19 사장님] 「종료했다고 해제가 안 되네?」 — 해제는 지난 방송에서도 되게(«자동»으로 되돌릴 뿐이라 손님 화면 무관).
  //   새로 고정하는 건 여전히 진행 중 방송만(pinBroadcastProduct).
  const clearBroadcastPin = async () => {
    const targetBroadcastId = String(bcSelId ?? "").trim();
    if (!targetBroadcastId || bcPinBusy) {
      if (!targetBroadcastId) showAdminToast("방송을 먼저 선택하세요.", "warning");
      return;
    }
    setBcPinBusy(true);
    try {
      const { data, error } = await adminCatalogWrite({
        table: "broadcasts",
        op: "update",
        values: { widget_pin_mode: "auto", widget_pin_product_id: null, widget_pin_detail_name: null },
        filters: [{ type: "eq", col: "id", val: targetBroadcastId }],
        select: "id,widget_pin_mode,widget_pin_product_id,widget_pin_detail_name",
        single: true,
      });
      if (error) throw error;
      if (!savedWidgetAutoMatches(data as Record<string, unknown> | null)) throw new Error("DB 고정 해제값 확인에 실패했습니다.");
      setBcWidgetPin({ mode: "auto", productId: "", detailName: "" });
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("위젯 고정을 해제했습니다. 설정된 상품 순환으로 돌아갑니다.", "success");
      return true;
    } catch (e) {
      await loadBcWidgetPin(targetBroadcastId);
      showAdminToast("고정 해제 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
      return false;
    } finally {
      setBcPinBusy(false);
    }
  };
  const pinBroadcastProduct = async (p: ProductRow, detail?: DetailProduct) => {
    const target=resolveAdminBrandTarget(products,brandCatalog,p,detail?.detailName);
    p=target.product;
    if(!target.detailName)detail=undefined;
    const pid = productId(p);
    const targetBroadcastId = widgetPinTargetBroadcastId(bcSelId, activeBroadcastId);
    if (!pid || !targetBroadcastId || bcPinBusy) {
      if (!targetBroadcastId) showAdminToast("위젯 고정은 현재 진행 중인 방송에서만 변경할 수 있습니다.", "warning");
      return;
    }
    const detailName = detail?.detailName || "";
    if (isBroadcastPinned(pid, detailName)) { await clearBroadcastPin(); return; }
    setBcPinBusy(true);
    try {
      const { data, error } = await adminCatalogWrite({
        table: "broadcasts",
        op: "update",
        values: { widget_pin_mode: "pin", widget_pin_product_id: pid, widget_pin_detail_name: detailName || null },
        filters: [{ type: "eq", col: "id", val: targetBroadcastId }],
        select: "id,widget_pin_mode,widget_pin_product_id,widget_pin_detail_name",
        single: true,
      });
      if (error) throw error;
      if (!savedWidgetPinMatches(data as Record<string, unknown> | null, { productId: pid, detailName })) throw new Error("DB에 고정값이 저장되지 않았습니다. 다시 눌러주세요.");
      setBcWidgetPin({ mode: "pin", productId: pid, detailName });
      // [2026-10-03] 성공한 고정은 서버 보관 목록에 누적한다. 기록 실패가 고정 성공을 되돌리지는 않는다.
      await recordWidgetUsage({ productId: pid, detailName, label: detail?.detailName || productName(p) });
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`${detail?.detailName || productName(p)} 위젯 고정 완료`, "success");
    } catch (e) {
      await loadBcWidgetPin(targetBroadcastId);
      showAdminToast("상품 고정 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBcPinBusy(false);
    }
  };
  // [2026-10-21 a2-10] 위젯 순환 = 방송 상품 줄 체크로. 저장 형식(mode/targets)·위젯 소비 로직(selectWidgetRotationItems)은 그대로.
  //   타겟은 {productId, detailName:""} — 위젯은 detailName 이 빈 값이면 그 상품의 모든 세부상품을 순환에 넣는다.
  //   옛 「고정 기록만(history)」 저장값은 그대로 읽어 보여주되(소개했던 상품), 새로 저장하는 길은 전체/체크한 상품만 두 가지.
  const bcAllPids = useMemo(() => bcProducts.map((row) => productId(row)).filter(Boolean), [bcProducts]);
  //   브랜드 묶음 줄: 연결된 세부상품(다른 상품을 묶어 넣은 것)은 위젯 타겟이 «원래 상품 id» 라서(widgetTargetFromProduct),
  //   줄 하나를 체크하면 부모 id + 연결 세부상품 원래 id 를 함께 저장해야 그 묶음 전체가 순환에 들어간다.
  const rotationPidsForRow = (pid: string): string[] => {
    const linked = (brandCatalog.detailsByParent.get(pid) ?? [])
      .map((detail) => ("sourceProductId" in detail ? String((detail as { sourceProductId?: unknown }).sourceProductId ?? "") : ""))
      .filter(Boolean);
    return [pid, ...linked];
  };
  const rotationTargetPids = useMemo<Set<string>>(() => {
    if (widgetRotation.mode === "all") return new Set(bcAllPids);
    if (widgetRotation.mode === "history") return new Set(widgetHistory.map((entry) => String(entry.productId)));
    return new Set(widgetRotation.targets.map((target) => String(target.productId)));
  }, [bcAllPids, widgetHistory, widgetRotation]);
  // 줄 기준 「순환 포함」 = 그 줄 id 또는 그 줄에 묶인 세부상품 id 가 타겟에 있으면
  const rotationIncludedPids = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    for (const pid of bcAllPids) if (rotationPidsForRow(pid).some((id) => rotationTargetPids.has(id))) out.add(pid);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bcAllPids, rotationTargetPids, brandCatalog]);
  const rotationLive = Boolean(widgetPinTargetBroadcastId(bcSelId, activeBroadcastId));
  const rotationSelectedCount = widgetRotation.mode === "all" ? bcAllPids.length : bcAllPids.filter((pid) => rotationIncludedPids.has(pid)).length;
  const saveRotationPids = async (pids: string[], doneMessage: string) => {
    const unique = [...new Set(pids.filter((pid) => bcAllPids.includes(pid)).flatMap(rotationPidsForRow))];
    if (unique.length === 0) {
      showAdminToast("순환할 상품이 하나도 없어요. 최소 1개는 남겨 주세요.", "warning");
      return;
    }
    const targets: WidgetProductTarget[] = unique.map((pid) => ({ productId: pid, detailName: "" }));
    if (await saveWidgetRotation({ mode: "selected", paused: widgetRotation.paused, targets })) {
      setBcRotSel(new Set());
      showAdminToast(doneMessage, "success");
    }
  };
  const rotationUseAll = async () => {
    if (await saveWidgetRotation({ mode: "all", paused: widgetRotation.paused, targets: [] })) {
      setBcRotSel(new Set());
      showAdminToast("이 방송에 담긴 상품 전체를 순환합니다.", "success");
    }
  };
  const rotationAddChecked = async () => {
    const checked = [...bcRotSel];
    if (checked.length === 0) return;
    if (widgetRotation.mode === "all") { await saveRotationPids(checked, `체크한 ${checked.length}개만 순환합니다.`); return; }
    await saveRotationPids([...rotationIncludedPids, ...checked], `순환에 ${checked.length}개 넣었어요.`);
  };
  const rotationRemoveChecked = async () => {
    const checked = new Set(bcRotSel);
    if (checked.size === 0) return;
    const drop = new Set([...checked].flatMap(rotationPidsForRow));
    await saveRotationPids(bcAllPids.filter((pid) => rotationIncludedPids.has(pid) && !drop.has(pid)), `순환에서 ${checked.size}개 뺐어요.`);
  };
  const toggleRotSel = (pid: string) => setBcRotSel((prev) => { const next = new Set(prev); if (next.has(pid)) next.delete(pid); else next.add(pid); return next; });

  const toggleWidgetLibraryPause = async () => {
    const next = { ...widgetRotation, paused: !widgetRotation.paused };
    if (await saveWidgetRotation(next)) {
      showAdminToast(next.paused ? "상품 위젯 순환을 잠시 멈췄습니다." : "상품 위젯 순환을 다시 시작했습니다.", "success");
    }
  };


  const copyTextToClipboard = async (text:string) => { if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;} const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta); };
  // [2026-08-29] 채팅 안내 문구에서 "현재상품" 글씨를 뺐다 (사장님 지시).
  //   ✅ 현재상품 ✅ BB(버버리)-67 …  →  ✅ BB(버버리)-67 …
  //   위젯에 이미 지금 상품이 보이므로 같은 말을 두 번 할 필요가 없다.
  //
  //   ⚠️ 봇이 채팅에 자동으로 올리는 방식은 사장님 지시로 하지 않는다.
  //      (유튜브 쿼터가 넉넉하지 않다 — 봇 글은 하루 60건 상한을 여러 기능이 나눠 쓴다)
  //      예전처럼 클립보드에 복사만 하고, 사장님이 채팅에 붙여넣는다.
  const setChatCurrentAndCopy = async (p: ProductRow, detail?: DetailProduct) => {
    const target=resolveAdminBrandTarget(products,brandCatalog,p,detail?.detailName);
    p=target.product;
    if(!target.detailName)detail=undefined;
    const pid = productId(p);
    if (!pid) return;
    const detailName = detail?.detailName || "";
    const line = detail
      ? buildDetailChatLine(detail)
      : buildChatAnnounceText(p).replace(/[\r\n]+/g, " ").trim();
    const text = `✅ ${line}`;
    try {
      const res = await fetch("/api/chat-orders/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pid, productName: productName(p), detailName }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) throw new Error(j?.error?.message || "현재상품 저장 실패");
      await copyTextToClipboard(text);
      // [2026-09-13 사장님] 같은 문구를 방송 화면 «주문·입금 알림» 위젯에도 한 줄 띄운다(30초).
      //   ⚠ 위 «현재상품 지정 + 복사»가 끝난 뒤에만, 실패해도 기존 동작에 영향 없게 따로 감싼다.
      //   방송 중이 아니면 띄울 곳이 없으므로 조용히 건너뛴다.
      let widgetShown = false;
      if (activeBroadcastId) {
        try {
          await setBroadcastFeedNotice(String(activeBroadcastId), line);
          widgetShown = true;
        } catch {
          /* 위젯 표시 실패는 채팅 복사와 무관 — 조용히 넘어간다 */
        }
      }
      showAdminToast(`채팅 현재상품 지정 + 복사 완료${widgetShown ? " · 방송 화면에도 30초 표시" : ""}\n\n${text}`, "success");
    } catch (e) {
      showAdminToast("채팅 현재상품 지정/복사 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  // [2026-08-31 사장님 요청] 방송 중 동선 단축 — 「▶ 방송」 한 번이면 ①위젯 고정 ②채팅 현재상품 지정 ③채팅문구 복사.
  //   유튜브 채팅에는 사장님이 붙여넣기만 하면 된다(자동 게시는 쿼터·봇침묵규칙 때문에 안 함 — 사장님 지시).
  //   ⚠️ 고정 버튼은 토글이라, 이미 고정된 상품이면 고정을 건드리지 않고(풀림 방지) 채팅 지정+복사만 한다.
  const broadcastOneClick = async (p: ProductRow, detail?: DetailProduct) => {
    const pid = productId(p);
    if (!pid) return;
    if (!isBroadcastPinned(pid, detail?.detailName || "")) {
      await pinBroadcastProduct(p, detail);
    }
    await setChatCurrentAndCopy(p, detail);
  };

  // --- 전체상품 탭 위젯 액션 ---
  // 여기서는 방송 순환 포함/제외만 관리한다. 정확한 고정은 방송 상품 탭의 세부행에서
  // broadcasts.widget_pin_*에만 저장한다. products.is_pinned는 더 이상 사용하지 않는다.
  const widgetState = (p: ProductRow): "rotating" | "none" => rotationIds.has(productId(p)) ? "rotating" : "none";

  const addRotationSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    if (!activeBroadcastId) { showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 먼저 시작한 뒤 순환에 담아주세요.", "warning"); return; }
    setBusyId(id);
    try {
      const { data: existing } = await supabase.from("broadcast_products").select("product_id").eq("broadcast_id", activeBroadcastId).eq("product_id", id);
      if (!existing || existing.length === 0) {
        const { error } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: { broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 } });
        if (error) throw error;
      }
      setRotationIds((prev) => new Set(prev).add(id));
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("방송 순환에 담았어요.", "success");
    } catch (e) { showAdminToast("방송에 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error"); }
    finally { setBusyId(""); }
  };

  const removeRotationSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id || !activeBroadcastId) return;
    setBusyId(id);
    try {
      const { error } = await adminCatalogWrite({ table: "broadcast_products", op: "delete", filters: [{ type: "eq", col: "broadcast_id", val: activeBroadcastId }, { type: "eq", col: "product_id", val: id }] });
      if (error) throw error;
      setRotationIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("순환에서 뺐어요.", "success");
    } catch (e) { showAdminToast("방송에서 빼기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error"); }
    finally { setBusyId(""); }
  };

  const onWidgetClick = (p: ProductRow) => widgetState(p) === "rotating" ? void removeRotationSingle(p) : void addRotationSingle(p);

  // --- 등록/수정/삭제 (기존 이벤트/로직 재사용) ---
  const openCreate = () => {
    window.dispatchEvent(new Event("ruru-open-quick-product-panel"));
    onClose();
  };

  const editProduct = (p: ProductRow, detailName = "") => {
    const target=resolveAdminBrandTarget(products,brandCatalog,p,detailName);
    p=target.product;detailName=target.detailName;
    if(p.__linked_brand_parent){const original=products.find(row=>productId(row)===productId(p));if(original)p={...original,__linked_brand_parent:p.__linked_brand_parent};}
    window.dispatchEvent(detailName
      ? new CustomEvent("ruru-edit-quick-product-detail", { detail: { product: p, detailName } })
      : new CustomEvent("ruru-edit-quick-product", { detail: p }));
    onClose();
  };

  // 복제: 기존 수정 이벤트 재사용하되 id 계열 제거 → 등록 폼이 "신규 모드 + 값 프리필"로 열림.
  // 저장 버튼 누르기 전에는 아무것도 생성되지 않음(위험 0). 고정(is_pinned)은 복제 안 함.
  const duplicateProduct = (p: ProductRow) => {
    const copy = { ...(p as Record<string, unknown>) };
    delete copy.id;
    delete copy.product_id;
    delete copy.uuid;
    delete copy.created_at;
    delete copy.updated_at;
    copy.pinned = false;
    const newName = `${productName(p)} 복사`;
    copy.product_name = newName;
    copy.name = newName;
    copy.title = newName;
    window.dispatchEvent(new CustomEvent("ruru-edit-quick-product", { detail: copy }));
    onClose();
  };

  // 재고 임박 표시용 (읽기 전용): product_note가 있고 재고관리 중일 때만 products.stock 반환
  const lowStockOf = (p: ProductRow): number | null => {
    try {
      const raw = (p as Record<string, unknown>).product_note;
      if (!raw) return null;
      const note = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!note || typeof note !== "object") return null;
      if ((note as { stock_management_enabled?: boolean }).stock_management_enabled === false) return null;
      const n = Number((p as Record<string, unknown>).stock);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  // 재고 메타 (읽기 전용): 재고관리 여부 / 옵션 유무 / 현재 stock
  const stockMetaOf = (p: ProductRow): { managed: boolean; hasVariants: boolean; stock: number | null } => {
    try {
      const raw = (p as Record<string, unknown>).product_note;
      if (!raw) return { managed: false, hasVariants: false, stock: null };
      const note = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!note || typeof note !== "object") return { managed: false, hasVariants: false, stock: null };
      const managed = (note as { stock_management_enabled?: boolean }).stock_management_enabled !== false;
      const variants = (note as { stock_variants?: unknown }).stock_variants;
      const hasVariants = Array.isArray(variants) && variants.length > 0;
      const n = Number((p as Record<string, unknown>).stock);
      return { managed, hasVariants, stock: Number.isFinite(n) ? n : null };
    } catch {
      return { managed: false, hasVariants: false, stock: null };
    }
  };

  // 인라인 재고 수정 (전체 상품 탭 · "옵션 없는(총재고) 상품"만 허용)
  // 옵션 상품은 products.stock이 product_note에서 파생(트리거 동기화)이라 직접 수정 시 desync → 수정 폼으로 유도.
  // 트리거(ruru_products_inventory_variants_sync_trg)는 product_note 변경 시에만 동작하므로 이 update로는 안 돎(확인됨).
  const [inlineStockId, setInlineStockId] = useState("");
  const [inlineStockText, setInlineStockText] = useState("");
  const [inlineStockSaving, setInlineStockSaving] = useState(false);

  const saveInlineStock = async (p: ProductRow) => {
    const id = productId(p);
    if (!id || inlineStockSaving) return;
    const m = stockMetaOf(p);
    if (!m.managed || m.hasVariants) {
      setInlineStockId("");
      return; // 가드: 옵션 상품/재고관리 OFF는 인라인 수정 금지
    }
    const n = Math.max(0, Number(inlineStockText || "0") || 0);
    setInlineStockSaving(true);
    try {
      // 폼 저장·트리거와 동일 세트(stock + is_soldout)로 일관성 유지
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { stock: n, is_soldout: n <= 0 }, filters: [{ type: "eq", col: "id", val: id }] });
      if (error) throw error;
      setInlineStockId("");
      await loadProducts();
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`재고를 ${n}개로 변경했어요.`, "success");
    } catch (e) {
      showAdminToast("재고 변경 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setInlineStockSaving(false);
    }
  };

  const deleteProduct = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    const okDel = await showAdminConfirm(`"${productName(p)}" 상품을 삭제할까요?\n\n숨김 처리됩니다 (복구 가능)`, { title: "상품 삭제", confirmText: "삭제", cancelText: "취소", tone: "danger" });
    if (!okDel) return;
    // 소프트 삭제 마커 = status:"deleted".
    //   관리자 목록(status==="deleted" 제외)·고객 목록(app/order: status!=="deleted") 양쪽 모두 이 마커로 숨김.
    //   과거엔 is_visible도 함께 update했는데, is_visible 컬럼이 없으면 update 전체가 실패(=숨김 실패 [object Object]).
    //   status 하나로 양쪽 다 숨겨지므로 status만 업데이트(불필요한 컬럼 제거로 실패 원인 차단).
    const { error } = await adminCatalogWrite({
      table: "products",
      op: "update",
      values: { status: "deleted" },
      filters: [{ type: "eq", col: "id", val: id }],
    });
    if (error) {
      showAdminToast("상품 숨김 처리 실패\n\n" + (error.message || JSON.stringify(error)), "error");
      return;
    }
    showAdminToast("상품을 숨김 처리했어요. (복구 가능)", "success");
    window.dispatchEvent(new Event("ruru-live-product-updated"));
    await loadProducts();
  };

  // --- 위젯 설정 / 주소 복사 ---
  const copyWidgetUrl = async () => {
    try {
      const url = `${window.location.origin}/product-widget`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showAdminToast("복사 실패 — 주소창에서 직접 복사해주세요.", "warning");
    }
  };

  const openWidgetSettings = () => {
    setWsSelected(new Set());
    setWidgetSettingsOpen(true);
  };
  const wsToggle = (id: string) => {
    if (!id) return;
    setWsSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const wsAllIds = useMemo(() => products.map(productId).filter(Boolean), [products]);
  const wsAllChecked = wsAllIds.length > 0 && wsAllIds.every((id) => wsSelected.has(id));
  const wsToggleAll = () => setWsSelected((prev) => prev.size >= wsAllIds.length ? new Set() : new Set(wsAllIds));

  const wsAddToRotation = async () => {
    const ids = [...wsSelected].filter(Boolean);
    if (ids.length === 0) return;
    if (!activeBroadcastId) { showAdminToast("진행 중인 방송이 없습니다.", "warning"); return; }
    setWsSaving(true);
    try {
      const { data: existingRows } = await supabase.from("broadcast_products").select("product_id").eq("broadcast_id", activeBroadcastId);
      const existing = new Set(((existingRows as Array<{ product_id: unknown }> | null) || []).map((r) => String(r.product_id)));
      const toInsert = ids.filter((id) => !existing.has(id));
      for (const id of toInsert) {
        const { error } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: { broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 } });
        if (error) throw error;
      }
      setRotationIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`방송 순환에 ${toInsert.length}개 담았어요.${ids.length - toInsert.length > 0 ? ` (이미 담긴 ${ids.length - toInsert.length}개 제외)` : ""}`, "success");
      setWsSelected(new Set()); setWidgetSettingsOpen(false);
    } catch (e) { showAdminToast("방송에 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error"); }
    finally { setWsSaving(false); }
  };
  const wsConfirm = () => void wsAddToRotation();

  if (typeof document === "undefined") return null;

  const chipBase: React.CSSProperties = { padding: "4px 12px", borderRadius: "16px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid var(--color-rose-line)" };

  const popupTree = (
    <div
      className={(typeof document !== "undefined" && document.querySelector(".dark") ? "dark " : "") + "ruru-product-sian"}
      style={embedded ? { width: "100%", height: "100%" } : { position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: "16px" }}
      onClick={embedded ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={embedded
        ? { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--color-surface)", overflow: "hidden" }
        : { width: "960px", maxWidth: "100%", flexShrink: 0, height: "680px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", overflow: "hidden" }}>
        {/* 헤더 */}
        {headerTarget && createPortal(<ProductToolbar tab={tab} onTab={setTab} onCreate={openCreate} />,headerTarget)}
        {!embedded && <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
          <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--color-rose-deep)" }}>상품 관리</span>
          <button type="button" onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", marginLeft: "8px" }}>+ 상품 등록</button>
          {embedded ? null : <button type="button" onClick={onClose} style={{ marginLeft: "8px", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>}
        </div>}

        {/* 탭 2개 */}
        {/* [2026-09-20 사장님 폰 화면 깨짐] 「방송 상\n품」처럼 탭 글자가 잘렸다 → 줄바꿈 금지 + 넘치면 가로 스크롤 */}
        {embedded && !headerTarget && <ProductToolbar tab={tab} onTab={setTab} onCreate={openCreate} />}
        {!embedded && <div style={{ display: "flex", gap: "2px", padding: "0 16px", borderBottom: "1px solid var(--color-line)", overflowX: "auto", scrollbarWidth: "none" }}>
          {([["broadcast", "방송 상품"], ["shop", "쇼핑몰 상품"], ["products", "전체 상품"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className="min-h-11 md:min-h-9"
              style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", fontSize: "13px", fontWeight: 800, background: "none", border: "none", borderBottom: "2px solid " + (tab === k ? "var(--color-rose-deep)" : "transparent"), color: tab === k ? "var(--color-rose-deep)" : "var(--color-ink-soft)", cursor: "pointer" }}
            >
              {l}
            </button>
          ))}
        </div>}

        {tab === "broadcast" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isNarrow ? "column" : "row", gap: "12px", padding: "12px 16px 16px" }}>
            {/* 좌측: 방송 목록 */}
            <div style={{ width: isNarrow ? "100%" : "260px", flexShrink: 0, ...(isNarrow && bcListOpen ? { maxHeight: "210px" } : {}), display: "flex", flexDirection: "column", border: "1px solid var(--color-line)", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderBottom: "1px solid var(--color-line)" }}>
                <span
                  onClick={isNarrow ? () => setBcListOpen((v) => !v) : undefined}
                  style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)", cursor: isNarrow ? "pointer" : "default" }}
                >
                  방송 목록
                  {isNarrow ? <span style={{ fontSize: "11px" }}>{bcListOpen ? "▲" : "▼"}</span> : null}
                  {isNarrow && !bcListOpen ? (
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>· {bcList.find((b) => b.id === bcSelId)?.title ?? "방송 선택"}</span>
                  ) : null}
                </span>
                <button type="button" disabled={bcBusy} onClick={() => { setNewBcTitle(""); setNewBcCopyIds(null); setNewBcOpen(true); }} style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "8px", padding: "4px 8px", cursor: bcPinBusy ? "wait" : "pointer", opacity: bcBusy ? 0.5 : 1 }}>+ 새 방송</button>
              </div>
              {(!isNarrow || bcListOpen) ? (
                <div style={{ padding: "6px 12px 8px", borderBottom: "1px solid var(--color-line)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* 방송 이름 검색 (표시 전용 필터) */}
                  <input
                    type="text"
                    value={bcSearch}
                    onChange={(e) => setBcSearch(e.target.value)}
                    placeholder="방송 이름 검색"
                    style={{ width: "100%", height: "28px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "11px", fontWeight: 700, padding: "0 8px" }}
                  />
                  {/* 기간 프리셋 칩 */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {([
                      { key: "recent30", label: "최근 30일" },
                      { key: "recent90", label: "최근 3개월" },
                      { key: "all", label: "전체" },
                      { key: "custom", label: "기간 선택" },
                    ] as const).map((o) => {
                      const active = bcDateFilter === o.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => setBcDateFilter(o.key)}
                          style={{ fontSize: "11px", fontWeight: 800, borderRadius: "999px", padding: "4px 8px", cursor: "pointer", border: active ? "1px solid var(--color-rose-deep)" : "1px solid var(--color-line)", background: active ? "var(--color-rose-deep)" : "var(--color-surface)", color: active ? "#fff" : "var(--color-ink-soft)" }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* 기간 선택: 시작 ~ 종료 (started_at 기준) */}
                  {bcDateFilter === "custom" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input type="date" value={bcCustomFrom} onChange={(e) => setBcCustomFrom(e.target.value)} style={{ flex: 1, minWidth: 0, height: "28px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "11px", fontWeight: 700, padding: "0 4px" }} />
                      <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>~</span>
                      <input type="date" value={bcCustomTo} onChange={(e) => setBcCustomTo(e.target.value)} style={{ flex: 1, minWidth: 0, height: "28px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "11px", fontWeight: 700, padding: "0 4px" }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(!isNarrow || bcListOpen) && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {bcLoading ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>불러오는 중…</div>
                ) : bcList.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 800, color: "var(--color-ink-soft)" }}>방송 없음 — 방송 시작 후 생김</div></div>
                ) : bcListView.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700, lineHeight: 1.6 }}>조건에 맞는 방송이 없습니다.<br /><span style={{ fontSize: "11px" }}>기간을 「전체」로 바꾸거나 검색어를 지워보세요.</span></div>
                ) : (
                  bcListView.map((b) => {
                    const on = b.id === bcSelId;
                    const isOn = String(b.status || "").toUpperCase() === "ON";
                    const d = new Date(b.started_at);
                    const dateLabel = Number.isNaN(d.getTime()) ? "-" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                    return (
                      <button type="button" key={b.id} className="group" onClick={() => { setBcSelId(b.id); if (isNarrow) setBcListOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--color-line)", background: on ? "var(--color-rose-soft)" : "var(--color-surface)", cursor: "pointer", border: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {isOn ? <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, padding: "1px 6px", borderRadius: "4px", background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" }}>ON</span> : null}
                          <span style={{ flex: 1, minWidth: 0, fontSize: "12px", fontWeight: 800, color: on ? "var(--color-rose-deep)" : "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                          {/* 켜진 방송(isOn)은 숨기기 불가 — 가드: span 자체를 렌더하지 않음 */}
                          {!isOn ? (
                            <span
                              role="button"
                              title="목록에서 숨기기"
                              onClick={(e) => { e.stopPropagation(); void handleHideBroadcast(b); }}
                              className={`shrink-0 rounded text-ink-mute transition hover:text-ink-soft hover:bg-surface-2 ${isNarrow ? "" : "opacity-0 group-hover:opacity-100"}`}
                              style={{ fontSize: "11px", fontWeight: 800, borderRadius: "4px", padding: "1px 6px", cursor: bcBusy ? "default" : "pointer" }}
                            >
                              숨기기
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-ink-soft)", marginTop: "2px" }}>{dateLabel}</div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            </div>
            {/* 우측: 선택 방송의 진열 상품 (sort_order순, 읽기 전용) */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid var(--color-line)", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderBottom: "1px solid var(--color-line)" }}>
                <span style={TAB_TITLE_STYLE}>방송 상품 {bcProducts.length}개</span>
                {bcSelId && bcProducts.length > 0 ? (
                  <select
                    value={bcSort}
                    onChange={(e) => setBcSort(e.target.value as ProductSortKey)}
                    title="보기 순서만 바꿈(저장 안 됨)"
                    style={{ ...TAB_SORT_STYLE, marginLeft: "auto" }}
                  >
                    {PRODUCT_SORT_OPTIONS.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                ) : null}
                {bcSelId && bcProducts.length > 0 ? (
                  <button type="button" disabled={bcBusy} onClick={() => { setBcCopyMode((v) => !v); setBcCopySel(new Set()); }} style={{ height: "36px", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", background: bcCopyMode ? "var(--color-surface-2)" : "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "0 12px", cursor: bcPinBusy ? "wait" : "pointer", opacity: bcBusy ? 0.5 : 1 }}>{bcCopyMode ? "선택 취소" : "선택 복사"}</button>
                ) : null}
                <button type="button" disabled={!bcSelId || bcBusy} onClick={openBcPicker} style={{ marginLeft: bcSelId && bcProducts.length > 0 ? undefined : "auto", height: "36px", fontSize: "13px", fontWeight: 700, color: "#fff", background: "var(--color-ink)", border: "none", borderRadius: "8px", padding: "0 12px", cursor: !bcSelId || bcBusy ? "not-allowed" : "pointer", opacity: !bcSelId || bcBusy ? 0.5 : 1 }}>+ 담기</button>
              </div>
              <div style={{ padding: "8px 12px 0" }}>
                {/* [2026-10-21 a2-10] 위젯 순환 = 한 줄 메뉴 + 줄 체크박스. 옛 「순환·고정 기록」 큰 상자(WidgetProductLibraryPanel) 는 이 탭에서 뺌(파일 보존). */}
                {!bcCopyMode && bcSelId && bcProducts.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "0 0 8px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", cursor: "pointer", userSelect: "none" }}>
                      <input type="checkbox" checked={bcAllPids.length > 0 && bcRotSel.size === bcAllPids.length} onChange={(e) => setBcRotSel(e.target.checked ? new Set(bcAllPids) : new Set())} style={{ width: "16px", height: "16px", accentColor: "var(--color-ink)", cursor: "pointer" }} />
                      전체
                    </label>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-ink-soft)" }}>방송 화면 순환</span>
                    <select
                      value={widgetRotation.mode}
                      disabled={!rotationLive}
                      title={rotationLive ? "방송 화면 위젯에 순환시킬 상품 범위" : "진행 중인 방송에서만 바꿀 수 있어요"}
                      onChange={(e) => { const v = e.target.value; if (v === "all") void rotationUseAll(); else if (v === "selected") void rotationAddChecked(); }}
                      style={{ ...TAB_SORT_STYLE, opacity: rotationLive ? 1 : 0.5, cursor: rotationLive ? "pointer" : "not-allowed" }}
                    >
                      <option value="all">전체 상품 {bcAllPids.length}개</option>
                      <option value="selected" disabled={widgetRotation.mode !== "selected" && bcRotSel.size === 0}>{widgetRotation.mode === "selected" ? `체크한 상품만 ${rotationSelectedCount}개` : bcRotSel.size > 0 ? `체크한 상품만 ${bcRotSel.size}개` : "체크한 상품만 (먼저 체크)"}</option>
                      {widgetRotation.mode === "history" ? <option value="history">소개했던 상품만 {rotationSelectedCount}개 (예전 설정)</option> : null}
                    </select>
                    <button type="button" disabled={!rotationLive} onClick={() => void toggleWidgetLibraryPause()} title={widgetRotation.paused ? "순환을 다시 돌립니다" : "순환을 잠시 멈춥니다(지금 상품에 머묾)"} style={{ ...rowBtn, height: "36px", opacity: rotationLive ? 1 : 0.5, cursor: rotationLive ? "pointer" : "not-allowed" }}>{widgetRotation.paused ? "순환 재개" : "순환 멈춤"}</button>
                    {widgetRotation.paused ? <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-danger-tx)" }}>멈춤 상태</span> : null}
                    {bcRotSel.size > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginLeft: "auto" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-ink)" }}>{bcRotSel.size}개 체크</span>
                        <button type="button" disabled={!rotationLive} onClick={() => void rotationAddChecked()} style={{ ...rowBtnPrimary, opacity: rotationLive ? 1 : 0.5 }}>{widgetRotation.mode === "all" ? "체크한 것만 순환" : "순환에 넣기"}</button>
                        <button type="button" disabled={!rotationLive} onClick={() => void rotationRemoveChecked()} style={{ ...rowBtn, opacity: rotationLive ? 1 : 0.5 }}>순환에서 빼기</button>
                        <button type="button" onClick={() => setBcRotSel(new Set())} style={rowBtn}>체크 해제</button>
                      </div>
                    ) : (
                      widgetHistory.length > 0 ? <button type="button" onClick={() => setBcRotSel(new Set(bcAllPids.filter((pid) => widgetHistory.some((entry) => String(entry.productId) === pid))))} title="전에 「소개」를 눌렀던 상품을 전부 체크" style={{ ...rowBtn, marginLeft: "auto" }}>소개했던 상품 체크</button> : null
                    )}
                  </div>
                ) : null}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 검색" style={TAB_SEARCH_STYLE} />
                {bcSelId && bcProducts.length > 0 && !bcDragEnabled && !bcCopyMode ? (
                  <div style={{ margin: "0 0 8px", padding: "6px 8px", borderRadius: "8px", background: "var(--color-warn-bg)", color: "var(--color-ink-soft)", fontSize: "11px", fontWeight: 700, lineHeight: 1.4 }}>
                    {search.trim() ? "검색 중에는 순서를 바꿀 수 없어요. 검색어를 지워주세요." : "순서를 바꾸려면 정렬을 「진열 순서 (드래그)」로 두세요. (지금은 보기만 바뀐 상태 — 저장된 순서는 그대로)"}
                  </div>
                ) : null}
              </div>
              {bcCopyMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px 8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={bcProducts.length > 0 && bcCopySel.size === bcProducts.length}
                      onChange={(e) => setBcCopySel(e.target.checked ? new Set(bcProducts.map((p) => productId(p)).filter(Boolean)) : new Set())}
                      style={{ width: "15px", height: "15px", accentColor: "var(--color-rose-deep)", cursor: "pointer" }}
                    />
                    전체선택
                  </label>
                  <button type="button" disabled={bcCopySel.size === 0 || bcBusy} onClick={openNewBcWithCopy} style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "8px", padding: "6px 12px", cursor: bcCopySel.size === 0 || bcBusy ? "not-allowed" : "pointer", opacity: bcCopySel.size === 0 || bcBusy ? 0.5 : 1 }}>선택 {bcCopySel.size}개 → 새 방송으로 복사</button>
                </div>
              ) : null}
              {/* [2026-08-29 사장님 지시] 고정 중일 때 글씨로만 알려주니, 해제하려면 검색어를 다시 쳐서
                  그 상품을 찾아 내려가야 했다. → 고정된 상품을 여기에 그대로 보여주고
                  [📢 채팅] [📌 해제] 를 바로 누를 수 있게 한다. 검색 중이어도 항상 보인다. */}
              {(() => {
                if (bcWidgetPin.mode !== "pin") {
                  return null;
                }
                const pinnedRow = findBroadcastProduct(bcWidgetPin.productId);
                const pinnedDetail = pinnedRow && bcWidgetPin.detailName
                  ? detailProducts(pinnedRow, { includeHidden: true }).find((d) => d.detailName === bcWidgetPin.detailName)
                  : undefined;
                const pinnedImg = pinnedDetail?.image || (pinnedRow ? mainImage(pinnedRow) : "");
                const pinnedTitle = pinnedDetail?.detailName || bcWidgetPin.detailName || (pinnedRow ? productName(pinnedRow) : "고정된 상품");
                const pinnedPrice = pinnedDetail
                  ? `${pinnedDetail.price.toLocaleString("ko-KR")}원`
                  : pinnedRow ? productPriceLabel(pinnedRow) : "";
                const pinnedOption = pinnedDetail
                  ? [pinnedDetail.colors.length ? `색상 ${pinnedDetail.colors.join(",")}` : "", pinnedDetail.sizes.length ? `사이즈 ${pinnedDetail.sizes.join(",")}` : ""].filter(Boolean).join(" · ")
                  : "";
                // [2026-09-19] 지난 방송(OFF)에 남은 고정은 손님 화면과 무관 — 위젯은 ON 방송 고정값만 읽는다. 문구로 거짓말하지 않는다.
                const pinIsLive = Boolean(widgetPinTargetBroadcastId(bcSelId, activeBroadcastId));
                return (
                  <div style={{ margin: "0 12px 8px", border: "2px solid var(--color-rose-deep)", borderRadius: "8px", background: "var(--color-rose-soft)", overflow: "hidden" }}>
                    <div style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 900, color: "var(--color-rose-deep)", borderBottom: "1px solid var(--color-rose-line)" }}>
                      {pinIsLive ? "지금 소개 중 — 방송 화면에 이 상품만 보여요" : "지난 방송에서 소개했던 기록 — 지금 방송과 무관 (소개 끝으로 정리)"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px" }}>
                      <span
                        onClick={() => { if (pinnedImg) setLightbox(pinnedImg); }}
                        style={{ width: "46px", height: "46px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: pinnedImg ? "zoom-in" : "default" }}
                      >
                        {pinnedImg ? <img src={pinnedImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 900, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedTitle}</div>
                        {pinnedPrice ? <div style={{ fontSize: "12px", fontWeight: 900, color: "var(--color-rose-deep)", marginTop: "2px" }}>{pinnedPrice}</div> : null}
                        {pinnedOption ? <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedOption}</div> : null}
                        {!pinnedRow ? <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)", marginTop: "1px" }}>이 방송 상품 목록에 없는 상품이에요</div> : null}
                      </div>
                      {pinnedRow ? (
                        <button
                          type="button"
                          onClick={() => void setChatCurrentAndCopy(pinnedRow, pinnedDetail)}
                          title="이 상품 안내글을 복사합니다"
                          style={rowBtn}
                        >안내문 복사</button>
                      ) : null}
                      {/* [2026-09-19 사장님] 「고정 상태에서는 왜 상품 수정이 안 돼?」 — 고정 상품 줄은 목록에서 빠지는데(08-29 중복 방지)
                          이 카드엔 [수정]이 없어 닿을 수 없었다. 목록 줄과 같은 editProduct. */}
                      {pinnedRow ? (
                        <button
                          type="button"
                          onClick={() => editProduct(pinnedRow)}
                          title="이 상품 정보를 수정합니다"
                          style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-surface)", border: "1px solid var(--color-rose-line)", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}
                        >수정</button>
                      ) : null}
                      <button
                        type="button"
                        disabled={bcPinBusy}
                        onClick={() => void clearBroadcastPin()}
                        title="소개를 끝내고 방송 화면을 다시 자동 순환으로"
                        style={{ flexShrink: 0, fontSize: "11px", fontWeight: 900, color: "#fff", background: "var(--color-rose-deep)", border: "1px solid var(--color-rose-deep)", borderRadius: "8px", padding: "6px 8px", cursor: bcPinBusy ? "wait" : "pointer", opacity: bcPinBusy ? 0.6 : 1 }}
                      >{bcPinBusy ? "정리 중…" : "소개 끝"}</button>
                    </div>
                  </div>
                );
              })()}
              <div
                ref={bcScrollRef}
                onDragOver={handleBcDragAutoScroll}
                onDrop={stopBcAutoScroll}
                onDragEnd={stopBcAutoScroll}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) stopBcAutoScroll(); }}
                style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" }}
              >
                {!bcSelId ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>방송을 선택하세요.</div>
                ) : bcProducts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 800, color: "var(--color-ink-soft)" }}>진열된 상품 없음 — 아래에서 골라 「진열」</div></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {bcProductsView.filter(p=>{
                      const link=brandCatalog.bySourceId.get(productId(p));
                      return !link || !bcProductsView.some(parent=>productId(parent)===link.parentId);
                    }).filter(nameMatch).map((p, i) => {
                      const img = mainImage(p);
                      const pid = productId(p);
                      const allDetails = (brandCatalog.detailsByParent.get(pid) ?? detailProducts(p, { includeHidden: false })).filter(detail=>!detail.hidden);
                      const matchedDetails = search.trim() ? searchBrandDetails(brandCatalog,pid,search) : [];
                      const isBrandFolder = allDetails.length > 0;
                      const expanded = isBrandFolder && (bcExpanded.has(pid) || matchedDetails.length > 0);
                      const detailRows = matchedDetails.length > 0 ? matchedDetails.filter((detail) => !detail.hidden) : allDetails;
                      const parentPinned = !isBrandFolder && isBroadcastPinned(pid, "");
                      // [2026-10-21 a2-10 사장님] 「해당 상품줄에 고정중·순환중 표시가 보이게」 — 08-29 「목록에서 뺀다」 규칙은 이걸로 대체.
                      //   맨 위 소개 카드(안내문 복사·소개 끝)는 그대로, 줄에도 「소개 중」 배지 + 버튼은 「소개 끝」.
                      const rowHidden = isProductHidden(p);
                      const rowRotBadge = parentPinned ? "소개 중" : widgetRotation.mode === "all" ? "" : rotationIncludedPids.has(pid) ? "순환" : "순환 제외";
                      return (
                        <div key={pid || i} draggable={bcDragEnabled}
                          onClick={bcCopyMode && pid ? () => toggleBcCopyPick(pid) : undefined}
                          onDragStart={() => { setBcDragPid(pid); setBcDragOver(i); }}
                          onDragOver={(e) => { e.preventDefault(); if (bcDragOver !== i) setBcDragOver(i); }}
                          onDrop={(e) => { e.preventDefault(); if (bcDragPid) reorderBcByPid(bcDragPid, pid); setBcDragPid(null); setBcDragOver(null); }}
                          onDragEnd={() => { setBcDragPid(null); setBcDragOver(null); }}
                          style={{ border: bcCopyMode && bcCopySel.has(pid) ? "1px solid var(--color-rose-deep)" : "1px solid var(--color-line)", borderRadius: "8px", background: bcCopyMode && bcCopySel.has(pid) ? "var(--color-rose-soft)" : bcDragPid !== null && bcDragOver === i && bcDragPid !== pid ? "var(--color-warn-bg)" : "var(--color-surface)", opacity: bcDragPid === pid ? 0.4 : 1, overflow: "hidden", cursor: bcCopyMode ? "pointer" : !bcDragEnabled ? "default" : "grab" }}>
                          {/* [2026-10-22 폰] 좁은 화면은 줄바꿈 허용 — 1줄 [끌기·체크·번호·사진·상품명(2줄)·가격] / 2줄 [버튼들]. PC 는 한 줄 그대로 */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", flexWrap: isNarrow ? "wrap" : "nowrap", rowGap: isNarrow ? "8px" : undefined }}>
                            {bcCopyMode ? <input type="checkbox" checked={bcCopySel.has(pid)} onChange={() => toggleBcCopyPick(pid)} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, width: "16px", height: "16px", accentColor: "var(--color-rose-deep)", cursor: "pointer" }} /> : <span style={{ flexShrink: 0, fontSize: "14px", color: bcDragEnabled ? "var(--color-ink-mute)" : "var(--color-line)", userSelect: "none" }}>⠿</span>}
                            {!bcCopyMode ? <input type="checkbox" aria-label={`${productName(p)} 순환 체크`} checked={bcRotSel.has(pid)} onChange={() => toggleRotSel(pid)} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, width: "16px", height: "16px", accentColor: "var(--color-ink)", cursor: "pointer" }} /> : null}
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", width: "20px", textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                            {rowHidden ? <span title="손님 화면에서 숨긴 상품" aria-label="숨김" style={{ flexShrink: 0, display: "inline-flex" }}>{HIDDEN_EYE_ICON}</span> : null}
                            <span onClick={(e) => { e.stopPropagation(); if (img) setLightbox(img); }} style={{ width: "48px", height: "48px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "zoom-in" : "default", opacity: rowHidden ? 0.45 : 1 }}>{img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
                            <div style={{ flex: 1, minWidth: isNarrow ? "50%" : 0, opacity: rowHidden ? 0.55 : 1 }}><div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}><span style={isNarrow ? { fontSize: "14px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" } : { fontSize: "13px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>{rowRotBadge ? <span style={rowRotBadge === "소개 중" ? ROT_BADGE_LIVE : rowRotBadge === "순환" ? ROT_BADGE_ON : ROT_BADGE_OFF}>{rowRotBadge}</span> : null}</div><div style={{ fontSize: "11px", fontWeight: 800, color: isBrandFolder ? "var(--color-ink-soft)" : "var(--color-rose-deep)", marginTop: "2px" }}>{isBrandFolder ? `브랜드 그룹 · 세부상품 ${allDetails.length}개` : productPriceLabel(p)}</div></div>
                            {isBrandFolder && !bcCopyMode ? <button type="button" onClick={(e) => { e.stopPropagation(); setBcExpanded((prev) => { const next = new Set(prev); if (next.has(pid)) next.delete(pid); else next.add(pid); return next; }); }} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}>{expanded ? "접기" : "세부상품"}</button> : null}
                            {/* [2026-10-21 a2-6] 줄 버튼 = [소개/소개 중][숨기기/보이기][수정][빼기]. 「방송」(고정+채팅 현재상품+안내문 복사)=소개, 📌고정·채팅 단독 버튼은 소개에 포함돼 뺌. 핸들러는 기존 그대로. */}
                            {!isBrandFolder && !bcCopyMode ? (parentPinned
                              ? <button type="button" disabled={bcPinBusy} onClick={(e) => { e.stopPropagation(); void clearBroadcastPin(); }} title="소개를 끝내고 방송 화면을 다시 자동 순환으로" style={rowBtnPrimary}>{bcPinBusy ? "정리 중…" : "소개 끝"}</button>
                              : <button type="button" disabled={bcPinBusy} onClick={(e) => { e.stopPropagation(); void broadcastOneClick(p); }} title="방송 화면에 이 상품만 띄우고 안내문을 복사" style={rowBtn}>소개</button>) : null}
                            {!bcCopyMode ? <button type="button" disabled={hideBusyId === pid || !canToggleHidden(p)} onClick={(e) => { e.stopPropagation(); void toggleProductHidden(p); }} title={isProductHidden(p) ? "손님 화면에 다시 보이기" : "손님 화면 전체에서 숨기기(이 목록엔 남음)"} style={rowBtn}>{isProductHidden(p) ? "보이기" : "숨기기"}</button> : null}
                            <button type="button" onClick={(e) => { e.stopPropagation(); editProduct(p); }} style={rowBtn}>수정</button>
                            <button type="button" disabled={bcBusy} onClick={(e) => { e.stopPropagation(); void removeBcProduct(pid); }} title="이 방송 목록에서만 뺌(상품은 남음)" style={{ ...rowBtnDanger, opacity: bcBusy ? 0.6 : 1 }}>빼기</button>
                          </div>
                          {isBrandFolder && expanded ? <div style={{ borderTop: "1px solid var(--color-line)", padding: "8px", background: "var(--color-surface-2)", display: "flex", flexDirection: "column", gap: "6px" }}>{detailRows.map((detail) => { const pinned=isBroadcastPinned(pid,detail.detailName); const optionText=[detail.colors.length?`색상 ${detail.colors.join(",")}`:"",detail.sizes.length?`사이즈 ${detail.sizes.join(",")}`:""].filter(Boolean).join(" · ")||"옵션 없음"; return <div key={broadcastPinKey(pid,detail.detailName)} style={{ display:"grid",gridTemplateColumns:"44px minmax(0,1fr) auto auto",gap:"8px",alignItems:"center",border:pinned?"2px solid var(--color-rose-deep)":"1px solid var(--color-line)",borderRadius:"8px",padding:"8px",background:pinned?"var(--color-rose-soft)":"var(--color-surface)" }}><button type="button" onClick={()=>detail.image&&setLightbox(detail.image)} style={{width:42,height:42,border:0,borderRadius:7,overflow:"hidden",padding:0,background:"var(--color-surface-2)"}}>{detail.image?<img src={detail.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:null}</button><div style={{minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:"6px",minWidth:0}}><span style={{fontSize:"12px",fontWeight:900,color:"var(--color-ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail.detailName}</span>{pinned?<span style={ROT_BADGE_LIVE}>소개 중</span>:null}</div><div style={{fontSize:"11px",fontWeight:800,color:"var(--color-rose-deep)",marginTop:2}}>{detail.price.toLocaleString("ko-KR")}원</div><div style={{fontSize:"11px",fontWeight:700,color:"var(--color-ink-soft)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{optionText}{detail.stockManaged&&detail.stock!==null?` · 재고 ${detail.stock}`:""}</div></div>{pinned?<button type="button" disabled={bcPinBusy} onClick={()=>void clearBroadcastPin()} title="소개를 끝내고 방송 화면을 다시 자동 순환으로" style={rowBtnPrimary}>{bcPinBusy?"정리 중…":"소개 끝"}</button>:<button type="button" disabled={bcPinBusy} onClick={()=>void broadcastOneClick(p,detail)} title="방송 화면에 이 상품만 띄우고 안내문을 복사" style={rowBtn}>소개</button>}<button type="button" aria-label={`${detail.detailName} 수정`} onClick={(event)=>{event.stopPropagation();editProduct(p,detail.detailName);}} style={rowBtn}>수정</button></div>})}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : tab === "shop" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 16px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span style={TAB_TITLE_STYLE}>쇼핑몰 상품 {shopRows.length}개</span>
              {shopRows.length > 0 ? (
                <select
                  value={shopSort}
                  onChange={(e) => setShopSort(e.target.value as ProductSortKey)}
                  title="보기 순서만 바꿈(저장 안 됨)"
                  style={{ ...TAB_SORT_STYLE, marginLeft: "auto" }}
                >
                  {PRODUCT_SORT_OPTIONS.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
                </select>
              ) : null}
              <button type="button" disabled={shopBusy} onClick={openShopPicker} style={{ marginLeft: shopRows.length > 0 ? undefined : "auto", height: "36px", fontSize: "13px", fontWeight: 700, color: "#fff", background: "var(--color-ink)", border: "none", borderRadius: "8px", padding: "0 12px", cursor: shopBusy ? "wait" : "pointer", opacity: shopBusy ? 0.5 : 1 }}>+ 담기</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 검색" style={TAB_SEARCH_STYLE} />
            <div
              ref={shopScrollRef}
              onDragOver={handleShopDragAutoScroll}
              onDrop={stopShopAutoScroll}
              onDragEnd={stopShopAutoScroll}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) stopShopAutoScroll(); }}
              style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              {shopRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 800, color: "var(--color-ink-soft)" }}>진열된 상품이 없습니다.</div><div style={{ fontSize: "12px", marginTop: "4px" }}>손님 화면에 보일 상품을 골라 「진열」을 눌러주세요.</div></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {shopRowsView.filter(nameMatch).map((p, i) => {
                    const img = mainImage(p);
                    const pid = productId(p);
                    return (
                      <div
                        key={pid || i}
                        draggable={shopDragEnabled}
                        onDragStart={() => { setShopDragPid(pid); setShopDragOver(i); }}
                        onDragOver={(e) => { e.preventDefault(); if (shopDragOver !== i) setShopDragOver(i); }}
                        onDrop={(e) => { e.preventDefault(); if (shopDragPid) reorderShopByPid(shopDragPid, pid); setShopDragPid(null); setShopDragOver(null); }}
                        onDragEnd={() => { setShopDragPid(null); setShopDragOver(null); }}
                        style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "8px", background: shopDragPid !== null && shopDragOver === i && shopDragPid !== pid ? "var(--color-warn-bg)" : "var(--color-surface)", opacity: shopDragPid === pid ? 0.4 : 1, boxShadow: shopDragPid !== null && shopDragOver === i && shopDragPid !== pid ? "inset 0 2px 0 var(--color-rose-deep)" : undefined, cursor: !shopDragEnabled ? "default" : "grab" }}
                      >
                        {/* 드래그 핸들 */}
                        <span style={{ flexShrink: 0, fontSize: "14px", color: "var(--color-ink-mute)", userSelect: "none" }} title="드래그로 순서 변경">⠿</span>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", width: "20px", textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); if (img) setLightbox(img); }}
                          title={img ? "클릭하면 크게 보기" : undefined}
                          style={{ width: "56px", height: "56px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "zoom-in" : "default" }}
                        >
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)", marginTop: "2px" }}>{productPriceLabel(p)}</div>
                          {productCategory(p) ? <span style={{ display: "inline-block", marginTop: "4px", fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", background: "var(--color-surface-3)", color: "var(--color-ink-soft)" }}>{productCategory(p)}</span> : null}
                        </div>
                        <button type="button" disabled={hideBusyId === pid || !canToggleHidden(p)} onClick={() => void toggleProductHidden(p)} title={isProductHidden(p) ? "손님 화면에 다시 보이기" : "손님 화면 전체에서 숨기기(이 목록엔 남음)"} style={rowBtn}>{isProductHidden(p) ? "보이기" : "숨기기"}</button>
                        <button type="button" onClick={() => editProduct(p)} style={rowBtn}>수정</button>
                        <button type="button" disabled={shopBusy} onClick={() => void removeFromShop(pid)} title="쇼핑몰 목록에서만 뺌(상품은 남음)" style={{ ...rowBtnDanger, opacity: shopBusy ? 0.6 : 1 }}>빼기</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 머리줄(세 탭 공통 모양): 제목 N개 … 정렬 */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px 8px", flexWrap: "wrap" }}>
              <span style={TAB_TITLE_STYLE}>전체 상품 {filtered.length}개</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as "default" | "latest" | "stock_low")}
                title="보기 순서만 바꿈(저장 안 됨)"
                style={{ ...TAB_SORT_STYLE, marginLeft: "auto" }}
              >
                <option value="latest">최신 등록순</option>
                <option value="default">저장된 순서</option>
                <option value="stock_low">재고 적은순</option>
              </select>
            </div>
            {/* 검색 */}
            <div style={{ padding: "0 16px" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 검색" style={TAB_SEARCH_STYLE} />
            </div>

            {/* 카테고리 칩 */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "0 16px 8px" }}>
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  style={{ ...chipBase, background: category === c.key ? "var(--color-rose-soft)" : "var(--color-surface)", color: category === c.key ? "var(--color-rose-deep)" : "var(--color-ink-soft)", borderColor: category === c.key ? "var(--color-rose-line)" : "var(--color-line)" }}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLowOnly((v) => !v)}
                title="재고관리 중이면서 재고 3개 이하인 상품만"
                style={{ ...chipBase, background: lowOnly ? "var(--color-danger-bg)" : "var(--color-surface)", color: lowOnly ? "var(--color-danger-tx)" : "var(--color-ink-soft)", borderColor: lowOnly ? "var(--color-danger-tx)" : "var(--color-line)" }}
              >
                재고임박
              </button>
            </div>

            <div style={{padding:"0 16px"}}>
              {!loading ? <ProductPagination {...productPagination} size={productPageSize} label="상품 목록 상단 페이지 이동" onPage={changeProductPage} onSize={setProductPageSize} /> : null}
            </div>
            {/* 상품 목록 (페이지별 표시) */}
            <div ref={productListScrollRef} style={{ flex: 1, minHeight: "400px", overflowY: "auto", padding: "0 16px 16px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>불러오는 중…</div>
              ) : visible.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 800, color: "var(--color-ink-soft)" }}>등록된 상품이 없습니다.</div><div style={{ fontSize: "12px", marginTop: "4px" }}>「+ 상품 등록」으로 추가하세요</div></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {visible.map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const state = widgetState(p);
                    const busy = busyId === id;
                    const createdAtLabel = productCreatedAtLabel(p);
                    const widgetStyle: React.CSSProperties = state === "rotating"
                      ? { background: "var(--color-rose-soft)", color: "var(--color-rose-deep)", border: "1px solid var(--color-rose-line)" }
                      : { background: "var(--color-rose-deep)", color: "#fff", border: "none" };
                    const widgetText = state === "rotating" ? "방송에서 빼기" : "+ 방송에 담기";
                    const normalizedQuery = normalizeProductSearchText(search);
                    const parentNameMatched = normalizedQuery ? productSearchMatches(productName(p), normalizedQuery) : false;
                    const linkedDetails = (brandCatalog.detailsByParent.get(id) ?? []).filter(detail => 'sourceProductId' in detail);
                    const matchedDetails = normalizedQuery && !parentNameMatched ? searchBrandDetails(brandCatalog, id, search) : linkedDetails;
                    return (
                      <div key={id || productName(p)} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", border: "1px solid var(--color-line)", borderRadius: "12px", padding: "8px" }}>
                        {/* 사진 88px 클릭 확대 */}
                        <button
                          type="button"
                          onClick={() => img && setLightbox(img)}
                          style={{ width: "88px", height: "88px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", border: "none", padding: 0, cursor: img ? "zoom-in" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </button>

                        {/* 정보 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                          <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{productPriceLabel(p)}{(() => { const c = Number(parseProductNote(p).cost_price); return Number.isFinite(c) && c > 0 ? <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 600, color: "var(--color-ink-mute)" }}>원가 {Math.round(c).toLocaleString("ko-KR")}원</span> : null; })()}</div>
                          {createdAtLabel ? (
                            <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)", fontVariantNumeric: "tabular-nums" }}>
                              등록일시 {createdAtLabel}
                            </div>
                          ) : null}
                          <div style={{ marginTop: "4px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}>{shippingLabel(p)}</span>
                            {productCategory(p) ? <span style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", background: "var(--color-surface-3)", color: "var(--color-ink-soft)" }}>{productCategory(p)}</span> : null}
                            {(() => {
                              const s = lowStockOf(p);
                              if (s === null || s > 3) return null;
                              return <span style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", background: "var(--color-surface-2)", color: "var(--color-danger-tx)" }}>{s <= 0 ? "품절" : `재고 ${s}`}</span>;
                            })()}
                          </div>
                          {/* 재고 표시 + 인라인 수정 (총재고 상품만 · 옵션 상품은 수정 폼 유도) */}
                          {(() => {
                            const m = stockMetaOf(p);
                            if (!m.managed || m.stock === null) return null;
                            if (m.hasVariants) {
                              return (
                                <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>
                                  재고 {m.stock.toLocaleString("ko-KR")}개
                                  <button type="button" onClick={() => editProduct(p)} title="옵션별 재고는 수정 폼에서 변경" style={{ marginLeft: "4px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "2px 8px", cursor: "pointer" }}>옵션별 수정</button>
                                </div>
                              );
                            }
                            if (inlineStockId !== id) {
                              return (
                                <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>
                                  재고 {m.stock.toLocaleString("ko-KR")}개
                                  <button type="button" onClick={() => { setInlineStockId(id); setInlineStockText(String(m.stock)); }} style={{ marginLeft: "4px", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}>수정</button>
                                </div>
                              );
                            }
                            return (
                              <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                                <input
                                  value={inlineStockText}
                                  onChange={(e) => setInlineStockText(e.target.value.replace(/[^0-9]/g, ""))}
                                  inputMode="numeric"
                                  autoFocus
                                  onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") void saveInlineStock(p); if (e.key === "Escape") setInlineStockId(""); }}
                                  style={{ width: "64px", height: "26px", borderRadius: "8px", border: "1px solid var(--color-rose-line)", padding: "0 8px", fontSize: "12px", fontWeight: 800, textAlign: "right", color: "var(--color-ink)", background: "var(--color-surface)" }}
                                />
                                <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>개</span>
                                <button type="button" disabled={inlineStockSaving} onClick={() => void saveInlineStock(p)} style={{ fontSize: "11px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "4px", padding: "4px 8px", cursor: inlineStockSaving ? "wait" : "pointer", opacity: inlineStockSaving ? 0.6 : 1 }}>{inlineStockSaving ? "저장중…" : "저장"}</button>
                                <button type="button" onClick={() => setInlineStockId("")} style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}>취소</button>
                              </div>
                            );
                          })()}
                          {/* 원버튼 위젯 */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onWidgetClick(p)}
                            style={{ marginTop: "8px", height: "28px", borderRadius: "8px", padding: "0 12px", fontSize: "11px", fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1, ...widgetStyle }}
                          >
                            {busy ? "처리중…" : widgetText}
                          </button>
                        </div>

                        {/* 수정 / 삭제 — 오른쪽 끝 나란히 */}
                        <div style={{ display: "flex", flexDirection: "row", gap: "4px", flexShrink: 0, alignSelf: "flex-start" }}>
                          <button type="button" onClick={() => editProduct(p)} style={{ height: "36px", fontSize: "12px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "0 12px", cursor: "pointer" }}>수정</button>
                          <details className="relative">
                            <summary className="min-h-9 cursor-pointer list-none rounded-xl border border-line px-2.5 py-1.5 text-xs font-bold text-ink" aria-label={`${productName(p)} 더보기`}>더보기</summary>
                            <div className="absolute right-0 z-20 flex min-w-28 flex-col gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
                          {!isBrandGroupProduct(p)?<button type="button" onClick={()=>setBrandMove({source:p})} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-ink">브랜드 하위로 이동</button>:null}
                          <button
                            type="button"
                            title="고객 주문 딥링크 복사 — 방송 채팅 고정메시지에 붙이면 고객이 링크 탭 → 이 상품이 바로 열림"
                            onClick={() => {
                              const link = `${window.location.origin}/order?p=${String(p.id)}`;
                              navigator.clipboard?.writeText(link).then(
                                () => showAdminToast(`주문링크 복사됨\n${link}`, "success"),
                                () => showAdminToast("복사 실패 — 직접 복사해주세요\n" + link, "warning"),
                              );
                            }}
                            style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-ink)", background: "transparent", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", textAlign: "left" }}
                          >주문 링크 복사</button>
                          <button type="button" onClick={() => duplicateProduct(p)} title="이 상품 내용으로 새 상품 등록 폼 열기" style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-ink)", background: "transparent", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", textAlign: "left" }}>복제</button>
                          <button type="button" onClick={() => void deleteProduct(p)} style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-danger-tx)", background: "transparent", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", textAlign: "left" }}>삭제</button>
                            </div>
                          </details>
                        </div>
                      </div>
                      {matchedDetails.length > 0 ? (
                        <div style={{ marginLeft: "96px", border: "1px solid var(--color-rose-line)", borderRadius: "8px", overflow: "hidden", background: "var(--color-surface)" }}>
                          <div style={{ padding: "6px 8px", background: "var(--color-rose-soft)", color: "var(--color-rose-deep)", fontSize: "11px", fontWeight: 900 }}>{normalizedQuery && !parentNameMatched ? '세부상품 검색결과' : '연결된 세부상품'} {matchedDetails.length}개</div>
                          {matchedDetails.map((detail) => (
                            <div key={detail.detailName} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 8px", borderTop: "1px solid var(--color-line)" }}>
                              <button type="button" onClick={() => detail.image && setLightbox(detail.image)} style={{ width: "54px", height: "54px", flexShrink: 0, border: "none", borderRadius: "8px", overflow: "hidden", padding: 0, background: "var(--color-surface-2)", cursor: detail.image ? "zoom-in" : "default" }}>
                                {detail.image ? <img src={detail.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 900, color: "var(--color-ink)" }}>{detail.detailName}</span>
                                  {detail.hidden ? <span style={{ padding: "1px 4px", borderRadius: "4px", background: "var(--color-surface-2)", color: "var(--color-ink-mute)", fontSize: "11px", fontWeight: 700 }}>숨김</span> : null}
                                </div>
                                <div style={{ marginTop: "2px", fontSize: "12px", fontWeight: 900, color: "var(--color-rose-deep)" }}>{money(detail.price)}</div>
                                {(detail.colors.length > 0 || detail.sizes.length > 0) ? <div style={{ marginTop: "2px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>{detail.colors.length > 0 ? `색상: ${detail.colors.join(", ")}` : ""}{detail.colors.length > 0 && detail.sizes.length > 0 ? " · " : ""}{detail.sizes.length > 0 ? `사이즈: ${detail.sizes.join(", ")}` : ""}</div> : null}
                              </div>
                              <button type="button" onClick={() => {
                                const source = 'sourceProductId' in detail ? products.find(row => productId(row) === detail.sourceProductId) : p;
                                if (source) editProduct('sourceProductId' in detail ? {...source,__linked_brand_parent:p} : source, 'sourceProductId' in detail ? '' : detail.detailName);
                                else showAdminToast('원본 상품을 확인하지 못했습니다. 새로고침해주세요.', 'error');
                              }} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "4px 8px", cursor: "pointer" }}>세부관리</button>
                              {'sourceProductId' in detail?<button type="button" onClick={()=>{const source=products.find(row=>productId(row)===detail.sourceProductId);if(source)setBrandMove({source,undoParentId:String(p.id)});}} className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-ink-soft">연결 되돌리기</button>:null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {!loading ? <ProductPagination {...productPagination} size={productPageSize} label="상품 목록 하단 페이지 이동" onPage={changeProductPage} onSize={setProductPageSize} /> : null}
            </div>
          </>
        )}
      </div>

      {/* 위젯 설정 (일괄 순환/고정) */}
      {widgetSettingsOpen ? (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setWidgetSettingsOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.5)", padding: "16px" }}
        >
          <div style={{ width: "520px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-rose-deep)" }}>위젯 설정</span>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: "0 16px 8px", fontSize: "11px", color: "var(--color-ink-mute)", fontWeight: 700 }}>
              선택 상품을 방송 순환목록에 담습니다. 정확한 위젯 고정은 방송상품의 세부상품 행에서 합니다.
            </div>

            {/* 전체선택 (고정모드는 단일 선택이라 비활성) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderTop: "1px solid var(--color-surface-2)", borderBottom: "1px solid var(--color-surface-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 800, color: "var(--color-ink-soft)", cursor: "pointer" }}>
                <input type="checkbox" checked={wsAllChecked} onChange={wsToggleAll} />
                전체선택
              </label>
              <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)" }}>✓ {wsSelected.size}개 선택</span>
            </div>

            {/* 상품 목록(개별선택) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px" }}>
              {products.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 800, color: "var(--color-ink-soft)" }}>조건에 맞는 상품이 없습니다.</div><div style={{ fontSize: "12px", marginTop: "4px" }}>위 검색어·필터를 지우면 전체가 보입니다.</div></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {products.map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const checked = wsSelected.has(id);
                    return (
                      <label key={id || productName(p)} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "8px", padding: "8px 8px", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => wsToggle(id)} />
                        <span style={{ width: "34px", height: "34px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                          <span style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>{productPriceLabel(p)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ height: "38px", padding: "0 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)" }}>취소</button>
              <button type="button" onClick={copyWidgetUrl} style={{ height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (copied ? "var(--color-ok-tx)" : "var(--color-line)"), background: copied ? "var(--color-ok-bg)" : "var(--color-surface)", color: copied ? "var(--color-ok-tx)" : "var(--color-ink-soft)", whiteSpace: "nowrap" }}>
                {copied ? "복사됐어요!" : "위젯 주소 복사"}
              </button>
              <button type="button" disabled={wsSaving || wsSelected.size === 0} onClick={wsConfirm} style={{ flex: 1, height: "38px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, cursor: wsSaving || wsSelected.size === 0 ? "default" : "pointer", border: "none", background: wsSaving || wsSelected.size === 0 ? "var(--color-rose-line)" : "var(--color-rose-deep)", color: "#fff" }}>
                {wsSaving ? "처리중…" : `선택 ${wsSelected.size}개 방송에 담기`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 사진 확대 lightbox */}
      {brandMove?<ProductBrandMoveDialog source={brandMove.source} brands={products.filter(isBrandGroupProduct)} undoParentId={brandMove.undoParentId} onClose={()=>setBrandMove(null)} onMoved={()=>{setBrandMove(null);void loadProducts();}} />:null}
      {lightbox ? (
        <div
          onClick={() => setLightbox("")}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
        >
          <img src={lightbox} alt="" style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain", borderRadius: "12px" }} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      {/* 기록 탭 썸네일 확대 보기 */}
      {imagePreviewUrl ? (
        <div
          onClick={() => setImagePreviewUrl("")}
          style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
        >
          <img src={imagePreviewUrl} alt="" style={{ maxWidth: "480px", maxHeight: "480px", objectFit: "contain", borderRadius: "12px" }} />
        </div>
      ) : null}

      {/* 상품 담기 피커 (전체 창고에서 선택 → broadcast_products insert) */}
      {bcPickerOpen ? (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setBcPickerOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.5)", padding: "16px" }}
        >
          <div style={{ width: "520px", maxWidth: "100%", height: "600px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-ink)" }}>방송에 담기</span>
              <button type="button" onClick={() => setBcPickerOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            {/* 불러올 범위: 빠른 칩(전체/오늘·어제 등록) + 등록일·지난 방송 상세 선택 + 검색
                [2026-08-21] 대량등록한 상품을 날짜로 모아 방송에 한 번에 담는 흐름.
                필터는 화면 표시만 거른다 — 담기 저장 경로(broadcast_products insert)는 기존 그대로. */}
            <div style={{ padding: "12px 16px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {([
                  ["all", "전체", -1],
                  ["today", `오늘 등록 ${todayCount}`, todayCount],
                  ["yesterday", `어제 등록 ${yesterdayCount}`, yesterdayCount],
                ] as const).map(([key, label, count]) => {
                  const active = key === "all" ? (!bcPickerDate && !bcPickerFromBcId) : bcPickerDate === (key === "today" ? todayStr : yesterdayStr);
                  const disabled = count === 0;
                  return (
                    <button key={key} type="button" disabled={disabled}
                      onClick={() => {
                        setBcPickerFromBcId(""); setBcPickerFromIds(null);
                        setBcPickerDate(key === "all" ? "" : (key === "today" ? todayStr : yesterdayStr));
                      }}
                      style={{ height: "36px", padding: "0 12px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid " + (active ? "var(--color-ink)" : "var(--color-line)"), background: active ? "var(--color-ink)" : "var(--color-surface)", color: active ? "#fff" : disabled ? "var(--color-ink-mute)" : "var(--color-ink)", opacity: disabled ? 0.45 : 1 }}>
                      {label}
                    </button>
                  );
                })}
                <select
                  value={bcPickerDate && bcPickerDate !== todayStr && bcPickerDate !== yesterdayStr ? bcPickerDate : ""}
                  onChange={(e) => { const v = e.target.value; if (!v) return; setBcPickerFromBcId(""); setBcPickerFromIds(null); setBcPickerDate(v); }}
                  style={{ height: "36px", borderRadius: "999px", border: "1px solid " + (bcPickerDate && bcPickerDate !== todayStr && bcPickerDate !== yesterdayStr ? "var(--color-ink)" : "var(--color-line)"), padding: "0 12px", fontSize: "13px", fontWeight: 700, outline: "none", color: "var(--color-ink)", background: "var(--color-surface)", maxWidth: "180px" }}
                >
                  <option value="">다른 날짜</option>
                  {bcPickerDateGroups.map(([d, n]) => <option key={d} value={d}>{d} 등록 {n}</option>)}
                </select>
                <select
                value={bcPickerFromBcId}
                onChange={(e) => { setBcPickerDate(""); void changeBcPickerFrom(e.target.value); }}
                style={{ height: "36px", borderRadius: "999px", border: "1px solid " + (bcPickerFromBcId ? "var(--color-ink)" : "var(--color-line)"), padding: "0 12px", fontSize: "13px", fontWeight: 700, outline: "none", color: "var(--color-ink)", background: "var(--color-surface)", maxWidth: "200px" }}
              >
                <option value="">지난 방송</option>
                {bcList.filter((b) => b.id !== bcSelId).map((b) => {
                  const d = new Date(b.started_at);
                  const dateLabel = Number.isNaN(d.getTime()) ? "" : ` (${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")})`;
                  return <option key={b.id} value={b.id}>{b.title}{dateLabel}</option>;
                })}
              </select>
              </div>
              <input value={bcPickerSearch} onChange={(e) => setBcPickerSearch(e.target.value)} placeholder="상품명 검색" style={{ width: "100%", height: "36px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "14px", fontWeight: 500, outline: "none", color: "var(--color-ink)" }} />
            </div>
            {/* 목록 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 8px" }}>
              {(() => {
                const q = normalizeProductSearchText(bcPickerSearch);
                const pickList = products.filter((p) => {
                  if (pickString(p, ["status"], "") === "deleted") return false;
                  if (bcPickerFromBcId && bcPickerFromIds && !bcPickerFromIds.has(productId(p))) return false;
                  if (bcPickerDate && productRegDate(p) !== bcPickerDate) return false;
                  // [2026-07-23] 조합형 세부상품명 검색 허용(평소 상품 무변경)
                  if (q && !productSearchMatches(productName(p), q) && !comboNamesMatch(p, bcPickerSearch)) return false;
                  return true;
                });
                if (pickList.length === 0) {
                  return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>{bcPickerDate ? `${bcPickerDate}에 등록한 상품이 없습니다.` : bcPickerFromBcId ? "그 방송에 담았던 상품이 없습니다." : "상품이 없습니다. 「+ 상품 등록」으로 먼저 만들어 주세요."}</div>;
                }
                const selectableIds = pickList.map((p) => productId(p)).filter((pid) => pid && !bcAddedIds.has(pid));
                const alreadyCount = pickList.length - selectableIds.length;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {bcPickerDate ? (
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink-soft)" }}>
                        {bcPickerDate} 등록 {pickList.length}개{alreadyCount > 0 ? ` · 담김 ${alreadyCount}` : ""}
                      </div>
                    ) : null}
                    {(bcPickerFromBcId || bcPickerDate) && selectableIds.length > 0 ? (
                      <button type="button" onClick={() => setBcPickerSel((prev) => new Set([...prev, ...selectableIds]))} style={{ alignSelf: "flex-start", height: "36px", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", padding: "0 12px", cursor: "pointer" }}>{selectableIds.length}개 모두 선택</button>
                    ) : null}
                    {pickList.map((p, i) => {
                      const pid = productId(p);
                      const already = bcAddedIds.has(pid);
                      const checked = bcPickerSel.has(pid);
                      const img = mainImage(p);
                      return (
                        <label key={pid || i} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: already ? "var(--color-surface-2)" : checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "8px", padding: "8px 8px", cursor: already ? "not-allowed" : "pointer", opacity: already ? 0.55 : 1 }}>
                          <input type="checkbox" disabled={already} checked={already || checked} onChange={() => !already && toggleBcPick(pid)} style={{ width: "16px", height: "16px", flexShrink: 0, accentColor: "var(--color-rose-deep)" }} />
                          <span style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                            <span style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}>{productPriceLabel(p)}{already ? " · 담김" : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* 푸터 */}
            <div style={{ display: "flex", gap: "8px", padding: "12px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setBcPickerOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>닫기</button>
              <button type="button" disabled={bcPickerSel.size === 0 || bcBusy} onClick={() => void confirmBcPick()} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "#fff", background: "var(--color-ink)", border: "none", cursor: bcPickerSel.size === 0 || bcBusy ? "not-allowed" : "pointer", opacity: bcPickerSel.size === 0 || bcBusy ? 0.5 : 1 }}>{bcBusy ? "담는 중…" : `${bcPickerSel.size}개 담기`}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 쇼핑몰 진열 피커 (전체 창고에서 선택 → products.in_shop=true) */}
      {shopPickerOpen ? (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShopPickerOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.5)", padding: "16px" }}
        >
          <div style={{ width: "520px", maxWidth: "100%", height: "600px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-ink)" }}>쇼핑몰에 담기</span>
              <button type="button" onClick={() => setShopPickerOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            {/* 검색 */}
            <div style={{ padding: "12px 16px 8px" }}>
              <input value={shopPickerSearch} onChange={(e) => setShopPickerSearch(e.target.value)} placeholder="상품명 검색" style={{ width: "100%", height: "36px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "14px", fontWeight: 500, outline: "none", color: "var(--color-ink)" }} />
            </div>
            {/* 목록 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 8px" }}>
              {(() => {
                const q = normalizeProductSearchText(shopPickerSearch);
                const pickList = products.filter((p) => {
                  if (pickString(p, ["status"], "") === "deleted") return false;
                  // [2026-07-23] 조합형 세부상품명 검색 허용(평소 상품 무변경)
                  if (q && !productSearchMatches(productName(p), q) && !comboNamesMatch(p, shopPickerSearch)) return false;
                  return true;
                });
                if (pickList.length === 0) {
                  return <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700, lineHeight: 1.7 }}><div style={{ fontWeight: 700, color: "var(--color-ink-soft)" }}>상품 없음</div><div style={{ fontSize: "12px", marginTop: "4px" }}>「+ 상품 등록」으로 먼저 만들어 주세요</div></div>;
                }
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pickList.map((p, i) => {
                      const pid = productId(p);
                      const already = shopAddedIds.has(pid);
                      const checked = shopPickerSel.has(pid);
                      const img = mainImage(p);
                      return (
                        <label key={pid || i} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: already ? "var(--color-surface-2)" : checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "8px", padding: "8px 8px", cursor: already ? "not-allowed" : "pointer", opacity: already ? 0.55 : 1 }}>
                          <input type="checkbox" disabled={already} checked={already || checked} onChange={() => !already && toggleShopPick(pid)} style={{ width: "16px", height: "16px", flexShrink: 0, accentColor: "var(--color-rose-deep)" }} />
                          <span style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                            <span style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}>{productPriceLabel(p)}{already ? " · 진열됨" : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* 푸터 */}
            <div style={{ display: "flex", gap: "8px", padding: "12px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setShopPickerOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>닫기</button>
              <button type="button" disabled={shopPickerSel.size === 0 || shopBusy} onClick={() => void confirmShopPick()} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "#fff", background: "var(--color-ink)", border: "none", cursor: shopPickerSel.size === 0 || shopBusy ? "not-allowed" : "pointer", opacity: shopPickerSel.size === 0 || shopBusy ? 0.5 : 1 }}>{shopBusy ? "담는 중…" : `${shopPickerSel.size}개 담기`}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 새 방송 만들기 모달 (prompt 대체) */}
      {newBcOpen ? (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setNewBcOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.5)", padding: "16px" }}
        >
          <div style={{ width: "380px", maxWidth: "100%", background: "var(--color-surface)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-rose-deep)" }}>새 방송 만들기</span>
              <button type="button" onClick={() => setNewBcOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "16px 16px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", marginBottom: "6px" }}>방송 제목</label>
              <input
                autoFocus
                value={newBcTitle}
                onChange={(e) => setNewBcTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitNewBroadcast();
                  if (e.key === "Escape") setNewBcOpen(false);
                }}
                placeholder="예: 0617 저녁 라이브"
                style={{ width: "100%", height: "40px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none", color: "var(--color-ink)" }}
              />
              {newBcCopyIds && newBcCopyIds.length > 0 ? (
                <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 700, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "8px", padding: "8px 8px" }}>선택한 상품 {newBcCopyIds.length}개가 새 방송에 그대로 담깁니다.</div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "8px", padding: "0 16px 16px" }}>
              <button type="button" onClick={() => setNewBcOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "var(--color-ink)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>닫기</button>
              <button type="button" disabled={!newBcTitle.trim() || bcBusy} onClick={() => void submitNewBroadcast()} style={{ flex: 1, height: "40px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", cursor: !newBcTitle.trim() || bcBusy ? "not-allowed" : "pointer", opacity: !newBcTitle.trim() || bcBusy ? 0.5 : 1 }}>{bcBusy ? "만드는 중…" : "만들기"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
  // 페이지 안에 넣을 때(레이아웃 B)는 포털 없이 그 자리에, 팝업일 때는 예전처럼 body 포털
  return embedded ? popupTree : createPortal(popupTree, document.body);
}
