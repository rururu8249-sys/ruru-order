import type { BotCandidate } from "./liveChatBot";
import { detailCode } from "./productDetailModel";
import { splitOptionText, toOptionList } from "./optionSplit";

export type OperatorBatchResult = { codes: string[]; matched: BotCandidate[]; invalid: string[]; ambiguous: string[] };
export function operatorProductCode(item: BotCandidate): string {
  const raw = detailCode(item.detailName || item.texts?.[0] || "");
  return String(raw || "").toUpperCase().replace(/\s/g, "");
}
export function resolveOperatorCodes(input: string, catalog: BotCandidate[]): OperatorBatchResult {
  const codes = [...new Set(input.toUpperCase().trim().split(/[\s,，;；]+/).filter(Boolean))];
  const matched: BotCandidate[] = [], invalid: string[] = [], ambiguous: string[] = [];
  for (const code of codes) {
    const found = catalog.filter(item => operatorProductCode(item) === code);
    if (!found.length) invalid.push(code);
    else if (found.length > 1) ambiguous.push(code);
    else matched.push(found[0]);
  }
  return { codes, matched, invalid, ambiguous };
}
function facts(item: BotCandidate) {
  const line = String(item.line || "");
  const price = line.match(/(?:^|\/)\s*([\d,]+)\s*원/);
  // The server supplies registered options, including an intentional empty list.
  // Only legacy candidates without that array need the explicit final size field.
  // /, |, · and spaces belong to names (2026-09-08 shared option rule).
  const size = line.match(/(?:^| \/ )사이즈\s*[:：]\s*(.+)$/);
  const sizes = Array.isArray(item.sizes) ? toOptionList(item.sizes) : splitOptionText(size?.[1]);
  return { price: price?.[1].replace(/,/g, "") || "", sizes };
}
export function buildBatchAnnouncement(items: BotCandidate[]): string {
  if (!items.length) return "";
  const rows = items.map(item => ({ item, ...facts(item), code: operatorProductCode(item) }));
  const samePrice = rows.every(row => row.price && row.price === rows[0].price);
  const sameSize = rows.every(row => row.sizes.length > 0 && row.sizes.length === rows[0].sizes.length && row.sizes.every((size, i) => size === rows[0].sizes[i]));
  const labels = rows.map(row => {
    const title = String(row.item.texts?.[0] || row.item.detailName || row.item.line);
    const color = title.replace(/^\S+\s*/, "").trim();
    return `${row.code}${color ? ` ${color}` : ""}`;
  });
  const common = samePrice && sameSize;
  if (common) return `✅ ${labels.join(" / ")} 👉 ${Number(rows[0].price).toLocaleString("ko-KR")}원 / 사이즈 ${rows[0].sizes.join("·")}`;
  // Different or unknown price/size: keep the original registered line; never fabricate shared details.
  return items.map(item => `✅ ${item.line}`).join("\n");
}
