import { detailCode } from "@/lib/productDetailModel";
import { brandQueryVariants, normalizeProductSearchText } from "@/lib/productSearch";
import type { BotCandidate } from "@/lib/liveChatBot";

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
