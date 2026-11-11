import { getServiceClient } from "./youtube";
import { loadBrandCatalogServer } from "./productBrandCatalogServer";
import { resolveBroadcastBrandProducts } from "./productBrandLinks";
import { isAvailableWidgetProduct } from "./widgetAvailability";
import {
  parseWidgetHistory, parseWidgetRotation, selectWidgetRotationItems, widgetRotationSettingKey,
  widgetTargetFromProduct, WIDGET_PRODUCT_HISTORY_SETTING_KEY, type WidgetProductTarget, type WidgetRotationConfig,
} from "./widgetProductLibrary";
import { SITE_PRODUCT_CARD_OFF_KEY, isSiteProductCardOff } from "./liveSiteProductCard";

export type WidgetFeaturedState = {
  enabled: boolean;
  config: WidgetRotationConfig;
  targets: WidgetProductTarget[];
  pinned: boolean;
  siteCardOff: boolean;
};

const EMPTY: WidgetRotationConfig = { mode: "all", paused: false, targets: [] };

/**
 * [2026-11-12 사장님 「소개 카드가 지맘대로 바뀌고 위젯이랑 다르게 나옴」]
 * 상품 위젯(ProductWidgetClient)과 «같은 함수·같은 순서»로 지금 도는 상품 목록을 만든다.
 * 사이트 카드는 이 목록과 같은 시계(rotationIndex)를 써서 위젯과 같은 상품을 보여 준다. 읽기만.
 */
export async function computeWidgetFeatured(bc: string): Promise<WidgetFeaturedState> {
  const sb = getServiceClient();
  const [bcRes, links, rotation, history, siteCard] = await Promise.all([
    sb.from("broadcasts").select("id,status,is_deleted,widget_card_enabled,widget_pin_mode,widget_pin_product_id,widget_pin_detail_name").eq("id", bc).maybeSingle(),
    sb.from("broadcast_products").select("product_id, sort_order").eq("broadcast_id", bc).order("sort_order", { ascending: true }),
    sb.from("settings").select("value").eq("key", widgetRotationSettingKey(bc)).maybeSingle(),
    sb.from("settings").select("value").eq("key", WIDGET_PRODUCT_HISTORY_SETTING_KEY).maybeSingle(),
    sb.from("settings").select("value").eq("key", SITE_PRODUCT_CARD_OFF_KEY).maybeSingle(),
  ]);
  if (bcRes.error || links.error || rotation.error || siteCard.error) throw new Error("featured unavailable");
  const row = bcRes.data as Record<string, unknown> | null;
  const siteCardOff = isSiteProductCardOff(siteCard.data?.value, bc);
  if (!row || row.is_deleted === true || row.widget_card_enabled === false) return { enabled: false, config: EMPTY, targets: [], pinned: false, siteCardOff };
  const ids = ((links.data as { product_id: unknown }[]) || []).map(r => String(r.product_id));
  const catalog = await loadBrandCatalogServer(ids);
  const all = resolveBroadcastBrandProducts(catalog.products as never, catalog.links,
    ids.filter(id => catalog.products.some(p => String(p.id) === id))) as Array<Record<string, unknown>>;
  const config = parseWidgetRotation(rotation.data?.value);
  const rot = selectWidgetRotationItems(all, config, widgetTargetFromProduct, isAvailableWidgetProduct,
    history.error ? [] : parseWidgetHistory(history.data?.value));
  const pinMode = String(row.widget_pin_mode || "auto");
  const pinProductId = String(row.widget_pin_product_id ?? "");
  const pinDetailName = String(row.widget_pin_detail_name || "").trim();
  const pinned = pinMode === "pin" && pinProductId ? all.filter(isAvailableWidgetProduct).find(item => {
    const target = widgetTargetFromProduct(item);
    const parentId = String(item.__parent_product_id ?? target.productId);
    const detail = String(item.__detail_name ?? "").trim();
    return (target.productId === pinProductId || parentId === pinProductId) && (!pinDetailName || detail === pinDetailName);
  }) : undefined;
  if (pinned) return { enabled: true, config, targets: [widgetTargetFromProduct(pinned)], pinned: true, siteCardOff };
  return { enabled: true, config, targets: rot.map(widgetTargetFromProduct), pinned: false, siteCardOff };
}
