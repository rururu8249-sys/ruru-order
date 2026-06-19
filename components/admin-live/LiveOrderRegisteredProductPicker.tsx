"use client";

// 목적: 관리자 주문상세에서 "등록상품"을 골라 주문에 추가 (#3 3단계, 재고차감).
//   - 큰 팝업(모달)로 표시 → 좁은 사이드바에서 보기 불편하던 문제 해결.
//   - 색상/사이즈는 고객 주문페이지와 동일한 소스에서 읽음(stock_variants + colors/color_options + sizes/size_options 등).
//     · select 모드: 등록된 옵션값을 칩으로 골라야 함(선택 필수).
//     · input  모드: 직접 입력(자유).
//     · none   모드: 옵션 없음(입력 불필요).
//   - 옵션값은 등록상품에서 읽은 값 그대로 RPC로 전달 → 재고 키 일치(자유오타 방지).
//   - 실제 재고 차감/카드 vat/그룹필드 복사는 admin_add_order_item RPC가 처리(여기선 입력만 수집).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import type { LiveOrderRegisteredAddInput } from "./useLiveOrderItemAdd";

type ProductRow = Record<string, unknown>;
type OptionField = "color" | "size";
type OptionMode = "select" | "input" | "none";

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

function parseNote(p: ProductRow): Record<string, unknown> {
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

// 값 분해(배열/구분자 문자열 → 문자열 배열) — 고객페이지 splitProductOptionValue와 동일 규칙
function splitOptionValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((i) => splitOptionValue(i));
  if (typeof value !== "string") return [];
  return value
    .split(/[,./|·\n]+/g)
    .map((i) => i.trim())
    .filter(Boolean);
}

// "없음" 계열 → 빈 값 (고객페이지 normalizeEmptyProductOptionValue와 동일)
function normEmpty(value: unknown): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return "";
  if (["없음", "없슴", "색상없음", "사이즈없음", "옵션없음", "x", "X", "-", "none", "None", "NONE"].includes(t)) return "";
  return t;
}

function readFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  return ["true", "1", "y", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

// 색상/사이즈 후보값 — stock_variants + colors/color_options/... (고객페이지 getProductOptionSuggestions와 동일 소스)
function optionSuggestions(p: ProductRow, field: OptionField): string[] {
  const note = parseNote(p);
  const values: string[] = [];

  const variants = note["stock_variants"];
  if (Array.isArray(variants)) {
    for (const v of variants) {
      const obj = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const val = field === "color" ? obj["color"] : obj["size"];
      if (typeof val === "string" && val.trim()) values.push(val.trim());
    }
  }

  if (field === "color") {
    values.push(...splitOptionValue(note["colors"]));
    values.push(...splitOptionValue(note["color_options"]));
    values.push(...splitOptionValue(note["product_colors"]));
    values.push(...splitOptionValue(note["option_color"]));
    values.push(...splitOptionValue(p["colors"]));
    values.push(...splitOptionValue(p["color_options"]));
    values.push(...splitOptionValue(p["product_colors"]));
    values.push(...splitOptionValue(p["option_color"]));
    values.push(...splitOptionValue(p["color"]));
  } else {
    values.push(...splitOptionValue(note["sizes"]));
    values.push(...splitOptionValue(note["size_options"]));
    values.push(...splitOptionValue(note["product_sizes"]));
    values.push(...splitOptionValue(note["option_size"]));
    values.push(...splitOptionValue(p["sizes"]));
    values.push(...splitOptionValue(p["size_options"]));
    values.push(...splitOptionValue(p["product_sizes"]));
    values.push(...splitOptionValue(p["option_size"]));
    values.push(...splitOptionValue(p["size"]));
  }

  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, 40);
}

// 고를 수 있는 실제 옵션(없음 제거)
function selectableOptions(p: ProductRow, field: OptionField): string[] {
  return optionSuggestions(p, field)
    .map((v) => normEmpty(v))
    .map((v) => v.trim())
    .filter(Boolean);
}

// field별 모드 판별 — 고객페이지 getRegisteredOptionMode와 동일
function optionMode(p: ProductRow, field: OptionField): OptionMode {
  if (selectableOptions(p, field).length > 0) return "select";
  const note = parseNote(p);
  if (field === "color") {
    if (readFlag(p["color_option_enabled"]) || readFlag(p["colorOptionEnabled"]) || readFlag(note["color_option_enabled"])) return "none";
  } else {
    if (readFlag(p["size_option_enabled"]) || readFlag(p["sizeOptionEnabled"]) || readFlag(note["size_option_enabled"])) return "none";
  }
  const hasExplicitNone = optionSuggestions(p, field).some((v) => String(v).trim() !== "" && normEmpty(v) === "");
  if (hasExplicitNone) return "none";
  return "input";
}

const productId = (p: ProductRow) => pickString(p, ["id", "product_id"], "");
const productName = (p: ProductRow) => pickString(p, ["product_name", "name", "title"], "상품명 없음");
const productPrice = (p: ProductRow) => pickNumber(p, ["price", "sale_price", "selling_price"], 0);
const productStatus = (p: ProductRow) => pickString(p, ["status"], "");
const productTotalStock = (p: ProductRow) => pickNumber(p, ["stock"], 0);

function stockManaged(note: Record<string, unknown>) {
  const v = String(note["stock_management_enabled"] ?? "true").toLowerCase();
  return !["false", "f", "0", "no", "n"].includes(v);
}

function mainImage(p: ProductRow) {
  const direct = pickString(p, ["image_url", "cover_image_url", "main_image_url", "thumbnail_url"], "");
  return direct ? resolveProductImageUrl(direct) : "";
}

type Props = {
  onAdd: (input: LiveOrderRegisteredAddInput) => Promise<boolean>;
  onClose: () => void;
  adding: boolean;
};

export default function LiveOrderRegisteredProductPicker({ onAdd, onClose, adding }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
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
      .slice(0, 40);
  }, [products, search]);

  const selected = useMemo(() => products.find((p) => productId(p) === selectedId) || null, [products, selectedId]);
  const colorMode = useMemo<OptionMode>(() => (selected ? optionMode(selected, "color") : "none"), [selected]);
  const sizeMode = useMemo<OptionMode>(() => (selected ? optionMode(selected, "size") : "none"), [selected]);
  const colorOptions = useMemo(() => (selected ? selectableOptions(selected, "color") : []), [selected]);
  const sizeOptions = useMemo(() => (selected ? selectableOptions(selected, "size") : []), [selected]);
  const note = useMemo(() => (selected ? parseNote(selected) : {}), [selected]);
  const managed = useMemo(() => stockManaged(note), [note]);

  const onSelectProduct = (p: ProductRow) => {
    setSelectedId(productId(p));
    setColor("");
    setSize("");
    setQty("1");
    setUnitPrice(String(productPrice(p) || ""));
  };

  const handleAdd = async () => {
    if (!selected) {
      showAdminToast("상품을 선택해주세요.", "warning");
      return;
    }
    if (colorMode === "select" && !color.trim()) {
      showAdminToast("색상을 선택해주세요.", "warning");
      return;
    }
    if (sizeMode === "select" && !size.trim()) {
      showAdminToast("사이즈를 선택해주세요.", "warning");
      return;
    }
    const input: LiveOrderRegisteredAddInput = {
      productId: Number(productId(selected)),
      productName: productName(selected),
      color: colorMode === "none" ? "" : color.trim(),
      size: sizeMode === "none" ? "" : size.trim(),
      qty: Number(String(qty).replace(/[^\d]/g, "")) || 0,
      unitPrice: Number(String(unitPrice).replace(/[^\d]/g, "")) || 0,
    };
    const ok = await onAdd(input);
    if (ok) onClose();
  };

  const renderOptionField = (
    label: string,
    mode: OptionMode,
    options: string[],
    value: string,
    setValue: (v: string) => void
  ) => {
    if (mode === "none") return null;
    return (
      <div className="space-y-1">
        <div className="text-[12px] font-black text-ink-soft">{label}</div>
        {mode === "select" ? (
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const active = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValue(opt)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[13px] font-black ${
                    active ? "border-rose-deep bg-rose-deep text-white" : "border-line bg-surface text-ink hover:border-rose-deep"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`${label} 직접 입력`}
            className="w-full rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-rose-deep"
          />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-[15px] font-black text-rose-deep">등록상품 추가 (재고 차감)</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[18px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* 검색 */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 검색"
            className="w-full rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-rose-deep"
          />

          {/* 상품 목록 */}
          <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-xl border border-line p-1">
            {loading ? (
              <div className="py-4 text-center text-[13px] font-bold text-ink-mute">불러오는 중...</div>
            ) : visibleProducts.length === 0 ? (
              <div className="py-4 text-center text-[13px] font-bold text-ink-mute">상품이 없습니다.</div>
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
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left ${
                      active ? "border-rose-deep bg-rose-soft" : "border-transparent bg-surface hover:bg-surface-2"
                    }`}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="h-11 w-11 flex-none rounded-md object-cover" />
                    ) : (
                      <span className="h-11 w-11 flex-none rounded-md bg-surface-2" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-black text-ink">{productName(p)}</span>
                      <span className="block text-[12px] font-bold text-ink-soft">
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
            <div className="space-y-3 rounded-xl border border-rose-line bg-rose-soft/30 p-3">
              <div className="text-[14px] font-black text-ink">{productName(selected)}</div>

              {renderOptionField("색상", colorMode, colorOptions, color, setColor)}
              {renderOptionField("사이즈", sizeMode, sizeOptions, size, setSize)}

              {colorMode === "none" && sizeMode === "none" ? (
                <div className="text-[12px] font-bold text-ink-soft">
                  옵션 없음{managed ? ` · 총재고 ${productTotalStock(selected).toLocaleString("ko-KR")}` : " · 재고관리 안 함"}
                </div>
              ) : null}

              <div className="flex gap-2">
                <label className="w-24 space-y-1">
                  <span className="text-[12px] font-black text-ink-soft">수량</span>
                  <input
                    value={qty}
                    onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-rose-deep"
                  />
                </label>
                <label className="flex-1 space-y-1">
                  <span className="text-[12px] font-black text-ink-soft">단가(원)</span>
                  <input
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-rose-deep"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line py-6 text-center text-[13px] font-bold text-ink-mute">
              위에서 상품을 선택하세요.
            </div>
          )}
        </div>

        {/* 하단 추가 버튼 */}
        <div className="border-t border-line px-4 py-3">
          <button
            type="button"
            disabled={adding || !selected}
            onClick={handleAdd}
            className="w-full rounded-xl bg-rose-deep px-3 py-3 text-[14px] font-black text-white disabled:opacity-50"
          >
            {adding ? "추가 중..." : "이 주문에 추가 (재고 차감)"}
          </button>
        </div>
      </div>
    </div>
  );
}
