// app/api/chat-orders/parse/route.ts
// [2026-08-14] 읽어둔 채팅 파싱 1회 실행 + 파싱 대상 상품 목록 조회. 관리자 인증 필수.
//   POST { reparseAll?: boolean, limit?: number } → 파싱 실행
//   GET                                          → 현재 파싱 기준 상품 목록(「지금 이거」 선택용)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { parsePendingChatOrders } from "@/lib/chatOrderPipeline";
import { loadParseProducts } from "@/lib/chatOrderProducts";

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
    const loaded = await loadParseProducts(sbAdmin());
    return NextResponse.json({ ok: true, ...loaded });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: { message: msg } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await parsePendingChatOrders(sbAdmin(), {
      reparseAll: body.reparseAll === true,
      limit: Number(body.limit ?? 200) || 200,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: { message: msg } }, { status: 500 });
  }
}
