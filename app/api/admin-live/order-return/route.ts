import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// [2026-08-13 사장님 요청] 반품(환불)/반품(교환) 접수 — 상품 선택식 기록 + 고객이슈 자동 등록 + (환불 시) 적립 포인트 회수.
//
// 하는 일:
//   1) 그 주문그룹 orders 의 return_* 기록 컬럼만 update (기존 [+기록]과 동일한 컬럼 — 주문상태/입금/정산/재고 무관)
//   2) admin_tasks 에 고객이슈 자동 등록 (고객·이슈 → 고객 이슈 탭에 표시)
//   3) mode=refund 이면: 그 주문그룹이 자동 적립했던 포인트(orders.point_earned_amount) 중
//      선택 상품 금액 비율만큼 회수. ledger('cancel', 음수) + balances 차감.
//      잔액이 부족하면 마이너스 잔액 허용(사장님 지시 — DB 체크 제약은 핫픽스 SQL로 완화).
//
// 하지 않는 일 (돈 사고 방지):
//   - 주문상태/입금확인/deposits/정산/재고는 일절 변경하지 않는다 (기록 + 포인트 회수만).
//   - 고객이 '사용한' 포인트 반환은 여기서 다루지 않는다 (기존 취소 플로우 담당).
//   - 같은 주문그룹에 회수가 이미 있으면 다시 회수하지 않는다 (이중 회수 방지,
//     ledger.related_order_id = order_group_id + created_by = 'order_return_flow' 로 판정).

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

type OrderRow = Record<string, any>;

function rowProductAmount(row: OrderRow) {
  const unit = num(row.adjusted_product_price) || num(row.product_price);
  const qty = Math.max(1, num(row.qty) || 1);
  return Math.max(0, unit * qty);
}

function rowLabel(row: OrderRow) {
  const opt = [text(row.color), text(row.size)].filter((v) => v && v !== "없음").join("/");
  return `${text(row.product_name) || "상품"}${opt ? `(${opt})` : ""}×${Math.max(1, num(row.qty) || 1)}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = text(body.mode); // "refund" | "exchange"
    const refRowId = num(body.refRowId);
    const selectedRowIds = Array.isArray(body.rowIds)
      ? (body.rowIds as unknown[]).map((v) => num(v)).filter((v) => v > 0)
      : [];
    const detail = text(body.detail).slice(0, 1000);

    if (mode !== "refund" && mode !== "exchange") return jsonError("유형(환불/교환)을 선택해주세요.");
    if (!refRowId) return jsonError("기준 주문 행이 없습니다.");
    if (selectedRowIds.length === 0) return jsonError("반품할 상품을 1개 이상 선택해주세요.");

    const sb = admin();

    // 기준 행 → 주문그룹 확정 (클라이언트가 보낸 그룹 문자열을 신뢰하지 않는다)
    const { data: refRow, error: refErr } = await sb
      .from("orders")
      .select("id, order_group_id")
      .eq("id", refRowId)
      .maybeSingle();
    if (refErr) return jsonError("기준 주문 조회 실패: " + refErr.message, 500);
    if (!refRow) return jsonError("기준 주문 행을 찾지 못했습니다.");
    const groupId = text(refRow.order_group_id);

    const groupQuery = groupId
      ? sb.from("orders").select("*").eq("order_group_id", groupId)
      : sb.from("orders").select("*").eq("id", refRowId);
    const { data: groupRowsRaw, error: groupErr } = await groupQuery;
    if (groupErr) return jsonError("주문그룹 조회 실패: " + groupErr.message, 500);

    const groupRows = ((groupRowsRaw || []) as OrderRow[]).filter((r) => r.is_deleted !== true);
    if (groupRows.length === 0) return jsonError("주문그룹에 행이 없습니다.");

    const groupRowIds = new Set(groupRows.map((r) => num(r.id)));
    const selected = groupRows.filter((r) => selectedRowIds.includes(num(r.id)));
    if (selected.length === 0 || !selectedRowIds.every((id) => groupRowIds.has(id))) {
      return jsonError("선택한 상품이 이 주문그룹의 상품과 일치하지 않습니다.");
    }

    const first = groupRows[0];
    const nick = text(first.youtube_nickname);
    const nm = text(first.customer_name);
    const phone = digitsOnly(first.customer_phone);
    const orderNo = text(first.order_lookup_code);
    const modeLabel = mode === "refund" ? "반품(환불)" : "반품(교환)";
    const productSummary = selected.map(rowLabel).join(", ");

    // ── 1) return_* 기록 (그룹 전체 행에 동일 기록 — 기존 [+기록] 저장과 같은 방식/컬럼)
    const reasonText = [`[${modeLabel}] 대상: ${productSummary}`, detail ? `세부: ${detail}` : ""]
      .filter(Boolean)
      .join("\n");
    const { error: retErr } = await sb
      .from("orders")
      .update({
        return_status: modeLabel,
        return_reason: reasonText,
        return_updated_at: new Date().toISOString(),
      })
      .in("id", Array.from(groupRowIds));
    if (retErr) return jsonError("반품/교환 기록 저장 실패: " + retErr.message, 500);

    // ── 2) 고객이슈 자동 등록 (admin_tasks — 고객·이슈 탭과 동일 테이블)
    const nowLabel = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
    const issueTitle = `[고객이슈] ${nick || nm || phone || "고객"} - ${modeLabel}`;
    const issueBody = [
      `자동날짜: ${nowLabel}`,
      `이슈유형: ${modeLabel}`,
      `닉네임: ${nick || "-"}`,
      `이름: ${nm || "-"}`,
      `전화번호: ${phone || "-"}`,
      orderNo ? `주문번호: ${orderNo}` : "",
      `대상상품: ${productSummary}`,
      "",
      detail || modeLabel,
    ]
      .filter(Boolean)
      .join("\n");

    const { error: taskErr } = await sb.from("admin_tasks").insert({
      task_type: mode === "refund" ? "refund" : "exchange",
      title: issueTitle,
      body: issueBody,
      customer_name: nm || null,
      customer_nickname: nick || null,
      related_product: productSummary.slice(0, 500) || null,
      source: "order_return_flow",
      status: "open",
      priority: "normal",
      raw_payload: {},
    });
    const issueRegistered = !taskErr;

    // ── 3) 환불이면 적립 포인트 회수 (기록/이슈가 저장된 뒤에만 진행)
    let reclaimed = 0;
    let balanceAfter: number | null = null;
    let reclaimNote = "";

    if (mode === "refund") {
      const groupEarned = Math.max(0, ...groupRows.map((r) => num(r.point_earned_amount)));

      if (!phone || phone.length < 10) {
        reclaimNote = "전화번호가 없어 포인트 회수를 건너뜀";
      } else if (groupEarned <= 0) {
        reclaimNote = "이 주문으로 적립된 포인트 없음(회수 0원)";
      } else {
        // 이중 회수 방지: 같은 그룹으로 이미 회수한 이력이 있으면 건너뜀
        const { data: prior } = await sb
          .from("customer_point_ledger")
          .select("id, amount")
          .eq("related_order_id", groupId || String(refRowId))
          .eq("created_by", "order_return_flow")
          .limit(1);
        if (Array.isArray(prior) && prior.length > 0) {
          reclaimNote = `이미 회수한 주문그룹(이전 회수 ${Math.abs(num(prior[0].amount)).toLocaleString("ko-KR")}원) — 이번엔 회수 안 함`;
        } else {
          // 적립 대상 금액(적립 RPC와 동일: 포인트 사용 행 제외) 기준으로 선택 상품 비율 안분
          const eligible = groupRows.filter((r) => num(r.point_used_amount) === 0);
          const denom = eligible.reduce((s, r) => s + rowProductAmount(r), 0);
          const selectedEligible = selected.filter((r) => num(r.point_used_amount) === 0);
          const numer = selectedEligible.reduce((s, r) => s + rowProductAmount(r), 0);

          if (denom <= 0 || numer <= 0) {
            reclaimNote = "적립 대상 금액이 없어 회수 0원";
          } else {
            reclaimed =
              numer >= denom ? groupEarned : Math.min(groupEarned, Math.floor((groupEarned * numer) / denom));
          }

          if (reclaimed > 0) {
            const { data: bal } = await sb
              .from("customer_point_balances")
              .select("*")
              .eq("customer_phone", phone)
              .maybeSingle();
            const current = num((bal as any)?.current_points);
            const next = current - reclaimed; // 잔액 부족 시 마이너스 허용(사장님 지시)

            const ledgerId = randomUUID();
            const { error: ledErr } = await sb.from("customer_point_ledger").insert({
              id: ledgerId,
              customer_phone: phone,
              youtube_nickname: nick || null,
              customer_name: nm || null,
              change_type: "cancel",
              amount: -reclaimed,
              balance_after: next,
              reason: `${modeLabel} 적립 포인트 회수`,
              admin_memo: `주문 ${orderNo || groupId} · ${productSummary}`.slice(0, 500),
              related_order_id: groupId || String(refRowId),
              related_broadcast_id: null,
              customer_visible: true,
              customer_seen_at: null,
              created_by: "order_return_flow",
            });
            if (ledErr) {
              // 마이너스 잔액 제약이 아직 안 풀린 경우 등 — 기록/이슈는 이미 저장됨을 알려준다
              return NextResponse.json({
                ok: true,
                partial: true,
                message: "기록·고객이슈는 저장됐지만 포인트 회수 실패: " + ledErr.message,
                reclaimed: 0,
                issueRegistered,
              });
            }

            const { error: balErr } = await sb
              .from("customer_point_balances")
              .upsert(
                {
                  customer_phone: phone,
                  youtube_nickname: nick || (bal as any)?.youtube_nickname || null,
                  customer_name: nm || (bal as any)?.customer_name || null,
                  current_points: next,
                  total_granted_points: Math.max(0, num((bal as any)?.total_granted_points)),
                  total_used_points: Math.max(0, num((bal as any)?.total_used_points)),
                  total_canceled_points: Math.max(0, num((bal as any)?.total_canceled_points)) + reclaimed,
                  total_adjusted_points: num((bal as any)?.total_adjusted_points),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "customer_phone" }
              );
            if (balErr) {
              await sb.from("customer_point_ledger").delete().eq("id", ledgerId);
              return NextResponse.json({
                ok: true,
                partial: true,
                message: "기록·고객이슈는 저장됐지만 포인트 잔액 반영 실패: " + balErr.message,
                reclaimed: 0,
                issueRegistered,
              });
            }
            balanceAfter = next;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      modeLabel,
      products: productSummary,
      issueRegistered,
      issueError: taskErr ? taskErr.message : null,
      reclaimed,
      balanceAfter,
      reclaimNote,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
