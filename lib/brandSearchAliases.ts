// [2026-11-06] 상품 목록을 받아 «브랜드 묶음 이름 → 세부상품 번호 앞 글자» 연결표를 검색에 등록한다.
//   검색 전용(표시) — 상품·재고·주문 데이터 무변경. lib/productSearch 의 brandQueryVariants 가 이 표를 쓴다.
import { detailProducts, isBrandGroup, type ProductLike } from "./productDetailModel";
import { registerBrandSearchAliases } from "./productSearch";

let lastSignature = "";

export function registerBrandAliasesFromProducts(rows: unknown[]): void {
  const groups: Array<{ brandName: string; detailNames: string[] }> = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as ProductLike;
    try {
      if (!isBrandGroup(row)) continue;
      const brandName = String((row as Record<string, unknown>).product_name ?? "").trim();
      if (!brandName) continue;
      const detailNames = detailProducts(row, { includeHidden: true }).map((d) => d.detailName);
      if (detailNames.length) groups.push({ brandName, detailNames });
    } catch {
      /* 해석 실패한 상품은 건너뜀 — 검색은 기본 규칙 그대로 */
    }
  }
  const signature = groups.map((g) => `${g.brandName}:${g.detailNames.length}`).join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;
  registerBrandSearchAliases(groups);
}
