"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import { showAdminToast } from "@/lib/adminToast";

type ProductRow = Record<string, unknown>;

type Props = {
  activeBroadcastId?: string | number | null;
  onClose: () => void;
};

type ProductTab = "broadcast" | "group_buy" | "all";

const PAGE_SIZE = 8;

// --- pick helpers (AdminLiveProductListPanel과 동일 규칙) ---
function pickString(row: ProductRow, keys: string[], fallback = "") {
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

function productTypeLabel(p: ProductRow) {
  return pickString(p, ["product_type", "type"], "broadcast") === "group_buy" ? "공구" : "방송상품";
}

function shippingLabel(p: ProductRow) {
  const t = pickString(p, ["shipping_type", "delivery_type"], "normal");
  if (t === "vendor") return "업체배송";
  if (t === "free") return "무료배송";
  return "일반배송";
}

function statusLabel(p: ProductRow): { label: string; cls: string } {
  const isSoldout = pickBoolean(p, ["is_soldout", "soldout"], false);
  const isVisible = pickBoolean(p, ["is_visible", "visible"], true);
  const status = pickString(p, ["status", "product_status"], "");
  if (isSoldout || status.includes("품절")) return { label: "품절", cls: "bg-rose-50 text-rose-700" };
  if (!isVisible || status.includes("숨김")) return { label: "숨김", cls: "bg-slate-100 text-slate-500" };
  return { label: "노출", cls: "bg-emerald-50 text-emerald-700" };
}

function createdDateKey(p: ProductRow) {
  const c = pickString(p, ["created_at", "updated_at"], "");
  return c ? c.slice(0, 10) : "";
}

export default function AdminLiveProductManagePopup({ activeBroadcastId, onClose }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ProductTab>("all");
  const [search, setSearch] = useState("");
  const [dateKey, setDateKey] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"rotate" | "pin">("rotate"); // 순환 / 고정

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

  useEffect(() => {
    loadProducts();
    const onUpdated = () => loadProducts();
    window.addEventListener("ruru-live-product-updated", onUpdated);
    return () => window.removeEventListener("ruru-live-product-updated", onUpdated);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, search, dateKey]);

  // 고정모드로 바꾸면 선택은 1개만 유지
  useEffect(() => {
    setSelected((prev) => (mode === "pin" && prev.size > 1 ? new Set([...prev].slice(0, 1)) : prev));
  }, [mode]);

  const productId = (p: ProductRow) => pickString(p, ["id", "product_id"], "");

  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const k = createdDateKey(p);
      if (k) set.add(k);
    });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const type = pickString(p, ["product_type", "type"], "broadcast");
      if (tab === "broadcast" && type === "group_buy") return false;
      if (tab === "group_buy" && type !== "group_buy") return false;
      if (dateKey && createdDateKey(p) !== dateKey) return false;
      if (q && !productName(p).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, tab, search, dateKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);

  const toggleSelect = (id: string) => {
    if (!id) return;
    setSelected((prev) => {
      // 고정모드: 1개만 선택(다른 선택 자동 해제). 순환모드: 다중선택.
      if (mode === "pin") {
        return prev.has(id) ? new Set<string>() : new Set<string>([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    window.dispatchEvent(new Event("ruru-open-quick-product-panel"));
  };

  const addToRotation = async () => {
    const ids = [...selected].filter(Boolean);
    if (ids.length === 0) return;
    if (!activeBroadcastId) {
      showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 먼저 시작한 뒤 순환에 담아주세요.", "warning");
      return;
    }
    setSaving(true);
    try {
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
      const added = toInsert.length;
      const skipped = ids.length - added;
      showAdminToast(
        `방송 순환에 ${added}개 담았어요.${skipped > 0 ? ` (이미 담긴 ${skipped}개 제외)` : ""}`,
        "success",
      );
      setSelected(new Set());
    } catch (e) {
      showAdminToast("순환 담기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSaving(false);
    }
  };

  // 고정모드: 선택 상품을 is_pinned로 고정(지금 띄운 상품). 기존 고정은 해제하고 선택만 고정.
  const pinSelected = async () => {
    const ids = [...selected].filter(Boolean);
    if (ids.length === 0) return;
    setSaving(true);
    try {
      await supabase.from("products").update({ is_pinned: false }).eq("is_pinned", true);
      const { error } = await supabase.from("products").update({ is_pinned: true }).in("id", ids);
      if (error) throw error;
      window.dispatchEvent(new Event("ruru-live-product-updated"));
      showAdminToast(`${ids.length}개 상품을 고정(지금 띄움)했어요.`, "success");
      setSelected(new Set());
    } catch (e) {
      showAdminToast("상품 고정 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = () => (mode === "pin" ? pinSelected() : addToRotation());

  // 수정: 새 상품 등록 폼을 edit 모드로 (상품 detail 전달)
  const editProduct = (p: ProductRow) => {
    onClose();
    window.dispatchEvent(new CustomEvent("ruru-edit-quick-product", { detail: p }));
  };

  // 삭제: confirm 후 products delete + 재로드
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

  const tabs: [ProductTab, string][] = [
    ["broadcast", "방송상품"],
    ["group_buy", "공구·상시판매"],
    ["all", "전체 창고"],
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ruru-product-sian"
      style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.45)", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "560px", flexShrink: 0, maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#fff", borderRadius: "12px", padding: "17px" }}>

        {/* 헤더 */}
        <div className="mh">
          <span className="mt" style={{ color: "#222" }}>📦 관리</span>
          <button type="button" className="x" onClick={onClose}>✕</button>
        </div>

        {/* 순환 / 고정 모드 토글 */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "11px" }}>
          <button type="button" onClick={() => setMode("rotate")}
            className="btn" style={mode === "rotate" ? { background: "var(--rose)", color: "#fff", borderColor: "var(--rose)" } : {}}>🔁 순환모드</button>
          <button type="button" onClick={() => setMode("pin")}
            className="btn" style={mode === "pin" ? { background: "var(--rose)", color: "#fff", borderColor: "var(--rose)" } : {}}>📌 고정모드</button>
          <span className="note" style={{ marginLeft: "auto", alignSelf: "center" }}>{mode === "rotate" ? "선택 상품을 방송 순환목록에 담습니다" : "선택 상품을 지금 띄운 상품으로 고정합니다"}</span>
        </div>

        {/* 서브탭 */}
        <div className="subtabs">
          {tabs.map(([key, label]) => (
            <span key={key} className={`st ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>{label}</span>
          ))}
          <button type="button" className="btn rose" style={{ marginLeft: "auto" }} onClick={openCreate}>+ 새 상품 등록</button>
        </div>

        {/* 필터 */}
        <div className="filters">
          <input className="ipt" style={{ flex: 1 }} placeholder="🔍 상품명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="ipt" value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
            <option value="">전체 기간</option>
            {dateOptions.map((d) => (<option key={d} value={d}>{d} 올림</option>))}
          </select>
          {selected.size > 0 ? (
            <span style={{ fontSize: "11px", color: "var(--rose)" }}>✓ {selected.size}개 선택 → {mode === "rotate" ? "순환" : "고정"}</span>
          ) : null}
        </div>

        {/* 상품 그리드 */}
        {loading ? (
          <div className="note" style={{ textAlign: "center", padding: "30px 0" }}>불러오는 중…</div>
        ) : pageItems.length === 0 ? (
          <div className="note" style={{ textAlign: "center", padding: "30px 0" }}>상품이 없습니다.</div>
        ) : (
          <div className="grid2">
            {pageItems.map((p) => {
              const id = productId(p);
              const isSel = selected.has(id);
              const img = mainImage(p);
              return (
                <div key={id || productName(p)} className={`pgrid ${isSel ? "sel" : ""}`} onClick={() => toggleSelect(id)}>
                  <input type="checkbox" readOnly checked={isSel} />
                  <span className="ph2" style={{ width: "42px", height: "42px" }}>
                    {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🖼"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName(p)}</div>
                    <div style={{ fontSize: "11px", color: "var(--mut)" }}>{money(productPrice(p))}</div>
                    <div style={{ marginTop: "3px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <span className="badge" style={{ background: "var(--rose-bg)", color: "var(--rose)" }}>{productTypeLabel(p)}</span>
                      <span className="badge" style={{ background: "var(--blue-bg)", color: "var(--blue)" }}>{shippingLabel(p)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); editProduct(p); }} style={{ fontSize: "10px", fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "none", borderRadius: "5px", padding: "4px 8px", cursor: "pointer" }}>수정</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); void deleteProduct(p); }} style={{ fontSize: "10px", fontWeight: 700, color: "var(--red)", background: "#fdecec", border: "none", borderRadius: "5px", padding: "4px 8px", cursor: "pointer" }}>삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 푸터 */}
        <div className="mfoot">
          <span className="note">
            <span style={{ cursor: page > 1 ? "pointer" : "default", opacity: page > 1 ? 1 : 0.3 }} onClick={() => page > 1 && setPage((v) => v - 1)}>‹ </span>
            {page} / {totalPages}
            <span style={{ cursor: page < totalPages ? "pointer" : "default", opacity: page < totalPages ? 1 : 0.3 }} onClick={() => page < totalPages && setPage((v) => v + 1)}> ›</span>
          </span>
          <span className="r">
            <button type="button" className="btn" onClick={onClose}>취소</button>
            <button type="button" className="btn rose" disabled={saving || selected.size === 0} onClick={confirmAction}>
              {saving ? "처리중…" : mode === "rotate" ? `선택 상품 순환 담기${selected.size > 0 ? ` (${selected.size})` : ""}` : `선택 상품 고정${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </span>
        </div>

      </div>
    </div>,
    document.body,
  );
}
