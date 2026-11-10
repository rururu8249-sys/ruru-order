// app/api/cron/live-metrics/route.ts
// [2026-11-09] 방송 중 1분 기록(유튜브 시청자·좋아요·채팅 수·채팅 상품번호·사이트 접속·순환 상태). 방송 OFF 면 즉시 끝(유튜브 호출 0).
//   chat-orders-read cron 과 같은 호출 검증. 돈·주문 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { recordLiveMetricsTick } from "@/lib/liveMetricsServer";
import { announceRecentPaid } from "@/lib/liveOrderChatServer";
import { getServiceClient } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

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
  const r = await recordLiveMetricsTick();
  // [2026-11-10 21:54] 방송 중이면 최근 결제 완료 주문서에 「결제 완료! 감사합니다」 채팅 글(이미 올린 건 건너뜀)
  const paidPosted = await announceRecentPaid(getServiceClient()).catch(() => 0);
  return NextResponse.json({ ...r, paidPosted });
}
