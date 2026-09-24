// [2026-09-24] 상품사진 안내문구 — «브라우저에서 캔버스에 실제로 그리는» 쪽.
//   계산·검사는 lib/productImageNotice.ts 에 있다(테스트가 그쪽을 돌린다).
//
//   흐름: 설정(API) 한 번 읽어 캐시 → 사진 압축 캔버스에 띠를 그린다 → 그대로 업로드.
//   사진 여러 장을 한 번에 골라도 compressProductImage 가 한 장씩 도는 구조라 전부 똑같이 들어간다.

import {
  fitNoticeFontSize,
  noticeBoxLayout,
  noticeBoxRect,
  PRODUCT_IMAGE_NOTICE_DEFAULTS,
  type ProductImageNotice,
} from "@/lib/productImageNotice";

/** 설정 캐시 — 사진 한 장마다 서버를 부르지 않는다 */
let cached: ProductImageNotice | null = null;
let inflight: Promise<ProductImageNotice> | null = null;

/** 이번 화면에서 사장님이 사진칸 체크박스로 직접 켜고 끈 값. null = 설정값을 따름 */
let sessionOn: boolean | null = null;

export function setProductImageNoticeSessionOn(on: boolean | null) {
  sessionOn = on;
}
export function getProductImageNoticeSessionOn(): boolean | null {
  return sessionOn;
}

/** 설정 화면에서 저장한 직후 캐시를 새로 읽게 한다 */
export function clearProductImageNoticeCache() {
  cached = null;
  inflight = null;
}

export async function loadProductImageNotice(): Promise<ProductImageNotice> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/admin-live/product-image-notice", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.notice) {
        cached = json.notice as ProductImageNotice;
        return cached;
      }
    } catch {
      /* 설정을 못 읽으면 «안 넣는다» — 사진을 망치지 않는 쪽이 안전하다 */
    }
    cached = { ...PRODUCT_IMAGE_NOTICE_DEFAULTS, on: false };
    return cached;
  })();
  const out = await inflight;
  inflight = null;
  return out;
}

/** 지금 이 업로드에 문구를 넣을지 — 사진칸 체크박스가 설정보다 우선 */
export async function shouldStampNotice(): Promise<ProductImageNotice | null> {
  const notice = await loadProductImageNotice();
  const on = sessionOn === null ? notice.on : sessionOn;
  if (!on) return null;
  if (!String(notice.text || "").trim()) return null;
  return notice;
}

const FONT_STACK = `Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif`;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 사진이 «실제로 그려진 사각형» 안 오른쪽 아래에 띠와 문구를 그린다.
 *   rect 를 따로 받는 이유: 대표사진은 1:1 로 만들며 위아래에 흰 여백이 생긴다.
 *   그 흰 여백 위에 띠가 뜨면 이상하므로 사진 영역 안에만 그린다.
 */
export function drawProductImageNotice(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  notice: ProductImageNotice,
) {
  const text = String(notice.text || "").trim();
  if (!text || rect.width <= 0 || rect.height <= 0) return;

  const layout = noticeBoxLayout(rect.width);
  const measure = (size: number) => {
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    return ctx.measureText(text).width;
  };
  const fontSize = fitNoticeFontSize(layout, measure);
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  const textWidth = Math.min(ctx.measureText(text).width, layout.maxTextWidth);

  const box = noticeBoxRect(rect, layout, textWidth, fontSize);
  // 사진 밖으로 나가면 그리지 않는다(아주 작은 사진 보호)
  if (box.x < rect.x || box.y < rect.y) return;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${notice.opacity})`;
  roundedRect(ctx, box.x, box.y, box.width, box.height, box.radius);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, box.x + layout.padX, box.y + box.height / 2, layout.maxTextWidth);
  ctx.restore();
}
