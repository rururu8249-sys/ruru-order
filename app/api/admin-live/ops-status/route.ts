import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function amount(row: Record<string, unknown>) {
  return (
    Number(row.final_amount || 0) ||
    Number(row.adjusted_total_price || 0) ||
    Number(row.total_price || 0) ||
    Number(row.product_price || 0) ||
    0
  );
}

function isAutoPaid(row: Record<string, unknown>) {
  const status = clean(row.admin_order_status_v2 || row.order_manage_status);
  return status === "자동입금확인" || status === "자동입금확인완료" || status === "auto_paid";
}

function pageLabel(pageType: string) {
  if (pageType === "order_form") return "주문서 작성중";
  if (pageType === "order_lookup") return "주문조회";
  if (pageType === "group_buy") return "공구상품";
  if (pageType === "admin") return "관리자";
  return "사이트 접속";
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const since = new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString();
    const activeSince = new Date(Date.now() - 1000 * 120).toISOString();

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id, order_group_id, order_lookup_code, created_at, youtube_nickname, customer_name, final_amount, adjusted_total_price, total_price, product_price, admin_order_status_v2, order_manage_status, deposit_confirmed_at"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80);

    if (ordersError) {
      return NextResponse.json(
        { ok: false, message: ordersError.message },
        { status: 500 }
      );
    }

    const recentOrders = (orders || []).map((row) => ({
      id: String(row.id),
      groupId: clean(row.order_group_id || row.order_lookup_code || row.id),
      createdAt: row.created_at,
      nickname: clean(row.youtube_nickname || row.customer_name || "고객"),
      amount: amount(row as Record<string, unknown>),
      isAutoPaid: isAutoPaid(row as Record<string, unknown>),
      paidAt: row.deposit_confirmed_at || null,
    }));

    const autoPaidOrders = recentOrders.filter((row) => row.isAutoPaid);

    let presenceAvailable = true;
    let activeVisitors: Array<{
      id: string;
      visitorKey: string;
      nickname: string;
      pageType: string;
      pageLabel: string;
      lastSeenAt: string;
    }> = [];

    const { data: presence, error: presenceError } = await supabase
      .from("visitor_presence")
      .select("id, visitor_key, nickname, page_type, last_seen_at")
      .gte("last_seen_at", activeSince)
      .order("last_seen_at", { ascending: false })
      .limit(30);

    if (presenceError) {
      presenceAvailable = false;
    } else {
      activeVisitors = (presence || []).map((row) => ({
        id: String(row.id),
        visitorKey: clean(row.visitor_key),
        nickname: clean(row.nickname || "비회원 방문자"),
        pageType: clean(row.page_type || "page"),
        pageLabel: pageLabel(clean(row.page_type || "page")),
        lastSeenAt: clean(row.last_seen_at),
      }));
    }

    return NextResponse.json({
      ok: true,
      serverTime: new Date().toISOString(),
      recentOrders,
      autoPaidOrders,
      activeVisitors,
      presenceAvailable,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
