import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { canClearReturnRecord } from "@/lib/orderReturnUndo";

// [2026-10-22 사장님] 「고객이슈 삭제」 ↔ 「주문상세 기록 지우기」 연동.
//   고객이슈(order_return_flow)를 삭제함으로 옮긴 뒤, 그 이슈가 그 주문의 «최신» 반품 기록이면
//   orders.return_*(기록 메모)도 같이 비운다 — 주문상세 박스가 지운 이슈를 계속 보여주던 빈틈 메움.
//   하지 않는 일: 포인트·주문상태·입금·정산·재고 — 어떤 것도 안 건드린다(포인트 되돌림은 order-return/undo 만).
//   순서 보호: 더 최신 이슈가 살아 있으면(canClearReturnRecord=false) 기록은 그대로 둔다.

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (v: unknown) => String(v ?? "").trim();

function bodyField(body: unknown, prefix: string): string {
  const lines = String(body ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(prefix)) return t.slice(prefix.length).trim();
  }
  return "";
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdminSessionFromRequest(request)) return jsonError("관리자 로그인이 필요합니다.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const taskId = text(body.taskId);
    if (!taskId) return jsonError("고객이슈 ID가 없습니다.");

    const sb = admin();
    const { data: task, error: taskErr } = await sb.from("admin_tasks").select("id, created_at, status, body, source").eq("id", taskId).maybeSingle();
    if (taskErr) return jsonError("고객이슈 조회 실패: " + taskErr.message, 500);
    if (!task) return jsonError("고객이슈를 찾지 못했습니다.");

    // 주문상세 등록(order_return_flow)이 아닌 이슈는 orders.return_* 기록이 없다 → 할 일 없음
    if (text((task as any).source) !== "order_return_flow") return NextResponse.json({ ok: true, cleared: false, reason: "not_return_flow" });
    const orderNo = bodyField((task as any).body, "주문번호:");
    if (!orderNo) return NextResponse.json({ ok: true, cleared: false, reason: "no_order" });

    const { data: siblings, error: sibErr } = await sb
      .from("admin_tasks").select("id, created_at, status, body, source")
      .eq("source", "order_return_flow").ilike("body", `%주문번호: ${orderNo}%`);
    if (sibErr || !Array.isArray(siblings)) return jsonError("같은 주문의 고객이슈를 확인하지 못해 기록을 그대로 두었습니다.", 500);
    if (!canClearReturnRecord(task as any, siblings as any[])) return NextResponse.json({ ok: true, cleared: false, reason: "newer_issue_alive" });

    const { data: rows, error: rowErr } = await sb.from("orders").select("id, is_deleted").eq("order_lookup_code", orderNo);
    if (rowErr) return jsonError("주문 조회 실패: " + rowErr.message, 500);
    const ids = (rows || []).filter((r: any) => r?.is_deleted !== true).map((r: any) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({ ok: true, cleared: false, reason: "no_rows" });

    const { error: clrErr } = await sb.from("orders")
      .update({ return_status: null, return_reason: null, return_amount: null, return_updated_at: null })
      .in("id", ids);
    if (clrErr) return jsonError("반품 기록 정리 실패: " + clrErr.message, 500);
    return NextResponse.json({ ok: true, cleared: true, rowCount: ids.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
