"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import QuickProductImageDropzone from "./QuickProductImageDropzone";

type QuickProductFastFormProps = {
  activeBroadcastId: string | number | null;
  onClose?: () => void;
};

type VariantStockRow = {
  key: string;
  color: string;
  size: string;
  stock: number;
};

const COLOR_PRESETS = ["블랙", "화이트", "베이지", "네이비", "그레이"];
const SIZE_PRESETS = ["FREE", "S-M-L", "XS-XL", "90-115", "신발 220-290"];

function onlyNumber(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function moneyNumber(value: string) {
  return Number(onlyNumber(value) || 0);
}

function splitOptions(value: string) {
  return String(value || "")
    .split(/[,/|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePresetOptions(preset: string) {
  if (preset === "S-M-L") return ["S", "M", "L"];
  if (preset === "XS-XL") return ["XS", "S", "M", "L", "XL"];
  if (preset === "90-115") return ["90", "95", "100", "105", "110", "115"];
  if (preset === "신발 220-290") {
    return Array.from({ length: 15 }, (_, index) => String(220 + index * 5));
  }
  return [preset];
}

function buildVariantRows(colors: string[], sizes: string[], previous: VariantStockRow[]) {
  const safeColors = colors.length ? colors : ["옵션없음"];
  const safeSizes = sizes.length ? sizes : ["옵션없음"];

  const previousMap = new Map(previous.map((row) => [row.key, row.stock]));

  return safeColors.flatMap((color) =>
    safeSizes.map((size) => {
      const key = `${color}__${size}`;
      return {
        key,
        color,
        size,
        stock: previousMap.get(key) ?? 0,
      };
    }),
  );
}

function getMissingColumn(errorMessage: string) {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" does not exist/i,
    /Could not find column '([^']+)'/i,
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

async function insertProductSchemaSafe(payload: Record<string, unknown>) {
  const requiredColumns = new Set(["product_name"]);
  const workingPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from("products")
      .insert(workingPayload)
      .select("id")
      .single();

    if (!error) {
      return {
        data,
        removedColumns,
      };
    }

    const missingColumn = getMissingColumn(error.message || "");

    if (!missingColumn || !(missingColumn in workingPayload)) {
      throw error;
    }

    if (requiredColumns.has(missingColumn)) {
      throw new Error(
        `products.${missingColumn} 컬럼이 없어서 상품명을 저장할 수 없습니다. Supabase products 스키마 확인이 필요합니다.`,
      );
    }

    delete workingPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  throw new Error("products 저장 재시도 횟수를 초과했습니다.");
}

export default function QuickProductFastForm({
  activeBroadcastId,
  onClose,
}: QuickProductFastFormProps) {
  const [productType, setProductType] = useState<"broadcast" | "group_buy">("broadcast");
  const [productName, setProductName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [shippingType, setShippingType] = useState("normal");
  const [isVisible, setIsVisible] = useState(true);
  const [isPinned, setIsPinned] = useState(false);

  const [coverImages, setCoverImages] = useState<string[]>([]);
  const [detailImages, setDetailImages] = useState<string[]>([]);

  const [colorText, setColorText] = useState("");
  const [sizeText, setSizeText] = useState("");

  const [stockMode, setStockMode] = useState<"total" | "option">("total");
  const [totalStockText, setTotalStockText] = useState("0");
  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);

  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const colors = useMemo(() => unique(splitOptions(colorText)), [colorText]);
  const sizes = useMemo(() => unique(splitOptions(sizeText)), [sizeText]);

  const resolvedVariantRows = useMemo(() => {
    if (stockMode !== "option") return [];
    return buildVariantRows(colors, sizes, variantRows);
  }, [colors, sizes, stockMode, variantRows]);

  const totalStock = useMemo(() => {
    if (stockMode === "option") {
      return resolvedVariantRows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
    }

    return moneyNumber(totalStockText);
  }, [resolvedVariantRows, stockMode, totalStockText]);

  const applyColorPreset = (preset: string) => {
    setColorText((current) => unique([...splitOptions(current), preset]).join(", "));
  };

  const applySizePreset = (preset: string) => {
    setSizeText((current) => unique([...splitOptions(current), ...normalizePresetOptions(preset)]).join(", "));
  };

  const updateVariantStock = (targetKey: string, stock: number) => {
    const nextRows = buildVariantRows(colors, sizes, variantRows).map((row) =>
      row.key === targetKey ? { ...row, stock } : row,
    );

    setVariantRows(nextRows);
  };

  const resetForm = () => {
    setProductType("broadcast");
    setProductName("");
    setPriceText("");
    setShippingType("normal");
    setIsVisible(true);
    setIsPinned(false);
    setCoverImages([]);
    setDetailImages([]);
    setColorText("");
    setSizeText("");
    setStockMode("total");
    setTotalStockText("0");
    setVariantRows([]);
    setDescription("");
  };

  const saveProduct = async (closeAfterSave: boolean) => {
    const name = productName.trim();
    const price = moneyNumber(priceText);

    if (!name) {
      showAdminToast("상품명을 입력해주세요.", "error");
      return;
    }

    if (price <= 0) {
      showAdminToast("판매가를 입력해주세요.", "error");
      return;
    }

    if (productType === "broadcast" && !activeBroadcastId) {
      showAdminToast("방송상품은 방송 시작 후 등록할 수 있습니다.", "error");
      return;
    }

    setSaving(true);

    try {
      const variantStockPayload = resolvedVariantRows.map((row) => ({
        color: row.color,
        size: row.size,
        stock: Number(row.stock || 0),
      }));

      const productNote = JSON.stringify({
        stock_mode: stockMode,
        stock_variants: variantStockPayload,
      });

      const payload: Record<string, unknown> = {
        product_name: name,
        price,
        stock: totalStock,
        status: isVisible ? "판매중" : "숨김",
        product_type: productType,
        shipping_type: shippingType,
        combine_shipping: shippingType === "vendor" ? "N" : "Y",
        sort_order: 0,
        is_pinned: isPinned,
        image_url: coverImages[0] || null,
        color_options: colors,
        size_options: sizes,
        size_option_enabled: colors.length > 0 || sizes.length > 0,
        product_description: description.trim() || null,
        detail_image_urls: detailImages,
        is_visible: isVisible,
        is_soldout: false,
        product_note: productNote,
      };

      const result = await insertProductSchemaSafe(payload);
      const productId = result.data?.id;

      if (productType === "broadcast" && activeBroadcastId && productId) {
        const { error: linkError } = await supabase
          .from("broadcast_products")
          .insert({
            broadcast_id: activeBroadcastId,
            product_id: productId,
            sort_order: 0,
          });

        if (linkError) {
          showAdminToast(
            "상품은 저장됐지만 방송 연결은 실패했습니다.\n\n" + linkError.message,
            "error",
          );
        }
      }

      window.dispatchEvent(new Event("ruru-live-product-updated"));

      if (result.removedColumns.length > 0) {
        showAdminToast(
          `상품 저장 완료\n\nDB에 없는 선택 컬럼은 제외됐습니다: ${result.removedColumns.join(", ")}`,
          "success",
        );
      } else {
        showAdminToast("상품 저장 완료", "success");
      }

      resetForm();

      if (closeAfterSave) {
        onClose?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "상품 저장 실패";
      showAdminToast("상품 저장 실패\n\n" + message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-4">
          <QuickProductImageDropzone
            label="대표사진"
            description="없으면 사진 없는 상품으로 저장"
            value={coverImages}
            maxFiles={1}
            multiple={false}
            uploadKind="cover"
            onChange={(nextValue) => {
              const next = Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [];
              setCoverImages(next.slice(0, 1));
            }}
          />

          <QuickProductImageDropzone
            label="상세사진 최대 5장"
            description="클릭 또는 드래그앤드롭"
            value={detailImages}
            maxFiles={5}
            multiple
            uploadKind="detail"
            onChange={(nextValue) => {
              const next = Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [];
              setDetailImages(next.slice(0, 5));
            }}
          />
        </div>

        <div className="mt-4 grid grid-cols-[1fr_150px] gap-3">
          <label className="block">
            <span className="text-xs font-black text-slate-700">상품명</span>
            <input
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="예: 알로 밴딩 바지"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-slate-700">판매가</span>
            <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 px-3 focus-within:border-blue-400">
              <input
                value={priceText}
                onChange={(event) => setPriceText(onlyNumber(event.target.value))}
                placeholder="0"
                className="min-w-0 flex-1 text-right text-sm font-black outline-none"
              />
              <span className="ml-1 text-xs font-black text-slate-400">원</span>
            </div>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <div className="mb-1 text-xs font-black text-slate-700">상품구분</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                ["broadcast", "방송"],
                ["group_buy", "공구"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProductType(value as "broadcast" | "group_buy")}
                  className={[
                    "h-10 rounded-xl text-xs font-black",
                    productType === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black text-slate-700">배송유형</div>
            <div className="grid grid-cols-3 gap-1">
              {[
                ["normal", "일반"],
                ["vendor", "업체"],
                ["free", "무료"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setShippingType(value)}
                  className={[
                    "h-10 rounded-xl text-xs font-black",
                    shippingType === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black text-slate-700">상태</div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setIsVisible(true)}
                className={[
                  "h-10 rounded-xl text-xs font-black",
                  isVisible ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                노출
              </button>
              <button
                type="button"
                onClick={() => setIsVisible(false)}
                className={[
                  "h-10 rounded-xl text-xs font-black",
                  !isVisible ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                숨김
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">색상</span>
              <span className="text-[10px] font-bold text-slate-400">쉼표로 여러 개</span>
            </div>
            <input
              value={colorText}
              onChange={(event) => setColorText(event.target.value)}
              placeholder="블랙, 베이지"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyColorPreset(preset)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">사이즈</span>
              <span className="text-[10px] font-bold text-slate-400">버튼 또는 직접입력</span>
            </div>
            <input
              value={sizeText}
              onChange={(event) => setSizeText(event.target.value)}
              placeholder="FREE 또는 S, M, L"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applySizePreset(preset)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black text-slate-700">재고관리</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                옵션별 재고를 쓰면 총재고는 자동 합산됩니다.
              </div>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setStockMode("total")}
                className={[
                  "rounded-lg px-3 py-1.5 text-[11px] font-black",
                  stockMode === "total" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500",
                ].join(" ")}
              >
                총재고
              </button>
              <button
                type="button"
                onClick={() => setStockMode("option")}
                className={[
                  "rounded-lg px-3 py-1.5 text-[11px] font-black",
                  stockMode === "option" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500",
                ].join(" ")}
              >
                옵션별
              </button>
            </div>
          </div>

          {stockMode === "total" ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">전체 재고수량</span>
              <input
                value={totalStockText}
                onChange={(event) => setTotalStockText(onlyNumber(event.target.value))}
                className="h-10 w-28 rounded-xl border border-slate-200 px-3 text-right text-sm font-black outline-none focus:border-blue-400"
              />
              <span className="text-xs font-black text-slate-400">개</span>
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100">
              <div className="grid grid-cols-[1fr_1fr_100px] bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-400">
                <div>색상</div>
                <div>사이즈</div>
                <div className="text-right">재고</div>
              </div>

              {resolvedVariantRows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_1fr_100px] items-center border-t border-slate-100 px-3 py-2"
                >
                  <div className="text-xs font-bold text-slate-700">{row.color}</div>
                  <div className="text-xs font-bold text-slate-700">{row.size}</div>
                  <input
                    value={String(row.stock || "")}
                    onChange={(event) => updateVariantStock(row.key, moneyNumber(event.target.value))}
                    placeholder="0"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-right text-xs font-black outline-none focus:border-blue-400"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 text-right text-xs font-black text-slate-600">
            총재고 {totalStock.toLocaleString()}개
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-black text-slate-700">상세설명</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="소재, 핏, 주의사항, 교환/환불 안내 등을 짧게 적어주세요."
            className="mt-1 h-28 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm font-bold leading-6 outline-none focus:border-blue-400"
          />
        </label>

        <label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(event) => setIsPinned(event.target.checked)}
          />
          <span className="text-xs font-black text-slate-600">등록상품 리스트 상단 고정</span>
        </label>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-28 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600"
        >
          취소
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProduct(false)}
          className="h-12 flex-1 rounded-xl border border-blue-200 bg-white text-sm font-black text-blue-600 disabled:opacity-50"
        >
          {saving ? "저장중..." : "저장 후 계속등록"}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProduct(true)}
          className="h-12 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
        >
          저장 후 닫기
        </button>
      </div>
    </div>
  );
}
