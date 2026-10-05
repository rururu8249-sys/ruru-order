import { resolveBrandCatalog, type BrandProductLink } from './productBrandLinks';
import { parseProductNote, type ProductLike } from './productDetailModel';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Read-only UI projection. Linked stock never enters the parent's stock_variants. */
export function buildBrandOrderCatalog(products: ProductLike[], links: BrandProductLink[], requestedIds: string[]): ProductLike[] {
  const catalog = resolveBrandCatalog(products, links);
  const rows = new Map(products.map(row => [String(row.id), row]));
  const requested = new Set(requestedIds);
  return [...requested].filter(id => !catalog.bySourceId.has(id) || !requested.has(catalog.bySourceId.get(id)!.parentId)).map(id => {
    const parent = rows.get(id);
    if (!parent) throw new Error(`Unresolved order product: ${id}`);
    const linked = (catalog.detailsByParent.get(id) ?? []).filter(detail => 'sourceProductId' in detail && !detail.hidden);
    if (!linked.length) return parent;
    const note = parseProductNote(parent);
    const group = record(note.brand_group);
    const options: Record<string, unknown> = Object.assign(Object.create(null),record(group.detail_options));
    const photos: Record<string, unknown> = Object.assign(Object.create(null),record(note.detail_photo_sets));
    const sources: Record<string, ProductLike> = Object.create(null);
    for (const detail of linked) {
      if (!('sourceProductId' in detail)) continue;
      const source = rows.get(detail.sourceProductId)!;
      sources[detail.detailName] = {...source, product_name: detail.detailName};
      const variants = detail.stockVariants.length
        ? detail.stockVariants.map(({color,size}) => ({color,size}))
        : (detail.colors.length ? detail.colors : ['']).flatMap(color => (detail.sizes.length ? detail.sizes : ['']).map(size => ({color,size})));
      options[detail.detailName] = {colors: detail.colors, sizes: detail.sizes, variants};
      photos[detail.detailName] = detail.images;
    }
    const axes = Array.isArray(note.option_axes) ? note.option_axes.map(axis => ({...record(axis)})) : [];
    const names = [...new Set([...Object.keys(options), ...(Array.isArray(note.combo_detail_values) ? note.combo_detail_values.map(String) : [])])];
    const detailAxis = axes.find(axis => axis.key === 'detail');
    if (detailAxis) detailAxis.values = names;
    else axes.unshift({key:'detail',label:'세부상품',values:names});
    if (!axes.some(axis => axis.key === 'color' || axis.key === 'size')) axes.push({key:'size',label:'사이즈',values:[]});
    return {...parent, __linked_order_sources:sources, product_note:{...note,
      option_axes:axes, combo_detail_values:names, detail_photo_sets:photos,
      brand_group:{...group,detail_options:options}}};
  });
}

export function resolveBrandOrderSelection(parent: ProductLike, detailName: string): ProductLike {
  const sources = record(parent.__linked_order_sources);
  if (!Object.prototype.hasOwnProperty.call(sources, detailName)) return parent;
  const source = record(sources[detailName]);
  if (!/^\d+$/.test(String(source.id ?? '')) || [source.status,source.product_status].some(value => ['hidden','숨김','deleted'].includes(String(value)))) {
    throw new Error('선택한 상품의 연결 상태를 확인해주세요.');
  }
  return source;
}

export function findBrandOrderProductById(products: ProductLike[], id: string): ProductLike | null {
  const direct = products.find(row => String(row.id) === id);
  if (direct) return direct;
  for (const row of products) {
    for (const source of Object.values(record(row.__linked_order_sources))) {
      if (String(record(source).id) === id) return record(source);
    }
  }
  return null;
}
