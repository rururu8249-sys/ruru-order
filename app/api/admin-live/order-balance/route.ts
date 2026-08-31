// ── [2026-08-31 사장님 요청] 주문 돈 계산기(포스기) — 읽기 전용 조회 API ──
//   입금확인된 주문의 "연결된 입금액 합"과 "차액 포인트 환급 기록"을 돌려준다.
//   주문상세가 이 값으로 「딱 맞아요 / 더 냈어요 / 부족해요」를 계산해 보여준다.
//   ⚠️ 이 API는 아무것도 변경하지 않는다(SELECT만). 포인트 지급은 기존
//     /api/admin-live/customer-points(중복차단 sourceKey 포함)를 그대로 쓴다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

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

export async function GET(request: NextRequest) {
  try {
    const adminSession = await verifyAdminSessionFromRequest(request);
    if (!adminSession) {
      return jsonError("관리자 로그인이 필요합니다. /admin-login에서 다시 로그인 후 새로고침해주세요.", 401);
    }

    const groupId = String(request.nextUrl.searchParams.get("groupId") || "").trim();
    if (!groupId) return jsonError("groupId가 없습니다.");

    const supabase = getSupabaseAdminClient();

    // 이 주문 그룹에 연결(매칭)된 입금 합계 — 자동/수동 매칭 모두 match_order_group_id 사용
    const { data: deposits, error: depositError } = await supabase
      .from("deposits")
      .select("id, amount")
      .eq("match_order_group_id", groupId);
    if (depositError) return jsonError(depositError.message || "입금내역 조회 실패", 500);

    const depositRows = Array.isArray(deposits) ? deposits : [];
    const depositSum = depositRows.reduce((sum, row) => sum + (Number((row as { amount?: unknown }).amount) || 0), 0);

    // 이 주문의 차액 포인트 환급 기록(가장 최근 1건) — sourceKey 규칙: depositdiff:{groupId}:...
    const { data: refunds } = await supabase
      .from("customer_point_ledger")
      .select("amount, created_at, source_key")
      .like("source_key", `depositdiff:${groupId}:%`)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRefund = Array.isArray(refunds) && refunds.length > 0 ? refunds[0] : null;

    return NextResponse.json({
      ok: true,
      depositSum,
      depositCount: depositRows.length,
      lastRefund: lastRefund
        ? {
            amount: Number((lastRefund as { amount?: unknown }).amount) || 0,
            createdAt: String((lastRefund as { created_at?: unknown }).created_at || ""),
            sourceKey: String((lastRefund as { source_key?: unknown }).source_key || ""),
          }
        : null,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "조회 실패", 500);
  }
}
