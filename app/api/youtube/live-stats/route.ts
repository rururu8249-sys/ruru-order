import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// [2026-11-27 사장님 「시청자 수 가져오기 없애자 — 쿼터만 깎아먹음」] 유튜브를 더 이상 부르지 않음.
//   배포 전에 열어 둔 관리자 화면이 1분마다 불러도 유튜브 한도를 안 쓰게 빈 값만 돌려줌.
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, concurrentViewers: null, likeCount: null, live: false }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
