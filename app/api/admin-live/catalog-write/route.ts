import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// 관리자 전용 카탈로그 쓰기 프록시.
//   목적(보안): products / broadcasts / broadcast_products 의 쓰기(insert/update/delete/upsert)를
//   브라우저 anon 키가 아니라 "관리자 인증 + service_role(서버)"로만 수행하게 한다.
//   → 이 3개 테이블에 RLS를 켜고 anon 쓰기를 차단해도 관리자 상품/방송 관리는 정상 동작.
//   ⚠️ 돈/입금/정산/포인트/재고/주문 로직과 무관 — 상품·방송 카탈로그 쓰기 전용.
//   ⚠️ 화이트리스트된 3개 테이블 외에는 절대 쓰지 않음(임의 테이블 쓰기 방지).

export const dynamic = "force-dynamic";

const ALLOWED_TABLES = new Set(["products", "broadcasts", "broadcast_products"]);

type WriteFilter = { type: "eq" | "in"; col: string; val: unknown };
type WriteBody = {
  table?: string;
  op?: "insert" | "update" | "delete" | "upsert";
  values?: unknown;
  filters?: WriteFilter[];
  select?: string;
  single?: boolean;
  upsertOptions?: Record<string, unknown>;
  expectedVersion?: string;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const headers={'Cache-Control':'no-store'};
  try {
    if (!await verifyAdminSessionFromRequest(request)) return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers});
    const id=new URL(request.url).searchParams.get('productId');
    if (!id || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id)>BigInt('9223372036854775807')) return NextResponse.json({error:'상품을 확인해주세요.'},{status:400,headers});
    const {data,error}=await getServiceClient().rpc('product_catalog_edit_snapshot',{p_id:id});
    if(error) throw error;
    return NextResponse.json(data ?? {error:'상품을 찾을 수 없습니다.'},{status:data?200:404,headers});
  } catch {return NextResponse.json({error:'최신 상품을 불러오지 못했습니다. 다시 열어주세요.'},{status:503,headers});}
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "관리자 로그인이 필요합니다." } }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as WriteBody | null;
    const table = String(body?.table || "");
    const op = body?.op;

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json(
        { data: null, error: { message: `허용되지 않은 테이블입니다: ${table}` } },
        { status: 400 },
      );
    }
    if (!op || !["insert", "update", "delete", "upsert"].includes(op)) {
      return NextResponse.json({ data: null, error: { message: `잘못된 op: ${op}` } }, { status: 400 });
    }

    const supabase = getServiceClient();
    if(body?.expectedVersion !== undefined) {
      const filters=Array.isArray(body.filters)?body.filters:[];
      const id=filters.length===1 && filters[0].type==='eq' && filters[0].col==='id' ? String(filters[0].val) : '';
      if(table!=='products'||op!=='update'||!/^\d+$/.test(id)||!/^[a-f0-9]{32}$/.test(body.expectedVersion)||!body.values||Array.isArray(body.values)||typeof body.values!=='object') {
        return NextResponse.json({data:null,error:{message:'상품 저장 요청을 확인해주세요.'}},{status:400});
      }
      const {data,error}=await supabase.rpc('product_catalog_update',{p_id:id,p_version:body.expectedVersion,p_values:body.values});
      if(error) return NextResponse.json({data:null,error:{message:error.code==='42703'?error.message:'상품이 변경되어 저장하지 않았습니다. 최신 상품을 다시 열어 확인해주세요.'}},{status:['40001','23505'].includes(error.code)?409:400});
      return NextResponse.json({data:body.single?{id:data.id}:data,error:null});
    }
    let query: any = supabase.from(table);

    if (op === "insert") query = query.insert(body?.values as any);
    else if (op === "update") query = query.update(body?.values as any);
    else if (op === "upsert") query = query.upsert(body?.values as any, body?.upsertOptions as any);
    else if (op === "delete") query = query.delete();

    // update/delete 는 반드시 필터가 있어야 함(전체 덮어쓰기/전체 삭제 사고 방지).
    const filters = Array.isArray(body?.filters) ? (body!.filters as WriteFilter[]) : [];
    if ((op === "update" || op === "delete") && filters.length === 0) {
      return NextResponse.json(
        { data: null, error: { message: "update/delete 에는 필터가 필요합니다(전체 대상 방지)." } },
        { status: 400 },
      );
    }
    for (const f of filters) {
      if (f?.type === "eq") query = query.eq(f.col, f.val as any);
      else if (f?.type === "in") query = query.in(f.col, (f.val as any[]) || []);
    }

    if (body?.select !== undefined) query = query.select(body.select || "*");
    if (body?.single) query = query.single();

    const { data, error } = await query;
    if (error) {
      // Protected brand links reject destructive/shadow writes in the same DB transaction.
      if (table === 'products' && ['23503', '23505', '40001'].includes(error.code)) {
        return NextResponse.json({data:null,error:{message:'연결된 상품 또는 변경된 상태가 있습니다. 최신 상품을 확인해주세요.'}},{status:409});
      }
      return NextResponse.json({ data: null, error: { message: error.message } }, { status: 200 });
    }
    return NextResponse.json({ data: data ?? null, error: null });
  } catch (e: any) {
    return NextResponse.json(
      { data: null, error: { message: e instanceof Error ? e.message : String(e) } },
      { status: 500 },
    );
  }
}
