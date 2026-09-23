import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  planReturnUndo,
  canClearReturnRecord,
  returnUndoSourceKey,
  RETURN_RECLAIM_CREATED_BY,
  RETURN_UNDO_CREATED_BY,
} from "@/lib/orderReturnUndo";

// [2026-09-23 사장님 요청] 「고객이슈 잘못 등록 된건 되돌리기?」
//                          「포인트도 회수가 된 고객이슈건이면 다시 자동으로 되돌려주면 되잖아?」
//
// 하는 일 — 주문상세 «반품/교환 등록»(order-return)이 남긴 것을 되돌린다:
//   1) 회수했던 적립 포인트를 «그 금액 그대로» 다시 지급 (ledger + balances)
//   2) 주문의 return_* 기록 정리 — «가장 최근 등록일 때만»
//   3) 고객이슈를 status='deleted' 로 숨김 (DB 완전삭제 아님 → 되살릴 수 있다)
//
// 하지 않는 일 (돈 사고 방지):
//   - 주문상태/입금확인/deposits/정산/재고/배송은 일절 건드리지 않는다.
//   - 금액을 다시 «계산»하지 않는다. 회수할 때 남긴 금액을 그대로 되돌린다.
//   - 관리자가 손으로 조정한 포인트(created_by='admin')는 건드리지 않는다.
//
// 이중 지급 차단 (핵심):
//   source_key = `order_return_undo:<주문그룹>` 로 고정한다.
//   DB 부분 유니크 인덱스(customer_point_ledger_source_key_uidx)가 두 번째를 거부한다.
//   일괄 포인트지급이 쓰는 것과 같은 장치다. 화면에서 두 번 눌러도 돈은 한 번만 나간다.
//
// 클라이언트 값 불신:
//   화면은 «고객이슈 id» 하나만 보낸다. 주문그룹·회수금액·전화번호는 서버가 DB에서 다시 찾는다.
//   (order-return 이 「클라이언트가 보낸 그룹 문자열을 신뢰하지 않는다」고 한 원칙 그대로)

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (v: unknown) => String(v ?? "").trim();
const digitsOnly = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 이슈 본문의 「주문번호: RURU-XXXX」 한 줄 */
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
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const taskId = text(body.taskId);
    if (!taskId) return jsonError("되돌릴 고객이슈 ID가 없습니다.");

    const sb = admin();

    // ── 1) 고객이슈 확인 ──
    const { data: task, error: taskErr } = await sb
      .from("admin_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();
    if (taskErr) return jsonError("고객이슈 조회 실패: " + taskErr.message, 500);
    if (!task) return jsonError("고객이슈를 찾지 못했습니다.");

    if (text((task as any).source) !== "order_return_flow") {
      return jsonError("이 이슈는 주문상세 «반품/교환 등록»으로 만들어진 건이 아닙니다. 되돌릴 반품기록이 없어요.");
    }
    if (text((task as any).status).toLowerCase() === "deleted") {
      return jsonError("이미 지운 고객이슈입니다.");
    }
    // 해결완료된 건은 막는다 — 이미 처리를 끝낸 건을 되돌리는 건 위험하다(사장님 확인 기준)
    if (text((task as any).status).toLowerCase() === "done" || (task as any).is_resolved === true) {
      return jsonError("해결완료된 건은 되돌릴 수 없습니다. 목록에서 치우기만 됩니다.");
    }

    // ── 2) 주문그룹 찾기 (서버가 직접) ──
    const orderNo = bodyField((task as any).body, "주문번호:");
    if (!orderNo) return jsonError("이슈에 주문번호가 없어 되돌릴 주문을 찾지 못했습니다.");

    const { data: orderRows, error: orderErr } = await sb
      .from("orders")
      .select("id, order_group_id, order_lookup_code, customer_phone, youtube_nickname, customer_name, is_deleted")
      .eq("order_lookup_code", orderNo);
    if (orderErr) return jsonError("주문 조회 실패: " + orderErr.message, 500);

    const liveRows = (orderRows || []).filter((r: any) => r?.is_deleted !== true);
    if (liveRows.length === 0) return jsonError(`주문 ${orderNo} 을(를) 찾지 못했습니다.`);

    const groupId = text(liveRows[0]?.order_group_id) || String(liveRows[0]?.id);
    const phone = digitsOnly(liveRows[0]?.customer_phone);
    const nickname = text(liveRows[0]?.youtube_nickname);
    const customerName = text(liveRows[0]?.customer_name);
    const groupRowIds = liveRows.map((r: any) => num(r.id)).filter((n) => n > 0);

    // ── 3) 포인트 되돌림 — 회수했던 «그 금액 그대로» ──
    let refunded = 0;
    let pointNote = "";

    if (!phone || phone.length < 9) {
      pointNote = "전화번호가 없어 포인트는 건드리지 않았습니다.";
    } else {
      const { data: ledgerRows, error: ledgerErr } = await sb
        .from("customer_point_ledger")
        .select("id, amount, created_by, source_key, created_at")
        .eq("related_order_id", groupId);
      if (ledgerErr) return jsonError("포인트 이력 조회 실패: " + ledgerErr.message, 500);

      const plan = planReturnUndo(ledgerRows || []);
      pointNote = plan.note;

      if (plan.refundPoints > 0) {
        const { data: bal } = await sb
          .from("customer_point_balances")
          .select("*")
          .eq("customer_phone", phone)
          .maybeSingle();
        const current = num((bal as any)?.current_points);
        const next = current + plan.refundPoints;

        const ledgerId = randomUUID();
        const { error: insErr } = await sb.from("customer_point_ledger").insert({
          id: ledgerId,
          customer_phone: phone,
          youtube_nickname: nickname || null,
          customer_name: customerName || null,
          change_type: "adjust",
          amount: plan.refundPoints,                       // 양수 = 되돌려 지급
          balance_after: next,
          reason: "반품/교환 등록 취소 — 회수 포인트 반환",
          admin_memo: `주문 ${orderNo} · 고객이슈 취소로 자동 반환`.slice(0, 500),
          related_order_id: groupId,
          related_broadcast_id: null,
          customer_visible: true,
          customer_seen_at: null,
          created_by: RETURN_UNDO_CREATED_BY,
          // ⚠ 이중 지급 차단의 핵심 — DB 유니크 인덱스가 두 번째를 거부한다
          source_key: returnUndoSourceKey(groupId),
        });

        if (insErr) {
          const duplicate = /duplicate key|unique constraint|23505|source_key/i.test(String(insErr.message || ""));
          if (duplicate) {
            // 돈은 나가지 않았다 — 이미 되돌린 건이다. 오류가 아니라 «이미 처리됨»으로 알린다.
            pointNote = "이미 되돌린 건이라 포인트를 다시 지급하지 않았습니다.";
          } else {
            return jsonError("포인트 반환 실패(아무것도 바뀌지 않았습니다): " + insErr.message, 500);
          }
        } else {
          const { error: balErr } = await sb.from("customer_point_balances").upsert(
            {
              customer_phone: phone,
              youtube_nickname: nickname || (bal as any)?.youtube_nickname || null,
              customer_name: customerName || (bal as any)?.customer_name || null,
              current_points: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "customer_phone" },
          );
          if (balErr) {
            // 잔액 갱신 실패 → 방금 넣은 원장 줄을 되돌린다(돈 기록이 어긋나면 안 된다)
            await sb.from("customer_point_ledger").delete().eq("id", ledgerId);
            return jsonError("포인트 잔액 갱신 실패(아무것도 바뀌지 않았습니다): " + balErr.message, 500);
          }
          refunded = plan.refundPoints;
          pointNote = `회수했던 ${refunded.toLocaleString("ko-KR")}원을 돌려드렸습니다.`;
        }
      }
    }

    // ── 4) 반품기록 정리 — «가장 최근 등록»일 때만 ──
    let recordNote = "";
    const { data: siblingIssues } = await sb
      .from("admin_tasks")
      .select("id, created_at, status, body, source")
      .eq("source", "order_return_flow")
      .ilike("body", `%주문번호: ${orderNo}%`);

    const clearable = canClearReturnRecord(task as any, (siblingIssues || []) as any[]);

    if (clearable && groupRowIds.length > 0) {
      const { error: clrErr } = await sb
        .from("orders")
        .update({ return_status: null, return_reason: null, return_amount: null, return_updated_at: null })
        .in("id", groupRowIds);
      recordNote = clrErr
        ? "반품기록 정리 실패(포인트는 처리됨): " + clrErr.message
        : "주문의 반품/교환 기록을 지웠습니다.";
    } else {
      recordNote = clearable
        ? "정리할 주문 행을 찾지 못해 반품기록은 그대로 뒀습니다."
        : "같은 주문서에 더 최근 반품 등록이 있어 반품기록은 그대로 뒀습니다.";
    }

    // ── 5) 고객이슈 숨김 (맨 마지막 — 실패해도 다시 시도할 수 있게) ──
    const { error: hideErr } = await sb
      .from("admin_tasks")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString(),
        resolved_note: `반품/교환 등록 취소 — ${pointNote}`.slice(0, 2000),
      })
      .eq("id", taskId);
    if (hideErr) return jsonError("포인트·기록은 처리됐지만 고객이슈 숨김 실패: " + hideErr.message, 500);

    return NextResponse.json({
      ok: true,
      refunded,
      pointNote,
      recordNote,
      orderNo,
      message: [`반품/교환 등록을 취소했습니다.`, pointNote, recordNote].filter(Boolean).join("\n"),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "되돌리기 실패", 500);
  }
}
