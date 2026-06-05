"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [tab, setTab] = useState<ProductTab>("broadcast");
  const [search, setSearch] = useState("");
  const [dateKey, setDateKey] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

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

  const tabs: [ProductTab, string][] = [
    ["broadcast", "방송상품"],
    ["group_buy", "공구·상시판매"],
    ["all", "전체 창고"],
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
          <span className="text-[15px] font-black text-slate-950">📦 상품 관리</span>
          <button type="button" onClick={onClose} className="text-lg leading-none text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-100 px-5 pt-3 pb-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                "rounded-lg px-3 py-1.5 text-[12px] font-black transition",
                tab === key ? "bg-rose-deep text-white" : "text-slate-500 hover:bg-slate-100",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="ml-auto rounded-lg bg-rose-deep px-3 py-1.5 text-[12px] font-black text-white hover:bg-rose-deep/90"
          >
            + 새 상품 등록
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상품명 검색"
            className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-rose-line"
          />
          <select
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-600 outline-none"
          >
            <option value="">전체 기간</option>
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {d} 올림
              </option>
            ))}
          </select>
          {selected.size > 0 ? (
            <span className="text-[11px] font-black text-rose-deep">✓ {selected.size}개 선택 → 순환</span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : pageItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">상품이 없습니다.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {pageItems.map((p) => {
                const id = productId(p);
                const isSel = selected.has(id);
                const img = mainImage(p);
                const st = statusLabel(p);
                return (
                  <button
                    key={id || productName(p)}
                    type="button"
                    onClick={() => toggleSelect(id)}
                    className={[
                      "flex items-center gap-2 rounded-xl border p-2 text-left transition",
                      isSel ? "border-rose-deep bg-rose-soft/40 ring-1 ring-rose-line" : "border-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <input type="checkbox" readOnly checked={isSel} className="accent-rose-deep" />
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-300">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : "🖼"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-black text-slate-900">{productName(p)}</span>
                      <span className="block text-[12px] font-black text-rose-deep">{money(productPrice(p))}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        <span className="rounded bg-rose-soft px-1.5 py-0.5 text-[9px] font-black text-rose-deep">{productTypeLabel(p)}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500">{shippingLabel(p)}</span>
                        <span className={["rounded px-1.5 py-0.5 text-[9px] font-black", st.cls].join(" ")}>{st.label}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-rose-line px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-1 disabled:opacity-30">
              ‹
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-1 disabled:opacity-30">
              ›
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 hover:bg-slate-50">
              취소
            </button>
            <button
              type="button"
              disabled={saving || selected.size === 0}
              onClick={addToRotation}
              className="h-9 rounded-xl bg-rose-deep px-4 text-xs font-black text-white hover:bg-rose-deep/90 disabled:bg-slate-300"
            >
              {saving ? "담는 중…" : `선택 상품 순환 담기${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
