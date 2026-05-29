// lib/admin-v2/autoPaymentMatch.ts
// 목적: 뱅크다 입금내역과 미입금 주문을 보수적으로 자동매칭
// 조건: 입금자명=유튜브닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보만 처리

import { filterPaymentMatchEligibleOrders } from "@/lib/admin-v2/paymentMatchTestOrderGuard";

type AnyRow = Record<string, any>;

const PAID_STATUSES = ["입금확인", "출고대기", "출고완료", "킵", "픽업예정"];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function getStatus(order: AnyRow) {
  return String(order.admin_order_status_v2 || order.order_manage_status || "미설정").trim();
}

function isUnpaidBankOrder(order: AnyRow) {
  const status = getStatus(order);
  const paymentMethod = String(order.payment_method || "무통장입금").trim();

  if (PAID_STATUSES.includes(status)) return false;
  if (status === "주문취소" || status === "환불") return false;
  if (paymentMethod && paymentMethod !== "무통장입금") return false;

  return true;
}

function isUnmatchedDeposit(deposit: AnyRow) {
  const status = String(deposit.match_status || "").trim();

  if (deposit.confirmed_at) return false;

  if (!status) return true;
  if (status === "미확인") return true;
  if (status === "미매칭") return true;

  return false;
}

function getGroupKey(order: AnyRow) {
  return String(order.order_group_id || order.order_lookup_code || order.id || "");
}

function rowAmount(order: AnyRow) {
  return (
    Number(order.final_amount || 0) ||
    Number(order.adjusted_total_price || 0) ||
    Number(order.total_price || 0) ||
    0
  );
}

function groupAmount(rows: AnyRow[]) {
  if (rows.length === 0) return 0;

  const first = rows[0];

  // final_amount가 있으면 보통 최종 결제금액 기준으로 저장된 값이라 우선 사용
  const firstFinal = Number(first.final_amount || 0);
  if (firstFinal > 0) return Math.round(firstFinal);

  // 조정 총액이 있으면 우선 사용
  const firstAdjusted = Number(first.adjusted_total_price || 0);
  if (firstAdjusted > 0 && rows.length === 1) return Math.round(firstAdjusted);

  // 여러 상품 행이면 각 행 금액 합산
  return Math.round(rows.reduce((sum, row) => sum + rowAmount(row), 0));
}

function groupOrders(orders: AnyRow[]) {
  const map = new Map<string, AnyRow[]>();

  for (const order of orders) {
    const key = getGroupKey(order);
    if (!key) continue;

    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(order);
  }

  return Array.from(map.entries()).map(([groupId, rows]) => ({
    groupId,
    rows,
    first: rows[0],
    amount: groupAmount(rows),
    nickname: normalizeText(rows[0]?.youtube_nickname),
  }));
}

export async function runAutoPaymentMatch(supabase: any) {
  const { data: rawOrders, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .neq("is_deleted", true)
    .order("created_at", { ascending: true })
    .limit(3000);

  if (orderError) {
    throw new Error(orderError.message);
  }

  const { data: rawDeposits, error: depositError } = await supabase
    .from("deposits")
    .select("*")
    .order("id", { ascending: true })
    .limit(3000);

  if (depositError) {
    throw new Error(depositError.message);
  }

  const paymentMatchOrders: AnyRow[] = filterPaymentMatchEligibleOrders((rawOrders || []) as AnyRow[]);
  const orderGroups = groupOrders(paymentMatchOrders.filter(isUnpaidBankOrder))
    .filter((group) => group.nickname && group.amount > 0);

  const deposits = (rawDeposits || [])
    .filter(isUnmatchedDeposit)
    .filter((deposit: AnyRow) => normalizeText(deposit.depositor_name) && Number(deposit.amount || 0) > 0);

  const candidatePairs: Array<{
    groupId: string;
    orderIds: number[];
    depositId: number;
    customerId: number | null;
    amount: number;
  }> = [];

  for (const deposit of deposits) {
    const depositName = normalizeText(deposit.depositor_name);
    const depositAmount = Number(deposit.amount || 0);

    const matchedGroups = orderGroups.filter((group) => {
      return group.nickname === depositName && group.amount === depositAmount;
    });

    if (matchedGroups.length !== 1) continue;

    const group = matchedGroups[0];

    const sameGroupDepositCandidates = deposits.filter((otherDeposit: AnyRow) => {
      return (
        normalizeText(otherDeposit.depositor_name) === group.nickname &&
        Number(otherDeposit.amount || 0) === group.amount
      );
    });

    // 같은 닉네임+금액 입금내역이 여러 개면 자동처리 안 함
    if (sameGroupDepositCandidates.length !== 1) continue;

    candidatePairs.push({
      groupId: group.groupId,
      orderIds: group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0),
      depositId: Number(deposit.id),
      customerId: group.first.customer_id || null,
      amount: group.amount,
    });
  }

  let matchedCount = 0;
  const matched: Array<{ groupId: string; depositId: number; amount: number }> = [];

  for (const pair of candidatePairs) {
    if (pair.orderIds.length === 0 || !pair.depositId) continue;

    const nowIso = new Date().toISOString();

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "입금확인",
        order_manage_status: "입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", pair.orderIds);

    if (orderUpdateError) continue;

    const { error: depositUpdateError } = await supabase
      .from("deposits")
      .update({
        match_order_group_id: pair.groupId,
        match_customer_id: pair.customerId,
        match_status: "자동입금확인",
        confirmed_at: nowIso,
        confirmed_note: "닉네임+금액 완전일치 자동매칭",
      })
      .eq("id", pair.depositId)
      .is("confirmed_at", null);

    if (depositUpdateError) continue;

    matchedCount += 1;
    matched.push({
      groupId: pair.groupId,
      depositId: pair.depositId,
      amount: pair.amount,
    });
  }

  return {
    matchedCount,
    matched,
    scannedOrders: orderGroups.length,
    scannedDeposits: deposits.length,
  };
}
