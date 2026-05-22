import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function text(value: any) {
  return String(value ?? "").trim();
}

function money(value: any) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/원/g, "")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function first(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function orderId(order: AnyRow) {
  return text(first(order, ["id", "order_id", "order_no", "order_number", "order_group_id"]));
}

function orderGroupId(order: AnyRow) {
  return text(first(order, ["order_group_id", "group_id", "id", "order_id"]));
}

function orderName(order: AnyRow) {
  return text(first(order, [
    "youtube_nickname",
    "nickname",
    "customer_nickname",
    "buyer_nickname",
    "order_nickname",
    "depositor_name",
    "deposit_name",
    "name",
  ]));
}

function orderAmount(order: AnyRow) {
  return money(first(order, [
    "final_amount",
    "total_amount",
    "payment_amount",
    "deposit_amount",
    "order_amount",
    "amount",
    "total_price",
  ]));
}

function orderStatus(order: AnyRow) {
  return [
    first(order, ["admin_order_status_v2"]),
    first(order, ["order_manage_status"]),
    first(order, ["deposit_status"]),
    first(order, ["payment_status"]),
    first(order, ["order_status"]),
    first(order, ["status"]),
  ].map(text).filter(Boolean).join(" / ");
}

function paymentMethod(order: AnyRow) {
  return [
    first(order, ["payment_method"]),
    first(order, ["payment_type"]),
    first(order, ["pay_method"]),
    first(order, ["pay_type"]),
  ].map(text).filter(Boolean).join(" / ");
}

function depositId(deposit: AnyRow) {
  return text(first(deposit, ["id", "deposit_id", "bankda_id", "transaction_id", "bkseq", "bkid"]));
}

function depositName(deposit: AnyRow) {
  return text(first(deposit, [
    "depositor_name",
    "deposit_name",
    "sender_name",
    "bkjukyo",
    "name",
    "payer_name",
  ]));
}

function depositAmount(deposit: AnyRow) {
  return money(first(deposit, [
    "amount",
    "deposit_amount",
    "input_amount",
    "bkinput",
    "price",
    "money",
  ]));
}

function depositStatus(deposit: AnyRow) {
  return [
    first(deposit, ["match_status"]),
    first(deposit, ["status"]),
    first(deposit, ["payment_status"]),
  ].map(text).filter(Boolean).join(" / ");
}

function depositTime(deposit: AnyRow) {
  const d = text(first(deposit, ["deposited_date", "deposit_date", "bkdate", "date", "created_at"]));
  const t = text(first(deposit, ["deposited_time", "deposit_time", "bktime", "time"]));
  return [d, t].filter(Boolean).join(" ");
}

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function key(name: string, amount: number) {
  return `${name}__${amount}`;
}

type PreviewOrderGroup = {
  order_group_id: string;
  order_ids: string[];
  first_order: AnyRow;
  nickname: string;
  amount: number;
};

function buildPreviewOrderGroups(orders: AnyRow[]) {
  const map = new Map<string, AnyRow[]>();

  for (const order of orders) {
    const groupId = orderGroupId(order);
    if (!groupId) continue;
    map.set(groupId, [...(map.get(groupId) ?? []), order]);
  }

  const groups: PreviewOrderGroup[] = [];

  for (const [groupId, groupOrders] of map.entries()) {
    const firstOrder = groupOrders[0];
    const nickname = orderName(firstOrder);
    const amount = groupOrders.reduce((sum, order) => sum + orderAmount(order), 0);
    const orderIds = groupOrders.map((order) => orderId(order)).filter(Boolean);

    if (!nickname || !amount || amount <= 0 || orderIds.length === 0) continue;

    groups.push({
      order_group_id: groupId,
      order_ids: orderIds,
      first_order: firstOrder,
      nickname,
      amount,
    });
  }

  return groups;
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

function checkOrder(order: AnyRow) {
  const id = orderId(order);
  const name = orderName(order);
  const amount = orderAmount(order);
  const status = orderStatus(order);
  const method = paymentMethod(order);

  if (!id) return { ok: false, reason: "주문 ID 확인 불가" };
  if (!name) return { ok: false, reason: "주문 닉네임 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "주문 입금예정금액 확인 불가" };

  if (hasAny(status, [
    "입금확인",
    "자동입금확인",
    "수동입금확인",
    "카드결제완료",
    "카드완료",
    "결제완료",
    "취소",
    "환불",
  ])) {
    return { ok: false, reason: `이미 처리된 주문 상태: ${status || "상태값 없음"}` };
  }

  if (method && !hasAny(method, ["무통장", "계좌", "입금", "현금"])) {
    return { ok: false, reason: `무통장입금 주문이 아님: ${method}` };
  }

  return { ok: true, reason: "" };
}

function checkDeposit(deposit: AnyRow) {
  const id = depositId(deposit);
  const name = depositName(deposit);
  const amount = depositAmount(deposit);
  const status = depositStatus(deposit);

  const matchedOrderGroupId = text(first(deposit, ["match_order_group_id", "matched_order_group_id"]));
  const matchedCustomerId = text(first(deposit, ["match_customer_id", "matched_customer_id"]));

  if (!id) return { ok: false, reason: "입금내역 ID 확인 불가" };
  if (!name) return { ok: false, reason: "입금자명 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금금액 확인 불가" };
  if (matchedOrderGroupId || matchedCustomerId) return { ok: false, reason: "이미 주문과 연결된 입금내역" };

  if (status && !hasAny(status, ["미확인", "대기", "확인필요", "미매칭"])) {
    return { ok: false, reason: `이미 처리된 입금 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase 서버 환경변수가 없습니다.",
        missing: {
          NEXT_PUBLIC_SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
        },
      },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const [ordersResult, depositsResult] = await Promise.all([
    supabase.from("orders").select("*").limit(1000),
    supabase.from("deposits").select("*").limit(1000),
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

  const orders = ordersResult.data ?? [];
  const deposits = depositsResult.data ?? [];

  const eligibleOrders: AnyRow[] = [];
  const eligibleDeposits: AnyRow[] = [];
  const excluded: any[] = [];

  for (const order of orders) {
    const checked = checkOrder(order);
    if (checked.ok) {
      eligibleOrders.push(order);
    } else {
      excluded.push({
        type: "order",
        id: orderId(order),
        name: orderName(order),
        amount: orderAmount(order),
        reason: checked.reason,
      });
    }
  }

  for (const deposit of deposits) {
    const checked = checkDeposit(deposit);
    if (checked.ok) {
      eligibleDeposits.push(deposit);
    } else {
      excluded.push({
        type: "deposit",
        id: depositId(deposit),
        name: depositName(deposit),
        amount: depositAmount(deposit),
        reason: checked.reason,
      });
    }
  }

  const eligibleOrderGroups = buildPreviewOrderGroups(eligibleOrders);

  const ordersByKey = new Map<string, PreviewOrderGroup[]>();
  const depositsByKey = new Map<string, AnyRow[]>();

  for (const group of eligibleOrderGroups) {
    const k = key(group.nickname, group.amount);
    ordersByKey.set(k, [...(ordersByKey.get(k) ?? []), group]);
  }

  for (const deposit of eligibleDeposits) {
    const k = key(depositName(deposit), depositAmount(deposit));
    depositsByKey.set(k, [...(depositsByKey.get(k) ?? []), deposit]);
  }

  const candidates: any[] = [];
  const ambiguous: any[] = [];

  for (const [k, keyGroups] of ordersByKey.entries()) {
    const keyDeposits = depositsByKey.get(k) ?? [];

    for (const group of keyGroups) {
      if (keyDeposits.length === 0) {
        ambiguous.push({
          type: "order_group",
          id: group.order_group_id,
          order_ids: group.order_ids,
          name: group.nickname,
          amount: group.amount,
          reason: "닉네임+주문그룹합계금액이 완전일치하는 미확인 입금내역 없음",
        });
        continue;
      }

      if (keyGroups.length !== 1 || keyDeposits.length !== 1) {
        ambiguous.push({
          type: "order_group",
          id: group.order_group_id,
          order_ids: group.order_ids,
          name: group.nickname,
          amount: group.amount,
          reason: `1:1 단일 후보 아님 - 주문그룹 ${keyGroups.length}건 / 입금 ${keyDeposits.length}건`,
        });
        continue;
      }

      const deposit = keyDeposits[0];

      candidates.push({
        order_id: group.order_ids[0],
        order_ids: group.order_ids,
        order_group_id: group.order_group_id,
        order_nickname: group.nickname,
        order_amount: group.amount,
        order_status_text: orderStatus(group.first_order),
        deposit_id: depositId(deposit),
        deposit_depositor: depositName(deposit),
        deposit_amount: depositAmount(deposit),
        deposit_time_text: depositTime(deposit),
        reason: "닉네임 완전일치 + 주문그룹 합계금액 완전일치 + 주문그룹 1건/입금 1건",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "preview_only_no_db_write",
    message: "자동매칭 미리보기입니다. 이 API는 orders/deposits 데이터를 수정하지 않습니다.",
    rule: "닉네임 완전일치 + 주문그룹 합계금액 완전일치 + 주문그룹 1건/입금 1건 단일 후보만 자동매칭 후보",
    summary: {
      checked_orders: orders.length,
      checked_deposits: deposits.length,
      eligible_unpaid_orders: eligibleOrderGroups.length,
      eligible_unmatched_deposits: eligibleDeposits.length,
      auto_match_preview_count: candidates.length,
      ambiguous_count: ambiguous.length,
      excluded_count: excluded.length,
    },
    candidates,
    ambiguous,
    excluded,
  });
}
