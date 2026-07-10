"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import { showAdminToast } from "@/lib/adminToast";
import { createDraftBroadcast } from "./liveBroadcastController";

type ProductRow = Record<string, unknown>;

export type ProductManageTab = "broadcast" | "shop" | "products" | "history";

type Props = {
  activeBroadcastId?: string | number | null;
  onClose: () => void;
  // 닫힘/재오픈 사이 탭 위치 보존(수정 후 보던 탭 유지)
  initialTab?: ProductManageTab;
  onTabChange?: (tab: ProductManageTab) => void;
};

const PAGE_STEP = 10;
const BASE_CATEGORIES = ["전체", "신발", "의류", "잡화"];
// 기록 탭: 결제완료 계열 주문만 매출/주문 집계
const HISTORY_PAID_STATUSES = ["입금확인", "수동입금확인", "자동입금확인", "출고대기", "출고완료", "카드결제완료"];

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
      return trimmed.split(/[,/|]+/g).map((i) => i.trim()).filter(Boolean);
    }
  }
  return [];
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

function productName(p: ProductRow) {
  return pickString(p, ["product_name", "name", "title"], "상품명 없음");
}

function productPrice(p: ProductRow) {
  return pickNumber(p, ["price", "sale_price", "selling_price"], 0);
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function mainImage(p: ProductRow) {
  const direct = pickString(p, ["image_url", "cover_image_url", "main_image_url", "thumbnail_url"], "");
  if (direct) return resolveProductImageUrl(direct);
  const images = pickArray(p, ["images", "image_urls", "detail_image_urls"]);
  if (images[0]) return resolveProductImageUrl(images[0]);
  return "";
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

export default function AdminLiveProductManagePopup({ activeBroadcastId, onClose, initialTab, onTabChange }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [rotationIds, setRotationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ProductManageTab>(initialTab ?? "broadcast");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [lightbox, setLightbox] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [isNarrow, setIsNarrow] = useState(false);
  const [bcListOpen, setBcListOpen] = useState(true);
  useEffect(() => { setBcListOpen(!isNarrow); }, [isNarrow]); // 데스크톱=열림, 모바일=접힘 기본
  // 위젯 설정(일괄) 화면
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const [wsMode, setWsMode] = useState<"rotate" | "pin">("rotate");
  const [wsSelected, setWsSelected] = useState<Set<string>>(new Set());
  const [wsSaving, setWsSaving] = useState(false);

  // 방송 상품 탭(broadcast)
  const [bcList, setBcList] = useState<Array<{ id: string; title: string; started_at: string; status: string }>>([]);
  const [bcSelId, setBcSelId] = useState("");
  const [bcProducts, setBcProducts] = useState<ProductRow[]>([]);
  const [bcLoading, setBcLoading] = useState(false);
  const [bcBusy, setBcBusy] = useState(false);
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
  const [bcPickerFromIds, setBcPickerFromIds] = useState<Set<string> | null>(null);
  // 드래그 순서변경
  const [bcDragFrom, setBcDragFrom] = useState<number | null>(null);
  const [bcDragOver, setBcDragOver] = useState<number | null>(null);

  // 쇼핑몰 진열 탭(shop) — products.in_shop / mall_sort_order 사용
  const [shopRows, setShopRows] = useState<ProductRow[]>([]);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [shopPickerSel, setShopPickerSel] = useState<Set<string>>(new Set());
  const [shopPickerSearch, setShopPickerSearch] = useState("");
  // 드래그 순서변경
  const [shopDragFrom, setShopDragFrom] = useState<number | null>(null);
  const [shopDragOver, setShopDragOver] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
  const nameMatch = (p: ProductRow) => !search.trim() || productName(p).toLowerCase().includes(search.trim().toLowerCase());

  // 모바일(≤640) 감지 — 방송상품 탭 2단→세로 스택
  useEffect(() => {
    const check = () => setIsNarrow(typeof window !== "undefined" && window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 기록 탭(방송별 매출/주문)
  const [histLoaded, setHistLoaded] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histBroadcasts, setHistBroadcasts] = useState<Array<{ id: string; title: string; started_at: string; ended_at: string }>>([]);
  const [histStats, setHistStats] = useState<Map<string, { sales: number; count: number }>>(new Map());
  const [shopOrders, setShopOrders] = useState<Array<{ total_price: number; created_at: string }>>([]);
  const [histYear, setHistYear] = useState("전체");
  const [histMonth, setHistMonth] = useState("전체");
  const [histMode, setHistMode] = useState<"all" | "broadcast" | "shop">("all");
  const [histSearch, setHistSearch] = useState("");
  const [histExpand, setHistExpand] = useState("");
  const [histDetail, setHistDetail] = useState<Map<string, Array<{ key: string; name: string; productId: string; thumb: string; qty: number; price: number; sales: number; option: string }>>>(new Map());
  const [histDetailLoading, setHistDetailLoading] = useState("");

  // 상품 fetch (기존 loadProducts 재사용)
  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      setProducts((data as ProductRow[]) || []);
    } catch (e) {
      showAdminToast("상품 불러오기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setLoading(false);
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
      void loadProducts();
      void loadRotationIds();
    };
    window.addEventListener("ruru-live-product-updated", onUpdated);
    return () => window.removeEventListener("ruru-live-product-updated", onUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBroadcastId]);

  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [tab, search, category]);

  // 현재 탭을 부모(Dashboard)에 보고 → 닫힘/재오픈 사이 탭 위치 보존
  useEffect(() => {
    onTabChange?.(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
    if (!window.confirm(`'${b.title}' 방송을 목록에서 숨길까요?\n\n데이터는 보존되며 복구 가능합니다.`)) return;
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

  // 현재 위젯에 고정된 상품 id ("" 이면 순환 중). products 로드 시 동기화 + 고정/해제 시 즉시 반영.
  const [pinnedId, setPinnedId] = useState<string>("");
  useEffect(() => {
    const pinned = products.find((p) => pickBoolean(p, ["is_pinned", "pinned"], false));
    setPinnedId(pinned ? productId(pinned) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

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
    setBcPickerOpen(true);
  };

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

  // 기록 탭: 방송 목록 + 방송별 매출/주문수 집계 (broadcasts + orders)
  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const { data: bc } = await supabase
        .from("broadcasts")
        .select("id, public_title, started_at, ended_at")
        .order("started_at", { ascending: false });
      const broadcasts = ((bc as Array<Record<string, unknown>>) || []).map((b) => ({
        id: String(b.id),
        title: String(b.public_title || "제목 없음"),
        started_at: String(b.started_at || ""),
        ended_at: String(b.ended_at || ""),
      }));
      const ids = broadcasts.map((b) => b.id).filter(Boolean);
      const stats = new Map<string, { sales: number; count: number }>();
      if (ids.length > 0) {
        const { data: ord } = await supabase
          .from("orders")
          .select("broadcast_id, total_price")
          .in("broadcast_id", ids)
          .in("admin_order_status_v2", HISTORY_PAID_STATUSES);
        ((ord as Array<{ broadcast_id: unknown; total_price: unknown }>) || []).forEach((o) => {
          const bid = String(o.broadcast_id);
          const cur = stats.get(bid) || { sales: 0, count: 0 };
          cur.sales += Number(o.total_price || 0);
          cur.count += 1;
          stats.set(bid, cur);
        });
      }
      // 쇼핑몰(broadcast_id NULL) 주문 집계 → __shop__ 키(전체 합계) + shopOrders(년/월 필터용)
      const { data: shopOrd } = await supabase
        .from("orders")
        .select("total_price, created_at")
        .is("broadcast_id", null)
        .in("admin_order_status_v2", HISTORY_PAID_STATUSES);
      const shopList = ((shopOrd as Array<{ total_price: unknown; created_at: unknown }>) || []).map((o) => ({
        total_price: Number(o.total_price || 0),
        created_at: String(o.created_at || ""),
      }));
      setShopOrders(shopList);
      let shopSales = 0;
      let shopCount = 0;
      shopList.forEach((o) => { shopSales += o.total_price; shopCount += 1; });
      if (shopCount > 0) stats.set("__shop__", { sales: shopSales, count: shopCount });

      setHistBroadcasts(broadcasts);
      setHistStats(stats);
      setHistLoaded(true);
    } catch (e) {
      showAdminToast("기록 불러오기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setHistLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "history" && !histLoaded) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, histLoaded]);

  // 년/월 옵션 + 필터된 방송 + 요약
  const histYearOptions = useMemo(() => {
    const set = new Set<string>();
    histBroadcasts.forEach((b) => {
      const d = new Date(b.started_at);
      if (!Number.isNaN(d.getTime())) set.add(String(d.getFullYear()));
    });
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [histBroadcasts]);

  // 방송 목록 + 쇼핑몰(__shop__) 가상행
  const histEntries = useMemo(() => {
    const entries: Array<{ id: string; title: string; started_at: string; ended_at: string }> = [...histBroadcasts];
    if (histStats.has("__shop__")) entries.push({ id: "__shop__", title: "쇼핑몰 주문", started_at: "", ended_at: "" });
    return entries;
  }, [histBroadcasts, histStats]);

  const histFiltered = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    return histEntries.filter((b) => {
      const isShop = b.id === "__shop__";
      if (histMode === "broadcast" && isShop) return false;
      if (histMode === "shop" && !isShop) return false;
      if (q && !b.title.toLowerCase().includes(q)) return false;
      if (isShop) return true;
      const d = new Date(b.started_at);
      if (Number.isNaN(d.getTime())) return histYear === "전체" && histMonth === "전체";
      if (histYear !== "전체" && String(d.getFullYear()) !== histYear) return false;
      if (histMonth !== "전체" && String(d.getMonth() + 1) !== histMonth) return false;
      return true;
    });
  }, [histEntries, histMode, histSearch, histYear, histMonth]);

  // 쇼핑몰 행: 년/월 기준 클라이언트 필터 (created_at)
  const shopFilteredStat = useMemo(() => {
    let sales = 0;
    let count = 0;
    shopOrders.forEach((o) => {
      const d = new Date(o.created_at);
      if (histYear !== "전체" && (Number.isNaN(d.getTime()) || String(d.getFullYear()) !== histYear)) return;
      if (histMonth !== "전체" && (Number.isNaN(d.getTime()) || String(d.getMonth() + 1) !== histMonth)) return;
      sales += o.total_price;
      count += 1;
    });
    return { sales, count };
  }, [shopOrders, histYear, histMonth]);

  const histSummary = useMemo(() => {
    let sales = 0;
    let count = 0;
    let broadcastCount = 0;
    histFiltered.forEach((b) => {
      if (b.id === "__shop__") {
        sales += shopFilteredStat.sales;
        count += shopFilteredStat.count;
        return;
      }
      broadcastCount += 1;
      const st = histStats.get(b.id);
      if (st) { sales += st.sales; count += st.count; }
    });
    return { broadcastCount, sales, count };
  }, [histFiltered, histStats, shopFilteredStat]);

  // 행 펼침 → 상품별 집계 (orders + products 썸네일). broadcast_id NULL이면 쇼핑몰.
  const loadBroadcastDetail = async (entryId: string) => {
    if (histDetail.has(entryId)) {
      setHistExpand((cur) => (cur === entryId ? "" : entryId));
      return;
    }
    setHistDetailLoading(entryId);
    setHistExpand(entryId);
    try {
      let q = supabase.from("orders").select("product_id, product_name, color, size, qty, product_price");
      q = entryId === "__shop__" ? q.is("broadcast_id", null) : q.eq("broadcast_id", entryId);
      q = q.in("admin_order_status_v2", HISTORY_PAID_STATUSES);
      const { data: ord } = await q;
      const map = new Map<string, { key: string; name: string; productId: string; thumb: string; qty: number; price: number; sales: number; opts: Map<string, number> }>();
      ((ord as Array<Record<string, unknown>>) || []).forEach((o) => {
        const pid = o.product_id ? String(o.product_id) : "";
        const key = pid || String(o.product_name || "상품");
        const cur = map.get(key) || { key, name: String(o.product_name || "상품"), productId: pid, thumb: "", qty: 0, price: Number(o.product_price || 0), sales: 0, opts: new Map<string, number>() };
        const qty = Number(o.qty || 0);
        cur.qty += qty;
        cur.price = Number(o.product_price || 0);
        cur.sales += Number(o.product_price || 0) * qty;
        const opt = [o.color, o.size].filter(Boolean).join("/");
        if (opt) cur.opts.set(opt, (cur.opts.get(opt) || 0) + qty);
        map.set(key, cur);
      });
      const rows = [...map.values()];
      const pids = rows.map((r) => r.productId).filter(Boolean);
      if (pids.length > 0) {
        const { data: prods } = await supabase.from("products").select("id, image_url").in("id", pids);
        const thumbs = new Map<string, string>();
        ((prods as ProductRow[]) || []).forEach((p) => {
          const url = String((p as { image_url?: unknown }).image_url || "");
          if (url) thumbs.set(String((p as { id?: unknown }).id), resolveProductImageUrl(url));
        });
        rows.forEach((r) => { r.thumb = thumbs.get(r.productId) || ""; });
      }
      // product_id로 못 찾은 행(또는 product_id 없는 행) → products 전체 조회 후 product_name 클라이언트 매칭
      const nameRows = rows.filter((r) => !r.thumb && r.name);
      if (nameRows.length > 0) {
        const { data: allProds } = await supabase.from("products").select("id, product_name, image_url");
        const nameThumbs = new Map<string, string>();
        ((allProds as ProductRow[]) || []).forEach((p) => {
          const nm = String((p as { product_name?: unknown }).product_name || "").toLowerCase().trim();
          if (!nm || nameThumbs.has(nm)) return;
          const url = String((p as { image_url?: unknown }).image_url || "");
          if (url) nameThumbs.set(nm, resolveProductImageUrl(url));
        });
        nameRows.forEach((r) => {
          const t = nameThumbs.get(r.name.toLowerCase().trim());
          if (t) r.thumb = t;
        });
      }
      const detailRows = rows
        .sort((a, b) => b.sales - a.sales)
        .map((r) => ({ key: r.key, name: r.name, productId: r.productId, thumb: r.thumb, qty: r.qty, price: r.price, sales: r.sales, option: [...r.opts.keys()].join(" · ") }));
      setHistDetail((prev) => new Map(prev).set(entryId, detailRows));
    } catch (e) {
      showAdminToast("상세 불러오기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setHistDetailLoading("");
    }
  };

  // 재고임박 필터 (전체 상품 탭): 재고관리 중 && 재고 3개 이하
  const [lowOnly, setLowOnly] = useState(false);
  // 정렬 (전체 상품 탭): 기본(고정 우선)/최신 등록순/재고 적은순 — 표시 순서만, 데이터 무변경
  const [sortKey, setSortKey] = useState<"default" | "latest" | "stock_low">("default");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (pickString(p, ["status", "product_status"], "") === "deleted") return false;
      if (category !== "전체" && productCategory(p) !== category) return false;
      if (lowOnly) {
        const s = lowStockOf(p);
        if (s === null || s > 3) return false;
      }
      if (q && !productName(p).toLowerCase().includes(q)) return false;
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
    // 기본: 고정(is_pinned) 상품을 배열 앞으로 (true → 0, false → 1)
    return list.sort(
      (a, b) =>
        (pickBoolean(a, ["is_pinned", "pinned"], false) ? 0 : 1) -
        (pickBoolean(b, ["is_pinned", "pinned"], false) ? 0 : 1),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, category, lowOnly, sortKey]);

  const visible = filtered.slice(0, visibleCount);

  // 무한스크롤: sentinel 보이면 PAGE_STEP씩 누적
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== "products") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((v) => (v < filtered.length ? v + PAGE_STEP : v));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, filtered.length, visibleCount]);

  const categories = BASE_CATEGORIES;

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
      showAdminToast(`${ids.length}개 상품을 쇼핑몰에 진열했어요.`, "success");
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

  // --- 위젯 단건 액션 (기존 addToRotation / pinSelected 로직 재사용) ---
  const widgetState = (p: ProductRow): "rotating" | "pinned" | "none" => {
    if (pickBoolean(p, ["is_pinned", "pinned"], false)) return "pinned";
    if (rotationIds.has(productId(p))) return "rotating";
    return "none";
  };

  const addRotationSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    if (!activeBroadcastId) {
      showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 먼저 시작한 뒤 순환에 담아주세요.", "warning");
      return;
    }
    setBusyId(id);
    try {
      // 기존 addToRotation과 동일: 고정 해제 후 순환에 추가(중복 제외)
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
      const { data: existing } = await supabase
        .from("broadcast_products")
        .select("product_id")
        .eq("broadcast_id", activeBroadcastId)
        .eq("product_id", id);
      if (!existing || existing.length === 0) {
        const { error } = await adminCatalogWrite({
          table: "broadcast_products",
          op: "insert",
          values: { broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 },
        });
        if (error) throw error;
      }
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("방송 순환에 담았어요.", "success");
    } catch (e) {
      showAdminToast("순환 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusyId("");
    }
  };

  const removeRotationSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id || !activeBroadcastId) return;
    setBusyId(id);
    try {
      const { error } = await adminCatalogWrite({
        table: "broadcast_products",
        op: "delete",
        filters: [
          { type: "eq", col: "broadcast_id", val: activeBroadcastId },
          { type: "eq", col: "product_id", val: id },
        ],
      });
      if (error) throw error;
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("순환에서 뺐어요.", "success");
    } catch (e) {
      showAdminToast("순환 해제 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusyId("");
    }
  };

  const unpinSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    setBusyId(id);
    try {
      // 기존 pinSelected와 동일 테이블/컬럼: is_pinned 해제
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "id", val: id }] });
      if (error) throw error;
      setPinnedId("");
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("고정을 해제했어요. 위젯이 다시 순환합니다.", "success");
    } catch (e) {
      showAdminToast("고정 해제 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusyId("");
    }
  };

  // [2026-07-10] 방송 상품 탭에서 바로 "이 상품만 위젯 고정".
  //   기존 pinSelected(일괄 고정)와 완전히 동일한 방식 — 전체 고정 해제 후 이 상품만 is_pinned=true.
  //   위젯(ProductWidgetClient)은 is_pinned 상품이 있으면 그것만 띄우고, 없으면 순환한다.
  const pinSingle = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    setBusyId(id);
    try {
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: true }, filters: [{ type: "eq", col: "id", val: id }] });
      if (error) throw error;
      setPinnedId(id);
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("이 상품만 위젯에 고정했어요.", "success");
    } catch (e) {
      showAdminToast("상품 고정 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusyId("");
    }
  };

  const onWidgetClick = (p: ProductRow) => {
    const state = widgetState(p);
    if (state === "rotating") return void removeRotationSingle(p);
    if (state === "pinned") return void unpinSingle(p);
    return void addRotationSingle(p);
  };

  // --- 등록/수정/삭제 (기존 이벤트/로직 재사용) ---
  const openCreate = () => {
    window.dispatchEvent(new Event("ruru-open-quick-product-panel"));
    onClose();
  };

  const editProduct = (p: ProductRow) => {
    window.dispatchEvent(new CustomEvent("ruru-edit-quick-product", { detail: p }));
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
    copy.is_pinned = false;
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
    if (!window.confirm(`"${productName(p)}" 상품을 삭제할까요?\n\n숨김 처리됩니다 (복구 가능)`)) return;
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
    // 고정 상품 있으면 고정모드 자동 진입(+초기선택), 없으면 순환모드
    const hasPinned = products.some((p) => pickBoolean(p, ["is_pinned", "pinned"], false));
    wsSetMode(hasPinned ? "pin" : "rotate");
    setWidgetSettingsOpen(true);
  };

  // 모드 전환: 고정모드 진입 시 현재 고정(is_pinned) 상품을 초기선택
  const wsSetMode = (mode: "rotate" | "pin") => {
    setWsMode(mode);
    if (mode === "pin") {
      const pinned = products.filter((p) => pickBoolean(p, ["is_pinned", "pinned"], false)).map(productId).filter(Boolean);
      setWsSelected(new Set(pinned));
    } else {
      setWsSelected(new Set());
    }
  };

  // 일괄 전체선택/개별선택 (고정모드는 단일 선택)
  const wsToggle = (id: string) => {
    if (!id) return;
    setWsSelected((prev) => {
      if (wsMode === "pin") {
        return prev.has(id) ? new Set<string>() : new Set<string>([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const wsAllIds = useMemo(() => products.map(productId).filter(Boolean), [products]);
  const wsAllChecked = wsAllIds.length > 0 && wsAllIds.every((id) => wsSelected.has(id));
  const wsToggleAll = () => setWsSelected((prev) => (prev.size >= wsAllIds.length ? new Set() : new Set(wsAllIds)));

  // 순환 일괄 담기 (기존 addToRotation 로직 재사용)
  const wsAddToRotation = async () => {
    const ids = [...wsSelected].filter(Boolean);
    if (ids.length === 0) return;
    if (!activeBroadcastId) {
      showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 먼저 시작한 뒤 순환에 담아주세요.", "warning");
      return;
    }
    setWsSaving(true);
    try {
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
      const { data: existing } = await supabase
        .from("broadcast_products")
        .select("product_id")
        .eq("broadcast_id", activeBroadcastId);
      const existingSet = new Set(((existing as { product_id: unknown }[]) || []).map((r) => String(r.product_id)));
      const toInsert = ids
        .filter((id) => !existingSet.has(String(id)))
        .map((id) => ({ broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 }));
      if (toInsert.length > 0) {
        const { error } = await adminCatalogWrite({ table: "broadcast_products", op: "insert", values: toInsert });
        if (error) throw error;
      }
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      const skipped = ids.length - toInsert.length;
      showAdminToast(`방송 순환에 ${toInsert.length}개 담았어요.${skipped > 0 ? ` (이미 담긴 ${skipped}개 제외)` : ""}`, "success");
      setWsSelected(new Set());
      setWidgetSettingsOpen(false);
    } catch (e) {
      showAdminToast("순환 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setWsSaving(false);
    }
  };

  // 고정 일괄 (기존 pinSelected 로직 재사용)
  const wsPinSelected = async () => {
    const ids = [...wsSelected].filter(Boolean);
    if (ids.length === 0) return;
    setWsSaving(true);
    try {
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
      const { error } = await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: true }, filters: [{ type: "in", col: "id", val: ids }] });
      if (error) throw error;
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`${ids.length}개 상품을 고정(지금 띄움)했어요.`, "success");
      setWsSelected(new Set());
      setWidgetSettingsOpen(false);
    } catch (e) {
      showAdminToast("상품 고정 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setWsSaving(false);
    }
  };

  const wsConfirm = () => (wsMode === "pin" ? void wsPinSelected() : void wsAddToRotation());

  if (typeof document === "undefined") return null;

  const chipBase: React.CSSProperties = { padding: "5px 12px", borderRadius: "16px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid var(--color-rose-line)" };

  return createPortal(
    <div
      className={(typeof document !== "undefined" && document.querySelector(".dark") ? "dark " : "") + "ruru-product-sian"}
      style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "960px", maxWidth: "100%", flexShrink: 0, height: "680px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "14px", overflow: "hidden" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-line)" }}>
          <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--color-rose-deep)" }}>📦 상품 관리</span>
          <button type="button" onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "#7B2D43", border: "none", borderRadius: "8px", padding: "7px 13px", cursor: "pointer", marginLeft: "auto" }}>+ 상품 등록</button>
          <button type="button" onClick={onClose} style={{ marginLeft: "8px", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* 탭 2개 */}
        <div style={{ display: "flex", gap: "2px", padding: "0 18px", borderBottom: "1px solid var(--color-line)" }}>
          {([["broadcast", "방송 상품"], ["shop", "쇼핑몰 진열"], ["products", "전체 상품"], ["history", "판매 기록"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{ padding: "11px 16px", fontSize: "13px", fontWeight: 800, background: "none", border: "none", borderBottom: "2px solid " + (tab === k ? "var(--color-rose-deep)" : "transparent"), color: tab === k ? "var(--color-rose-deep)" : "var(--color-ink-soft)", cursor: "pointer" }}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "history" ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 16px" }}>
            {/* 요약카드 3개 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              {([
                ["방송 수", `${histSummary.broadcastCount}회`],
                ["총 매출", money(histSummary.sales)],
                ["총 주문", `${histSummary.count.toLocaleString("ko-KR")}건`],
              ] as const).map(([label, value]) => (
                <div key={label} style={{ border: "1px solid var(--color-line)", borderRadius: "10px", padding: "12px 10px", textAlign: "center", background: "var(--color-surface-2)" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-ink-soft)", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* 필터: 모드 + 년/월 */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
              <select value={histMode} onChange={(e) => setHistMode(e.target.value as "all" | "broadcast" | "shop")} style={{ height: "34px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", background: "var(--color-surface)", cursor: "pointer", color: "var(--color-ink)" }}>
                <option value="all">전체</option>
                <option value="broadcast">방송모드</option>
                <option value="shop">쇼핑몰모드</option>
              </select>
              <select value={histYear} onChange={(e) => setHistYear(e.target.value)} style={{ height: "34px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", background: "var(--color-surface)", cursor: "pointer", color: "var(--color-ink)" }}>
                <option value="전체">전체 연도</option>
                {histYearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={histMonth} onChange={(e) => setHistMonth(e.target.value)} style={{ height: "34px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", background: "var(--color-surface)", cursor: "pointer", color: "var(--color-ink)" }}>
                <option value="전체">전체 월</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
              <input value={histSearch} onChange={(e) => setHistSearch(e.target.value)} placeholder="🔍 방송명 검색" style={{ flex: 1, minWidth: "120px", height: "34px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", outline: "none", color: "var(--color-ink)" }} />
            </div>

            {/* 방송/쇼핑몰 목록 */}
            {histLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>불러오는 중…</div>
            ) : histFiltered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>기록이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {histFiltered.map((b) => {
                  const isShop = b.id === "__shop__";
                  const st = isShop ? shopFilteredStat : (histStats.get(b.id) || { sales: 0, count: 0 });
                  const expanded = histExpand === b.id;
                  const d = new Date(b.started_at);
                  const dateLabel = isShop ? "상시 판매" : Number.isNaN(d.getTime()) ? "-" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                  const detail = histDetail.get(b.id);
                  const detailSubtotal = (detail || []).reduce((acc, r) => ({ sales: acc.sales + r.sales, qty: acc.qty + r.qty }), { sales: 0, qty: 0 });
                  return (
                    <div key={b.id} style={{ border: "1px solid " + (expanded ? "var(--color-rose-line)" : "var(--color-line)"), borderRadius: "10px", overflow: "hidden", background: "var(--color-surface)" }}>
                      {/* 헤더 행 */}
                      <div onClick={() => void loadBroadcastDetail(b.id)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 13px", cursor: "pointer", background: expanded ? "var(--color-rose-soft)" : "var(--color-surface)" }}>
                        <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, padding: "3px 8px", borderRadius: "6px", background: isShop ? "var(--color-ok-bg)" : "var(--color-warn-bg)", color: isShop ? "var(--color-ok-tx)" : "var(--color-warn-tx)" }}>{isShop ? "🛍 쇼핑몰" : "📺 방송"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                          <div style={{ fontSize: "11px", color: "var(--color-ink-soft)", marginTop: "2px" }}>{dateLabel}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{money(st.sales)}</div>
                          <div style={{ fontSize: "11px", color: "var(--color-ink-soft)", marginTop: "2px" }}>주문 {st.count.toLocaleString("ko-KR")}건</div>
                        </div>
                        <span style={{ flexShrink: 0, color: "var(--color-ink-soft)", fontSize: "12px" }}>{expanded ? "▴" : "▾"}</span>
                      </div>

                      {/* 펼침: 상품별 상세 */}
                      {expanded ? (
                        <div style={{ borderTop: "1px solid var(--color-line)", padding: "10px 13px", background: "var(--color-surface-2)" }}>
                          {histDetailLoading === b.id && !detail ? (
                            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>불러오는 중…</div>
                          ) : !detail || detail.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>주문이 없습니다.</div>
                          ) : (
                            <>
                              {/* 펼침 헤더: 빈칸 / 상품명·옵션 / 수량 / 단가 / 매출 */}
                              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 44px 72px 84px", gap: "8px", alignItems: "center", padding: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--color-ink-soft)", borderBottom: "1px solid var(--color-line)" }}>
                                <span />
                                <span>상품명·옵션</span>
                                <span style={{ textAlign: "right" }}>수량</span>
                                <span style={{ textAlign: "right" }}>단가</span>
                                <span style={{ textAlign: "right" }}>매출</span>
                              </div>
                              {detail.map((r) => (
                                <div key={r.key} style={{ display: "grid", gridTemplateColumns: "32px 1fr 44px 72px 84px", gap: "8px", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--color-line)" }}>
                                  <span
                                    onClick={(e) => { e.stopPropagation(); if (r.thumb) setImagePreviewUrl(r.thumb); }}
                                    style={{ width: "32px", height: "32px", flexShrink: 0, borderRadius: "6px", overflow: "hidden", background: "var(--color-surface)", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: r.thumb ? "zoom-in" : "default" }}
                                  >
                                    {r.thumb ? <img src={r.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "14px" }}>🖼</span>}
                                  </span>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                                    {r.option ? <div style={{ fontSize: "11px", color: "var(--color-ink-soft)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.option}</div> : null}
                                  </div>
                                  <div style={{ textAlign: "right", fontSize: "11px", fontWeight: 700, color: "var(--color-ink)" }}>{r.qty.toLocaleString("ko-KR")}개</div>
                                  <div style={{ textAlign: "right", fontSize: "11px", color: "var(--color-ink-soft)" }}>{money(r.price)}</div>
                                  <div style={{ textAlign: "right", fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{money(r.sales)}</div>
                                </div>
                              ))}
                              {/* 상품 소계 (N종) */}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", fontSize: "12px", fontWeight: 800 }}>
                                <span style={{ color: "var(--color-ink)" }}>상품 소계 ({detail.length}종)</span>
                                <span style={{ color: "var(--color-rose-deep)" }}>{money(detailSubtotal.sales)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === "broadcast" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isNarrow ? "column" : "row", gap: "12px", padding: "14px 18px 16px" }}>
            {/* 좌측: 방송 목록 */}
            <div style={{ width: isNarrow ? "100%" : "260px", flexShrink: 0, ...(isNarrow && bcListOpen ? { maxHeight: "210px" } : {}), display: "flex", flexDirection: "column", border: "1px solid var(--color-line)", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 12px", borderBottom: "1px solid var(--color-line)" }}>
                <span
                  onClick={isNarrow ? () => setBcListOpen((v) => !v) : undefined}
                  style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)", cursor: isNarrow ? "pointer" : "default" }}
                >
                  📺 방송 목록
                  {isNarrow ? <span style={{ fontSize: "10px" }}>{bcListOpen ? "▲" : "▼"}</span> : null}
                  {isNarrow && !bcListOpen ? (
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>· {bcList.find((b) => b.id === bcSelId)?.title ?? "방송 선택"}</span>
                  ) : null}
                </span>
                <button type="button" disabled={bcBusy} onClick={() => { setNewBcTitle(""); setNewBcCopyIds(null); setNewBcOpen(true); }} style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "7px", padding: "4px 9px", cursor: bcBusy ? "wait" : "pointer", opacity: bcBusy ? 0.5 : 1 }}>+ 새 방송</button>
              </div>
              {(!isNarrow || bcListOpen) && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {bcLoading ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>불러오는 중…</div>
                ) : bcList.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>방송이 없습니다.</div>
                ) : (
                  bcList.map((b) => {
                    const on = b.id === bcSelId;
                    const isOn = String(b.status || "").toUpperCase() === "ON";
                    const d = new Date(b.started_at);
                    const dateLabel = Number.isNaN(d.getTime()) ? "-" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                    return (
                      <button type="button" key={b.id} onClick={() => { setBcSelId(b.id); if (isNarrow) setBcListOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-line)", background: on ? "var(--color-rose-soft)" : "var(--color-surface)", cursor: "pointer", border: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {isOn ? <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: 800, padding: "1px 6px", borderRadius: "5px", background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" }}>ON</span> : null}
                          <span style={{ flex: 1, minWidth: 0, fontSize: "12px", fontWeight: 800, color: on ? "var(--color-rose-deep)" : "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                          {/* 켜진 방송(isOn)은 숨기기 불가 — 가드: span 자체를 렌더하지 않음 */}
                          {!isOn ? (
                            <span
                              role="button"
                              title="목록에서 숨기기"
                              onClick={(e) => { e.stopPropagation(); void handleHideBroadcast(b); }}
                              style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, color: "var(--color-danger-tx)", background: "var(--color-danger-bg)", borderRadius: "5px", padding: "1px 6px", cursor: bcBusy ? "default" : "pointer", opacity: bcBusy ? 0.5 : 1 }}
                            >
                              숨기기
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--color-ink-soft)", marginTop: "2px" }}>{dateLabel}</div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            </div>
            {/* 우측: 선택 방송의 진열 상품 (sort_order순, 읽기 전용) */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid var(--color-line)", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 12px", borderBottom: "1px solid var(--color-line)" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)" }}>진열 상품 {bcProducts.length}개</span>
                <button type="button" disabled={!bcSelId || bcBusy} onClick={openBcPicker} style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "7px", padding: "5px 11px", cursor: !bcSelId || bcBusy ? "not-allowed" : "pointer", opacity: !bcSelId || bcBusy ? 0.5 : 1 }}>+ 상품 담기</button>
                {bcSelId && bcProducts.length > 0 ? (
                  <button type="button" disabled={bcBusy} onClick={() => { setBcCopyMode((v) => !v); setBcCopySel(new Set()); }} style={{ fontSize: "11px", fontWeight: 800, color: bcCopyMode ? "var(--color-ink-soft)" : "var(--color-rose-deep)", background: bcCopyMode ? "var(--color-surface)" : "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "7px", padding: "5px 11px", cursor: bcBusy ? "wait" : "pointer", opacity: bcBusy ? 0.5 : 1 }}>{bcCopyMode ? "✕ 선택 취소" : "☑ 선택 복사"}</button>
                ) : null}
              </div>
              <div style={{ padding: "8px 12px 0" }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "34px", padding: "0 10px", margin: "0 0 8px", borderRadius: "8px", border: "1px solid #e5dfe1", fontSize: "13px", boxSizing: "border-box" }} />
              </div>
              {bcCopyMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px 8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={bcProducts.length > 0 && bcCopySel.size === bcProducts.length}
                      onChange={(e) => setBcCopySel(e.target.checked ? new Set(bcProducts.map((p) => productId(p)).filter(Boolean)) : new Set())}
                      style={{ width: "15px", height: "15px", accentColor: "var(--color-rose-deep)", cursor: "pointer" }}
                    />
                    전체선택
                  </label>
                  <button type="button" disabled={bcCopySel.size === 0 || bcBusy} onClick={openNewBcWithCopy} style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "7px", padding: "6px 12px", cursor: bcCopySel.size === 0 || bcBusy ? "not-allowed" : "pointer", opacity: bcCopySel.size === 0 || bcBusy ? 0.5 : 1 }}>선택 {bcCopySel.size}개 → 새 방송으로 복사</button>
                </div>
              ) : null}
              <div
                ref={bcScrollRef}
                onDragOver={handleBcDragAutoScroll}
                onDrop={stopBcAutoScroll}
                onDragEnd={stopBcAutoScroll}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) stopBcAutoScroll(); }}
                style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px" }}
              >
                {!bcSelId ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>방송을 선택하세요.</div>
                ) : bcProducts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>진열된 상품이 없습니다.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                    {bcProducts.filter(nameMatch).map((p, i) => {
                      const img = mainImage(p);
                      const pid = productId(p);
                      return (
                        <div
                          key={pid || i}
                          draggable={!bcBusy && !search.trim() && !bcCopyMode}
                          onClick={bcCopyMode && pid ? () => toggleBcCopyPick(pid) : undefined}
                          onDragStart={() => { setBcDragFrom(i); setBcDragOver(i); }}
                          onDragOver={(e) => { e.preventDefault(); if (bcDragOver !== i) setBcDragOver(i); }}
                          onDrop={(e) => { e.preventDefault(); if (bcDragFrom !== null) void reorderBc(bcDragFrom, i); setBcDragFrom(null); setBcDragOver(null); }}
                          onDragEnd={() => { setBcDragFrom(null); setBcDragOver(null); }}
                          style={{ display: "flex", alignItems: "center", gap: "10px", border: bcCopyMode && bcCopySel.has(pid) ? "1px solid var(--color-rose-deep)" : "1px solid var(--color-line)", borderRadius: "9px", padding: "8px", background: bcCopyMode && bcCopySel.has(pid) ? "var(--color-rose-soft)" : bcDragFrom !== null && bcDragOver === i && bcDragFrom !== i ? "var(--color-warn-bg)" : "var(--color-surface)", opacity: bcDragFrom === i ? 0.4 : 1, boxShadow: bcDragFrom !== null && bcDragOver === i && bcDragFrom !== i ? "inset 0 2px 0 var(--color-rose-deep)" : undefined, cursor: bcCopyMode ? "pointer" : bcBusy ? "default" : "grab" }}
                        >
                          {/* 선택 복사 모드: 체크박스 / 평소: 드래그 핸들 */}
                          {bcCopyMode ? (
                            <input type="checkbox" checked={bcCopySel.has(pid)} onChange={() => toggleBcCopyPick(pid)} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, width: "16px", height: "16px", accentColor: "var(--color-rose-deep)", cursor: "pointer" }} />
                          ) : (
                            <span style={{ flexShrink: 0, fontSize: "14px", color: "var(--color-ink-mute)", userSelect: "none" }} title="드래그로 순서 변경">⠿</span>
                          )}
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", width: "20px", textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                          <span
                            onClick={(e) => { e.stopPropagation(); if (img) setLightbox(img); }}
                            title={img ? "클릭하면 크게 보기" : undefined}
                            style={{ width: "48px", height: "48px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "zoom-in" : "default" }}
                          >
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "18px" }}>🖼</span>}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)", marginTop: "2px" }}>{money(productPrice(p))}</div>
                          </div>
                          {/* [2026-07-10] 방송 중 "이 상품만 위젯에 띄우기". 고정 중이면 눌러서 해제(=다시 순환). */}
                          {!bcCopyMode ? (
                            <button
                              type="button"
                              disabled={busyId === pid}
                              onClick={(e) => { e.stopPropagation(); void (pinnedId === pid ? unpinSingle(p) : pinSingle(p)); }}
                              title={pinnedId === pid ? "고정 해제 — 위젯이 다시 순환합니다" : "이 상품만 위젯에 고정합니다"}
                              style={{
                                flexShrink: 0, fontSize: "11px", fontWeight: 800, borderRadius: "6px", padding: "6px 10px",
                                cursor: busyId === pid ? "wait" : "pointer", opacity: busyId === pid ? 0.6 : 1,
                                color: pinnedId === pid ? "#fff" : "var(--color-ink-soft)",
                                background: pinnedId === pid ? "var(--color-rose-deep)" : "var(--color-surface-2)",
                                border: "1px solid " + (pinnedId === pid ? "var(--color-rose-deep)" : "var(--color-line)"),
                              }}
                            >
                              {pinnedId === pid ? "📌 고정중" : "📌 고정"}
                            </button>
                          ) : null}
                          <button type="button" onClick={(e) => { e.stopPropagation(); editProduct(p); }} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}>수정</button>
                          <button type="button" disabled={bcBusy} onClick={(e) => { e.stopPropagation(); void removeBcProduct(pid); }} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-danger-tx)", background: "var(--color-danger-bg)", border: "none", borderRadius: "6px", padding: "6px 10px", cursor: bcBusy ? "wait" : "pointer", opacity: bcBusy ? 0.6 : 1 }}>빼기</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : tab === "shop" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "14px 18px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)" }}>🛍 쇼핑몰 진열 {shopRows.length}개</span>
              <button type="button" disabled={shopBusy} onClick={openShopPicker} style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "7px", padding: "5px 11px", cursor: shopBusy ? "wait" : "pointer", opacity: shopBusy ? 0.5 : 1 }}>+ 쇼핑몰에 상품 추가</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "34px", padding: "0 10px", margin: "0 0 8px", borderRadius: "8px", border: "1px solid #e5dfe1", fontSize: "13px", boxSizing: "border-box" }} />
            <div
              ref={shopScrollRef}
              onDragOver={handleShopDragAutoScroll}
              onDrop={stopShopAutoScroll}
              onDragEnd={stopShopAutoScroll}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) stopShopAutoScroll(); }}
              style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              {shopRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>진열된 상품이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {shopRows.filter(nameMatch).map((p, i) => {
                    const img = mainImage(p);
                    const pid = productId(p);
                    return (
                      <div
                        key={pid || i}
                        draggable={!shopBusy && !search.trim()}
                        onDragStart={() => { setShopDragFrom(i); setShopDragOver(i); }}
                        onDragOver={(e) => { e.preventDefault(); if (shopDragOver !== i) setShopDragOver(i); }}
                        onDrop={(e) => { e.preventDefault(); if (shopDragFrom !== null) void reorderShop(shopDragFrom, i); setShopDragFrom(null); setShopDragOver(null); }}
                        onDragEnd={() => { setShopDragFrom(null); setShopDragOver(null); }}
                        style={{ display: "flex", alignItems: "center", gap: "10px", border: "1px solid var(--color-line)", borderRadius: "10px", padding: "9px", background: shopDragFrom !== null && shopDragOver === i && shopDragFrom !== i ? "var(--color-warn-bg)" : "var(--color-surface)", opacity: shopDragFrom === i ? 0.4 : 1, boxShadow: shopDragFrom !== null && shopDragOver === i && shopDragFrom !== i ? "inset 0 2px 0 var(--color-rose-deep)" : undefined, cursor: shopBusy ? "default" : "grab" }}
                      >
                        {/* 드래그 핸들 */}
                        <span style={{ flexShrink: 0, fontSize: "14px", color: "var(--color-ink-mute)", userSelect: "none" }} title="드래그로 순서 변경">⠿</span>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", width: "20px", textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); if (img) setLightbox(img); }}
                          title={img ? "클릭하면 크게 보기" : undefined}
                          style={{ width: "56px", height: "56px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "zoom-in" : "default" }}
                        >
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "20px" }}>🖼</span>}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-rose-deep)", marginTop: "2px" }}>{money(productPrice(p))}</div>
                          {productCategory(p) ? <span style={{ display: "inline-block", marginTop: "4px", fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "var(--color-surface-3)", color: "var(--color-ink-soft)" }}>{productCategory(p)}</span> : null}
                        </div>
                        <button type="button" onClick={() => editProduct(p)} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}>수정</button>
                        <button type="button" disabled={shopBusy} onClick={() => void removeFromShop(pid)} style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-danger-tx)", background: "var(--color-danger-bg)", border: "none", borderRadius: "6px", padding: "6px 10px", cursor: shopBusy ? "wait" : "pointer", opacity: shopBusy ? 0.6 : 1 }}>빼기</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 검색 */}
            <div style={{ padding: "0 18px 8px" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none", color: "var(--color-ink)" }} />
            </div>

            {/* 카테고리 칩 */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "0 18px 10px" }}>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{ ...chipBase, background: category === c ? "var(--color-rose-soft)" : "var(--color-surface)", color: category === c ? "var(--color-rose-deep)" : "var(--color-ink-soft)", borderColor: category === c ? "var(--color-rose-line)" : "var(--color-line)" }}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLowOnly((v) => !v)}
                title="재고관리 중이면서 재고 3개 이하인 상품만"
                style={{ ...chipBase, background: lowOnly ? "var(--color-danger-bg)" : "var(--color-surface)", color: lowOnly ? "var(--color-danger-tx)" : "var(--color-ink-soft)", borderColor: lowOnly ? "var(--color-danger-tx)" : "var(--color-line)" }}
              >
                🔥 재고임박
              </button>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as "default" | "latest" | "stock_low")}
                style={{ marginLeft: "auto", height: "28px", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)", fontSize: "11px", fontWeight: 800, padding: "0 8px", cursor: "pointer" }}
              >
                <option value="default">기본순 (고정 우선)</option>
                <option value="latest">최신 등록순</option>
                <option value="stock_low">재고 적은순</option>
              </select>
            </div>

            {/* 상품 목록 (무한스크롤) */}
            <div style={{ flex: 1, minHeight: "400px", overflowY: "auto", padding: "0 18px 16px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>불러오는 중…</div>
              ) : visible.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>상품이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {visible.map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const state = widgetState(p);
                    const busy = busyId === id;
                    const widgetStyle: React.CSSProperties =
                      state === "rotating"
                        ? { background: "var(--color-rose-soft)", color: "var(--color-rose-deep)", border: "1px solid var(--color-rose-line)" }
                        : state === "pinned"
                          ? { background: "var(--color-ok-bg)", color: "var(--color-ok-tx)", border: "1px solid var(--color-ok-tx)" }
                          : { background: "var(--color-rose-deep)", color: "#fff", border: "none" };
                    const widgetText = state === "rotating" ? "▶ 순환 해제" : state === "pinned" ? "📌 고정 해제" : "▶ 순환 추가";
                    return (
                      <div key={id || productName(p)} style={{ display: "flex", gap: "12px", alignItems: "center", border: "1px solid var(--color-line)", borderRadius: "12px", padding: "10px" }}>
                        {/* 사진 88px 클릭 확대 */}
                        <button
                          type="button"
                          onClick={() => img && setLightbox(img)}
                          style={{ width: "88px", height: "88px", flexShrink: 0, borderRadius: "10px", overflow: "hidden", background: "var(--color-surface-2)", border: "none", padding: 0, cursor: img ? "zoom-in" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "26px" }}>🖼</span>}
                        </button>

                        {/* 정보 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                          <div style={{ marginTop: "3px", fontSize: "14px", fontWeight: 800, color: "var(--color-rose-deep)" }}>{money(productPrice(p))}</div>
                          <div style={{ marginTop: "5px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "var(--color-info-bg)", color: "var(--color-info-tx)" }}>{shippingLabel(p)}</span>
                            {productCategory(p) ? <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "var(--color-surface-3)", color: "var(--color-ink-soft)" }}>{productCategory(p)}</span> : null}
                            {(() => {
                              const s = lowStockOf(p);
                              if (s === null || s > 3) return null;
                              return <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "var(--color-danger-bg)", color: "var(--color-danger-tx)" }}>{s <= 0 ? "⛔ 품절" : `🔥 재고 ${s}`}</span>;
                            })()}
                          </div>
                          {/* 재고 표시 + 인라인 수정 (총재고 상품만 · 옵션 상품은 수정 폼 유도) */}
                          {(() => {
                            const m = stockMetaOf(p);
                            if (!m.managed || m.stock === null) return null;
                            if (m.hasVariants) {
                              return (
                                <div style={{ marginTop: "5px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>
                                  재고 {m.stock.toLocaleString("ko-KR")}개
                                  <button type="button" onClick={() => editProduct(p)} title="옵션별 재고는 수정 폼에서 변경" style={{ marginLeft: "5px", fontSize: "10px", fontWeight: 800, color: "var(--color-info-tx)", background: "var(--color-info-bg)", border: "none", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>옵션별 수정</button>
                                </div>
                              );
                            }
                            if (inlineStockId !== id) {
                              return (
                                <div style={{ marginTop: "5px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>
                                  재고 {m.stock.toLocaleString("ko-KR")}개
                                  <button type="button" onClick={() => { setInlineStockId(id); setInlineStockText(String(m.stock)); }} style={{ marginLeft: "5px", fontSize: "10px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>✎ 수정</button>
                                </div>
                              );
                            }
                            return (
                              <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                                <input
                                  value={inlineStockText}
                                  onChange={(e) => setInlineStockText(e.target.value.replace(/[^0-9]/g, ""))}
                                  inputMode="numeric"
                                  autoFocus
                                  onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") void saveInlineStock(p); if (e.key === "Escape") setInlineStockId(""); }}
                                  style={{ width: "64px", height: "26px", borderRadius: "6px", border: "1px solid var(--color-rose-line)", padding: "0 8px", fontSize: "12px", fontWeight: 800, textAlign: "right", color: "var(--color-ink)", background: "var(--color-surface)" }}
                                />
                                <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>개</span>
                                <button type="button" disabled={inlineStockSaving} onClick={() => void saveInlineStock(p)} style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", borderRadius: "5px", padding: "4px 9px", cursor: inlineStockSaving ? "wait" : "pointer", opacity: inlineStockSaving ? 0.6 : 1 }}>{inlineStockSaving ? "저장중…" : "저장"}</button>
                                <button type="button" onClick={() => setInlineStockId("")} style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "5px", padding: "4px 9px", cursor: "pointer" }}>취소</button>
                              </div>
                            );
                          })()}
                          {/* 원버튼 위젯 */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onWidgetClick(p)}
                            style={{ marginTop: "8px", height: "28px", borderRadius: "7px", padding: "0 12px", fontSize: "11px", fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1, ...widgetStyle }}
                          >
                            {busy ? "처리중…" : widgetText}
                          </button>
                        </div>

                        {/* 수정 / 삭제 — 오른쪽 끝 나란히 */}
                        <div style={{ display: "flex", flexDirection: "row", gap: "5px", flexShrink: 0, alignSelf: "flex-start" }}>
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
                            style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ok-tx, #0F6E56)", background: "var(--color-ok-bg, #E7F3EE)", border: "none", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}
                          >🔗 링크</button>
                          <button type="button" onClick={() => editProduct(p)} style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-info-tx)", background: "var(--color-info-bg)", border: "none", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}>수정</button>
                          <button type="button" onClick={() => duplicateProduct(p)} title="이 상품 내용으로 새 상품 등록 폼 열기" style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}>복제</button>
                          <button type="button" onClick={() => void deleteProduct(p)} style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-danger-tx)", background: "var(--color-danger-bg)", border: "none", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                  {/* 무한스크롤 sentinel */}
                  {visibleCount < filtered.length ? (
                    <div ref={sentinelRef} style={{ height: "1px" }} />
                  ) : (
                    <div style={{ textAlign: "center", padding: "10px 0", fontSize: "11px", color: "var(--color-ink-mute)" }}>총 {filtered.length}개</div>
                  )}
                </div>
              )}
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
          <div style={{ width: "520px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "14px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-rose-deep)" }}>📺 위젯 설정</span>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            {/* 순환 / 고정 모드 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 18px 6px" }}>
              <button type="button" onClick={() => wsSetMode("rotate")} style={{ flex: 1, height: "36px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (wsMode === "rotate" ? "var(--color-rose-deep)" : "var(--color-line)"), background: wsMode === "rotate" ? "var(--color-rose-deep)" : "var(--color-surface)", color: wsMode === "rotate" ? "#fff" : "var(--color-ink-soft)" }}>🔁 순환모드</button>
              <button type="button" onClick={() => wsSetMode("pin")} style={{ flex: 1, height: "36px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (wsMode === "pin" ? "var(--color-rose-deep)" : "var(--color-line)"), background: wsMode === "pin" ? "var(--color-rose-deep)" : "var(--color-surface)", color: wsMode === "pin" ? "#fff" : "var(--color-ink-soft)" }}>📌 고정모드</button>
            </div>
            <div style={{ padding: "0 18px 8px", fontSize: "11px", color: "var(--color-ink-mute)", fontWeight: 700 }}>
              {wsMode === "rotate" ? "선택 상품을 방송 순환목록에 담습니다." : "선택 상품을 지금 띄운 상품으로 고정합니다."}
            </div>

            {/* 전체선택 (고정모드는 단일 선택이라 비활성) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 18px", borderTop: "1px solid var(--color-surface-2)", borderBottom: "1px solid var(--color-surface-2)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 800, color: wsMode === "pin" ? "var(--color-ink-mute)" : "var(--color-ink-soft)", cursor: wsMode === "pin" ? "default" : "pointer" }}>
                <input type="checkbox" checked={wsMode === "pin" ? false : wsAllChecked} disabled={wsMode === "pin"} onChange={wsToggleAll} />
                전체선택
              </label>
              <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)" }}>✓ {wsSelected.size}개 선택</span>
            </div>

            {/* 상품 목록(개별선택) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px" }}>
              {products.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>상품이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {[...products]
                    .sort(
                      (a, b) =>
                        (pickBoolean(a, ["is_pinned", "pinned"], false) ? 0 : 1) -
                        (pickBoolean(b, ["is_pinned", "pinned"], false) ? 0 : 1),
                    )
                    .map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const checked = wsSelected.has(id);
                    return (
                      <label key={id || productName(p)} style={{ display: "flex", gap: "9px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "9px", padding: "7px 10px", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => wsToggle(id)} />
                        <span style={{ width: "34px", height: "34px", flexShrink: 0, borderRadius: "7px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "16px" }}>🖼</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                          <span style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>{money(productPrice(p))}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 18px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ height: "38px", padding: "0 16px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)" }}>취소</button>
              <button type="button" onClick={copyWidgetUrl} style={{ height: "38px", padding: "0 14px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (copied ? "var(--color-ok-tx)" : "var(--color-line)"), background: copied ? "var(--color-ok-bg)" : "var(--color-surface)", color: copied ? "var(--color-ok-tx)" : "var(--color-ink-soft)", whiteSpace: "nowrap" }}>
                {copied ? "복사됐어요!" : "🔗 위젯 주소 복사"}
              </button>
              <button type="button" disabled={wsSaving || wsSelected.size === 0} onClick={wsConfirm} style={{ flex: 1, height: "38px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: wsSaving || wsSelected.size === 0 ? "default" : "pointer", border: "none", background: wsSaving || wsSelected.size === 0 ? "var(--color-rose-line)" : "var(--color-rose-deep)", color: "#fff" }}>
                {wsSaving ? "처리중…" : wsMode === "rotate" ? `선택 ${wsSelected.size}개 순환 담기` : `선택 ${wsSelected.size}개 고정`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 사진 확대 lightbox */}
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
          <div style={{ width: "520px", maxWidth: "100%", height: "600px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "14px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-rose-deep)" }}>방송에 상품 담기</span>
              <button type="button" onClick={() => setBcPickerOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            {/* 불러올 범위(전체 창고/지난 방송) + 검색 */}
            <div style={{ padding: "12px 18px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <select
                value={bcPickerFromBcId}
                onChange={(e) => void changeBcPickerFrom(e.target.value)}
                style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", fontWeight: 700, outline: "none", color: "var(--color-ink)", background: "var(--color-surface)" }}
              >
                <option value="">📦 전체 창고에서 담기</option>
                {bcList.filter((b) => b.id !== bcSelId).map((b) => {
                  const d = new Date(b.started_at);
                  const dateLabel = Number.isNaN(d.getTime()) ? "" : ` (${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")})`;
                  return <option key={b.id} value={b.id}>📺 {b.title}{dateLabel} 방송에서 불러오기</option>;
                })}
              </select>
              <input value={bcPickerSearch} onChange={(e) => setBcPickerSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none", color: "var(--color-ink)" }} />
            </div>
            {/* 목록 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 8px" }}>
              {(() => {
                const q = bcPickerSearch.trim().toLowerCase();
                const pickList = products.filter((p) => {
                  if (pickString(p, ["status"], "") === "deleted") return false;
                  if (bcPickerFromBcId && bcPickerFromIds && !bcPickerFromIds.has(productId(p))) return false;
                  if (q && !productName(p).toLowerCase().includes(q)) return false;
                  return true;
                });
                if (pickList.length === 0) {
                  return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>{bcPickerFromBcId ? "그 방송에 담았던 상품이 없습니다." : "상품이 없습니다."}</div>;
                }
                const selectableIds = pickList.map((p) => productId(p)).filter((pid) => pid && !bcAddedIds.has(pid));
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {bcPickerFromBcId && selectableIds.length > 0 ? (
                      <button type="button" onClick={() => setBcPickerSel((prev) => new Set([...prev, ...selectableIds]))} style={{ alignSelf: "flex-start", fontSize: "11px", fontWeight: 800, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "7px", padding: "5px 10px", cursor: "pointer" }}>☑ 표시된 {selectableIds.length}개 모두 선택 (담긴 것 제외)</button>
                    ) : null}
                    {pickList.map((p, i) => {
                      const pid = productId(p);
                      const already = bcAddedIds.has(pid);
                      const checked = bcPickerSel.has(pid);
                      const img = mainImage(p);
                      return (
                        <label key={pid || i} style={{ display: "flex", gap: "9px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: already ? "var(--color-surface-2)" : checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "9px", padding: "7px 10px", cursor: already ? "not-allowed" : "pointer", opacity: already ? 0.55 : 1 }}>
                          <input type="checkbox" disabled={already} checked={already || checked} onChange={() => !already && toggleBcPick(pid)} style={{ width: "16px", height: "16px", flexShrink: 0, accentColor: "var(--color-rose-deep)" }} />
                          <span style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "7px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "16px" }}>🖼</span>}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                            <span style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>{money(productPrice(p))}{already ? " · 담김" : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* 푸터 */}
            <div style={{ display: "flex", gap: "8px", padding: "12px 18px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setBcPickerOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>취소</button>
              <button type="button" disabled={bcPickerSel.size === 0 || bcBusy} onClick={() => void confirmBcPick()} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", cursor: bcPickerSel.size === 0 || bcBusy ? "not-allowed" : "pointer", opacity: bcPickerSel.size === 0 || bcBusy ? 0.5 : 1 }}>{bcBusy ? "담는 중…" : `선택 ${bcPickerSel.size}개 담기`}</button>
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
          <div style={{ width: "520px", maxWidth: "100%", height: "600px", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "14px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-rose-deep)" }}>쇼핑몰에 상품 진열</span>
              <button type="button" onClick={() => setShopPickerOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            {/* 검색 */}
            <div style={{ padding: "12px 18px 8px" }}>
              <input value={shopPickerSearch} onChange={(e) => setShopPickerSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none", color: "var(--color-ink)" }} />
            </div>
            {/* 목록 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 8px" }}>
              {(() => {
                const q = shopPickerSearch.trim().toLowerCase();
                const pickList = products.filter((p) => {
                  if (pickString(p, ["status"], "") === "deleted") return false;
                  if (q && !productName(p).toLowerCase().includes(q)) return false;
                  return true;
                });
                if (pickList.length === 0) {
                  return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>상품이 없습니다.</div>;
                }
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pickList.map((p, i) => {
                      const pid = productId(p);
                      const already = shopAddedIds.has(pid);
                      const checked = shopPickerSel.has(pid);
                      const img = mainImage(p);
                      return (
                        <label key={pid || i} style={{ display: "flex", gap: "9px", alignItems: "center", border: "1px solid " + (checked ? "var(--color-rose-line)" : "var(--color-line)"), background: already ? "var(--color-surface-2)" : checked ? "var(--color-rose-soft)" : "var(--color-surface)", borderRadius: "9px", padding: "7px 10px", cursor: already ? "not-allowed" : "pointer", opacity: already ? 0.55 : 1 }}>
                          <input type="checkbox" disabled={already} checked={already || checked} onChange={() => !already && toggleShopPick(pid)} style={{ width: "16px", height: "16px", flexShrink: 0, accentColor: "var(--color-rose-deep)" }} />
                          <span style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "7px", overflow: "hidden", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "16px" }}>🖼</span>}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                            <span style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>{money(productPrice(p))}{already ? " · 진열됨" : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* 푸터 */}
            <div style={{ display: "flex", gap: "8px", padding: "12px 18px", borderTop: "1px solid var(--color-line)" }}>
              <button type="button" onClick={() => setShopPickerOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>취소</button>
              <button type="button" disabled={shopPickerSel.size === 0 || shopBusy} onClick={() => void confirmShopPick()} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", cursor: shopPickerSel.size === 0 || shopBusy ? "not-allowed" : "pointer", opacity: shopPickerSel.size === 0 || shopBusy ? 0.5 : 1 }}>{shopBusy ? "진열 중…" : `선택 ${shopPickerSel.size}개 진열`}</button>
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
          <div style={{ width: "380px", maxWidth: "100%", background: "var(--color-surface)", borderRadius: "14px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-rose-deep)" }}>새 방송 만들기</span>
              <button type="button" onClick={() => setNewBcOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "16px 18px" }}>
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
                style={{ width: "100%", height: "40px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none", color: "var(--color-ink)" }}
              />
              {newBcCopyIds && newBcCopyIds.length > 0 ? (
                <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 700, color: "var(--color-rose-deep)", background: "var(--color-rose-soft)", border: "1px solid var(--color-rose-line)", borderRadius: "7px", padding: "7px 10px" }}>☑ 선택한 상품 {newBcCopyIds.length}개가 새 방송에 그대로 담깁니다.</div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "8px", padding: "0 18px 16px" }}>
              <button type="button" onClick={() => setNewBcOpen(false)} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "var(--color-ink-soft)", background: "var(--color-surface)", border: "1px solid var(--color-line)", cursor: "pointer" }}>취소</button>
              <button type="button" disabled={!newBcTitle.trim() || bcBusy} onClick={() => void submitNewBroadcast()} style={{ flex: 1, height: "40px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", border: "none", cursor: !newBcTitle.trim() || bcBusy ? "not-allowed" : "pointer", opacity: !newBcTitle.trim() || bcBusy ? 0.5 : 1 }}>{bcBusy ? "만드는 중…" : "만들기"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
