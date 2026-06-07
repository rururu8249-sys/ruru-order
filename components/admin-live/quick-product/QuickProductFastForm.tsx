"use client";

import { ChangeEvent, type CSSProperties, DragEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
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

const COLOR_PRESETS = ["블랙", "화이트", "베이지", "그린", "네이비", "그레이"];
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

  const coverImage = value[0] || "";

  if (mode === "cover") {
    return (
      <div className="min-w-0">
        {label ? (
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-700">{label}</span>
            <span className="text-[10px] font-black text-slate-400">{value.length}/{maxFiles}</span>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 목업 .photo-box : 120×120 정사각형 */}
        <div style={{ position: "relative", width: "120px", height: "120px" }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{ width: "120px", height: "120px", border: coverImage ? "1px solid #E8E2DD" : "1.5px dashed #E8E2DD", borderRadius: "8px", background: "#F7F5F3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer", overflow: "hidden", color: "#888780", fontSize: "11px", textAlign: "center", padding: 0 }}
          >
            {coverImage ? (
              <img src={resolveProductImageUrl(coverImage)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <>
                <span style={{ fontSize: "28px" }}>📷</span>
                <span style={{ lineHeight: 1.3 }}>{uploading ? "업로드 중..." : <>클릭 또는<br />드래그</>}</span>
              </>
            )}
          </button>

          {coverImage ? (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ position: "absolute", right: "6px", top: "6px", borderRadius: "9999px", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "2px 7px", border: "none", cursor: "pointer" }}
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
      {label ? (
        <div style={{ fontSize: "12px", fontWeight: 500, color: "#888780", marginBottom: "6px" }}>{label}</div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 목업 .detail-photos : 5칸 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
        {Array.from({ length: maxFiles }, (_, index) => {
          const image = value[index] || "";
          const isAddSlot = index === value.length;
          return (
            <div key={`${image || "empty"}-${index}`} style={{ position: "relative", aspectRatio: "1" }}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                style={{ width: "100%", height: "100%", borderRadius: "8px", border: image ? "1px solid #E8E2DD" : "1px dashed #E8E2DD", background: "#F7F5F3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", fontSize: "10px", color: "#888780", cursor: "pointer", overflow: "hidden", padding: 0 }}
              >
                {image ? (
                  <img src={resolveProductImageUrl(image)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                ) : isAddSlot ? (
                  <>
                    <span style={{ fontSize: "20px" }}>＋</span>
                    <span>{uploading ? "업로드" : "추가"}</span>
                  </>
                ) : (
                  <span style={{ opacity: 0.5 }}>사진 없음</span>
                )}
              </button>

              {image ? (
                <div
                  onClick={() => removeImage(index)}
                  style={{ position: "absolute", top: "3px", right: "3px", width: "16px", height: "16px", background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "50%", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  ×
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: "11px", color: "#888780", textAlign: "right", marginTop: "4px" }}>{value.length} / {maxFiles}</div>
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

  const [stockMode, setStockMode] = useState<"total" | "option">("total");
  const [totalStockText, setTotalStockText] = useState("0");
  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);

  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [sizePresetOpen, setSizePresetOpen] = useState(false);
  const [colorPresetOpen, setColorPresetOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
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
      setNameError(true);
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

  // === ruru-product-form-mockup.html 스타일 1:1 ===
  const sectionLabel: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "#888780", marginBottom: "6px" };
  const fieldLabel: CSSProperties = { display: "block", fontSize: "12px", color: "#888780", fontWeight: 500, marginBottom: "3px" };
  const fieldInput: CSSProperties = { width: "100%", fontSize: "13px", padding: "9px 11px", border: "1px solid #E8E2DD", borderRadius: "7px", background: "#fff", color: "#1a1a1a", outline: "none" };
  const optRow: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" };
  const optLabel: CSSProperties = { fontSize: "13px", color: "#1a1a1a", minWidth: "36px" };
  const optInput: CSSProperties = { flex: 1, fontSize: "13px", padding: "6px 10px", border: "1px solid #E8E2DD", borderRadius: "6px", background: "#fff", outline: "none" };
  const togglePill = (kind: "on-select" | "on-input" | "off"): CSSProperties => ({
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    ...(kind === "on-select"
      ? { background: "#E8F5F0", color: "#0F6E56" }
      : kind === "on-input"
        ? { background: "#E8F0FA", color: "#185FA5" }
        : { background: "#F1EFEC", color: "#888780" }),
  });
  const presetTag = (sel: boolean): CSSProperties => ({ padding: "4px 9px", borderRadius: "6px", fontSize: "11px", background: sel ? "#7B2D43" : "#FBF1E0", color: sel ? "#fff" : "#854F0B", cursor: "pointer", border: "none" });
  const toggleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #E8E2DD" };
  const tgStyle = (on: boolean): CSSProperties => ({ width: "40px", height: "22px", borderRadius: "11px", background: on ? "#0F6E56" : "#E8E2DD", position: "relative", cursor: "pointer", flexShrink: 0 });
  const tgKnob = (on: boolean): CSSProperties => ({ position: "absolute", width: "18px", height: "18px", background: "#fff", borderRadius: "50%", top: "2px", ...(on ? { right: "2px" } : { left: "2px" }) });

  return (
    <div
      className="ruru-product-sian"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      {/* .modal */}
      <div style={{ width: "560px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden", transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}>

        {/* .modal-hd */}
        <div onMouseDown={onHeaderMouseDown} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #E8E2DD", background: "#F7F5F3", cursor: "grab", userSelect: "none" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", margin: 0 }}>{isEditMode ? "✎ 상품 수정" : "+ 새 상품 등록"}</h2>
          <span onClick={() => onClose?.()} style={{ fontSize: "20px", color: "#888780", cursor: "pointer", lineHeight: 1 }}>×</span>
        </div>

        {/* .modal-body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>

          {/* .top-row : 사진(120) + 필드 */}
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "14px", marginBottom: "14px" }}>
            <div style={{ width: "120px" }}>
              <ImagePicker label="" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={setCoverImages} triggerRef={coverUploadRef} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <label style={fieldLabel}>상품명 <span style={{ color: "#7B2D43", marginLeft: "2px" }}>*</span></label>
                <input
                  style={{ ...fieldInput, borderColor: nameError ? "#C0392B" : "#E8E2DD" }}
                  type="text"
                  placeholder="예: 스웨이드 로퍼"
                  value={productName}
                  onChange={(e) => { setProductName(e.target.value); if (nameError) setNameError(false); }}
                />
                {nameError ? <div style={{ marginTop: "4px", fontSize: "11px", color: "#C0392B" }}>상품명은 필수입니다</div> : null}
              </div>
              <div>
                <label style={fieldLabel}>가격 <span style={{ fontSize: "11px", fontWeight: 400, color: "#888780" }}>(비우면 손님 직접입력)</span></label>
                <input style={fieldInput} type="text" inputMode="numeric" placeholder="59,000" value={priceText} onChange={(e) => setPriceText(formatNumberWithComma(e.target.value))} />
              </div>
              <div>
                <label style={fieldLabel}>배송</label>
                <select style={fieldInput} value={shippingType} onChange={(e) => setShippingType(e.target.value)}>
                  <option value="normal">일반배송 (기본)</option>
                  <option value="vendor">업체배송 1</option>
                  <option value="vendor2">업체배송 2</option>
                </select>
              </div>
            </div>
          </div>

          {/* 카테고리 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={sectionLabel}>카테고리</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {categoryChips.map((c) => {
                const on = category === c;
                const isCustom = !PRESET_CATEGORIES.includes(c);
                return (
                  <div
                    key={c}
                    onClick={() => setCategory((cur) => (cur === c ? "" : c))}
                    style={{ padding: "6px 13px", borderRadius: "20px", border: "1px solid " + (on ? "#D9C5CC" : "#E8E2DD"), fontSize: "12px", cursor: "pointer", color: on ? "#7B2D43" : "#888780", background: on ? "#F5E6EB" : "#fff", fontWeight: on ? 500 : 400, display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    {c}
                    {isCustom ? (
                      <span onClick={(e) => { e.stopPropagation(); removeCustomCategory(c); }} style={{ fontSize: "14px", color: "#7B2D43", lineHeight: 1, marginLeft: "2px" }}>×</span>
                    ) : null}
                  </div>
                );
              })}
              {!addingCategory ? (
                <div onClick={() => setAddingCategory(true)} style={{ padding: "6px 13px", borderRadius: "20px", border: "1px dashed #E8E2DD", fontSize: "12px", cursor: "pointer", color: "#888780", background: "#fff" }}>+ 추가</div>
              ) : null}
            </div>
            {addingCategory ? (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                <input
                  autoFocus
                  placeholder="카테고리명"
                  value={newCategoryText}
                  onChange={(e) => setNewCategoryText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAddCategory(); } }}
                  style={{ flex: 1, fontSize: "13px", padding: "7px 10px", border: "1px solid #7B2D43", borderRadius: "7px", outline: "none" }}
                />
                <button type="button" onClick={confirmAddCategory} style={{ padding: "7px 12px", borderRadius: "7px", background: "#7B2D43", color: "#fff", border: "none", fontSize: "12px", cursor: "pointer" }}>확인</button>
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryText(""); }} style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #E8E2DD", background: "#fff", fontSize: "12px", cursor: "pointer", color: "#888780" }}>취소</button>
              </div>
            ) : null}
          </div>

          {/* 판매채널 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={sectionLabel}>판매채널</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {([["broadcast", "📺 방송에서만"], ["shop", "🛍 쇼핑몰에서만"], ["both", "✅ 방송+쇼핑몰"]] as const).map(([v, l]) => {
                const on = saleMode === v;
                return (
                  <div
                    key={v}
                    onClick={() => setSaleMode(v)}
                    style={{ flex: 1, padding: "10px 6px", borderRadius: "8px", border: (on ? "2px" : "1px") + " solid " + (on ? "#7B2D43" : "#E8E2DD"), textAlign: "center", fontSize: "13px", cursor: "pointer", color: on ? "#7B2D43" : "#888780", background: on ? "#F5E6EB" : "#fff", fontWeight: on ? 500 : 400 }}
                  >
                    {l}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 옵션 박스 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ border: "1px solid #E8E2DD", borderRadius: "8px", padding: "12px", background: "#F7F5F3" }}>
              <div style={{ fontSize: "12px", color: "#888780", marginBottom: "10px" }}>옵션 (각각 켜고 / 직접입력·선택)</div>

              {/* 색상 — togglePill 제거, 프리셋 드롭다운(사이즈와 동일 구조) */}
              <div style={optRow}>
                <span style={optLabel}>색상</span>
                <input style={optInput} type="text" placeholder="화이트, 블랙, 베이지" value={colorText} onChange={(e) => setColorText(e.target.value)} />
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button type="button" onClick={() => setColorPresetOpen((v) => !v)} style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", background: "#FBF1E0", color: "#854F0B", cursor: "pointer", border: "none", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>프리셋 ▾</button>
                  {colorPresetOpen ? (
                    <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid #E8E2DD", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10, minWidth: "160px", marginTop: "4px", overflow: "hidden" }}>
                      {COLOR_PRESETS.map((preset) => {
                        const on = splitOptions(colorText).includes(preset);
                        return (
                          <div key={preset} onClick={() => applyColorPreset(preset)} style={{ padding: "8px 14px", fontSize: "12px", cursor: "pointer", color: on ? "#7B2D43" : "#1a1a1a", background: on ? "#F5E6EB" : "#fff" }}>{on ? "✓ " : ""}{preset}</div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {!colorText.trim() ? <span style={{ fontSize: "12px", color: "#888780" }}>고객 직접입력</span> : null}
              </div>

              {/* 사이즈 — togglePill 제거, 프리셋 드롭다운 */}
              <div style={optRow}>
                <span style={optLabel}>사이즈</span>
                <input style={optInput} type="text" placeholder="220, 230, 240" value={sizeText} onChange={(e) => setSizeText(e.target.value)} />
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button type="button" onClick={() => setSizePresetOpen((v) => !v)} style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", background: "#FBF1E0", color: "#854F0B", cursor: "pointer", border: "none", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>프리셋 ▾</button>
                  {sizePresetOpen ? (
                    <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid #E8E2DD", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10, minWidth: "160px", marginTop: "4px", overflow: "hidden" }}>
                      {SIZE_PRESETS.map((preset) => {
                        const on = normalizePresetOptions(preset).some((o) => splitOptions(sizeText).includes(o));
                        return (
                          <div key={preset} onClick={() => applySizePreset(preset)} style={{ padding: "8px 14px", fontSize: "12px", cursor: "pointer", color: on ? "#7B2D43" : "#1a1a1a", background: on ? "#F5E6EB" : "#fff" }}>{on ? "✓ " : ""}{preset}</div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {!sizeText.trim() ? <span style={{ fontSize: "12px", color: "#888780" }}>고객 직접입력</span> : null}
              </div>

              {/* 수량 — togglePill 제거, 안내텍스트만 */}
              <div style={optRow}>
                <span style={optLabel}>수량</span>
                <span style={{ fontSize: "12px", color: "#888780" }}>손님이 숫자 입력</span>
              </div>

              {/* 금액 — togglePill 제거, 안내텍스트만 */}
              <div style={{ ...optRow, marginBottom: 0 }}>
                <span style={optLabel}>금액</span>
                <span style={{ fontSize: "12px", color: "#888780" }}>{priceText.trim() ? "위 가격 사용" : "비우면 손님 직접입력"}</span>
              </div>
            </div>
          </div>

          {/* 재고관리 / 고객노출 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={toggleRow}>
              <div>
                <div style={{ fontSize: "13px", color: "#1a1a1a" }}>재고관리</div>
                <div style={{ fontSize: "11px", color: "#888780", marginTop: "1px" }}>{stockManagementEnabled ? "재고 수량 관리 중" : "(끄면 무제한)"}</div>
              </div>
              <div onClick={() => setStockManagementEnabled((v) => !v)} style={tgStyle(stockManagementEnabled)}><span style={tgKnob(stockManagementEnabled)} /></div>
            </div>

            {stockManagementEnabled ? (
              colors.length > 0 || sizes.length > 0 ? (
                <div style={{ background: "#F7F5F3", borderRadius: "8px", padding: "10px", marginTop: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#888780", marginBottom: "8px" }}>옵션별 재고 수량</div>
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    {resolvedVariantRows.map((row) => (
                      <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr 80px 24px", gap: "8px", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #E8E2DD" }}>
                        <div style={{ fontSize: "12px", color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[row.color, row.size].filter(Boolean).join(" / ") || "기본"}</div>
                        <input style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #E8E2DD", borderRadius: "6px", textAlign: "right", width: "100%" }} type="number" min={0} value={row.stock} onChange={(e) => updateVariantStock(row.key, Math.max(0, Number(e.target.value) || 0))} />
                        <span style={{ fontSize: "11px", color: "#888780" }}>개</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "7px", fontSize: "11px", color: "#888780", textAlign: "right" }}>총 재고 {totalStock.toLocaleString("ko-KR")}개</div>
                </div>
              ) : (
                <div style={{ background: "#F7F5F3", borderRadius: "8px", padding: "10px", marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#1a1a1a", flex: 1 }}>총 재고 수량</span>
                  <input style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #E8E2DD", borderRadius: "6px", textAlign: "right", width: "80px" }} type="number" min={0} value={totalStockText} onChange={(e) => setTotalStockText(e.target.value)} />
                  <span style={{ fontSize: "11px", color: "#888780" }}>개</span>
                </div>
              )
            ) : null}

            <div style={toggleRow}>
              <div>
                <div style={{ fontSize: "13px", color: "#1a1a1a" }}>고객 노출</div>
                <div style={{ fontSize: "11px", color: "#888780", marginTop: "1px" }}>손님 주문 페이지에 표시</div>
              </div>
              <div onClick={() => setIsVisible((v) => !v)} style={tgStyle(isVisible)}><span style={tgKnob(isVisible)} /></div>
            </div>
          </div>

          {/* 구분선 */}
          <div style={{ height: "1px", background: "#E8E2DD", margin: "12px 0" }} />

          {/* 상세사진 (최대 5장) */}
          <div style={{ marginBottom: "14px" }}>
            <ImagePicker label="상세사진 (최대 5장)" value={detailImages} maxFiles={5} uploadKind="detail" mode="detail" onChange={setDetailImages} />
          </div>

          {/* 상세설명 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={sectionLabel}>상세설명</div>
            <textarea
              style={{ width: "100%", fontSize: "13px", padding: "10px 12px", border: "1px solid #E8E2DD", borderRadius: "8px", minHeight: "90px", resize: "vertical", background: "#fff", fontFamily: "inherit", outline: "none" }}
              placeholder="상품 상세 설명 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid #E8E2DD", background: "#F7F5F3", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "#888780" }}><span style={{ color: "#854F0B" }}>⚡ 빠른등록:</span> 사진·이름만 넣고 바로</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => onClose?.()} disabled={saving} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #E8E2DD", background: "#fff", fontSize: "13px", cursor: saving ? "default" : "pointer", color: "#1a1a1a", opacity: saving ? 0.5 : 1 }}>취소</button>
            <button type="button" onClick={() => void saveProduct()} disabled={saving} style={{ padding: "10px 22px", borderRadius: "8px", background: saving ? "#ccc" : isEditMode ? "#0F6E56" : "#7B2D43", color: "#fff", border: "none", fontSize: "13px", fontWeight: 500, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "저장 중..." : isEditMode ? "저장" : "등록"}</button>
          </div>
        </div>

      </div>
    </div>
  );
}
