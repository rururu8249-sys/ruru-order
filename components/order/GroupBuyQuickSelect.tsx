"use client";

import { useState } from "react";

export type GroupBuyQuickSelectProduct = {
  id?: string | number;
  product_id?: string | number;
  productId?: string | number;
  product_name?: string;
  name?: string;
  title?: string;
  price?: number | string;
  product_price?: number | string;
  sale_price?: number | string;
  amount?: number | string;
  total_price?: number | string;
  image_url?: string;
  main_image_url?: string;
  thumbnail_url?: string;
  product_image_url?: string;
  imageUrl?: string;
  image?: string;
  thumbnail?: string;
  photo_url?: string;
  photo?: string;
  [key: string]: unknown;
};

type GroupBuyQuickSelectProps = {
  products: GroupBuyQuickSelectProduct[];
  onSelect: (product: GroupBuyQuickSelectProduct) => void;
};

const textValue = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
};

const numericPrice = (value: unknown) => {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  const numberValue = Number(digits);

  return Number.isFinite(numberValue) ? numberValue : 0;
};

const productName = (product: GroupBuyQuickSelectProduct) => {
  const record = product as Record<string, unknown>;

  return textValue(record, ["product_name", "name", "title"]) || "등록상품";
};

const productPrice = (product: GroupBuyQuickSelectProduct) => {
  const record = product as Record<string, unknown>;
  const rawPrice =
    record.product_price ??
    record.price ??
    record.sale_price ??
    record.amount ??
    record.total_price;
  const price = numericPrice(rawPrice);

  if (price <= 0) return "금액 확인";

  return `${price.toLocaleString()}원`;
};

const productImageUrl = (product: GroupBuyQuickSelectProduct) => {
  const record = product as Record<string, unknown>;

  const directImageUrl = textValue(record, [
    "image_url",
    "main_image_url",
    "thumbnail_url",
    "product_image_url",
    "imageUrl",
    "image",
    "thumbnail",
    "photo_url",
    "photo",
  ]);

  if (directImageUrl) return directImageUrl;

  const dynamicKey = Object.keys(record).find((key) => {
    const lowerKey = key.toLowerCase();
    const value = record[key];

    return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      (lowerKey.includes("image") || lowerKey.includes("thumb") || lowerKey.includes("photo")) &&
      (value.startsWith("http") || value.startsWith("/") || value.startsWith("data:image"))
    );
  });

  if (!dynamicKey) return "";

  const value = record[dynamicKey];
  return typeof value === "string" ? value.trim() : "";
};

export default function GroupBuyQuickSelect({ products, onSelect }: GroupBuyQuickSelectProps) {
  const [expanded, setExpanded] = useState(false);

  const safeProducts = Array.isArray(products) ? products : [];
  const visibleProducts = expanded ? safeProducts : safeProducts.slice(0, 2);
  const hasMoreProducts = safeProducts.length > 2;

  if (safeProducts.length === 0) {
    return (
      <div className="w-full max-w-full rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
        <p className="text-[13px] font-black tracking-[-0.04em] text-slate-500">
          등록된 상품이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="grid w-full max-w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_78px] gap-2 overflow-hidden">
        {visibleProducts.map((product, index) => {
          const name = productName(product);
          const price = productPrice(product);
          const imageUrl = productImageUrl(product);

          return (
            <button
              key={`${String(product.id ?? product.product_id ?? product.productId ?? name)}-${index}`}
              type="button"
              onClick={() => onSelect(product)}
              className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white p-2 text-left shadow-sm active:scale-[0.98]"
            >
              <div className="mx-auto flex h-16 w-16 max-w-full items-center justify-center overflow-hidden rounded-[18px] bg-slate-50 ring-1 ring-slate-100">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-black text-slate-400">
                    NO
                  </span>
                )}
              </div>

              <p className="mt-2 w-full truncate text-[13px] font-black leading-tight tracking-[-0.05em] text-slate-950">
                {name}
              </p>

              <p className="mt-1 w-full truncate text-[14px] font-black tracking-[-0.05em] text-blue-700">
                {price}
              </p>
            </button>
          );
        })}

        {hasMoreProducts ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[20px] border border-dashed border-blue-200 bg-blue-50 px-2 text-center text-blue-700 active:scale-[0.98]"
          >
            <span className="text-[22px] font-black leading-none">+</span>
            <span className="mt-1 text-[12px] font-black leading-tight tracking-[-0.04em]">
              상품
              <br />
              {expanded ? "접기" : "더보기"}
            </span>
            <span className="mt-1 text-[11px] font-black leading-tight tracking-[-0.04em]">
              총 {safeProducts.length}개
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
