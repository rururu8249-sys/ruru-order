// app/api/chat-orders/current/route.ts
// [2026-08-14] 「지금 이거」 지정/해제/조회. 관리자 인증 필수.
//   POST { productId, productName }  → 지금부터 이 상품으로 접수
//   POST { clear: true }             → 해제 (상품 없는 주문은 접수 안 함)
//   GET                              → 현재 상태 + 최근 이력 10건
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getCurrentProductAt, setCurrentProduct, clearCurrentProduct } from "@/lib/chatCurrentProduct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const sb = sbAdmin();
    const now = await getCurrentProductAt(sb, new Date().toISOString());
    const { data: history } = await sb
      .from("chat_current_product")
      .select("id,product_id,product_name,cleared,set_at")
      .order("set_at", { ascending: false })
      .limit(10);
    return NextResponse.json({ ok: true, current: now, history: history || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message || e) } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sb = sbAdmin();
    if (body.clear === true) {
      await clearCurrentProduct(sb);
      return NextResponse.json({ ok: true, current: null });
    }
    const productId = String(body.productId ?? "").trim();
    if (!productId) {
      return NextResponse.json({ ok: false, error: { message: "productId가 필요합니다." } }, { status: 400 });
    }
    await setCurrentProduct(sb, { productId, productName: String(body.productName ?? "") });
    return NextResponse.json({ ok: true, current: await getCurrentProductAt(sb, new Date().toISOString()) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message || e) } }, { status: 500 });
  }
}
