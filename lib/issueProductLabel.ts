// ═══ 고객이슈 «대상상품» 표기 — 2026-09-23 신설 ═══
//
//   사장님: 「상품선택해서 했을 경우에는 상품 사진이 있는경우 같이 표시되면 좋을거 같음」
//
//   고객이슈(admin_tasks)에는 상품이 «글자»로만 남는다 — 「대상상품: 폴로 청남방(XL)×1」.
//   상품 id도 사진 주소도 없다. 그래서 사진을 붙이려면 그 글자로 주문 행을 되찾아야 한다.
//
//   그 글자를 만드는 규칙이 지금까지 order-return/route.ts 안에만 있었다.
//   화면이 같은 규칙을 «복사»해 쓰면 한쪽만 바뀌는 순간 사진이 엉뚱하게 붙는다
//   (합배송 주소키·차단사유와 같은 사고 경로) → 이 파일 한 곳으로 모은다.
//
//   ⚠ 표시 전용이다. 주문·금액·재고·입금·정산 어디에도 쓰지 않는다.

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 이슈 본문 「대상상품:」에 적히는 한 상품의 표기. 예) 폴로 청남방(XL)×1 */
export function issueProductLabel(row: Row): string {
  const option = [text(row.color), text(row.size)].filter((v) => v && v !== "없음").join("/");
  const name = text(row.product_name) || "상품";
  const qty = Math.max(1, num(row.qty) || 1);
  return `${name}${option ? `(${option})` : ""}×${qty}`;
}

/** 여러 상품을 한 줄로. 이슈 본문에 그대로 들어간다. */
export function issueProductSummary(rows: Row[]): string {
  return rows.map(issueProductLabel).join(", ");
}

/**
 * 「대상상품:」 글자에서 «그 이슈가 가리키는 주문 행»만 고른다.
 *
 * 한 주문서에 상품이 여러 개여도 이슈는 그중 «고른 것»만 담는다.
 * 그래서 주문번호로 찾아온 행 전부에 사진을 붙이면 안 되고, 표기가 들어 있는 행만 골라야 한다.
 *
 * ⚠ 못 고르면 빈 배열을 준다 — 엉뚱한 상품 사진을 붙이느니 안 붙이는 게 낫다
 *   (lib/orderItemPhoto.ts 와 같은 원칙).
 */
export function pickIssueProductRows(rows: Row[], targetText: unknown): Row[] {
  const target = text(targetText);
  if (!target || rows.length === 0) return [];
  return rows.filter((row) => target.includes(issueProductLabel(row)));
}
