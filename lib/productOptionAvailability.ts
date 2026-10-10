/** Independent sale state; numeric inventory is deliberately not consulted here. */
export function isOptionManuallySoldOut(note: unknown, color: string, size: string, detailName = ""): boolean {
  let parsed = note;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return false; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.stock_variants)) return false;
  const norm = (value: unknown) => { const text = String(value ?? "").trim(); return text === "없음" ? "" : text; };
  const c = norm(color), s = norm(size), detail = detailName.trim();
  const group = data.brand_group as {detail_options?: Record<string, unknown>} | undefined;
  const joined = group?.detail_options && Object.prototype.hasOwnProperty.call(group.detail_options, detail)
    ? `${detail} / ${c || "없음"}` : null;
  return data.stock_variants.some(value => {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return row.manual_soldout === true && norm(row.size) === s &&
      (norm(row.color) === c || (joined !== null && String(row.color ?? "").trim() === joined));
  });
}
