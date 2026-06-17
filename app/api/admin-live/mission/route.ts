// 미션 게이지 관리자 API — 설정 저장(GET 진행률+설정 / POST 설정 저장).
//   - 저장은 settings 테이블의 mission_* 키만 upsert. 기존 설정 패널(숫자전용) 시스템과 분리.
//   - 돈/포인트 로직 없음(1단계). 전원 지급은 별도(2단계).
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getMissionSupabase, computeMissionProgress, readMissionConfig, fetchMissionBuyers, readMissionPaid, setMissionPaid } from "@/lib/mission";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
async function requireAdmin(request: NextRequest) {
  const s = await verifyAdminSessionFromRequest(request);
  return s ? null : json({ ok: false, message: "관리자 로그인이 필요합니다." }, 401);
}
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth) return auth;
  try {
    const supabase = getMissionSupabase();
    const p = await computeMissionProgress(supabase);
    return json({ ok: true, ...p });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth) return auth;
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action ?? "");

    // ── 2단계: 구매자 전원 지급 ──
    if (action === "payout_preview" || action === "payout_confirm" || action === "payout_reset") {
      const supabase = getMissionSupabase();
      const { broadcastId, broadcastTitle, buyers } = await fetchMissionBuyers(supabase);
      if (action === "payout_reset") {
        if (broadcastId) await setMissionPaid(supabase, broadcastId, false);
        return json({ ok: true });
      }
      if (!broadcastId) return json({ ok: false, message: "진행 중인 방송이 없습니다." }, 400);
      const cfg = await readMissionConfig(supabase);
      const reward = cfg.reward;
      const alreadyPaid = await readMissionPaid(supabase, broadcastId);

      if (action === "payout_preview") {
        return json({ ok: true, broadcastTitle, count: buyers.length, reward, total: buyers.length * reward, alreadyPaid, buyers });
      }
      // payout_confirm: 중복가드 → 통과 시 가드 선설정 후 지급대상 반환(클라이언트가 일괄지급)
      if (alreadyPaid) return json({ ok: false, already: true, message: "이미 이 방송 미션 지급이 완료됐어요." }, 409);
      if (reward <= 0) return json({ ok: false, message: "1인당 포인트가 0이에요. 설정을 확인하세요." }, 400);
      if (buyers.length === 0) return json({ ok: false, message: "지급 대상(결제완료 구매자)이 없어요." }, 400);
      await setMissionPaid(supabase, broadcastId, true);
      return json({ ok: true, reward, title: cfg.title, buyers });
    }

    const goalType = b.goalType === "amount" ? "amount" : "count";
    const rows = [
      { key: "mission_active", value: b.active ? "true" : "false" },
      { key: "mission_goal_type", value: goalType },
      { key: "mission_goal_value", value: String(num(b.goalValue)) },
      { key: "mission_reward_amount", value: String(num(b.rewardAmount)) },
      { key: "mission_title", value: String(b.title ?? "").slice(0, 80) },
    ];
    const supabase = getMissionSupabase();
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return json({ ok: false, message: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
