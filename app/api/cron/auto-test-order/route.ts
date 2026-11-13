// app/api/cron/auto-test-order/route.ts
// [2026-11-13] 자동 테스트 주문 — 1분마다 불려 «켜짐 + 방송 중 + 시간 됨»일 때만 한 번 실행(lib/autoTestOrderServer).
//   다른 cron 과 같은 호출 검증. 꺼져 있으면 settings 한 줄 읽고 끝.
import { NextRequest, NextResponse } from "next/server";
import { autoTestTick } from "@/lib/autoTestOrderServer";
import { getServiceClient } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isVercelCronRequest(request: NextRequest) {
  return (request.headers.get("user-agent") || "").includes("vercel-cron/1.0");
}

export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const provided = (
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();
  if (!isVercelCronRequest(request) && (!secret || provided !== secret)) {
    return NextResponse.json({ ok: false, error: { message: "인증 필요" } }, { status: 401 });
  }
  try {
    const r = await autoTestTick(getServiceClient(), request.nextUrl.origin);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "실패" }, { status: 500 });
  }
}
