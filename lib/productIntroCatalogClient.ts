import {parseProductIntro, type ProductIntro} from "./productIntro";
type Target = {productId: string; detailName: string};
type Entry = {at: number; items?: Map<string, ProductIntro>; pending?: Promise<Map<string, ProductIntro>>};
const cache = new Map<string, Entry>();
const scopeKey = (bc: string, video: string) => JSON.stringify([bc, video]);
const targetKey = (target: Target) => JSON.stringify([target.productId, target.detailName]);

/** Memory only; never share a bookmark across broadcasts, videos or detail products. */
export function peekProductIntro(bc: string, video: string, target: Target): ProductIntro | null | undefined {
  const entry = cache.get(scopeKey(bc, video));
  if (!entry?.items || Date.now() - entry.at > 120000) return undefined;
  return entry.items.get(targetKey(target)) ?? null;
}
export function invalidateProductIntroCatalog(bc: string, video: string) { cache.delete(scopeKey(bc, video)); }
export function loadProductIntroCatalog(bc: string, video: string, target?: Target): Promise<Map<string, ProductIntro>> {
  const key = scopeKey(bc, video);
  const previous = cache.get(key);
  if (previous?.pending) return previous.pending;
  // Missing links have a shorter lifetime: an operator may have just recorded one.
  const freshness = target && !previous?.items?.has(targetKey(target)) ? 5000 : 30000;
  if (previous?.items && Date.now() - previous.at <= freshness) return Promise.resolve(previous.items);
  const entry: Entry = {at: previous?.at ?? 0, items: previous?.items};
  cache.set(key, entry);
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  entry.pending = fetch(`/api/live-chat/product-intro?${new URLSearchParams({bc, video, all: "1"})}`, {signal: controller.signal, cache: "no-store"})
    .then(async response => {
      if (!response.ok) throw new Error("영상 확인에 실패했어요.");
      const data = await response.json();
      if (!Array.isArray(data?.items)) throw new Error("영상 확인에 실패했어요.");
      const items = new Map<string, ProductIntro>();
      for (const item of data.items) {
        const intro = parseProductIntro(item?.intro, video);
        if (intro && typeof item.productId === "string" && typeof item.detailName === "string") items.set(targetKey(item), intro);
      }
      if (cache.get(key) === entry) { entry.items = items; entry.at = Date.now(); }
      return items;
    }).finally(() => { clearTimeout(timer); entry.pending = undefined; });
  return entry.pending;
}
