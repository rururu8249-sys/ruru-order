import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { buildAdminLiveOrderGroups, sortLiveOrdersByCreatedDesc, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import { kstDayStartIso, loadPickingWorkspaceRows, mergePickingWorkspaceRows, parsePickingWorkspaceRequest, type PickingScopeSource } from "@/lib/orderPickingScopeLoader";
import type { OrderRow } from "@/lib/admin-v2/types";

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
    const { broadcastIds } = parsePickingWorkspaceRequest(await request.json());
    const supabase = getSupabaseAdminClient();
    const source: PickingScopeSource<OrderRow> = {
      async getBroadcasts(ids) {
        const { data, error } = await supabase.from("broadcasts").select("id, started_at, ended_at").in("id", [...ids]);
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
    const readAllSafetyRows = async (kind: "paid_today" | "repick") => {
      const result: OrderRow[] = [];
      const todayStart = kstDayStartIso();
      for (let from = 0; ; from += 1000) {
        let query = supabase.from("orders").select("*").is("picked_at", null).order("id", { ascending: true }).range(from, from + 999);
        query = kind === "paid_today"
          ? query.gte("deposit_confirmed_at", todayStart)
          : query.not("repick_required_at", "is", null).is("repick_resolved_at", null);
        const { data, error } = await query;
        if (error) throw new Error(`${kind === "paid_today" ? "오늘 결제" : "재챙김"} 주문 조회 실패: ${error.message}`);
        const page = (data || []) as OrderRow[];
        result.push(...(kind === "paid_today" ? page.filter((row) => {
          const orderedAt = Date.parse(String(row.created_at || ""));
          return Number.isFinite(orderedAt) && orderedAt < Date.parse(todayStart);
        }) : page));
        if (page.length < 1000) return result;
      }
    };
    const [selectedRows, paidTodayRows, repickRows] = await Promise.all([
      loadPickingWorkspaceRows(source, broadcastIds),
      readAllSafetyRows("paid_today"),
      readAllSafetyRows("repick"),
    ]);
    const rows = mergePickingWorkspaceRows(selectedRows, paidTodayRows, repickRows);
    const orders = sortLiveOrdersByCreatedDesc(buildAdminLiveOrderGroups(rows)).map(toAdminLiveOrder);
    return NextResponse.json({ ok: true, orders, broadcastIds });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "물건챙기기 주문 조회에 실패했습니다." }, { status: 400 });
  }
}
