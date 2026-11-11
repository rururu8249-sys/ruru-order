/** 상품 위젯과 사이트 「지금 소개하는 상품」 카드가 같이 쓰는 판매 가능 판정(표시 전용). */
type AnyProduct = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// [2026-07-09] 품절 판정 — 고객 주문페이지 isSoldOutOrderProduct(app/order/page.tsx:775)와 동일 기준.
//   * 재고관리 OFF면 품절 처리 안 함(레거시 상품 보호)
//   * 옵션 상품 → 모든 옵션 재고가 0일 때만 품절
//   * 옵션 없는 상품 → 총재고 0일 때 품절
//   읽기 전용(주문/재고 로직 무관, 표시만).
export function isSoldOutWidgetProduct(p: AnyProduct | null): boolean {
  if (!p) return false;
  if (p.is_soldout === true) return true;
  let note: any = p.product_note;
  if (typeof note === "string") {
    try {
      note = JSON.parse(note);
    } catch {
      note = null;
    }
  }
  if (note?.stock_management_enabled !== true) return false;

  const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
  if (variants.length > 0) {
    return variants.every((v: any) => Number(v?.stock ?? 0) <= 0);
  }

  const stock = Number(p.stock ?? p.total_stock);
  return Number.isFinite(stock) && stock <= 0;
}

export function isAvailableWidgetProduct(p: AnyProduct | null): boolean {
  if (!p) return false;
  const status = String(p.status ?? p.product_status ?? "").trim().toLowerCase();
  return status !== "deleted" && status !== "숨김" && !isSoldOutWidgetProduct(p);
}

