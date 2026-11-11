import { detailCode } from "@/lib/productDetailModel";
import { brandNameCodePrefixes, brandQueryVariants, detailCodePrefix, normalizeProductSearchText, productSearchMatches } from "@/lib/productSearch";
import type { BotCandidate } from "@/lib/liveChatBot";
import { normalizeWidgetTarget, widgetTargetKey, type WidgetProductTarget } from "@/lib/widgetProductLibrary";

export const CHAT_PRODUCT_LIMIT = 20;
export type ChatProductBatch = { targets: WidgetProductTarget[]; mode: "replace" | "append" };
export type ChatProductSelection = WidgetProductTarget | ChatProductBatch;

export function parseChatProductSelection(raw: unknown): ChatProductBatch | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.targets) || !value.targets.length || value.targets.length > CHAT_PRODUCT_LIMIT || !["replace", "append"].includes(String(value.mode))) return null;
  const targets = value.targets.map(normalizeWidgetTarget);
  if (targets.some(t => !t)) return null;
  return { targets: [...new Map((targets as WidgetProductTarget[]).map(t => [widgetTargetKey(t), t])).values()], mode: value.mode as ChatProductBatch["mode"] };
}

/** Commas are separated before normalizing; ambiguous terms are never auto-executed. */
export function parseChatProductQueries(body: string): string[] | null {
  if (!body.trimStart().startsWith("/")) return null;
  const terms = body.normalize("NFKC").trim().slice(1).split(",").map(t => t.trim());
  if (!terms.length || terms.length > CHAT_PRODUCT_LIMIT) return null;
  const queries = terms.map(t => parseChatProductCommand(`/${t}`));
  return queries.every(Boolean) ? queries as string[] : null;
}

export function searchChatProductGroups(query: string, items: BotCandidate[]): Array<{ term: string; items: BotCandidate[] }> {
  return query.normalize("NFKC").split(",").map(term => {
    const q = normalizeProductSearchText(term);
    const command = parseChatProductCommand(`/${term.trim()}`);
    const codes = new Set(brandNameCodePrefixes(q));
    return { term: term.trim(), items: !q ? items : command ? matchChatProductCommand(command, items) : items.filter(p =>
      p.texts.some(t => codes.has(detailCodePrefix(t)) || productSearchMatches(t, q))) };
  });
}

/** Only a whole /code message is a command; normal conversation never changes the widget. */
export function parseChatProductCommand(body: string): string | null {
  const match = body.normalize("NFKC").trim().match(/^\/\s*((?:[A-Za-z가-힣]{1,12}\s*-?\s*)?\d{2,6}[A-Za-z]?)$/);
  return match ? normalizeProductSearchText(match[1]) : null;
}

export function matchChatProductCommand(query: string, candidates: BotCandidate[]): BotCandidate[] {
  const variants = new Set([query, ...brandQueryVariants(query)]);
  const matches = new Map<string, BotCandidate>();
  for (const candidate of candidates) {
    const code = normalizeProductSearchText(detailCode(candidate.detailName || candidate.texts[0] || ""));
    if (!/^[a-z]+\d+[a-z]*$/.test(code)) continue;
    const matchesCode = /^\d/.test(query) ? code.replace(/^[a-z]+/, "") === query : variants.has(code);
    if (matchesCode) matches.set(`${candidate.productId}|${candidate.detailName}`, candidate);
  }
  return [...matches.values()];
}
