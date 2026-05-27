"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";

type ProductRow = Record<string, unknown>;

type AdminLiveProductListPanelProps = {
  activeBroadcastId?: string | number | null;
  fillHeight?: boolean;
  className?: string;
};

type StatusInfo = {
  label: "노출" | "숨김" | "품절";
  className: string;
};

const DEFAULT_PAGE_SIZE = 4;

type ProductListFilter = "visible" | "hidden" | "all";

type SimpleFastCreateRow = {
  productName: string;
  priceText: string;
  isVisible: boolean;
};

function pickString(row: ProductRow | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }

  return fallback;
}

function pickNumber(row: ProductRow | null | undefined, keys: string[], fallback = 0) {
  if (!row) return fallback;

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

function pickBoolean(row: ProductRow | null | undefined, keys: string[], fallback = false) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "boolean") return value;

    if (typeof value === "number") return value === 1;

    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();

      if (["true", "1", "yes", "y", "on", "visible", "판매중", "노출"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "off", "hidden", "숨김", "품절"].includes(normalized)) return false;
    }
  }

  return fallback;
}

function pickArray(row: ProductRow | null | undefined, keys: string[]) {
  if (!row) return [];

  for (const key of keys) {
    const value = row[key];

    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);

          if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || "").trim()).filter(Boolean);
          }
        } catch {
          return [trimmed];
        }
      }

      return trimmed
        .split(/[,/|]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function productName(product: ProductRow) {
  return pickString(product, ["product_name", "name", "title"], "상품명 없음");
}

function productPrice(product: ProductRow) {
  return pickNumber(product, ["price", "sale_price", "selling_price"], 0);
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function moneyNumber(value: string) {
  return Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
}

function missingProductColumn(message: string) {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /Could not find column '([^']+)'/i,
    /column "([^"]+)" of relation "products" does not exist/i,
    /record "new" has no field "([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) return match[1];
  }

  return "";
}

function productDetailImages(product: ProductRow) {
  const raw =
    product.detail_image_urls ??
    product.detail_images ??
    product.detailImages ??
    product.images ??
    null;

  if (Array.isArray(raw)) {
    return raw.map((item) => resolveProductImageUrl(String(item || "").trim())).filter(Boolean);
  }

  if (typeof raw === "string" && raw.trim()) {
    const value = raw.trim();

    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map((item) => resolveProductImageUrl(String(item || "").trim())).filter(Boolean);
      }
    } catch {
      // 문자열 목록일 수 있으므로 쉼표 기준으로 처리합니다.
    }

    return value
      .split(",")
      .map((item) => resolveProductImageUrl(item.trim()))
      .filter(Boolean);
  }

  return [];
}

function mainImage(product: ProductRow) {
  const direct = pickString(product, ["image_url", "cover_image_url", "main_image_url", "thumbnail_url"], "");

  if (direct) return resolveProductImageUrl(direct);

  const images = pickArray(product, ["images", "image_urls", "detail_image_urls"]);

  if (images[0]) return resolveProductImageUrl(images[0]);

  return "";
}

function colorSummary(product: ProductRow) {
  const colors = pickArray(product, ["color_options", "colors"]);

  return colors.length > 0 ? colors.join(", ") : "색상없음";
}

function sizeSummary(product: ProductRow) {
  const sizes = pickArray(product, ["size_options", "sizes"]);

  return sizes.length > 0 ? sizes.join(", ") : "사이즈없음";
}

type ProductVariantStockRow = {
  key: string;
  color: string;
  size: string;
  stock: number;
};

function parseProductNote(product: ProductRow) {
  const raw = product.product_note ?? product.productNote ?? product.note ?? null;

  if (!raw) return null;

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function productVariantStocks(product: ProductRow): ProductVariantStockRow[] {
  const note = parseProductNote(product);
  const variants = note?.stock_variants;

  if (!Array.isArray(variants)) return [];

  return variants
    .map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;

      const item = row as Record<string, unknown>;
      const color = pickString(item, ["color"], "옵션없음");
      const size = pickString(item, ["size"], "옵션없음");
      const stock = pickNumber(item, ["stock"], 0);

      return {
        key: `${color}__${size}__${index}`,
        color,
        size,
        stock,
      };
    })
    .filter((row): row is ProductVariantStockRow => Boolean(row));
}

function variantStockCount(product: ProductRow) {
  return productVariantStocks(product).length;
}

function stockSummary(product: ProductRow) {
  const stock = pickNumber(product, ["stock", "total_stock"], 0);

  return `${stock.toLocaleString("ko-KR")}개`;
}

function productTypeLabel(product: ProductRow) {
  const type = pickString(product, ["product_type", "type"], "broadcast");

  if (type === "group_buy") return "공구";
  return "방송";
}

function pinnedPrefix(product: ProductRow) {
  return pickBoolean(product, ["is_pinned", "pinned"], false) ? "📌 " : "";
}

function shippingLabel(product: ProductRow) {
  const type = pickString(product, ["shipping_type", "delivery_type"], "normal");

  if (type === "vendor") return "업체배송";
  if (type === "free") return "무료배송";
  return "일반배송";
}

function statusInfo(product: ProductRow): StatusInfo {
  const status = pickString(product, ["status", "product_status"], "");
  const isSoldout = pickBoolean(product, ["is_soldout", "soldout"], false);
  const isVisible = pickBoolean(product, ["is_visible", "visible"], true);

  if (isSoldout || status.includes("품절")) {
    return {
      label: "품절",
      className: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    };
  }

  if (!isVisible || status.includes("숨김")) {
    return {
      label: "숨김",
      className: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
    };
  }

  return {
    label: "노출",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  };
}

function sortProducts(products: ProductRow[]) {
  return [...products].sort((a, b) => {
    const pinnedA = pickBoolean(a, ["is_pinned", "pinned"], false) ? 1 : 0;
    const pinnedB = pickBoolean(b, ["is_pinned", "pinned"], false) ? 1 : 0;

    if (pinnedA !== pinnedB) return pinnedB - pinnedA;

    if (pinnedA && pinnedB) {
      const pinnedAtA = pickString(a, ["pinned_at"], "");
      const pinnedAtB = pickString(b, ["pinned_at"], "");

      if (pinnedAtA !== pinnedAtB) return pinnedAtB.localeCompare(pinnedAtA);
    }

    const sortA = pickNumber(a, ["sort_order", "display_order"], 999999);
    const sortB = pickNumber(b, ["sort_order", "display_order"], 999999);

    if (sortA !== sortB) return sortA - sortB;

    return pickString(b, ["created_at", "updated_at", "id"], "").localeCompare(
      pickString(a, ["created_at", "updated_at", "id"], ""),
    );
  });
}

function openQuickProductCreate() {
  window.dispatchEvent(new Event("ruru-open-quick-product-panel"));
}

function openQuickProductEdit(product: ProductRow) {
  window.dispatchEvent(new CustomEvent("ruru-edit-quick-product", { detail: product }));
}


function getProductNoteFlags(product: { product_note?: unknown; productNote?: unknown; note?: unknown }) {
  const rawNote = product.product_note ?? product.productNote ?? product.note;
  let note: unknown = rawNote;

  if (typeof rawNote === "string") {
    const trimmed = rawNote.trim();

    if (trimmed.length > 0) {
      try {
        note = JSON.parse(trimmed);
      } catch {
        note = null;
      }
    } else {
      note = null;
    }
  }

  if (!note || typeof note !== "object" || Array.isArray(note)) {
    return {
      registeredOrderEnabled: true,
      nameSuggestionEnabled: true,
    };
  }

  const productNote = note as {
    registered_order_enabled?: boolean;
    name_suggestion_enabled?: boolean;
  };

  return {
    registeredOrderEnabled: productNote.registered_order_enabled !== false,
    nameSuggestionEnabled: productNote.name_suggestion_enabled !== false,
  };
}

function ProductFeatureBadges({ product }: { product: ProductRow }) {
  const flags = getProductNoteFlags(product);

  return (
    <div data-ruru-product-feature-badges className="mt-1 flex flex-wrap gap-1">
      <span
        className={[
          "rounded-full px-2 py-0.5 text-[10px] font-black",
          flags.registeredOrderEnabled
            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
            : "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
        ].join(" ")}
      >
        {flags.registeredOrderEnabled ? "등록ON" : "등록OFF"}
      </span>
      <span
        className={[
          "rounded-full px-2 py-0.5 text-[10px] font-black",
          flags.nameSuggestionEnabled
            ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
            : "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
        ].join(" ")}
      >
        {flags.nameSuggestionEnabled ? "추천ON" : "추천OFF"}
      </span>
    </div>
  );
}

export default function AdminLiveProductListPanel(props: AdminLiveProductListPanelProps) {
  const fillHeight = Boolean(props.fillHeight);
  const className = props.className || "";
  const panelClassName = [
    "col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-4",
    fillHeight ? "h-full" : "h-[392px]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [listFilter, setListFilter] = useState<ProductListFilter>("visible");
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [showProductDetailList, setShowProductDetailList] = useState(false);
  const [showSimpleFastCreate, setShowSimpleFastCreate] = useState(false);
  const [simpleFastRows, setSimpleFastRows] = useState<SimpleFastCreateRow[]>([
    { productName: "", priceText: "", isVisible: true },
  ]);
  const [simpleFastSaving, setSimpleFastSaving] = useState(false);
  const [detailSearchText, setDetailSearchText] = useState("");
  const [detailStatusFilter, setDetailStatusFilter] = useState<"all" | "visible" | "hidden" | "soldout">("all");
  const [detailPageSize, setDetailPageSize] = useState<number>(20);
  const [detailPage, setDetailPage] = useState<number>(1);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const { data, error } = await supabase.from("products").select("*");

      if (error) {
        setProducts([]);
        setLoadError(error.message || "등록상품을 불러오지 못했습니다.");
        return;
      }

      setProducts(sortProducts((data || []) as ProductRow[]));
      setCurrentPage(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "등록상품을 불러오지 못했습니다.";
      setProducts([]);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();

    const reload = () => {
      void loadProducts();
    };

    window.addEventListener("ruru-live-product-updated", reload);

    return () => {
      window.removeEventListener("ruru-live-product-updated", reload);
    };
  }, [loadProducts]);

  useEffect(() => {
    setDetailPage(1);
  }, [detailSearchText, detailStatusFilter, detailPageSize]);

  const resetSimpleFastRows = useCallback(() => {
    setSimpleFastRows([{ productName: "", priceText: "", isVisible: true }]);
  }, []);

  const updateSimpleFastRow = (targetIndex: number, patch: Partial<SimpleFastCreateRow>) => {
    setSimpleFastRows((rows) =>
      rows.map((row, index) => (index === targetIndex ? { ...row, ...patch } : row)),
    );
  };

  const addSimpleFastRow = () => {
    setSimpleFastRows((rows) =>
      rows.length >= 10 ? rows : [...rows, { productName: "", priceText: "", isVisible: true }],
    );
  };

  const removeSimpleFastRow = (targetIndex: number) => {
    setSimpleFastRows((rows) => {
      if (rows.length <= 1) return rows;

      return rows.filter((_, index) => index !== targetIndex);
    });
  };

  const insertSimpleFastProductSchemaSafe = async (payload: Record<string, unknown>) => {
    const requiredColumns = new Set(["product_name"]);
    const workingPayload: Record<string, unknown> = { ...payload };

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { data, error } = await supabase.from("products").insert(workingPayload).select("id").single();

      if (!error) {
        return String((data as { id?: string | number } | null)?.id || "");
      }

      const missingColumn = missingProductColumn(error.message || "");

      if (missingColumn && !requiredColumns.has(missingColumn) && missingColumn in workingPayload) {
        delete workingPayload[missingColumn];
        continue;
      }

      throw error;
    }

    throw new Error("products 저장 스키마 확인 중 반복 제한을 초과했습니다.");
  };

  const saveSimpleFastProducts = async () => {
    if (simpleFastSaving) return;

    const rows = simpleFastRows.map((row) => ({
      productName: row.productName.trim(),
      price: moneyNumber(row.priceText),
      isVisible: row.isVisible,
    }));

    const filledRows = rows.filter((row) => row.productName || row.price > 0);

    if (filledRows.length === 0) {
      alert("빠른등록할 상품명을 입력해주세요.");
      return;
    }

    for (let index = 0; index < filledRows.length; index += 1) {
      const row = filledRows[index];

      if (!row.productName) {
        alert(`상품 ${index + 1}의 상품명을 입력해주세요.`);
        return;
      }
    }

    setSimpleFastSaving(true);

    try {
      let createdCount = 0;

      for (const row of filledRows) {
        const productNote = {
          stock_mode: "total",
          stock_variants: [],
          stock_management_enabled: false,
          registered_order_enabled: true,
          name_suggestion_enabled: true,
          simple_fast_create: true,
        };

        const payload: Record<string, unknown> = {
          product_name: row.productName,
          price: row.price,
          stock: 0,
          status: row.isVisible ? "판매중" : "숨김",
          product_type: "broadcast",
          shipping_type: "normal",
          combine_shipping: "Y",
          sort_order: 0,
          is_visible: row.isVisible,
          is_soldout: false,
          is_pinned: false,
          color_options: [],
          size_options: [],
          size_option_enabled: false,
          product_description: "",
          detail_image_urls: [],
          product_note: productNote,
        };

        const productId = await insertSimpleFastProductSchemaSafe(payload);

        if (props.activeBroadcastId && productId) {
          const { error: linkError } = await supabase.from("broadcast_products").insert({
            broadcast_id: props.activeBroadcastId,
            product_id: productId,
            sort_order: 0,
          });

          if (linkError) {
            alert("상품은 저장됐지만 방송 연결은 실패했습니다.\n\n" + linkError.message);
          }
        }

        createdCount += 1;
      }

      window.dispatchEvent(new Event("ruru-live-product-updated"));
      await loadProducts();
      resetSimpleFastRows();
      setShowSimpleFastCreate(false);
      alert(`${createdCount}개 상품을 빠른등록했습니다.`);
    } catch (error) {
      alert("빠른등록 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSimpleFastSaving(false);
    }
  };

  const counts = useMemo(() => {
    return products.reduce<{ visible: number; hidden: number; soldout: number; pinned: number }>(
      (acc, product) => {
        const info = statusInfo(product);

        if (info.label === "노출") acc.visible += 1;
        if (info.label === "숨김") acc.hidden += 1;
        if (info.label === "품절") acc.soldout += 1;
        if (pickBoolean(product, ["is_pinned", "pinned"], false)) acc.pinned += 1;

        return acc;
      },
      {
        visible: 0,
        hidden: 0,
        soldout: 0,
        pinned: 0,
      },
    );
  }, [products]);

  const productListSummary = useMemo(() => {
    const hidden = products.filter((product) => statusInfo(product).label === "숨김").length;
    const soldout = products.filter((product) => statusInfo(product).label === "품절").length;
    const visible = products.filter((product) => statusInfo(product).label !== "숨김").length;

    return {
      visible,
      hidden,
      soldout,
      all: products.length,
    };
  }, [products]);

  const listFilteredProducts = useMemo(() => {
    if (listFilter === "hidden") {
      return products.filter((product) => statusInfo(product).label === "숨김");
    }

    if (listFilter === "all") {
      return products;
    }

    return products.filter((product) => statusInfo(product).label !== "숨김");
  }, [listFilter, products]);

  const totalPages = Math.max(1, Math.ceil(listFilteredProducts.length / DEFAULT_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * DEFAULT_PAGE_SIZE;
  const visibleProducts = listFilteredProducts.slice(pageStart, pageStart + DEFAULT_PAGE_SIZE);

  const paginationPages = useMemo(() => {
    const pages: Array<number | "ellipsis"> = [];

    if (totalPages <= 5) {
      for (let page = 1; page <= totalPages; page += 1) pages.push(page);
      return pages;
    }

    pages.push(1);

    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);

    if (start > 2) pages.push("ellipsis");

    for (let page = start; page <= end; page += 1) pages.push(page);

    if (end < totalPages - 1) pages.push("ellipsis");

    pages.push(totalPages);

    return pages;
  }, [safePage, totalPages]);

  const detailProducts = useMemo(() => {
    const keyword = detailSearchText.trim().toLowerCase();

    return products.filter((product) => {
      const info = statusInfo(product);

      if (detailStatusFilter === "visible" && info.label !== "노출") return false;
      if (detailStatusFilter === "hidden" && info.label !== "숨김") return false;
      if (detailStatusFilter === "soldout" && info.label !== "품절") return false;

      if (!keyword) return true;

      const haystack = [
        productName(product),
        String(productPrice(product)),
        colorSummary(product),
        sizeSummary(product),
        productTypeLabel(product),
        shippingLabel(product),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [detailSearchText, detailStatusFilter, products]);

  const detailTotalPages = Math.max(1, Math.ceil(detailProducts.length / detailPageSize));
  const detailSafePage = Math.min(detailPage, detailTotalPages);
  const detailPageStart = (detailSafePage - 1) * detailPageSize;
  const detailVisibleProducts = detailProducts.slice(detailPageStart, detailPageStart + detailPageSize);

  const detailPaginationPages = useMemo(() => {
    const pages: Array<number | "ellipsis"> = [];

    if (detailTotalPages <= 5) {
      for (let page = 1; page <= detailTotalPages; page += 1) pages.push(page);
      return pages;
    }

    pages.push(1);

    const start = Math.max(2, detailSafePage - 1);
    const end = Math.min(detailTotalPages - 1, detailSafePage + 1);

    if (start > 2) pages.push("ellipsis");

    for (let page = start; page <= end; page += 1) pages.push(page);

    if (end < detailTotalPages - 1) pages.push("ellipsis");

    pages.push(detailTotalPages);

    return pages;
  }, [detailSafePage, detailTotalPages]);

  const selectedImage = selectedProduct ? mainImage(selectedProduct) : "";
  const selectedDetailImages = selectedProduct ? productDetailImages(selectedProduct) : [];
  const selectedVariantStocks = selectedProduct ? productVariantStocks(selectedProduct) : [];
  const selectedStatus = selectedProduct ? statusInfo(selectedProduct) : null;

  return (
    <>
      <div className={panelClassName}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-950">등록상품 리스트</h2>
              <div className="mt-1 text-[11px] font-bold text-slate-400">
                노출 {counts.visible} · 고정 {counts.pinned} · 숨김 {counts.hidden} · 품절 {counts.soldout}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowProductDetailList(true)}
                className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white shadow-sm hover:bg-slate-800"
              >
                상세리스트
              </button>

              <button
                type="button"
                onClick={() => {
                  resetSimpleFastRows();
                  setShowSimpleFastCreate(true);
                }}
                className="h-9 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-sm hover:bg-blue-700"
              >
                + 빠른등록
              </button>

              <button
                type="button"
                onClick={openQuickProductCreate}
                className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-black text-white shadow-sm hover:bg-slate-800"
              >
                + 상품등록
              </button>

              <button
                type="button"
                onClick={() => void loadProducts()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500 hover:bg-slate-200"
                aria-label="새로고침"
              >
                ↻
              </button>
            </div>
          </div>

<div className="shrink-0 py-2 text-[11px] font-black text-slate-500">
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
            {([
              { key: "visible", label: "노출상품", count: productListSummary.visible },
              { key: "hidden", label: "숨김상품", count: productListSummary.hidden },
              { key: "all", label: "전체상품", count: productListSummary.all },
            ] as const).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setListFilter(filter.key);
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                  listFilter === filter.key
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    listFilter === filter.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

            {listFilteredProducts.length === 0 ? "0개" : `${pageStart + 1}-${Math.min(pageStart + DEFAULT_PAGE_SIZE, listFilteredProducts.length)} / ${listFilteredProducts.length}개`}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">
                등록상품을 불러오는 중입니다.
              </div>
            ) : loadError ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-xs font-bold leading-5 text-slate-400">
                등록상품 리스트를 조용히 대기 중입니다.
                <br />
                스키마 확인 후 자동으로 표시됩니다.
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-xs font-bold leading-5 text-slate-400">
                등록된 상품이 없습니다.
                <br />
                + 빠른등록으로 상품을 먼저 추가하세요.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleProducts.map((product, index) => {
                  const info = statusInfo(product);
                  const image = mainImage(product);
                  const absoluteIndex = pageStart + index + 1;

                  return (
                    <div
                      key={pickString(product, ["id", "product_id"], String(absoluteIndex))}
                      className="grid grid-cols-[36px_minmax(0,1fr)_54px_112px] items-center gap-2.5 py-3"
                    >
                      <div className="text-xs font-black text-slate-400">{absoluteIndex}</div>

                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="grid min-w-0 grid-cols-[42px_minmax(0,1fr)] items-center gap-2.5 text-left"
                      >
                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                          {image ? (
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-black text-slate-400">NO</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-slate-950">
                            {pinnedPrefix(product)}{productName(product)}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] font-bold text-slate-500">
                            {money(productPrice(product))} · {colorSummary(product)} / {sizeSummary(product)}
                          </div>
                          <ProductFeatureBadges product={product} />
                        </div>
                      </button>

                      <div className="text-center">
                        <span className={["inline-flex rounded-full px-2.5 py-1 text-[11px] font-black", info.className].join(" ")}>
                          {info.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!product.id) return;
                              const currentStatus = String(product.status || "판매중");
                              const nextStatus = currentStatus === "숨김" ? "판매중" : "숨김";
                              const { error } = await supabase.from("products").update({ status: nextStatus }).eq("id", product.id);

                              if (error) {
                                alert("상품 노출 변경 실패\n" + error.message);
                                return;
                              }

                              await loadProducts();
                            }}
                            className={`h-8 min-w-[54px] whitespace-nowrap rounded-lg px-2 text-[11px] font-black leading-none transition ${
                              String(product.status || "판매중") === "숨김"
                                ? "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            }`}
                          >
                            {String(product.status || "판매중") === "숨김" ? "노출OFF" : "노출ON"}
                          </button>

<button
                          type="button"
                          onClick={() => openQuickProductEdit(product)}
                          className="h-8 min-w-[44px] whitespace-nowrap rounded-lg bg-slate-100 px-2 text-[11px] font-black text-slate-600 hover:bg-slate-200"
                        >
                          수정
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500 disabled:opacity-40"
            >
              이전
            </button>

            {paginationPages.map((pageItem, index) =>
              pageItem === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-2 text-sm font-black text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={pageItem}
                  type="button"
                  onClick={() => setCurrentPage(pageItem)}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-black transition ${
                    safePage === pageItem
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pageItem}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {showSimpleFastCreate ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">빠른 상품등록</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">상품명만 넣어도 등록됩니다. 금액은 고객이 주문서에서 직접 입력할 수 있습니다.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (simpleFastSaving) return;
                  setShowSimpleFastCreate(false);
                }}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-600 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>

            <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {simpleFastRows.map((row, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-black text-slate-900">상품 {index + 1}</div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateSimpleFastRow(index, { isVisible: !row.isVisible })}
                          className={`h-8 rounded-xl px-3 text-xs font-black ${
                            row.isVisible
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {row.isVisible ? "노출ON" : "노출OFF"}
                        </button>

                        {simpleFastRows.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeSimpleFastRow(index)}
                            className="h-8 rounded-xl bg-rose-50 px-3 text-xs font-black text-rose-600"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black text-slate-500">상품명</span>
                        <input
                          value={row.productName}
                          onChange={(event) => updateSimpleFastRow(index, { productName: event.target.value })}
                          placeholder="예: 라메르크림 100ml"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black text-slate-500">금액 선택</span>
                        <div className="grid h-11 grid-cols-[minmax(0,1fr)_28px] items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500">
                          <input
                            value={row.priceText ? Number(row.priceText).toLocaleString("ko-KR") : ""}
                            onChange={(event) =>
                              updateSimpleFastRow(index, {
                                priceText: event.target.value.replace(/[^0-9]/g, ""),
                              })
                            }
                            inputMode="numeric"
                            placeholder="선택"
                            className="min-w-0 bg-transparent text-right text-sm font-black text-slate-900 outline-none"
                          />
                          <span className="text-right text-xs font-black text-slate-400">원</span>
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addSimpleFastRow}
                className="mt-3 h-11 w-full rounded-2xl border border-dashed border-blue-300 bg-blue-50 text-sm font-black text-blue-700 hover:bg-blue-100"
              >
                + 상품 추가
              </button>

              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-5 text-slate-500">
                기본값: 방송상품 · 일반배송 · 등록ON · 추천ON · 금액 미입력 시 고객 직접입력
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.4fr] gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                disabled={simpleFastSaving}
                onClick={() => setShowSimpleFastCreate(false)}
                className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-600 disabled:opacity-50"
              >
                닫기
              </button>

              <button
                type="button"
                disabled={simpleFastSaving}
                onClick={() => void saveSimpleFastProducts()}
                className="h-12 rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {simpleFastSaving ? "저장 중..." : "빠른등록 저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProductDetailList ? (
        <div className="fixed inset-0 z-[115] flex items-start justify-center overflow-hidden bg-slate-950/45 px-5 pt-10">
          <div className="flex h-[760px] max-h-[calc(100vh-80px)] min-h-[620px] w-full max-w-[980px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">등록상품 전체 상세리스트</h3>
              </div>

              <button
                type="button"
                onClick={() => setShowProductDetailList(false)}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-600 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>

            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_132px_124px] gap-2 border-b border-slate-100 px-6 py-4">
              <input
                value={detailSearchText}
                onChange={(event) => setDetailSearchText(event.target.value)}
                placeholder="상품명 / 색상 / 사이즈 / 배송유형 검색"
                className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-400"
              />

              <select
                value={detailStatusFilter}
                onChange={(event) => setDetailStatusFilter(event.target.value as "all" | "visible" | "hidden" | "soldout")}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-black outline-none"
              >
                <option value="all">상태 전체</option>
                <option value="visible">노출만</option>
                <option value="hidden">숨김만</option>
                <option value="soldout">품절만</option>
              </select>

              <select
                value={detailPageSize}
                onChange={(event) => setDetailPageSize(Number(event.target.value))}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-black outline-none"
              >
                <option value={10}>10개 보기</option>
                <option value={20}>20개 보기</option>
                <option value={50}>50개 보기</option>
                <option value={100}>100개 보기</option>
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-3 flex items-center justify-between text-xs font-black text-slate-500">
                <span>
                  {detailProducts.length === 0
                    ? "0개"
                    : `${detailPageStart + 1}-${Math.min(detailPageStart + detailPageSize, detailProducts.length)} / ${detailProducts.length}개`}
                </span>
                <span>전체 {products.length}개</span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[46px_minmax(0,1.4fr)_92px_72px_70px_70px_104px] bg-slate-50 px-4 py-3 text-xs font-black text-slate-400">
                  <div>순서</div>
                  <div>상품정보</div>
                  <div className="text-right">판매가</div>
                  <div className="text-center">상태</div>
                  <div className="text-center">구분</div>
                  <div className="text-center">재고</div>
                  <div className="text-right">관리</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {detailVisibleProducts.length === 0 ? (
                    <div className="flex h-[220px] items-center justify-center text-sm font-bold text-slate-400">
                      조건에 맞는 등록상품이 없습니다.
                    </div>
                  ) : (
                    detailVisibleProducts.map((product, index) => {
                      const info = statusInfo(product);
                      const image = mainImage(product);
                      const absoluteIndex = detailPageStart + index + 1;

                      return (
                        <div
                          key={pickString(product, ["id", "product_id"], String(absoluteIndex))}
                          className="grid grid-cols-[46px_minmax(0,1.4fr)_92px_72px_70px_70px_104px] items-center px-4 py-3"
                        >
                          <div className="text-xs font-black text-slate-400">{absoluteIndex}</div>

                          <button
                            type="button"
                            onClick={() => setSelectedProduct(product)}
                            className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-center gap-3 text-left"
                          >
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                              {image ? (
                                <img src={image} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-black text-slate-400">NO</span>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-slate-950">{pinnedPrefix(product)}{productName(product)}</div>
                              <div className="mt-0.5 truncate text-xs font-bold text-slate-500">
                                {colorSummary(product)} / {sizeSummary(product)} · {shippingLabel(product)}
                              </div>
                              <ProductFeatureBadges product={product} />
                              
                            </div>
                          </button>

                          <div className="text-right text-sm font-black text-slate-800">{money(productPrice(product))}</div>

                          <div className="text-center">
                            <span className={["inline-flex rounded-full px-2.5 py-1 text-xs font-black", info.className].join(" ")}>
                              {info.label}
                            </span>
                          </div>

                          <div className="text-center text-xs font-black text-slate-600">{productTypeLabel(product)}</div>
                          <div className="text-center text-xs font-black text-slate-600">
                            <div>{stockSummary(product)}</div>
                            {variantStockCount(product) > 0 ? (
                              <div className="mt-0.5 text-[10px] font-black text-blue-600">
                                옵션 {variantStockCount(product)}개
                              </div>
                            ) : null}
                          </div>

                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedProduct(product)}
                              className="h-8 rounded-lg bg-slate-100 px-2.5 text-[11px] font-black text-slate-600 hover:bg-slate-200"
                            >
                              개별상세
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setShowProductDetailList(false);
                                openQuickProductEdit(product);
                              }}
                              className="h-8 rounded-lg bg-blue-600 px-2.5 text-[11px] font-black text-white hover:bg-blue-700"
                            >
                              수정
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                disabled={detailSafePage <= 1}
                onClick={() => setDetailPage((page) => Math.max(1, page - 1))}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-400 disabled:opacity-50"
              >
                이전
              </button>

              {detailPaginationPages.map((pageItem, index) =>
                pageItem === "ellipsis" ? (
                  <span key={`detail-ellipsis-${index}`} className="px-2 text-xs font-black text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={pageItem}
                    type="button"
                    onClick={() => setDetailPage(pageItem)}
                    className={`h-9 min-w-9 rounded-xl px-3 text-xs font-black transition ${
                      detailSafePage === pageItem
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {pageItem}
                  </button>
                ),
              )}

              <button
                type="button"
                disabled={detailSafePage >= detailTotalPages}
                onClick={() => setDetailPage((page) => Math.min(detailTotalPages, page + 1))}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-400 disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-6">
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-3xl bg-white p-3 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewImage("")}
              className="absolute right-4 top-4 z-10 h-9 rounded-xl bg-white/90 px-4 text-xs font-black text-slate-700 shadow-sm hover:bg-white"
            >
              닫기
            </button>

            <img
              src={previewImage}
              alt=""
              className="max-h-[84vh] max-w-[84vw] rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-5">
          <div className="w-full max-w-[720px] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">등록상품 상세보기</h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-600 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>

            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5 p-6">
              <div>
                <button
                  type="button"
                  disabled={!selectedImage}
                  onClick={() => {
                    if (selectedImage) setPreviewImage(selectedImage);
                  }}
                  className="flex h-[220px] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 hover:ring-blue-300 disabled:cursor-default disabled:hover:ring-slate-200"
                >
                  {selectedImage ? (
                    <img src={selectedImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-black text-slate-400">사진 없음</span>
                  )}
                </button>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-black text-slate-400">상품구분</div>
                    <div className="mt-1 text-xs font-black text-slate-800">{productTypeLabel(selectedProduct)}</div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-black text-slate-400">배송유형</div>
                    <div className="mt-1 text-xs font-black text-slate-800">{shippingLabel(selectedProduct)}</div>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-xl font-black text-slate-950">{pinnedPrefix(selectedProduct)}{productName(selectedProduct)}</h4>
                    <div className="mt-1 text-lg font-black text-blue-600">{money(productPrice(selectedProduct))}</div>
                  </div>

                  {selectedStatus ? (
                    <span className={["shrink-0 rounded-full px-3 py-1.5 text-xs font-black", selectedStatus.className].join(" ")}>
                      {selectedStatus.label}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-[11px] font-black text-slate-400">색상</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{colorSummary(selectedProduct)}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-[11px] font-black text-slate-400">사이즈</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{sizeSummary(selectedProduct)}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-[11px] font-black text-slate-400">재고</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{stockSummary(selectedProduct)}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-[11px] font-black text-slate-400">리스트</div>
                    <div className="mt-1 text-sm font-black text-slate-800">
                      {pickBoolean(selectedProduct, ["is_pinned", "pinned"], false) ? "📌 상단고정" : "일반"}
                    </div>
                  </div>
                </div>

                {selectedVariantStocks.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-black text-slate-400">옵션별 재고</div>
                      <div className="text-[10px] font-black text-slate-400">
                        {selectedVariantStocks.length.toLocaleString("ko-KR")}개 옵션
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="grid grid-cols-[1fr_1fr_72px] bg-slate-50 px-3 py-1.5 text-[10px] font-black text-slate-400">
                        <div>색상</div>
                        <div>사이즈</div>
                        <div className="text-right">재고</div>
                      </div>

                      <div className="max-h-[132px] overflow-y-auto">
                        {selectedVariantStocks.map((row) => (
                          <div
                            key={row.key}
                            className="grid grid-cols-[1fr_1fr_72px] items-center border-t border-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                          >
                            <div className="truncate">{row.color}</div>
                            <div className="truncate">{row.size}</div>
                            <div className="text-right font-black">{row.stock.toLocaleString("ko-KR")}개</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-black text-slate-400">상세설명</div>
                  <div className="mt-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">
                    {pickString(selectedProduct, ["product_description", "description", "detail_description"], "상세설명 없음")}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-black text-slate-400">상세사진</div>
                      <div className="text-[10px] font-black text-slate-400">{selectedDetailImages.length}장</div>
                    </div>

                    {selectedDetailImages.length > 0 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {selectedDetailImages.slice(0, 5).map((imageUrl, imageIndex) => (
                          <button
                            key={`${imageUrl}-${imageIndex}`}
                            type="button"
                            onClick={() => setPreviewImage(imageUrl)}
                            className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 hover:ring-blue-300"
                          >
                            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-16 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-400 ring-1 ring-slate-200">
                        등록된 상세사진 없음
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="h-11 w-[120px] rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>

              <button
                type="button"
                onClick={() => {
                  const product = selectedProduct;
                  setSelectedProduct(null);
                  openQuickProductEdit(product);
                }}
                className="h-11 w-[150px] rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
              >
                수정하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
