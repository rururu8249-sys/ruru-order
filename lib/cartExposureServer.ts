// lib/cartExposureServer.ts
// [2026-11-02 사장님 「등록 안 된 상품을 어떻게 장바구니에 담아」] 지금 손님 화면에 보이는 상품 id 모음 — 서버 판정.
//   손님 화면(app/order/page.tsx quickGroupBuyProducts)과 같은 규칙:
//   - 방송 ON = 그 방송에 담은 상품(broadcast_products)만
//   - 방송 OFF = 쇼핑몰 진열(in_shop) 상품만 · 진열이 하나도 없으면 손님 화면이 전체 상품을 보여 주므로 제한 안 함(null)
//   - 숨김·삭제·is_visible=false 제외, 브랜드 묶음 상품이면 그 묶음에 연결된 원래 상품(source)도 포함
//   읽기 실패하면 null(제한 안 함) — 판정 못 했다고 판매를 막지 않는다. 재고·금액·주문 무접촉.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const HIDDEN = new Set(["hidden", "숨김", "deleted"]);

export function isExposedProductRow(row: Record<string, unknown>): boolean {
  if ([row.status, row.product_status].some((v) => HIDDEN.has(String(v ?? "").trim()))) return false;
  if (row.is_visible === false) return false;
  return true;
}

/** 지금 손님이 담을 수 있는 상품 id. null = 제한 안 함(판정 불가·쇼핑몰 진열 0개). */
export async function readExposedProductIds(supabase: Db): Promise<Set<string> | null> {
  try {
    const { data: bc, error: bcError } = await supabase
      .from("broadcasts")
      .select("id,status")
      .eq("status", "ON")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bcError) return null;

    let baseIds: string[] = [];
    if (bc?.id) {
      const { data: bp, error } = await supabase.from("broadcast_products").select("product_id").eq("broadcast_id", bc.id).limit(2000);
      if (error) return null;
      baseIds = Array.from(new Set(((bp || []) as Array<Record<string, unknown>>).map((r) => String(r.product_id ?? "").trim()).filter(Boolean)));
    } else {
      const { data: shop, error } = await supabase.from("products").select("id,status,product_status,is_visible").eq("in_shop", true).limit(2000);
      if (error) return null;
      const visible = ((shop || []) as Array<Record<string, unknown>>).filter(isExposedProductRow);
      // 손님 화면: 진열 0개면 전체 상품을 보여 준다 → 서버도 제한 안 함
      if (visible.length === 0) return null;
      baseIds = visible.map((r) => String(r.id ?? "").trim()).filter(Boolean);
    }
    if (baseIds.length === 0) return new Set();

    const exposed = new Set<string>();
    for (let i = 0; i < baseIds.length; i += 200) {
      const chunk = baseIds.slice(i, i + 200);
      const { data: rows, error } = await supabase.from("products").select("id,status,product_status,is_visible").in("id", chunk);
      if (error) return null;
      for (const row of (rows || []) as Array<Record<string, unknown>>) {
        if (isExposedProductRow(row)) exposed.add(String(row.id ?? "").trim());
      }
    }
    if (exposed.size === 0) return exposed;

    // 브랜드 묶음: 손님이 묶음 안에서 고른 세부상품은 원래 상품 id(source)로 담긴다
    const parents = Array.from(exposed);
    for (let i = 0; i < parents.length; i += 200) {
      const { data: links, error } = await supabase.from("product_brand_links").select("source_id,parent_id").in("parent_id", parents.slice(i, i + 200)).limit(5000);
      if (error) return null;
      for (const link of (links || []) as Array<Record<string, unknown>>) {
        const src = String(link.source_id ?? "").trim();
        if (src) exposed.add(src);
      }
    }
    return exposed;
  } catch {
    return null;
  }
}
