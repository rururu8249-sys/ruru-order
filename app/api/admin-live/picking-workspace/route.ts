import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { buildAdminLiveOrderGroups, sortLiveOrdersByCreatedDesc, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import { kstDayStartIso, kstDaysAgoStartIso, loadPickingWorkspaceRows, parsePickingWorkspaceRequest, selectAdditionalPickingRows, type PickingScopeSource } from "@/lib/orderPickingScopeLoader";
import type { OrderRow } from "@/lib/admin-v2/types";
import { buildPickingExceptions, buildPickingCancellations } from "@/lib/orderPickingExceptions";
import { fieldFromIssueBody } from "@/lib/issueBodyMeta";

export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const input = await request.json();
    const { broadcastIds } = parsePickingWorkspaceRequest(input);
    const supabase = getSupabaseAdminClient();
    const source: PickingScopeSource<OrderRow> = {
      async getBroadcasts(ids) {
        if (ids.length === 0) return [];
        const { data, error } = await supabase.from("broadcasts").select("id, started_at, ended_at, status").in("id", [...ids]);
        if (error) throw new Error(`방송 조회 실패: ${error.message}`);
        return data || [];
      },
      async getOrdersByBroadcastIds(ids, from, to) {
        const { data, error } = await supabase.from("orders").select("*").in("broadcast_id", [...ids]).order("id", { ascending: true }).range(from, to);
        if (error) throw new Error(`주문 조회 실패: ${error.message}`);
        return (data || []) as OrderRow[];
      },
      async getOrdersByTimeRange(startedAt, endedAt, from, to) {
        const { data, error } = await supabase.from("orders").select("*").gte("created_at", startedAt).lte("created_at", endedAt).order("id", { ascending: true }).range(from, to);
        if (error) throw new Error(`과거 주문 조회 실패: ${error.message}`);
        return (data || []) as OrderRow[];
      },
    };
    const readAllSafetyRows = async (kind: "paid_today" | "repick" | "recent_card_without_time") => {
      const result: OrderRow[] = [];
      const todayStart = kstDayStartIso();
      for (let from = 0; ; from += 1000) {
        let query = supabase.from("orders").select("*").is("picked_at", null).order("id", { ascending: true }).range(from, from + 999);
        if (kind === "paid_today") query = query.gte("deposit_confirmed_at", todayStart);
        else if (kind === "repick") query = query.not("repick_required_at", "is", null).is("repick_resolved_at", null);
        else query = query
          .gte("created_at", kstDaysAgoStartIso(new Date(), 1))
          .eq("admin_order_status_v2", "카드결제완료")
          .is("deposit_confirmed_at", null);
        const { data, error } = await query;
        if (error) throw new Error(`${kind === "paid_today" ? "오늘 결제" : kind === "repick" ? "재챙김" : "최근 카드결제"} 주문 조회 실패: ${error.message}`);
        const page = (data || []) as OrderRow[];
        result.push(...(kind === "paid_today" ? page.filter((row) => {
          const orderedAt = Date.parse(String(row.created_at || ""));
          return Number.isFinite(orderedAt) && orderedAt < Date.parse(todayStart);
        }) : page));
        if (page.length < 1000) return result;
      }
    };
    const [selectedRows, paidTodayRows, repickRows, recentCardWithoutTimeRows] = await Promise.all([
      loadPickingWorkspaceRows(source, broadcastIds),
      readAllSafetyRows("paid_today"),
      readAllSafetyRows("repick"),
      readAllSafetyRows("recent_card_without_time"),
    ]);
    // “현재 목록으로” has no broadcast selection: refresh precisely those rows,
    // not every order belonging to the same customer or surrounding dates.
    if (broadcastIds.length === 0 && input.includeExceptions === true) {
      if (!Array.isArray(input.orderIds) || input.orderIds.length > 5000 || input.orderIds.some((id: unknown) => !/^\d+$/.test(String(id)))) throw new Error("현재 목록의 주문 범위를 확인하지 못했습니다.");
      const ids = [...new Set(input.orderIds.map(Number))];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from("orders").select("*").in("id", ids.slice(i, i + 200)).order("id", { ascending: true });
        if (error) throw new Error(`현재 주문 조회 실패: ${error.message}`);
        selectedRows.push(...((data || []) as OrderRow[]).filter(row => row.is_deleted !== true));
      }
    }
    const safetyBroadcastIds = Array.from(new Set(
      [...paidTodayRows, ...recentCardWithoutTimeRows]
        .map((row) => String(row.broadcast_id || ""))
        .filter(Boolean),
    ));
    const safetyBroadcasts = await source.getBroadcasts(safetyBroadcastIds);
    const additionalRows = selectAdditionalPickingRows({
      paidLaterRows: paidTodayRows,
      recentCardWithoutTimeRows,
      repickRows,
      broadcasts: safetyBroadcasts,
    });
    const orders = sortLiveOrdersByCreatedDesc(buildAdminLiveOrderGroups(selectedRows)).map(toAdminLiveOrder);
    const additionalOrders = sortLiveOrdersByCreatedDesc(buildAdminLiveOrderGroups(additionalRows)).map(toAdminLiveOrder);
    // Fresh, read-only exception snapshot is requested only when exporting. Any failed
    // page aborts the whole export; a partial issue list must never look complete.
    let exceptions;
    if (input.includeExceptions === true) {
      const readAll = async (table: "admin_tasks" | "refund_ledger", columns: string) => {
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from(table).select(columns).order("id", { ascending: true }).range(from, from + 999);
          if (error) throw new Error(`고객이슈 조회 실패: ${error.message}`);
          const page = (data || []) as unknown as Record<string, unknown>[];
          rows.push(...page);
          if (page.length < 1000) return rows;
        }
      };
      const [tasks, ledgers] = await Promise.all([
        readAll("admin_tasks", "id,created_at,task_type,body,status,resolved_at,customer_name,customer_nickname,related_product"),
        readAll("refund_ledger", "id,created_at,admin_task_id,order_group_id,order_lookup_code,nickname,customer_name,kind,reason,stage,next_action,done_at,memo,product_snapshot"),
      ]);
      // Issue sheet is global. Fetch only explicitly linked order identities for
      // broadcast labels; never infer a customer's broadcast from their name.
      const issueOrders = new Map<string, Record<string, unknown>>(selectedRows.map(row => [String(row.id), row as unknown as Record<string, unknown>]));
      const codes = [...new Set([...tasks.map(task => fieldFromIssueBody(task.body, "주문번호:")), ...ledgers.map(ledger => String(ledger.order_lookup_code || ""))].filter(Boolean))];
      const groups = [...new Set(ledgers.map(ledger => String(ledger.order_group_id || "")).filter(Boolean))];
      for (const [column, values] of [["order_lookup_code", codes], ["order_group_id", groups]] as const) {
        for (let offset = 0; offset < values.length; offset += 200) {
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from("orders").select("id,created_at,order_lookup_code,order_group_id,broadcast_name,product_name,color,size,qty,youtube_nickname,customer_name,picked_at,admin_order_status_v2,order_manage_status").in(column, values.slice(offset, offset + 200)).order("id", { ascending: true }).range(from, from + 999);
            if (error) throw new Error(`고객이슈 연결 주문 조회 실패: ${error.message}`);
            const page = (data || []) as Record<string, unknown>[];
            page.forEach(row => issueOrders.set(String(row.id), row));
            if (page.length < 1000) break;
          }
        }
      }
      exceptions = buildPickingExceptions([...issueOrders.values()], tasks, ledgers, { includeAllIssues: true, cancellationOrders: selectedRows });
    }
    const cancellations = input.includeExceptions === true ? buildPickingCancellations(selectedRows) : undefined;
    return NextResponse.json({ ok: true, orders, additionalOrders, broadcastIds, exceptions, cancellations });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "물건챙기기 주문 조회에 실패했습니다." }, { status: 400 });
  }
}
