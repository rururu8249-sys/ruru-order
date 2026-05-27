"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./productImageUrl";

type ProductRow = Record<string, unknown>;

type QuickProductFastFormProps = {
  activeBroadcastId: string | number | null;
  initialProduct?: ProductRow | null;
  onClose?: () => void;
};

type VariantStockRow = {
  key: string;
  color: string;
  size: string;
  stock: number;
};

type ImagePickerProps = {
  label: string;
  value: string[];
  maxFiles: number;
  uploadKind: "cover" | "detail";
  mode: "cover" | "detail";
  onChange: (nextValue: string[]) => void;
};

const COLOR_PRESETS = ["블랙", "화이트", "베이지", "네이비", "그레이"];
const SIZE_PRESETS = ["FREE", "S-M-L", "XS-XL", "90-115", "신발 220-290"];

function onlyNumber(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function moneyNumber(value: string) {
  return Number(onlyNumber(value) || 0);
}

function formatNumberWithComma(value: string | number) {
  const digits = onlyNumber(String(value || ""));

  if (!digits) return "";

  return Number(digits).toLocaleString("ko-KR");
}

function normalizeTextareaText(value: string) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
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

function pickString(row: ProductRow | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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

    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();

      if (["true", "1", "yes", "y", "on", "visible", "판매중", "노출"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "off", "hidden", "숨김"].includes(normalized)) return false;
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
      return value
        .split(/[,/|]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function pickImageArray(row: ProductRow | null | undefined, keys: string[]) {
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

      return [trimmed];
    }
  }

  return [];
}

function parseProductNote(row: ProductRow | null | undefined) {
  const raw = pickString(row, ["product_note", "note", "memo"], "");

  if (!raw) return null;

  try {
    return JSON.parse(raw) as {
      stock_mode?: "total" | "option";
      stock_variants?: Array<{ color?: string; size?: string; stock?: number }>;
    };
  } catch {
    return null;
  }
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

    if (match?.[1]) return match[1];
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
      return { data, removedColumns };
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

async function updateProductSchemaSafe(productId: string, payload: Record<string, unknown>) {
  const requiredColumns = new Set(["product_name"]);
  const workingPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from("products")
      .update(workingPayload)
      .eq("id", productId)
      .select("id")
      .single();

    if (!error) {
      return { data, removedColumns };
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

  throw new Error("products 수정 재시도 횟수를 초과했습니다.");
}

function ImagePicker({
  label,
  value,
  maxFiles,
  uploadKind,
  mode,
  onChange,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAllDetailImages, setShowAllDetailImages] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    const safeFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (safeFiles.length === 0) {
      showAdminToast("이미지 파일만 등록할 수 있습니다.", "error");
      return;
    }

    setUploading(true);

    try {
      const uploaded: string[] = [];

      for (const file of safeFiles.slice(0, maxFiles)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", uploadKind);

        const response = await fetch("/api/admin-live/product-images/upload", {
          method: "POST",
          body: formData,
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "이미지 업로드 실패");
        }

        const imageValue = String(payload?.url || payload?.publicUrl || payload?.path || "");

        if (imageValue) uploaded.push(imageValue);
      }

      const nextValue = unique([...value, ...uploaded]).slice(0, maxFiles);
      onChange(nextValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 업로드 실패";
      showAdminToast("이미지 업로드 실패\n\n" + message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void uploadFiles(event.target.files);
    }

    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (event.dataTransfer.files) {
      void uploadFiles(event.dataTransfer.files);
    }
  };

  const removeImage = (index: number) => {
    onChange(value.filter((_, removeIndex) => removeIndex !== index));
  };

  const visibleDetailCount = showAllDetailImages ? maxFiles : Math.min(2, maxFiles);
  const detailSlots = Array.from({ length: visibleDetailCount }, (_, index) => value[index] || "");
  const coverImage = value[0] || "";

  if (mode === "cover") {
    return (
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-black text-slate-700">{label}</span>
          <span className="text-[10px] font-black text-slate-400">{value.length}/{maxFiles}</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="flex h-[150px] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-black text-slate-400 hover:border-blue-300"
          >
            {coverImage ? (
              <img
                src={resolveProductImageUrl(coverImage)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{uploading ? "업로드 중..." : "클릭/드래그"}</span>
            )}
          </button>

          {coverImage ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="absolute right-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-black text-white"
            >
              삭제
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-black text-slate-700">{label}</span>
        <span className="text-[10px] font-black text-slate-400">{value.length}/{maxFiles}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-3 gap-2">
        {detailSlots.map((image, index) => (
          <div key={`${image || "empty"}-${index}`} className="relative">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex h-[64px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[10px] font-black text-slate-400 hover:border-blue-300"
            >
              {image ? (
                <img
                  src={resolveProductImageUrl(image)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : index === value.length ? (
                <span>{uploading ? "업로드" : "+ 추가"}</span>
              ) : (
                <span>사진 없음</span>
              )}
            </button>

            {image ? (
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute right-1 top-1 rounded-full bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-black text-white"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}

        {!showAllDetailImages && maxFiles > 2 ? (
          <button
            type="button"
            onClick={() => setShowAllDetailImages(true)}
            className="flex h-[64px] items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50 text-[11px] font-black text-blue-600"
          >
            +{maxFiles - 2}장 더
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function QuickProductFastForm({
  activeBroadcastId,
  initialProduct = null,
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

  const editingProductId = pickString(initialProduct, ["id", "product_id", "uuid"], "");
  const isEditMode = Boolean(editingProductId);

  useEffect(() => {
    if (!initialProduct) return;

    const productNote = parseProductNote(initialProduct);
    const noteVariants = productNote?.stock_variants || [];

    setProductType(
      pickString(initialProduct, ["product_type", "type"], "broadcast") === "group_buy"
        ? "group_buy"
        : "broadcast",
    );
    setProductName(pickString(initialProduct, ["product_name", "name", "title"], ""));
    setPriceText(String(pickNumber(initialProduct, ["price", "sale_price", "selling_price"], 0) || ""));
    setShippingType(pickString(initialProduct, ["shipping_type", "delivery_type"], "normal"));
    setIsVisible(pickBoolean(initialProduct, ["is_visible", "visible"], true));
    setIsPinned(pickBoolean(initialProduct, ["is_pinned", "pinned"], false));
    setCoverImages(pickImageArray(initialProduct, ["image_url", "cover_image_url", "main_image_url"]).slice(0, 1));
    setDetailImages(pickImageArray(initialProduct, ["detail_image_urls", "detail_images", "images"]).slice(0, 5));
    setColorText(pickArray(initialProduct, ["color_options", "colors"]).join(", "));
    setSizeText(pickArray(initialProduct, ["size_options", "sizes"]).join(", "));
    setDescription(normalizeTextareaText(pickString(initialProduct, ["product_description", "description", "detail_description"], "")));

    if (noteVariants.length > 0) {
      setStockMode("option");
      setVariantRows(
        noteVariants.map((row) => ({
          key: `${row.color || "옵션없음"}__${row.size || "옵션없음"}`,
          color: row.color || "옵션없음",
          size: row.size || "옵션없음",
          stock: Number(row.stock || 0),
        })),
      );
    } else {
      setStockMode("total");
      setTotalStockText(String(pickNumber(initialProduct, ["stock", "total_stock"], 0) || 0));
      setVariantRows([]);
    }
  }, [initialProduct]);

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

  const saveProduct = async () => {
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

    if (productType === "broadcast" && !activeBroadcastId && !isEditMode) {
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
        product_description: normalizeTextareaText(description).trim() || null,
        detail_image_urls: detailImages,
        is_visible: isVisible,
        is_soldout: false,
        product_note: productNote,
      };

      const result = isEditMode
        ? await updateProductSchemaSafe(editingProductId, payload)
        : await insertProductSchemaSafe(payload);

      const productId = result.data?.id;

      if (!isEditMode && productType === "broadcast" && activeBroadcastId && productId) {
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
        showAdminToast(isEditMode ? "상품 수정 완료" : "상품 저장 완료", "success");
      }

      if (!isEditMode) {
        resetForm();
      }

      onClose?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "상품 저장 실패";
      showAdminToast("상품 저장 실패\n\n" + message, "error");
    } finally {
      setSaving(false);
    }
  };

  const choiceButton = "h-8 rounded-xl px-3 text-[11px] font-black";
  const inactiveChoice = "bg-slate-100 text-slate-600 hover:bg-slate-200";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
        <div className="grid min-h-0 content-start grid-rows-[324px_72px_118px_205px] gap-4">
          <section className="grid min-h-0 items-center grid-cols-[180px_minmax(0,1fr)] gap-4 rounded-2xl border border-slate-200 bg-white p-3">
            <ImagePicker
              label="대표사진"
              value={coverImages}
              maxFiles={1}
              uploadKind="cover"
              mode="cover"
              onChange={setCoverImages}
            />

            <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_168px] gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black text-slate-500">상품명</span>
                  <input
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="상품명"
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-sm font-black outline-none focus:border-blue-400"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-black text-slate-500">판매가</span>
                  <div className="flex h-9 items-center rounded-xl border border-slate-200 px-3 focus-within:border-blue-400">
                    <input
                      value={formatNumberWithComma(priceText)}
                      onChange={(event) => setPriceText(onlyNumber(event.target.value))}
                      placeholder="55,000"
                      className="min-w-0 flex-1 text-right text-sm font-black outline-none"
                    />
                    <span className="ml-1 text-xs font-black text-slate-400">원</span>
                  </div>
                </label>
              </div>

              <label className="min-h-0">
                <span className="mb-1 block text-[10px] font-black text-slate-500">상세설명</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(normalizeTextareaText(event.target.value))}
                  placeholder="소재, 핏, 주의사항, 교환/환불 안내"
                  className="h-[210px] w-full resize-none rounded-xl border border-slate-200 p-2.5 text-xs font-bold leading-5 outline-none focus:border-blue-400"
                />
              </label>

            </div>
          </section>

          <section className="grid min-h-0 grid-cols-[1fr_1.2fr_1fr_1fr] gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div>
              <div className="mb-1 text-[10px] font-black text-slate-500">상품구분</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setProductType("broadcast")}
                  className={[
                    choiceButton,
                    productType === "broadcast" ? "bg-blue-600 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  방송
                </button>
                <button
                  type="button"
                  onClick={() => setProductType("group_buy")}
                  className={[
                    choiceButton,
                    productType === "group_buy" ? "bg-blue-600 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  공구
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-black text-slate-500">배송유형</div>
              <div className="flex gap-1">
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
                      choiceButton,
                      shippingType === value ? "bg-blue-600 text-white" : inactiveChoice,
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-black text-slate-500">상태</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setIsVisible(true)}
                  className={[
                    choiceButton,
                    isVisible ? "bg-emerald-600 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  노출
                </button>
                <button
                  type="button"
                  onClick={() => setIsVisible(false)}
                  className={[
                    choiceButton,
                    !isVisible ? "bg-slate-800 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  숨김
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-black text-slate-500">리스트</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setIsPinned(false)}
                  className={[
                    choiceButton,
                    !isPinned ? "bg-slate-800 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  일반
                </button>
                <button
                  type="button"
                  onClick={() => setIsPinned(true)}
                  className={[
                    choiceButton,
                    isPinned ? "bg-blue-600 text-white" : inactiveChoice,
                  ].join(" ")}
                >
                  상단
                </button>
              </div>
            </div>
          </section>

          <section className="grid min-h-0 grid-cols-2 gap-3">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-700">색상</span>
                <span className="text-[10px] font-bold text-slate-400">쉼표 여러 개</span>
              </div>
              <input
                value={colorText}
                onChange={(event) => setColorText(event.target.value)}
                placeholder="예: 블랙, 베이지"
                className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyColorPreset(preset)}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-200"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-700">사이즈</span>
                <span className="text-[10px] font-bold text-slate-400">프리셋 유지</span>
              </div>
              <input
                value={sizeText}
                onChange={(event) => setSizeText(event.target.value)}
                placeholder="예: FREE 또는 S, M, L"
                className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applySizePreset(preset)}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-200"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="grid h-[205px] min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-4">
            <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-3">
              <ImagePicker
                label="상세사진 최대 5장"
                value={detailImages}
                maxFiles={5}
                uploadKind="detail"
                mode="detail"
                onChange={setDetailImages}
              />
              <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold leading-4 text-slate-500">
                기본 2칸만 표시하고 필요할 때 +3장 더로 확장합니다.
              </div>
            </div>

            <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-slate-800">재고관리</div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                  기본은 총재고, 옵션별은 필요할 때만 입력합니다.
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

            <div className="grid min-h-0 grid-cols-[210px_minmax(0,1fr)] gap-3">
              <div className="flex h-[58px] items-center gap-2 rounded-xl bg-slate-50 px-3">
                <span className="text-xs font-bold text-slate-500">전체 재고</span>
                <input
                  value={formatNumberWithComma(totalStockText)}
                  onChange={(event) => setTotalStockText(onlyNumber(event.target.value))}
                  disabled={stockMode === "option"}
                  className="h-9 w-20 rounded-xl border border-slate-200 px-3 text-right text-sm font-black outline-none focus:border-blue-400 disabled:bg-white disabled:text-slate-400"
                />
                <span className="text-xs font-black text-slate-400">개</span>
              </div>

              <div className="min-h-0 overflow-hidden rounded-xl border border-slate-100">
                <div className="grid grid-cols-[1fr_1fr_72px] bg-slate-50 px-3 py-1.5 text-[10px] font-black text-slate-400">
                  <div>색상</div>
                  <div>사이즈</div>
                  <div className="text-right">재고</div>
                </div>

                <div className="max-h-[118px] overflow-y-auto">
                  {stockMode === "option" && resolvedVariantRows.length > 0 ? (
                    resolvedVariantRows.slice(0, 12).map((row) => (
                      <div
                        key={row.key}
                        className="grid grid-cols-[1fr_1fr_72px] items-center border-t border-slate-100 px-3 py-1"
                      >
                        <div className="truncate text-[11px] font-bold text-slate-700">{row.color}</div>
                        <div className="truncate text-[11px] font-bold text-slate-700">{row.size}</div>
                        <input
                          value={String(row.stock || "")}
                          onChange={(event) => updateVariantStock(row.key, moneyNumber(event.target.value))}
                          placeholder="0"
                          className="h-7 rounded-lg border border-slate-200 px-2 text-right text-xs font-black outline-none focus:border-blue-400"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex h-[72px] items-center justify-center text-[11px] font-bold text-slate-400">
                      옵션별 탭을 선택하면 색상/사이즈별 재고 입력
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-1 text-right text-xs font-black text-slate-600">
              총재고 {totalStock.toLocaleString("ko-KR")}개
            </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex h-[70px] shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-5">
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-[120px] rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50"
        >
          닫기
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProduct()}
          className="h-11 w-[180px] rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm disabled:opacity-50"
        >
          {saving ? "저장중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
