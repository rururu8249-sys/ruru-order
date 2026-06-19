import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { fetchYoutubeLiveStats } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 라이브 동시 시청자 수 + 좋아요 수 (관리자 전용, 읽기). 폴링용.
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const stats = await fetchYoutubeLiveStats();
  return NextResponse.json({ ok: true, ...stats }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
