"use client";

import { ChangeEvent, DragEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./productImageUrl";
import { compressProductImage } from "./compressProductImage";

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
  triggerRef?: { current: (() => void) | null };
};

const COLOR_PRESETS = ["블랙", "화이트"];
const SIZE_PRESETS = ["FREE", "XS-XXL", "90-115", "신발 220-290"];

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
  if (preset === "XS-XXL") return ["XS", "S", "M", "L", "XL", "XXL"];
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
      stock_management_enabled?: boolean;
      registered_order_enabled?: boolean;
      name_suggestion_enabled?: boolean;
      suggestion_keywords?: string[];
    };
  } catch {
    return null;
  }
}

function buildVariantRows(colors: string[], sizes: string[], previous: VariantStockRow[]) {
  const safeColors = colors.length ? colors : [""];
  const safeSizes = sizes.length ? sizes : [""];
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
  triggerRef,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 외부(폼의 '⬆ 사진 직접 올림' 버튼)에서 파일 선택을 열 수 있도록 트리거 노출
  useEffect(() => {
    if (!triggerRef) return;
    triggerRef.current = () => inputRef.current?.click();
    return () => {
      triggerRef.current = null;
    };
  }, [triggerRef]);
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
        const optimizedFile = await compressProductImage(file, uploadKind);
        const formData = new FormData();
        formData.append("file", optimizedFile);
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
            className="flex h-[150px] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-black text-slate-400 hover:border-rose-line"
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
              className="flex h-[64px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[10px] font-black text-slate-400 hover:border-rose-line"
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
            className="flex h-[64px] items-center justify-center rounded-xl border border-dashed border-rose-line bg-rose-soft text-[11px] font-black text-rose-deep"
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
  const [saleMode, setSaleMode] = useState<"broadcast" | "shop" | "both">("both");
  const [category, setCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");
  const [productName, setProductName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [stockManagementEnabled, setStockManagementEnabled] = useState(false);
  const [shippingType, setShippingType] = useState("normal");
  const [isVisible, setIsVisible] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [registeredOrderEnabled, setRegisteredOrderEnabled] = useState(true);
  const [nameSuggestionEnabled, setNameSuggestionEnabled] = useState(true);
  const [suggestionKeywordsText, setSuggestionKeywordsText] = useState("");

  const [coverImages, setCoverImages] = useState<string[]>([]);
  const [detailImages, setDetailImages] = useState<string[]>([]);

  const [colorText, setColorText] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [colorEnabled, setColorEnabled] = useState(true);
  const [sizeEnabled, setSizeEnabled] = useState(true);

  const [stockMode, setStockMode] = useState<"total" | "option">("total");
  const [totalStockText, setTotalStockText] = useState("0");
  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);

  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [sizePresetOpen, setSizePresetOpen] = useState(false);
  const coverUploadRef = useRef<(() => void) | null>(null);

  // 팝업 드래그(헤더 잡고 이동)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const onHeaderMouseDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement)?.closest("button")) return; // ✕ 버튼 등은 드래그 제외
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: dragOffset.x, baseY: dragOffset.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setDragOffset({
        x: dragRef.current.baseX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.baseY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const editingProductId = pickString(initialProduct, ["id", "product_id", "uuid"], "");
  const isEditMode = Boolean(editingProductId);

  const orderExposureMode =
    !isVisible ? "hidden" : registeredOrderEnabled ? "card_and_search" : "search_only";

  const applyOrderExposureMode = (mode: "card_and_search" | "search_only" | "hidden") => {
    if (mode === "card_and_search") {
      setIsVisible(true);
      setRegisteredOrderEnabled(true);
      setNameSuggestionEnabled(true);
      return;
    }

    if (mode === "search_only") {
      setIsVisible(true);
      setRegisteredOrderEnabled(false);
      setNameSuggestionEnabled(true);
      return;
    }

    setIsVisible(false);
    setRegisteredOrderEnabled(false);
    setNameSuggestionEnabled(false);
  };

  const orderExposureOptions = [
    { value: "card_and_search", label: "카드+검색", desc: "카드 표시 + 상품명 검색" },
    { value: "search_only", label: "검색만", desc: "카드 숨김 + 상품명 검색" },
    { value: "hidden", label: "숨김", desc: "카드/검색 모두 제외" },
  ] as const;

  useEffect(() => {
    if (!initialProduct) return;

    const productNote = parseProductNote(initialProduct);
    const noteVariants = productNote?.stock_variants || [];
    setStockManagementEnabled(productNote?.stock_management_enabled !== false);
    setRegisteredOrderEnabled(productNote?.registered_order_enabled !== false);
    setNameSuggestionEnabled(productNote?.name_suggestion_enabled !== false);
    setSuggestionKeywordsText(Array.isArray(productNote?.suggestion_keywords) ? productNote.suggestion_keywords.join(", ") : "");

    const initSaleMode = pickString(initialProduct, ["sale_mode"], "");
    const initType = pickString(initialProduct, ["product_type", "type"], "broadcast");
    setSaleMode(
      initSaleMode === "broadcast" || initSaleMode === "shop" || initSaleMode === "both"
        ? initSaleMode
        : initType === "group_buy"
          ? "shop"
          : "broadcast",
    );
    setCategory(String((productNote as { category?: unknown } | null)?.category || ""));
    setProductName(pickString(initialProduct, ["product_name", "name", "title"], ""));
    setPriceText(formatNumberWithComma(pickNumber(initialProduct, ["price", "sale_price", "selling_price"], 0)));
    setShippingType(pickString(initialProduct, ["shipping_type", "delivery_type"], "normal"));
    // is_visible 컬럼이 schema-safe로 빠진 경우에도 status("숨김"/"판매중")로 정확히 복원
    setIsVisible(pickBoolean(initialProduct, ["is_visible", "visible", "status"], true));
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
          key: `${row.color || "__EMPTY_COLOR__"}__${row.size || "__EMPTY_SIZE__"}`,
          color: row.color || "",
          size: row.size || "",
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

  const noneOptionAutofillEnabled = colorText.trim() === "없음" && sizeText.trim() === "없음";

  const toggleNoneOptionAutofill = () => {
    if (noneOptionAutofillEnabled) {
      setColorText((current) => current.trim() === "없음" ? "" : current);
      setSizeText((current) => current.trim() === "없음" ? "" : current);
      return;
    }

    setColorText("없음");
    setSizeText("없음");
  };

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

  // 색상/사이즈 옵션이 있으면 옵션별(option) 재고, 없으면 단순 총(total) 재고로 자동 전환.
  useEffect(() => {
    setStockMode(colors.length > 0 || sizes.length > 0 ? "option" : "total");
  }, [colors.length, sizes.length]);

  const applyColorPreset = (preset: string) => {
    setColorText((current) => {
      const currentOptions = splitOptions(current);
      const isSelected = currentOptions.includes(preset);
      const nextOptions = isSelected
        ? currentOptions.filter((option) => option !== preset)
        : unique([...currentOptions, preset]);

      return nextOptions.join(", ");
    });
  };

  const applySizePreset = (preset: string) => {
    setSizeText((current) => {
      const presetOptions = normalizePresetOptions(preset);
      const currentOptions = splitOptions(current);
      const isSelected = presetOptions.every((option) => currentOptions.includes(option));
      const nextOptions = isSelected
        ? currentOptions.filter((option) => !presetOptions.includes(option))
        : unique([...currentOptions, ...presetOptions]);

      return nextOptions.join(", ");
    });
  };

  // 방송화면 캡처: getDisplayMedia 화면공유 → canvas 캡처 → coverImages 세팅
  const captureBroadcastScreen = async () => {
    try {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (c?: MediaStreamConstraints) => Promise<MediaStream>;
      };
      if (!md?.getDisplayMedia) {
        showAdminToast("이 브라우저는 화면 캡처를 지원하지 않습니다.", "warning");
        return;
      }
      const stream = await md.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 350));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t) => t.stop());
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setCoverImages([dataUrl]);
      showAdminToast("방송화면을 캡처했어요. (사진에 자동 설정)", "success");
    } catch {
      showAdminToast("화면 캡처를 취소했어요.", "info");
    }
  };

  const updateVariantStock = (targetKey: string, stock: number) => {
    const nextRows = buildVariantRows(colors, sizes, variantRows).map((row) =>
      row.key === targetKey ? { ...row, stock } : row,
    );

    setVariantRows(nextRows);
  };

  const resetForm = () => {
    setSaleMode("both");
    setCategory("");
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
    const wasPinned = pickBoolean(initialProduct, ["is_pinned", "pinned"], false);
    const previousPinnedAt = pickString(initialProduct, ["pinned_at"], "");
    const nextPinnedAt = isPinned
      ? wasPinned
        ? previousPinnedAt || new Date().toISOString()
        : new Date().toISOString()
      : null;

    const name = productName.trim();
    const price = moneyNumber(priceText);
    // sale_mode → product_type 자동파생 (broadcast → 방송상품 / shop·both → 상시판매)
    const productType: "broadcast" | "group_buy" = saleMode === "broadcast" ? "broadcast" : "group_buy";

    if (!name) {
      showAdminToast("상품명을 입력해주세요.", "error");
      return;
    }

    if (price < 0) {
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
        stock_management_enabled: stockManagementEnabled,
        registered_order_enabled: registeredOrderEnabled,
        name_suggestion_enabled: nameSuggestionEnabled,
        suggestion_keywords: suggestionKeywordsText
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        category: category.trim(),
      });

      const payload: Record<string, unknown> = {
        product_name: name,
        price,
        stock: totalStock,
        status: isVisible ? "판매중" : "숨김",
        product_type: productType,
        sale_mode: saleMode,
        shipping_type: shippingType,
        combine_shipping: shippingType === "vendor" ? "N" : "Y",
        sort_order: 0,
        is_pinned: isPinned,
        pinned_at: nextPinnedAt,
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

  const choiceButton = "h-9 rounded-xl px-3.5 text-[12px] font-black transition active:scale-[0.98]";
  const inactiveChoice = "bg-slate-100 text-slate-600 hover:bg-slate-200";

  // 카테고리 칩: 기본(신발/의류/잡화) + 직접 추가한 것 + (수정 모드 등) 현재값이 커스텀이면 포함
  const PRESET_CATEGORIES = ["신발", "의류", "잡화"];
  const categoryChips = Array.from(
    new Set([
      ...PRESET_CATEGORIES,
      ...customCategories,
      ...(category && !PRESET_CATEGORIES.includes(category) ? [category] : []),
    ]),
  );
  const confirmAddCategory = () => {
    const name = newCategoryText.trim();
    if (!name) return;
    if (!PRESET_CATEGORIES.includes(name)) {
      setCustomCategories((prev) => Array.from(new Set([...prev, name])));
    }
    setCategory(name);
    setNewCategoryText("");
    setAddingCategory(false);
  };
  const removeCustomCategory = (c: string) => {
    setCustomCategories((prev) => prev.filter((x) => x !== c));
    setCategory((cur) => (cur === c ? "" : cur));
  };

  return (
    <div
      className="ruru-product-sian"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0)", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: "560px", flexShrink: 0, maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#fff", borderRadius: "12px", padding: "17px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)", transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}>

        <div className="mh" onMouseDown={onHeaderMouseDown} style={{ cursor: "move", userSelect: "none" }}>
          <span className="mt">＋ {isEditMode ? "상품 수정" : "새 상품 등록"}</span>
          <button type="button" className="x" onClick={() => onClose?.()}>✕</button>
        </div>

        {/* 사진(120) + 필드(상품명/가격/배송) 나란히 — 시안 1:1 */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "13px" }}>
          <div style={{ width: "120px", flexShrink: 0 }}>
            <ImagePicker label="대표사진" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={setCoverImages} triggerRef={coverUploadRef} />
            <button type="button" className="btn" style={{ width: "100%", marginTop: "6px", fontSize: "10px" }} onClick={() => void captureBroadcastScreen()}>📷 방송화면 캡처</button>
            <button type="button" className="btn" style={{ width: "100%", marginTop: "4px", fontSize: "10px" }} onClick={() => coverUploadRef.current?.()}>⬆ 사진 직접 올림</button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
            <div>
              <label className="fl">상품명 <span style={{ color: "var(--rose)" }}>*</span></label>
              <input className="ipt" style={{ width: "100%" }} placeholder="예: 스웨이드 로퍼" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div>
              <label className="fl">가격 (비우면 손님 직접입력)</label>
              <input className="ipt" style={{ width: "100%" }} placeholder="59,000" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(formatNumberWithComma(e.target.value))} />
            </div>
            <div>
              <label className="fl">배송</label>
              <select className="ipt" style={{ width: "100%" }} value={shippingType} onChange={(e) => setShippingType(e.target.value)}>
                <option value="normal">일반배송</option>
                <option value="vendor">업체배송1</option>
                <option value="vendor2">업체배송2</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. 카테고리 → product_note.category (상품관리 칩 필터와 연동) */}
        <div style={{ marginBottom: "11px" }}>
          <label className="fl">카테고리</label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {categoryChips.map((c) => {
              const selected = category === c;
              const isCustom = !PRESET_CATEGORIES.includes(c);
              return (
                <span
                  key={c}
                  style={{ display: "inline-flex", alignItems: "center", height: "32px", borderRadius: "16px", overflow: "hidden", border: "1px solid " + (selected ? "#D9C5CC" : "#E8E2DD"), background: selected ? "#F5E6EB" : "#fff" }}
                >
                  <button
                    type="button"
                    onClick={() => setCategory((cur) => (cur === c ? "" : c))}
                    style={{ height: "100%", padding: isCustom ? "0 4px 0 14px" : "0 14px", border: "none", background: "transparent", fontSize: "12px", fontWeight: 800, cursor: "pointer", color: selected ? "#7B2D43" : "#888" }}
                  >
                    {c}
                  </button>
                  {isCustom ? (
                    <button
                      type="button"
                      aria-label={`${c} 삭제`}
                      onClick={() => removeCustomCategory(c)}
                      style={{ height: "100%", padding: "0 9px 0 2px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 800, cursor: "pointer", color: selected ? "#7B2D43" : "#bbb" }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              );
            })}
            {addingCategory ? (
              <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <input
                  className="ipt"
                  style={{ width: "120px" }}
                  placeholder="카테고리명"
                  autoFocus
                  value={newCategoryText}
                  onChange={(e) => setNewCategoryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmAddCategory();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={confirmAddCategory}
                  style={{ height: "32px", padding: "0 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "none", background: "#7B2D43", color: "#fff" }}
                >
                  확인
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingCategory(false); setNewCategoryText(""); }}
                  style={{ height: "32px", padding: "0 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px solid #E8E2DD", background: "#fff", color: "#888" }}
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                style={{ height: "32px", padding: "0 14px", borderRadius: "16px", fontSize: "12px", fontWeight: 800, cursor: "pointer", border: "1px dashed #D9C5CC", background: "#fff", color: "#999" }}
              >
                + 추가
              </button>
            )}
          </div>
        </div>

        {/* 판매채널 (유지) — product_type 자동파생(broadcast→broadcast, shop·both→group_buy) */}
        <div style={{ marginBottom: "11px" }}>
          <label className="fl">판매채널</label>
          <div style={{ display: "flex", gap: "6px" }}>
            {([["broadcast", "방송에서만"], ["shop", "쇼핑몰에서만"], ["both", "방송+쇼핑몰"]] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSaleMode(v)}
                style={{ flex: 1, height: "34px", borderRadius: "8px", fontSize: "11px", fontWeight: 800, cursor: "pointer", border: "1px solid " + (saleMode === v ? "#7B2D43" : "#E8E2DD"), background: saleMode === v ? "#7B2D43" : "#fff", color: saleMode === v ? "#fff" : "#666" }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 8. 옵션 박스 */}
        <div style={{ border: "1px solid var(--bd)", borderRadius: "8px", padding: "11px", marginBottom: "11px" }}>
          <div style={{ fontSize: "11px", color: "var(--mut)", marginBottom: "9px" }}>옵션 (각각 켜고 / 직접입력·선택)</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "7px" }}>
            <span style={{ fontSize: "11px", width: "36px" }}>색상</span>
            <span className={`badge ${colorEnabled ? "b-ok" : ""}`} onClick={() => setColorEnabled((v) => { const next = !v; if (!next) setColorText(""); return next; })} style={{ cursor: "pointer", ...(colorEnabled ? {} : { background: "#eee", color: "#888" }) }}>{colorEnabled ? "ON·선택" : "OFF"}</span>
            {colorEnabled ? (
              <>
                <input className="ipt" style={{ flex: 1, minWidth: "110px" }} placeholder="화이트, 블랙, 베이지" value={colorText} onChange={(e) => setColorText(e.target.value)} />
                {COLOR_PRESETS.map((preset) => (
                  <span key={preset} className="tag" style={{ cursor: "pointer", color: splitOptions(colorText).includes(preset) ? "var(--rose)" : "var(--mut)" }} onClick={() => applyColorPreset(preset)}>{preset}</span>
                ))}
              </>
            ) : (
              <span className="note" style={{ color: "#999" }}>고객 직접입력</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "7px" }}>
            <span style={{ fontSize: "11px", width: "36px" }}>사이즈</span>
            <span className={`badge ${sizeEnabled ? "b-ok" : ""}`} onClick={() => setSizeEnabled((v) => { const next = !v; if (!next) { setSizeText(""); setSizePresetOpen(false); } return next; })} style={{ cursor: "pointer", ...(sizeEnabled ? {} : { background: "#eee", color: "#888" }) }}>{sizeEnabled ? "ON·선택" : "OFF"}</span>
            {sizeEnabled ? (
              <>
                <input className="ipt" style={{ flex: 1, minWidth: "110px" }} placeholder="220, 230, 240" value={sizeText} onChange={(e) => setSizeText(e.target.value)} />
                <span style={{ position: "relative" }}>
                  <button type="button" onClick={() => setSizePresetOpen((v) => !v)} style={{ fontSize: "10px", fontWeight: 800, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", padding: "2px 4px" }}>프리셋 ▾</button>
                  {sizePresetOpen ? (
                    <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 5, marginTop: "4px", minWidth: "140px", background: "#fff", border: "1px solid var(--bd)", borderRadius: "8px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      {SIZE_PRESETS.map((preset) => {
                        const on = normalizePresetOptions(preset).some((o) => splitOptions(sizeText).includes(o));
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => applySizePreset(preset)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", fontSize: "12px", fontWeight: 700, border: "none", borderBottom: "1px solid #F0EDEA", background: on ? "#F5E6EB" : "#fff", color: on ? "var(--rose)" : "#555", cursor: "pointer" }}
                          >
                            {on ? "✓ " : ""}{preset}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </span>
              </>
            ) : (
              <span className="note" style={{ color: "#999" }}>고객 직접입력</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "7px" }}>
            <span style={{ fontSize: "11px", width: "36px" }}>수량</span>
            <span className="badge" style={{ background: "var(--blue-bg)", color: "var(--blue)" }}>ON·직접입력</span>
            <span className="note">손님이 숫자 입력</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ fontSize: "11px", width: "36px" }}>금액</span>
            <span className={`badge ${priceText.trim() ? "b-ok" : ""}`} style={priceText.trim() ? {} : { background: "#eee", color: "#888" }}>{priceText.trim() ? "위 가격" : "OFF"}</span>
            <span className="note">{priceText.trim() ? "위 가격 사용" : "비우면 손님 직접입력"}</span>
          </div>
        </div>

        {/* 재고관리 / 고객 노출 */}
        <div style={{ display: "flex", gap: "18px", fontSize: "11px", marginBottom: "4px", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }} onClick={() => setStockManagementEnabled((v) => !v)}>
            재고관리 <span className="note">(끄면 무제한)</span> <span className={`tog ${stockManagementEnabled ? "on" : "off"}`}><i /></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }} onClick={() => setIsVisible((v) => !v)}>
            고객 노출 <span className={`tog ${isVisible ? "on" : "off"}`}><i /></span>
          </span>
        </div>

        {/* 재고관리 ON: 옵션 있으면 조합별 재고 / 없으면 총 재고 1칸 */}
        {stockManagementEnabled ? (
          colors.length > 0 || sizes.length > 0 ? (
            <div style={{ border: "1px solid var(--bd)", borderRadius: "8px", padding: "10px", marginTop: "8px", marginBottom: "11px" }}>
              <div style={{ fontSize: "11px", color: "var(--mut)", marginBottom: "7px" }}>옵션별 재고 (색상 × 사이즈)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "180px", overflowY: "auto", paddingRight: "6px" }}>
                {resolvedVariantRows.map((row) => (
                  <div key={row.key} style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: "11px", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: "1px dotted var(--bd)", paddingBottom: "3px" }}>{[row.color, row.size].filter(Boolean).join(" / ") || "기본"}</span>
                    <input className="ipt" style={{ width: "70px", flexShrink: 0, textAlign: "right" }} type="number" min={0} value={row.stock} onChange={(e) => updateVariantStock(row.key, Math.max(0, Number(e.target.value) || 0))} />
                    <span className="note" style={{ flexShrink: 0, minWidth: "12px" }}>개</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "7px", fontSize: "11px", color: "var(--mut)", textAlign: "right" }}>총 재고 {totalStock.toLocaleString("ko-KR")}개</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", marginBottom: "11px" }}>
              <span style={{ fontSize: "11px", color: "var(--mut)" }}>총 재고 수량</span>
              <input className="ipt" style={{ width: "120px" }} type="number" min={0} value={totalStockText} onChange={(e) => setTotalStockText(e.target.value)} />
              <span className="note">개</span>
            </div>
          )
        ) : null}

        {/* 상세사진 (최대 5장) */}
        <div style={{ marginTop: "11px", marginBottom: "11px" }}>
          <ImagePicker label="상세사진 (최대 5장)" value={detailImages} maxFiles={5} uploadKind="detail" mode="detail" onChange={setDetailImages} />
        </div>

        {/* 상세설명 */}
        <div style={{ marginBottom: "11px" }}>
          <label className="fl">상세설명</label>
          <textarea
            className="ipt"
            style={{ width: "100%", minHeight: "84px", resize: "vertical", padding: "8px 10px", lineHeight: 1.5 }}
            placeholder="상품 상세 설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* 푸터 */}
        <div className="mfoot">
          <span className="note">⚡ 빠른등록: 사진·이름만 넣고 바로</span>
          <span className="r">
            <button type="button" className="btn" onClick={() => onClose?.()}>취소</button>
            <button type="button" className="btn rose" disabled={saving} onClick={() => void saveProduct()}>{saving ? "저장중..." : "등록"}</button>
          </span>
        </div>

      </div>
    </div>
  );
}
