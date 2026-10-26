// [2026-10-26 사장님 「방송 시작 재고 > 추가·수정 재고 표시」 — 오늘 방송부터]
//   재고 흐름 = 기준 재고(방송 시작 또는 기록 시작 때 찍어 둔 숫자) → 직접 고친 재고(+/−) → 판매(주문) → 지금 재고.
//   «보기 전용». 재고 숫자를 바꾸는 곳(주문 RPC·상품 저장)은 하나도 안 건드린다. 계산·판정만 여기서.

export type StockMap = Record<string, number>; // key = "색상|사이즈" (없음·빈칸 = "")

const NONE = new Set(["없음", "선택안함", "-", "none"]);

/** 주문 RPC(inventory_auto_deduct_rpc)와 같은 규칙 — 「없음」 등은 빈칸 */
export function normOpt(v: unknown): string {
  const s = String(v ?? "").trim();
  return NONE.has(s.toLowerCase()) || NONE.has(s) ? "" : s;
}

export function optKey(color: unknown, size: unknown): string {
  return `${normOpt(color)}|${normOpt(size)}`;
}

export function splitKey(key: string): { color: string; size: string } {
  const i = key.indexOf("|");
  return { color: i < 0 ? key : key.slice(0, i), size: i < 0 ? "" : key.slice(i + 1) };
}

function parseNote(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  try { const v = JSON.parse(String(raw)); return v && typeof v === "object" ? v : null; } catch { return null; }
}

function managementOff(note: Record<string, any> | null): boolean {
  const v = String(note?.stock_management_enabled ?? "true").trim().toLowerCase();
  return ["false", "f", "0", "no", "n"].includes(v);
}

/** 상품 한 줄의 «지금 재고» — DB 트리거(ruru_sync_product_inventory_variants)와 같은 읽기.
 *  재고 관리 안 하는 상품이면 null. 옵션 재고 없으면 { "|": products.stock }. */
export function stockMapFromProductRow(row: { product_note?: unknown; stock?: unknown } | null | undefined): StockMap | null {
  if (!row) return null;
  const note = parseNote(row.product_note);
  if (managementOff(note)) return null;
  const variants = Array.isArray(note?.stock_variants) ? (note!.stock_variants as any[]) : [];
  if (variants.length > 0) {
    const out: StockMap = {};
    for (const v of variants) {
      const color = String(v?.color ?? "").trim();
      const size = String(v?.size ?? "").trim();
      const raw = String(v?.stock ?? "").trim();
      if (!color && !size && !/^[0-9]+$/.test(raw)) continue;
      const n = /^[0-9]+$/.test(raw) ? Number(raw) : 0;
      const k = optKey(color, size);
      out[k] = (out[k] ?? 0) + n;
    }
    return out;
  }
  const total = Number(row.stock);
  if (row.stock === null || row.stock === undefined || row.stock === "" || !Number.isFinite(total)) return null;
  return { "|": Math.max(0, Math.trunc(total)) };
}

export type StockChange = { key: string; color: string; size: string; before: number; after: number; delta: number };

/** 저장 전후 비교 — 바뀐 옵션만. 새로 생긴 옵션은 0→N, 없어진 옵션은 N→0. */
export function diffStockMaps(before: StockMap | null, after: StockMap | null): StockChange[] {
  if (!before && !after) return [];
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const out: StockChange[] = [];
  for (const key of keys) {
    const x = b[key] ?? 0;
    const y = a[key] ?? 0;
    if (x === y) continue;
    out.push({ key, ...splitKey(key), before: x, after: y, delta: y - x });
  }
  return out;
}

/** 이 주문 줄이 실제로 재고를 줄였는지(판매로 셀지) — 주문 RPC 기록 기준.
 *  건너뛴 줄(직접입력·재고관리 OFF 등)·재고 되돌린 줄(취소 복구)·삭제·취소는 빼고 센다. */
export function orderRowCountsAsSold(row: Record<string, any>): boolean {
  if (row?.is_deleted === true) return false;
  const ded = String(row?.inventory_deduction_status ?? "").trim();
  if (ded.startsWith("skipped")) return false;
  if (row?.inventory_restored_at) return false;
  const st = `${row?.admin_order_status_v2 ?? ""} ${row?.order_manage_status ?? ""}`;
  if (st.includes("주문취소") || st.includes("주문서취소")) return false;
  return true;
}

export type StockFlowLine = {
  key: string; color: string; size: string;
  base: number | null; // 기준 재고(없으면 null = 기준 뒤에 생긴 옵션)
  added: number;       // 직접 늘린 합
  removed: number;     // 직접 줄인 합(양수로)
  sold: number;        // 기준 뒤 판매
  now: number | null;  // 지금 재고(null = 옵션 없어짐)
  diff: number;        // 지금 − (기준 + 추가 − 수정감소 − 판매). 0 이면 맞음
};

export function buildStockFlowLines(input: {
  base: StockMap | null;
  now: StockMap | null;
  edits: { color: unknown; size: unknown; change_qty: unknown }[];
  sold: { color: unknown; size: unknown; qty: unknown }[];
}): StockFlowLine[] {
  const base = input.base ?? {};
  const now = input.now ?? {};
  const added: Record<string, number> = {};
  const removed: Record<string, number> = {};
  const sold: Record<string, number> = {};
  for (const e of input.edits) {
    const k = optKey(e.color, e.size);
    const d = Math.trunc(Number(e.change_qty) || 0);
    if (d > 0) added[k] = (added[k] ?? 0) + d;
    else if (d < 0) removed[k] = (removed[k] ?? 0) - d;
  }
  for (const s of input.sold) {
    const k = optKey(s.color, s.size);
    sold[k] = (sold[k] ?? 0) + Math.max(0, Math.trunc(Number(s.qty) || 0));
  }
  // 옵션 없는 상품(키 "|")에 색상 붙은 주문이 와도 그 상품 한 줄로 모은다
  const singleKey = Object.keys({ ...base, ...now }).length === 1 && ("|" in base || "|" in now);
  if (singleKey) {
    for (const bag of [added, removed, sold]) {
      let sum = 0;
      for (const k of Object.keys(bag)) { sum += bag[k]; delete bag[k]; }
      if (sum) bag["|"] = sum;
    }
  }
  const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(now), ...Object.keys(added), ...Object.keys(removed), ...Object.keys(sold)]));
  const order = [...Object.keys(base), ...Object.keys(now)];
  keys.sort((x, y) => {
    const ix = order.indexOf(x); const iy = order.indexOf(y);
    return (ix < 0 ? 9999 : ix) - (iy < 0 ? 9999 : iy);
  });
  return keys.map((key) => {
    const b = key in base ? base[key] : null;
    const n = key in now ? now[key] : null;
    const a = added[key] ?? 0; const r = removed[key] ?? 0; const s = sold[key] ?? 0;
    const expected = (b ?? 0) + a - r - s;
    return { key, ...splitKey(key), base: b, added: a, removed: r, sold: s, now: n, diff: (n ?? 0) - expected };
  });
}

/** 설정 표 키 — 방송: bc:<방송id> / 쇼핑몰: day:YYYY-MM-DD(한국 날짜) */
export function stockFlowScopeKey(scope: string): string | null {
  const s = String(scope ?? "").trim();
  if (/^bc:[A-Za-z0-9-]{1,64}$/.test(s) || /^day:\d{4}-\d{2}-\d{2}$/.test(s)) return `stock_flow_base:${s}`;
  return null;
}

export type StockFlowBase = { createdAt: string; items: Record<string, { at: string; stock: StockMap | null }> };

export function parseStockFlowBase(raw: unknown): StockFlowBase {
  const v = parseNote(raw);
  const items = v && typeof v.items === "object" && v.items ? v.items : {};
  return { createdAt: String(v?.createdAt ?? ""), items };
}

export function optionLabel(color: string, size: string): string {
  const t = [color, size].filter(Boolean).join(" / ");
  return t || "옵션 없음";
}
