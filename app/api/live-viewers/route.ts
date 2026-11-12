// app/api/live-viewers/route.ts
// [2026-11-10 사장님 07:05·07:18] 방송 화면 왼쪽 위 — 유튜브 동시 시청자 수 + 사이트 접속 수(1분 기록기가 적어 둔 숫자 한 줄만 읽음).
//   유튜브를 직접 부르지 않음(손님이 많아도 유튜브 사용량 0). 20초 캐시. 읽기만.
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, readSetting } from "@/lib/youtube";
import { LIVE_VIEWERS_NOW_KEY } from "@/lib/liveMetricsServer";
import { readLiveAudience } from "@/lib/liveAudienceServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const bc = String(request.nextUrl.searchParams.get("bc") ?? "").trim();
  try {
    const raw = await readSetting(getServiceClient(), LIVE_VIEWERS_NOW_KEY);
    const o = raw ? (JSON.parse(raw) as { bc?: string; v?: number | null; s?: number | null; t?: string }) : null;
    const fresh = o && o.t && Date.now() - Date.parse(o.t) < 4 * 60 * 1000;
    const viewers = o && fresh && (!bc || o.bc === bc) && Number.isFinite(Number(o.v)) && o.v != null ? Number(o.v) : null;
    // 사이트 접속(최근 2분 신호, 관리자 화면 제외)
    let site = o && fresh && (!bc || o.bc === bc) && Number.isFinite(Number(o.s)) && o.s != null ? Number(o.s) : null;
    // [2026-11-12 사장님 22:34] 사이트 «지금»(75초 안 신호) 전체 / 방송 화면 열어 둔 사람 — 8초 기억, 실패하면 예전 값
    let watching: number | null = null;
    try {
      const aud = await readLiveAudience(getServiceClient());
      site = aud.total;
      watching = aud.watching;
    } catch { /* 예전 1분 기록 숫자 그대로 */ }
    return NextResponse.json({ ok: true, viewers, site, watching }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } });
  } catch {
    return NextResponse.json({ ok: true, viewers: null, site: null, watching: null });
  }
}
