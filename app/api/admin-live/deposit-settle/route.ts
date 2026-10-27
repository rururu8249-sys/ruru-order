// ── [2026-10-27 사장님 요청] 입금 「정리」 — 주문과 상관없는 입금을 입금매칭 목록에서 빼기 ──
//   1원 인증·잘못 보낸 돈·이미 다른 방법으로 처리 끝난 돈 같은 입금이 매칭 목록에 계속 남던 것.
//   정리 = deposits.match_status "처리완료" + confirmed_note 「정리: 이유」 (주문·금액·정산·포인트 무접촉).
//   · 주문에 연결 안 된 «미확인» 입금만 정리할 수 있다(이미 연결된 입금은 거절).
//   · 되돌리기(undo) = 정리한 입금(confirmed_note 「정리:」 + 주문 연결 없음)만 다시 «미확인»으로.
//   · 자동매칭(lib/admin-v2/autoPaymentMatch isUnmatchedDeposit)은 match_status 빈값/미확인/미매칭만 보므로
//     정리한 입금은 자동매칭 대상에서도 빠진다. 되돌리면 다시 대상이 된다(원래 상태).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { DEPOSIT_SETTLE_PREFIX, DEPOSIT_SETTLE_REASONS, DEPOSIT_SETTLE_STATUS, isSettleableDeposit, isSettledDeposit } from "@/lib/depositSettle";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const adminSession = await verifyAdminSessionFromRequest(request);
    if (!adminSession) {
      return jsonError("관리자 로그인이 필요합니다. /admin-login에서 다시 로그인 후 새로고침해주세요.", 401);
    }

    const body = await request.json().catch(() => null);
    // [2026-10-27 사장님 「전체 정리 버튼」] 여러 입금 한 번에 — depositIds 배열(최대 500). 규칙은 한 건 정리와 같다.
    if (Array.isArray(body?.depositIds)) {
      const reasonAll = String(body?.reason || "").trim();
      if (!DEPOSIT_SETTLE_REASONS.includes(reasonAll as (typeof DEPOSIT_SETTLE_REASONS)[number])) {
        return jsonError("정리 이유를 골라 주세요.");
      }
      const ids = Array.from(new Set((body.depositIds as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
      if (ids.length === 0) return jsonError("정리할 입금이 없습니다.");
      if (ids.length > 500) return jsonError("한 번에 500건까지만 정리할 수 있어요.");
      const supabaseAll = getSupabaseAdminClient();
      const { data: rows, error: readAllError } = await supabaseAll
        .from("deposits")
        .select("id, match_status, match_order_group_id, match_customer_id, confirmed_at, confirmed_note")
        .in("id", ids);
      if (readAllError) return jsonError(readAllError.message || "입금 조회 실패", 500);
      const okIds = (Array.isArray(rows) ? rows : []).filter((r) => isSettleableDeposit(r)).map((r) => Number(r.id));
      if (okIds.length === 0) return NextResponse.json({ ok: true, settled: 0, skipped: ids.length });
      const { data: updatedAll, error: updateAllError } = await supabaseAll
        .from("deposits")
        .update({ match_status: DEPOSIT_SETTLE_STATUS, confirmed_note: `${DEPOSIT_SETTLE_PREFIX}${reasonAll}` })
        .in("id", okIds)
        .is("match_order_group_id", null)
        .is("confirmed_at", null)
        .select("id");
      if (updateAllError) return jsonError(updateAllError.message || "정리 실패", 500);
      const settled = Array.isArray(updatedAll) ? updatedAll.length : 0;
      return NextResponse.json({ ok: true, settled, skipped: ids.length - settled });
    }
    const depositId = Number(body?.depositId);
    const undo = body?.undo === true;
    const reason = String(body?.reason || "").trim();
    if (!Number.isFinite(depositId) || depositId <= 0) return jsonError("입금 번호가 없습니다.");
    if (!undo && !DEPOSIT_SETTLE_REASONS.includes(reason as (typeof DEPOSIT_SETTLE_REASONS)[number])) {
      return jsonError("정리 이유를 골라 주세요.");
    }

    const supabase = getSupabaseAdminClient();
    const { data: row, error: readError } = await supabase
      .from("deposits")
      .select("id, match_status, match_order_group_id, match_customer_id, confirmed_at, confirmed_note")
      .eq("id", depositId)
      .maybeSingle();
    if (readError) return jsonError(readError.message || "입금 조회 실패", 500);
    if (!row) return jsonError("입금을 찾을 수 없어요.", 404);

    if (undo) {
      if (!isSettledDeposit(row)) return jsonError("정리한 입금이 아니라 되돌릴 수 없어요.", 409);
      const { error } = await supabase
        .from("deposits")
        .update({ match_status: "미확인", confirmed_note: null })
        .eq("id", depositId)
        .eq("match_status", DEPOSIT_SETTLE_STATUS)
        .is("match_order_group_id", null);
      if (error) return jsonError(error.message || "되돌리기 실패", 500);
      return NextResponse.json({ ok: true, undo: true });
    }

    if (!isSettleableDeposit(row)) {
      return jsonError("이미 주문에 연결됐거나 처리된 입금이라 정리할 수 없어요.", 409);
    }
    const { data: updated, error } = await supabase
      .from("deposits")
      .update({ match_status: DEPOSIT_SETTLE_STATUS, confirmed_note: `${DEPOSIT_SETTLE_PREFIX}${reason}` })
      .eq("id", depositId)
      .is("match_order_group_id", null)
      .is("confirmed_at", null)
      .select("id");
    if (error) return jsonError(error.message || "정리 실패", 500);
    if (!Array.isArray(updated) || updated.length === 0) {
      return jsonError("그 사이 다른 곳에서 처리된 입금이에요. 새로고침해 주세요.", 409);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
