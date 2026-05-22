import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

type OrderGroupCandidate = {
  orderGroupId: string;
  orderIds: number[];
  firstOrder: AnyRow;
  nickname: string;
  amount: number;
};

type MatchCandidate = {
  order_group_id: string;
  order_ids: number[];
  order_nickname: string;
  order_amount: number;
  deposit_id: number;
  deposit_depositor: string;
  deposit_amount: number;
  reason: string;
};

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

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/원/g, "")
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function orderAmount(order: AnyRow) {
  return num(
    order.final_amount ??
      order.adjusted_total_price ??
      order.total_price ??
      order.payment_amount ??
      order.deposit_amount ??
      order.order_amount ??
      order.amount
  );
}

function orderGroupId(order: AnyRow) {
  return text(order.order_group_id || order.group_id || order.id);
}

function orderNickname(order: AnyRow) {
  // 자동매칭은 유튜브 닉네임 완전일치만 허용합니다.
  // 고객명 유사매칭은 자동처리 금지.
  return text(order.youtube_nickname || order.nickname || order.customer_nickname);
}

function orderStatusText(order: AnyRow) {
  return [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.deposit_status,
    order.payment_status,
    order.order_status,
    order.status,
  ]
    .map(text)
    .filter(Boolean)
    .join(" / ");
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

function isEligibleOrder(order: AnyRow) {
  const nickname = orderNickname(order);
  const amount = orderAmount(order);
  const status = orderStatusText(order);
  const method = text(order.payment_method || "무통장입금");

  if (!order.id) return { ok: false, reason: "주문 ID 없음" };
  if (!orderGroupId(order)) return { ok: false, reason: "주문 그룹 ID 없음" };
  if (!nickname) return { ok: false, reason: "유튜브 닉네임 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금예정금액 없음" };

  if (!isBankPaymentMethod(method)) {
    return { ok: false, reason: `무통장 주문 아님: ${method}` };
  }

  if (
    hasAny(status, [
      "입금확인",
      "자동입금확인",
      "수동입금확인",
      "카드결제완료",
      "카드완료",
      "결제완료",
      "취소",
      "환불",
    ])
  ) {
    return { ok: false, reason: `이미 처리된 주문 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

function depositId(deposit: AnyRow) {
  return num(deposit.id || deposit.deposit_id || deposit.bankda_id || deposit.transaction_id);
}

function depositName(deposit: AnyRow) {
  return text(deposit.depositor_name || deposit.deposit_name || deposit.sender_name || deposit.bkjukyo);
}

function depositAmount(deposit: AnyRow) {
  return num(deposit.amount || deposit.deposit_amount || deposit.input_amount || deposit.bkinput);
}

function depositStatusText(deposit: AnyRow) {
  return [deposit.match_status, deposit.status, deposit.payment_status]
    .map(text)
    .filter(Boolean)
    .join(" / ");
}

function isEligibleDeposit(deposit: AnyRow) {
  const id = depositId(deposit);
  const name = depositName(deposit);
  const amount = depositAmount(deposit);
  const status = depositStatusText(deposit);

  if (!id) return { ok: false, reason: "입금내역 ID 없음" };
  if (!name) return { ok: false, reason: "입금자명 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금금액 없음" };

  if (deposit.confirmed_at) {
    return { ok: false, reason: "이미 confirmed_at 있음" };
  }

  if (deposit.match_order_group_id || deposit.match_customer_id) {
    return { ok: false, reason: "이미 주문과 연결된 입금내역" };
  }

  if (
    status &&
    !hasAny(status, ["미확인", "미매칭", "대기", "확인필요"])
  ) {
    return { ok: false, reason: `이미 처리된 입금 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

function makeKey(name: string, amount: number) {
  // 완전일치 기준: 앞뒤 공백만 제거한 값 그대로 사용
  return `${name}__${amount}`;
}

function buildOrderGroups(orders: AnyRow[]) {
  const map = new Map<string, AnyRow[]>();

  for (const order of orders) {
    const check = isEligibleOrder(order);
    if (!check.ok) continue;

    const groupId = orderGroupId(order);
    map.set(groupId, [...(map.get(groupId) || []), order]);
  }

  const groups: OrderGroupCandidate[] = [];

  for (const [groupId, groupOrders] of map.entries()) {
    const firstOrder = groupOrders[0];
    const nickname = orderNickname(firstOrder);
    const amount = groupOrders.reduce((sum, order) => sum + orderAmount(order), 0);
    const orderIds = groupOrders.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0);

    if (!nickname || !amount || orderIds.length === 0) continue;

    groups.push({
      orderGroupId: groupId,
      orderIds,
      firstOrder,
      nickname,
      amount,
    });
  }

  return groups;
}

function buildCandidates(orders: AnyRow[], deposits: AnyRow[]) {
  const eligibleOrderGroups = buildOrderGroups(orders);
  const eligibleDeposits = deposits.filter((deposit) => isEligibleDeposit(deposit).ok);

  const ordersByKey = new Map<string, OrderGroupCandidate[]>();
  const depositsByKey = new Map<string, AnyRow[]>();

  for (const group of eligibleOrderGroups) {
    const key = makeKey(group.nickname, group.amount);
    ordersByKey.set(key, [...(ordersByKey.get(key) || []), group]);
  }

  for (const deposit of eligibleDeposits) {
    const key = makeKey(depositName(deposit), depositAmount(deposit));
    depositsByKey.set(key, [...(depositsByKey.get(key) || []), deposit]);
  }

  const candidates: MatchCandidate[] = [];
  const blocked: Array<{ key: string; reason: string; orderCount: number; depositCount: number }> = [];

  for (const [key, keyOrders] of ordersByKey.entries()) {
    const keyDeposits = depositsByKey.get(key) || [];

    if (keyOrders.length === 1 && keyDeposits.length === 1) {
      const group = keyOrders[0];
      const deposit = keyDeposits[0];

      candidates.push({
        order_group_id: group.orderGroupId,
        order_ids: group.orderIds,
        order_nickname: group.nickname,
        order_amount: group.amount,
        deposit_id: depositId(deposit),
        deposit_depositor: depositName(deposit),
        deposit_amount: depositAmount(deposit),
        reason: "닉네임 완전일치 + 주문그룹 합계금액 완전일치 + 주문그룹 1건/입금 1건",
      });
    } else if (keyDeposits.length > 0) {
      blocked.push({
        key,
        reason: "1:1 단일 후보가 아니라 자동처리 제외",
        orderCount: keyOrders.length,
        depositCount: keyDeposits.length,
      });
    }
  }

  return {
    candidates,
    blocked,
    eligibleOrderGroupCount: eligibleOrderGroups.length,
    eligibleDepositCount: eligibleDeposits.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const confirm = body?.confirm === "RUN_AUTO_MATCH";
    const nowIso = new Date().toISOString();

    const [ordersResult, depositsResult] = await Promise.all([
      supabase.from("orders").select("*").neq("is_deleted", true).limit(2000),
      supabase.from("deposits").select("*").limit(2000),
    ]);

    if (ordersResult.error) {
      return NextResponse.json(
        { ok: false, message: "orders 조회 실패", error: ordersResult.error.message },
        { status: 500 }
      );
    }

    if (depositsResult.error) {
      return NextResponse.json(
        { ok: false, message: "deposits 조회 실패", error: depositsResult.error.message },
        { status: 500 }
      );
    }

    const orders = ordersResult.data || [];
    const deposits = depositsResult.data || [];

    const preview = buildCandidates(orders, deposits);

    if (!confirm) {
      return NextResponse.json({
        ok: true,
        mode: "dry_run_no_db_write",
        needsConfirm: true,
        message: "자동매칭 실행 전 미리보기입니다. DB를 수정하지 않았습니다.",
        confirmGuide: "실제 실행하려면 POST body에 {\"confirm\":\"RUN_AUTO_MATCH\"}가 필요합니다.",
        summary: {
          checked_orders: orders.length,
          checked_deposits: deposits.length,
          eligible_order_groups: preview.eligibleOrderGroupCount,
          eligible_deposits: preview.eligibleDepositCount,
          auto_match_candidates: preview.candidates.length,
          blocked_count: preview.blocked.length,
        },
        candidates: preview.candidates,
        blocked: preview.blocked,
      });
    }

    const results: any[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const candidate of preview.candidates) {
      const orderUpdate = await supabase
        .from("orders")
        .update({
          admin_order_status_v2: "자동입금확인",
          order_manage_status: "자동입금확인",
          deposit_confirmed_at: nowIso,
        })
        .in("id", candidate.order_ids);

      if (orderUpdate.error) {
        failedCount += 1;
        results.push({
          ok: false,
          candidate,
          step: "orders_update",
          error: orderUpdate.error.message,
        });
        continue;
      }

      const depositUpdate = await supabase
        .from("deposits")
        .update({
          match_order_group_id: candidate.order_group_id,
          match_customer_id: candidate.order_ids[0] || null,
          match_status: "자동입금확인",
          confirmed_at: nowIso,
          confirmed_note: "자동매칭: 닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보",
        })
        .eq("id", candidate.deposit_id);

      if (depositUpdate.error) {
        failedCount += 1;
        results.push({
          ok: false,
          candidate,
          step: "deposits_update",
          error: depositUpdate.error.message,
        });
        continue;
      }

      successCount += 1;
      results.push({
        ok: true,
        candidate,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "executed_db_write",
      message: "자동매칭 실행 완료",
      summary: {
        checked_orders: orders.length,
        checked_deposits: deposits.length,
        candidates: preview.candidates.length,
        success_count: successCount,
        failed_count: failedCount,
        blocked_count: preview.blocked.length,
      },
      results,
      blocked: preview.blocked,
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
