// [2026-10-26] 재고 흐름 — 서버 전용. 기준 재고 찍기(settings 표 한 줄)·관리자 재고 수정 기록(inventory_ledger 에 기록만).
//   재고 숫자 자체는 절대 안 바꾼다. 모든 함수는 실패해도 throw 하지 않는다(호출한 저장이 그대로 성공하게).
import { diffStockMaps, parseStockFlowBase, stockFlowScopeKey, stockMapFromProductRow, type StockFlowBase } from "@/lib/stockFlow";

type Sb = any;

export const ADMIN_STOCK_EDIT_REASON = "admin_stock_edit";

async function writeSetting(sb: Sb, key: string, value: string) {
  const { data: ex } = await sb.from("settings").select("key").eq("key", key).limit(1);
  const res = Array.isArray(ex) && ex.length > 0
    ? await sb.from("settings").update({ value }).eq("key", key)
    : await sb.from("settings").insert({ key, value });
  if (res.error) throw new Error(res.error.message);
}

export async function readStockFlowBase(sb: Sb, scope: string): Promise<StockFlowBase | null> {
  const key = stockFlowScopeKey(scope);
  if (!key) return null;
  const { data } = await sb.from("settings").select("value").eq("key", key).limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return row ? parseStockFlowBase(row.value) : { createdAt: "", items: {} };
}

/** 아직 기준이 없는 상품만 «지금 재고»로 기준을 찍는다(이미 있는 상품은 그대로). */
export async function ensureStockFlowBase(sb: Sb, scope: string, productIds: string[]): Promise<StockFlowBase | null> {
  try {
    const key = stockFlowScopeKey(scope);
    if (!key) return null;
    const base = (await readStockFlowBase(sb, scope)) ?? { createdAt: "", items: {} };
    const ids = Array.from(new Set(productIds.map((v) => String(v ?? "").trim()).filter((v) => /^\d+$/.test(v))));
    const missing = ids.filter((id) => !base.items[id]);
    if (!missing.length) return base;
    const now = new Date().toISOString();
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200);
      const { data } = await sb.from("products").select("id,product_note,stock").in("id", chunk);
      for (const row of (data || []) as any[]) base.items[String(row.id)] = { at: now, stock: stockMapFromProductRow(row) };
    }
    if (!base.createdAt) base.createdAt = now;
    await writeSetting(sb, key, JSON.stringify(base));
    return base;
  } catch {
    return null;
  }
}

/** 이 방송 상품 전부 기준 찍기(방송 시작 때) */
export async function ensureBroadcastStockBase(sb: Sb, broadcastId: string): Promise<void> {
  try {
    const id = String(broadcastId ?? "").trim();
    if (!id) return;
    const { data } = await sb.from("broadcast_products").select("product_id").eq("broadcast_id", id);
    const pids = ((data || []) as any[]).map((r) => String(r.product_id ?? ""));
    await ensureStockFlowBase(sb, `bc:${id}`, pids);
  } catch { /* 기록 실패는 무시 */ }
}

export async function readProductStockRows(sb: Sb, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const list = Array.from(new Set(ids.filter((v) => /^\d+$/.test(String(v)))));
  if (!list.length) return out;
  try {
    for (let i = 0; i < list.length; i += 200) {
      const { data } = await sb.from("products").select("id,product_note,stock").in("id", list.slice(i, i + 200));
      for (const row of (data || []) as any[]) out.set(String(row.id), row);
    }
  } catch { /* 못 읽으면 기록 안 함 */ }
  return out;
}

/** 관리자 상품 저장 전후 비교 → 바뀐 옵션만 inventory_ledger 에 «기록»(재고는 이미 저장된 그대로). */
export async function logAdminStockEdits(sb: Sb, before: Map<string, any>, after: Map<string, any>, who: string): Promise<void> {
  try {
    const rows: any[] = [];
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b) continue;
      for (const c of diffStockMaps(stockMapFromProductRow(b), stockMapFromProductRow(a))) {
        rows.push({
          product_id: Number(id),
          color: c.color,
          size: c.size,
          change_qty: c.delta,
          reason: ADMIN_STOCK_EDIT_REASON,
          before_stock: c.before,
          after_stock: c.after,
          memo: `관리자 재고 수정 · ${String(who || "admin").slice(0, 40)}`,
        });
      }
    }
    if (rows.length) await sb.from("inventory_ledger").insert(rows);
  } catch { /* 기록 실패는 무시 — 상품 저장은 이미 끝남 */ }
}

/** catalog-write 요청에서 «건드릴 상품 id» 뽑기 — id eq/in 필터 또는 upsert 값의 id. 못 뽑으면 [] */
export function productIdsFromWrite(filters: { type: string; col: string; val: unknown }[] | undefined, values: unknown): string[] {
  const ids: string[] = [];
  for (const f of filters || []) {
    if (f?.col !== "id") continue;
    if (f.type === "eq") ids.push(String(f.val));
    else if (f.type === "in" && Array.isArray(f.val)) ids.push(...(f.val as unknown[]).map(String));
  }
  if (!ids.length && values) {
    const list = Array.isArray(values) ? values : [values];
    for (const v of list) if (v && typeof v === "object" && (v as any).id !== undefined) ids.push(String((v as any).id));
  }
  return ids.filter((v) => /^\d+$/.test(v)).slice(0, 300);
}

/** 이 저장이 재고 칸을 건드리는지 */
export function writeTouchesStock(values: unknown): boolean {
  const list = Array.isArray(values) ? values : [values];
  return list.some((v) => v && typeof v === "object" && ("product_note" in (v as any) || "stock" in (v as any)));
}
