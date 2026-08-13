// lib/chatOrderPipeline.ts
// [2026-08-14] 3단계: 읽어둔 raw 채팅을 파싱해서 chat_orders 에 결과만 적어둔다.
//   ⚠️ 여기서는 장바구니에 담지 않는다. 관리자가 눈으로 검증하는 단계.
//   ⚠️ 접촉 테이블: chat_orders(쓰기) / chat_current_product·broadcasts·broadcast_products·products(읽기)
//      돈·입금·재고·주문 테이블은 읽지도 쓰지도 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChatOrder, type ParseProduct } from "@/lib/chatOrderParser";
import { loadParseProducts } from "@/lib/chatOrderProducts";
import { readSetting, writeSetting } from "@/lib/youtube";

// ── 자가진단(자동) ──────────────────────────────────────
//   상품 목록이 바뀌는 순간(방송 중 새 상품 등록 포함) 스스로 돌고,
//   "엉뚱한 상품으로 확신하는" 문장 패턴을 찾아내면 그 패턴은 실채팅에서 자동 보류 처리한다.
//   → 방송 중 아무도 들여다보지 않아도 잘못 담길 길이 막힌다.
const SETTING_PRODUCTS_SIG = "chat_order_products_sig";
export const SETTING_SELF_CHECK = "chat_order_selfcheck";

const sqz = (v: string) => v.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

export type SelfCheckBad = { text: string; expected: string; got: string; phrase: string };
export type SelfCheckResult = {
  total: number; full: number; prod: number; wrong: number; safe: number;
  productCount: number; bad: SelfCheckBad[];
};

export function selfCheckProducts(products: ParseProduct[]): SelfCheckResult {
  type Case = { text: string; src: string; expectName: string; expectVariant: string | null };
  const cases: Case[] = [];
  for (const p of products) {
    cases.push({ text: `${p.name} 주세요`, src: p.name, expectName: p.name, expectVariant: null });
    for (const v of p.variants || [])
      cases.push({ text: `${v} 주세요`, src: v, expectName: p.name, expectVariant: v });
  }
  let full = 0, prod = 0, wrong = 0, safe = 0;
  const bad: SelfCheckBad[] = [];
  for (const c of cases.slice(0, 2000)) {
    const r = parseChatOrder(c.text, products, null);
    const nameOK = r.productName && sqz(r.productName) === sqz(c.expectName);
    const varOK = c.expectVariant && r.variantName && sqz(r.variantName) === sqz(c.expectVariant);
    if (r.status !== "parsed") safe += 1;
    else if (varOK || (nameOK && !c.expectVariant)) full += 1;
    else if (nameOK) prod += 1;
    else {
      wrong += 1;
      if (bad.length < 50) bad.push({
        text: c.text,
        expected: c.expectName + (c.expectVariant ? ` / ${c.expectVariant}` : ""),
        got: (r.productName || "-") + (r.variantName ? ` / ${r.variantName}` : ""),
        phrase: sqz(c.src),
      });
    }
  }
  return { total: Math.min(cases.length, 2000), full, prod, wrong, safe, productCount: products.length, bad };
}

export type ParsePassResult = {
  ok: boolean;
  scanned: number;
  updated: number;
  byStatus: Record<string, number>;
  productCount: number;
  broadcastSource: "live" | "shop" | "recent" | "none";
  reason?: string;
};

// 「지금 이거」 변경 이력. 메시지가 쓰인 시각으로 되감아 찾는다.
type CurrentRow = { product_id: string | null; cleared: boolean; setMs: number };

// ISO 문자열 비교는 소수점 자릿수(.5 vs 없음)에 따라 어긋날 수 있어 실제 시각(ms)으로 비교한다.
function resolveCurrentAt(history: CurrentRow[], atMs: number): string | null {
  // history 는 setMs 내림차순. atMs 이하 중 첫 행이 그 시각의 상태.
  for (const row of history) {
    if (row.setMs <= atMs) {
      if (row.cleared) return null;
      const id = String(row.product_id ?? "").trim();
      return id || null;
    }
  }
  return null;
}

export async function parsePendingChatOrders(
  sb: SupabaseClient,
  opts?: { limit?: number; reparseAll?: boolean }
): Promise<ParsePassResult> {
  const limit = Math.min(Math.max(Number(opts?.limit ?? 200) || 200, 1), 500);
  const byStatus: Record<string, number> = {};
  try {
    let q = sb
      .from("chat_orders")
      .select("id,raw_message,published_at,parse_status")
      .order("id", { ascending: true })
      .limit(limit);
    if (!opts?.reparseAll) q = q.eq("parse_status", "raw");
    const { data: rows, error } = await q;
    if (error) return { ok: false, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: error.message };

    const pending = (rows || []) as Record<string, unknown>[];
    if (pending.length === 0)
      return { ok: true, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: "파싱 대기 없음" };

    const loaded = await loadParseProducts(sb);
    const products: ParseProduct[] = loaded.products;

    // 상품 목록 변경 감지 → 자가진단 자동 실행 (방송 중 새 상품 등록 즉시 반영)
    let conflictPhrases: string[] = [];
    try {
      const sig = products
        .map((p) => `${p.id}:${p.name}:${(p.variants || []).length}`)
        .sort().join("|").slice(0, 8000);
      const prevSig = await readSetting(sb, SETTING_PRODUCTS_SIG);
      if (sig !== prevSig) {
        const check = selfCheckProducts(products);
        await writeSetting(sb, SETTING_SELF_CHECK, JSON.stringify(check));
        await writeSetting(sb, SETTING_PRODUCTS_SIG, sig);
      }
      const rawCheck = await readSetting(sb, SETTING_SELF_CHECK);
      if (rawCheck) {
        const c = JSON.parse(rawCheck) as SelfCheckResult;
        conflictPhrases = (c.bad || []).map((b) => b.phrase).filter((x) => x && x.length >= 2);
      }
    } catch { /* 진단 실패는 파싱을 막지 않는다 */ }

    const { data: histRows } = await sb
      .from("chat_current_product")
      .select("product_id,cleared,set_at")
      .order("set_at", { ascending: false })
      .limit(200);
    const history = ((histRows || []) as Record<string, unknown>[])
      .map((r) => ({
        product_id: r.product_id == null ? null : String(r.product_id),
        cleared: r.cleared === true,
        setMs: new Date(String(r.set_at ?? "")).getTime(),
      }))
      .filter((r) => Number.isFinite(r.setMs)) as CurrentRow[];

    let updated = 0;
    for (const row of pending) {
      const raw = String(row.raw_message ?? "");
      const atMs = new Date(String(row.published_at ?? "")).getTime();
      const currentId = resolveCurrentAt(history, Number.isFinite(atMs) ? atMs : Date.now());
      let r = parseChatOrder(raw, products, currentId);

      // 자가진단이 찾아낸 "이름 겹침" 문장 패턴은 확신하지 않고 자동 보류한다.
      //   방송 중 새 상품이 기존 상품과 겹쳐도 사람이 안 봐도 안전.
      if (r.status === "parsed" && conflictPhrases.length > 0) {
        const sqRaw = sqz(raw);
        if (conflictPhrases.some((ph) => sqRaw.includes(ph))) {
          r = {
            ...r, status: "ambiguous",
            candidates: [r.productName || ""].filter(Boolean),
            reason: "상품명 겹침 감지 — 자동 보류 (관리자 확인)",
          };
        }
      }

      byStatus[r.status] = (byStatus[r.status] || 0) + 1;

      const { error: upErr } = await sb
        .from("chat_orders")
        .update({
          parse_status: r.status,
          parsed_product_id: r.productId,
          parsed_product_name: r.productName,
          parsed_variant: r.variantName,
          parsed_qty: r.qty,
          parsed_matched_by: r.matchedBy,
          parsed_options: r.optionTokens.join(","),
          parsed_candidates: r.candidates.join(" | "),
          parsed_reason: r.reason,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", row.id as number);
      if (!upErr) updated += 1;
    }

    return {
      ok: true,
      scanned: pending.length,
      updated,
      byStatus,
      productCount: products.length,
      broadcastSource: loaded.source,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, scanned: 0, updated: 0, byStatus, productCount: 0, broadcastSource: "none", reason: msg };
  }
}
