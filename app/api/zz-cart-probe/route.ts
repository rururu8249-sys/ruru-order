// 임시 읽기 전용 조사 주소 — 끝나면 삭제
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("k") !== "rr-cart-4q8z") return NextResponse.json({ why: "key" });
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: holds } = await db.from("cart_reservations").select("*").or("customer_phone.eq.01073707271,customer_phone.eq.010-7370-7271").limit(20);
    const pids = Array.from(new Set((holds || []).map((h: any) => h.product_id).filter(Boolean)));
    const { data: prods } = pids.length ? await db.from("products").select("*").in("id", pids) : { data: [] };
    const { data: bp } = pids.length ? await db.from("broadcast_products").select("broadcast_id,product_id,is_visible,created_at").in("product_id", pids).order("created_at", { ascending: false }).limit(10) : { data: [] };
    const { data: bc } = await db.from("broadcasts").select("id,public_title,status,started_at,ended_at,created_at").or("id.eq.c6ab2d81-5bbd-4cfc-ad28-dcc2a65050c5,started_at.gte.2026-10-29T00:00:00Z").limit(20);
    const { data: other } = await db.from("cart_reservations").select("product_id,created_at,nickname,product_name").gte("created_at", "2026-11-01T10:00:00Z").limit(300);
    const { data: led } = await db.from("inventory_ledger").select("*").in("product_id", pids.length ? pids : [-1]).order("created_at", { ascending: false }).limit(5);
    return NextResponse.json({ holds: (holds || []).map((h: any) => ({ ...h, customer_phone: undefined, kakao_id: h.kakao_id ? "있음" : "" })), prods: (prods || []).map((p: any) => ({ id: p.id, product_name: p.product_name, status: p.status, in_shop: p.in_shop, is_visible: p.is_visible, created_at: p.created_at })), bp, bc, other, ledCount: (led || []).length });
  } catch (e) { return NextResponse.json({ fatal: String(e) }); }
}
