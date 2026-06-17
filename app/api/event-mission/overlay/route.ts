// 미션 게이지 OBS 위젯용 공개 데이터 API (토큰 기반, 읽기 전용).
//   - /event-mission/live 페이지가 이 API를 폴링해서 진행률을 그린다.
//   - 돈/포인트 로직 없음. 주문을 세서 현재 진행만 반환.
import { NextRequest, NextResponse } from "next/server";
import { MISSION_OVERLAY_TOKEN, getMissionSupabase, computeMissionProgress } from "@/lib/mission";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get("token") || "").trim();
    if (token !== MISSION_OVERLAY_TOKEN) {
      return json({ ok: false, message: "overlay token이 올바르지 않습니다." }, 400);
    }
    const supabase = getMissionSupabase();
    const p = await computeMissionProgress(supabase);
    return json({
      ok: true,
      active: p.active,
      title: p.title,
      goalType: p.goalType,
      goal: p.goal,
      current: p.current,
      reward: p.reward,
      pct: p.pct,
    });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
