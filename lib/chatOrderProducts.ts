// lib/chatOrderProducts.ts
// [2026-08-14] 채팅 파서에 넘길 상품 목록 로더 — 읽기 전용.
//   기준: 활성 방송(status=ON)에 담긴 broadcast_products. 없으면 가장 최근 방송.
//   조합형(combo_mode) 상품이면 products.color_options 배열을 variants로 넘겨
//   "킬리안 굿걸" 같은 세부상품명까지 잡히게 한다.
//   ⚠️ select만 한다. 재고·금액·주문 로직 무접촉.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParseProduct } from "@/lib/chatOrderParser";

// "없음/무/-" 같은 빈 옵션 표기는 세부상품명이 아니다. 채팅에서 잘못 잡히면 안 되므로 제외.
//   (기준은 위젯 cleanOptionText 의 EMPTY_OPTION_WORDS 와 동일)
const EMPTY_OPTION_WORDS = new Set(["없음", "없슴", "무", "-", "none", "n/a", "na"]);
function isMeaningfulVariant(v: string): boolean {
  const t = v.trim();
  if (t.length < 2) return false;
  return !EMPTY_OPTION_WORDS.has(t.toLowerCase());
}

// products.color_options 는 배열일 수도, JSON 문자열일 수도 있다(위젯 comboInfoOf와 동일 처리).
function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s: unknown) => String(s).trim()).filter(Boolean);
    } catch { /* 문자열 파싱 실패 → 빈 배열 */ }
  }
  return [];
}

function parseNote(raw: unknown): Record<string, unknown> | null {
  let note: unknown = raw;
  if (typeof note === "string") {
    try { note = JSON.parse(note); } catch { return null; }
  }
  return note && typeof note === "object" ? (note as Record<string, unknown>) : null;
}

export type LoadedProducts = {
  products: ParseProduct[];
  broadcastId: string | null;
  source: "live" | "recent" | "none";
};

// [시뮬레이션 전용] 방송 여부와 무관하게 "전체 상품"을 파서 형식으로 읽는다.
//   의류·신발·잡화(비조합형)도 포함 — 이름 매칭·번호 매칭 검증 대상.
//   읽기 전용(select만). 운영 파싱은 아래 loadParseProducts(방송 상품)를 그대로 쓴다.
export async function loadAllParseProducts(sb: SupabaseClient): Promise<LoadedProducts> {
  const { data } = await sb
    .from("products")
    .select("id,product_name,product_note,color_options")
    .limit(3000);
  const products: ParseProduct[] = [];
  for (const p of (data || []) as Record<string, unknown>[]) {
    const id = String(p.id ?? "").trim();
    const name = String(p.product_name ?? "").trim();
    if (!id || !name) continue;
    const note = parseNote(p.product_note);
    const variants = note?.combo_mode === true
      ? toStringArray(p.color_options).filter(isMeaningfulVariant)
      : [];
    const aliases = toStringArray(note?.chat_aliases);
    products.push({ id, name, variants, aliases });
  }
  return { products, broadcastId: null, source: "none" };
}

export async function loadParseProducts(sb: SupabaseClient): Promise<LoadedProducts> {
  // 1) 방송 선택 — ON 우선, 없으면 최근
  const { data: bcRows } = await sb
    .from("broadcasts")
    .select("id,status,is_deleted,started_at")
    .neq("is_deleted", true)
    .order("started_at", { ascending: false })
    .limit(20);
  const list = (bcRows || []) as Record<string, unknown>[];
  const live = list.find((r) => String(r.status ?? "").toUpperCase() === "ON") || null;
  const picked = live || list[0] || null;
  if (!picked) return { products: [], broadcastId: null, source: "none" };

  const broadcastId = String(picked.id);

  // 2) 그 방송에 담긴 상품
  const { data: bpRows } = await sb
    .from("broadcast_products")
    .select("product_id, sort_order, products(id,product_name,product_note,color_options)")
    .eq("broadcast_id", broadcastId);

  const products: ParseProduct[] = [];
  for (const row of (bpRows || []) as Record<string, unknown>[]) {
    const p = row.products as Record<string, unknown> | null;
    if (!p) continue;
    const id = String(p.id ?? "").trim();
    const name = String(p.product_name ?? "").trim();
    if (!id || !name) continue;

    const note = parseNote(p.product_note);
    // 조합형일 때만 세부상품명을 variants로 넘긴다. 일반 상품의 색상옵션(검정/흰색)은
    // 상품을 특정하지 못하므로 variants로 쓰면 안 된다.
    const variants = note?.combo_mode === true
      ? toStringArray(p.color_options).filter(isMeaningfulVariant)
      : [];
    // 별칭은 관리자가 product_note.chat_aliases 에 넣어두면 추가로 인식된다(선택).
    const aliases = toStringArray(note?.chat_aliases);

    products.push({ id, name, variants, aliases });
  }

  return { products, broadcastId, source: live ? "live" : "recent" };
}
