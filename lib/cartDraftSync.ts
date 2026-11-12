// [2026-11-13] 같은 브라우저의 다른 탭과 장바구니 맞추기 — 비교만 하는 순수 함수.
//   배경(운영 실측): 탭마다 장바구니가 따로라, 빈 장바구니인 다른 탭이 45초마다 서버 선점을
//   «빈 목록»으로 덮어써 방금 담은 상품 선점이 사라졌고, 제출이 「담은 지 시간이 지났거나…」로 거절됐다.
//   다른 탭이 임시 장바구니(localStorage)를 바꾸면 이 탭도 그 목록으로 맞춘다.
//   같은 목록이면 아무것도 안 한다(탭끼리 서로 계속 덮어쓰는 것 방지).
type DraftLine = Record<string, unknown>;

const t = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

function lineKey(line: DraftLine | null | undefined): string {
  if (!line) return "";
  const seq = line.cart_seq === undefined || line.cart_seq === null ? "" : String(line.cart_seq);
  return [t(line.product_id), t(line.product_name), t(line.color), t(line.size), t(line.qty), t(line.product_price), seq].join("\u0001");
}

const isBlank = (line: DraftLine | null | undefined) =>
  !line || !(t(line.product_name) || t(line.color) || t(line.size) || t(line.qty) || t(line.product_price));

/** 두 장바구니 목록이 같은가(빈 줄은 무시, 순서 포함). */
export function sameCartDraftItems(a: readonly DraftLine[] | null | undefined, b: readonly DraftLine[] | null | undefined): boolean {
  const ka = (a || []).filter((l) => !isBlank(l)).map(lineKey);
  const kb = (b || []).filter((l) => !isBlank(l)).map(lineKey);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return false;
  return true;
}
