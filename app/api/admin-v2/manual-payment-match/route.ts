// app/api/admin-v2/manual-payment-match/route.ts
// 목적: 주문관리 팝업에서 입금내역을 선택해 수동매칭 처리
// 주의: service_role 서버 권한으로만 실행. 브라우저에 service_role 키 노출 없음.
// 돈 관련 안전기준: 선택 입금합계와 주문예정금액이 정확히 일치할 때만 수동매칭 허용.

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

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values)).filter((item) => Number.isFinite(item) && item > 0);
}

function rowAmount(row: any) {
  return (
    Number(row?.final_amount || 0) ||
    Number(row?.adjusted_total_price || 0) ||
    Number(row?.total_price || 0) ||
    0
  );
}

function depositAmount(row: any) {
  return Number(row?.amount || 0) || 0;
}

function isDepositAlreadyConfirmed(deposit: any) {
  const status = String(deposit?.match_status || "").trim();

  if (deposit?.confirmed_at) return true;
  if (deposit?.match_order_group_id || deposit?.match_customer_id) return true;

  return ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const legacyDepositId = Number(body?.depositId || 0);
    const depositIds = uniqueNumbers([
      ...toNumberArray(body?.depositIds),
      ...(legacyDepositId > 0 ? [legacyDepositId] : []),
    ]);

    const orderGroupId = String(body?.orderGroupId || "").trim();
    const orderIds = toNumberArray(body?.orderIds);
    const clientExpectedAmount = Number(body?.expectedAmount || 0);
    const clientSelectedTotalAmount = Number(body?.selectedTotalAmount || 0);

    if (depositIds.length === 0) {
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

    const { data: deposits, error: depositError } = await supabase
      .from("deposits")
      .select("*")
      .in("id", depositIds);

    if (depositError) {
      return NextResponse.json(
        { ok: false, message: depositError.message || "입금내역 조회 실패" },
        { status: 500 }
      );
    }

    if (!deposits || deposits.length !== depositIds.length) {
      return NextResponse.json(
        { ok: false, message: "선택한 입금내역 중 찾을 수 없는 항목이 있습니다." },
        { status: 404 }
      );
    }

    const alreadyConfirmed = deposits.find(isDepositAlreadyConfirmed);

    if (alreadyConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message: `이미 처리된 입금내역이 포함되어 있습니다. 입금ID: ${alreadyConfirmed.id}`,
        },
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

    const ids = orders.map((order) => order.id).filter(Boolean);
    const firstOrder = orders[0];

    const serverExpectedAmount = orders.reduce((sum, order) => sum + rowAmount(order), 0);
    const expectedAmount = serverExpectedAmount || clientExpectedAmount;
    const selectedDepositTotal = deposits.reduce((sum, deposit) => sum + depositAmount(deposit), 0);

    if (clientSelectedTotalAmount > 0 && clientSelectedTotalAmount !== selectedDepositTotal) {
      return NextResponse.json(
        {
          ok: false,
          message: `선택합계 검증 실패: 화면합계 ${clientSelectedTotalAmount.toLocaleString()}원 / 서버합계 ${selectedDepositTotal.toLocaleString()}원`,
        },
        { status: 400 }
      );
    }

    if (clientExpectedAmount > 0 && serverExpectedAmount > 0 && clientExpectedAmount !== serverExpectedAmount) {
      return NextResponse.json(
        {
          ok: false,
          message: `주문금액 검증 실패: 화면금액 ${clientExpectedAmount.toLocaleString()}원 / 서버금액 ${serverExpectedAmount.toLocaleString()}원`,
        },
        { status: 400 }
      );
    }

    if (!expectedAmount || expectedAmount <= 0) {
      return NextResponse.json(
        { ok: false, message: "주문금액을 확인할 수 없어 수동매칭할 수 없습니다." },
        { status: 400 }
      );
    }

    if (selectedDepositTotal !== expectedAmount) {
      return NextResponse.json(
        {
          ok: false,
          message: `입금합계가 주문금액과 일치하지 않습니다. 주문금액 ${expectedAmount.toLocaleString()}원 / 선택합계 ${selectedDepositTotal.toLocaleString()}원`,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const confirmedNote =
      depositIds.length > 1
        ? `관리자 수동매칭 / 다중입금 ${depositIds.length}건 / 합계 ${selectedDepositTotal.toLocaleString()}원`
        : "관리자 수동매칭";

    const { error: updateOrdersError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "수동입금확인",
        order_manage_status: "수동입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", ids);

    if (updateOrdersError) {
      return NextResponse.json(
        { ok: false, message: updateOrdersError.message },
        { status: 500 }
      );
    }

    const { error: updateDepositsError } = await supabase
      .from("deposits")
      .update({
        match_order_group_id: orderGroupId || firstOrder.order_group_id || null,
        match_customer_id: firstOrder.customer_id || null,
        match_status: "수동입금확인",
        confirmed_at: nowIso,
        confirmed_note: confirmedNote,
      })
      .in("id", depositIds);

    if (updateDepositsError) {
      return NextResponse.json(
        { ok: false, message: updateDepositsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "수동매칭 완료",
      orderCount: ids.length,
      depositIds,
      depositCount: depositIds.length,
      depositTotal: selectedDepositTotal,
      expectedAmount,
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
