"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";

type ProductRow = Record<string, unknown>;

type AdminLiveProductListPanelProps = {
  className?: string;
  fillHeight?: boolean;
};

type ProductCounts = {
  visible: number;
  hidden: number;
  soldout: number;
  pinned: number;
};

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

    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();

      if (["true", "1", "yes", "y", "on", "visible", "판매중", "노출"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "n", "off", "hidden", "숨김"].includes(normalized)) {
        return false;
      }
    }
  }

  return fallback;
}

function pickArray(row: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,/|]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function getProductId(row: ProductRow, index = 0) {
  return pickString(row, ["id", "product_id", "uuid", "code"], `product-${index}`);
}

function getProductName(row: ProductRow) {
  return pickString(
    row,
    ["product_name", "name", "title", "display_name", "item_name", "goods_name", "label"],
    "상품명 없음",
  );
}

function getProductPrice(row: ProductRow) {
  return pickNumber(
    row,
    ["sale_price", "selling_price", "price", "amount", "product_price", "unit_price"],
    0,
  );
}

function getProductImage(row: ProductRow) {
  const rawImage = pickString(
    row,
    [
      "image_url",
      "cover_image_url",
      "main_image_url",
      "thumbnail_url",
      "photo_url",
      "image",
      "public_url",
      "publicUrl",
      "url",
    ],
    "",
  );

  return resolveProductImageUrl(rawImage);
}

function getProductSort(row: ProductRow, fallback: number) {
  return pickNumber(row, ["sort_order", "display_order", "order_no", "priority"], fallback);
}

function getProductCreatedAt(row: ProductRow) {
  return pickString(row, ["created_at", "updated_at", "createdAt", "updatedAt"], "");
}

function statusInfo(row: ProductRow) {
  const raw = pickString(row, ["status", "display_status", "state", "visibility"], "").toLowerCase();
  const isVisible = pickBoolean(row, ["is_visible", "visible", "is_active", "active", "is_displayed"], true);
  const isSoldout = pickBoolean(row, ["is_soldout", "soldout", "sold_out"], false);

  if (isSoldout || /품절|sold/.test(raw)) {
    return {
      label: "품절",
      isVisible: false,
      className: "bg-rose-50 text-rose-700 ring-rose-100",
    };
  }

  if (!isVisible || /숨김|hidden|off|inactive/.test(raw)) {
    return {
      label: "숨김",
      isVisible: false,
      className: "bg-slate-100 text-slate-500 ring-slate-200",
    };
  }

  return {
    label: "노출",
    isVisible: true,
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
}

function optionSummary(row: ProductRow) {
  const colors = pickArray(row, ["color_options", "colors", "color_list", "available_colors"]);
  const sizes = pickArray(row, ["size_options", "sizes", "size_list", "available_sizes"]);

  const colorText = colors.length ? colors.slice(0, 2).join(", ") : "색상없음";
  const sizeText = sizes.length ? sizes.slice(0, 3).join(", ") : "사이즈없음";

  return `${colorText} / ${sizeText}`;
}

function getMissingColumn(errorMessage: string) {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" does not exist/i,
    /Could not find column '([^']+)'/i,
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);

    if (match?.[1]) return match[1];
  }

  return "";
}

async function updateProductSchemaSafe(productId: string, payload: Record<string, unknown>) {
  const workingPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase
      .from("products")
      .update(workingPayload)
      .eq("id", productId);

    if (!error) return { removedColumns };

    const missingColumn = getMissingColumn(error.message || "");

    if (!missingColumn || !(missingColumn in workingPayload)) throw error;

    delete workingPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  throw new Error("products 수정 재시도 횟수를 초과했습니다.");
}

export default function AdminLiveProductListPanel({
  className = "",
  fillHeight = false,
}: AdminLiveProductListPanelProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [draggingId, setDraggingId] = useState("");
  const [previewImage, setPreviewImage] = useState("");

  const pageSize = 8;

  const loadProducts = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .limit(100);

      if (error) throw new Error(error.message);

      const rows = ((data || []) as ProductRow[]).slice().sort((a, b) => {
        const pinnedA = pickBoolean(a, ["is_pinned", "pinned"], false) ? 1 : 0;
        const pinnedB = pickBoolean(b, ["is_pinned", "pinned"], false) ? 1 : 0;

        if (pinnedA !== pinnedB) return pinnedB - pinnedA;

        const sortA = getProductSort(a, 999999);
        const sortB = getProductSort(b, 999999);

        if (sortA !== sortB) return sortA - sortB;

        const createdA = getProductCreatedAt(a);
        const createdB = getProductCreatedAt(b);

        return createdB.localeCompare(createdA);
      });

      setProducts(rows);
      setCurrentPage(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "상품 목록 조회 실패";
      console.warn("[AdminLiveProductListPanel] products load failed:", message);
      setProducts([]);
      setLoadError(message);
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

  const counts = useMemo<ProductCounts>(() => {
    return products.reduce<ProductCounts>(
      (acc, product) => {
        const info = statusInfo(product);

        if (info.label === "노출") acc.visible += 1;
        if (info.label === "숨김") acc.hidden += 1;
        if (info.label === "품절") acc.soldout += 1;
        if (pickBoolean(product, ["is_pinned", "pinned"], false)) acc.pinned += 1;

        return acc;
      },
      { visible: 0, hidden: 0, soldout: 0, pinned: 0 },
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
  };

  const openEditProductPanel = (product: ProductRow) => {
    window.dispatchEvent(
      new CustomEvent("ruru-edit-quick-product", {
        detail: product,
      }),
    );
  };

  const toggleVisible = async (product: ProductRow) => {
    const productId = getProductId(product);
    const info = statusInfo(product);
    const nextVisible = !info.isVisible;

    if (!productId || productId.startsWith("product-")) {
      showAdminToast("상품 ID를 찾지 못해 상태 변경을 할 수 없습니다.", "error");
      return;
    }

    try {
      await updateProductSchemaSafe(productId, {
        is_visible: nextVisible,
        status: nextVisible ? "판매중" : "숨김",
      });

      showAdminToast(nextVisible ? "상품을 노출로 변경했습니다." : "상품을 숨김으로 변경했습니다.", "success");
      await loadProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "상태 변경 실패";
      showAdminToast("상품 상태 변경 실패\n\n" + message, "error");
    }
  };

  const saveReorder = async (nextProducts: ProductRow[]) => {
    try {
      for (let index = 0; index < nextProducts.length; index += 1) {
        const productId = getProductId(nextProducts[index], index);

        if (!productId || productId.startsWith("product-")) continue;

        await updateProductSchemaSafe(productId, {
          sort_order: index + 1,
        });
      }

      showAdminToast("상품 순서를 저장했습니다.", "success");
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "순서 저장 실패";
      showAdminToast("상품 순서 저장 실패\n\n" + message, "error");
    }
  };

  const moveProduct = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;

    const fromIndex = products.findIndex((product, index) => getProductId(product, index) === fromId);
    const toIndex = products.findIndex((product, index) => getProductId(product, index) === toId);

    if (fromIndex < 0 || toIndex < 0) return;

    const nextProducts = products.slice();
    const [moved] = nextProducts.splice(fromIndex, 1);
    nextProducts.splice(toIndex, 0, moved);

    setProducts(nextProducts);
    void saveReorder(nextProducts);
  };

  const heightClass = fillHeight ? "h-full" : "h-[480px]";

  return (
    <div
      className={[
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm",
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

      <div className="grid min-w-0 shrink-0 grid-cols-[34px_minmax(0,1fr)_82px_58px] border-y border-slate-100 py-2 text-[10px] font-black text-slate-400">
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
        <div>순서는 왼쪽 점을 잡고 이동</div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs font-black text-slate-400">
            상품 목록 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-5 text-center text-xs font-bold leading-5 text-amber-700">
            등록상품 리스트를 조용히 대기 중입니다.<br />
            저장 후 새로고침 버튼을 눌러주세요.
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold leading-5 text-slate-400">
            등록된 상품이 없습니다.<br />
            + 상품등록으로 상품을 먼저 추가하세요.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleProducts.map((product, index) => {
              const realIndex = (safePage - 1) * pageSize + index;
              const productId = getProductId(product, realIndex);
              const info = statusInfo(product);
              const imageUrl = getProductImage(product);
              const pinned = pickBoolean(product, ["is_pinned", "pinned"], false);

              return (
                <div
                  key={productId}
                  draggable
                  onDragStart={() => setDraggingId(productId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveProduct(draggingId, productId);
                    setDraggingId("");
                  }}
                  onDragEnd={() => setDraggingId("")}
                  className={[
                    "grid grid-cols-[34px_minmax(0,1fr)_82px_58px] items-center gap-2 py-2",
                    draggingId === productId ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <div
                    title="꾹 잡고 순서 이동"
                    className="cursor-grab text-center text-[13px] font-black text-slate-400 active:cursor-grabbing"
                  >
                    ⋮⋮
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (imageUrl) setPreviewImage(imageUrl);
                      }}
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 hover:ring-blue-300"
                      title={imageUrl ? "사진 크게 보기" : "사진 없음"}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs">
                          🛍️
                        </div>
                      )}
                    </button>

                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-slate-900">
                        {pinned ? "📌 " : ""}
                        {getProductName(product)}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">
                        {money(getProductPrice(product))} · {optionSummary(product)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void toggleVisible(product)}
                      className={`rounded-full px-2 py-1 text-[10px] font-black ring-1 ${info.className}`}
                    >
                      {info.label}
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => openEditProductPanel(product)}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-200"
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

      {previewImage ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-6">
          <button
            type="button"
            aria-label="이미지 미리보기 닫기"
            onClick={() => setPreviewImage("")}
            className="absolute inset-0"
          />

          <div className="relative max-h-[90vh] w-full max-w-[760px] overflow-hidden rounded-3xl bg-white p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black text-slate-950">상품사진 확인</h3>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                  등록된 대표사진을 크게 확인합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewImage("")}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>

            <div className="flex max-h-[78vh] items-center justify-center overflow-auto rounded-2xl bg-slate-50">
              <img
                src={previewImage}
                alt=""
                className="max-h-[78vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
