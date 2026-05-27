"use client";

import { useMemo, useState } from "react";

export type GroupBuyQuickSelectProduct = {
  id: string | number;
  product_name: string;
  price?: number | string;
  shipping_type?: string;
  image_url?: string;
  thumbnail_url?: string;
  main_image_url?: string;
};

type Props = {
  products: GroupBuyQuickSelectProduct[];
  onSelect: (product: GroupBuyQuickSelectProduct) => void;
};

type FilterKey = "all" | "normal" | "vendor" | "needsPrice";

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

function ProductThumbnail({ product }: { product: GroupBuyQuickSelectProduct }) {
  const imageUrl = getImageUrl(product);

  if (!imageUrl) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-400 ring-1 ring-slate-200">
        NO
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={product.product_name}
      className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200"
    />
  );
}

function ProductRow({
  product,
  onClick,
}: {
  product: GroupBuyQuickSelectProduct;
  onClick: () => void;
}) {
  const priceExists = hasPrice(product);
  const deliveryLabel = getDeliveryLabel(product);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-blue-100 transition active:scale-[0.99]"
    >
      <ProductThumbnail product={product} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black tracking-[-0.04em] text-gray-950">
          {product.product_name}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] font-black">
          <span className={priceExists ? "text-blue-600" : "text-gray-500"}>
            {priceExists ? formatWon(product.price) : "금액 직접입력"}
          </span>
          <span className="text-gray-300">·</span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-600">
            {deliveryLabel}
          </span>
        </div>
      </div>

      <div className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-[13px] font-black text-white shadow-sm">
        선택
      </div>
    </button>
  );
}

export default function GroupBuyQuickSelect({ products, onSelect }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");

  const quickProducts = products.slice(0, 3);

  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return products.filter((product) => {
      const name = product.product_name.toLowerCase();
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

  const handleSelect = (product: GroupBuyQuickSelectProduct) => {
    onSelect(product);
    setSheetOpen(false);
    setSearchText("");
    setFilterKey("all");
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <>
      <section data-ruru-group-buy-quick-select className="mb-5 rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-[-0.04em] text-gray-900">공구상품 빠른선택</div>
            <div className="mt-1 text-sm font-bold tracking-[-0.04em] text-gray-500">
              검색어를 몰라도 바로 선택할 수 있어요.
            </div>
          </div>

          {products.length > 3 ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="shrink-0 rounded-2xl bg-white px-4 py-2 text-sm font-black text-blue-600 shadow-sm ring-1 ring-blue-100"
            >
              + 공구상품 더보기
            </button>
          ) : null}
        </div>

        <div className="grid gap-2">
          {quickProducts.map((product) => (
            <ProductRow
              key={`quick-group-buy-${String(product.id)}`}
              product={product}
              onClick={() => handleSelect(product)}
            />
          ))}
        </div>
      </section>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end bg-black/45 px-3 pb-0">
          <div className="mx-auto flex max-h-[84vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 p-5">
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-black tracking-[-0.05em] text-gray-950">공구상품 전체보기</div>
                  <div className="mt-1 text-sm font-bold tracking-[-0.04em] text-gray-500">
                    상품을 선택하면 주문서에 바로 입력됩니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"
                >
                  닫기
                </button>
              </div>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="공구상품 검색"
                className="mt-4 h-13 w-full rounded-2xl border border-slate-200 px-4 text-base font-black outline-none focus:border-blue-500"
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
                <div className="grid gap-2">
                  {filteredProducts.map((product) => (
                    <ProductRow
                      key={`sheet-group-buy-${String(product.id)}`}
                      product={product}
                      onClick={() => handleSelect(product)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
