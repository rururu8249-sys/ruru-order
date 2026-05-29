import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

import {
  assertValidCustomerPointPhone,
  buildCustomerPointBalancePayload,
  buildCustomerPointChange,
  buildCustomerPointLedgerPayload,
  readCurrentCustomerPoints,
  type CustomerPointBalanceRow,
} from "@/lib/customerPoints";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

type OrderSubmitPayload = {
  orderRows?: AnyRow[];
  point_use_amount?: number;
  pointUseAmount?: number;
  customer_phone?: string;
  customerPhone?: string;
  youtube_nickname?: string;
  youtubeNickname?: string;
  customer_name?: string;
  customerName?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabaseOrderSubmitClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toWon(value: unknown): number {
  const amount = Math.floor(Number(value || 0));

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}

function readRowOriginalAmount(row: AnyRow): number {
  return toWon(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);
}

function clampPointUse(input: {
  currentPoints: number;
  requestedPoints: number;
  payableAmount: number;
}) {
  const currentPoints = toWon(input.currentPoints);
  const requestedPoints = toWon(input.requestedPoints);
  const payableAmount = toWon(input.payableAmount);

  if (currentPoints < 1000) return 0;
  if (requestedPoints <= 0) return 0;
  if (payableAmount <= 0) return 0;

  return Math.min(currentPoints, requestedPoints, payableAmount);
}

function distributePointUse(orderRows: AnyRow[], pointUsedAmount: number) {
  let remaining = toWon(pointUsedAmount);

  return orderRows.map((row) => {
    const pointOriginalAmount = readRowOriginalAmount(row);
    const rowPointUsedAmount = Math.min(pointOriginalAmount, remaining);
    remaining -= rowPointUsedAmount;

    const finalAmount = Math.max(0, pointOriginalAmount - rowPointUsedAmount);

    return {
      ...row,
      point_original_amount: pointOriginalAmount,
      point_used_amount: rowPointUsedAmount,
      final_amount: finalAmount,
    };
  });
}

async function fetchPointBalance(supabase: ReturnType<typeof getSupabaseOrderSubmitClient>, phone: string) {
  const { data, error } = await supabase
    .from("customer_point_balances")
    .select("*")
    .eq("customer_phone", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "포인트 잔액 조회 실패");
  }

  return (data || null) as CustomerPointBalanceRow | null;
}

export async function POST(request: NextRequest) {
  let insertedOrderIds: string[] = [];
  let ledgerIdForRollback = "";

  try {
    const body = (await request.json().catch(() => null)) as OrderSubmitPayload | null;

    if (!body || typeof body !== "object") {
      return jsonError("주문 요청 내용이 올바르지 않습니다.");
    }

    const orderRows = Array.isArray(body.orderRows) ? body.orderRows : [];

    if (orderRows.length === 0) {
      return jsonError("주문 상품이 없습니다.");
    }

    const phone = assertValidCustomerPointPhone(body.customer_phone || body.customerPhone || orderRows[0]?.customer_phone || orderRows[0]?.phone);
    const youtubeNickname = body.youtube_nickname || body.youtubeNickname || orderRows[0]?.youtube_nickname || "";
    const customerName = body.customer_name || body.customerName || orderRows[0]?.customer_name || "";
    const requestedPointUse = toWon(body.point_use_amount ?? body.pointUseAmount ?? 0);

    const supabase = getSupabaseOrderSubmitClient();

    const previousBalance = await fetchPointBalance(supabase, phone);
    const currentPoints = readCurrentCustomerPoints(previousBalance);
    const payableBeforePoints = orderRows.reduce((sum, row) => sum + readRowOriginalAmount(row), 0);
    const pointUsedAmount = clampPointUse({
      currentPoints,
      requestedPoints: requestedPointUse,
      payableAmount: payableBeforePoints,
    });

    const rowsForInsert = distributePointUse(orderRows, pointUsedAmount).map((row) => ({
      ...row,
      customer_phone: phone,
      phone: phone,
      point_balance_before: pointUsedAmount > 0 ? currentPoints : null,
      point_balance_after: pointUsedAmount > 0 ? currentPoints - pointUsedAmount : null,
      point_used_at: pointUsedAmount > 0 ? new Date().toISOString() : null,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from("orders")
      .insert(rowsForInsert)
      .select("id, order_group_id, final_amount, point_used_amount");

    if (insertError) {
      throw new Error(insertError.message || "주문 저장 실패");
    }

    insertedOrderIds = Array.isArray(insertedRows)
      ? insertedRows.map((row) => String(row.id || "")).filter(Boolean)
      : [];

    if (pointUsedAmount > 0) {
      const change = buildCustomerPointChange({
        action: "deduct",
        amount: pointUsedAmount,
        currentPoints,
      });

      ledgerIdForRollback = randomUUID();

      const ledgerPayload = {
        ...buildCustomerPointLedgerPayload({
          id: ledgerIdForRollback,
          phone,
          youtubeNickname,
          customerName,
          change,
          reason: "주문서 포인트 사용",
          adminMemo: "고객 주문서 포인트 사용 자동 차감",
          customerVisible: true,
          createdBy: "customer-order",
        }),
        related_order_id: insertedOrderIds[0] || null,
      };

      const balancePayload = {
        ...buildCustomerPointBalancePayload({
          phone,
          youtubeNickname,
          customerName,
          previousBalance,
          change,
          adminMemo: "고객 주문서 포인트 사용 자동 차감",
        }),
        total_used_points: Math.max(0, Number(previousBalance?.total_used_points ?? 0)) + pointUsedAmount,
        last_used_at: new Date().toISOString(),
      };

      const { error: ledgerError } = await supabase.from("customer_point_ledger").insert(ledgerPayload);

      if (ledgerError) {
        throw new Error(ledgerError.message || "포인트 사용 이력 저장 실패");
      }

      const { error: balanceError } = await supabase
        .from("customer_point_balances")
        .upsert(balancePayload, { onConflict: "customer_phone" });

      if (balanceError) {
        await supabase.from("customer_point_ledger").delete().eq("id", ledgerIdForRollback);
        throw new Error(balanceError.message || "포인트 잔액 저장 실패");
      }

      const { error: orderPointLinkError } = await supabase
        .from("orders")
        .update({ point_ledger_id: ledgerIdForRollback })
        .in("id", insertedOrderIds);

      if (orderPointLinkError) {
        await supabase.from("customer_point_ledger").delete().eq("id", ledgerIdForRollback);
        throw new Error(orderPointLinkError.message || "주문 포인트 이력 연결 실패");
      }
    }

    return NextResponse.json({
      ok: true,
      inserted_count: insertedOrderIds.length,
      order_ids: insertedOrderIds,
      point_original_amount: payableBeforePoints,
      point_used_amount: pointUsedAmount,
      point_balance_before: pointUsedAmount > 0 ? currentPoints : null,
      point_balance_after: pointUsedAmount > 0 ? currentPoints - pointUsedAmount : null,
      point_ledger_id: pointUsedAmount > 0 ? ledgerIdForRollback : null,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "주문 저장 실패", 400);
  }
}
