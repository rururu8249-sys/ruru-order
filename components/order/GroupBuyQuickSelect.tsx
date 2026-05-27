"use client";

import { useEffect, useMemo, useState } from "react";

export type GroupBuyQuickSelectProduct = {
  id: string | number;
  product_name: string;
  price?: number | string;
  shipping_type?: string;
  image_url?: string;
  thumbnail_url?: string;
  main_image_url?: string;
  product_note?: unknown;
  description?: string;
  detail_description?: string;
  product_description?: string;
  detail_image_urls?: unknown;
  images?: unknown;
  product_images?: unknown;
};

type Props = {
  products: GroupBuyQuickSelectProduct[];
  onSelect: (product: GroupBuyQuickSelectProduct) => void;
};

type FilterKey = "all" | "normal" | "vendor" | "needsPrice";

const GROUP_BUY_SHEET_PAGE_SIZE = 8;

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim() || 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWon(value: unknown) {
  return `${toNumber(value).toLocaleString("ko-KR")}원`;
}

function getDeliveryLabel(product: GroupBuyQuickSelectProduct) {
  const value = String(product.shipping_type ?? "").trim().toLowerCase();

  if (
    value.includes("vendor") ||
    value.includes("company") ||
    value.includes("direct") ||
    value.includes("업체")
  ) {
    return "업체배송";
  }

  return "일반배송";
}

function getImageUrl(product: GroupBuyQuickSelectProduct) {
  return String(product.image_url || product.thumbnail_url || product.main_image_url || "").trim();
}

function hasPrice(product: GroupBuyQuickSelectProduct) {
  return toNumber(product.price) > 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function readDetailText(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) return "";

    try {
      return readDetailText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  if (Array.isArray(value)) {
    return value.map(readDetailText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      readDetailText(record.detail_description) ||
      readDetailText(record.product_description) ||
      readDetailText(record.description) ||
      readDetailText(record.content) ||
      readDetailText(record.memo) ||
      readDetailText(record.note) ||
      ""
    );
  }

  return "";
}

function readImageList(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) return [];

    if (trimmed.startsWith("http") || trimmed.startsWith("/")) {
      return [trimmed];
    }

    try {
      return readImageList(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap(readImageList);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    return [
      ...readImageList(record.image_url),
      ...readImageList(record.thumbnail_url),
      ...readImageList(record.main_image_url),
      ...readImageList(record.url),
      ...readImageList(record.images),
      ...readImageList(record.product_images),
      ...readImageList(record.detail_image_urls),
    ];
  }

  return [];
}

function getProductDetailText(product: GroupBuyQuickSelectProduct) {
  return (
    readDetailText(product.detail_description) ||
    readDetailText(product.product_description) ||
    readDetailText(product.description) ||
    readDetailText(product.product_note) ||
    ""
  );
}

function getProductDetailImages(product: GroupBuyQuickSelectProduct) {
  const images = [
    getImageUrl(product),
    ...readImageList(product.detail_image_urls),
    ...readImageList(product.images),
    ...readImageList(product.product_images),
    ...readImageList(product.product_note),
  ].filter(Boolean);

  return Array.from(new Set(images));
}

function getPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}

function ProductThumbnail({ product, className = "h-14 w-14" }: { product: GroupBuyQuickSelectProduct; className?: string }) {
  const imageUrl = getImageUrl(product);

  if (!imageUrl) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-400 ring-1 ring-slate-200 ${className}`}>
        NO
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={product.product_name}
      className={`shrink-0 rounded-2xl object-cover ring-1 ring-slate-200 ${className}`}
    />
  );
}

function PriceAndDelivery({ product }: { product: GroupBuyQuickSelectProduct }) {
  const priceExists = hasPrice(product);
  const deliveryLabel = getDeliveryLabel(product);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] font-black">
      <span className={priceExists ? "text-blue-600" : "text-blue-600"}>
        {priceExists ? formatWon(product.price) : "가격 직접입력"}
      </span>
      <span className="text-gray-300">·</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
        deliveryLabel === "업체배송"
          ? "bg-blue-50 text-blue-600"
          : "bg-slate-100 text-slate-600"
      }`}
      >
        {deliveryLabel}
      </span>
    </div>
  );
}

function QuickProductCard({
  product,
  onSelect,
}: {
  product: GroupBuyQuickSelectProduct;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="min-h-[132px] rounded-2xl bg-white p-2.5 text-left shadow-sm ring-1 ring-blue-100 transition active:scale-[0.99]"
    >
      <ProductThumbnail product={product} className="mb-2 h-14 w-full" />

      <div className="line-clamp-2 min-h-[36px] text-[13px] font-black leading-[18px] tracking-[-0.04em] text-gray-950">
        {product.product_name}
      </div>

      <PriceAndDelivery product={product} />
    </button>
  );
}

function SheetProductCard({
  product,
  onDetail,
  onSelect,
}: {
  product: GroupBuyQuickSelectProduct;
  onDetail: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-blue-100">
      <div className="flex gap-3">
        <ProductThumbnail product={product} className="h-20 w-20" />

        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] font-black leading-5 tracking-[-0.04em] text-gray-950">
            {product.product_name}
          </div>
          <PriceAndDelivery product={product} />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDetail}
              className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
            >
              상세
            </button>
            <button
              type="button"
              onClick={onSelect}
              className="h-10 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm"
            >
              선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductDetailSheet({
  product,
  onClose,
  onSelect,
}: {
  product: GroupBuyQuickSelectProduct;
  onClose: () => void;
  onSelect: () => void;
}) {
  const detailText = getProductDetailText(product);
  const detailImages = getProductDetailImages(product);
  const mainImage = detailImages[0] || getImageUrl(product);

  return (
    <div className="fixed inset-0 z-[10000] flex items-end bg-black/55 px-3 pb-0">
      <div className="mx-auto flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 p-5">
          <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-[-0.05em] text-gray-950">상품 상세보기</div>
              <div className="mt-1 text-sm font-bold tracking-[-0.04em] text-gray-500">
                사진과 안내를 확인 후 선택해주세요.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {mainImage ? (
            <img
              src={mainImage}
              alt={product.product_name}
              className="mb-4 h-64 w-full rounded-3xl object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="mb-4 flex h-64 w-full items-center justify-center rounded-3xl bg-slate-100 text-sm font-black text-slate-400 ring-1 ring-slate-200">
              상품사진 없음
            </div>
          )}

          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-xl font-black tracking-[-0.05em] text-gray-950">{product.product_name}</div>
            <PriceAndDelivery product={product} />
          </div>

          <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-4">
            <div className="mb-2 text-sm font-black text-slate-900">상품 안내</div>
            <div className="whitespace-pre-wrap text-sm font-bold leading-6 text-slate-600">
              {detailText || "상세 설명이 등록되지 않았습니다."}
            </div>
          </div>

          {detailImages.length > 1 ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm font-black text-slate-900">상세사진</div>
              {detailImages.slice(1, 6).map((imageUrl, index) => (
                <img
                  key={`${imageUrl}-${index}`}
                  src={imageUrl}
                  alt={`${product.product_name} 상세사진 ${index + 1}`}
                  className="w-full rounded-3xl object-cover ring-1 ring-slate-200"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 grid grid-cols-[1fr_1.35fr] gap-3 border-t border-slate-100 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-14 rounded-2xl bg-slate-100 text-base font-black text-slate-700"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="h-14 rounded-2xl bg-blue-600 text-base font-black text-white shadow-sm"
          >
            이 상품 선택하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GroupBuyQuickSelect({ products, onSelect }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<GroupBuyQuickSelectProduct | null>(null);
  const [searchText, setSearchText] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const quickProducts = products.slice(0, 3);

  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return products.filter((product) => {
      const name = normalizeText(product.product_name).toLowerCase();
      const deliveryLabel = getDeliveryLabel(product);
      const priceExists = hasPrice(product);

      const matchesSearch = !query || name.includes(query);
      const matchesFilter =
        filterKey === "all" ||
        (filterKey === "normal" && deliveryLabel === "일반배송") ||
        (filterKey === "vendor" && deliveryLabel === "업체배송") ||
        (filterKey === "needsPrice" && !priceExists);

      return matchesSearch && matchesFilter;
    });
  }, [filterKey, products, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / GROUP_BUY_SHEET_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (safeCurrentPage - 1) * GROUP_BUY_SHEET_PAGE_SIZE,
    safeCurrentPage * GROUP_BUY_SHEET_PAGE_SIZE,
  );
  const paginationItems = getPaginationItems(safeCurrentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterKey, searchText, sheetOpen]);

  const closeSheet = () => {
    setSheetOpen(false);
    setSearchText("");
    setFilterKey("all");
    setCurrentPage(1);
  };

  const handleSelect = (product: GroupBuyQuickSelectProduct) => {
    onSelect(product);
    setDetailProduct(null);
    closeSheet();
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <>
      <section data-ruru-group-buy-quick-select className="mb-5 rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="mb-3">
          <div className="text-lg font-black tracking-[-0.04em] text-gray-900">공구상품 빠른선택</div>
          <div className="mt-1 text-sm font-bold tracking-[-0.04em] text-gray-500">
            검색어를 몰라도 바로 선택할 수 있어요.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickProducts.map((product) => (
            <QuickProductCard
              key={`quick-group-buy-${String(product.id)}`}
              product={product}
              onSelect={() => handleSelect(product)}
            />
          ))}

          {products.length > 3 ? (
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                setSheetOpen(true);
              }}
              className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-white/70 p-3 text-center text-base font-black tracking-[-0.04em] text-blue-600"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="mt-2">공구상품</span>
              <span>더보기</span>
            </button>
          ) : null}
        </div>
      </section>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end bg-black/45 px-3 pb-0">
          <div className="mx-auto flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 p-5">
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-black tracking-[-0.05em] text-gray-950">공구상품 전체보기</div>
                  <div className="mt-1 text-sm font-bold tracking-[-0.04em] text-gray-500">
                    검색/필터 후 상품을 선택해주세요.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeSheet}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"
                >
                  닫기
                </button>
              </div>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="상품명 검색"
                className="mt-4 h-[52px] w-full rounded-2xl border border-slate-200 px-4 text-base font-black outline-none focus:border-blue-500"
              />

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  ["all", "전체"],
                  ["normal", "일반배송"],
                  ["vendor", "업체배송"],
                  ["needsPrice", "금액입력필요"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key as FilterKey)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
                      filterKey === key
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {filteredProducts.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-black text-slate-500">
                  검색된 공구상품이 없습니다.
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paginatedProducts.map((product) => (
                      <SheetProductCard
                        key={`sheet-group-buy-${String(product.id)}`}
                        product={product}
                        onDetail={() => setDetailProduct(product)}
                        onSelect={() => handleSelect(product)}
                      />
                    ))}
                  </div>

                  {totalPages > 1 ? (
                    <div data-ruru-group-buy-pagination className="mt-4 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="h-10 rounded-xl bg-slate-100 px-3 text-sm font-black text-slate-700 disabled:opacity-35"
                      >
                        {"<"}
                      </button>

                      {paginationItems.map((item, index) =>
                        item === "ellipsis" ? (
                          <span
                            key={`pagination-ellipsis-${index}`}
                            className="flex h-10 min-w-8 items-center justify-center text-sm font-black text-slate-400"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={`pagination-page-${item}`}
                            type="button"
                            onClick={() => setCurrentPage(item)}
                            className={`h-10 min-w-10 rounded-xl px-3 text-sm font-black ${
                              item === safeCurrentPage
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {item}
                          </button>
                        ),
                      )}

                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="h-10 rounded-xl bg-slate-100 px-3 text-sm font-black text-slate-700 disabled:opacity-35"
                      >
                        {">"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {detailProduct ? (
        <ProductDetailSheet
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onSelect={() => handleSelect(detailProduct)}
        />
      ) : null}
    </>
  );
}
