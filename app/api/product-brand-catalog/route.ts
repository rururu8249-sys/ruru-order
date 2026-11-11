import { NextRequest, NextResponse } from 'next/server';
import { loadBrandCatalogServer } from '@/lib/productBrandCatalogServer';

export const dynamic = 'force-dynamic';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807');

/** Public product reads use anon/RLS; the privileged client reads relations only. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.ids) || body.ids.length > 100 || !body.ids.every(validId)) {
      return NextResponse.json({ error: '조회할 상품을 확인해주세요.' }, { status: 400 });
    }
    const { products, links } = await loadBrandCatalogServer(body.ids);
    return NextResponse.json({ products, links }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '상품 연결 정보를 확인하지 못했습니다. 다시 시도해주세요.' }, { status: 503 });
  }
}
