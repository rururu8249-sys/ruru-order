"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import { showAdminToast } from "@/lib/adminToast";

type ProductRow = Record<string, unknown>;

type Props = {
  activeBroadcastId?: string | number | null;
  onClose: () => void;
};

const PAGE_STEP = 10;
const BASE_CATEGORIES = ["전체", "신발", "의류", "잡화"];

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
  if (m === "shop") return "상시전용";
  return "방송+상시";
}

function productCategory(p: ProductRow) {
  const note = parseProductNote(p);
  return String((note as { category?: unknown }).category || "").trim();
}

const productId = (p: ProductRow) => pickString(p, ["id", "product_id"], "");

export default function AdminLiveProductManagePopup({ activeBroadcastId, onClose }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [rotationIds, setRotationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"products" | "history">("products");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [lightbox, setLightbox] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState("");
  // 위젯 설정(일괄) 화면
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const [wsMode, setWsMode] = useState<"rotate" | "pin">("rotate");
  const [wsSelected, setWsSelected] = useState<Set<string>>(new Set());
  const [wsSaving, setWsSaving] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "전체" && productCategory(p) !== category) return false;
      if (q && !productName(p).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, category]);

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
      await supabase.from("products").update({ is_pinned: false }).eq("is_pinned", true);
      const { data: existing } = await supabase
        .from("broadcast_products")
        .select("product_id")
        .eq("broadcast_id", activeBroadcastId)
        .eq("product_id", id);
      if (!existing || existing.length === 0) {
        const { error } = await supabase
          .from("broadcast_products")
          .insert({ broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 });
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
      const { error } = await supabase
        .from("broadcast_products")
        .delete()
        .eq("broadcast_id", activeBroadcastId)
        .eq("product_id", id);
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
      const { error } = await supabase.from("products").update({ is_pinned: false }).eq("id", id);
      if (error) throw error;
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast("고정을 해제했어요.", "success");
    } catch (e) {
      showAdminToast("고정 해제 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
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
  };

  const editProduct = (p: ProductRow) => {
    window.dispatchEvent(new CustomEvent("ruru-edit-quick-product", { detail: p }));
  };

  const deleteProduct = async (p: ProductRow) => {
    const id = productId(p);
    if (!id) return;
    if (!window.confirm(`"${productName(p)}" 상품을 삭제할까요?\n\n삭제 후 복구할 수 없습니다.`)) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      showAdminToast("상품을 삭제했어요.", "success");
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      await loadProducts();
    } catch (e) {
      showAdminToast("상품 삭제 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    }
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

  // 일괄 전체선택/개별선택
  const wsToggle = (id: string) => {
    if (!id) return;
    setWsSelected((prev) => {
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
      await supabase.from("products").update({ is_pinned: false }).eq("is_pinned", true);
      const { data: existing } = await supabase
        .from("broadcast_products")
        .select("product_id")
        .eq("broadcast_id", activeBroadcastId);
      const existingSet = new Set(((existing as { product_id: unknown }[]) || []).map((r) => String(r.product_id)));
      const toInsert = ids
        .filter((id) => !existingSet.has(String(id)))
        .map((id) => ({ broadcast_id: activeBroadcastId, product_id: id, sort_order: 0 }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("broadcast_products").insert(toInsert);
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
      await supabase.from("products").update({ is_pinned: false }).eq("is_pinned", true);
      const { error } = await supabase.from("products").update({ is_pinned: true }).in("id", ids);
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

  const chipBase: React.CSSProperties = { padding: "5px 12px", borderRadius: "16px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid #D9C5CC" };
  const topBtn: React.CSSProperties = { height: "36px", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };

  return createPortal(
    <div
      className="ruru-product-sian"
      style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.45)", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "600px", maxWidth: "100%", flexShrink: 0, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "14px", overflow: "hidden" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #E8E2DD" }}>
          <span style={{ fontSize: "16px", fontWeight: 800, color: "#7B2D43" }}>📦 상품 관리</span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* 탭 2개 */}
        <div style={{ display: "flex", gap: "2px", padding: "0 18px", borderBottom: "1px solid #E8E2DD" }}>
          {([["products", "상품"], ["history", "기록"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{ padding: "11px 16px", fontSize: "13px", fontWeight: 800, background: "none", border: "none", borderBottom: "2px solid " + (tab === k ? "#7B2D43" : "transparent"), color: tab === k ? "#7B2D43" : "#888", cursor: "pointer" }}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "history" ? (
          <div style={{ padding: "70px 0", textAlign: "center", color: "#999", fontSize: "13px", fontWeight: 700 }}>기록 기능은 준비 중입니다.</div>
        ) : (
          <>
            {/* 상단 버튼 3개 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 18px 8px" }}>
              <button type="button" onClick={openCreate} style={{ ...topBtn, background: "#7B2D43", color: "#fff", border: "none" }}>+ 상품 등록</button>
              <button type="button" onClick={openWidgetSettings} style={{ ...topBtn, background: "#fff", color: "#555", border: "1px solid #E8E2DD" }}>📺 위젯 설정</button>
              <button type="button" onClick={copyWidgetUrl} style={{ ...topBtn, background: copied ? "#E7F3EE" : "#fff", color: copied ? "#0F6E56" : "#555", border: "1px solid " + (copied ? "#0F6E56" : "#E8E2DD") }}>
                {copied ? "복사됐어요!" : "🔗 위젯 주소 복사"}
              </button>
            </div>

            {/* 검색 */}
            <div style={{ padding: "0 18px 8px" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 상품명 검색" style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid #E8E2DD", padding: "0 12px", fontSize: "13px", fontWeight: 600, outline: "none" }} />
            </div>

            {/* 카테고리 칩 */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "0 18px 10px" }}>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{ ...chipBase, background: category === c ? "#F5E6EB" : "#fff", color: category === c ? "#7B2D43" : "#888", borderColor: category === c ? "#D9C5CC" : "#E8E2DD" }}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 상품 목록 (무한스크롤) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 16px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#999", fontSize: "13px", fontWeight: 700 }}>불러오는 중…</div>
              ) : visible.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#999", fontSize: "13px", fontWeight: 700 }}>상품이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {visible.map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const state = widgetState(p);
                    const busy = busyId === id;
                    const widgetStyle: React.CSSProperties =
                      state === "rotating"
                        ? { background: "#F5E6EB", color: "#7B2D43", border: "1px solid #D9C5CC" }
                        : state === "pinned"
                          ? { background: "#E7F3EE", color: "#0F6E56", border: "1px solid #0F6E56" }
                          : { background: "#7B2D43", color: "#fff", border: "none" };
                    const widgetText = state === "rotating" ? "▶ 순환 해제" : state === "pinned" ? "📌 고정 해제" : "▶ 순환 추가";
                    return (
                      <div key={id || productName(p)} style={{ display: "flex", gap: "12px", alignItems: "center", border: "1px solid #E8E2DD", borderRadius: "12px", padding: "10px" }}>
                        {/* 사진 88px 클릭 확대 */}
                        <button
                          type="button"
                          onClick={() => img && setLightbox(img)}
                          style={{ width: "88px", height: "88px", flexShrink: 0, borderRadius: "10px", overflow: "hidden", background: "#F5F2EF", border: "none", padding: 0, cursor: img ? "zoom-in" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "26px" }}>🖼</span>}
                        </button>

                        {/* 정보 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                          <div style={{ marginTop: "3px", fontSize: "14px", fontWeight: 800, color: "#7B2D43" }}>{money(productPrice(p))}</div>
                          <div style={{ marginTop: "5px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "#F5E6EB", color: "#7B2D43" }}>{saleModeLabel(p)}</span>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "#E8F0FA", color: "#185FA5" }}>{shippingLabel(p)}</span>
                            {productCategory(p) ? <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", background: "#F1EFEC", color: "#777" }}>{productCategory(p)}</span> : null}
                          </div>
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

                        {/* 수정 / 삭제 */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flexShrink: 0 }}>
                          <button type="button" onClick={() => editProduct(p)} style={{ fontSize: "11px", fontWeight: 700, color: "#185FA5", background: "#E8F0FA", border: "none", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}>수정</button>
                          <button type="button" onClick={() => void deleteProduct(p)} style={{ fontSize: "11px", fontWeight: 700, color: "#C0392B", background: "#FBEAE7", border: "none", borderRadius: "6px", padding: "6px 11px", cursor: "pointer" }}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                  {/* 무한스크롤 sentinel */}
                  {visibleCount < filtered.length ? (
                    <div ref={sentinelRef} style={{ height: "1px" }} />
                  ) : (
                    <div style={{ textAlign: "center", padding: "10px 0", fontSize: "11px", color: "#bbb" }}>총 {filtered.length}개</div>
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
          <div style={{ width: "520px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "14px", overflow: "hidden" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #E8E2DD" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "#7B2D43" }}>📺 위젯 설정</span>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "20px", color: "#999", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            {/* 순환 / 고정 모드 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 18px 6px" }}>
              <button type="button" onClick={() => setWsMode("rotate")} style={{ flex: 1, height: "36px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (wsMode === "rotate" ? "#7B2D43" : "#E8E2DD"), background: wsMode === "rotate" ? "#7B2D43" : "#fff", color: wsMode === "rotate" ? "#fff" : "#666" }}>🔁 순환모드</button>
              <button type="button" onClick={() => setWsMode("pin")} style={{ flex: 1, height: "36px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (wsMode === "pin" ? "#7B2D43" : "#E8E2DD"), background: wsMode === "pin" ? "#7B2D43" : "#fff", color: wsMode === "pin" ? "#fff" : "#666" }}>📌 고정모드</button>
            </div>
            <div style={{ padding: "0 18px 8px", fontSize: "11px", color: "#999", fontWeight: 700 }}>
              {wsMode === "rotate" ? "선택 상품을 방송 순환목록에 담습니다." : "선택 상품을 지금 띄운 상품으로 고정합니다."}
            </div>

            {/* 전체선택 */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 18px", borderTop: "1px solid #F0EDEA", borderBottom: "1px solid #F0EDEA" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 800, color: "#555", cursor: "pointer" }}>
                <input type="checkbox" checked={wsAllChecked} onChange={wsToggleAll} />
                전체선택
              </label>
              <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "#7B2D43" }}>✓ {wsSelected.size}개 선택</span>
            </div>

            {/* 상품 목록(개별선택) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px" }}>
              {products.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "#999", fontSize: "13px", fontWeight: 700 }}>상품이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {products.map((p) => {
                    const id = productId(p);
                    const img = mainImage(p);
                    const checked = wsSelected.has(id);
                    return (
                      <label key={id || productName(p)} style={{ display: "flex", gap: "9px", alignItems: "center", border: "1px solid " + (checked ? "#D9C5CC" : "#E8E2DD"), background: checked ? "#F5E6EB" : "#fff", borderRadius: "9px", padding: "7px 10px", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => wsToggle(id)} />
                        <span style={{ width: "34px", height: "34px", flexShrink: 0, borderRadius: "7px", overflow: "hidden", background: "#F5F2EF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "16px" }}>🖼</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</span>
                          <span style={{ fontSize: "11px", color: "#888" }}>{money(productPrice(p))}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div style={{ display: "flex", gap: "6px", padding: "12px 18px", borderTop: "1px solid #E8E2DD" }}>
              <button type="button" onClick={() => setWidgetSettingsOpen(false)} style={{ height: "38px", padding: "0 16px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid #E8E2DD", background: "#fff", color: "#666" }}>취소</button>
              <button type="button" disabled={wsSaving || wsSelected.size === 0} onClick={wsConfirm} style={{ flex: 1, height: "38px", borderRadius: "9px", fontSize: "12px", fontWeight: 800, cursor: wsSaving || wsSelected.size === 0 ? "default" : "pointer", border: "none", background: wsSaving || wsSelected.size === 0 ? "#D9C5CC" : "#7B2D43", color: "#fff" }}>
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
    </div>,
    document.body,
  );
}
