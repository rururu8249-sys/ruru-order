import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSessionFromRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
const validId = (value: unknown): value is string => typeof value === 'string' && value.length <= 19 && /^[1-9][0-9]*$/.test(value) && BigInt(value) <= BigInt('9223372036854775807');
const validVersion = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!await verifyAdminSessionFromRequest(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers});
    const params = new URL(request.url).searchParams;
    const sourceId = params.get('sourceId'), parentId = params.get('parentId');
    if (!validId(sourceId) || !validId(parentId) || sourceId === parentId) return NextResponse.json({error:'상품과 브랜드를 확인해주세요.'},{status:400,headers});
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
    if (!url || !key) throw new Error('Missing server configuration');
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error} = await db.rpc('product_brand_move_snapshot',{p_source_id:sourceId,p_parent_id:parentId});
    if (error) throw error;
    if (!data) return NextResponse.json({error:'상품 또는 브랜드를 찾을 수 없습니다.'},{status:404,headers});
    return NextResponse.json(data,{headers});
  } catch {
    return NextResponse.json({error:'최신 상품 상태를 불러오지 못했습니다. 다시 확인해주세요.'},{status:503,headers});
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdminSessionFromRequest(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401});
    const body = await request.json().catch(()=>null);
    if (!body || !['move','undo'].includes(body.action) || !validId(body.sourceId) || !validId(body.parentId)
      || body.sourceId === body.parentId || !validVersion(body.expectedSourceVersion) || !validVersion(body.expectedParentVersion)
      || typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.requestId)
      || (body.action === 'move' && (typeof body.detailName !== 'string' || !body.detailName.trim() || [...body.detailName.trim()].length > 200))) {
      return NextResponse.json({error:'상품·브랜드·상품명과 최신 상태를 확인해주세요.'},{status:400});
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
    if (!url || !key) throw new Error('관리자 저장 설정이 없습니다.');
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error} = await db.rpc('product_brand_move',{
      p_action:body.action,p_source_id:body.sourceId,p_parent_id:body.parentId,
      p_detail_name:body.action==='move'?body.detailName.trim():null,p_request_id:body.requestId,
      p_source_version:body.expectedSourceVersion,p_parent_version:body.expectedParentVersion,
    });
    if (error) {
      const status = ['40001','23505'].includes(error.code)?409:error.code==='22023'?400:500;
      return NextResponse.json({error:status===409?'상품 상태가 변경되었거나 같은 상품이 있습니다. 새 상태를 확인해주세요.':status===400?'이동할 상품과 브랜드를 확인해주세요.':'저장하지 못했습니다. 다시 확인해주세요.'},{status});
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({error:'저장하지 못했습니다. 다시 확인해주세요.'},{status:500});
  }
}
