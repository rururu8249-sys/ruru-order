// [2026-11-15 사장님 「엑셀 챙김에서 상품명이 사이즈 칸으로 넘어가」]
//   관리자 주문상세 「+ 등록상품」으로 브랜드 묶음 상품을 넣으면 예전엔 상품명=브랜드(버버리), 색상=「BB-60 / 없음」으로 저장돼
//   손님이 담은 줄(상품명=BB-60, 색상=없음)과 모양이 달랐다 → 물건챙기기·엑셀·송장에서 상품명이 「버버리」로 보였다.
//   손님 주문과 같은 모양으로 맞춘다. 단, 재고를 세는 묶음은 재고 찾는 키가 색상 칸이라 그대로 둔다(지금 브랜드 묶음 27개는 전부 재고 안 셈).

type Note = Record<string, unknown>;

export function isStockOffNote(note: Note): boolean {
  const raw = String(note["stock_management_enabled"] ?? "true").trim().toLowerCase();
  return ["false", "f", "0", "no", "n"].includes(raw);
}

export function isBrandGroupNote(note: Note): boolean {
  const bg = note["brand_group"];
  return !!bg && typeof bg === "object" && (bg as Record<string, unknown>)["enabled"] === true;
}

/** 브랜드 묶음 + 재고 안 셈이면 { productName: 세부상품, color: 나머지 } — 아니면 그대로 */
export function splitBrandDetailForOrder(input: { note: Note; productName: string; color: string; detailNames: string[] }): { productName: string; color: string; changed: boolean } {
  const same = { productName: input.productName, color: input.color, changed: false };
  if (!isBrandGroupNote(input.note) || !isStockOffNote(input.note)) return same;
  const color = String(input.color || "").trim();
  if (!color) return same;
  const hit = [...input.detailNames]
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((d) => color === d || color.startsWith(`${d} / `));
  if (!hit) return same;
  const rest = color === hit ? "" : color.slice(hit.length + 3).trim();
  return { productName: hit, color: rest === "없음" ? "" : rest, changed: true };
}
