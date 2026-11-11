import type {LiveWatchItem} from './liveWatch';
import {resolveBrandOrderSelection} from './productBrandOrder';
import {expandForWidget, type ProductLike} from './productDetailModel';
import {selectWidgetRotationItems, widgetTargetKey, type WidgetProductTarget, type WidgetRotationConfig} from './widgetProductLibrary';

type Featured = LiveWatchItem & {target: WidgetProductTarget};

/** Same legacy detail price/stock projection as the widget; linked sources stay independent. */
export function liveWatchDetailProduct(parent: ProductLike, detailName: string): ProductLike {
  const source = resolveBrandOrderSelection(parent, detailName);
  if (String(source.id) !== String(parent.id)) return source;
  return expandForWidget(parent).find(row => row.__detail_name === detailName) ?? parent;
}

/** Keep the customer parent/detail route even when the widget targets an independent linked ID. */
export function featuredProducts(items: LiveWatchItem[], config: WidgetRotationConfig, history: WidgetProductTarget[], enabled: boolean, pin: WidgetProductTarget | null): LiveWatchItem[] {
  if (!enabled) return [];
  const unique = new Map<string, Featured>();
  for (const item of items) {
    const rows: Featured[] = item.brand ? (item.details ?? []).map(d => ({
      ...item, name: d.name, imageUrl: d.imageUrl, priceText: d.priceText, soldOut: d.productId && d.productId !== item.id ? d.soldOut : item.soldOut || d.soldOut,
      brand: false, count: 1, details: undefined, detailName: d.name, searchTexts: [d.name],
      target: {productId: d.productId || item.id, detailName: d.productId && d.productId !== item.id ? '' : d.name},
    })) : [{...item, target: {productId: item.id, detailName: item.detailName || ''}}];
    for (const row of rows) if (!row.soldOut && !unique.has(widgetTargetKey(row.target))) unique.set(widgetTargetKey(row.target), row);
  }
  const pool = [...unique.values()];
  if (pin) {
    const product = pool.find(p => (p.target.productId === pin.productId || p.id === pin.productId) && (!pin.detailName || p.detailName === pin.detailName));
    if (product) return [product];
  }
  return selectWidgetRotationItems(pool, config, p => p.target, () => true, history);
}
