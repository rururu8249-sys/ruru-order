import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { isCanceledStatus } from "@/lib/admin-v2/statusDisplay";
import { kstDateKeyOf, parsePickPullRequest, restoreFromPrev } from "@/lib/orderPickPull";

// [2026-10-22 사장님] 「지난 주문 가져오기」 서버.
//   pull  : 고른 주문 줄(orders.id)에 pick_pulled_at/for/reason 을 적고, 챙김·모음·송장출력 기록은 비운다
//           (오늘 «다시» 챙기고 «다시» 송장을 뽑는 줄이므로). 비우기 전 값은 pick_pulled_prev 에 보관.
//   unpull: pick_pulled_* 를 지우고 prev 를 원복.
//   하지 않는 일: 주문 복사·created_at·금액·입금·주문상태·포인트·재고 — 어떤 칸도 안 건드린다.
//   취소된 줄·삭제된 줄은 건너뛴다(응답 skipped 로 알림).

export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Row = {
  id: number;
  is_deleted: boolean | null;
  admin_order_status_v2: string | null;
  order_manage_status: string | null;
  picked_at: string | null;
  collected_at: string | null;
  invoice_printed_at: string | null;
  pick_pulled_at: string | null;
  pick_pulled_for: string | null;
  pick_pulled_prev: unknown;
};

export async function POST(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const { action, rowIds, reason } = parsePickPullRequest(await request.json());
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id,is_deleted,admin_order_status_v2,order_manage_status,picked_at,collected_at,invoice_printed_at,pick_pulled_at,pick_pulled_for,pick_pulled_prev")
      .in("id", rowIds);
    if (error) throw new Error(`주문 줄 조회 실패: ${error.message}`);
    const rows = (data || []) as Row[];

    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = kstDateKeyOf(now);
    const updated: number[] = [];
    const skipped: { id: number; why: string }[] = [];

    for (const row of rows) {
      if (row.is_deleted === true) { skipped.push({ id: row.id, why: "삭제된 줄" }); continue; }
      if (action === "pull") {
        if (isCanceledStatus(row.admin_order_status_v2) || isCanceledStatus(row.order_manage_status)) { skipped.push({ id: row.id, why: "취소된 주문" }); continue; }
        // 이미 가져온 줄을 다시 가져오면 날짜·사유만 갱신(prev 는 맨 처음 것 유지 — 원복 기준이 흔들리지 않게)
        const prev = row.pick_pulled_at && row.pick_pulled_prev && typeof row.pick_pulled_prev === "object"
          ? row.pick_pulled_prev
          : { picked_at: row.picked_at, collected_at: row.collected_at, invoice_printed_at: row.invoice_printed_at };
        const { error: upErr } = await supabase.from("orders").update({
          pick_pulled_at: nowIso,
          pick_pulled_for: todayKey,
          pick_pulled_reason: reason,
          pick_pulled_prev: prev,
          picked_at: null,
          collected_at: null,
          invoice_printed_at: null,
        }).eq("id", row.id);
        if (upErr) throw new Error(`가져오기 저장 실패(#${row.id}): ${upErr.message}`);
        updated.push(row.id);
      } else {
        if (!row.pick_pulled_at && !row.pick_pulled_for) { skipped.push({ id: row.id, why: "가져온 줄이 아님" }); continue; }
        const restore = restoreFromPrev(row.pick_pulled_prev);
        const { error: upErr } = await supabase.from("orders").update({
          pick_pulled_at: null,
          pick_pulled_for: null,
          pick_pulled_reason: null,
          pick_pulled_prev: null,
          picked_at: restore.picked_at,
          collected_at: restore.collected_at,
          invoice_printed_at: restore.invoice_printed_at,
        }).eq("id", row.id);
        if (upErr) throw new Error(`빼기 저장 실패(#${row.id}): ${upErr.message}`);
        updated.push(row.id);
      }
    }
    const missing = rowIds.filter((id) => !rows.some((r) => Number(r.id) === id));
    for (const id of missing) skipped.push({ id, why: "줄을 찾지 못함" });

    return NextResponse.json({ ok: true, action, updated, skipped, pulledFor: todayKey, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "처리하지 못했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
