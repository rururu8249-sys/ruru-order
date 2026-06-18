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

    // 임시 진단: 방송 탐지가 왜 비는지(권한/RLS vs status값) 확인용. 원인 파악 후 제거.
    let _dbg: Record<string, unknown> = {};
    try {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("id,title,status,started_at,ended_at,is_deleted")
        .order("started_at", { ascending: false })
        .limit(5);
      _dbg = {
        key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon",
        bcErr: error?.message || null,
        bcCount: Array.isArray(data) ? data.length : 0,
        bc: (Array.isArray(data) ? data : []).map((b: Record<string, unknown>) => ({
          status: b.status,
          deleted: b.is_deleted,
          started: b.started_at,
          ended: b.ended_at,
        })),
        detectedBroadcastId: p.broadcastId,
      };
    } catch (e) {
      _dbg = { ex: e instanceof Error ? e.message : String(e) };
    }

    return json({
      ok: true,
      active: p.active,
      title: p.title,
      goalType: p.goalType,
      goal: p.goal,
      current: p.current,
      reward: p.reward,
      pct: p.pct,
      _dbg,
    });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
