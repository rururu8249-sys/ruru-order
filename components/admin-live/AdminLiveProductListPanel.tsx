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
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [showProductDetailList, setShowProductDetailList] = useState(false);
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

  const totalPages = Math.max(1, Math.ceil(products.length / DEFAULT_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * DEFAULT_PAGE_SIZE;
  const visibleProducts = products.slice(pageStart, pageStart + DEFAULT_PAGE_SIZE);

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

  const selectedImage = selectedProduct ? mainImage(selectedProduct) : "";
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
                onClick={openQuickProductCreate}
                className="h-9 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-sm hover:bg-blue-700"
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

          <div className="mt-3 grid shrink-0 grid-cols-[52px_minmax(0,1fr)_76px_64px] border-y border-slate-100 py-2 text-[11px] font-black text-slate-400">
            <div>순서</div>
            <div>상품정보</div>
            <div className="text-center">상태</div>
            <div className="text-right">관리</div>
          </div>

          <div className="shrink-0 py-2 text-[11px] font-black text-slate-500">
            {products.length === 0 ? "0개" : `${pageStart + 1}-${Math.min(pageStart + DEFAULT_PAGE_SIZE, products.length)} / ${products.length}개`}
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
                + 상품등록으로 상품을 먼저 추가하세요.
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
                      className="grid grid-cols-[52px_minmax(0,1fr)_76px_64px] items-center gap-2 py-2.5"
                    >
                      <div className="text-xs font-black text-slate-400">{absoluteIndex}</div>

                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-2 text-left"
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
                        </div>
                      </button>

                      <div className="text-center">
                        <span className={["inline-flex rounded-full px-2.5 py-1 text-[11px] font-black", info.className].join(" ")}>
                          {info.label}
                        </span>
                      </div>

                      <div className="flex justify-end gap-1">
<button
                          type="button"
                          onClick={() => openQuickProductEdit(product)}
                          className="h-8 rounded-lg bg-slate-100 px-2.5 text-[11px] font-black text-slate-600 hover:bg-slate-200"
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

          <div className="mt-3 flex shrink-0 items-center justify-center gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="h-8 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-400 disabled:opacity-50"
            >
              이전
            </button>

            <div className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white">
              {safePage}
            </div>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="h-8 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-400 disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {showProductDetailList ? (
        <div className="fixed inset-0 z-[115] flex items-start justify-center overflow-hidden bg-slate-950/45 px-5 pt-10">
          <div className="flex h-[760px] max-h-[calc(100vh-80px)] min-h-[620px] w-full max-w-[980px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">등록상품 전체 상세리스트</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  등록된 상품 전체를 검색·필터로 확인하고 개별 상세/수정을 처리합니다.
                </p>
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
                            </div>
                          </button>

                          <div className="text-right text-sm font-black text-slate-800">{money(productPrice(product))}</div>

                          <div className="text-center">
                            <span className={["inline-flex rounded-full px-2.5 py-1 text-xs font-black", info.className].join(" ")}>
                              {info.label}
                            </span>
                          </div>

                          <div className="text-center text-xs font-black text-slate-600">{productTypeLabel(product)}</div>
                          <div className="text-center text-xs font-black text-slate-600">{stockSummary(product)}</div>

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

            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                disabled={detailSafePage <= 1}
                onClick={() => setDetailPage((page) => Math.max(1, page - 1))}
                className="h-9 rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-400 disabled:opacity-50"
              >
                이전
              </button>

              <div className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white">
                {detailSafePage}
              </div>

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

      {selectedProduct ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-5">
          <div className="w-full max-w-[720px] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">등록상품 상세보기</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  수정 없이 등록된 상품 정보를 확인합니다.
                </p>
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
                <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                  {selectedImage ? (
                    <img src={selectedImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-black text-slate-400">사진 없음</span>
                  )}
                </div>

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

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-black text-slate-400">상세설명</div>
                  <div className="mt-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">
                    {pickString(selectedProduct, ["product_description", "description", "detail_description"], "상세설명 없음")}
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
