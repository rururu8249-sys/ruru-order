import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPaymentMatchExcludedOrder } from "@/lib/admin-v2/paymentMatchTestOrderGuard";

type RequestBody = {
  orderGroupId?: string;
  orderIds?: Array<number | string>;
  expectedAmount?: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin env가 없습니다.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

function rowAmount(order: Record<string, unknown>) {
  return Number(
    order.final_amount ??
      order.adjusted_total_price ??
      order.total_price ??
      0
  );
}

function isCanceledStatus(order: Record<string, unknown>) {
  const value = [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.admin_order_status,
    order.order_status,
  ]
    .filter(Boolean)
    .join(" ");

  return /취소|환불|삭제/.test(value);
}

function isAlreadyPaidStatus(order: Record<string, unknown>) {
  const value = [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.admin_order_status,
    order.order_status,
  ]
    .filter(Boolean)
    .join(" ");

  return /자동입금확인|수동입금확인|카드결제완료|결제완료|입금확인/.test(value);
}

function isCardOrder(order: Record<string, unknown>) {
  return String(order.payment_method || "").includes("카드");
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const orderGroupId = String(body.orderGroupId || "").trim();
    const orderIds = toNumberArray(body.orderIds);
    const clientExpectedAmount = Number(body.expectedAmount || 0);

    if (!orderGroupId && orderIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "수동확인할 주문 정보가 없습니다." },
        { status: 400 }
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
        { ok: false, message: "수동확인할 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const blockedTestOrderIds = orders
      .filter(isPaymentMatchExcludedOrder)
      .map((order) => order.id)
      .filter(Boolean);

    if (blockedTestOrderIds.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "테스트 주문은 입금확인 처리 대상에서 제외됩니다.",
          blocked: { testOrders: blockedTestOrderIds },
        },
        { status: 409 }
      );
    }

    const blocked = {
      canceled: orders.filter(isCanceledStatus).map((order) => order.id),
      alreadyPaid: orders.filter(isAlreadyPaidStatus).map((order) => order.id),
      card: orders.filter(isCardOrder).map((order) => order.id),
    };

    if (blocked.canceled.length > 0 || blocked.alreadyPaid.length > 0 || blocked.card.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "입금내역 없이 수동확인 처리할 수 없는 주문이 포함되어 있습니다.",
          blocked,
        },
        { status: 400 }
      );
    }

    const ids = orders.map((order) => Number(order.id)).filter((id) => Number.isFinite(id) && id > 0);
    const serverExpectedAmount = orders.reduce((sum, order) => sum + rowAmount(order), 0);

    if (clientExpectedAmount > 0 && serverExpectedAmount > 0 && clientExpectedAmount !== serverExpectedAmount) {
      return NextResponse.json(
        {
          ok: false,
          message: `주문금액 검증 실패: 화면금액 ${clientExpectedAmount.toLocaleString()}원 / 서버금액 ${serverExpectedAmount.toLocaleString()}원`,
        },
        { status: 400 }
      );
    }

    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, message: "수동확인할 주문 ID가 없습니다." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedOrders, error: updateError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "수동입금확인",
        order_manage_status: "수동입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", ids)
      .select("id, order_lookup_code, order_group_id, youtube_nickname, product_name, payment_method, admin_order_status_v2, order_manage_status, deposit_confirmed_at");

    if (updateError) {
      return NextResponse.json(
        { ok: false, message: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "manual_payment_confirm_without_deposit",
      message: "입금내역 없이 수동입금확인 완료",
      orderCount: updatedOrders?.length || 0,
      expectedAmount: serverExpectedAmount || clientExpectedAmount || 0,
      deposit_confirmed_at: nowIso,
      orders: updatedOrders || [],
      note: "deposits 입금내역은 변경하지 않았습니다.",
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
