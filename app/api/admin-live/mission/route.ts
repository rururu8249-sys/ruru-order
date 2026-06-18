// 미션 게이지 관리자 API — 설정 저장(GET 진행률+설정 / POST 설정 저장).
//   - 저장은 settings 테이블의 mission_* 키만 upsert. 기존 설정 패널(숫자전용) 시스템과 분리.
//   - 돈/포인트 로직 없음(1단계). 전원 지급은 별도(2단계).
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getMissionSupabase, computeMissionProgress, readMissionConfig, fetchMissionBuyers, fetchMissionPaidPhones, fetchMissionPayoutHistory } from "@/lib/mission";

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

    // ── 지급 내역(이 방송 미션 지급 명단) — 읽기 전용 ──
    if (action === "payout_history") {
      const supabase = getMissionSupabase();
      const { broadcastTitle, startedAt, buyers } = await fetchMissionBuyers(supabase);
      const nameMap = new Map(buyers.map((b) => [b.phone, b.nickname]));
      const hist = await fetchMissionPayoutHistory(supabase, startedAt);
      const payouts = hist.map((h) => ({
        nickname: nameMap.get(h.phone) || (h.phone ? "…" + h.phone.slice(-4) : "고객"),
        amount: h.amount,
        when: h.when,
      }));
      const total = payouts.reduce((s, x) => s + x.amount, 0);
      return json({ ok: true, broadcastTitle, payouts, count: payouts.length, total });
    }

    // ── 2단계: 구매자 전원 지급 ──
    if (action === "payout_preview" || action === "payout_confirm" || action === "payout_reset") {
      const supabase = getMissionSupabase();
      // payout_reset: 예전(방송단위 1회 잠금) 호환용 — 중복방지를 실제 지급기록(ledger)으로 하므로
      //   해제할 잠금이 없다. 클라이언트 호출 호환 위해 ok만 반환(아무 동작 없음).
      if (action === "payout_reset") return json({ ok: true });

      const { broadcastId, broadcastTitle, startedAt, buyers } = await fetchMissionBuyers(supabase);
      if (!broadcastId) return json({ ok: false, message: "진행 중인 방송이 없습니다." }, 400);
      const cfg = await readMissionConfig(supabase);
      const reward = cfg.reward;

      // 멱등 중복방지: 이미 이 방송에서 미션 지급을 받은 사람(전화번호)은 ledger 기준으로 제외.
      //   → 한 방송에서 여러 번 지급해도 같은 사람은 1회만, 매번 "새 구매자"에게만 지급.
      const paidPhones = await fetchMissionPaidPhones(supabase, startedAt);
      const remaining = buyers.filter((b) => !paidPhones.has(b.phone));
      const alreadyPaidCount = buyers.length - remaining.length;

      if (action === "payout_preview") {
        return json({
          ok: true,
          broadcastTitle,
          count: remaining.length, // 이번에 지급할 신규(미지급) 인원
          reward,
          total: remaining.length * reward,
          alreadyPaidCount, // 이미 받은 인원(중복 제외됨)
          totalBuyers: buyers.length,
          buyers: remaining,
        });
      }
      // payout_confirm: 남은(미지급) 구매자만 반환 → 클라이언트가 그들에게만 일괄지급.
      if (reward <= 0) return json({ ok: false, message: "1인당 포인트가 0이에요. 설정을 확인하세요." }, 400);
      if (buyers.length === 0) return json({ ok: false, message: "지급 대상(결제완료 구매자)이 없어요." }, 400);
      if (remaining.length === 0)
        return json({ ok: false, already: true, message: "이미 이 방송 구매자 전원에게 지급됐어요. (같은 사람 중복지급 방지)" }, 409);
      return json({ ok: true, reward, title: cfg.title, buyers: remaining });
    }

    const goalType = b.goalType === "amount" ? "amount" : "count";
    const supabase = getMissionSupabase();

    // 이벤트 시작/종료 시각 기록 — 카운트·지급·명단 구간 기준.
    //   - 새로 켜질 때(false→true): mission_started_at=지금(=이 이벤트 0부터 카운트), mission_ended_at 비움.
    //   - 꺼질 때(true→false): mission_ended_at=지금(구간 끝 고정), 시작시각은 유지(종료 후 지급 가능).
    //   - 켠 채로 목표/문구만 저장(true→true)이면 시작시각 그대로(카운트 안 깨짐).
    const newActive = !!b.active;
    const prev = await readMissionConfig(supabase); // 이전 active
    const times = (
      await supabase.from("settings").select("key,value").in("key", ["mission_started_at", "mission_ended_at"])
    ).data as { key?: string; value?: string }[] | null;
    const tmap = new Map((Array.isArray(times) ? times : []).map((r) => [String(r.key), String(r.value ?? "")]));
    let startedAt = (tmap.get("mission_started_at") || "").trim();
    let endedAt = (tmap.get("mission_ended_at") || "").trim();
    const nowIso = new Date().toISOString();
    if (newActive && !prev.active) {
      startedAt = nowIso; // 새 이벤트 시작
      endedAt = "";
    } else if (!newActive && prev.active) {
      endedAt = nowIso; // 이벤트 종료
    }

    const rows = [
      { key: "mission_active", value: newActive ? "true" : "false" },
      { key: "mission_goal_type", value: goalType },
      { key: "mission_goal_value", value: String(num(b.goalValue)) },
      { key: "mission_reward_amount", value: String(num(b.rewardAmount)) },
      { key: "mission_title", value: String(b.title ?? "").slice(0, 80) },
      { key: "mission_started_at", value: startedAt },
      { key: "mission_ended_at", value: endedAt },
    ];
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return json({ ok: false, message: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
