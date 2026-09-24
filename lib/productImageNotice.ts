// lib/productImageNotice.ts
// [2026-09-24 사장님] 「상품사진 업로드 할때 오른쪽 하단에 … 배경은 검정 반투명, 어느정도 비치는 느낌.
//                      저 문구 입력 가능하게 체크하면 문구가 들어가고」
//
//   · 무엇? 상품사진을 올릴 때 «사진 자체에» 안내문구 띠를 구워 넣는다(합성).
//     사장님 선택: A안(사진에 합성) · 배경 진하기 45%.
//     사진이 손님페이지·방송위젯·카톡공유·다운로드 어디로 가든 문구가 따라간다.
//   · 어디에 저장? settings 테이블(key/value). 새 키(product_image_notice_*)만 추가한다.
//     기존 키·다른 표는 손대지 않는다. DB 스키마 변경 없음.
//   · 저장은 /api/admin-live/product-image-notice (관리자 세션 + 서비스롤)로만 한다.
//   · 돈 로직 아님. 주문·입금·정산·배송·포인트·Bankda 를 읽지도 쓰지도 않는다.
//   · 이 파일은 «계산만» 한다(브라우저 API 안 씀) → scripts/test-product-image-notice.mjs 로 검사한다.
//     실제 캔버스 그리기는 components/admin-live/quick-product/productImageNoticeClient.ts.

export type ProductImageNotice = {
  /** 새로 올리는 사진에 기본으로 문구를 넣을지 */
  on: boolean;
  /** 사진에 박을 문구 */
  text: string;
  /** 검정 배경 진하기 0.15 ~ 0.80 (사장님 확정: 0.45) */
  opacity: number;
};

export const PRODUCT_IMAGE_NOTICE_KEYS = [
  "product_image_notice_on",
  "product_image_notice_text",
  "product_image_notice_opacity",
] as const;
export type ProductImageNoticeKey = (typeof PRODUCT_IMAGE_NOTICE_KEYS)[number];

/** 설정이 비어 있으면 이 값이 나간다. on=false = 아무것도 안 바뀐다(기존 운영 그대로). */
export const PRODUCT_IMAGE_NOTICE_DEFAULTS: ProductImageNotice = {
  on: false,
  text: "※ 상품 이해를 돕기 위한 연출 이미지로, 실제 상품과 일부 차이가 있을 수 있습니다.",
  opacity: 0.45,
};

export const NOTICE_OPACITY_MIN = 0.15;
export const NOTICE_OPACITY_MAX = 0.8;
export const NOTICE_TEXT_MAX = 120;

export function clampNoticeOpacity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return PRODUCT_IMAGE_NOTICE_DEFAULTS.opacity;
  return Math.min(NOTICE_OPACITY_MAX, Math.max(NOTICE_OPACITY_MIN, Math.round(n * 100) / 100));
}

type SettingRow = { key: string; value: unknown };

function rowValue(rows: SettingRow[], key: ProductImageNoticeKey): unknown {
  const hit = rows.find((r) => r && r.key === key);
  return hit ? hit.value : undefined;
}

export function parseProductImageNotice(rows: SettingRow[] | null | undefined): ProductImageNotice {
  const list = Array.isArray(rows) ? rows : [];
  const rawOn = rowValue(list, "product_image_notice_on");
  const rawText = rowValue(list, "product_image_notice_text");
  const rawOpacity = rowValue(list, "product_image_notice_opacity");

  const text = typeof rawText === "string" && rawText.trim() ? rawText.trim() : PRODUCT_IMAGE_NOTICE_DEFAULTS.text;
  const on =
    rawOn === undefined || rawOn === null
      ? PRODUCT_IMAGE_NOTICE_DEFAULTS.on
      : rawOn === true || rawOn === "true" || rawOn === 1 || rawOn === "1";

  return {
    on,
    text: text.slice(0, NOTICE_TEXT_MAX),
    opacity: rawOpacity === undefined || rawOpacity === null
      ? PRODUCT_IMAGE_NOTICE_DEFAULTS.opacity
      : clampNoticeOpacity(rawOpacity),
  };
}

export function toProductImageNoticeRows(value: ProductImageNotice): { key: ProductImageNoticeKey; value: unknown }[] {
  return [
    { key: "product_image_notice_on", value: value.on === true },
    { key: "product_image_notice_text", value: String(value.text || "").trim().slice(0, NOTICE_TEXT_MAX) },
    { key: "product_image_notice_opacity", value: clampNoticeOpacity(value.opacity) },
  ];
}

/** 저장 전 검사 — 통과하면 빈 문자열, 문제가 있으면 사장님께 보여줄 한국어 이유 */
export function validateProductImageNotice(value: ProductImageNotice): string {
  if (value.on && !String(value.text || "").trim()) {
    return "문구를 켜두셨는데 내용이 비어 있습니다. 문구를 적어주세요.";
  }
  if (String(value.text || "").length > NOTICE_TEXT_MAX) {
    return `문구는 ${NOTICE_TEXT_MAX}자까지 넣을 수 있습니다.`;
  }
  const n = Number(value.opacity);
  if (!Number.isFinite(n) || n < NOTICE_OPACITY_MIN || n > NOTICE_OPACITY_MAX) {
    return "배경 진하기는 15% ~ 80% 사이로 정해주세요.";
  }
  return "";
}

// ── 띠 모양 계산 ────────────────────────────────────────────────────────────
// 사진 크기가 제각각(대표 1000×1000 · 상세 1100 긴변)이라 «비율»로 정한다.
// 사장님 시안에서 확정한 비율 그대로:
//   글자 = 가로의 2.2% · 좌우 안쪽여백 = 글자의 0.9배 · 위아래 = 글자의 0.55배
//   가장자리에서 띄우는 거리 = 가로의 2% · 모서리 둥글기 = 띠 높이의 0.28배

export const NOTICE_FONT_RATIO = 0.022;
export const NOTICE_MARGIN_RATIO = 0.02;
export const NOTICE_FONT_MIN = 10;

export type NoticeBoxLayout = {
  /** 글자 크기(px) */
  fontSize: number;
  /** 띠 안쪽 좌우 여백 */
  padX: number;
  /** 띠 안쪽 위아래 여백 */
  padY: number;
  /** 사진 가장자리에서 띄우는 거리 */
  margin: number;
  /** 글자가 쓸 수 있는 최대 폭 — 이보다 길면 글자를 줄인다 */
  maxTextWidth: number;
};

/**
 * 사진(또는 사진이 그려진 영역)의 크기에서 띠 치수를 뽑는다.
 *   width  = 그 영역의 가로(px)
 * ⚠ 대표사진은 1:1 로 만들며 위아래에 «흰 여백»이 생긴다. 그 흰 여백 위에 띠가 뜨면 이상하므로
 *   호출하는 쪽에서 «사진이 실제로 그려진 사각형»의 크기를 넘긴다(productImageNoticeClient).
 */
export function noticeBoxLayout(width: number): NoticeBoxLayout {
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const fontSize = Math.max(NOTICE_FONT_MIN, Math.round(w * NOTICE_FONT_RATIO));
  const padX = Math.round(fontSize * 0.9);
  const padY = Math.round(fontSize * 0.55);
  const margin = Math.round(w * NOTICE_MARGIN_RATIO);
  return {
    fontSize,
    padX,
    padY,
    margin,
    maxTextWidth: Math.max(1, w - margin * 2 - padX * 2),
  };
}

/**
 * 글자가 칸보다 길면 «들어갈 때까지» 글자를 줄인다(최소 10px).
 *   measure = 글자 크기를 넣으면 그 크기에서의 실제 글자 폭을 돌려주는 함수
 *             (브라우저에서는 canvas 의 measureText, 테스트에서는 가짜 함수)
 * 끝까지 안 들어가면 최소 크기를 돌려준다 — 그때는 호출부가 잘라낸다.
 */
export function fitNoticeFontSize(
  base: NoticeBoxLayout,
  measure: (fontSize: number) => number,
): number {
  let size = base.fontSize;
  while (size > NOTICE_FONT_MIN && measure(size) > base.maxTextWidth) {
    size -= 1;
  }
  return size;
}

/** 오른쪽 아래에 놓았을 때의 띠 좌표. rect = 사진이 그려진 사각형 */
export function noticeBoxRect(
  rect: { x: number; y: number; width: number; height: number },
  layout: NoticeBoxLayout,
  textWidth: number,
  fontSize: number,
): { x: number; y: number; width: number; height: number; radius: number } {
  const boxW = Math.round(textWidth + layout.padX * 2);
  const boxH = Math.round(fontSize * 1.25 + layout.padY * 2);
  const x = Math.round(rect.x + rect.width - layout.margin - boxW);
  const y = Math.round(rect.y + rect.height - layout.margin - boxH);
  return { x, y, width: boxW, height: boxH, radius: Math.round(boxH * 0.28) };
}
