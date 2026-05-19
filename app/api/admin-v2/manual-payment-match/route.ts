// app/api/admin-v2/manual-payment-match/route.ts
// 목적: 주문관리 팝업에서 입금내역을 선택해 수동매칭 처리
// 주의: service_role 서버 권한으로만 실행. 브라우저에 service_role 키 노출 없음.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const depositId = Number(body?.depositId || 0);
    const orderGroupId = String(body?.orderGroupId || "").trim();
    const orderIds = toNumberArray(body?.orderIds);

    if (!depositId) {
      return NextResponse.json(
        { ok: false, message: "선택된 입금내역이 없습니다." },
        { status: 400 }
      );
    }

    if (!orderGroupId && orderIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "매칭할 주문 정보가 없습니다." },
        { status: 400 }
      );
    }

    const { data: deposit, error: depositError } = await supabase
      .from("deposits")
      .select("*")
      .eq("id", depositId)
      .single();

    if (depositError || !deposit) {
      return NextResponse.json(
        { ok: false, message: depositError?.message || "입금내역을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (deposit.confirmed_at || String(deposit.match_status || "").includes("수동입금확인")) {
      return NextResponse.json(
        { ok: false, message: "이미 처리된 입금내역입니다." },
        { status: 409 }
      );
    }

    let orderQuery = supabase
      .from("orders")
      .select("*")
      .neq("is_deleted", true);

    if (orderIds.length > 0) {
      orderQuery = orderQuery.in("id", orderIds);
    } else {
      orderQuery = orderQuery.eq("order_group_id", orderGroupId);
    }

    const { data: orders, error: orderError } = await orderQuery;

    if (orderError) {
      return NextResponse.json(
        { ok: false, message: orderError.message },
        { status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { ok: false, message: "매칭할 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();
    const ids = orders.map((order) => order.id).filter(Boolean);
    const firstOrder = orders[0];

    const { error: updateOrdersError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "입금확인",
        order_manage_status: "입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", ids);

    if (updateOrdersError) {
      return NextResponse.json(
        { ok: false, message: updateOrdersError.message },
        { status: 500 }
      );
    }

    const { error: updateDepositError } = await supabase
      .from("deposits")
      .update({
        match_order_group_id: orderGroupId || firstOrder.order_group_id || null,
        match_customer_id: firstOrder.customer_id || null,
        match_status: "수동입금확인",
        confirmed_at: nowIso,
        confirmed_note: "관리자 수동매칭",
      })
      .eq("id", depositId);

    if (updateDepositError) {
      return NextResponse.json(
        { ok: false, message: updateDepositError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "수동매칭 완료",
      orderCount: ids.length,
      depositId,
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
