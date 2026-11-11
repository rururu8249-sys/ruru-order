import type { LiveWatchItem } from "@/lib/liveWatch";
import type { WidgetProductTarget } from "@/lib/widgetProductLibrary";

export function chatProductPhoto(items: LiveWatchItem[], target: WidgetProductTarget): string {
  const parent = items.find(p => p.id === target.productId);
  if (target.detailName) return parent?.details?.find(d => d.name === target.detailName)?.imageUrl || "";
  if (parent) return parent.imageUrl;
  // Linked brand rows use their source product ID in chat references.
  for (const item of items) {
    const detail = item.details?.find(d => d.productId === target.productId && d.productId !== item.id);
    if (detail) return detail.imageUrl;
  }
  return "";
}
