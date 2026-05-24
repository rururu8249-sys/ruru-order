import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RequestBody = {
  orderIds?: Array<number | string>;
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

function normalizeOrderIds(value: RequestBody["orderIds"]) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

function isCanceledStatus(row: Record<string, unknown>) {
  const value = `${row.order_manage_status || ""} ${row.admin_order_status_v2 || ""}`;
  return value.includes("취소") || value.includes("환불");
}

function isAlreadyPaidStatus(row: Record<string, unknown>) {
  const value = `${row.order_manage_status || ""} ${row.admin_order_status_v2 || ""}`;

  return (
    value.includes("자동입금확인") ||
    value.includes("수동입금확인") ||
    value.includes("카드결제완료")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const orderIds = normalizeOrderIds(body.orderIds);

    if (orderIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "수동확인 처리할 주문 ID가 없습니다.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: beforeRows, error: beforeError } = await supabase
      .from("orders")
      .select(
        "id, order_lookup_code, order_group_id, youtube_nickname, product_name, payment_method, order_manage_status, admin_order_status_v2, deposit_confirmed_at, is_deleted"
      )
      .in("id", orderIds)
      .order("id", { ascending: true });

    if (beforeError) {
      return NextResponse.json(
        {
          ok: false,
          message: beforeError.message,
        },
        { status: 500 }
      );
    }

    const rows = beforeRows || [];

    if (rows.length !== orderIds.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "일부 주문을 찾지 못했습니다.",
          requested: orderIds,
          found: rows.map((row) => row.id),
        },
        { status: 400 }
      );
    }

    const deletedRows = rows.filter((row) => row.is_deleted === true);
    const canceledRows = rows.filter((row) => isCanceledStatus(row));
    const cardRows = rows.filter((row) => String(row.payment_method || "").includes("카드"));
    const alreadyPaidRows = rows.filter((row) => isAlreadyPaidStatus(row));

    if (deletedRows.length > 0 || canceledRows.length > 0 || cardRows.length > 0 || alreadyPaidRows.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "매칭없이 수동확인 처리할 수 없는 주문이 포함되어 있습니다.",
          blocked: {
            deleted: deletedRows.map((row) => row.id),
            canceled: canceledRows.map((row) => row.id),
            card: cardRows.map((row) => row.id),
            alreadyPaid: alreadyPaidRows.map((row) => row.id),
          },
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "수동입금확인",
        order_manage_status: "수동입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", orderIds)
      .select(
        "id, order_lookup_code, order_group_id, youtube_nickname, product_name, payment_method, order_manage_status, admin_order_status_v2, deposit_confirmed_at"
      )
      .order("id", { ascending: true });

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "direct_manual_confirm_orders_only",
      message: "수동입금확인 처리 완료",
      updated_count: updatedRows?.length || 0,
      deposit_confirmed_at: nowIso,
      before: rows,
      after: updatedRows || [],
      note: "입금내역 deposits는 변경하지 않았습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "매칭없이 수동확인 처리 실패",
      },
      { status: 500 }
    );
  }
}
