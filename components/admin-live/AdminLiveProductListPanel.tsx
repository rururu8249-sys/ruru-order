"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";

type ProductRow = {
  id: string | number;
  name?: string | null;
  price?: number | null;
  stock?: number | null;
  status?: string | null;
  product_type?: string | null;
  shipping_type?: string | null;
  sort_order?: number | null;
  is_pinned?: boolean | null;
  image_url?: string | null;
  color_options?: string[] | null;
  size_options?: string[] | null;
  size_option_enabled?: boolean | null;
};

type AdminLiveProductListPanelProps = {
  className?: string;
  fillHeight?: boolean;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function statusInfo(product: ProductRow) {
  const raw = String(product.status || "").trim();

  if (/품절|sold/i.test(raw)) {
    return {
      label: "품절",
      className: "bg-rose-50 text-rose-700 ring-rose-100",
    };
  }

  if (/숨김|hidden|off/i.test(raw)) {
    return {
      label: "숨김",
      className: "bg-slate-100 text-slate-500 ring-slate-200",
    };
  }

  return {
    label: "노출",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
}

function optionSummary(product: ProductRow) {
  const colors = safeArray(product.color_options);
  const sizes = safeArray(product.size_options);

  const colorText = colors.length ? colors.slice(0, 2).join(", ") : "색상없음";
  const sizeText = sizes.length ? sizes.slice(0, 3).join(", ") : "사이즈없음";

  return `${colorText} / ${sizeText}`;
}

export default function AdminLiveProductListPanel({
  className = "",
  fillHeight = false,
}: AdminLiveProductListPanelProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 8;

  const loadProducts = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,stock,status,product_type,shipping_type,sort_order,is_pinned,image_url,color_options,size_options,size_option_enabled")
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      setProducts((data || []) as ProductRow[]);
      setCurrentPage(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "상품 목록 조회 실패";
      showAdminToast("등록상품 리스트 조회 실패\n\n" + message, "error");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();

    const handler = () => loadProducts();
    window.addEventListener("ruru-live-product-updated", handler);

    return () => {
      window.removeEventListener("ruru-live-product-updated", handler);
    };
  }, []);

  const counts = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        const info = statusInfo(product);
        if (info.label === "노출") acc.visible += 1;
        if (info.label === "숨김") acc.hidden += 1;
        if (info.label === "품절") acc.soldout += 1;
        if (product.is_pinned) acc.pinned += 1;
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

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(products.length / pageSize));
  }, [products.length]);

  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const visibleProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return products.slice(start, start + pageSize);
  }, [products, safePage]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, safePage - half);
    const end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [safePage, totalPages]);

  const openQuickProductPanel = () => {
    window.dispatchEvent(new Event("ruru-open-quick-product-panel"));
    showAdminToast("빠른상품등록 패널을 열었습니다.", "info");
  };

  const heightClass = fillHeight ? "h-full min-h-[610px]" : "h-[480px]";

  return (
    <div
      className={[
        "flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm",
        heightClass,
        className,
      ].join(" ")}
    >
      <div className="mb-3 flex min-w-0 shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-950">등록상품 리스트</h2>
          <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
            노출 {counts.visible} · 고정 {counts.pinned} · 숨김 {counts.hidden} · 품절 {counts.soldout}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={openQuickProductPanel}
            className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-700"
          >
            + 상품등록
          </button>

          <button
            type="button"
            onClick={loadProducts}
            className="rounded-xl bg-slate-100 px-2.5 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-200"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="grid min-w-0 shrink-0 grid-cols-[34px_minmax(0,1fr)_82px_42px] border-y border-slate-100 py-2 text-[10px] font-black text-slate-400">
        <div>순서</div>
        <div>상품정보</div>
        <div className="text-center">상태</div>
        <div className="text-center">관리</div>
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-between gap-2 text-[10px] font-black text-slate-500">
        <div>
          {products.length === 0
            ? "0개"
            : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, products.length)} / ${products.length}개`}
        </div>
        <div>기본 {pageSize}개</div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs font-black text-slate-400">
            상품 목록 불러오는 중...
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold leading-5 text-slate-400">
            등록된 상품이 없습니다.<br />
            + 상품등록으로 상품을 먼저 추가하세요.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleProducts.map((product, index) => {
              const info = statusInfo(product);

              return (
                <div
                  key={String(product.id)}
                  className="grid grid-cols-[34px_minmax(0,1fr)_82px_42px] items-center gap-2 py-2"
                >
                  <div className="text-center text-[11px] font-black text-slate-400">
                    {(safePage - 1) * pageSize + index + 1}
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs">
                          🛍️
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-slate-900">
                        {product.is_pinned ? "📌 " : ""}
                        {product.name || "상품명 없음"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">
                        {money(product.price)} · {optionSummary(product)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ring-1 ${info.className}`}>
                      {info.label}
                    </span>
                  </div>

                  <div className="text-center text-[11px] font-black text-slate-400">
                    -
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-100 pt-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          이전
        </button>

        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => setCurrentPage(pageNumber)}
            className={[
              "min-w-8 rounded-lg px-2.5 py-1.5 text-[11px] font-black",
              pageNumber === safePage
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            ].join(" ")}
          >
            {pageNumber}
          </button>
        ))}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
