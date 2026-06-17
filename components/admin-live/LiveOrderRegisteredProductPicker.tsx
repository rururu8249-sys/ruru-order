"use client";

// 목적: 관리자 주문상세에서 "등록상품"을 골라 주문에 추가 (#3 3단계, 재고차감).
//   - products 조회 → 이름 검색 → 상품 선택 → 옵션(variant) 선택 → 수량/단가 → onAdd 호출.
//   - 옵션(색상/사이즈)은 자유입력이 아니라 상품 variant 객체에서 그대로 전달 → 재고 키 일치 보장.
//   - 실제 재고 차감/카드 vat/그룹필드 복사는 admin_add_order_item RPC가 처리(여기선 입력만 수집).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import type { LiveOrderRegisteredAddInput } from "./useLiveOrderItemAdd";

type ProductRow = Record<string, unknown>;

type Variant = { color: string; size: string; stock: number | null };

function pickString(row: ProductRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return fallback;
}

function pickNumber(row: ProductRow, keys: string[], fallback = 0) {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
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

const productId = (p: ProductRow) => pickString(p, ["id", "product_id"], "");
const productName = (p: ProductRow) => pickString(p, ["product_name", "name", "title"], "상품명 없음");
const productPrice = (p: ProductRow) => pickNumber(p, ["price", "sale_price", "selling_price"], 0);
const productStatus = (p: ProductRow) => pickString(p, ["status"], "");

function mainImage(p: ProductRow) {
  const direct = pickString(p, ["image_url", "cover_image_url", "main_image_url", "thumbnail_url"], "");
  return direct ? resolveProductImageUrl(direct) : "";
}

// 재고관리 ON 여부 (RPC와 동일 판정: 명시적 false 계열만 OFF)
function stockManaged(note: Record<string, unknown>) {
  const v = String(note["stock_management_enabled"] ?? "true").toLowerCase();
  return !["false", "f", "0", "no", "n"].includes(v);
}

function readVariants(p: ProductRow): Variant[] {
  const note = parseProductNote(p);
  const arr = note["stock_variants"];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((raw) => {
      const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const stockRaw = v["stock"];
      const stock =
        typeof stockRaw === "number"
          ? stockRaw
          : typeof stockRaw === "string" && /^\d+$/.test(stockRaw.trim())
            ? Number(stockRaw.trim())
            : null;
      return {
        color: String(v["color"] ?? "").trim(),
        size: String(v["size"] ?? "").trim(),
        stock,
      };
    });
}

type Props = {
  // 입력 수집 후 부모가 RPC 호출 + 낙관적 갱신. 성공 시 true 반환 → 폼 초기화.
  onAdd: (input: LiveOrderRegisteredAddInput) => Promise<boolean>;
  adding: boolean;
};

export default function LiveOrderRegisteredProductPicker({ onAdd, adding }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [variantIdx, setVariantIdx] = useState<number>(-1); // -1 = 옵션없음/미선택
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("products").select("*");
        if (error) throw error;
        if (alive) setProducts((data as ProductRow[]) || []);
      } catch (e) {
        showAdminToast("상품 불러오기 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => productStatus(p) !== "deleted")
      .filter((p) => (q ? productName(p).toLowerCase().includes(q) : true))
      .slice(0, 30);
  }, [products, search]);

  const selected = useMemo(
    () => products.find((p) => productId(p) === selectedId) || null,
    [products, selectedId]
  );
  const variants = useMemo(() => (selected ? readVariants(selected) : []), [selected]);
  const note = useMemo(() => (selected ? parseProductNote(selected) : {}), [selected]);
  const managed = useMemo(() => stockManaged(note), [note]);
  const totalStock = useMemo(() => (selected ? pickNumber(selected, ["stock"], 0) : 0), [selected]);

  const onSelectProduct = (p: ProductRow) => {
    setSelectedId(productId(p));
    setVariantIdx(-1);
    setUnitPrice(String(productPrice(p) || ""));
    setQty("1");
  };

  const reset = () => {
    setSelectedId("");
    setVariantIdx(-1);
    setQty("1");
    setUnitPrice("");
    setSearch("");
  };

  const handleAdd = async () => {
    if (!selected) {
      showAdminToast("상품을 선택해주세요.", "warning");
      return;
    }
    // 옵션 있는 상품은 옵션 선택 필수
    if (variants.length > 0 && variantIdx < 0) {
      showAdminToast("옵션(색상/사이즈)을 선택해주세요.", "warning");
      return;
    }
    const chosen = variantIdx >= 0 ? variants[variantIdx] : null;
    const input: LiveOrderRegisteredAddInput = {
      productId: Number(productId(selected)),
      productName: productName(selected),
      color: chosen ? chosen.color : "",
      size: chosen ? chosen.size : "",
      qty: Number(String(qty).replace(/[^\d]/g, "")) || 0,
      unitPrice: Number(String(unitPrice).replace(/[^\d]/g, "")) || 0,
    };
    const ok = await onAdd(input);
    if (ok) reset();
  };

  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-rose-200 bg-rose-soft/50 p-3">
      <div className="text-[11px] font-black text-rose-deep">등록상품 추가 (재고 차감)</div>

      {/* 검색 */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="상품명 검색"
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
      />

      {/* 상품 목록 */}
      <div className="max-h-[180px] space-y-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="py-3 text-center text-[12px] font-bold text-slate-400">불러오는 중...</div>
        ) : visibleProducts.length === 0 ? (
          <div className="py-3 text-center text-[12px] font-bold text-slate-400">상품이 없습니다.</div>
        ) : (
          visibleProducts.map((p) => {
            const id = productId(p);
            const img = mainImage(p);
            const active = id === selectedId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectProduct(p)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                  active ? "border-rose-deep bg-rose-soft" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-9 w-9 flex-none rounded-md object-cover" />
                ) : (
                  <span className="h-9 w-9 flex-none rounded-md bg-slate-100" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-black text-slate-900">{productName(p)}</span>
                  <span className="block text-[11px] font-bold text-slate-500">
                    {productPrice(p).toLocaleString("ko-KR")}원
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* 선택된 상품 옵션 + 수량/단가 */}
      {selected ? (
        <div className="space-y-2 rounded-xl border border-rose-100 bg-white p-2">
          <div className="text-[12px] font-black text-slate-900">{productName(selected)}</div>

          {variants.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {variants.map((v, i) => {
                const label = [v.color, v.size].filter(Boolean).join(" / ") || "기본";
                const out = managed && typeof v.stock === "number" && v.stock <= 0;
                const active = i === variantIdx;
                return (
                  <button
                    key={`${v.color}__${v.size}__${i}`}
                    type="button"
                    disabled={out}
                    onClick={() => setVariantIdx(i)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-black ${
                      active
                        ? "border-rose-deep bg-rose-deep text-white"
                        : out
                          ? "border-slate-200 bg-slate-100 text-slate-300"
                          : "border-slate-200 bg-white text-slate-700 hover:border-rose-deep"
                    }`}
                  >
                    {label}
                    {managed && typeof v.stock === "number" ? ` (${v.stock})` : ""}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] font-bold text-slate-500">
              옵션 없음{managed ? ` · 재고 ${totalStock.toLocaleString("ko-KR")}` : " · 재고관리 안 함"}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="수량"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
            />
            <input
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="단가(원)"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep"
            />
          </div>

          <button
            type="button"
            disabled={adding}
            onClick={handleAdd}
            className="w-full rounded-lg bg-rose-deep px-3 py-2 text-[13px] font-black text-white disabled:opacity-50"
          >
            {adding ? "추가 중..." : "이 주문에 추가 (재고 차감)"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
