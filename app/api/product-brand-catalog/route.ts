import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { BrandProductLink } from '@/lib/productBrandLinks';

export const dynamic = 'force-dynamic';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807');
const visible = (row: Record<string, unknown>) => ![row.status, row.product_status].some(value => ['hidden', '숨김', 'deleted'].includes(String(value)));

/** Public product reads use anon/RLS; the privileged client reads relations only. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.ids) || body.ids.length > 100 || !body.ids.every(validId)) {
      return NextResponse.json({ error: '조회할 상품을 확인해주세요.' }, { status: 400 });
    }
    const ids: string[] = [...new Set<string>(body.ids)];
    if (!ids.length) return NextResponse.json({ products: [], links: [] });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
    if (!url || !anon || !service) throw new Error('Catalog configuration unavailable');
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const publicDb = createClient(url, anon, options);
    const privateDb = createClient(url, service, options);
    const { data: initial, error: initialError } = await publicDb.from('products').select('*').in('id', ids);
    if (initialError) throw initialError;
    const admitted = (initial ?? []).filter(visible).map(row => String(row.id));
    if (!admitted.length) return NextResponse.json({ products: [], links: [] });
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
    const needed = [...new Set([...admitted, ...raw.flatMap(link => [String(link.source_id), String(link.parent_id)])])];
    const products: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < needed.length; offset += 100) {
      const { data, error } = await publicDb.from('products').select('*').in('id', needed.slice(offset, offset + 100));
      if (error) throw error;
      products.push(...(data ?? []).filter(visible));
    }
    const publicIds = new Set(products.map(row => String(row.id)));
    const links: BrandProductLink[] = raw.filter(link => publicIds.has(String(link.source_id)) && publicIds.has(String(link.parent_id)))
      .map(link => ({ sourceId: String(link.source_id), parentId: String(link.parent_id), detailName: String(link.detail_name), originalName: String(link.original_name), movedAt: String(link.moved_at) }));
    return NextResponse.json({ products, links }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '상품 연결 정보를 확인하지 못했습니다. 다시 시도해주세요.' }, { status: 503 });
  }
}
