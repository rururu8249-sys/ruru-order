import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { buildAdminLiveOrderGroups, sortLiveOrdersByCreatedDesc, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import { loadPickingWorkspaceRows, parsePickingWorkspaceRequest, type PickingScopeSource } from "@/lib/orderPickingScopeLoader";
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
    const rows = await loadPickingWorkspaceRows(source, broadcastIds);
    const orders = sortLiveOrdersByCreatedDesc(buildAdminLiveOrderGroups(rows)).map(toAdminLiveOrder);
    return NextResponse.json({ ok: true, orders, broadcastIds });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "물건챙기기 주문 조회에 실패했습니다." }, { status: 400 });
  }
}
