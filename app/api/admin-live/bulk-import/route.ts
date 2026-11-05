import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// [2026-11-05] 해외 엑셀 일괄등록용 읽기 전용 확인 주소 — 관리자만, 쓰기 없음.
//   브랜드 묶음 상품(product_note.brand_group.enabled)과 대상 방송 연결 상태를 돌려준다.
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Missing configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function noteOf(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
  return typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sb = db();
    const title = request.nextUrl.searchParams.get("broadcast") || "해외명품의류1";
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("products")
        .select("id, product_name, price, stock, status, color_options, size_options, detail_image_urls, image_url, product_note, product_type, in_shop, badge_types, shipping_type")
        .order("id").range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const brands = rows.filter((r) => String(r.status || "") !== "deleted" && (noteOf(r.product_note).brand_group as Record<string, unknown> | undefined)?.enabled === true)
      .map((r) => ({ ...r, product_note: noteOf(r.product_note) }));
    const { data: bcs, error: bErr } = await sb.from("broadcasts").select("id, title, status, started_at, created_at").ilike("title", `%${title}%`).order("created_at", { ascending: false }).limit(5);
    if (bErr) throw bErr;
    const links: Record<string, unknown[]> = {};
    for (const b of bcs || []) {
      const { data } = await sb.from("broadcast_products").select("product_id, sort_order, is_visible").eq("broadcast_id", b.id);
      links[String(b.id)] = data || [];
    }
    return NextResponse.json({ brands, broadcasts: bcs, links, productCount: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
