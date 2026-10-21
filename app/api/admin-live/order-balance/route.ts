// ── [2026-08-31 사장님 요청] 주문 돈 계산기(포스기) — 읽기 전용 조회 API ──
//   입금확인된 주문의 "연결된 입금액 합"과 "차액 포인트 환급 기록"을 돌려준다.
//   주문상세가 이 값으로 「딱 맞아요 / 더 냈어요 / 부족해요」를 계산해 보여준다.
//   ⚠️ 이 API는 아무것도 변경하지 않는다(SELECT만). 포인트 지급은 기존
//     /api/admin-live/customer-points(중복차단 sourceKey 포함)를 그대로 쓴다.

import { parseMultiOrderGroups } from "@/lib/multiOrderDeposit";
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
      .select("id, amount, confirmed_note")
      .eq("match_order_group_id", groupId);
    if (depositError) return jsonError(depositError.message || "입금내역 조회 실패", 500);

    // [2026-10-21 여러 주문 합친 입금] 이 주문이 «여러 주문을 합친 입금»에 묶였으면(첫 주문이든 나머지든)
    //   이 주문 금액과 비교하면 「더 냈어요/부족해요」가 틀리게 나온다 → 차액 계산을 끄고 묶음 정보만 돌려준다.
    const { data: taggedDeposits } = await supabase
      .from("deposits")
      .select("id, amount, confirmed_note")
      .ilike("confirmed_note", `%[groups:%${groupId}%`);
    const multiRows = [...(Array.isArray(deposits) ? deposits : []), ...(Array.isArray(taggedDeposits) ? taggedDeposits : [])]
      .filter((row) => parseMultiOrderGroups((row as { confirmed_note?: unknown }).confirmed_note).includes(groupId));
    if (multiRows.length > 0) {
      const seen = new Set<string>();
      const uniq = multiRows.filter((row) => { const k = String((row as { id?: unknown }).id); if (seen.has(k)) return false; seen.add(k); return true; });
      const groups = parseMultiOrderGroups((uniq[0] as { confirmed_note?: unknown }).confirmed_note);
      return NextResponse.json({
        ok: true,
        depositSum: 0,
        depositCount: 0,
        lastRefund: null,
        multiOrder: {
          depositSum: uniq.reduce((sum, row) => sum + (Number((row as { amount?: unknown }).amount) || 0), 0),
          depositCount: uniq.length,
          orderCount: groups.length,
        },
      });
    }

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
