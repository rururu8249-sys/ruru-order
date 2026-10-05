import type { BrandProductLink } from './productBrandLinks';
import type { ProductLike } from './productDetailModel';

type CatalogResult = { products: ProductLike[]; links: BrandProductLink[] };
type CatalogFetch = (url: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

/** Batch only requested IDs; a failed lookup must not masquerade as an empty relation. */
export async function loadProductBrandCatalog(ids: string[], request: CatalogFetch = fetch): Promise<CatalogResult> {
  const unique = [...new Set(ids)];
  const products = new Map<string, ProductLike>();
  const links = new Map<string, BrandProductLink>();
  for (let offset = 0; offset < unique.length; offset += 100) {
    const response = await request('/api/product-brand-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ ids: unique.slice(offset, offset + 100) }),
    });
    if (!response.ok) throw new Error('상품 연결 정보를 확인하지 못했습니다.');
    const data = await response.json();
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.links)) throw new Error('상품 연결 정보가 올바르지 않습니다.');
    for (const row of data.products) {
      if (!row || typeof row !== 'object' || !/^\d+$/.test(String(row.id))) throw new Error('상품 연결 정보가 올바르지 않습니다.');
      products.set(String(row.id), row);
    }
    for (const link of data.links) {
      if (!link || typeof link.sourceId !== 'string' || typeof link.parentId !== 'string'
        || typeof link.detailName !== 'string' || typeof link.originalName !== 'string' || typeof link.movedAt !== 'string') {
        throw new Error('상품 연결 정보가 올바르지 않습니다.');
      }
      const prior = links.get(link.sourceId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(link)) throw new Error('상품 연결 정보가 조회 중 변경되었습니다.');
      links.set(link.sourceId, link);
    }
  }
  return { products: [...products.values()], links: [...links.values()] };
}
