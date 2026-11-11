import { createClient } from '@supabase/supabase-js';
import type { BrandProductLink } from './productBrandLinks';

const visible = (row: Record<string, unknown>) => ![row.status, row.product_status].some(value => ['hidden', '숨김', 'deleted'].includes(String(value)));

/** /api/product-brand-catalog 와 같은 규칙(공개 상품은 anon/RLS, 연결표만 서버 권한). 상품 위젯 카드 계산에도 씀. */
export async function loadBrandCatalogServer(inputIds: string[]): Promise<{ products: Array<Record<string, unknown>>; links: BrandProductLink[] }> {
    const ids: string[] = [...new Set<string>(inputIds)];
    if (!ids.length) return { products: [], links: [] };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
    if (!url || !anon || !service) throw new Error('Catalog configuration unavailable');
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const publicDb = createClient(url, anon, options);
    const privateDb = createClient(url, service, options);
    const { data: initial, error: initialError } = await publicDb.from('products').select('*').in('id', ids);
    if (initialError) throw initialError;
    const initialProducts = (initial ?? []).filter(visible);
    const admitted = initialProducts.map(row => String(row.id));
    if (!admitted.length) return { products: [], links: [] };
    const raw: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await privateDb.from('product_brand_links')
        .select('source_id,parent_id,detail_name,original_name,moved_at')
        .or(`source_id.in.(${admitted.join(',')}),parent_id.in.(${admitted.join(',')})`)
        .order('source_id').range(offset, offset + 999);
      if (error) throw error;
      raw.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    // Reuse rows already admitted through anon/RLS within this request only.
    // Linked rows still require their own public/RLS read; no shared price cache.
    const initialIds = new Set(admitted);
    const needed = [...new Set(raw.flatMap(link => [String(link.source_id), String(link.parent_id)]))]
      .filter(id => !initialIds.has(id));
    const products: Array<Record<string, unknown>> = [...initialProducts];
    for (let offset = 0; offset < needed.length; offset += 100) {
      const { data, error } = await publicDb.from('products').select('*').in('id', needed.slice(offset, offset + 100));
      if (error) throw error;
      products.push(...(data ?? []).filter(visible));
    }
    const publicIds = new Set(products.map(row => String(row.id)));
    const links: BrandProductLink[] = raw.filter(link => publicIds.has(String(link.source_id)) && publicIds.has(String(link.parent_id)))
      .map(link => ({ sourceId: String(link.source_id), parentId: String(link.parent_id), detailName: String(link.detail_name), originalName: String(link.original_name), movedAt: String(link.moved_at) }));
    return { products, links };
}
