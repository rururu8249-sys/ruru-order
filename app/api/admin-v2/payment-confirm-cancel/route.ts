import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AnyRow = Record<string, any>;

type RequestBody = {
  orderGroupId?: string | null;
  orderLookupCode?: string | null;
  orderIds?: Array<number | string>;
  dryRun?: boolean;
};

const RESTORE_UNPAID_STATUS = "주문확인전";

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

function clean(value: unknown) {
  return String(value || "").trim();
}

function statusText(order: AnyRow) {
  return [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.admin_order_status,
    order.order_status,
  ]
    .filter(Boolean)
    .join(" ");
}

function isCanceledOrder(order: AnyRow) {
  return /주문취소|주문서취소|취소|환불/.test(statusText(order));
}

function isCardOrder(order: AnyRow) {
  return clean(order.payment_method).includes("카드");
}

function isPaymentConfirmed(order: AnyRow) {
  return (
    /자동입금확인|수동입금확인|입금확인/.test(statusText(order)) ||
    Boolean(order.deposit_confirmed_at)
  );
}

function buildDepositPatch(sample: AnyRow) {
  const patch: AnyRow = {};

  if ("match_order_group_id" in sample) patch.match_order_group_id = null;
  if ("matched_order_group_id" in sample) patch.matched_order_group_id = null;
  if ("match_order_id" in sample) patch.match_order_id = null;
  if ("matched_order_id" in sample) patch.matched_order_id = null;
  if ("match_customer_id" in sample) patch.match_customer_id = null;
  if ("matched_customer_id" in sample) patch.matched_customer_id = null;
  if ("confirmed_at" in sample) patch.confirmed_at = null;
  if ("confirmed_note" in sample) patch.confirmed_note = null;
  if ("match_note" in sample) patch.match_note = null;
  if ("match_status" in sample) patch.match_status = "미확인";

  return patch;
}

function depositLinkedToOrders(deposit: AnyRow, orders: AnyRow[]) {
  const orderGroupIds = new Set(
    orders
      .map((order) => clean(order.order_group_id))
      .filter(Boolean)
  );

  const orderLookupCodes = new Set(
    orders
      .map((order) => clean(order.order_lookup_code))
      .filter(Boolean)
  );

  const orderIds = new Set(
    orders
      .map((order) => clean(order.id))
      .filter(Boolean)
  );

  const depositMatchedGroupIds = [
    deposit.match_order_group_id,
    deposit.matched_order_group_id,
  ]
    .map(clean)
    .filter(Boolean);

  const depositMatchedOrderIds = [
    deposit.match_order_id,
    deposit.matched_order_id,
  ]
    .map(clean)
    .filter(Boolean);

  const groupMatched = depositMatchedGroupIds.some((groupId) => orderGroupIds.has(groupId));
  const lookupMatched = depositMatchedGroupIds.some((groupId) => orderLookupCodes.has(groupId));
  const orderIdMatched = depositMatchedOrderIds.some((orderId) => orderIds.has(orderId));

  return groupMatched || lookupMatched || orderIdMatched;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const orderIds = toNumberArray(body.orderIds);
    const orderGroupId = clean(body.orderGroupId);
    const orderLookupCode = clean(body.orderLookupCode);
    const dryRun = body.dryRun === true;

    if (orderIds.length === 0 && !orderGroupId && !orderLookupCode) {
      return NextResponse.json(
        { ok: false, message: "입금확인 취소할 주문 정보가 없습니다." },
        { status: 400 }
      );
    }

    let orderQuery = supabase
      .from("orders")
      .select("*")
      .neq("is_deleted", true);

    if (orderIds.length > 0) {
      orderQuery = orderQuery.in("id", orderIds);
    } else if (orderGroupId) {
      orderQuery = orderQuery.eq("order_group_id", orderGroupId);
    } else {
      orderQuery = orderQuery.eq("order_lookup_code", orderLookupCode);
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
        { ok: false, message: "입금확인 취소할 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const blockedCardOrders = orders.filter(isCardOrder);
    if (blockedCardOrders.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "카드결제 주문은 입금확인 취소가 아니라 카드미결제로 되돌리기를 사용해야 합니다.",
          blockedOrderIds: blockedCardOrders.map((order) => order.id),
        },
        { status: 400 }
      );
    }

    const targetOrders = orders.filter(isPaymentConfirmed);
    if (targetOrders.length === 0) {
      return NextResponse.json(
        { ok: false, message: "이미 입금확인 전 상태입니다." },
        { status: 400 }
      );
    }

    const plannedOrders = targetOrders.map((order) => {
      const keepCanceled = isCanceledOrder(order);

      return {
        id: order.id,
        order_lookup_code: order.order_lookup_code || null,
        order_group_id: order.order_group_id || null,
        youtube_nickname: order.youtube_nickname || null,
        product_name: order.product_name || null,
        before: {
          admin_order_status_v2: order.admin_order_status_v2 || null,
          order_manage_status: order.order_manage_status || null,
          deposit_confirmed_at: order.deposit_confirmed_at || null,
        },
        after: {
          admin_order_status_v2: keepCanceled ? order.admin_order_status_v2 || null : RESTORE_UNPAID_STATUS,
          order_manage_status: keepCanceled ? order.order_manage_status || null : RESTORE_UNPAID_STATUS,
          deposit_confirmed_at: null,
        },
        keepCanceled,
      };
    });

    const orderUpdateResults: AnyRow[] = [];

    for (const order of targetOrders) {
      const keepCanceled = isCanceledOrder(order);

      const patch: AnyRow = {
        deposit_confirmed_at: null,
      };

      if (!keepCanceled) {
        patch.admin_order_status_v2 = RESTORE_UNPAID_STATUS;
        patch.order_manage_status = RESTORE_UNPAID_STATUS;
      }

      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", order.id)
        .select("id, order_lookup_code, order_group_id, youtube_nickname, product_name, payment_method, admin_order_status_v2, order_manage_status, deposit_confirmed_at");

      if (updateError) {
        return NextResponse.json(
          { ok: false, message: updateError.message },
          { status: 500 }
        );
      }

      orderUpdateResults.push(...(updated || []));
    }

    const { data: deposits, error: depositError } = await supabase
      .from("deposits")
      .select("*")
      .limit(3000);

    if (depositError) {
      return NextResponse.json(
        {
          ok: false,
          message: "주문 입금확인은 취소됐지만 입금내역 조회에 실패했습니다.",
          detail: depositError.message,
        },
        { status: 500 }
      );
    }

    const linkedDeposits = (deposits || []).filter((deposit) => depositLinkedToOrders(deposit, targetOrders));

    const plannedDeposits = linkedDeposits.map((deposit) => ({
      id: deposit.id,
      before: {
        match_order_group_id: deposit.match_order_group_id || null,
        match_status: deposit.match_status || null,
        confirmed_at: deposit.confirmed_at || null,
        confirmed_note: deposit.confirmed_note || null,
        match_note: deposit.match_note || null,
      },
      after: {
        match_order_group_id: null,
        match_status: "미확인",
        confirmed_at: null,
        confirmed_note: null,
        match_note: null,
      },
    }));

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        mode: "payment_confirm_cancel_dry_run",
        dryRun: true,
        message: "입금확인 취소 미리보기입니다. DB는 변경하지 않았습니다.",
        restoredStatus: RESTORE_UNPAID_STATUS,
        orderCount: plannedOrders.length,
        linkedDepositCount: plannedDeposits.length,
        plannedOrders,
        plannedDeposits,
        note: "dryRun=true 요청은 orders/deposits update를 실행하지 않습니다.",
      });
    }

    let clearedDepositCount = 0;

    if (linkedDeposits.length > 0) {
      const first = linkedDeposits[0];
      const depositPatch = buildDepositPatch(first);

      if (Object.keys(depositPatch).length > 0) {
        const { data: updatedDeposits, error: clearDepositError } = await supabase
          .from("deposits")
          .update(depositPatch)
          .in(
            "id",
            linkedDeposits
              .map((deposit) => deposit.id)
              .filter((id) => id !== null && id !== undefined)
          )
          .select("id, match_order_group_id, match_status, confirmed_at");

        if (clearDepositError) {
          return NextResponse.json(
            {
              ok: false,
              message: "주문 입금확인은 취소됐지만 입금내역 매칭 해제에 실패했습니다.",
              detail: clearDepositError.message,
            },
            { status: 500 }
          );
        }

        clearedDepositCount = updatedDeposits?.length || 0;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "payment_confirm_cancel",
      message: "입금확인 취소 완료",
      restoredStatus: RESTORE_UNPAID_STATUS,
      orderCount: orderUpdateResults.length,
      clearedDepositCount,
      orders: orderUpdateResults,
      note: "주문서취소 상태 주문은 주문서취소를 유지하고 입금확인 기록만 취소했습니다.",
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
