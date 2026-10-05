import { cleanOptionValues, detailCode, detailProducts, isBrandGroup, parseProductNote, type DetailProduct, type ProductLike } from './productDetailModel';

export type DetailInfo = { mode: 'inherit' | 'custom' | 'hidden'; chips: string[]; description: string };
export type BrandProductLink = { sourceId: string; parentId: string; detailName: string; originalName: string; movedAt: string };
export type ResolvedDetail = DetailProduct & { sourceProductId: string; info: DetailInfo };
export type ResolvedCatalog = {
  roots: ProductLike[];
  detailsByParent: Map<string, Array<DetailProduct | ResolvedDetail>>;
  bySourceId: Map<string, ResolvedDetail>;
};

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
      info: { mode: 'inherit', chips: [], description: '' },
    };
    bySourceId.set(link.sourceId, detail);
    detailsByParent.set(link.parentId, [...siblings, detail]);
  }
  return { roots: products.filter(row => !bySourceId.has(String(row.id))), detailsByParent, bySourceId };
}
