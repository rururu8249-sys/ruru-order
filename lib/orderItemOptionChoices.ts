// [2026-10-27 사장님 「상품 수정할 때 칸에 직접 쓰지 말고 고르게」]
//   주문상세 「상품 수정」에서 색상·사이즈를 그 상품의 «지금 재고표»(note.stock_variants)에서 고르게 한다.
//   재고 RPC 가 찾는 키가 바로 이 재고표라, 오타·옛 이름(차콜 핑크셔츠)으로 저장될 일이 없어진다.
//   브랜드 묶음·조합형(세부상품)·재고 관리 OFF 상품은 지금처럼 직접 입력(null 반환).

export type OptionChoiceRow = { color: string; size: string; stock: number };
export type OrderItemOptionChoices = { rows: OptionChoiceRow[]; colors: string[]; hasColor: boolean; hasSize: boolean };

const NONE = new Set(["", "없음", "선택안함", "-", "none"]);
export const normChoice = (v: unknown) => {
  const s = String(v ?? "").trim();
  return NONE.has(s.toLowerCase()) ? "" : s;
};

function parseNote(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  try { const v = JSON.parse(String(raw)); return v && typeof v === "object" ? v : null; } catch { return null; }
}

export function readOrderItemOptionChoices(product: { product_note?: unknown } | null | undefined): OrderItemOptionChoices | null {
  const note = parseNote(product?.product_note);
  if (!note) return null;
  if (note.brand_group?.enabled === true || note.combo_mode === true || Array.isArray(note.option_axes)) return null;
  const off = String(note.stock_management_enabled ?? "true").trim().toLowerCase();
  if (["false", "f", "0", "no", "n"].includes(off)) return null;
  const variants = Array.isArray(note.stock_variants) ? note.stock_variants : [];
  const rows: OptionChoiceRow[] = [];
  for (const v of variants) {
    const color = normChoice(v?.color);
    const size = normChoice(v?.size);
    if (!color && !size) continue;
    const k = `${color}|${size}`;
    const n = /^[0-9]+$/.test(String(v?.stock ?? "").trim()) ? Number(v.stock) : 0;
    const hit = rows.find((r) => `${r.color}|${r.size}` === k);
    if (hit) { hit.stock += n; continue; }
    rows.push({ color, size, stock: n });
  }
  if (!rows.length) return null;
  const colors: string[] = [];
  for (const r of rows) if (r.color && !colors.includes(r.color)) colors.push(r.color);
  return { rows, colors, hasColor: colors.length > 0, hasSize: rows.some((r) => r.size) };
}

export function sizesForColor(choices: OrderItemOptionChoices, color: string): OptionChoiceRow[] {
  const c = normChoice(color);
  return choices.rows.filter((r) => r.size && r.color === c);
}

/** 이 주문 줄의 지금 옵션이 상품 재고표에 있는지 */
export function choiceExists(choices: OrderItemOptionChoices, color: unknown, size: unknown): boolean {
  const c = normChoice(color);
  const s = normChoice(size);
  return choices.rows.some((r) => r.color === c && r.size === s);
}
