// 임시 읽기 전용 조사 주소 — 끝나면 삭제
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readExposedProductIds } from "@/lib/cartExposureServer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("k") !== "rr-cart-4q8z") return NextResponse.json({ why: "key" });
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: on } = await db.from("broadcasts").select("id,public_title,status,started_at").eq("status", "ON").limit(3);
    const { data: shop } = await db.from("products").select("id,status,is_visible").eq("in_shop", true).limit(500);
    const exposed = await readExposedProductIds(db);
    const { data: holds } = await db.from("cart_reservations").select("product_id,product_name,created_at").gt("expires_at", new Date().toISOString()).limit(2000);
    const notExposed = exposed ? (holds || []).filter((h: any) => !exposed.has(String(h.product_id))) : [];
    return NextResponse.json({ on, shopCount: (shop || []).length, exposedCount: exposed ? exposed.size : "null(제한없음)", has807: exposed ? exposed.has("807") : null, activeHolds: (holds || []).length, notExposedHolds: notExposed.map((h: any) => `${h.product_id} ${h.product_name} ${h.created_at}`) });
  } catch (e) { return NextResponse.json({ fatal: String(e) }); }
}
