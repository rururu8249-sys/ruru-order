import { cleanOptionValues, detailCode, detailProducts, expandForWidget, isBrandGroup, parseProductNote, type DetailProduct, type ProductLike } from './productDetailModel';
import { normalizeProductSearchText, productSearchMatches } from './productSearch';
import { linkedSourceInfo } from './productDetailInfo';

export type DetailInfo = { mode: 'inherit' | 'custom' | 'hidden'; chips: string[]; description: string };
export type BrandProductLink = { sourceId: string; parentId: string; detailName: string; originalName: string; movedAt: string };
export type ResolvedDetail = DetailProduct & { sourceProductId: string; info: DetailInfo };
export type ResolvedCatalog = {
  roots: ProductLike[];
  detailsByParent: Map<string, Array<DetailProduct | ResolvedDetail>>;
  bySourceId: Map<string, ResolvedDetail>;
};

export function resolveAdminBrandTarget(products:ProductLike[],catalog:ResolvedCatalog,row:ProductLike,detailName=''): {product:ProductLike;detailName:string} {
  const linked=detailName
    ? (catalog.detailsByParent.get(String(row.id)) ?? []).find(detail=>detail.detailName===detailName && 'sourceProductId' in detail)
    : catalog.bySourceId.get(String(row.id));
  if(!linked || !('sourceProductId' in linked))return {product:row,detailName};
  const source=products.find(product=>String(product.id)===linked.sourceProductId);
  if(!source)throw new Error('연결된 원본 상품을 찾을 수 없습니다.');
  return {product:{...source,product_name:linked.detailName,__linked_brand_parent:products.find(product=>String(product.id)===linked.parentId)},detailName:''};
}

export function searchBrandDetails(catalog: ResolvedCatalog, parentId: string, query: string): Array<DetailProduct | ResolvedDetail> {
  const normalized = normalizeProductSearchText(query);
  if (!normalized) return [];
  return (catalog.detailsByParent.get(parentId) ?? []).filter(detail => productSearchMatches(detail.detailName, normalized)
    || productSearchMatches(detail.code, normalized) || detail.colors.some(color => productSearchMatches(color, normalized))
    || detail.sizes.some(size => normalizeProductSearchText(size) === normalized));
}

/** Presentation relation only. Original rows remain the sole inventory/order owners. */
export function resolveBrandCatalog(products: ProductLike[], links: BrandProductLink[]): ResolvedCatalog {
  const rows = new Map(products.map(row => [String(row.id), row]));
  const detailsByParent: ResolvedCatalog['detailsByParent'] = new Map();
  const bySourceId = new Map<string, ResolvedDetail>();
  for (const row of products) {
    const details = detailProducts(row, { includeHidden: true });
    if (details.length) detailsByParent.set(String(row.id), details);
  }
  for (const link of links) {
    const source = rows.get(link.sourceId);
    const parent = rows.get(link.parentId);
    if (!source) throw new Error(`Unresolved link source: ${link.sourceId}`);
    if (!parent) throw new Error(`Unresolved link parent: ${link.parentId}`);
    if (source === parent || !isBrandGroup(parent) || isBrandGroup(source)) throw new Error('Invalid brand link');
    if (bySourceId.has(link.sourceId)) throw new Error(`Duplicate linked source: ${link.sourceId}`);
    const siblings = detailsByParent.get(link.parentId) ?? [];
    if (siblings.some(detail => detail.detailName === link.detailName)) throw new Error(`Duplicate detail name: ${link.detailName}`);
    if (siblings.some(detail => detail.code === detailCode(link.detailName))) throw new Error(`Duplicate detail code: ${link.detailName}`);
    const note = parseProductNote(source);
    const rawVariants = Array.isArray(note.stock_variants) ? note.stock_variants : [];
    const stockVariants = rawVariants.map(value => {
      const v = value as Record<string, unknown>;
      return { color: String(v.color ?? ''), size: String(v.size ?? ''), stock: Number(v.stock ?? 0) };
    });
    const images = [...new Set([
      source.image_url ?? source.main_image_url ?? source.external_image_url,
      ...(Array.isArray(source.detail_image_urls) ? source.detail_image_urls : []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const detail: ResolvedDetail = {
      parentId: link.parentId, parentName: String(parent.product_name ?? ''),
      detailName: link.detailName, code: detailCode(link.detailName), sourceProductId: link.sourceId,
      hidden: [source.product_status, source.status].some(status => ['hidden', '숨김', 'deleted'].includes(String(status))),
      price: Number(source.price), images, image: images[0] ?? '',
      colors: cleanOptionValues(source.color_options), sizes: cleanOptionValues(source.size_options),
      stockManaged: note.stock_management_enabled === true, stockVariants,
      stock: source.stock == null ? null : Number(source.stock),
      info: linkedSourceInfo(source),
    };
    bySourceId.set(link.sourceId, detail);
    detailsByParent.set(link.parentId, [...siblings, detail]);
  }
  return { roots: products.filter(row => !bySourceId.has(String(row.id))), detailsByParent, bySourceId };
}

/** Display projection only. id and option stock keys always belong to the original row. */
export function resolveBroadcastBrandProducts(
  products: ProductLike[], links: BrandProductLink[], broadcastProductIds: string[],
): ProductLike[] {
  const catalog = resolveBrandCatalog(products, links);
  const rows = new Map(products.map(row => [String(row.id), row]));
  const result: ProductLike[] = [];
  const emitted = new Set<string>();
  const visible = (row: ProductLike) => ![row.product_status, row.status].some(value => ['hidden', '숨김', 'deleted'].includes(String(value)));
  const emitLinked = (detail: ResolvedDetail) => {
    const source = rows.get(detail.sourceProductId)!; // resolveBrandCatalog rejects unresolved links.
    const key = `source:${detail.sourceProductId}`;
    if (detail.hidden || emitted.has(key)) return;
    emitted.add(key);
    result.push({ ...source, product_name: detail.detailName,
      __parent_product_id: detail.parentId, __detail_name: detail.detailName,
      __detail_code: detail.code, __source_product_id: detail.sourceProductId });
  };
  for (const id of [...new Set(broadcastProductIds)]) {
    const row = rows.get(id);
    if (!row) throw new Error(`Unresolved broadcast product: ${id}`);
    if (!visible(row)) continue;
    const linked = catalog.bySourceId.get(id);
    if (linked) { emitLinked(linked); continue; }
    const linkedDetails = (catalog.detailsByParent.get(id) ?? []).filter((detail): detail is ResolvedDetail => 'sourceProductId' in detail);
    const legacyItems = isBrandGroup(row) && linkedDetails.length && !detailProducts(row, { includeHidden: false }).length ? [] : expandForWidget(row);
    for (const item of legacyItems) {
      const key = `legacy:${id}:${String(item.__detail_name ?? '')}`;
      if (!emitted.has(key)) { emitted.add(key); result.push(item); }
    }
    for (const detail of linkedDetails) emitLinked(detail);
  }
  return result;
}

/** Chat keeps legacy parent variants intact; linked leaves retain their inventory owner ID. */
export function resolveChatBrandProducts(products: ProductLike[], links: BrandProductLink[], requestedIds: string[]): ProductLike[] {
  const catalog = resolveBrandCatalog(products, links);
  const rows = new Map(products.map(row => [String(row.id), row]));
  const result: ProductLike[] = [];
  const emitted = new Set<string>();
  const emit = (row: ProductLike) => {
    const id = String(row.id);
    if (emitted.has(id) || [row.product_status, row.status].some(value => ['hidden', '숨김', 'deleted'].includes(String(value)))) return;
    emitted.add(id);
    result.push(row);
  };
  const leaf = (detail: ResolvedDetail) => emit({ ...rows.get(detail.sourceProductId)!, product_name: detail.detailName });
  for (const id of new Set(requestedIds)) {
    const row = rows.get(id);
    if (!row) throw new Error(`Unresolved chat product: ${id}`);
    if ([row.product_status, row.status].some(value => ['hidden', '숨김', 'deleted'].includes(String(value)))) continue;
    const linked = catalog.bySourceId.get(id);
    if (linked) { leaf(linked); continue; }
    const children = (catalog.detailsByParent.get(id) ?? []).filter((detail): detail is ResolvedDetail => 'sourceProductId' in detail);
    if (!isBrandGroup(row) || !children.length || detailProducts(row, { includeHidden: false }).length) emit(row);
    for (const child of children) leaf(child);
  }
  return result;
}
