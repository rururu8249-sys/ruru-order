import type { BrandProductLink } from './productBrandLinks';
import type { ProductLike } from './productDetailModel';

type CatalogResult = { products: ProductLike[]; links: BrandProductLink[] };
type CatalogFetch = (url: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

/** Batch only requested IDs; a failed lookup must not masquerade as an empty relation. */
export async function loadProductBrandCatalog(ids: string[], request: CatalogFetch = fetch): Promise<CatalogResult> {
  const unique = [...new Set(ids)];
  const products = new Map<string, ProductLike>();
  const links = new Map<string, BrandProductLink>();
  // [2026-11-13] 100개씩 나눈 요청을 한 줄로 기다리지 않고 최대 4개씩 같이 보낸다.
  //   쇼핑몰 화면(방송 꺼짐)은 전체 상품 약 900개 = 9번을 차례로 기다려야 상품이 보였다(실측 약 2.5초).
  //   답을 합치는 순서·검사는 예전과 같다(앞 묶음부터).
  const chunks: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100) chunks.push(unique.slice(offset, offset + 100));
  const answers: unknown[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++;
      const response = await request('/api/product-brand-catalog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ ids: chunks[index] }),
      });
      if (!response.ok) throw new Error('상품 연결 정보를 확인하지 못했습니다.');
      answers[index] = await response.json();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker));
  for (const answer of answers) {
    const data = answer as { products?: unknown; links?: unknown } | null;
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
