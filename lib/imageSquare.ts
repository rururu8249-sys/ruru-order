// [2026-09-20 사장님 요청] 「위젯 상품사진 칸이 정사각형이면 좋겠다. 등록할 때 1:1 로 맞춰주면 되지 않나?
//   단, 사진을 찌그러뜨리라는 말이 아님」
//
// 기준(2026-09-20 조사): 네이버 스마트스토어 등 국내 쇼핑몰 실무 표준은
//   · 대표이미지 = **1:1 정사각형**, 1000×1000px 이상 권장
//   · 배경은 흰색(#FFFFFF), 상품을 가운데 크게
//   (1minutesangse.com/guides/smartstore-thumbnail-size · mangotree.co.kr 매뉴얼)
//
// 그래서 «잘라내기(crop)»도 «늘리기(stretch)»도 하지 않고,
// **사진 전체를 비율 그대로 넣고 남는 자리에 흰 여백**을 넣는다(레터박스).
//   · 세로로 긴 옷 사진 → 좌우에 흰 여백
//   · 가로로 긴 사진   → 위아래에 흰 여백
//   · 이미 정사각형    → 여백 없음(계산상 그대로)
//
// 이 파일은 «좌표 계산»만 한다(그림은 브라우저 canvas 가 그린다) — 테스트로 고정하기 위해 분리했다.
// 표시 전용. 금액·재고·주문과 무관.

/** 실무 표준 권장 크기. 원본이 이보다 작으면 «억지로 키우지 않는다»(흐려지므로). */
export const SQUARE_TARGET_PX = 1000;

export type SquarePlacement = {
  /** 정사각형 캔버스 한 변 */
  size: number;
  /** 사진을 그릴 위치·크기 (가운데 정렬) */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** 여백이 실제로 생기는지 — 이미 정사각형이면 false */
  padded: boolean;
};

/**
 * 원본 크기 → 정사각형 캔버스 배치 계산.
 * @param width  원본 가로
 * @param height 원본 세로
 * @param target 목표 한 변(기본 1000). 원본의 긴 변이 이보다 작으면 원본 긴 변을 쓴다(확대 안 함).
 */
export function squarePlacement(width: number, height: number, target: number = SQUARE_TARGET_PX): SquarePlacement | null {
  const w = Math.floor(Number(width) || 0);
  const h = Math.floor(Number(height) || 0);
  if (w <= 0 || h <= 0) return null;

  const longEdge = Math.max(w, h);
  const t = Math.max(1, Math.floor(Number(target) || SQUARE_TARGET_PX));
  const size = Math.min(t, longEdge); // 원본보다 크게 만들지 않는다

  // 긴 변을 캔버스에 맞춘다(= contain). 비율은 그대로.
  const scale = size / longEdge;
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);

  return { size, dx, dy, dw, dh, padded: dw !== size || dh !== size };
}
