// lib/chatCurrentProduct.ts
// [2026-08-14] 「지금 이거」 — 상품을 말하지 않은 채팅 주문(저요/ㅈㅇ)이 붙을 대상.
//   핵심: 값 하나를 덮어쓰지 않고 "변경 이력"으로 쌓는다.
//   채팅 메시지에는 발송 시각(publishedAt)이 함께 오므로, 5초 뒤에 읽더라도
//   그 메시지가 쓰인 시각에 걸려 있던 상품으로 정확히 되감아 매칭할 수 있다.
//   ⚠️ 위젯 고정(products.is_pinned)과 무관. 표시 로직 무접촉. 돈·재고 로직 무접촉.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentProduct = { productId: string; productName: string; setAt: string } | null;

// 지정 시각에 걸려 있던 「지금 이거」를 돌려준다. (해제 상태였으면 null)
export async function getCurrentProductAt(sb: SupabaseClient, atIso: string): Promise<CurrentProduct> {
  try {
    const { data } = await sb
      .from("chat_current_product")
      .select("product_id,product_name,cleared,set_at")
      .lte("set_at", atIso)
      .order("set_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    if (row.cleared === true) return null;
    const productId = String(row.product_id ?? "").trim();
    if (!productId) return null;
    return {
      productId,
      productName: String(row.product_name ?? "").trim(),
      setAt: String(row.set_at ?? ""),
    };
  } catch {
    return null;
  }
}

export async function setCurrentProduct(
  sb: SupabaseClient,
  opts: { productId: string; productName?: string }
): Promise<void> {
  await sb.from("chat_current_product").insert({
    product_id: String(opts.productId).trim(),
    product_name: String(opts.productName || "").trim(),
    cleared: false,
  });
}

export async function clearCurrentProduct(sb: SupabaseClient): Promise<void> {
  await sb.from("chat_current_product").insert({ product_id: null, product_name: null, cleared: true });
}
