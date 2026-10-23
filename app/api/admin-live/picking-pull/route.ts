import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { isCanceledStatus } from "@/lib/admin-v2/statusDisplay";
import { kstDateKeyOf, parsePickPullRequest, pullTargetLabelForBroadcast, pullTargetLabelForDate, restoreFromPrev } from "@/lib/orderPickPull";

// [2026-10-22 사장님] 「지난 주문 가져오기」 서버.
//   pull  : 고른 주문 줄(orders.id)에 pick_pulled_at/for/reason 을 적고, 챙김·모음·송장출력 기록은 비운다
//           (오늘 «다시» 챙기고 «다시» 송장을 뽑는 줄이므로). 비우기 전 값은 pick_pulled_prev 에 보관.
//   unpull: pick_pulled_* 를 지우고 prev 를 원복.
//   하지 않는 일: 주문 복사·created_at·금액·입금·주문상태·포인트·재고 — 어떤 칸도 안 건드린다.
//   취소된 줄·삭제된 줄은 건너뛴다(응답 skipped 로 알림).
// [2026-10-23 사장님] «출고 넘기기» — 넘길 곳을 고른다(방송 / 쇼핑몰 날짜). 예전엔 «누른 날짜»로만 적혀
//   방송으로 주문서를 보면 안 보였다. 방송이면 pick_pulled_broadcast_id + 그 방송 시작 날짜, 날짜면 그 날짜.
//   대상 이름(pick_pulled_target)은 서버가 방송 표에서 읽어 만든다(화면 값 안 믿음).

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
  pick_pulled_broadcast_id?: string | null;
};

/** 새 칸(pick_pulled_broadcast_id/target)이 아직 없으면 사장님이 알아볼 안내로 */
function columnHint(message: string): string {
  return /pick_pulled_(broadcast_id|target)/.test(message) ? "주문 칸 추가가 아직 안 됐어요 — Supabase SQL Editor 에서 supabase/sql/orders_pick_pulled_target.sql 을 먼저 실행해 주세요." : "";
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const { action, rowIds, reason, target } = parsePickPullRequest(await request.json());
    const supabase = getSupabaseAdminClient();
    let pulledFor = "";
    let targetBroadcastId: string | null = null;
    let targetLabel = "";
    if (action === "pull" && target) {
      if (target.type === "broadcast") {
        const { data: bc, error: bcErr } = await supabase.from("broadcasts").select("id,public_title,started_at,created_at").eq("id", target.broadcastId).maybeSingle();
        if (bcErr) throw new Error(`방송 확인 실패: ${bcErr.message}`);
        if (!bc) throw new Error("고른 방송을 찾지 못했습니다.");
        const startedAt = (bc as any).started_at || (bc as any).created_at || null;
        pulledFor = kstDateKeyOf(startedAt) || kstDateKeyOf(new Date());
        targetBroadcastId = String((bc as any).id);
        targetLabel = pullTargetLabelForBroadcast((bc as any).public_title, startedAt);
      } else {
        pulledFor = target.date;
        targetLabel = pullTargetLabelForDate(target.date);
      }
    }
    const { data, error } = await supabase
      .from("orders")
      .select("id,is_deleted,admin_order_status_v2,order_manage_status,picked_at,collected_at,invoice_printed_at,pick_pulled_at,pick_pulled_for,pick_pulled_prev")
      .in("id", rowIds);
    if (error) throw new Error(`주문 줄 조회 실패: ${error.message}`);
    const rows = (data || []) as Row[];

    const nowIso = new Date().toISOString();
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
          pick_pulled_for: pulledFor,
          pick_pulled_broadcast_id: targetBroadcastId,
          pick_pulled_target: targetLabel,
          pick_pulled_reason: reason,
          pick_pulled_prev: prev,
          picked_at: null,
          collected_at: null,
          invoice_printed_at: null,
        }).eq("id", row.id);
        if (upErr) throw new Error(columnHint(upErr.message) || `출고 넘기기 저장 실패(#${row.id}): ${upErr.message}`);
        updated.push(row.id);
      } else {
        if (!row.pick_pulled_at && !row.pick_pulled_for) { skipped.push({ id: row.id, why: "넘긴 줄이 아님" }); continue; }
        const restore = restoreFromPrev(row.pick_pulled_prev);
        const { error: upErr } = await supabase.from("orders").update({
          pick_pulled_at: null,
          pick_pulled_for: null,
          pick_pulled_broadcast_id: null,
          pick_pulled_target: null,
          pick_pulled_reason: null,
          pick_pulled_prev: null,
          picked_at: restore.picked_at,
          collected_at: restore.collected_at,
          invoice_printed_at: restore.invoice_printed_at,
        }).eq("id", row.id);
        if (upErr) throw new Error(columnHint(upErr.message) || `넘기기 취소 저장 실패(#${row.id}): ${upErr.message}`);
        updated.push(row.id);
      }
    }
    const missing = rowIds.filter((id) => !rows.some((r) => Number(r.id) === id));
    for (const id of missing) skipped.push({ id, why: "줄을 찾지 못함" });

    return NextResponse.json({ ok: true, action, updated, skipped, pulledFor, target: targetLabel, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "처리하지 못했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
