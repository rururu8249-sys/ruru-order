// app/api/chat-orders/read/route.ts
// [2026-08-14] 채팅 읽기 1회 실행. 관리자 인증 필수(cart-holds와 동일 패턴).
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { readLiveChatOnce } from "@/lib/youtubeChatRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  }
  return NextResponse.json(await readLiveChatOnce());
}
