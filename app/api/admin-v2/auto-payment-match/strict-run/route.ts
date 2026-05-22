import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
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

function text(value: unknown) {
  return String(value ?? "").trim();
}

function compact(value: unknown) {
  return text(value).replace(/\s+/g, "");
}

function amountNumber(value: unknown) {
  const n = Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hasColumn(row: AnyRow, key: string) {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function isBankPaymentMethod(value: unknown) {
  const method = text(value || "무통장입금");

  if (!method) return true;

  const normalized = method.replace(/\s+/g, "").toLowerCase();

  return (
    normalized === "무통장입금" ||
    normalized === "무통장" ||
    normalized === "계좌이체" ||
    normalized === "계좌입금" ||
    normalized === "bank" ||
    normalized === "banktransfer" ||
    normalized.includes("무통장") ||
    normalized.includes("계좌")
  );
}

function orderStatusText(order: AnyRow) {
  return [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.payment_status,
    order.order_status,
    order.deposit_status,
    order.status,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function isPaidOrder(order: AnyRow) {
  const status = orderStatusText(order);

  return /자동입금확인|수동입금확인|입금확인|결제완료|카드결제완료|카드완료|출고대기|출고완료|배송완료|완료|paid|confirmed|complete/i.test(
    status
  );
}

function isCanceledOrder(order: AnyRow) {
  const status = orderStatusText(order);

  return /취소|환불|cancel|refund/i.test(status);
}

function orderNickname(order: AnyRow) {
  return compact(
    order.youtube_nickname ||
      order.nickname ||
      order.customer_nickname ||
      order.buyer_nickname ||
      order.order_nickname
  );
}

function orderAmount(order: AnyRow) {
  return (
    amountNumber(order.final_amount) ||
    amountNumber(order.adjusted_total_price) ||
    amountNumber(order.total_price) ||
    amountNumber(order.total_amount) ||
    amountNumber(order.order_amount) ||
    amountNumber(order.payment_amount) ||
    amountNumber(order.amount)
  );
}

function depositName(deposit: AnyRow) {
  return compact(
    deposit.depositor_name ||
      deposit.deposit_name ||
      deposit.sender_name ||
      deposit.bkjukyo ||
      deposit.name
  );
}

function depositAmount(deposit: AnyRow) {
  return amountNumber(
    deposit.amount ||
      deposit.deposit_amount ||
      deposit.input_amount ||
      deposit.bkinput
  );
}

function depositStatusText(deposit: AnyRow) {
  return [deposit.match_status, deposit.status, deposit.deposit_status, deposit.payment_status]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function isUnmatchedDeposit(deposit: AnyRow) {
  const status = depositStatusText(deposit);

  if (
    deposit.confirmed_at ||
    deposit.match_order_group_id ||
    deposit.matched_order_id ||
    deposit.matched_group_id ||
    deposit.match_customer_id
  ) {
    return false;
  }

  if (!status) return true;

  return /미확인|미매칭|대기|확인필요|unmatched|pending/i.test(status);
}

function buildOrderPatch(order: AnyRow, deposit: AnyRow) {
  const now = new Date().toISOString();
  const patch: AnyRow = {};

  if (hasColumn(order, "admin_order_status_v2")) patch.admin_order_status_v2 = "결제완료(무통장)";
  if (hasColumn(order, "order_manage_status")) patch.order_manage_status = "결제완료(무통장)";
  if (hasColumn(order, "payment_status")) patch.payment_status = "결제완료(무통장)";
  if (hasColumn(order, "deposit_status")) patch.deposit_status = "자동입금확인";
  if (hasColumn(order, "payment_confirm_status")) patch.payment_confirm_status = "자동입금확인";
  if (hasColumn(order, "payment_confirm_type")) patch.payment_confirm_type = "자동입금확인";
  if (hasColumn(order, "payment_method") && !text(order.payment_method)) patch.payment_method = "무통장입금";
  if (hasColumn(order, "paid_amount")) patch.paid_amount = orderAmount(order);
  if (hasColumn(order, "is_paid")) patch.is_paid = true;
  if (hasColumn(order, "paid_at")) patch.paid_at = now;
  if (hasColumn(order, "payment_confirmed_at")) patch.payment_confirmed_at = now;
  if (hasColumn(order, "confirmed_at")) patch.confirmed_at = now;
  if (hasColumn(order, "matched_deposit_id")) patch.matched_deposit_id = deposit.id;
  if (hasColumn(order, "deposit_id")) patch.deposit_id = deposit.id;
  if (hasColumn(order, "updated_at")) patch.updated_at = now;

  return patch;
}

function buildDepositPatch(deposit: AnyRow, order: AnyRow) {
  const now = new Date().toISOString();
  const patch: AnyRow = {};
  const groupId = order.group_id || order.order_group_id || order.id;

  if (hasColumn(deposit, "match_status")) patch.match_status = "자동입금확인";
  if (hasColumn(deposit, "status")) patch.status = "자동입금확인";
  if (hasColumn(deposit, "deposit_status")) patch.deposit_status = "자동입금확인";
  if (hasColumn(deposit, "confirmed_at")) patch.confirmed_at = now;
  if (hasColumn(deposit, "matched_at")) patch.matched_at = now;
  if (hasColumn(deposit, "match_order_group_id")) patch.match_order_group_id = groupId;
  if (hasColumn(deposit, "matched_group_id")) patch.matched_group_id = groupId;
  if (hasColumn(deposit, "matched_order_id")) patch.matched_order_id = order.id;
  if (hasColumn(deposit, "order_id")) patch.order_id = order.id;
  if (hasColumn(deposit, "match_note")) patch.match_note = "자동입금확인: 닉네임+금액 완전일치+1:1";
  if (hasColumn(deposit, "confirmed_note")) patch.confirmed_note = "자동입금확인";
  if (hasColumn(deposit, "updated_at")) patch.updated_at = now;

  return patch;
}

function makeKey(name: string, amount: number) {
  return `${name}__${amount}`;
}

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    const supabase = getSupabase();

    const [ordersResult, depositsResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);

    if (ordersResult.error) {
      return NextResponse.json(
        { ok: false, message: ordersResult.error.message },
        { status: 500 }
      );
    }

    if (depositsResult.error) {
      return NextResponse.json(
        { ok: false, message: depositsResult.error.message },
        { status: 500 }
      );
    }

    const orders = ordersResult.data || [];
    const deposits = depositsResult.data || [];

    const eligibleOrders = orders.filter((order) => {
      const nickname = orderNickname(order);
      const amount = orderAmount(order);

      return (
        Boolean(order.id) &&
        Boolean(nickname) &&
        amount > 0 &&
        !isPaidOrder(order) &&
        !isCanceledOrder(order) &&
        isBankPaymentMethod(order.payment_method)
      );
    });

    const eligibleDeposits = deposits.filter((deposit) => {
      const name = depositName(deposit);
      const amount = depositAmount(deposit);

      return Boolean(deposit.id) && Boolean(name) && amount > 0 && isUnmatchedDeposit(deposit);
    });

    const ordersByKey = new Map<string, AnyRow[]>();
    const depositsByKey = new Map<string, AnyRow[]>();

    for (const order of eligibleOrders) {
      const key = makeKey(orderNickname(order), orderAmount(order));
      ordersByKey.set(key, [...(ordersByKey.get(key) || []), order]);
    }

    for (const deposit of eligibleDeposits) {
      const key = makeKey(depositName(deposit), depositAmount(deposit));
      depositsByKey.set(key, [...(depositsByKey.get(key) || []), deposit]);
    }

    const candidates: Array<{ key: string; order: AnyRow; deposit: AnyRow }> = [];

    for (const [key, orderRows] of ordersByKey.entries()) {
      const depositRows = depositsByKey.get(key) || [];

      if (orderRows.length === 1 && depositRows.length === 1) {
        candidates.push({
          key,
          order: orderRows[0],
          deposit: depositRows[0],
        });
      }
    }

    const matched: AnyRow[] = [];
    const failed: AnyRow[] = [];

    for (const candidate of candidates) {
      const { order, deposit, key } = candidate;

      const orderPatch = buildOrderPatch(order, deposit);
      const depositPatch = buildDepositPatch(deposit, order);

      if (Object.keys(orderPatch).length === 0) {
        failed.push({ key, order_id: order.id, deposit_id: deposit.id, reason: "주문 업데이트 컬럼 없음" });
        continue;
      }

      if (Object.keys(depositPatch).length === 0) {
        failed.push({ key, order_id: order.id, deposit_id: deposit.id, reason: "입금 업데이트 컬럼 없음" });
        continue;
      }

      const orderUpdate = await supabase
        .from("orders")
        .update(orderPatch)
        .eq("id", order.id)
        .select("*")
        .maybeSingle();

      if (orderUpdate.error) {
        failed.push({
          key,
          order_id: order.id,
          deposit_id: deposit.id,
          reason: orderUpdate.error.message,
        });
        continue;
      }

      const depositUpdate = await supabase
        .from("deposits")
        .update(depositPatch)
        .eq("id", deposit.id)
        .select("*")
        .maybeSingle();

      if (depositUpdate.error) {
        failed.push({
          key,
          order_id: order.id,
          deposit_id: deposit.id,
          reason: depositUpdate.error.message,
        });
        continue;
      }

      matched.push({
        key,
        nickname: orderNickname(order),
        amount: orderAmount(order),
        order_id: order.id,
        order_code: order.order_lookup_code,
        deposit_id: deposit.id,
        depositor_name: deposit.depositor_name,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `엄격 자동입금확인 ${matched.length}건 처리`,
      matched_count: matched.length,
      candidate_count: candidates.length,
      failed_count: failed.length,
      summary: {
        eligible_orders: eligibleOrders.length,
        eligible_deposits: eligibleDeposits.length,
        strict_candidates: candidates.length,
        matched_count: matched.length,
        failed_count: failed.length,
      },
      matched,
      failed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "strict 자동입금확인 실패",
      },
      { status: 500 }
    );
  }
}
