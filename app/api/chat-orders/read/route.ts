// app/api/chat-orders/read/route.ts
// [2026-08-14] 채팅 읽기 1회 실행. 관리자 인증 필수(cart-holds와 동일 패턴).
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { readLiveChatOnce } from "@/lib/youtubeChatRead";
import { parsePendingChatOrders } from "@/lib/chatOrderPipeline";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  }
  const read = await readLiveChatOnce();
  // 읽은 직후 바로 파싱까지 한 번에. 파싱 실패해도 읽기 결과는 그대로 돌려준다.
  let parse: unknown = null;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      parse = await parsePendingChatOrders(sb, { limit: 200 });
    }
  } catch { /* 파싱 실패는 읽기를 막지 않는다 */ }
  return NextResponse.json({ ...read, parse });
}
