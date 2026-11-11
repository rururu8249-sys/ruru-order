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

/**
 * [2026-11-12] 서버가 위젯과 같은 규칙으로 정한 순환 목록(targets)을 손님 화면 상품 줄로 바꾼다.
 * 품절 판정은 서버(위젯 기준)가 이미 했으므로 여기서는 거르지 않는다 — 목록 길이·순서를 위젯과 똑같이 유지.
 */
export function featuredFromTargets(items: LiveWatchItem[], targets: WidgetProductTarget[]): Array<LiveWatchItem | null> {
  const byKey = new Map<string, LiveWatchItem>();
  for (const item of items) {
    const rows: Featured[] = item.brand ? (item.details ?? []).map(d => ({
      ...item, name: d.name, imageUrl: d.imageUrl, priceText: d.priceText, soldOut: false,
      brand: false, count: 1, details: undefined, detailName: d.name, searchTexts: [d.name],
      target: {productId: d.productId || item.id, detailName: d.productId && d.productId !== item.id ? '' : d.name},
    })) : [{...item, soldOut: false, target: {productId: item.id, detailName: item.detailName || ''}}];
    for (const row of rows) if (!byKey.has(widgetTargetKey(row.target))) byKey.set(widgetTargetKey(row.target), row);
  }
  return targets.map(t => byKey.get(widgetTargetKey(t)) ?? null);
}
