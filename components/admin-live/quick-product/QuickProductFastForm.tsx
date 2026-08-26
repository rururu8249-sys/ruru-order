"use client";

import { ChangeEvent, type CSSProperties, DragEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { showAdminToast } from "@/lib/adminToast";
import { resolveProductImageUrl } from "./productImageUrl";
import { compressProductImage, isHeicLikeImage } from "./compressProductImage";
import { brandWordmarkThumbnail, normalizeBrandKorean } from "@/lib/brandWordmarkThumbnail";

type ProductRow = Record<string, unknown>;

type QuickProductFastFormProps = {
  activeBroadcastId: string | number | null;
  initialProduct?: ProductRow | null;
  onClose?: () => void;
};

type VariantStockRow = {
  key: string;
  color: string;   // 저장 키 (3단이면 "세부상품 / 색상"으로 합쳐진 값)
  size: string;
  stock: number;
  detail: string;  // 표시용 — 1번 축(세부상품) 값
  colorOnly: string; // 표시용 — 2번 축(색상) 값
};

type BrandDetailOptionConfig = {
  colors: string[];
  sizes: string[];
  variants: Array<{ color: string; size: string }>;
};

type BrandDetailEditDraft = {
  originalName: string;
  name: string;
  category: string;
  plus: string;
  variants: Array<{ color: string; size: string }>;
};

// [2026-08-11 사장님 지침] 라벨 드롭다운(맛/용량/브랜드) 제거 — 실제로 쓸 일이 없고 방송 중 고를 게 하나 더 늘 뿐.
//   관리자 화면은 "세부상품" 고정 표기, 손님 화면 제목은 "종류 선택"으로 통일(기존 조합형 상품과 동일 문구).
const DETAIL_LABEL_FIXED = "종류";
// 옵션 값 구분자 — 3단일 때 "세부상품 / 색상"을 stock_variants.color 한 칸에 합쳐 넣는다.
//   (재고 키가 (color,size) 2칸뿐이라 DB·재고차감 RPC를 안 건드리고 3단을 지원하기 위한 방식)
const AXIS_JOIN = " / ";

type ImagePickerProps = {
  label: string;
  value: string[];
  maxFiles: number;
  uploadKind: "cover" | "detail";
  mode: "cover" | "detail";
  onChange: (nextValue: string[]) => void;
  triggerRef?: { current: (() => void) | null };
};

const COLOR_PRESETS = ["없음", "블랙", "화이트", "베이지", "그린", "네이비", "그레이"];
const SIZE_PRESETS = ["없음", "FREE", "XS-XXL", "90-115", "신발 220-290"];

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

function normalizeBrandRecordKeys<T>(source: Record<string, T> | null | undefined) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {} as Record<string, T>;
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeBrandKorean(key), value]));
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

type ParsedProductNote = Record<string, unknown> & {
      // 고객 주문서 상단 카테고리 버튼에 이 상품의 카테고리를 노출할지 여부.
      // false여도 상품 자체는 '전체' 목록에서 정상 노출된다.
      customer_category_visible?: boolean;
      stock_mode?: "total" | "option";
      stock_variants?: Array<{ color?: string; size?: string; stock?: number }>;
      stock_management_enabled?: boolean;
      registered_order_enabled?: boolean;
      name_suggestion_enabled?: boolean;
      suggestion_keywords?: string[];
      purchase_limit_enabled?: boolean;
      purchase_limit_qty?: number;
      // [조합형 옵션 · 2026-07-22] 세부상품(종류) 모드 — 세부상품명은 stock_variants의 color 자리에 저장(재고 RPC 무변경 재사용)
      combo_mode?: boolean;
      option_label?: string;
      option_pricing?: Record<string, number>; // { 세부상품명: 추가금(원, 0 이상) }
      combo_hidden?: string[]; // 등록만 하고 고객 노출 막은 세부상품명(가격 미정 등)
      // [2026-08-10 옵션 통합] 축 정의 — 고객 화면이 몇 단으로 보여줄지 판단하는 원천
      option_axes?: Array<{ key: "detail" | "color" | "size"; label: string; values: string[] }>;
      combo_detail_values?: string[]; // 1번 축(세부상품) 노출 값 — 3단일 때 color_options는 색상이 차지하므로 별도 보관
      // [2026-08-11] 세부상품별 대표사진 { 세부상품명: 이미지URL } — 스마트스토어/쿠팡의 옵션별 이미지와 같은 개념
      detail_photos?: Record<string, string>;
      // 엑셀 브랜드 대표상품은 세부상품 하나에 사진이 여러 장일 수 있다.
      detail_photo_sets?: Record<string, string[]>;
      brand_group?: {
        enabled?: boolean;
        brand_ko?: string;
        brand_en?: string;
        detail_categories?: Record<string, string>;
        detail_options?: Record<string, BrandDetailOptionConfig>;
      };
      // [무료나눔 · 2026-07-22] true면 0원 상품(선물). 가격 비움(손님 직접입력)과 구분되는 명시 플래그
      free_product?: boolean;
};

function parseProductNote(row: ProductRow | null | undefined): ParsedProductNote | null {
  if (!row) return null;
  const raw = row.product_note ?? row.note ?? row.memo;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ParsedProductNote;
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    return JSON.parse(raw) as ParsedProductNote;
  } catch {
    return null;
  }
}

// [2026-08-10 옵션 통합] 1~3축 조합 생성.
//   저장 키는 기존과 동일하게 (color, size) 2칸 — 세부상품이 있으면 color 칸에 "세부상품 / 색상"으로 합친다.
//   · 세부상품만        → color="A-1",        size=""      (= 기존 조합형과 100% 동일)
//   · 색상만            → color="블랙",       size=""      (= 기존과 100% 동일)
//   · 색상+사이즈       → color="블랙",       size="M"     (= 기존과 100% 동일)
//   · 세부+색상+사이즈  → color="A-1 / 블랙", size="M"     (신규)
// [2026-08-11 재고 보존] 옵션 글자를 살짝 고쳐도(예: 225(US55) → 225(US5.5)) 재고가 0으로 리셋되지 않게
//   마침표·공백·대소문자를 무시한 "느슨한 키"로 한 번 더 찾는다. 정확히 일치하는 키가 항상 우선이라 오배정 위험 없음.
function looseVariantKey(key: string) {
  return String(key || "").replace(/[.\s]/g, "").toLowerCase();
}

function buildVariantRows(details: string[], colors: string[], sizes: string[], previous: VariantStockRow[]) {
  const safeDetails = details.length ? details : [""];
  const safeColors = colors.length ? colors : [""];
  const safeSizes = sizes.length ? sizes : [""];
  const previousMap = new Map(previous.map((row) => [row.key, row.stock]));
  // 느슨한 키 → 재고. 같은 느슨한 키가 여러 개면 첫 번째만(모호하면 안 쓰도록 중복은 무시)
  const looseMap = new Map<string, number | null>();
  // [2026-08-12 재고 보존 ③] 느슨일치로 가져온 게 "이전 어느 행"이었는지도 기억한다(중복이면 null).
  const looseOwner = new Map<string, string | null>();
  for (const row of previous) {
    const lk = looseVariantKey(row.key);
    if (looseMap.has(lk)) { looseMap.set(lk, null); looseOwner.set(lk, null); } // 중복 → 모호하므로 폴백 포기
    else { looseMap.set(lk, row.stock); looseOwner.set(lk, row.key); }
  }
  // [2026-08-12 재고 보존 ③] 이미 소비한 이전 행 / 아직 못 찾은 새 행 추적
  const usedPrevKeys = new Set<string>();
  const matchedFlags: boolean[] = [];
  const rows: VariantStockRow[] = [];

  for (const detail of safeDetails) {
    for (const colorOnly of safeColors) {
      for (const size of safeSizes) {
        const color = [detail, colorOnly].filter(Boolean).join(AXIS_JOIN);
        const key = `${color || "__EMPTY_COLOR__"}__${size || "__EMPTY_SIZE__"}`;
        const exact = previousMap.get(key);
        const loose = exact === undefined ? looseMap.get(looseVariantKey(key)) : undefined;
        // [2026-08-12 재고 보존 ②] 색상/사이즈를 "🚫 사용 안 함"(값 "없음")으로 바꾸면 축이 하나 늘어나
        //   열쇠가 "A / 없음__없음" 이 되어, 저장돼 있던 "A____EMPTY_SIZE__" 과 안 맞아 재고가 전부 0으로
        //   리셋되던 문제(향수·화장품 같은 조합형 상품에서 발생). 어제 넣은 느슨한 키는 마침표·공백·대소문자만
        //   무시해서 축 개수가 달라지는 이 경우를 못 잡았다.
        //   → "없음"을 빈 값으로 본 열쇠로 한 번 더 찾는다. 정확일치·느슨일치가 항상 우선이라 기존 동작 무변경.
        const noneAsEmpty = (v: string) => { const t = String(v ?? "").trim(); return t === "없음" ? "" : t; };
        const altColor = [noneAsEmpty(detail), noneAsEmpty(colorOnly)].filter(Boolean).join(AXIS_JOIN);
        const altKey = `${altColor || "__EMPTY_COLOR__"}__${noneAsEmpty(size) || "__EMPTY_SIZE__"}`;
        const alt = exact === undefined && (loose === undefined || loose === null) && altKey !== key
          ? previousMap.get(altKey)
          : undefined;
        const resolved = exact ?? loose ?? alt;
        // [2026-08-12 재고 보존 ③] 어떤 이전 행을 써버렸는지 기록 — 자리 승계에서 중복 사용 방지
        if (exact !== undefined) usedPrevKeys.add(key);
        else if (loose !== undefined && loose !== null) {
          const owner = looseOwner.get(looseVariantKey(key));
          if (owner) usedPrevKeys.add(owner);
        } else if (alt !== undefined) usedPrevKeys.add(altKey);
        rows.push({ key, color, size, stock: resolved ?? 0, detail, colorOnly });
        matchedFlags.push(resolved !== undefined && resolved !== null);
      }
    }
  }

  // ── [2026-08-12 재고 보존 ③] 4순위: 자리 승계 ────────────────────────
  //   옵션 "글자"만 고친 경우(차지블베이지 → 차지블베이 → …)를 살린다.
  //   못 찾은 새 행 수 == 아직 안 쓰인 이전 행 수 일 때만, 순서대로 1:1 로 재고를 옮긴다.
  //   (이 조건은 곧 "조합 개수가 그대로"라는 뜻 — 옵션을 추가/삭제하면 승계하지 않는다.)
  const unmatchedIdx: number[] = [];
  for (let i = 0; i < rows.length; i += 1) if (!matchedFlags[i]) unmatchedIdx.push(i);
  if (unmatchedIdx.length > 0) {
    const leftovers = previous.filter((row) => !usedPrevKeys.has(row.key));
    if (leftovers.length === unmatchedIdx.length) {
      unmatchedIdx.forEach((rowIdx, k) => {
        const carried = Number(leftovers[k]?.stock ?? 0);
        if (Number.isFinite(carried) && carried > 0) rows[rowIdx] = { ...rows[rowIdx], stock: carried };
      });
    }
  }

  return rows;
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
    const { data, error } = await adminCatalogWrite({
      table: "products",
      op: "insert",
      values: workingPayload,
      select: "id",
      single: true,
    });

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
    const { data, error } = await adminCatalogWrite({
      table: "products",
      op: "update",
      values: workingPayload,
      filters: [{ type: "eq", col: "id", val: productId }],
      select: "id",
      single: true,
    });

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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 640);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  const uploadFiles = async (files: FileList | File[]) => {
    const safeFiles = Array.from(files).filter((file) => file.type.startsWith("image/") || isHeicLikeImage(file));

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
            <span className="text-[11px] font-black text-ink">{label}</span>
            <span className="text-[10px] font-black text-ink-mute">{value.length}/{maxFiles}</span>
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
            style={{ width: "120px", height: "120px", border: coverImage ? "1px solid #E8E2DD" : "1.5px dashed #E8E2DD", borderRadius: "8px", background: "#F7F5F3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer", overflow: "hidden", color: "var(--color-ink-mute)", fontSize: "11px", textAlign: "center", padding: 0 }}
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
        <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#7B2D43", background: "#F9EEF3", border: "1px solid #E7C9D4", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>
          📷 촬영하기
          <input type="file" accept="image/*" capture="environment" hidden onChange={handleFileChange} />
        </label>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {label ? (
        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-ink-mute)", marginBottom: "6px" }}>{label}</div>
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
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 3 : 5}, 1fr)`, gap: "6px" }}>
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
                style={{ width: "100%", height: "100%", borderRadius: "8px", border: image ? "1px solid #E8E2DD" : "1px dashed #E8E2DD", background: "#F7F5F3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", fontSize: "10px", color: "var(--color-ink-mute)", cursor: "pointer", overflow: "hidden", padding: 0 }}
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
      <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#7B2D43", background: "#F9EEF3", border: "1px solid #E7C9D4", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>
        📷 촬영하기
        <input type="file" accept="image/*" capture="environment" hidden onChange={handleFileChange} />
      </label>
      <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", textAlign: "right", marginTop: "4px" }}>{value.length} / {maxFiles}</div>
    </div>
  );
}

export default function QuickProductFastForm({
  activeBroadcastId,
  initialProduct = null,
  onClose,
}: QuickProductFastFormProps) {
  const [category, setCategory] = useState("");
  const [customerCategoryVisible, setCustomerCategoryVisible] = useState(true);
  const [badgeTypes, setBadgeTypes] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 640);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");
  const [productName, setProductName] = useState("");
  const [priceText, setPriceText] = useState("");
  // [2026-08-10 0단계] 기본 ON — 방송 상품은 거의 전부 재고관리가 필요한데 기본이 꺼져 있어
  //   재고를 입력하고도 무제한으로 저장되는 사고가 있었다(8/10 오버셀과 같은 경로).
  const [stockManagementEnabled, setStockManagementEnabled] = useState(true);
  const [shippingType, setShippingType] = useState("normal");
  const [isVisible, setIsVisible] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [registeredOrderEnabled, setRegisteredOrderEnabled] = useState(true);
  const [nameSuggestionEnabled, setNameSuggestionEnabled] = useState(true);
  // 개인당 구매제한(카톡 계정=전화번호 기준 누적, OFF할 때까지 방송 무관 계속 적용). 재고와 별개.
  const [purchaseLimitEnabled, setPurchaseLimitEnabled] = useState(false);
  const [purchaseLimitText, setPurchaseLimitText] = useState("1");
  const [suggestionKeywordsText, setSuggestionKeywordsText] = useState("");

  const [coverImages, setCoverImages] = useState<string[]>([]);
  const [detailImages, setDetailImages] = useState<string[]>([]);

  const [colorText, setColorText] = useState("");
  const [sizeText, setSizeText] = useState("");

  const [stockMode, setStockMode] = useState<"total" | "option">("total");
  const [totalStockText, setTotalStockText] = useState("0");
  const [variantRows, setVariantRows] = useState<VariantStockRow[]>([]);

  // [2026-08-10 옵션 통합] 탭 제거 — 옵션 슬롯 3개(세부상품/색상/사이즈) 중 값을 넣은 것만 축으로 사용.
  //   세부상품만 = 기존 "조합형"과 저장 결과 동일 / 색상+사이즈 = 기존과 동일 / 셋 다 = 신규 3단
  const [detailText, setDetailText] = useState("");
  const [detailLabel, setDetailLabel] = useState(DETAIL_LABEL_FIXED);
  const [detailPlus, setDetailPlus] = useState<Record<string, string>>({}); // 세부상품명 → 추가금(문자)
  const [detailHidden, setDetailHidden] = useState<string[]>([]);           // 고객에게 숨길 세부상품명
  // [2026-08-11] 세부상품별 대표사진 — 손님이 종류를 고를 때 사진으로 구분할 수 있게(업계 표준: 옵션별 이미지)
  const [detailPhotos, setDetailPhotos] = useState<Record<string, string>>({});
  const [detailPreviewImage, setDetailPreviewImage] = useState("");
  const [brandGroupDetailPhotoSets, setBrandGroupDetailPhotoSets] = useState<Record<string, string[]>>({});
  const [brandGroupDetailCategories, setBrandGroupDetailCategories] = useState<Record<string, string>>({});
  const [brandGroupDetailOptions, setBrandGroupDetailOptions] = useState<Record<string, BrandDetailOptionConfig>>({});
  const [brandDetailEditDraft, setBrandDetailEditDraft] = useState<BrandDetailEditDraft | null>(null);
  const [brandDetailSearch, setBrandDetailSearch] = useState("");
  const [brandDetailCategoryFilter, setBrandDetailCategoryFilter] = useState("전체");
  const [detailPhotoUploading, setDetailPhotoUploading] = useState("");
  const detailPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const detailPhotoTargetRef = useRef("");

  // [무료나눔 · 2026-07-22] 0원 상품 플래그 — note.free_product (가격 비움=직접입력과 구분)
  const [freeProductEnabled, setFreeProductEnabled] = useState(false);

  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [sizePresetOpen, setSizePresetOpen] = useState(false);
  const [colorPresetOpen, setColorPresetOpen] = useState(false);
  const colorPresetRef = useRef<HTMLDivElement>(null);
  const sizePresetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (colorPresetRef.current && !colorPresetRef.current.contains(e.target as Node)) setColorPresetOpen(false);
      if (sizePresetRef.current && !sizePresetRef.current.contains(e.target as Node)) setSizePresetOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [nameError, setNameError] = useState(false);
  // [2026-08-11] 방송 중 속도 — 거의 안 건드리는 카테고리·뱃지가 옵션/재고를 화면 밖으로 밀어내던 문제.
  //   기본 접힘 → 사진·이름·가격 다음에 바로 옵션·재고가 오게 한다. (값은 전부 기본값이 있어 안 펴도 등록 가능)
  const [extraOpen, setExtraOpen] = useState(false);
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
  const initialProductNote = useMemo(() => parseProductNote(initialProduct), [initialProduct]);
  const isBrandGroupEdit = initialProductNote?.brand_group?.enabled === true;
  const brandWordmarkImage = isBrandGroupEdit
    ? brandWordmarkThumbnail(
        String(initialProductNote?.brand_group?.brand_en || ""),
        String(initialProductNote?.brand_group?.brand_ko || productName || "브랜드"),
      )
    : "";
  // [2026-08-16 사장님 요청] 재고를 3가지로 나눠 보여준다 — 실재고 / 담김(주문서 제출 전 선점) / 지금 판매가능
  //   담김은 cart_reservations(표시용 선점)에서 읽는다. 읽기 전용 — 재고·주문·돈 로직 무접촉.
  const [heldByVariant, setHeldByVariant] = useState<Record<string, number>>({});
  const [heldTotal, setHeldTotal] = useState(0);
  useEffect(() => {
    if (!editingProductId) return;
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/cart-reservations?ids=${encodeURIComponent(editingProductId)}&exclude=none`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (stop || !json?.ok) return;
        const by: Record<string, number> = {};
        for (const [k, v] of Object.entries(json.byVariant || {})) {
          const parts = String(k).split("|");
          by[`${parts[1] || ""}|${parts[2] || ""}`] = Number(v) || 0;
        }
        setHeldByVariant(by);
        setHeldTotal(Number((json.byProduct || {})[editingProductId] || 0));
      } catch { /* 표시 전용 — 실패해도 재고 편집에 영향 없음 */ }
    };
    void load();
    const t = setInterval(load, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [editingProductId]);
  const heldOf = (color: string, size: string) => {
    const nm = (v: string) => { const t = String(v ?? "").trim(); return t === "없음" ? "" : t; };
    return Number(heldByVariant[`${nm(color)}|${nm(size)}`] || 0);
  };

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
    const noteVariants = (productNote?.stock_variants || []).map((row) => ({
      ...row,
      color: normalizeBrandKorean(String(row.color || "")),
      size: normalizeBrandKorean(String(row.size || "")),
    }));
    const normalizedPhotoSets = normalizeBrandRecordKeys<string[]>(
      productNote?.detail_photo_sets && typeof productNote.detail_photo_sets === "object" ? productNote.detail_photo_sets : {},
    );
    const normalizedDetailCategories = normalizeBrandRecordKeys<string>(
      productNote?.brand_group?.detail_categories && typeof productNote.brand_group.detail_categories === "object" ? productNote.brand_group.detail_categories : {},
    );
    const normalizedDetailOptions = normalizeBrandRecordKeys<BrandDetailOptionConfig>(
      productNote?.brand_group?.detail_options && typeof productNote.brand_group.detail_options === "object" ? productNote.brand_group.detail_options : {},
    );
    setStockManagementEnabled(productNote?.stock_management_enabled !== false);
    setPurchaseLimitEnabled(productNote?.purchase_limit_enabled === true);
    setPurchaseLimitText(String(productNote?.purchase_limit_qty && productNote.purchase_limit_qty > 0 ? productNote.purchase_limit_qty : 1));
    setRegisteredOrderEnabled(productNote?.registered_order_enabled !== false);
    setNameSuggestionEnabled(productNote?.name_suggestion_enabled !== false);
    setSuggestionKeywordsText(Array.isArray(productNote?.suggestion_keywords) ? productNote.suggestion_keywords.join(", ") : "");
    setBrandGroupDetailPhotoSets(normalizedPhotoSets);
    setBrandGroupDetailCategories(normalizedDetailCategories);
    setBrandGroupDetailOptions(normalizedDetailOptions);
    setBrandDetailEditDraft(null);
    setBrandDetailSearch("");
    setBrandDetailCategoryFilter("전체");

    setCategory(normalizeBrandKorean(String((productNote as { category?: unknown } | null)?.category || "")));
    setCustomerCategoryVisible(productNote?.customer_category_visible !== false);
    const _bt = Array.isArray((initialProduct as any)?.badge_types)
      ? (initialProduct as any).badge_types.filter(Boolean).map((x: any) => String(x))
      : ((initialProduct as any)?.badge_type && (initialProduct as any).badge_type !== "none" ? [String((initialProduct as any).badge_type)] : []);
    setBadgeTypes(_bt);
    setProductName(normalizeBrandKorean(pickString(initialProduct, ["product_name", "name", "title"], "")));
    setPriceText(formatNumberWithComma(pickNumber(initialProduct, ["price", "sale_price", "selling_price"], 0)));
    setShippingType(pickString(initialProduct, ["shipping_type", "delivery_type"], "normal"));
    // is_visible 컬럼이 schema-safe로 빠진 경우에도 status("숨김"/"판매중")로 정확히 복원
    setIsVisible(pickBoolean(initialProduct, ["is_visible", "visible", "status"], true));
    setIsPinned(pickBoolean(initialProduct, ["is_pinned", "pinned"], false));
    setCoverImages(pickImageArray(initialProduct, ["image_url", "cover_image_url", "main_image_url"]).slice(0, 1));
    setDetailImages(pickImageArray(initialProduct, ["detail_image_urls", "detail_images", "images"]).slice(0, 5));
    setColorText(pickArray(initialProduct, ["color_options", "colors"]).map(normalizeBrandKorean).join(", "));
    setSizeText(pickArray(initialProduct, ["size_options", "sizes"]).map(normalizeBrandKorean).join(", "));
    setDescription(normalizeTextareaText(pickString(initialProduct, ["product_description", "description", "detail_description"], "")));

    if (noteVariants.length > 0) {
      setStockMode("option");
      setVariantRows(
        noteVariants.map((row) => {
          const savedColor = row.color || "";
          // 3단으로 저장된 경우 color 칸이 "세부상품 / 색상" 형태 → 표시용으로만 분해(저장 키는 그대로)
          const sepAt = savedColor.indexOf(AXIS_JOIN);
          return {
            key: `${savedColor || "__EMPTY_COLOR__"}__${row.size || "__EMPTY_SIZE__"}`,
            color: savedColor,
            size: row.size || "",
            stock: Number(row.stock || 0),
            detail: sepAt >= 0 ? savedColor.slice(0, sepAt) : savedColor,
            colorOnly: sepAt >= 0 ? savedColor.slice(sepAt + AXIS_JOIN.length) : "",
          };
        }),
      );
    } else {
      setStockMode("total");
      setTotalStockText(String(pickNumber(initialProduct, ["stock", "total_stock"], 0) || 0));
      setVariantRows([]);
    }

    // [무료나눔] 플래그 복원
    setFreeProductEnabled(productNote?.free_product === true);

    // [2026-08-10 옵션 통합] 수정 모드 복원 — 축(세부상품/색상/사이즈) 되살리기
    const pricing = normalizeBrandRecordKeys<unknown>(
      productNote?.option_pricing && typeof productNote.option_pricing === "object"
        ? (productNote.option_pricing as Record<string, unknown>)
        : {},
    );
    const hiddenList = Array.isArray(productNote?.combo_hidden)
      ? productNote.combo_hidden.map((x) => normalizeBrandKorean(String(x ?? "").trim())) : [];
    const axes = Array.isArray(productNote?.option_axes) ? productNote.option_axes : null;

    let restoredDetails: string[] = [];
    if (axes && axes.length > 0) {
      // 신규 형식 — 축 정의를 그대로 복원
      const find = (k: string) => axes.find((a) => a?.key === k);
      const dv = find("detail");
      const cv = find("color");
      const sv = find("size");
      restoredDetails = Array.isArray(dv?.values) ? dv!.values.map((x) => normalizeBrandKorean(String(x ?? "").trim())).filter(Boolean) : [];
      setDetailText(restoredDetails.join(", "));
      setDetailLabel(String(dv?.label || DETAIL_LABEL_FIXED));
      setColorText(Array.isArray(cv?.values) ? cv!.values.map((x) => normalizeBrandKorean(String(x ?? ""))).join(", ") : "");
      setSizeText(Array.isArray(sv?.values) ? sv!.values.map((x) => normalizeBrandKorean(String(x ?? ""))).join(", ") : "");
    } else if (productNote?.combo_mode === true) {
      // 옛 조합형 — 세부상품명이 color_options / stock_variants.color 에 들어있다
      const stockNames: string[] = [];
      for (const row of noteVariants) {
        const nm = String(row.color ?? "").trim();
        if (nm && !stockNames.includes(nm)) stockNames.push(nm);
      }
      const exposed = pickArray(initialProduct, ["color_options", "colors"]).filter((n) => stockNames.includes(n));
      const rest = stockNames.filter((n) => !exposed.includes(n));
      restoredDetails = [...exposed, ...rest];
      setDetailText(restoredDetails.join(", "));
      setDetailLabel(String(productNote?.option_label || DETAIL_LABEL_FIXED));
      setColorText("");
      setSizeText("");
    } else {
      // 옛 색상·사이즈 — 위(685~686행)에서 이미 colorText/sizeText 를 채웠으므로 세부상품만 비운다
      setDetailText("");
      setDetailLabel(DETAIL_LABEL_FIXED);
    }

    const nextPlus: Record<string, string> = {};
    for (const name of restoredDetails) {
      nextPlus[name] = String(Math.max(0, Math.floor(Number(pricing[name]) || 0)));
    }
    setDetailPlus(nextPlus);
    setDetailHidden(hiddenList.filter((n) => restoredDetails.includes(n)));
    const photosRaw = normalizeBrandRecordKeys<unknown>(
      productNote?.detail_photos && typeof productNote.detail_photos === "object"
        ? (productNote.detail_photos as Record<string, unknown>)
        : {},
    );
    const nextPhotos: Record<string, string> = {};
    for (const name of restoredDetails) {
      const url = String(photosRaw[name] ?? "").trim();
      if (url) nextPhotos[name] = url;
    }
    setDetailPhotos(nextPhotos);
  }, [initialProduct]);

  const details = useMemo(() => unique(splitOptions(detailText)), [detailText]);
  const colors = useMemo(() => unique(splitOptions(colorText)), [colorText]);
  const sizes = useMemo(() => unique(splitOptions(sizeText)), [sizeText]);
  const brandGroupDetailPhotoCount = Object.values(brandGroupDetailPhotoSets).reduce((sum, photos) => sum + photos.length, 0);
  const brandDetailCategories = useMemo(
    () => unique(details.map((name) => String(brandGroupDetailCategories[name] || "").trim()).filter(Boolean)),
    [details, brandGroupDetailCategories],
  );
  const filteredBrandDetails = useMemo(() => {
    const query = brandDetailSearch.trim().toLocaleLowerCase("ko-KR");
    return details.filter((name) => {
      const detailCategory = String(brandGroupDetailCategories[name] || "").trim();
      if (brandDetailCategoryFilter !== "전체" && detailCategory !== brandDetailCategoryFilter) return false;
      if (!query) return true;
      return `${name} ${detailCategory}`.toLocaleLowerCase("ko-KR").includes(query);
    });
  }, [details, brandGroupDetailCategories, brandDetailCategoryFilter, brandDetailSearch]);
  // 사용 중인 축 개수(1~3). 0이면 옵션 없는 단일 상품.
  const usedAxisCount = (details.length ? 1 : 0) + (colors.length ? 1 : 0) + (sizes.length ? 1 : 0);

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
    // 브랜드 대표상품은 세부상품마다 허용 색상·사이즈가 다르다.
    // 전체 색상×전체 사이즈를 곱하면 존재하지 않는 수천 개 조합이 생기므로 저장된 실제 조합만 사용한다.
    if (isBrandGroupEdit) return variantRows;
    return buildVariantRows(details, colors, sizes, variantRows);
  }, [details, colors, sizes, stockMode, variantRows, isBrandGroupEdit]);

  const totalStock = useMemo(() => {
    if (stockMode === "option") {
      return resolvedVariantRows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
    }

    return moneyNumber(totalStockText);
  }, [resolvedVariantRows, stockMode, totalStockText]);

  // 옵션(세부상품/색상/사이즈)이 하나라도 있으면 옵션별(option) 재고, 없으면 단순 총(total) 재고로 자동 전환.
  useEffect(() => {
    setStockMode(details.length > 0 || colors.length > 0 || sizes.length > 0 ? "option" : "total");
  }, [details.length, colors.length, sizes.length]);

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

  // [2026-08-11] 프리셋 버튼/항목 공용 스타일 — 세부상품 슬롯과 톤 통일 + 다중선택임을 눈에 보이게
  // [2026-08-11 사장님 지침] 프리셋 드롭다운을 맥 기본 메뉴 느낌으로 — 어두운 라운드 패널 + 왼쪽 ✓
  // [2026-08-11] 색상/사이즈 칸 상태 안내 — 비우면 "손님 직접입력"(필수), "없음"이면 옵션 자체를 안 씀.
  //   page.tsx getRegisteredOptionMode(610~637행) 기준: 값 있으면 select / "없음"이면 none / 비면 input.
  const optionStateHint = (text: string) => {
    const v = text.trim();
    if (!v) return { text: "✏️ 손님 직접입력", color: "var(--color-info-tx)" };
    if (splitOptions(v).length > 0 && splitOptions(v).every((x) => x === "없음")) {
      return { text: "🚫 사용 안 함", color: "var(--color-ink-mute)" };
    }
    return null;
  };

  const presetBtn = (count: number): CSSProperties => ({
    padding: "6px 11px", borderRadius: "7px", fontSize: "11px", fontWeight: 800,
    background: count > 0 ? "#7B2D43" : "#FBF1E0",
    color: count > 0 ? "#fff" : "var(--color-warn-tx)",
    border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, minWidth: "62px", textAlign: "center",
  });
  const presetMenu: CSSProperties = {
    position: "absolute", top: "100%", right: 0, marginTop: "6px", zIndex: 10,
    background: "rgba(58,54,52,0.97)", backdropFilter: "blur(12px)",
    borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.32)", padding: "5px", minWidth: "178px", overflow: "hidden",
  };
  const presetHint: CSSProperties = {
    padding: "6px 11px 8px", fontSize: "10.5px", fontWeight: 700,
    color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.12)", marginBottom: "4px",
  };
  const presetItem = (on: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", gap: "7px", padding: "8px 11px", fontSize: "13px",
    fontWeight: on ? 800 : 500, cursor: "pointer", borderRadius: "7px",
    color: "#fff", background: on ? "rgba(255,255,255,0.16)" : "transparent",
  });

  const updateVariantStock = (targetKey: string, stock: number) => {
    const baseRows = isBrandGroupEdit ? variantRows : buildVariantRows(details, colors, sizes, variantRows);
    const nextRows = baseRows.map((row) =>
      row.key === targetKey ? { ...row, stock } : row,
    );

    setVariantRows(nextRows);
  };

  // [2026-08-10] 조합이 많아지면(3단은 최대 수십 줄) 한 칸씩 못 채우므로 일괄 적용을 둔다.
  const [bulkStockText, setBulkStockText] = useState("10");
  const applyBulkStock = () => {
    const n = Math.max(0, Math.floor(Number(String(bulkStockText).replace(/[^0-9]/g, "")) || 0));
    const baseRows = isBrandGroupEdit ? variantRows : buildVariantRows(details, colors, sizes, variantRows);
    setVariantRows(baseRows.map((row) => ({ ...row, stock: n })));
  };

  const openBrandDetailEditor = (name: string) => {
    const config = brandGroupDetailOptions[name] || { colors: [], sizes: [], variants: [] };
    const variants = Array.isArray(config.variants) && config.variants.length > 0
      ? config.variants.map((variant) => ({ color: String(variant.color || "없음"), size: String(variant.size || "없음") }))
      : [{ color: "없음", size: "없음" }];
    setBrandDetailEditDraft({
      originalName: name,
      name,
      category: String(brandGroupDetailCategories[name] || ""),
      plus: String(Math.max(0, Number(detailPlus[name]) || 0)),
      variants,
    });
  };

  const applyBrandDetailEditor = () => {
    if (!brandDetailEditDraft) return;
    const oldName = brandDetailEditDraft.originalName;
    const nextName = brandDetailEditDraft.name.trim();
    if (!nextName) {
      showAdminToast("세부상품명을 입력해주세요.", "error");
      return;
    }
    if (nextName !== oldName && details.includes(nextName)) {
      showAdminToast("같은 세부상품명이 이미 있어요.", "error");
      return;
    }
    const nextVariants = brandDetailEditDraft.variants.map((variant) => ({
      color: String(variant.color || "").trim() || "없음",
      size: String(variant.size || "").trim() || "없음",
    }));
    const duplicateKey = nextVariants.map((variant) => `${variant.color}|${variant.size}`);
    if (new Set(duplicateKey).size !== duplicateKey.length) {
      showAdminToast("같은 색상·사이즈 조합이 두 번 들어가 있어요.", "error");
      return;
    }

    const moveKey = <T,>(source: Record<string, T>, value: T | undefined) => {
      const next = { ...source };
      delete next[oldName];
      if (value !== undefined) next[nextName] = value;
      return next;
    };
    const colors = unique(nextVariants.map((variant) => variant.color));
    const sizes = unique(nextVariants.map((variant) => variant.size));
    setDetailText(details.map((name) => name === oldName ? nextName : name).join(", "));
    setDetailPlus((prev) => moveKey(prev, String(Math.max(0, Number(brandDetailEditDraft.plus) || 0))));
    setDetailPhotos((prev) => moveKey(prev, prev[oldName]));
    setBrandGroupDetailPhotoSets((prev) => moveKey(prev, prev[oldName] || []));
    setBrandGroupDetailCategories((prev) => moveKey(prev, brandDetailEditDraft.category.trim()));
    setBrandGroupDetailOptions((prev) => moveKey(prev, { colors, sizes, variants: nextVariants }));
    setDetailHidden((prev) => prev.map((name) => name === oldName ? nextName : name));

    const previousRows = variantRows.filter((row) => row.detail === oldName);
    const remainingRows = variantRows.filter((row) => row.detail !== oldName);
    const editedRows = nextVariants.map((variant) => {
      const previous = previousRows.find((row) => String(row.colorOnly || "없음") === variant.color && String(row.size || "없음") === variant.size);
      const storedColor = [nextName, variant.color].filter(Boolean).join(AXIS_JOIN);
      return {
        key: `${storedColor || "__EMPTY_COLOR__"}__${variant.size || "__EMPTY_SIZE__"}`,
        color: storedColor,
        size: variant.size === "없음" ? "" : variant.size,
        stock: Number(previous?.stock || 0),
        detail: nextName,
        colorOnly: variant.color,
      };
    });
    setVariantRows([...remainingRows, ...editedRows]);
    setBrandDetailEditDraft(null);
  };

  // [2026-08-11] 세부상품 사진 업로드 — 기존 상품사진과 동일한 압축·업로드 API 재사용
  const pickDetailPhoto = (name: string) => {
    detailPhotoTargetRef.current = name;
    detailPhotoInputRef.current?.click();
  };

  const handleDetailPhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const name = detailPhotoTargetRef.current;
    if (!file || !name) return;

    setDetailPhotoUploading(name);
    try {
      const optimizedFile = await compressProductImage(file, "cover");
      const formData = new FormData();
      formData.append("file", optimizedFile);
      formData.append("kind", "cover");
      const response = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "이미지 업로드 실패");
      const url = String(payload?.url || payload?.publicUrl || payload?.path || "").trim();
      if (!url) throw new Error("이미지 주소를 받지 못했어요");
      setDetailPhotos((prev) => ({ ...prev, [name]: url }));
    } catch (error) {
      showAdminToast("세부상품 사진 업로드 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setDetailPhotoUploading("");
    }
  };

  const removeDetailPhoto = (name: string) => {
    setDetailPhotos((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const toggleDetailHidden = (name: string) => {
    setDetailHidden((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  // 세부상품별로 조합 행을 묶어서 보여주기 위한 그룹 (세부상품 미사용이면 단일 그룹)
  const variantGroups = useMemo(() => {
    if (details.length === 0) return [{ detail: "", rows: resolvedVariantRows }];
    return details.map((detail) => ({ detail, rows: resolvedVariantRows.filter((row) => row.detail === detail) }));
  }, [details, resolvedVariantRows]);

  const resetForm = () => {
    setCategory("");
    setCustomerCategoryVisible(true);
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
    setFreeProductEnabled(false);
    setStockManagementEnabled(true);
    setDetailText("");
    setDetailLabel(DETAIL_LABEL_FIXED);
    setDetailPlus({});
    setDetailHidden([]);
    setDetailPhotos({});
    setBrandGroupDetailPhotoSets({});
    setBrandGroupDetailCategories({});
    setBrandGroupDetailOptions({});
    setBrandDetailEditDraft(null);
    setBrandDetailSearch("");
    setBrandDetailCategoryFilter("전체");
    setBulkStockText("10");
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
    // [무료나눔] 켜져 있으면 가격 0 고정(입력값 무시) — 0원 제출 허용은 note.free_product 플래그로 판별
    const price = freeProductEnabled ? 0 : moneyNumber(priceText);
    // product_type: 수정은 기존 값 보존(기존 group_buy 17개 덮어쓰기 금지).
    // 신규는 방송 중이면 "broadcast"(방송상품), 방송 OFF면 "group_buy"(상시판매)로 등록 → 방송 안 해도 상품 등록 가능.
    const resolvedProductType = isEditMode
      ? pickString(initialProduct, ["product_type", "type"], "broadcast") || "broadcast"
      : activeBroadcastId
        ? "broadcast"
        : "group_buy";

    if (!name) {
      setNameError(true);
      return;
    }

    if (price < 0) {
      showAdminToast("판매가를 입력해주세요.", "error");
      return;
    }

    if (resolvedProductType === "broadcast" && !activeBroadcastId && !isEditMode) {
      showAdminToast("방송상품은 방송 시작 후 등록할 수 있습니다.", "error");
      return;
    }

    // [2026-08-10 옵션 통합] 축 검증
    const detailActive = details.length > 0;
    const exposedDetails = details.filter((name) => !detailHidden.includes(name));

    if (detailActive && exposedDetails.length === 0) {
      showAdminToast("모든 세부상품이 숨김 상태예요. 최소 1개는 노출을 켜주세요.\n(상품 자체를 숨기려면 아래 '고객 노출'을 꺼주세요)", "error");
      return;
    }

    // 3단(세부상품+색상)일 때는 두 값을 " / "로 합쳐 재고 키를 만든다 → 값 안에 "/"가 있으면 키가 깨진다.
    if (detailActive && colors.length > 0) {
      const bad = [...details, ...colors].find((v) => v.includes("/"));
      if (bad) {
        showAdminToast(`옵션 값에 "/" 를 쓸 수 없어요: ${bad}\n(세부상품과 색상을 함께 쓰면 "세부상품 / 색상"으로 재고를 관리해서 충돌합니다)`, "error");
        return;
      }
    }

    // [2026-08-10 0단계 · 사고 방지] 재고를 입력해 놓고 재고관리가 꺼져 있으면 무제한 판매로 저장된다.
    //   지금까지 경고가 없어 오버셀 사고 경로가 됐다 → 저장 자체를 막는다.
    if (!stockManagementEnabled) {
      const enteredStock = stockMode === "option"
        ? resolvedVariantRows.reduce((sum, row) => sum + Number(row.stock || 0), 0)
        : moneyNumber(totalStockText);
      if (enteredStock > 0) {
        showAdminToast("재고를 입력했는데 '재고관리'가 꺼져 있어요.\n이대로 등록하면 재고와 상관없이 무제한으로 팔립니다.\n\n재고관리를 켜거나, 재고를 0으로 비워주세요.", "error");
        return;
      }
    }

    setSaving(true);

    try {
      // [2026-08-10 옵션 통합] 저장 키는 항상 (color, size) 2칸 — 3단이면 color 칸에 "세부상품 / 색상"이 이미 합쳐져 있다.
      //   축1(세부상품만)·축2(색상+사이즈)는 기존과 완전히 동일한 형태로 저장된다(회귀 0).
      const variantStockPayload = resolvedVariantRows.map((row) => ({
        color: row.color,
        size: row.size,
        stock: Number(row.stock || 0),
      }));

      // 축 정의는 "세부상품 + (색상 또는 사이즈)" 3단 이상일 때만 기록 →
      //   기존 축1·축2 상품의 note 키 구성이 지금과 100% 동일하게 유지된다.
      const brandColors = unique(Object.values(brandGroupDetailOptions).flatMap((config) => config.colors || []));
      const brandSizes = unique(Object.values(brandGroupDetailOptions).flatMap((config) => config.sizes || []));
      const needAxes = detailActive && (isBrandGroupEdit || colors.length > 0 || sizes.length > 0);
      const optionAxesPayload = needAxes
        ? [
            { key: "detail" as const, label: detailLabel, values: details },
            ...((isBrandGroupEdit ? brandColors : colors).length > 0 ? [{ key: "color" as const, label: "색상", values: isBrandGroupEdit ? brandColors : colors }] : []),
            ...((isBrandGroupEdit ? brandSizes : sizes).length > 0 ? [{ key: "size" as const, label: "사이즈", values: isBrandGroupEdit ? brandSizes : sizes }] : []),
          ]
        : null;

      // 브랜드 대표상품의 엑셀 전용 구조는 일반 수정폼에서 새로 만들 수 없는 데이터다.
      // 수정 저장 시 세부상품별 옵션·다중사진·가져오기 식별자를 반드시 보존한다.
      const preservedBrandNote = isBrandGroupEdit
        ? {
            brand_group: {
              ...(initialProductNote?.brand_group || {}),
              brand_ko: normalizeBrandKorean(String(initialProductNote?.brand_group?.brand_ko || name)),
              detail_categories: brandGroupDetailCategories,
              detail_options: brandGroupDetailOptions,
            },
            detail_photo_sets: brandGroupDetailPhotoSets,
            ...(initialProductNote?.import_batch ? { import_batch: initialProductNote.import_batch } : {}),
            ...(initialProductNote?.vendor_code ? { vendor_code: initialProductNote.vendor_code } : {}),
          }
        : {};

      const productNote = JSON.stringify({
        ...preservedBrandNote,
        stock_mode: stockMode,
        stock_variants: variantStockPayload,
        stock_management_enabled: stockManagementEnabled,
        purchase_limit_enabled: purchaseLimitEnabled,
        purchase_limit_qty: purchaseLimitEnabled ? Math.max(1, Number(purchaseLimitText) || 1) : 0,
        registered_order_enabled: registeredOrderEnabled,
        // [조합형] 직접입력 추천 제외(추가금 누락 방지) / [무료나눔] 추천 제외(직접입력 경로는 0원 금지 정책이라 혼선 방지)
        name_suggestion_enabled: detailActive || freeProductEnabled ? false : nameSuggestionEnabled,
        suggestion_keywords: suggestionKeywordsText
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        category: category.trim(),
        customer_category_visible: customerCategoryVisible,
        free_product: freeProductEnabled,
        ...(detailActive
          ? {
              combo_mode: true,
              option_label: detailLabel,
              option_pricing: Object.fromEntries(
                details.map((name) => [name, Math.max(0, Math.floor(Number(String(detailPlus[name] ?? "0").replace(/[^0-9]/g, "")) || 0))]),
              ),
              combo_hidden: details.filter((name) => detailHidden.includes(name)),
              // [2026-08-11] 세부상품별 대표사진 — 실제로 사진을 넣은 것만 저장(없으면 키 자체를 안 만듦)
              ...(details.some((name) => detailPhotos[name])
                ? { detail_photos: Object.fromEntries(details.filter((name) => detailPhotos[name]).map((name) => [name, detailPhotos[name]])) }
                : {}),
            }
          : {}),
        ...(optionAxesPayload ? { option_axes: optionAxesPayload, combo_detail_values: exposedDetails } : {}),
      });

      const payload: Record<string, unknown> = {
        product_name: name,
        price,
        stock: totalStock,
        status: isVisible ? "판매중" : "숨김",
        product_type: resolvedProductType,
        badge_types: badgeTypes,
        badge_type: badgeTypes[0] ?? null,
        shipping_type: shippingType,
        combine_shipping: shippingType === "vendor" ? "N" : "Y",
        sort_order: 0,
        is_pinned: isPinned,
        pinned_at: nextPinnedAt,
        // 브랜드 대표 썸네일은 화면에서 워드마크로 대체하되, 기존 상품사진 URL은 다른 화면과의 호환을 위해 보존한다.
        image_url: coverImages[0] || null,
        // color_options: 3단이면 "색상" 목록, 세부상품만 쓰면 노출 세부상품명(= 기존 조합형과 동일)
        color_options: isBrandGroupEdit
          ? exposedDetails
          : (detailActive && colors.length === 0 ? exposedDetails : colors),
        size_options: isBrandGroupEdit ? brandSizes : sizes,
        color_option_enabled: isBrandGroupEdit ? true : (detailActive ? true : colors.length > 0),
        size_option_enabled: isBrandGroupEdit
          ? brandSizes.some((value) => value !== "없음")
          : sizes.length > 0,
        product_description: normalizeTextareaText(description).trim() || null,
        // 브랜드 대표상품은 이 배열에 전체 세부사진이 함께 들어 있다. 일반폼의 5장 제한으로 잘라 저장하지 않는다.
        detail_image_urls: isBrandGroupEdit
          ? Array.from(new Set(Object.values(brandGroupDetailPhotoSets).flat().filter(Boolean)))
          : detailImages,
        is_visible: isVisible,
        is_soldout: false,
        product_note: productNote,
      };

      const result = isEditMode
        ? await updateProductSchemaSafe(editingProductId, payload)
        : await insertProductSchemaSafe(payload);

      const productId = result.data?.id;

      if (!isEditMode && resolvedProductType === "broadcast" && activeBroadcastId && productId) {
        const { error: linkError } = await adminCatalogWrite({
          table: "broadcast_products",
          op: "insert",
          values: {
            broadcast_id: activeBroadcastId,
            product_id: productId,
            sort_order: 0,
          },
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
  const inactiveChoice = "bg-surface-3 text-ink-soft hover:bg-surface-3";

  // 카테고리 칩: 기본(신발/의류/잡화) + 직접 추가한 것 + (수정 모드 등) 현재값이 커스텀이면 포함
  const PRESET_CATEGORIES = ["신발", "의류", "잡화"];
  const categoryChips = Array.from(
    new Set([
      ...PRESET_CATEGORIES,
      ...customCategories,
      ...(category && !PRESET_CATEGORIES.includes(category) ? [category] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
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
  const sectionLabel: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "var(--color-ink-mute)", marginBottom: "6px" };
  const fieldLabel: CSSProperties = { display: "block", fontSize: "12px", color: "var(--color-ink-mute)", fontWeight: 500, marginBottom: "3px" };
  const fieldInput: CSSProperties = { width: "100%", fontSize: "13px", padding: "9px 11px", border: "1px solid #E8E2DD", borderRadius: "7px", background: "var(--color-surface)", color: "var(--color-ink)", outline: "none" };
  const optRow: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" };
  const optLabel: CSSProperties = { fontSize: "13px", color: "var(--color-ink)", minWidth: "36px" };
  const optInput: CSSProperties = { flex: 1, fontSize: "13px", padding: "6px 10px", border: "1px solid #E8E2DD", borderRadius: "6px", background: "var(--color-surface)", outline: "none" };
  const togglePill = (kind: "on-select" | "on-input" | "off"): CSSProperties => ({
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    ...(kind === "on-select"
      ? { background: "#E8F5F0", color: "var(--color-ok-tx)" }
      : kind === "on-input"
        ? { background: "#E8F0FA", color: "var(--color-info-tx)" }
        : { background: "#F1EFEC", color: "var(--color-ink-mute)" }),
  });
  const presetTag = (sel: boolean): CSSProperties => ({ padding: "4px 9px", borderRadius: "6px", fontSize: "11px", background: sel ? "#7B2D43" : "#FBF1E0", color: sel ? "#fff" : "#854F0B", cursor: "pointer", border: "none" });
  const toggleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #E8E2DD" };
  const tgStyle = (on: boolean): CSSProperties => ({ width: "40px", height: "22px", borderRadius: "11px", background: on ? "#0F6E56" : "#E8E2DD", position: "relative", cursor: "pointer", flexShrink: 0 });
  const tgKnob = (on: boolean): CSSProperties => ({ position: "absolute", width: "18px", height: "18px", background: "var(--color-surface)", borderRadius: "50%", top: "2px", ...(on ? { right: "2px" } : { left: "2px" }) });

  return (
    <div
      className="ruru-product-sian"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", padding: "16px" }}
    >
      {/* .modal */}
      <div style={{ width: "560px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", boxShadow: "0 0 0 2px #7B2D43, 0 8px 40px rgba(0,0,0,0.35)", overflow: "hidden", transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}>

        {/* .modal-hd */}
        <div onMouseDown={onHeaderMouseDown} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #E8E2DD", background: "#F7F5F3", cursor: "grab", userSelect: "none" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-ink)", margin: 0 }}>{isEditMode ? "✎ 상품 수정" : "+ 새 상품 등록"}</h2>
          <span onClick={() => onClose?.()} style={{ fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>×</span>
        </div>

        {/* .modal-body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>

          {/* .top-row : 사진(120) + 필드 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: "14px", marginBottom: "14px" }}>
            <div style={{ width: "120px" }}>
              {isBrandGroupEdit ? (
                <div>
                  <img
                    src={brandWordmarkImage}
                    alt={`${String(initialProductNote?.brand_group?.brand_ko || productName || "브랜드")} 대표 썸네일`}
                    style={{ width: "120px", height: "120px", display: "block", objectFit: "cover", borderRadius: "10px", border: "1px solid #E1D5D9", background: "#FFFDFB" }}
                  />
                  <div style={{ marginTop: "5px", textAlign: "center", fontSize: "10px", lineHeight: 1.25, fontWeight: 800, color: "#7B2D43" }}>
                    브랜드 대표 썸네일<br />자동 적용
                  </div>
                </div>
              ) : (
                <ImagePicker label="" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={setCoverImages} triggerRef={coverUploadRef} />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <label style={fieldLabel}>상품명 <span style={{ color: "var(--color-rose-deep)", marginLeft: "2px" }}>*</span></label>
                <input
                  style={{ ...fieldInput, borderColor: nameError ? "#C0392B" : "#E8E2DD" }}
                  type="text"
                  placeholder="예: 스웨이드 로퍼"
                  value={productName}
                  onChange={(e) => { setProductName(e.target.value); if (nameError) setNameError(false); }}
                />
                {nameError ? <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-danger-tx)" }}>상품명은 필수입니다</div> : null}
              </div>
              <div>
                <label style={fieldLabel}>가격 <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-ink-mute)" }}>(비우면 손님 직접입력)</span></label>
                <div style={{ position: "relative" }}>
                  <input style={{ ...fieldInput, paddingRight: "30px", opacity: freeProductEnabled ? 0.45 : 1 }} type="text" inputMode="numeric" placeholder="59,000" value={freeProductEnabled ? "0" : priceText} disabled={freeProductEnabled} onChange={(e) => setPriceText(formatNumberWithComma(e.target.value))} />
                  <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "var(--color-ink-mute)", pointerEvents: "none" }}>원</span>
                </div>
                {/* [무료나눔 · 2026-07-22] 0원 상품 — "가격 비움(손님 직접입력)"과 구분되는 별도 플래그.
                    켜면 가격 0 고정 + note.free_product=true → 고객 주문서에서 이 상품만 0원 제출 허용 */}
                <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px", fontWeight: 700, color: freeProductEnabled ? "#0F6E56" : "var(--color-ink-mute)", cursor: "pointer" }}>
                  <input type="checkbox" checked={freeProductEnabled} onChange={(e) => setFreeProductEnabled(e.target.checked)} style={{ accentColor: "#0F6E56" }} />
                  🎁 무료나눔 상품 (0원 — 손님에게 선물)
                </label>
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

          {/* [2026-08-11] 카테고리·뱃지는 기본 접힘 — 방송 중엔 옵션·재고가 먼저 보이게 */}
          {!extraOpen ? (
            <div style={{ marginBottom: "12px" }}>
              <button
                type="button"
                onClick={() => setExtraOpen(true)}
                style={{ width: "100%", padding: "9px", border: "1px dashed #D9C5CC", background: "var(--color-surface)", color: "#7B2D43", fontSize: "12px", fontWeight: 800, borderRadius: "8px", cursor: "pointer" }}
              >
                ＋ 카테고리 · 상품 뱃지 {category.trim() || badgeTypes.length > 0 ? `(${[category.trim(), badgeTypes.length ? `뱃지 ${badgeTypes.length}` : ""].filter(Boolean).join(" · ")})` : "(선택)"}
              </button>
            </div>
          ) : null}

          {extraOpen ? (
          <>
          <div style={{ marginBottom: "8px", textAlign: "right" }}>
            <button
              type="button"
              onClick={() => setExtraOpen(false)}
              style={{ padding: "5px 12px", border: "1px solid #D9C5CC", background: "var(--color-surface)", color: "#7B2D43", fontSize: "11px", fontWeight: 800, borderRadius: "7px", cursor: "pointer" }}
            >
              − 접기
            </button>
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
                      <span onClick={(e) => { e.stopPropagation(); removeCustomCategory(c); }} style={{ fontSize: "14px", color: "var(--color-rose-deep)", lineHeight: 1, marginLeft: "2px" }}>×</span>
                    ) : null}
                  </div>
                );
              })}
              {!addingCategory ? (
                <div onClick={() => setAddingCategory(true)} style={{ padding: "6px 13px", borderRadius: "20px", border: "1px dashed #E8E2DD", fontSize: "12px", cursor: "pointer", color: "var(--color-ink-mute)", background: "var(--color-surface)" }}>+ 추가</div>
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
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryText(""); }} style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #E8E2DD", background: "var(--color-surface)", fontSize: "12px", cursor: "pointer", color: "var(--color-ink-mute)" }}>취소</button>
              </div>
            ) : null}
            <label
              style={{
                marginTop: "10px",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                border: "1px solid #E8E2DD",
                borderRadius: "9px",
                background: "#FFFCFD",
                cursor: "pointer",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#49363D" }}>고객 카테고리 버튼에 표시</span>
                <span style={{ display: "block", marginTop: "2px", fontSize: "11px", lineHeight: 1.45, color: "var(--color-ink-mute)" }}>
                  꺼도 상품은 ‘전체’ 목록에서 정상적으로 보여요.
                </span>
              </span>
              <input
                type="checkbox"
                checked={customerCategoryVisible}
                onChange={(event) => setCustomerCategoryVisible(event.target.checked)}
                aria-label="고객 카테고리 버튼에 표시"
                style={{ width: "20px", height: "20px", flexShrink: 0, accentColor: "#7A1E47", cursor: "pointer" }}
              />
            </label>
          </div>

          {/* 상품 뱃지 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={sectionLabel}>상품 뱃지</div>
            <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginBottom: "6px" }}>손님 상품 목록에 표시되는 뱃지</div>
            <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {/* [2026-07-10] 해외배송 배지 추가 (표시 전용 — 배송비/배송 로직과 무관) */}
              {([["none", "없음"], ["new", "✨ NEW"], ["hot", "🔥 HOT"], ["limit", "⏰ 한정"], ["pick", "⭐ MD픽"], ["direct", "🛒 바로구매"], ["overseas", "✈️ 해외배송"]] as const).map(([v, l]) => {
                const on = v === "none" ? badgeTypes.length === 0 : badgeTypes.includes(v);
                return (
                  <div
                    key={v}
                    onClick={() =>
                      v === "none"
                        ? setBadgeTypes([])
                        : setBadgeTypes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                    }
                    style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid " + (on ? "#7A1E47" : "#E5E1DC"), fontSize: "12px", fontWeight: 600, cursor: "pointer", color: on ? "#fff" : "#6B6460", background: on ? "#7A1E47" : "#fff", animation: v === "hot" ? "shimmer 1.5s ease-in-out infinite" : undefined }}
                  >
                    {l}
                  </div>
                );
              })}
            </div>
          </div>
          </>
          ) : null}

          {/* ── 옵션 박스 [2026-08-10 통합] 탭 제거 · 슬롯 3개(세부상품/색상/사이즈) 중 쓰는 것만 축이 된다 ── */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ border: "1px solid #E8E2DD", borderRadius: "8px", padding: "12px", background: "#F7F5F3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}>
                  옵션 <span style={{ color: "#7B2D43", fontWeight: 800 }}>{usedAxisCount > 0 ? `${usedAxisCount}단` : "없음"}</span>
                </span>
                <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>값 넣으면 고르기 · 비우면 손님 직접입력</span>
              </div>

              {isBrandGroupEdit ? (
                <div style={{ padding: "9px 10px", marginBottom: "8px", borderRadius: "8px", background: "#EEF6F3", border: "1px solid #CFE4DB", fontSize: "11.5px", lineHeight: 1.55, color: "#0F6E56" }}>
                  <b>브랜드 대표상품 · 세부상품 {details.length}개</b><br />
                  색상과 사이즈는 상품마다 다르게 저장되어 있어요. 아래 목록에는 각 상품에 실제 등록된 옵션만 표시됩니다.
                </div>
              ) : null}

              {/* 슬롯 1 — 세부상품(라벨 변경 가능). A-1 / A-2 / A-3 처럼 한 상품 안의 여러 상품 */}
              <div style={isBrandGroupEdit ? { ...optRow, display: "none" } : optRow}>
                <span style={optLabel}>세부상품</span>
                <input style={optInput} type="text" placeholder="A-1, A-2, A-3 (쉼표로 구분)" value={detailText} onChange={(e) => setDetailText(e.target.value)} />
                {!detailText.trim() ? <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-ink-mute)", whiteSpace: "nowrap" }}>🚫 사용 안 함</span> : null}
              </div>

              {/* 슬롯 2 — 색상 */}
              <div style={isBrandGroupEdit ? { ...optRow, display: "none" } : optRow}>
                <span style={optLabel}>색상</span>
                <input style={optInput} type="text" placeholder="화이트, 블랙, 베이지" value={colorText} onChange={(e) => setColorText(e.target.value)} />
                <div ref={colorPresetRef} style={{ position: "relative", display: "inline-block" }}>
                  <button type="button" onClick={() => setColorPresetOpen((v) => !v)} style={presetBtn(colors.length)}>
                    프리셋{colors.length > 0 ? ` ${colors.length}` : ""} ▾
                  </button>
                  {colorPresetOpen ? (
                    <div style={presetMenu}>
                      <div style={presetHint}>여러 개 고를 수 있어요</div>
                      {COLOR_PRESETS.map((preset) => {
                        const on = splitOptions(colorText).includes(preset);
                        return (
                          <div key={preset} onClick={() => applyColorPreset(preset)} style={presetItem(on)}>
                            <span style={{ width: "13px", flexShrink: 0, fontWeight: 900 }}>{on ? "✓" : ""}</span>{preset === "없음" ? "🚫 사용 안 함" : preset}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {optionStateHint(colorText) ? <span style={{ fontSize: "11.5px", fontWeight: 700, color: optionStateHint(colorText)!.color, whiteSpace: "nowrap" }}>{optionStateHint(colorText)!.text}</span> : null}
              </div>

              {/* 슬롯 3 — 사이즈 */}
              <div style={isBrandGroupEdit ? { ...optRow, display: "none" } : optRow}>
                <span style={optLabel}>사이즈</span>
                <input style={optInput} type="text" placeholder="220, 230, 240" value={sizeText} onChange={(e) => setSizeText(e.target.value)} />
                <div ref={sizePresetRef} style={{ position: "relative", display: "inline-block" }}>
                  <button type="button" onClick={() => setSizePresetOpen((v) => !v)} style={presetBtn(sizes.length)}>
                    프리셋{sizes.length > 0 ? ` ${sizes.length}` : ""} ▾
                  </button>
                  {sizePresetOpen ? (
                    <div style={presetMenu}>
                      <div style={presetHint}>여러 개 고를 수 있어요</div>
                      {SIZE_PRESETS.map((preset) => {
                        const on = normalizePresetOptions(preset).some((o) => splitOptions(sizeText).includes(o));
                        return (
                          <div key={preset} onClick={() => applySizePreset(preset)} style={presetItem(on)}>
                            <span style={{ width: "13px", flexShrink: 0, fontWeight: 900 }}>{on ? "✓" : ""}</span>{preset === "없음" ? "🚫 사용 안 함" : preset}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {optionStateHint(sizeText) ? <span style={{ fontSize: "11.5px", fontWeight: 700, color: optionStateHint(sizeText)!.color, whiteSpace: "nowrap" }}>{optionStateHint(sizeText)!.text}</span> : null}
              </div>

              {/* 엑셀 브랜드 대표상품: 재고관리를 꺼도 세부상품별 사진을 관리자가 바로 확인할 수 있게 한다. */}
              {isBrandGroupEdit && details.length > 0 ? (
                <div style={{ marginTop: "10px", borderTop: "1px solid #E8E2DD", paddingTop: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "7px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)" }}>세부상품 관리</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F6E56" }}>{details.length}개 상품 · 총 {brandGroupDetailPhotoCount}장</span>
                  </div>
                  <input
                    aria-label="세부상품 검색"
                    value={brandDetailSearch}
                    onChange={(event) => setBrandDetailSearch(event.target.value)}
                    placeholder="상품코드·상품명·구분 검색"
                    style={{ ...fieldInput, marginBottom: "7px", padding: "7px 10px", fontSize: "11.5px" }}
                  />
                  {brandDetailCategories.length > 0 ? (
                    <div style={{ display: "flex", gap: "5px", overflowX: "auto", paddingBottom: "7px" }}>
                      {["전체", ...brandDetailCategories].map((detailCategory) => {
                        const selected = brandDetailCategoryFilter === detailCategory;
                        return (
                          <button
                            key={`brand-detail-filter-${detailCategory}`}
                            type="button"
                            onClick={() => setBrandDetailCategoryFilter(detailCategory)}
                            style={{ flexShrink: 0, border: `1px solid ${selected ? "#7B2D43" : "#E1D5D9"}`, borderRadius: "999px", padding: "4px 8px", background: selected ? "#7B2D43" : "#fff", color: selected ? "#fff" : "var(--color-ink-soft)", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
                          >
                            {detailCategory}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "6px", maxHeight: "340px", overflowY: "auto", paddingRight: "3px" }}>
                    {filteredBrandDetails.map((name) => {
                      const photos = brandGroupDetailPhotoSets[name] || (detailPhotos[name] ? [detailPhotos[name]] : []);
                      const thumbnail = photos[0] || detailPhotos[name] || "";
                      const categoryLabel = String(brandGroupDetailCategories[name] || "").trim();
                      const plus = Math.max(0, Number(detailPlus[name]) || 0);
                      const unitPrice = moneyNumber(priceText) + plus;
                      return (
                        <div key={`brand-photo-${name}`} onClick={() => openBrandDetailEditor(name)} style={{ minWidth: 0, display: "grid", gridTemplateColumns: "46px minmax(0, 1fr) auto", gap: "8px", alignItems: "center", padding: "6px", border: "1px solid #E8E2DD", borderRadius: "8px", background: "var(--color-surface)", cursor: "pointer" }}>
                          <button
                            type="button"
                            disabled={!thumbnail}
                            onClick={(event) => { event.stopPropagation(); if (thumbnail) setDetailPreviewImage(resolveProductImageUrl(thumbnail)); }}
                            title={thumbnail ? "클릭하면 크게 보기" : "등록된 사진 없음"}
                            style={{ width: "46px", height: "46px", border: "none", borderRadius: "7px", padding: 0, overflow: "hidden", background: "#F1ECE8", cursor: thumbnail ? "zoom-in" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            {thumbnail ? <img src={resolveProductImageUrl(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "10px", color: "var(--color-ink-mute)" }}>사진 없음</span>}
                          </button>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                            <span style={{ display: "block", marginTop: "2px", fontSize: "10.5px", color: "var(--color-ink-mute)" }}>
                              {[categoryLabel, `사진 ${photos.length}장`, unitPrice > 0 ? `${unitPrice.toLocaleString("ko-KR")}원` : ""].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#7B2D43", whiteSpace: "nowrap" }}>수정 ›</span>
                        </div>
                      );
                    })}
                    {filteredBrandDetails.length === 0 ? (
                      <div style={{ gridColumn: "1 / -1", padding: "18px 10px", textAlign: "center", color: "var(--color-ink-mute)", fontSize: "11.5px", border: "1px dashed #D9C5CC", borderRadius: "8px" }}>
                        조건에 맞는 세부상품이 없습니다.
                      </div>
                    ) : null}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "10.5px", color: "var(--color-ink-mute)" }}>카드를 누르면 상품명·구분·추가금·색상·사이즈를 수정할 수 있어요. 썸네일은 클릭하면 크게 보입니다.</div>
                </div>
              ) : null}

              {usedAxisCount === 0 ? (
                <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", padding: "2px 2px 0" }}>옵션 없는 단일 상품으로 등록됩니다. 손님은 수량만 고릅니다.</div>
              ) : null}

              {/* ── 재고관리 (옵션 박스 안으로 이동 — 재고 표 바로 위) ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E8E2DD", marginTop: "10px", paddingTop: "10px" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-ink)" }}>재고관리</div>
                  <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginTop: "1px" }}>{stockManagementEnabled ? "재고 수량 관리 중" : "(끄면 무제한 — 재고를 세지 않음)"}</div>
                </div>
                <div onClick={() => setStockManagementEnabled((v) => !v)} style={tgStyle(stockManagementEnabled)}><span style={tgKnob(stockManagementEnabled)} /></div>
              </div>

              {/* 🔴 사고 방지 — 재고를 넣었는데 재고관리가 꺼져 있으면 무제한으로 저장된다 */}
              {!stockManagementEnabled && totalStock > 0 ? (
                <div style={{ background: "var(--color-danger-bg)", border: "1px solid #F0C8C1", color: "var(--color-danger-tx)", fontSize: "12px", fontWeight: 700, borderRadius: "8px", padding: "9px 11px", marginTop: "8px", lineHeight: 1.6 }}>
                  🔴 재고를 입력했는데 <b>재고관리가 꺼져 있어요.</b>
                  <div style={{ fontWeight: 400, marginTop: "2px" }}>이대로 등록하면 <b>무제한으로 팔립니다.</b></div>
                  <button type="button" onClick={() => setStockManagementEnabled(true)} style={{ marginTop: "6px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "11px", fontWeight: 800, borderRadius: "7px", padding: "5px 11px", cursor: "pointer" }}>재고관리 켜기</button>
                </div>
              ) : null}

              {/* ── 재고 입력 ── */}
              {stockManagementEnabled ? (
                stockMode === "option" ? (
                  <div style={{ marginTop: "9px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)" }}>조합 {resolvedVariantRows.length}개</span>
                      <span style={{ fontSize: "11px", color: "var(--color-ink-mute)", display: "flex", alignItems: "center", gap: "4px" }}>
                        전체
                        <input style={{ fontSize: "11px", padding: "3px 6px", border: "1px solid #E8E2DD", borderRadius: "5px", textAlign: "right", width: "46px" }} type="text" inputMode="numeric" value={bulkStockText} onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }} onChange={(e) => setBulkStockText(e.target.value.replace(/[^0-9]/g, ""))} />
                        개
                        <button type="button" onClick={applyBulkStock} style={{ border: "1.5px dashed #7B2D43", background: "var(--color-surface)", color: "#7B2D43", fontSize: "11px", fontWeight: 800, borderRadius: "7px", padding: "3px 9px", cursor: "pointer" }}>일괄적용</button>
                      </span>
                    </div>

                    <div style={{ background: "#F7F5F3", borderRadius: "8px", padding: "8px", maxHeight: "260px", overflowY: "auto", border: "1px solid #E8E2DD" }}>
                      {variantGroups.map((group) => (
                        <div key={`grp-${group.detail || "__none__"}`} style={{ marginBottom: "4px" }}>
                          {group.detail ? (
                            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 82px 34px", gap: "6px", alignItems: "center", background: "#F5E6EB", borderRadius: "6px", padding: "5px 8px", marginBottom: "3px" }}>
                              {/* [2026-08-11] 세부상품별 대표사진 — 손님이 종류 고를 때 사진으로 구분 (스마트스토어·쿠팡의 옵션별 이미지와 동일 개념) */}
                              <button
                                type="button"
                                onClick={() => pickDetailPhoto(group.detail)}
                                title={detailPhotos[group.detail] ? "사진 바꾸기 (우클릭하면 삭제)" : "이 세부상품 사진 넣기"}
                                onContextMenu={(e) => { e.preventDefault(); if (detailPhotos[group.detail]) removeDetailPhoto(group.detail); }}
                                style={{ width: "36px", height: "36px", borderRadius: "7px", border: detailPhotos[group.detail] ? "none" : "1.5px dashed #C9A8B4", background: detailPhotos[group.detail] ? `center/cover no-repeat url(${JSON.stringify(resolveProductImageUrl(detailPhotos[group.detail]))})` : "var(--color-surface)", cursor: "pointer", padding: 0, fontSize: "14px", fontWeight: 800, color: "#B08A99", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}
                              >
                                {detailPhotoUploading === group.detail ? "…" : detailPhotos[group.detail] ? "" : "＋"}
                              </button>
                              <span style={{ fontSize: "12px", fontWeight: 800, color: "#7B2D43", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: detailHidden.includes(group.detail) ? 0.5 : 1 }}>
                                {group.detail}
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <span style={{ fontSize: "10px", color: "#7B2D43", fontWeight: 700 }}>+</span>
                                <input
                                  style={{ fontSize: "11px", padding: "4px 6px", border: "1px solid #D9C5CC", borderRadius: "5px", textAlign: "right", width: "100%", background: "#fff" }}
                                  type="text" inputMode="numeric" placeholder="추가금"
                                  value={formatNumberWithComma(detailPlus[group.detail] ?? "0") || "0"}
                                  onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }}
                                  onChange={(e) => setDetailPlus((prev) => ({ ...prev, [group.detail]: onlyNumber(e.target.value) }))}
                                />
                              </span>
                              <button type="button" title={detailHidden.includes(group.detail) ? "숨김 — 누르면 노출" : "노출 중 — 누르면 숨김"} onClick={() => toggleDetailHidden(group.detail)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "14px", padding: 0 }}>
                                {detailHidden.includes(group.detail) ? "🚫" : "👁"}
                              </button>
                            </div>
                          ) : null}

                          {group.rows.map((row) => {
                            const displayColor = String(row.colorOnly || "").trim() === "없음" ? "" : row.colorOnly;
                            const label = [displayColor, row.size].filter(Boolean).join(" / ");
                            const heldQty = heldOf(String(row.color ?? row.colorOnly ?? ""), String(row.size ?? ""));
                            const sellable = Math.max(0, Number(row.stock || 0) - heldQty);
                            const soldOut = sellable <= 0;
                            return (
                              <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr 74px 20px", gap: "6px", alignItems: "center", padding: "3px 0 3px " + (group.detail ? "12px" : "2px") }}>
                                <span style={{ fontSize: "12px", color: soldOut ? "var(--color-danger-tx)" : "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {label || (group.detail ? "재고" : "기본")}
                                </span>
                                <input style={{ fontSize: "12px", padding: "5px 7px", border: "1px solid #E8E2DD", borderRadius: "6px", textAlign: "right", width: "100%" }} type="number" min={0} inputMode="numeric" value={row.stock} onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }} onChange={(e) => updateVariantStock(row.key, Math.max(0, Number(e.target.value) || 0))} />
                                <span style={{ fontSize: "10px", fontWeight: 800, color: soldOut ? "var(--color-danger-tx)" : "var(--color-ink-mute)" }}>{soldOut ? "품절" : "개"}</span>
                                {heldQty > 0 ? (
                                  <span style={{ gridColumn: "1 / -1", marginTop: "1px", fontSize: "10.5px", fontWeight: 700, color: "#B0793A", paddingLeft: group.detail ? "12px" : "2px" }}>
                                    담김 {heldQty}개 · 지금 판매가능 <b style={{ color: sellable > 0 ? "#0F6E56" : "#C0392B" }}>{sellable}개</b>
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-ink-mute)", display: "flex", justifyContent: "space-between" }}>
                      <span>
                        실재고 <b style={{ color: "var(--color-ink)" }}>{totalStock.toLocaleString("ko-KR")}</b>개
                        {heldTotal > 0 ? <> · 담김 <b style={{ color: "#B0793A" }}>{heldTotal}</b>개 · 판매가능 <b style={{ color: "#0F6E56" }}>{Math.max(0, totalStock - heldTotal).toLocaleString("ko-KR")}</b>개</> : null}
                      </span>
                      <span>{resolvedVariantRows.filter((row) => Number(row.stock || 0) <= 0).length > 0 ? `품절 ${resolvedVariantRows.filter((row) => Number(row.stock || 0) <= 0).length}개` : ""}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#F7F5F3", borderRadius: "8px", padding: "10px", marginTop: "9px", display: "flex", alignItems: "center", gap: "8px", border: "1px solid #E8E2DD" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-ink)", flex: 1 }}>총 재고 수량</span>
                    <input style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #E8E2DD", borderRadius: "6px", textAlign: "right", width: "80px" }} type="number" min={0} inputMode="numeric" value={totalStockText} onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }} onChange={(e) => setTotalStockText(e.target.value)} />
                    <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>개</span>
                    {heldTotal > 0 ? (
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#B0793A", whiteSpace: "nowrap" }}>담김 {heldTotal} · 판매가능 {Math.max(0, (Number(totalStockText) || 0) - heldTotal)}</span>
                    ) : null}
                  </div>
                )
              ) : null}

              {/* 세부상품 사진 업로드용 숨은 input (그룹 헤더 사진칸이 이걸 부름) */}
              <input ref={detailPhotoInputRef} type="file" accept="image/*" onChange={handleDetailPhotoChange} style={{ display: "none" }} />

              {/* 저장 형태 안내 — 사장님이 "지금과 같은지" 바로 확인할 수 있게 */}
              {usedAxisCount > 0 ? (
                <div style={{ background: "#F5E6EB", border: "1px solid #D9C5CC", color: "#7B2D43", fontSize: "11px", borderRadius: "8px", padding: "8px 10px", marginTop: "9px", lineHeight: 1.7 }}>
                  {details.length > 0 && colors.length > 0
                    ? <>3단 — 손님은 <b>세부상품 → 색상 → 사이즈</b> 순으로 고릅니다. 재고는 <b>&quot;세부상품 / 색상&quot; + 사이즈</b>로 관리돼요.</>
                    : details.length > 0
                      ? <>손님은 <b>세부상품</b>만 고릅니다. (예전 &quot;세부상품 조합형&quot;과 <b>완전히 같은 방식</b>)</>
                      : <>손님은 <b>{[colors.length ? "색상" : "", sizes.length ? "사이즈" : ""].filter(Boolean).join(" → ")}</b>을(를) 고릅니다. (예전 &quot;색상·사이즈&quot;와 <b>완전히 같은 방식</b>)</>}
                  {details.length > 0 ? (
                    <>
                      <br />추가금은 <b>세부상품</b>별로 넣습니다 · 👁 를 누르면 그 세부상품만 손님에게 숨겨져요.
                      <br /><b>＋ 네모칸</b>을 누르면 <b>세부상품마다 사진</b>을 넣을 수 있어요 (손님이 사진 보고 고름) · 사진 위 <b>우클릭</b>하면 삭제.
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* 고객노출 / 구매제한 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={toggleRow}>
              <div>
                <div style={{ fontSize: "13px", color: "var(--color-ink)" }}>고객 노출</div>
                <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginTop: "1px" }}>손님 주문 페이지에 표시</div>
              </div>
              <div onClick={() => setIsVisible((v) => !v)} style={tgStyle(isVisible)}><span style={tgKnob(isVisible)} /></div>
            </div>

            {/* 개인당 구매제한 (카톡 계정=전화번호 기준, 끌 때까지 계속 적용) */}
            <div style={toggleRow}>
              <div>
                <div style={{ fontSize: "13px", color: "var(--color-ink)" }}>개인당 구매제한</div>
                <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginTop: "1px" }}>{purchaseLimitEnabled ? "한 사람(카톡 계정)이 이 상품을 정해진 개수까지만" : "(끄면 제한 없음)"}</div>
              </div>
              <div onClick={() => setPurchaseLimitEnabled((v) => !v)} style={tgStyle(purchaseLimitEnabled)}><span style={tgKnob(purchaseLimitEnabled)} /></div>
            </div>

            {purchaseLimitEnabled ? (
              <div style={{ background: "#F7F5F3", borderRadius: "8px", padding: "10px", marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-ink)", flex: 1 }}>1인당 최대</span>
                <input style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #E8E2DD", borderRadius: "6px", textAlign: "right", width: "80px" }} type="number" min={1} inputMode="numeric" value={purchaseLimitText} onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }} onChange={(e) => setPurchaseLimitText(e.target.value)} />
                <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>개</span>
              </div>
            ) : null}
          </div>

          {/* 구분선 */}
          <div style={{ height: "1px", background: "#E8E2DD", margin: "12px 0" }} />

          {/* 일반 상품 공통 상세사진 / 브랜드 대표상품은 위의 세부상품별 사진 목록으로 확인 */}
          {!isBrandGroupEdit ? (
            <div style={{ marginBottom: "14px" }}>
              <ImagePicker label="상세사진 (최대 5장)" value={detailImages} maxFiles={5} uploadKind="detail" mode="detail" onChange={setDetailImages} />
            </div>
          ) : (
            <div style={{ marginBottom: "14px", padding: "9px 11px", borderRadius: "8px", border: "1px solid #CFE4DB", background: "#EEF6F3", color: "#0F6E56", fontSize: "11.5px", lineHeight: 1.55 }}>
              세부상품별 사진 <b>{details.length}개 상품 · 총 {brandGroupDetailPhotoCount}장</b>이 등록되어 있습니다.<br />
              위의 세부상품 목록에서 썸네일과 사진 수를 확인할 수 있어요.
            </div>
          )}

          {/* 상세설명 */}
          <div style={{ marginBottom: "14px" }}>
            <div style={sectionLabel}>상세설명</div>
            <textarea
              style={{ width: "100%", fontSize: "13px", padding: "10px 12px", border: "1px solid #E8E2DD", borderRadius: "8px", minHeight: "90px", resize: "vertical", background: "var(--color-surface)", fontFamily: "inherit", outline: "none" }}
              placeholder="상품 상세 설명 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid #E8E2DD", background: "#F7F5F3", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}><span style={{ color: "var(--color-warn-tx)" }}>⚡ 빠른등록:</span> 사진·이름만 넣고 바로</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => onClose?.()} disabled={saving} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #E8E2DD", background: "var(--color-surface)", fontSize: "13px", cursor: saving ? "default" : "pointer", color: "var(--color-ink)", opacity: saving ? 0.5 : 1 }}>취소</button>
            <button type="button" onClick={() => void saveProduct()} disabled={saving} style={{ padding: "10px 22px", borderRadius: "8px", background: saving ? "#ccc" : isEditMode ? "#0F6E56" : "#7B2D43", color: "#fff", border: "none", fontSize: "13px", fontWeight: 500, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "저장 중..." : isEditMode ? "저장" : "등록"}</button>
          </div>
        </div>

      </div>

      {brandDetailEditDraft ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(39,28,33,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
          <div role="dialog" aria-modal="true" aria-label="세부상품 수정" style={{ width: "min(620px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden", background: "var(--color-surface)", boxShadow: "0 22px 70px rgba(0,0,0,0.28)" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #E8E2DD", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F7F5F3" }}>
              <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--color-ink)" }}>세부상품 수정</span>
              <button type="button" onClick={() => setBrandDetailEditDraft(null)} style={{ border: "none", background: "transparent", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "14px 16px" }}>
              {(() => {
                const photos = brandGroupDetailPhotoSets[brandDetailEditDraft.originalName] || [];
                if (photos.length === 0) return null;
                return (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ marginBottom: "6px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>등록사진 {photos.length}장 · 클릭하면 확대</div>
                    <div style={{ display: "flex", gap: "7px", overflowX: "auto", paddingBottom: "3px" }}>
                      {photos.map((photo, index) => (
                        <button
                          key={`brand-edit-photo-${index}-${photo}`}
                          type="button"
                          onClick={() => setDetailPreviewImage(resolveProductImageUrl(photo))}
                          title="사진 크게 보기"
                          style={{ flex: "0 0 76px", width: "76px", height: "76px", overflow: "hidden", padding: 0, border: "1px solid #E1D5D9", borderRadius: "9px", background: "#F1ECE8", cursor: "zoom-in" }}
                        >
                          <img src={resolveProductImageUrl(photo)} alt={`${brandDetailEditDraft.name} 사진 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 150px", gap: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>상품명
                  <input value={brandDetailEditDraft.name} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, name: event.target.value } : prev)} style={{ ...fieldInput, marginTop: "4px" }} />
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>상품구분
                  <input value={brandDetailEditDraft.category} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, category: event.target.value } : prev)} placeholder="상의, 하의, 세트…" style={{ ...fieldInput, marginTop: "4px" }} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>기본가 대비 추가금
                  <div style={{ position: "relative", marginTop: "4px" }}>
                    <input value={formatNumberWithComma(brandDetailEditDraft.plus)} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, plus: onlyNumber(event.target.value) } : prev)} inputMode="numeric" style={{ ...fieldInput, paddingRight: "28px" }} />
                    <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-mute)", fontSize: "12px" }}>원</span>
                  </div>
                </label>
                <div style={{ padding: "20px 11px 0", fontSize: "12px", color: "#7B2D43", fontWeight: 900 }}>
                  판매가 {(moneyNumber(priceText) + Math.max(0, Number(brandDetailEditDraft.plus) || 0)).toLocaleString("ko-KR")}원
                </div>
              </div>

              <div style={{ marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 900, color: "var(--color-ink)" }}>실제 색상·사이즈 조합</span>
                <button type="button" onClick={() => setBrandDetailEditDraft((prev) => prev ? { ...prev, variants: [...prev.variants, { color: "없음", size: "없음" }] } : prev)} style={{ border: "1px solid #D9C5CC", borderRadius: "7px", background: "#fff", color: "#7B2D43", padding: "5px 9px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>+ 조합 추가</button>
              </div>
              <div style={{ marginTop: "7px", display: "grid", gap: "6px", maxHeight: "280px", overflowY: "auto" }}>
                {brandDetailEditDraft.variants.map((variant, index) => (
                  <div key={`edit-variant-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 34px", gap: "6px", alignItems: "center" }}>
                    <input aria-label={`색상 ${index + 1}`} value={variant.color} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, variants: prev.variants.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item) } : prev)} placeholder="색상 없음이면 없음" style={fieldInput} />
                    <input aria-label={`사이즈 ${index + 1}`} value={variant.size} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, variants: prev.variants.map((item, itemIndex) => itemIndex === index ? { ...item, size: event.target.value } : item) } : prev)} placeholder="사이즈 없음이면 없음" style={fieldInput} />
                    <button type="button" disabled={brandDetailEditDraft.variants.length <= 1} onClick={() => setBrandDetailEditDraft((prev) => prev ? { ...prev, variants: prev.variants.filter((_, itemIndex) => itemIndex !== index) } : prev)} style={{ height: "34px", border: "none", borderRadius: "7px", background: "#FBEAE7", color: "#C0392B", cursor: brandDetailEditDraft.variants.length <= 1 ? "default" : "pointer", opacity: brandDetailEditDraft.variants.length <= 1 ? 0.4 : 1 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "7px", fontSize: "10.5px", color: "var(--color-ink-mute)" }}>색상이나 사이즈가 없는 상품은 `없음`으로 두세요. 존재하는 조합만 한 줄씩 등록됩니다.</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "11px 16px", borderTop: "1px solid #E8E2DD", background: "#F7F5F3" }}>
              <button type="button" onClick={() => setBrandDetailEditDraft(null)} style={{ padding: "8px 14px", border: "1px solid #E8E2DD", borderRadius: "8px", background: "#fff", color: "var(--color-ink)", cursor: "pointer" }}>취소</button>
              <button type="button" onClick={applyBrandDetailEditor} style={{ padding: "8px 15px", border: "none", borderRadius: "8px", background: "#0F6E56", color: "#fff", fontWeight: 900, cursor: "pointer" }}>변경내용 적용</button>
            </div>
          </div>
        </div>
      ) : null}

      {detailPreviewImage ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="확대 사진 닫기"
          onClick={() => setDetailPreviewImage("")}
          onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setDetailPreviewImage(""); }}
          style={{ position: "fixed", inset: 0, zIndex: 100003, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "zoom-out" }}
        >
          <img src={detailPreviewImage} alt="세부상품 확대 사진" style={{ maxWidth: "min(92vw, 920px)", maxHeight: "90vh", objectFit: "contain", borderRadius: "12px", background: "#fff", boxShadow: "0 18px 60px rgba(0,0,0,0.4)" }} />
        </div>
      ) : null}
    </div>
  );
}
