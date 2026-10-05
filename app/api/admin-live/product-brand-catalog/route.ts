import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSessionFromRequest } from '@/lib/admin-auth';
import type { BrandProductLink } from '@/lib/productBrandLinks';

export const dynamic = 'force-dynamic';

/** Metadata only. Original product rows remain the existing administrator catalog's source. */
export async function GET(request: NextRequest) {
  try {
    if (!await verifyAdminSessionFromRequest(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401});
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
    if (!url || !key) throw new Error('Missing configuration');
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const links: BrandProductLink[] = [];
    for (let offset = 0; ; offset += 1000) {
      const {data,error} = await db.from('product_brand_links')
        .select('source_id,parent_id,detail_name,original_name,moved_at').order('source_id').range(offset,offset+999);
      if (error) throw error;
      const page = (data ?? []) as Record<string,unknown>[];
      for (const row of page) links.push({sourceId:String(row.source_id),parentId:String(row.parent_id),
        detailName:String(row.detail_name),originalName:String(row.original_name),movedAt:String(row.moved_at)});
      if (page.length < 1000) break;
    }
    return NextResponse.json({links},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return NextResponse.json({error:'브랜드 연결을 확인하지 못했습니다. 새로고침해주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
