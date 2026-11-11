import type {LiveWatchItem} from './liveWatch';
import type {ProductIntro} from './productIntro';
import {featuredProducts} from './liveFeaturedProducts';
import type {WidgetProductTarget} from './widgetProductLibrary';

export type ReplayProductGroup = {seconds: number; products: LiveWatchItem[]};

export function replayProductTimeline(catalog: Map<string, ProductIntro>, items: LiveWatchItem[], videoId: string): ReplayProductGroup[] {
  const pool = featuredProducts(items, {mode: 'all', paused: false, targets: []}, [], true, null) as Array<LiveWatchItem & {target: WidgetProductTarget}>;
  const groups = new Map<number, LiveWatchItem[]>();
  for (const [key, intro] of catalog) {
    if (intro.videoId !== videoId || !Number.isFinite(intro.seconds) || intro.seconds < 0) continue;
    let target: unknown;
    try { target = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(target) || target.length !== 2 || typeof target[0] !== 'string' || typeof target[1] !== 'string') continue;
    // Keep even empty groups: an unavailable next item must end the previous card.
    const products = groups.get(intro.seconds) ?? [];
    for (const product of pool) {
      if ((product.target.productId === target[0] && product.target.detailName === target[1]) ||
        (product.id === target[0] && (product.detailName ?? '') === target[1])) {
        if (!products.includes(product)) products.push(product);
      }
    }
    groups.set(intro.seconds, products);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([seconds, products]) => ({seconds, products}));
}

export function replayGroupIndex(timeline: ReplayProductGroup[], seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return -1;
  let low = 0, high = timeline.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (timeline[mid].seconds <= seconds) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found;
}
