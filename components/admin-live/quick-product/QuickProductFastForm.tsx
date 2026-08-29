"use client";

import { ChangeEvent, type CSSProperties, DragEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { resolveProductImageUrl } from "./productImageUrl";
import { compressProductImage, isHeicLikeImage } from "./compressProductImage";
import {
  addDetailRow as addDetailRowState,
  removeDetailRow as removeDetailRowState,
  renameDetail as renameDetailState,
  setDetailAxis as setDetailAxisState,
  type BrandDetailState,
} from "@/lib/brandDetailTableOps";
import { brandWordmarkThumbnail, normalizeBrandKorean } from "@/lib/brandWordmarkThumbnail";
import { detailCode } from "@/lib/productDetailModel";

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
  hidden: boolean;
  photos: string[];
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
      // 일반 등록상품에서 손님이 주문 시 세부상품명을 한 줄 직접 입력하는 모드.
      // 기존 combo/brand_group 상품은 orders.product_name이 재고 식별자라 이 플래그를 사용하지 않는다.
      customer_detail_input_enabled?: boolean;
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
  const [customerDetailInputEnabled, setCustomerDetailInputEnabled] = useState(false);
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
  // [2026-08-29 사장님 요청] 세부상품 사진을 모달 안 열고 카드에 바로 끌어다 놓기 / 붙여넣기
  // [2026-08-29] 저장 안 하고 닫으면 입력이 통째로 날아가던 문제 — 값이 바뀌었으면 확인하고 닫는다.
  const [formTouched, setFormTouched] = useState(false);
  // [2026-08-29 사장님 요청] 등록하면서 손님 화면이 어떻게 보이는지 바로 확인
  const [previewOpen, setPreviewOpen] = useState(true);
  const [photoHoverTarget, setPhotoHoverTarget] = useState("");  // 붙여넣기(Ctrl+V) 대상 카드
  const bulkDetailPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const bulkDetailPhotoTargetRef = useRef("");
  const [brandDetailPhotoUploading, setBrandDetailPhotoUploading] = useState(false);
  const brandDetailPhotoInputRef = useRef<HTMLInputElement | null>(null);
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
  // [2026-08-29 사장님 요청] "무슨 상품이든 등록할 수 있어야 한다"
  //   예전에는 브랜드 묶음 상품(버버리·몽클레어처럼 세부상품 여러 개)을 엑셀로만 만들 수 있었다.
  //   → 폼에서도 새로 만들 수 있게 스위치를 둔다. 저장 형태는 엑셀로 만든 것과 완전히 같다.
  // [2026-08-29 개선 A] 세부상품 "실제 판매가"를 직접 입력 — 추가금은 시스템이 역산한다.
  //   치는 도중(예: "1" → "12" → "129000")에 값이 튀지 않도록 입력 중인 글자를 따로 들고 있는다.
  const [salePriceDraft, setSalePriceDraft] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [bulkRowBusy, setBulkRowBusy] = useState(false);
  const [bulkNamesOpen, setBulkNamesOpen] = useState(false);
  const [bulkNamesText, setBulkNamesText] = useState("");
  const [rowDropTarget, setRowDropTarget] = useState("");
  const bulkRowPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [brandGroupNew, setBrandGroupNew] = useState(false);
  const [brandKoText, setBrandKoText] = useState("");
  const [brandEnText, setBrandEnText] = useState("");
  const brandGroupActive = isBrandGroupEdit || brandGroupNew;
  const effectiveBrandKo = isBrandGroupEdit
    ? String(initialProductNote?.brand_group?.brand_ko || productName || "브랜드")
    : (brandKoText.trim() || productName.trim() || "브랜드");
  const effectiveBrandEn = isBrandGroupEdit
    ? String(initialProductNote?.brand_group?.brand_en || "")
    : brandEnText.trim();
  const brandWordmarkImage = brandGroupActive
    ? brandWordmarkThumbnail(effectiveBrandEn, effectiveBrandKo)
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
    setCustomerDetailInputEnabled(productNote?.customer_detail_input_enabled === true);
    setSuggestionKeywordsText(Array.isArray(productNote?.suggestion_keywords) ? productNote.suggestion_keywords.join(", ") : "");
    setBrandGroupDetailPhotoSets(normalizedPhotoSets);
    setBrandGroupDetailCategories(normalizedDetailCategories);
    setBrandGroupDetailOptions(normalizedDetailOptions);
    setBrandDetailEditDraft(null);
    setBrandDetailSearch("");
    setBrandDetailCategoryFilter("전체");
    setFormTouched(false);
    setBrandGroupNew(false);
    setBrandKoText("");
    setBrandEnText("");

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
      const directUrl = String(photosRaw[name] ?? "").trim();
      const setUrl = Array.isArray(normalizedPhotoSets[name]) ? String(normalizedPhotoSets[name][0] || "").trim() : "";
      const url = directUrl || setUrl;
      if (url) nextPhotos[name] = url;
    }
    setDetailPhotos(nextPhotos);
  }, [initialProduct]);

  const details = useMemo(() => unique(splitOptions(detailText)), [detailText]);

  const colors = useMemo(() => unique(splitOptions(colorText)), [colorText]);
  const sizes = useMemo(() => unique(splitOptions(sizeText)), [sizeText]);
  const customerDetailInputUnavailable = details.length > 0 || brandGroupActive;
  const brandGroupDetailPhotoCount = Object.values(brandGroupDetailPhotoSets).reduce((sum, photos) => sum + photos.length, 0);
  const brandDetailCategories = useMemo(
    () => unique(details.map((name) => String(brandGroupDetailCategories[name] || "").trim()).filter(Boolean)),
    [details, brandGroupDetailCategories],
  );
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
    if (brandGroupActive) return variantRows;
    return buildVariantRows(details, colors, sizes, variantRows);
  }, [details, colors, sizes, stockMode, variantRows, brandGroupActive]);

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
    // [2026-08-29] 예전에는 저장 버튼을 눌러야 "/ 를 쓸 수 없다"는 걸 알았다 → 치는 즉시 알려준다.
    //   세부상품 + 색상을 같이 쓰면 재고를 "세부상품 / 색상" 으로 관리해서 충돌한다.
    if (v.includes("/")) return { text: "⚠ / 는 쓸 수 없어요", color: "var(--color-danger-tx)" };
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
    const baseRows = brandGroupActive ? variantRows : buildVariantRows(details, colors, sizes, variantRows);
    const nextRows = baseRows.map((row) =>
      row.key === targetKey ? { ...row, stock } : row,
    );

    setVariantRows(nextRows);
  };

  // [2026-08-10] 조합이 많아지면(3단은 최대 수십 줄) 한 칸씩 못 채우므로 일괄 적용을 둔다.
  const [bulkStockText, setBulkStockText] = useState("10");
  const applyBulkStock = () => {
    const n = Math.max(0, Math.floor(Number(String(bulkStockText).replace(/[^0-9]/g, "")) || 0));
    const baseRows = brandGroupActive ? variantRows : buildVariantRows(details, colors, sizes, variantRows);
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
      hidden: detailHidden.includes(name),
      photos: [...(brandGroupDetailPhotoSets[name] || (detailPhotos[name] ? [detailPhotos[name]] : []))],
      variants,
    });
  };

  // [2026-08-29 사장님 요청] 예전에는 브랜드 상품에 세부상품을 "새로 추가"할 방법이 아예 없었다.
  //   (엑셀로 만든 것만 수정 가능 = 새 상품이 들어오면 엑셀을 다시 돌려야 했다)
  //   → 같은 수정창을 빈 상태로 열어서 새로 하나 만들 수 있게 한다.
  const openBrandDetailEditorForNew = () => {
    // 이미 있는 세부상품의 색상·사이즈 구성을 기본값으로 가져온다(대부분 같은 구성이라 손이 덜 감).
    const sample = details.map((n) => brandGroupDetailOptions[n]).find((cfg) => cfg && (cfg.variants || []).length > 0);
    const variants = sample && Array.isArray(sample.variants) && sample.variants.length > 0
      ? sample.variants.map((v) => ({ color: String(v.color || "없음"), size: String(v.size || "없음") }))
      : [{ color: "없음", size: "없음" }];
    setBrandDetailEditDraft({
      originalName: "",          // 빈 값 = 새로 만드는 중
      name: "",
      category: brandDetailCategoryFilter !== "전체" ? brandDetailCategoryFilter : "",
      plus: "0",
      hidden: false,
      photos: [],
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
    const isNewDetail = !oldName;
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
    // 새로 만든 것이면 목록 끝에 더하고, 이름만 바꾼 것이면 그 자리에서 갈아끼운다.
    setDetailText(
      isNewDetail
        ? [...details, nextName].join(", ")
        : details.map((name) => (name === oldName ? nextName : name)).join(", "),
    );
    setDetailPlus((prev) => moveKey(prev, String(Math.max(0, Number(brandDetailEditDraft.plus) || 0))));
    setDetailPhotos((prev) => moveKey(prev, brandDetailEditDraft.photos[0] || undefined));
    setBrandGroupDetailPhotoSets((prev) => moveKey(prev, brandDetailEditDraft.photos.length ? [...brandDetailEditDraft.photos] : undefined));
    setBrandGroupDetailCategories((prev) => moveKey(prev, brandDetailEditDraft.category.trim()));
    setBrandGroupDetailOptions((prev) => moveKey(prev, { colors, sizes, variants: nextVariants }));
    setDetailHidden((prev) => {
      const withoutEdited = prev.filter((name) => name !== oldName && name !== nextName);
      return brandDetailEditDraft.hidden
        ? [...withoutEdited, nextName]
        : withoutEdited;
    });

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
    setFormTouched(true);
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
      setBrandGroupDetailPhotoSets((prev) => { const existing=Array.isArray(prev[name])?prev[name]:[]; return { ...prev, [name]: [url, ...existing.filter((item)=>item!==url)] }; });
    } catch (error) {
      showAdminToast("세부상품 사진 업로드 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setDetailPhotoUploading("");
    }
  };

  // [2026-08-29 개선 A] 판매가를 입력하면 추가금을 역산해서 저장한다.
  //   저장되는 값은 예전과 똑같이 "추가금"이다. 계산식(실제가 = 대표가 + 추가금)은 바뀌지 않는다.
  //   대표가보다 낮은 판매가는 추가금이 음수가 되어 저장할 수 없으므로 적용하지 않고 빨간 글씨로 알린다.
  const applySalePrice = (detailName: string, typed: string) => {
    setFormTouched(true);
    setSalePriceDraft((prev) => ({ ...prev, [detailName]: typed }));
    const digits = String(typed || "").replace(/[^0-9]/g, "");
    if (!digits) {
      setDetailPlus((prev) => ({ ...prev, [detailName]: "" }));
      return;
    }
    const sale = Number(digits) || 0;
    const base = moneyNumber(priceText);
    if (sale < base) return;                       // 음수 추가금은 만들지 않는다
    setDetailPlus((prev) => ({ ...prev, [detailName]: String(sale - base) }));
  };

  const clearSalePriceDraft = (detailName: string) => {
    setSalePriceDraft((prev) => { const next = { ...prev }; delete next[detailName]; return next; });
  };

  // [2026-08-29] 저장하지 않고 닫으려 하면 한 번 물어본다(예전에는 그냥 날아갔다).
  const requestClose = async () => {
    if (!formTouched) { onClose?.(); return; }
    const ok = await showAdminConfirm(
      "저장하지 않고 닫을까요?\n\n지금까지 바꾼 내용(사진 포함)은 저장되지 않습니다.",
      { title: "저장 안 하고 닫기", confirmText: "닫기", cancelText: "계속 편집", tone: "danger" },
    );
    if (ok) onClose?.();
  };

  // [2026-08-29] 사진 파일 여러 장을 한 번에 올리는 공용 함수.
  //   기존 업로드 API·압축 로직을 그대로 쓴다(경로/버킷/용량 규칙 무변경).
  const uploadImageFiles = async (files: File[], kind: "cover" | "detail") => {
    const urls: string[] = [];
    for (const file of files) {
      const optimizedFile = await compressProductImage(file, kind);
      const formData = new FormData();
      formData.append("file", optimizedFile);
      formData.append("kind", kind);
      const response = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "이미지 업로드 실패");
      const url = String(payload?.url || payload?.publicUrl || payload?.path || "").trim();
      if (!url) throw new Error("이미지 주소를 받지 못했어요");
      urls.push(url);
    }
    return urls;
  };

  // [2026-08-29] 세부상품 카드에 사진 여러 장 붙이기 (드래그·붙여넣기·파일선택 공통).
  //   첫 장이 대표사진이 되고, 이미 사진이 있으면 뒤에 이어붙인다.
  const addDetailPhotos = async (name: string, fileList: File[]) => {
    const files = fileList.filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!name || files.length === 0) return;
    if (detailPhotoUploading) return;

    setDetailPhotoUploading(name);
    try {
      const urls = await uploadImageFiles(files, "cover");
      if (urls.length === 0) return;
      setBrandGroupDetailPhotoSets((prev) => {
        const existing = Array.isArray(prev[name]) ? prev[name] : [];
        return { ...prev, [name]: Array.from(new Set([...existing, ...urls])) };
      });
      setDetailPhotos((prev) => (prev[name] ? prev : { ...prev, [name]: urls[0] }));
      setFormTouched(true);
      showAdminToast(`${name} — 사진 ${urls.length}장 추가됐어요. 아직 저장 전이니 아래 [저장]을 눌러 주세요.`, "success");
    } catch (error) {
      showAdminToast("세부상품 사진 업로드 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setDetailPhotoUploading("");
    }
  };

  const handleBulkDetailPhotoInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const name = bulkDetailPhotoTargetRef.current;
    bulkDetailPhotoTargetRef.current = "";
    await addDetailPhotos(name, files);
  };

  const removeDetailPhoto = (name: string) => {
    setFormTouched(true);
    const current = String(detailPhotos[name] || "").trim();
    const remaining = (brandGroupDetailPhotoSets[name] || []).filter((url) => url && url !== current);
    setBrandGroupDetailPhotoSets((prev) => { const next={...prev}; if(remaining.length)next[name]=remaining; else delete next[name]; return next; });
    setDetailPhotos((prev) => { const next={...prev}; if(remaining[0])next[name]=remaining[0]; else delete next[name]; return next; });
  };

  const handleBrandDetailPhotoFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []); event.target.value = "";
    if (!brandDetailEditDraft || files.length === 0) return;
    setBrandDetailPhotoUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const optimizedFile = await compressProductImage(file, "detail");
        const formData = new FormData(); formData.append("file", optimizedFile); formData.append("kind", "detail");
        const response = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: formData });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "이미지 업로드 실패");
        const url = String(payload?.url || payload?.publicUrl || payload?.path || "").trim(); if (!url) throw new Error("이미지 주소를 받지 못했어요"); urls.push(url);
      }
      setBrandDetailEditDraft(prev => prev ? { ...prev, photos: Array.from(new Set([...prev.photos, ...urls])) } : prev);
    } catch (error) { showAdminToast("세부상품 상세사진 업로드 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error"); } finally { setBrandDetailPhotoUploading(false); }
  };

  const toggleDetailHidden = (name: string) => {
    setDetailHidden((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  // ── [2026-08-29] 표에서 바로 고치기 위한 공용 함수들 ─────────────────────
  //   예전에는 세부상품 하나 고치려면 카드클릭 → 창 → 적용 → 저장 을 왕복해야 했다.
  //   아래 함수들이 그 왕복 없이 표 안에서 바로 값을 바꾼다.
  //   ⚠️ 저장되는 형태(option_pricing · detail_options · stock_variants)는 창에서 고칠 때와 완전히 동일하다.

  // [2026-08-29] 표 편집의 "계산"은 lib/brandDetailTableOps.ts 로 빼놨다.
  //   화면 안에 있으면 시뮬레이션 검사를 돌릴 수 없기 때문이다.
  //   (scripts/test-brand-detail-table.mjs 가 이 함수들을 그대로 돌려서 검사한다)
  const collectDetailState = (): BrandDetailState => ({
    details,
    detailPlus,
    detailPhotos,
    photoSets: brandGroupDetailPhotoSets,
    categories: brandGroupDetailCategories,
    options: brandGroupDetailOptions,
    hidden: detailHidden,
    variantRows,
  });

  const applyDetailState = (next: BrandDetailState) => {
    setFormTouched(true);
    setDetailText(next.details.join(", "));
    setDetailPlus(next.detailPlus);
    setDetailPhotos(next.detailPhotos);
    setBrandGroupDetailPhotoSets(next.photoSets);
    setBrandGroupDetailCategories(next.categories);
    setBrandGroupDetailOptions(next.options);
    setDetailHidden(next.hidden);
    setVariantRows(next.variantRows);
  };

  // 세부상품 이름 바꾸기 — 이름이 재고 키의 앞부분이라 관련된 곳을 전부 같이 옮겨야 한다.
  const renameDetailEverywhere = (oldName: string, rawNext: string) => {
    const result = renameDetailState(collectDetailState(), oldName, rawNext);
    if (!result.ok) {
      if (result.reason !== "같은 이름입니다") showAdminToast(result.reason, "error");
      return false;
    }
    applyDetailState(result.state);
    return true;
  };

  // 색상 / 사이즈를 쉼표로 적으면 그 세부상품의 조합을 다시 만든다 (기존 수량은 살린다).
  const setDetailAxisValues = (name: string, axis: "colors" | "sizes", raw: string) => {
    applyDetailState(setDetailAxisState(collectDetailState(), name, axis, raw));
  };

  // 표에 새 줄 추가 — 색상·사이즈는 바로 윗줄 것을 물려받는다(대부분 같은 구성이라 손이 덜 감).
  const addDetailRow = (rawName?: string, salePrice?: number) => {
    const result = addDetailRowState(collectDetailState(), {
      name: rawName,
      salePrice,
      basePrice: moneyNumber(priceText),
    });
    applyDetailState(result.state);
    return result.name;
  };

  // 표에서 줄 지우기 (창 안 열고)
  const removeDetailRow = async (target: string) => {
    if (details.length <= 1) {
      showAdminToast("마지막 상품은 지울 수 없어요.\n상품 자체를 감추려면 아래 [고객 노출]을 끄세요.", "warning");
      return;
    }
    const confirmed = await showAdminConfirm(
      `"${target}" 을(를) 목록에서 뺄까요?\n\n손님 화면에서는 사라지지만 이미 들어온 주문은 그대로 있습니다.`,
      { title: "상품 빼기", confirmText: "빼기", cancelText: "취소", tone: "danger" },
    );
    if (!confirmed) return;
    const result = removeDetailRowState(collectDetailState(), target);
    if (!result.ok) { showAdminToast(result.reason, "warning"); return; }
    applyDetailState(result.state);
  };

  // 사진 여러 장을 한꺼번에 놓으면 → 장수만큼 줄을 만들고 파일 이름을 상품명으로 쓴다.
  //   거래처 사진이 보통 "BB-39.jpg" 처럼 코드명으로 오기 때문에 이게 제일 빠르다.
  const addRowsFromPhotoFiles = async (fileList: File[]) => {
    const files = fileList.filter((f) => f && String(f.type || "").startsWith("image/"));
    if (files.length === 0) return;
    setBulkRowBusy(true);
    try {
      for (const file of files) {
        const bare = String(file.name || "").replace(/\.[A-Za-z0-9]+$/, "").trim();
        const name = addDetailRow(bare || undefined);
        await addDetailPhotos(name, [file]);
      }
      showAdminToast(`사진 ${files.length}장으로 상품 ${files.length}줄을 만들었어요.\n가격만 채우고 저장하세요.`, "success");
    } finally {
      setBulkRowBusy(false);
    }
  };

  const deleteBrandDetail = async () => {
    if (!brandDetailEditDraft) return;

    const target = brandDetailEditDraft.originalName;

    if (details.length <= 1) {
      showAdminToast(
        "마지막 세부상품은 삭제할 수 없어요.\\n대표상품 자체의 숨김 기능을 사용해주세요.",
        "warning",
      );
      return;
    }

    const ok = await showAdminConfirm(
      `"${target}" 세부상품을 삭제할까요?\\n\\n고객 상품선택에서는 제거되지만 기존 주문내역은 삭제하지 않습니다.\\n등록된 원본 사진 파일도 안전을 위해 물리 삭제하지 않습니다.`,
      {
        title: "세부상품 삭제",
        confirmText: "삭제",
        cancelText: "취소",
        tone: "danger",
      },
    );

    if (!ok) return;

    const removeKey = <T,>(source: Record<string, T>) => {
      const next = { ...source };
      delete next[target];
      return next;
    };

    setDetailText(details.filter((name) => name !== target).join(", "));
    setDetailPlus((prev) => removeKey(prev));
    setDetailPhotos((prev) => removeKey(prev));
    setBrandGroupDetailPhotoSets((prev) => removeKey(prev));
    setBrandGroupDetailCategories((prev) => removeKey(prev));
    setBrandGroupDetailOptions((prev) => removeKey(prev));
    setDetailHidden((prev) => prev.filter((name) => name !== target));
    setVariantRows((prev) => prev.filter((row) => row.detail !== target));
    setBrandDetailEditDraft(null);

    showAdminToast(
      `"${target}" 삭제 내용을 편집화면에 반영했습니다.\\n상품 수정창 아래의 '저장' 버튼을 눌러야 최종 반영됩니다.`,
      "warning",
    );
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
    setCustomerDetailInputEnabled(false);
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
    setFormTouched(false);
    setBrandGroupNew(false);
    setBrandKoText("");
    setBrandEnText("");
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

    // [2026-08-29] 브랜드 묶음으로 켜두고 세부상품을 하나도 안 만들면
    //   손님 화면에 "고를 게 없는 브랜드 카드"만 뜬다. 저장 전에 막는다.
    if (brandGroupNew && details.length === 0) {
      showAdminToast(
        "브랜드 묶음 상품은 세부상품이 1개 이상 있어야 합니다.\n\n아래 [세부상품 관리]의 [＋ 세부상품 추가]로 먼저 만들어 주세요.",
        "error",
      );
      return;
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
      const needAxes = detailActive && (brandGroupActive || colors.length > 0 || sizes.length > 0);
      const optionAxesPayload = needAxes
        ? [
            { key: "detail" as const, label: detailLabel, values: details },
            ...((brandGroupActive ? brandColors : colors).length > 0 ? [{ key: "color" as const, label: "색상", values: brandGroupActive ? brandColors : colors }] : []),
            ...((brandGroupActive ? brandSizes : sizes).length > 0 ? [{ key: "size" as const, label: "사이즈", values: brandGroupActive ? brandSizes : sizes }] : []),
          ]
        : null;

      // 브랜드 대표상품의 엑셀 전용 구조는 일반 수정폼에서 새로 만들 수 없는 데이터다.
      // 수정 저장 시 세부상품별 옵션·다중사진·가져오기 식별자를 반드시 보존한다.
      const preservedBrandNote = brandGroupActive
        ? {
            brand_group: {
              ...(initialProductNote?.brand_group || {}),
              // [2026-08-29] 폼에서 새로 만드는 브랜드 묶음도 엑셀로 만든 것과 같은 형태로 저장한다.
              enabled: true,
              brand_ko: normalizeBrandKorean(String(initialProductNote?.brand_group?.brand_ko || effectiveBrandKo || name)),
              ...(effectiveBrandEn ? { brand_en: effectiveBrandEn } : {}),
              detail_categories: brandGroupDetailCategories,
              detail_options: brandGroupDetailOptions,
            },
            detail_photo_sets: brandGroupDetailPhotoSets,
            // [2026-08-29] 같은 디자인 묶기는 사장님 지시로 되돌렸다.
            //   여기서 design_groups 를 다시 넣지 않으므로, 이 상품을 한 번 저장하면
            //   예전에 남아 있던 묶음 데이터도 함께 사라진다(추가 작업 불필요).
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
        // 고객 세부상품명 직접입력은 일반 상품 전용.
        // 기존 세부상품 조합형/브랜드 대표상품은 product_name이 재고 식별자라 저장 단계에서도 강제로 OFF한다.
        customer_detail_input_enabled: !detailActive && !brandGroupActive && customerDetailInputEnabled,
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
        color_options: brandGroupActive
          ? exposedDetails
          : (detailActive && colors.length === 0 ? exposedDetails : colors),
        size_options: brandGroupActive ? brandSizes : sizes,
        color_option_enabled: brandGroupActive ? true : (detailActive ? true : colors.length > 0),
        size_option_enabled: brandGroupActive
          ? brandSizes.some((value) => value !== "없음")
          : sizes.length > 0,
        product_description: normalizeTextareaText(description).trim() || null,
        // 브랜드 대표상품은 이 배열에 전체 세부사진이 함께 들어 있다. 일반폼의 5장 제한으로 잘라 저장하지 않는다.
        detail_image_urls: brandGroupActive
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
          <span onClick={() => { void requestClose(); }} style={{ fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer", lineHeight: 1 }}>×</span>
        </div>

        {/* .modal-body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>

          {/* .top-row : 사진(120) + 필드 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: "14px", marginBottom: "14px" }}>
            {/* [2026-08-29] 모바일에선 1열로 떨어지는데 폭이 120px 로 고정돼 있어 화면이 어색했다 */}
            <div style={{ width: isMobile ? "100%" : "120px" }}>
              {brandGroupActive ? (
                // [2026-08-29] 예전에는 브랜드 상품이면 글자 썸네일로 고정돼 사진을 올릴 수가 없었다.
                //   → 사진을 올리면 그 사진을, 안 올리면 지금처럼 글자 썸네일을 쓴다.
                coverImages.length > 0 ? (
                  <div>
                    <ImagePicker label="" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={(next) => { setFormTouched(true); setCoverImages(next); }} triggerRef={coverUploadRef} />
                    <div style={{ marginTop: "5px", textAlign: "center", fontSize: "10px", lineHeight: 1.3, fontWeight: 800, color: "#0F6E56" }}>
                      올린 사진이 대표로 쓰입니다<br />
                      <span style={{ color: "var(--color-ink-mute)", fontWeight: 700 }}>지우면 글자 썸네일로 돌아감</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <img
                      src={brandWordmarkImage}
                      alt={`${effectiveBrandKo} 대표 썸네일`}
                      style={{ width: isMobile ? "100%" : "120px", maxWidth: "220px", height: "120px", display: "block", objectFit: "cover", borderRadius: "10px", border: "1px solid #E1D5D9", background: "#FFFDFB" }}
                    />
                    <div style={{ marginTop: "6px" }}>
                      <ImagePicker label="" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={(next) => { setFormTouched(true); setCoverImages(next); }} triggerRef={coverUploadRef} />
                    </div>
                    <div style={{ marginTop: "5px", textAlign: "center", fontSize: "10px", lineHeight: 1.3, fontWeight: 800, color: "#7B2D43" }}>
                      브랜드 글자 썸네일 자동 적용<br />
                      <span style={{ color: "var(--color-ink-mute)", fontWeight: 700 }}>사진을 올리면 그걸 씁니다</span>
                    </div>
                  </div>
                )
              ) : (
                <ImagePicker label="" value={coverImages} maxFiles={1} uploadKind="cover" mode="cover" onChange={(next) => { setFormTouched(true); setCoverImages(next); }} triggerRef={coverUploadRef} />
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
                  onChange={(e) => { setFormTouched(true); setProductName(e.target.value); if (nameError) setNameError(false); }}
                />
                {nameError ? <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-danger-tx)" }}>상품명은 필수입니다</div> : null}
              </div>
              <div>
                <label style={fieldLabel}>가격 <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-ink-mute)" }}>(비우면 손님 직접입력)</span></label>
                <div style={{ position: "relative" }}>
                  <input style={{ ...fieldInput, paddingRight: "30px", opacity: freeProductEnabled ? 0.45 : 1 }} type="text" inputMode="numeric" placeholder="59,000" value={freeProductEnabled ? "0" : priceText} disabled={freeProductEnabled} onChange={(e) => { setFormTouched(true); setPriceText(formatNumberWithComma(e.target.value)); }} />
                  <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "var(--color-ink-mute)", pointerEvents: "none" }}>원</span>
                </div>
                {/* [무료나눔 · 2026-07-22] 0원 상품 — "가격 비움(손님 직접입력)"과 구분되는 별도 플래그.
                    켜면 가격 0 고정 + note.free_product=true → 고객 주문서에서 이 상품만 0원 제출 허용 */}
                <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px", fontWeight: 700, color: freeProductEnabled ? "#0F6E56" : "var(--color-ink-mute)", cursor: "pointer" }}>
                  <input type="checkbox" checked={freeProductEnabled} onChange={(e) => setFreeProductEnabled(e.target.checked)} style={{ accentColor: "#0F6E56" }} />
                  🎁 무료나눔 상품 (0원 — 손님에게 선물)
                </label>
                {/* [2026-08-29] 세부상품 판매가는 "대표가 + 추가금"이라 대표가를 바꾸면 같이 움직인다.
                    모르고 바꾸면 여러 상품 값이 한꺼번에 틀어지므로 미리 알려준다. */}
                {details.length > 0 && !freeProductEnabled ? (
                  <div style={{ marginTop: "5px", fontSize: "10.5px", fontWeight: 800, color: "#8A5A00", lineHeight: 1.45 }}>
                    ⚠ 이 값을 바꾸면 세부상품 {details.length}개의 판매가가 <b>같이 움직입니다</b> (판매가 = 이 값 + 추가금)
                  </div>
                ) : null}
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

          {/* [2026-08-29 사장님 요청] 브랜드 묶음 상품 만들기
              예전에는 엑셀 대량등록으로만 만들 수 있었다(폼은 수정 전용).
              → 여기서 켜면 세부상품마다 사진·가격·색상·사이즈를 따로 넣는 브랜드 상품이 된다.
              이미 브랜드 상품을 수정 중일 때는 이 스위치를 보여주지 않는다(끄면 손님 화면이 깨지므로). */}
          {!isBrandGroupEdit ? (
            <div style={{ marginBottom: "14px", border: `1px solid ${brandGroupNew ? "#7B2D43" : "#E8E2DD"}`, borderRadius: "10px", background: brandGroupNew ? "#FFF9FB" : "var(--color-surface)", padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 900, color: "var(--color-ink)" }}>브랜드 묶음 상품</div>
                  <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginTop: "2px", lineHeight: 1.5 }}>
                    한 브랜드 아래에 <b>여러 상품</b>을 넣고, 상품마다 <b>사진·가격·색상·사이즈를 따로</b> 정합니다.
                    <br />손님은 <b>브랜드 → 상품 → 색상 → 사이즈</b> 순으로 고릅니다. (버버리·몽클레어처럼)
                  </div>
                </div>
                <div
                  onClick={() => { setFormTouched(true); setBrandGroupNew((v) => !v); }}
                  style={tgStyle(brandGroupNew)}
                ><span style={tgKnob(brandGroupNew)} /></div>
              </div>

              {brandGroupNew ? (
                <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={fieldLabel}>브랜드 이름 (한글)</label>
                    <input
                      style={fieldInput}
                      type="text"
                      placeholder="예: 버버리"
                      value={brandKoText}
                      onChange={(e) => { setFormTouched(true); setBrandKoText(e.target.value); }}
                    />
                  </div>
                  <div>
                    <label style={fieldLabel}>브랜드 이름 (영문) <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-ink-mute)" }}>(썸네일용·선택)</span></label>
                    <input
                      style={fieldInput}
                      type="text"
                      placeholder="예: BURBERRY"
                      value={brandEnText}
                      onChange={(e) => { setFormTouched(true); setBrandEnText(e.target.value); }}
                    />
                  </div>
                  <div style={{ gridColumn: isMobile ? "auto" : "1 / -1", fontSize: "11px", fontWeight: 800, color: details.length === 0 ? "#C0392B" : "#0F6E56", lineHeight: 1.5 }}>
                    {details.length === 0
                      ? "· 아래 [세부상품 관리]의 [＋ 세부상품 추가]로 상품을 1개 이상 만들어야 저장됩니다."
                      : `· 세부상품 ${details.length}개 등록됨. 대표사진은 브랜드 썸네일이 자동으로 들어갑니다.`}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* [2026-08-29 사장님 요청] 손님 화면 미리보기
              예전에는 등록을 마치고 주문서를 직접 열어봐야 어떻게 보이는지 알 수 있었다.
              → 지금 입력 중인 값 그대로, 손님 상품목록에 나올 카드를 그 자리에서 보여준다.
              ⚠️ 표시 전용이다. 저장되는 값과 계산식은 건드리지 않는다. */}
          <div style={{ marginBottom: "14px", border: "1px solid #D9C5CC", borderRadius: "10px", background: "#FFF9FB", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "8px 11px", border: "none", background: "transparent", cursor: "pointer" }}
            >
              <span style={{ fontSize: "12px", fontWeight: 900, color: "#7B2D43" }}>👀 손님 화면 미리보기</span>
              <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-ink-mute)" }}>{previewOpen ? "접기 ▲" : "펴기 ▼"}</span>
            </button>

            {previewOpen ? (() => {
              // 손님 목록 카드와 같은 기준으로 값 만들기
              const basePrice = freeProductEnabled ? 0 : moneyNumber(priceText);
              const plusList = details.map((n) => Math.max(0, Number(detailPlus[n]) || 0));
              const minPlus = plusList.length > 0 ? Math.min(...plusList) : 0;
              const maxPlus = plusList.length > 0 ? Math.max(...plusList) : 0;
              const lowest = basePrice + minPlus;

              const priceText2 = brandGroupActive
                ? `최저가 ${lowest.toLocaleString("ko-KR")}원 부터 ~`
                : freeProductEnabled
                  ? "0원 · 🎁 무료나눔"
                  : basePrice > 0
                    ? maxPlus > 0
                      ? `${lowest.toLocaleString("ko-KR")}원 ~`
                      : `${basePrice.toLocaleString("ko-KR")}원`
                    : "가격 직접입력";

              const uploadedCover = resolveProductImageUrl(coverImages[0] || "");
              const cover = brandGroupActive
                ? (uploadedCover || brandWordmarkImage)
                : resolveProductImageUrl(coverImages[0] || detailImages[0] || Object.values(detailPhotos)[0] || "");

              const badgeChip = (bg: string, color: string, text: string) => (
                <span key={text} style={{ fontSize: "9px", fontWeight: 800, color, background: bg, borderRadius: "4px", padding: "2px 5px" }}>{text}</span>
              );

              return (
                <div style={{ padding: "0 11px 11px" }}>
                  <div style={{ border: "1px solid #EFE6DE", borderRadius: "12px", background: "#fff", padding: "11px", display: "flex", gap: "10px", alignItems: "center" }}>
                    <div style={{ width: "68px", height: "68px", flexShrink: 0, borderRadius: "9px", overflow: "hidden", background: "#F0EBE8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {cover
                        ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: "9px", fontWeight: 800, color: "#B0A5A9" }}>사진 없음</span>}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginBottom: "3px" }}>
                        {badgeTypes.includes("new") ? badgeChip("#E7F3EE", "#0F6E56", "NEW") : null}
                        {badgeTypes.includes("hot") ? badgeChip("#FBEAE7", "#C0392B", "HOT") : null}
                        {badgeTypes.includes("limit") ? badgeChip("#FBF1E0", "#854F0B", "한정") : null}
                        {badgeTypes.includes("pick") ? badgeChip("#FFF8E7", "#B8860B", "⭐ MD픽") : null}
                        {badgeTypes.includes("direct") ? badgeChip("#E8F0FE", "#1D4ED8", "🛒 바로구매") : null}
                        {badgeTypes.includes("overseas") ? badgeChip("#EEF6F3", "#0F6E56", "✈️ 해외배송") : null}
                        {freeProductEnabled ? badgeChip("#E7F3EE", "#0F6E56", "🎁 무료나눔") : null}
                        {shippingType !== "normal" ? badgeChip("#EEF2FA", "#3B5BA5", "🚚 업체배송") : null}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {productName.trim() || "상품명을 입력하세요"}
                      </div>
                      {details.length > 1 ? (
                        <div style={{ fontSize: "10.5px", color: "#8A8A8A", marginTop: "2px" }}>
                          {brandGroupActive
                            ? `세부상품 ${details.length - detailHidden.length}가지 · 상품별 금액이 달라요`
                            : `종류 ${details.length}가지 · 눌러서 선택`}
                        </div>
                      ) : null}
                      <div style={{ marginTop: "4px", fontSize: "15px", fontWeight: 800, color: "#7A1E47" }}>{priceText2}</div>
                    </div>
                    <div style={{ flexShrink: 0, height: "30px", padding: "0 13px", borderRadius: "7px", background: "#7A1E47", color: "#fff", fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center" }}>
                      {details.length > 1 || colors.length > 0 || sizes.length > 0 ? "상품 선택" : "장바구니 담기"}
                    </div>
                  </div>

                  {/* 손님이 못 보는 상태를 미리 알려준다 */}
                  <div style={{ marginTop: "7px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {!productName.trim() ? <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#C0392B" }}>· 상품명이 없으면 저장되지 않습니다</span> : null}
                    {!brandGroupActive && !cover ? <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#8A5A00" }}>· 사진이 없어 손님 목록에 회색 네모로 보입니다</span> : null}
                    {!isVisible ? <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#8A5A00" }}>· 고객 노출이 꺼져 있어 손님 화면에 아예 안 보입니다</span> : null}
                    {details.length > 0 && detailHidden.length === details.length ? <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#C0392B" }}>· 세부상품이 전부 숨김이라 손님이 고를 수 있는 게 없습니다</span> : null}
                  </div>
                </div>
              );
            })() : null}
          </div>

          {/* [2026-08-11] 카테고리·뱃지는 기본 접힘 — 방송 중엔 옵션·재고가 먼저 보이게 */}
          {!extraOpen ? (
            <div style={{ marginBottom: "12px" }}>
              <button
                type="button"
                onClick={() => setExtraOpen(true)}
                style={{ width: "100%", padding: "9px", border: "1px dashed #D9C5CC", background: "var(--color-surface)", color: "#7B2D43", fontSize: "12px", fontWeight: 800, borderRadius: "8px", cursor: "pointer" }}
              >
                ＋ 카테고리 · 상품 뱃지 {category.trim() || badgeTypes.length > 0 ? `(${[category.trim(), category.trim() && !customerCategoryVisible ? "고객 버튼 숨김" : "", badgeTypes.length ? `뱃지 ${badgeTypes.length}` : ""].filter(Boolean).join(" · ")})` : "(선택)"}
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

              {brandGroupActive ? (
                <div style={{ padding: "9px 10px", marginBottom: "8px", borderRadius: "8px", background: "#EEF6F3", border: "1px solid #CFE4DB", fontSize: "11.5px", lineHeight: 1.55, color: "#0F6E56" }}>
                  <b>브랜드 대표상품 · 세부상품 {details.length}개</b><br />
                  색상과 사이즈는 상품마다 다르게 저장되어 있어요. 아래 목록에는 각 상품에 실제 등록된 옵션만 표시됩니다.
                </div>
              ) : null}

              {/* 슬롯 1 — 세부상품(라벨 변경 가능). A-1 / A-2 / A-3 처럼 한 상품 안의 여러 상품 */}
              <div style={brandGroupActive ? { ...optRow, display: "none" } : optRow}>
                <span style={optLabel}>세부상품</span>
                <input style={optInput} type="text" placeholder="A-1, A-2, A-3 (쉼표로 구분)" value={detailText} onChange={(e) => { setFormTouched(true); setDetailText(e.target.value); }} />
                {!detailText.trim() ? <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-ink-mute)", whiteSpace: "nowrap" }}>🚫 사용 안 함</span> : null}
              </div>

              {/* 슬롯 2 — 색상 */}
              <div style={brandGroupActive ? { ...optRow, display: "none" } : optRow}>
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
              <div style={brandGroupActive ? { ...optRow, display: "none" } : optRow}>
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

              {/* ── [2026-08-29 재설계] 이 브랜드의 상품 — 표에서 바로 고친다 ──
                  예전: 카드 클릭 → 창 뜸 → 고침 → [변경내용 적용] → 창 닫음 → 또 [저장]  (상품 20개면 20번)
                  지금: 표에서 칸을 누르면 그 자리에서 고쳐진다. 창은 색상·사이즈를 세밀하게 손볼 때만 연다.
                  저장되는 형태는 창에서 고칠 때와 완전히 동일하다. */}
              {brandGroupActive ? (
                <div style={{ marginTop: "10px", borderTop: "1px solid #E8E2DD", paddingTop: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "9px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 900, color: "var(--color-ink)" }}>이 브랜드의 상품</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F6E56" }}>{details.length}개 · 사진 {brandGroupDetailPhotoCount}장</span>
                  </div>

                  {/* 사진 몽땅 놓기 — 장수만큼 줄이 생기고 파일 이름이 상품명이 된다 */}
                  <div
                    onDragOver={(event) => { event.preventDefault(); setRowDropTarget("__bulk__"); }}
                    onDragLeave={() => setRowDropTarget((prev) => (prev === "__bulk__" ? "" : prev))}
                    onDrop={(event) => {
                      event.preventDefault();
                      setRowDropTarget("");
                      void addRowsFromPhotoFiles(Array.from(event.dataTransfer?.files || []));
                    }}
                    onClick={() => bulkRowPhotoInputRef.current?.click()}
                    style={{
                      cursor: "pointer", textAlign: "center", borderRadius: "11px", padding: "16px 12px", marginBottom: "9px",
                      border: `2px dashed ${rowDropTarget === "__bulk__" ? "#0F6E56" : "#D9C5CC"}`,
                      background: rowDropTarget === "__bulk__" ? "#EAF6F1" : "#FBF7F9",
                    }}
                  >
                    <div style={{ fontSize: "12.5px", fontWeight: 900, color: "#7B2D43" }}>
                      {bulkRowBusy ? "사진 올리는 중…" : "📸 사진을 여기에 몽땅 끌어다 놓으세요"}
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.6 }}>
                      놓은 장수만큼 줄이 자동으로 생기고, <b>파일 이름이 상품명</b>으로 들어갑니다 (BB-39.jpg → BB-39)
                    </div>
                  </div>
                  <input
                    ref={bulkRowPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void addRowsFromPhotoFiles(files); }}
                    style={{ display: "none" }}
                  />

                  {details.length === 0 ? (
                    <div style={{ padding: "20px 14px", textAlign: "center", border: "2px dashed #D9C5CC", borderRadius: "11px", background: "var(--color-surface)" }}>
                      <div style={{ fontSize: "13px", fontWeight: 900, color: "#7B2D43" }}>아직 상품이 없습니다</div>
                      <div style={{ marginTop: "5px", fontSize: "11.5px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.6 }}>
                        위에 사진을 놓거나, 아래 [＋ 한 줄 추가]를 누르세요.
                      </div>
                    </div>
                  ) : (
                    <div
                      onPaste={(event) => {
                        const files = Array.from(event.clipboardData?.files || []).filter((f) => String(f.type || "").startsWith("image/"));
                        if (files.length === 0) return;
                        event.preventDefault();
                        // 마우스가 어느 줄 위에 있으면 그 줄에, 아니면 새 줄을 만든다.
                        if (photoHoverTarget) void addDetailPhotos(photoHoverTarget, files);
                        else void addRowsFromPhotoFiles(files);
                      }}
                      style={{ border: "1px solid #E8E2DD", borderRadius: "11px", overflow: "hidden", background: "var(--color-surface)" }}
                    >
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "560px" }}>
                          <thead>
                            <tr style={{ background: "#F7F2F4" }}>
                              {["사진", "상품명", "판매가", "색상", "사이즈", ""].map((h, i) => (
                                <th
                                  key={`h-${i}`}
                                  style={{
                                    textAlign: i === 2 ? "right" : "left", fontSize: "10px", fontWeight: 900,
                                    color: "var(--color-ink-mute)", letterSpacing: "0.04em", padding: "8px 8px", whiteSpace: "nowrap",
                                    width: i === 0 ? "56px" : i === 2 ? "104px" : i === 3 ? "104px" : i === 4 ? "116px" : i === 5 ? "70px" : undefined,
                                  }}
                                >{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {details.map((name) => {
                              const photos = brandGroupDetailPhotoSets[name] || (detailPhotos[name] ? [detailPhotos[name]] : []);
                              const thumbnail = photos[0] || detailPhotos[name] || "";
                              const off = detailHidden.includes(name);
                              const base = moneyNumber(priceText);
                              const plusNow = Math.max(0, Number(detailPlus[name]) || 0);
                              const draft = salePriceDraft[name];
                              const shownPrice = draft !== undefined
                                ? formatNumberWithComma(draft)
                                : (detailPlus[name] === "" ? "" : formatNumberWithComma(String(base + plusNow)));
                              const typedNum = Number(String(draft ?? "").replace(/[^0-9]/g, "")) || 0;
                              const tooLow = draft !== undefined && String(draft).trim() !== "" && typedNum < base;
                              const cfg = brandGroupDetailOptions[name] || { colors: [], sizes: [], variants: [] };
                              const cellStyle: CSSProperties = {
                                width: "100%", height: "34px", padding: "0 8px", borderRadius: "8px",
                                border: "1.5px solid transparent", background: "transparent",
                                color: "var(--color-ink)", fontSize: "12px", fontWeight: 700, outline: "none",
                              };
                              return (
                                <tr
                                  key={`row-${name}`}
                                  onMouseEnter={() => setPhotoHoverTarget(name)}
                                  onMouseLeave={() => setPhotoHoverTarget((prev) => (prev === name ? "" : prev))}
                                  style={{ borderTop: "1px solid #EFE7EA", opacity: off ? 0.45 : 1, background: photoHoverTarget === name ? "#FBF7F9" : "transparent" }}
                                >
                                  <td style={{ padding: "6px 8px" }}>
                                    <div
                                      title="사진 끌어놓기 · 클릭하면 여러 장 고르기 · 우클릭하면 대표사진 빼기"
                                      onClick={() => { bulkDetailPhotoTargetRef.current = name; bulkDetailPhotoInputRef.current?.click(); }}
                                      onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (!thumbnail) return;
                                        void (async () => {
                                          const ok = await showAdminConfirm(`"${name}" 대표사진을 뺄까요?`, { title: "사진 빼기", confirmText: "빼기", cancelText: "취소", tone: "danger" });
                                          if (ok) removeDetailPhoto(name);
                                        })();
                                      }}
                                      onDragOver={(event) => { event.preventDefault(); setRowDropTarget(name); }}
                                      onDragLeave={() => setRowDropTarget((prev) => (prev === name ? "" : prev))}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        setRowDropTarget("");
                                        void addDetailPhotos(name, Array.from(event.dataTransfer?.files || []));
                                      }}
                                      style={{
                                        position: "relative", width: "46px", height: "46px", borderRadius: "9px", cursor: "pointer",
                                        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                                        border: rowDropTarget === name ? "2px dashed #0F6E56" : thumbnail ? "1px solid #E8E2DD" : "1.5px dashed #C9A8B4",
                                        background: rowDropTarget === name ? "#EAF6F1" : thumbnail ? "#F1ECE8" : "var(--color-surface-2)",
                                        fontSize: "14px", fontWeight: 800, color: "#B08A99",
                                      }}
                                    >
                                      {detailPhotoUploading === name ? "…" : thumbnail ? (
                                        <>
                                          <img src={resolveProductImageUrl(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                          {photos.length > 1 ? (
                                            <span style={{ position: "absolute", right: "2px", bottom: "2px", background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: "8px", fontWeight: 900, borderRadius: "5px", padding: "1px 4px" }}>{photos.length}</span>
                                          ) : null}
                                        </>
                                      ) : "＋"}
                                    </div>
                                  </td>

                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      style={cellStyle}
                                      value={nameDraft[name] ?? name}
                                      placeholder="상품명"
                                      onChange={(event) => setNameDraft((prev) => ({ ...prev, [name]: event.target.value }))}
                                      onBlur={(event) => {
                                        const next = event.target.value;
                                        setNameDraft((prev) => { const copy = { ...prev }; delete copy[name]; return copy; });
                                        renameDetailEverywhere(name, next);
                                      }}
                                      onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>

                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      style={{ ...cellStyle, textAlign: "right", fontWeight: 800, borderColor: tooLow ? "#C0392B" : "transparent" }}
                                      inputMode="numeric"
                                      placeholder="판매가"
                                      title="손님이 실제로 내는 금액"
                                      value={shownPrice}
                                      onFocus={(event) => { const t = event.currentTarget; requestAnimationFrame(() => t.select()); }}
                                      onChange={(event) => applySalePrice(name, event.target.value)}
                                      onBlur={() => clearSalePriceDraft(name)}
                                    />
                                    <div style={{ fontSize: "9px", fontWeight: 800, textAlign: "right", paddingRight: "8px", color: tooLow ? "#C0392B" : "var(--color-ink-mute)" }}>
                                      {tooLow ? "대표가보다 낮음" : `추가금 +${plusNow.toLocaleString("ko-KR")}`}
                                    </div>
                                  </td>

                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      style={cellStyle}
                                      placeholder="블랙"
                                      defaultValue={(cfg.colors || []).join(", ")}
                                      key={`c-${name}-${(cfg.colors || []).join(",")}`}
                                      onBlur={(event) => setDetailAxisValues(name, "colors", event.target.value)}
                                      onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>

                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      style={cellStyle}
                                      placeholder="S,M,L"
                                      defaultValue={(cfg.sizes || []).join(", ")}
                                      key={`s-${name}-${(cfg.sizes || []).join(",")}`}
                                      onBlur={(event) => setDetailAxisValues(name, "sizes", event.target.value)}
                                      onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>

                                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                    <button
                                      type="button"
                                      title={off ? "숨김 — 누르면 손님에게 보임" : "보이는 중 — 누르면 숨김"}
                                      onClick={() => { setFormTouched(true); toggleDetailHidden(name); }}
                                      style={{ width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", border: `1px solid ${off ? "#E1D5D9" : "#BFE3D5"}`, background: off ? "var(--color-surface-2)" : "#EAF6F1", color: off ? "var(--color-ink-mute)" : "#0F6E56" }}
                                    >{off ? "🚫" : "👁"}</button>
                                    <button
                                      type="button"
                                      title="색상·사이즈 조합을 자세히 손보기"
                                      onClick={() => openBrandDetailEditor(name)}
                                      style={{ marginLeft: "4px", width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", border: "1px solid #E1D5D9", background: "var(--color-surface)", color: "var(--color-ink-mute)" }}
                                    >⋯</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", padding: "9px 10px", borderTop: "1px solid #EFE7EA", background: "#F7F2F4" }}>
                        <button
                          type="button"
                          onClick={() => { addDetailRow(); }}
                          style={{ border: "none", borderRadius: "8px", background: "#7B2D43", color: "#fff", padding: "8px 13px", fontSize: "11.5px", fontWeight: 900, cursor: "pointer" }}
                        >＋ 한 줄 추가</button>
                        <button
                          type="button"
                          onClick={() => {
                            const last = details[details.length - 1];
                            if (!last) { addDetailRow(); return; }
                            const base = moneyNumber(priceText);
                            const plus = Math.max(0, Number(detailPlus[last]) || 0);
                            addDetailRow(undefined, base + plus);
                          }}
                          style={{ border: "1px solid #D9C5CC", borderRadius: "8px", background: "var(--color-surface)", color: "var(--color-ink)", padding: "8px 12px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
                        >⧉ 윗줄 복제</button>
                        <button
                          type="button"
                          onClick={() => { setBulkNamesText(""); setBulkNamesOpen(true); }}
                          style={{ border: "1px solid #D9C5CC", borderRadius: "8px", background: "var(--color-surface)", color: "var(--color-ink)", padding: "8px 12px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
                        >📋 이름 여러 개 붙여넣기</button>
                        <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>칸을 누르면 바로 고쳐집니다</span>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: "7px", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.6 }}>
                    사진칸: <b>끌어놓기</b> · <b>클릭</b>하면 여러 장 고르기 · <b>우클릭</b>하면 대표사진 빼기<br />
                    <b>Ctrl+V</b>: 줄 위에 마우스를 올린 채 붙여넣으면 그 줄에, 그냥 붙여넣으면 새 줄이 생깁니다 · <b>⋯</b> 는 색상·사이즈 조합을 자세히 손볼 때
                  </div>
                </div>
              ) : null}

              {usedAxisCount === 0 && !brandGroupActive ? (
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
                            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 100px 34px", gap: "6px", alignItems: "center", background: "#F5E6EB", borderRadius: "6px", padding: "5px 8px", marginBottom: "3px" }}>
                              {/* [2026-08-11] 세부상품별 대표사진 — 손님이 종류 고를 때 사진으로 구분 (스마트스토어·쿠팡의 옵션별 이미지와 동일 개념) */}
                              <button
                                type="button"
                                onClick={() => pickDetailPhoto(group.detail)}
                                title={detailPhotos[group.detail] ? "사진 바꾸기 (우클릭하면 삭제)" : "이 세부상품 사진 넣기"}
                                onContextMenu={(e) => {
                                  // [2026-08-29] 예전에는 우클릭하면 확인 없이 바로 지워져서 실수로 날아갔다.
                                  e.preventDefault();
                                  if (!detailPhotos[group.detail]) return;
                                  void (async () => {
                                    const ok = await showAdminConfirm(`"${group.detail}" 대표사진을 뺄까요?`, { title: "세부상품 사진 빼기", confirmText: "빼기", cancelText: "취소", tone: "danger" });
                                    if (ok) removeDetailPhoto(group.detail);
                                  })();
                                }}
                                style={{ width: "36px", height: "36px", borderRadius: "7px", border: detailPhotos[group.detail] ? "none" : "1.5px dashed #C9A8B4", background: detailPhotos[group.detail] ? `center/cover no-repeat url(${JSON.stringify(resolveProductImageUrl(detailPhotos[group.detail]))})` : "var(--color-surface)", cursor: "pointer", padding: 0, fontSize: "14px", fontWeight: 800, color: "#B08A99", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}
                              >
                                {detailPhotoUploading === group.detail ? "…" : detailPhotos[group.detail] ? "" : "＋"}
                              </button>
                              <span style={{ minWidth: 0, opacity: detailHidden.includes(group.detail) ? 0.5 : 1 }}>
                                <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#7B2D43", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {group.detail}
                                </span>
                                {/* [2026-08-29 사장님 요청] 추가금만 보이면 실제로 얼마에 팔리는지 모른 채 등록하게 된다.
                                    실제 판매가 = 대표가 + 추가금 (엑셀 대량등록 화면과 같은 기준) */}
                                {(() => {
                                  const realPrice = moneyNumber(priceText) + Math.max(0, Number(detailPlus[group.detail]) || 0);
                                  if (realPrice <= 0) return null;
                                  return (
                                    <span style={{ display: "block", marginTop: "1px", fontSize: "10.5px", fontWeight: 900, color: "#0F6E56" }}>
                                      판매가 {realPrice.toLocaleString("ko-KR")}원
                                    </span>
                                  );
                                })()}
                              </span>
                              {/* [2026-08-29 개선 A] 예전에는 "추가금"만 넣어서 실제로 얼마에 팔리는지
                                  머릿속으로 더해야 했다. → 팔 금액을 그대로 넣고, 추가금은 시스템이 역산한다.
                                  저장되는 값·계산식은 예전과 동일(실제가 = 대표가 + 추가금). */}
                              {(() => {
                                const base = moneyNumber(priceText);
                                const plusNow = Math.max(0, Number(detailPlus[group.detail]) || 0);
                                const draft = salePriceDraft[group.detail];
                                const shown = draft !== undefined
                                  ? formatNumberWithComma(draft)
                                  : (detailPlus[group.detail] === "" ? "" : formatNumberWithComma(String(base + plusNow)));
                                const typedNum = Number(String(draft ?? "").replace(/[^0-9]/g, "")) || 0;
                                const tooLow = draft !== undefined && String(draft).trim() !== "" && typedNum < base;
                                return (
                                  <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                    <input
                                      style={{ fontSize: "11px", padding: "4px 6px", border: `1px solid ${tooLow ? "#C0392B" : "#D9C5CC"}`, borderRadius: "5px", textAlign: "right", width: "100%", background: "#fff", fontWeight: 800 }}
                                      type="text" inputMode="numeric" placeholder="판매가"
                                      title="손님이 실제로 내는 금액. 대표가와의 차액이 추가금으로 자동 저장됩니다."
                                      value={shown}
                                      onFocus={(e) => { const t = e.currentTarget; requestAnimationFrame(() => t.select()); }}
                                      onChange={(e) => applySalePrice(group.detail, e.target.value)}
                                      onBlur={() => clearSalePriceDraft(group.detail)}
                                    />
                                    <span style={{ fontSize: "9px", fontWeight: 800, color: tooLow ? "#C0392B" : "#8B7D83", textAlign: "right", whiteSpace: "nowrap" }}>
                                      {tooLow ? "대표가보다 낮음" : `추가금 +${plusNow.toLocaleString("ko-KR")}`}
                                    </span>
                                  </span>
                                );
                              })()}
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

            <div style={{ ...toggleRow, opacity: customerDetailInputUnavailable ? 0.55 : 1 }}>
              <div style={{ minWidth: 0, paddingRight: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--color-ink)", fontWeight: 800 }}>세부상품명 고객 직접입력</div>
                <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", marginTop: "1px", lineHeight: 1.45 }}>
                  {customerDetailInputUnavailable
                    ? "등록된 세부상품 선택형에는 사용할 수 없음"
                    : customerDetailInputEnabled
                      ? "손님이 주문할 때 세부상품명을 직접 입력 · 주문서/송장/물건챙기기에 함께 표시"
                      : "(끄면 세부상품명 직접입력 칸 없음)"}
                </div>
              </div>
              <div
                onClick={() => {
                  if (customerDetailInputUnavailable) {
                    showAdminToast("이미 등록된 세부상품을 고르는 상품에는 고객 직접입력을 함께 사용할 수 없어요.", "warning");
                    return;
                  }
                  setCustomerDetailInputEnabled((v) => !v);
                }}
                style={tgStyle(!customerDetailInputUnavailable && customerDetailInputEnabled)}
              ><span style={tgKnob(!customerDetailInputUnavailable && customerDetailInputEnabled)} /></div>
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
          {!brandGroupActive ? (
            <div style={{ marginBottom: "14px" }}>
              <ImagePicker label="상세사진 (최대 5장)" value={detailImages} maxFiles={5} uploadKind="detail" mode="detail" onChange={(next) => { setFormTouched(true); setDetailImages(next); }} />
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
              onChange={(e) => { setFormTouched(true); setDescription(e.target.value); }}
            />
          </div>

        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid #E8E2DD", background: "#F7F5F3", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}><span style={{ color: "var(--color-warn-tx)" }}>⚡ 빠른등록:</span> 사진·이름만 넣고 바로</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => { void requestClose(); }} disabled={saving} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #E8E2DD", background: "var(--color-surface)", fontSize: "13px", cursor: saving ? "default" : "pointer", color: "var(--color-ink)", opacity: saving ? 0.5 : 1 }}>취소</button>
            <button type="button" onClick={() => void saveProduct()} disabled={saving} style={{ padding: "10px 22px", borderRadius: "8px", background: saving ? "#ccc" : isEditMode ? "#0F6E56" : "#7B2D43", color: "#fff", border: "none", fontSize: "13px", fontWeight: 500, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "저장 중..." : isEditMode ? "저장" : "등록"}</button>
          </div>
        </div>

      </div>

      {/* [2026-08-29] 이름 여러 개 붙여넣기 — 거래처 목록을 그대로 긁어 넣을 때 */}
      {bulkNamesOpen ? (
        <div
          onClick={(event) => { if (event.target === event.currentTarget) setBulkNamesOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(20,12,16,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <div style={{ width: "min(440px, 94vw)", borderRadius: "14px", overflow: "hidden", background: "var(--color-surface)", boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #E8E2DD", fontSize: "13.5px", fontWeight: 900, color: "var(--color-ink)" }}>이름 여러 개 붙여넣기</div>
            <div style={{ padding: "15px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)", marginBottom: "7px", lineHeight: 1.6 }}>
                한 줄에 하나씩 넣으세요. <b>이름, 판매가</b> 로 써도 됩니다.
              </div>
              <textarea
                value={bulkNamesText}
                onChange={(event) => setBulkNamesText(event.target.value)}
                placeholder={"BB-39 코트, 179000\nBB-40 코트, 179000\nBB-41 코트"}
                style={{ width: "100%", height: "140px", padding: "11px 12px", borderRadius: "10px", border: "1.5px solid #D9C5CC", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "13px", fontWeight: 600, outline: "none", resize: "vertical", lineHeight: 1.6 }}
              />
              <div style={{ marginTop: "7px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.6 }}>
                색상·사이즈는 <b>맨 아랫줄 상품과 똑같이</b> 채워집니다. 나중에 표에서 고치면 됩니다.
              </div>
            </div>
            <div style={{ padding: "11px 15px", borderTop: "1px solid #E8E2DD", background: "var(--color-surface-2)", display: "flex", gap: "7px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setBulkNamesOpen(false)} style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid #D9C5CC", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>취소</button>
              <button
                type="button"
                onClick={() => {
                  const base = moneyNumber(priceText);
                  const rowsToAdd = bulkNamesText.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
                  if (rowsToAdd.length === 0) { setBulkNamesOpen(false); return; }
                  rowsToAdd.forEach((line) => {
                    const parts = line.split(",");
                    const nm = String(parts[0] || "").trim();
                    const sale = Number(String(parts[1] || "").replace(/[^0-9]/g, "")) || 0;
                    addDetailRow(nm || undefined, sale > base ? sale : undefined);
                  });
                  setBulkNamesOpen(false);
                  showAdminToast(`${rowsToAdd.length}줄을 추가했어요. 사진과 가격을 채우고 저장하세요.`, "success");
                }}
                style={{ padding: "9px 15px", borderRadius: "8px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "12px", fontWeight: 900, cursor: "pointer" }}
              >추가</button>
            </div>
          </div>
        </div>
      ) : null}

      {brandDetailEditDraft ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(39,28,33,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
          <div role="dialog" aria-modal="true" aria-label={brandDetailEditDraft.originalName ? "세부상품 수정" : "세부상품 추가"} style={{ width: "min(620px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden", background: "var(--color-surface)", boxShadow: "0 22px 70px rgba(0,0,0,0.28)" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #E8E2DD", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F7F5F3" }}>
              <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--color-ink)" }}>{brandDetailEditDraft.originalName ? "세부상품 수정" : "＋ 세부상품 추가"}</span>
              <button type="button" onClick={() => setBrandDetailEditDraft(null)} style={{ border: "none", background: "transparent", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "14px 16px" }}>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}><div style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>상세사진 {brandDetailEditDraft.photos.length}장 · 첫 사진이 대표사진</div><button type="button" disabled={brandDetailPhotoUploading} onClick={() => brandDetailPhotoInputRef.current?.click()} style={{ border:"1px solid #D9C5CC",borderRadius:7,background:"#fff",color:"#7B2D43",padding:"5px 9px",fontSize:"11px",fontWeight:900,cursor:"pointer" }}>{brandDetailPhotoUploading ? "업로드 중…" : "+ 상세사진 추가"}</button></div>
                <input ref={brandDetailPhotoInputRef} type="file" accept="image/*" multiple onChange={handleBrandDetailPhotoFiles} style={{ display:"none" }} />
                {brandDetailEditDraft.photos.length ? <div style={{ display:"flex",gap:7,overflowX:"auto",paddingBottom:3 }}>{brandDetailEditDraft.photos.map((photo,index)=><div key={`${photo}-${index}`} style={{flex:"0 0 88px"}}><button type="button" onClick={()=>setDetailPreviewImage(resolveProductImageUrl(photo))} style={{width:88,height:88,padding:0,border:"1px solid #E1D5D9",borderRadius:9,overflow:"hidden",background:"#F1ECE8",cursor:"zoom-in"}}><img src={resolveProductImageUrl(photo)} alt={`${brandDetailEditDraft.name} 사진 ${index+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/></button><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:3,marginTop:4}}><button type="button" disabled={index===0} onClick={()=>setBrandDetailEditDraft(prev=>{if(!prev)return prev;const a=[...prev.photos];[a[index-1],a[index]]=[a[index],a[index-1]];return{...prev,photos:a}})} style={{fontSize:10}}>←</button><button type="button" disabled={index===brandDetailEditDraft.photos.length-1} onClick={()=>setBrandDetailEditDraft(prev=>{if(!prev)return prev;const a=[...prev.photos];[a[index],a[index+1]]=[a[index+1],a[index]];return{...prev,photos:a}})} style={{fontSize:10}}>→</button><button type="button" onClick={()=>setBrandDetailEditDraft(prev=>prev?{...prev,photos:prev.photos.filter((_,i)=>i!==index)}:prev)} style={{fontSize:10,color:"#C0392B"}}>×</button></div></div>)}</div> : <div style={{fontSize:"11px",color:"var(--color-ink-mute)"}}>등록된 상세사진이 없습니다.</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 150px", gap: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>상품명
                  <input value={brandDetailEditDraft.name} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, name: event.target.value } : prev)} style={{ ...fieldInput, marginTop: "4px" }} />
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>상품구분
                  <input value={brandDetailEditDraft.category} onChange={(event) => setBrandDetailEditDraft((prev) => prev ? { ...prev, category: event.target.value } : prev)} placeholder="상의, 하의, 세트…" style={{ ...fieldInput, marginTop: "4px" }} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                {/* [2026-08-29 개선 A] 팔 금액을 그대로 넣는다. 추가금은 시스템이 역산해서 저장한다. */}
                {(() => {
                  const base = moneyNumber(priceText);
                  const plusNow = Math.max(0, Number(brandDetailEditDraft.plus) || 0);
                  const draft = salePriceDraft["__modal__"];
                  const shown = draft !== undefined ? formatNumberWithComma(draft) : formatNumberWithComma(String(base + plusNow));
                  const typedNum = Number(String(draft ?? "").replace(/[^0-9]/g, "")) || 0;
                  const tooLow = draft !== undefined && String(draft).trim() !== "" && typedNum < base;
                  return (
                    <>
                      <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>판매가 <span style={{ fontWeight: 700 }}>(손님이 내는 금액)</span>
                        <div style={{ position: "relative", marginTop: "4px" }}>
                          <input
                            value={shown}
                            inputMode="numeric"
                            style={{ ...fieldInput, paddingRight: "28px", fontWeight: 800, borderColor: tooLow ? "#C0392B" : undefined }}
                            onChange={(event) => {
                              const typed = event.target.value;
                              setSalePriceDraft((prev) => ({ ...prev, __modal__: typed }));
                              const digits = String(typed || "").replace(/[^0-9]/g, "");
                              if (!digits) { setBrandDetailEditDraft((prev) => (prev ? { ...prev, plus: "0" } : prev)); return; }
                              const sale = Number(digits) || 0;
                              if (sale < base) return;   // 음수 추가금은 만들지 않는다
                              setBrandDetailEditDraft((prev) => (prev ? { ...prev, plus: String(sale - base) } : prev));
                            }}
                            onBlur={() => setSalePriceDraft((prev) => { const next = { ...prev }; delete next.__modal__; return next; })}
                          />
                          <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-mute)", fontSize: "12px" }}>원</span>
                        </div>
                      </label>
                      <div style={{ padding: "20px 11px 0", fontSize: "11.5px", fontWeight: 900, color: tooLow ? "#C0392B" : "#7B2D43", lineHeight: 1.5 }}>
                        {tooLow
                          ? <>대표가({base.toLocaleString("ko-KR")}원)보다<br />낮게는 못 넣습니다</>
                          : <>대표가 {base.toLocaleString("ko-KR")}원<br />+ 추가금 {plusNow.toLocaleString("ko-KR")}원</>}
                      </div>
                    </>
                  );
                })()}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "11px 16px", borderTop: "1px solid #E8E2DD", background: "#F7F5F3", flexWrap: "wrap" }}>
              {/* 새로 만드는 중일 때는 지울 게 없으므로 삭제 버튼을 숨긴다 */}
              {brandDetailEditDraft.originalName ? (
                <button
                  type="button"
                  onClick={() => void deleteBrandDetail()}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #F0C8C1",
                    borderRadius: "8px",
                    background: "#fff",
                    color: "#C0392B",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              ) : <span />}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "7px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() =>
                    setBrandDetailEditDraft((prev) =>
                      prev ? { ...prev, hidden: !prev.hidden } : prev
                    )
                  }
                  title={
                    brandDetailEditDraft.hidden
                      ? "고객 주문서에 다시 노출"
                      : "데이터는 유지하고 고객 주문서에서만 숨김"
                  }
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #D9C5CC",
                    borderRadius: "8px",
                    background: brandDetailEditDraft.hidden ? "#F1ECE8" : "#fff",
                    color: brandDetailEditDraft.hidden ? "#75676D" : "#7B2D43",
                    fontSize: "11.5px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {brandDetailEditDraft.hidden ? "숨김 해제" : "숨김"}
                </button>

                <button
                  type="button"
                  onClick={() => setBrandDetailEditDraft(null)}
                  style={{ padding: "8px 14px", border: "1px solid #E8E2DD", borderRadius: "8px", background: "#fff", color: "var(--color-ink)", cursor: "pointer" }}
                >
                  취소
                </button>

                <button
                  type="button"
                  onClick={applyBrandDetailEditor}
                  style={{ padding: "8px 15px", border: "none", borderRadius: "8px", background: "#0F6E56", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                >
                  {brandDetailEditDraft.originalName ? "변경내용 적용" : "세부상품 추가"}
                </button>
              </div>
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
