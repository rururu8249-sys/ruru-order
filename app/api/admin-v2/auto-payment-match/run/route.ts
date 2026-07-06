import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { filterPaymentMatchEligibleOrders } from "@/lib/admin-v2/paymentMatchTestOrderGuard";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

type OrderGroupCandidate = {
  orderGroupId: string;
  orderIds: number[];
  firstOrder: AnyRow;
  nickname: string;
  customerName: string;
  amount: number;
  pointUsed: number;
};

type MatchCandidate = {
  order_group_id: string;
  order_ids: number[];
  order_nickname: string;
  order_customer_name: string;
  order_amount: number;
  deposit_id: number;
  deposit_depositor: string;
  deposit_amount: number;
  match_name: string;
  match_basis: "닉네임" | "고객명";
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

function autoMatchName(value: unknown) {
  // 매칭 키 비교 전용 정규화(표시/저장값은 절대 변경하지 않음):
  //  - 앞뒤 공백 제거 + 맨 앞 @ 접두어 제거
  //  - 공백/하이픈/언더스코어/점/가운뎃점 제거 + 소문자화
  // 예) "뮤즈-12" == "뮤즈12", "sunhye-e5z" == "sunhyee5z"
  // 서로 다른 사람이 같은 키로 겹치면 아래 "주문 1건 && 입금 1건" 조건에서 blocked 되어 오매칭 없음.
  return text(value)
    .replace(/^@+/, "")
    .replace(/[\s\-_.·・]/g, "")
    .toLowerCase();
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

function orderPointUsed(order: AnyRow) {
  // 이 주문에서 사용한 포인트. 다중상품+포인트 주문은 final_amount 합이 포인트 차감 전
  // 금액이라, 매칭 시 (합계 - 사용포인트) 금액도 후보로 허용하기 위해 사용한다.
  return num(order.point_used_amount ?? order.pointUsedAmount ?? order.used_point_amount ?? 0);
}

function orderGroupId(order: AnyRow) {
  return text(order.order_group_id || order.group_id || order.id);
}

function orderNickname(order: AnyRow) {
  return text(order.youtube_nickname || order.nickname || order.customer_nickname);
}

function orderCustomerName(order: AnyRow) {
  // 유사매칭 금지. 고객명도 실제 입금자명과 완전일치할 때만 후보로 사용합니다.
  return text(order.customer_name || order.name || order.buyer_name);
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
  return `${autoMatchName(name)}__${amount}`;
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
    const customerName = orderCustomerName(firstOrder);
    const amount = groupOrders.reduce((sum, order) => sum + orderAmount(order), 0);
    const pointUsed = groupOrders.reduce((sum, order) => sum + orderPointUsed(order), 0);
    const orderIds = groupOrders.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0);

    if (!nickname || !amount || orderIds.length === 0) continue;

    groups.push({
      orderGroupId: groupId,
      orderIds,
      firstOrder,
      nickname,
      customerName,
      amount,
      pointUsed,
    });
  }

  return groups;
}

function buildCandidates(orders: AnyRow[], deposits: AnyRow[]) {
  const eligibleOrderGroups = buildOrderGroups(orders);
  const eligibleDeposits = deposits.filter((deposit) => isEligibleDeposit(deposit).ok);

  const ordersByKey = new Map<
    string,
    Array<{
      group: OrderGroupCandidate;
      matchName: string;
      matchBasis: "닉네임" | "고객명";
    }>
  >();
  const depositsByKey = new Map<string, AnyRow[]>();

  for (const group of eligibleOrderGroups) {
    const matchNames: Array<{ name: string; basis: "닉네임" | "고객명" }> = [];

    const nickname = autoMatchName(group.nickname);
    const customerName = autoMatchName(group.customerName);

    if (nickname) {
      matchNames.push({ name: nickname, basis: "닉네임" });
    }

    if (customerName && customerName !== nickname) {
      matchNames.push({ name: customerName, basis: "고객명" });
    }

    for (const match of matchNames) {
      const entry = {
        group,
        matchName: match.name,
        matchBasis: match.basis,
      };

      // 기본: 주문 합계금액. 추가: 포인트 사용 주문은 (합계 - 사용포인트) 실결제금액도 후보로 허용.
      //  (다중상품+포인트 주문의 final_amount 합이 포인트 차감 전이라 실입금과 어긋나는 문제 대응.
      //   두 금액을 "추가"만 하므로 포인트 미사용/단일상품 주문 동작은 변하지 않음.)
      const amountKeys = [group.amount];
      const netAmount = group.amount - group.pointUsed;
      if (group.pointUsed > 0 && netAmount > 0 && netAmount !== group.amount) {
        amountKeys.push(netAmount);
      }

      for (const amt of amountKeys) {
        const key = makeKey(match.name, amt);
        ordersByKey.set(key, [...(ordersByKey.get(key) || []), entry]);
      }
    }
  }

  for (const deposit of eligibleDeposits) {
    const key = makeKey(depositName(deposit), depositAmount(deposit));
    depositsByKey.set(key, [...(depositsByKey.get(key) || []), deposit]);
  }

  const rawCandidates: MatchCandidate[] = [];
  const blocked: Array<{ key: string; reason: string; orderCount: number; depositCount: number }> = [];

  for (const [key, keyOrders] of ordersByKey.entries()) {
    const keyDeposits = depositsByKey.get(key) || [];

    if (keyOrders.length === 1 && keyDeposits.length === 1) {
      const orderCandidate = keyOrders[0];
      const group = orderCandidate.group;
      const deposit = keyDeposits[0];

      rawCandidates.push({
        order_group_id: group.orderGroupId,
        order_ids: group.orderIds,
        order_nickname: group.nickname,
        order_customer_name: group.customerName,
        order_amount: group.amount,
        deposit_id: depositId(deposit),
        deposit_depositor: depositName(deposit),
        deposit_amount: depositAmount(deposit),
        match_name: orderCandidate.matchName,
        match_basis: orderCandidate.matchBasis,
        reason: `${orderCandidate.matchBasis} 완전일치 + 주문그룹 합계금액 완전일치 + 주문그룹 1건/입금 1건`,
      });
    } else {
      blocked.push({
        key,
        orderCount: keyOrders.length,
        depositCount: keyDeposits.length,
        reason: "1:1 단일 후보가 아니라 자동처리 제외",
      });
    }
  }

  const orderCandidateCount = new Map<string, number>();
  const depositCandidateCount = new Map<number, number>();

  for (const candidate of rawCandidates) {
    orderCandidateCount.set(
      candidate.order_group_id,
      (orderCandidateCount.get(candidate.order_group_id) || 0) + 1
    );
    depositCandidateCount.set(
      candidate.deposit_id,
      (depositCandidateCount.get(candidate.deposit_id) || 0) + 1
    );
  }

  const candidates = rawCandidates.filter((candidate) => {
    const orderCount = orderCandidateCount.get(candidate.order_group_id) || 0;
    const depositCount = depositCandidateCount.get(candidate.deposit_id) || 0;

    if (orderCount === 1 && depositCount === 1) return true;

    blocked.push({
      key: `${candidate.match_name}__${candidate.order_amount}`,
      orderCount,
      depositCount,
      reason: "한 주문 또는 한 입금내역에 자동매칭 후보가 2개 이상이라 자동처리 제외",
    });

    return false;
  });

  return {
    candidates,
    blocked,
    eligibleOrderGroupCount: eligibleOrderGroups.length,
    eligibleDepositCount: eligibleDeposits.length,
  };
}

// [읽기 전용] "금액 단독" 추천 계산. DB를 절대 쓰지 않으며 자동확정도 하지 않는다.
// 기존 buildCandidates(이름+금액 1:1 자동확정)는 건드리지 않고, 별도 추천 목록만 만든다.
// 규칙(돈 사고 방지):
// - 자격(미결제·무통장·테스트/정산제외 아님)은 buildOrderGroups/isEligibleDeposit 재사용으로 동일 적용.
// - 정확금액 일치만. 그 금액의 미결제 주문이 정확히 1건일 때만 추천(2건↑이면 추천 안 함).
//   · 동일금액 미확인 입금 1건  → green(강력추천, 1클릭 후보)
//   · 동일금액 미확인 입금 2건↑ → yellow(입금자명 확인 필요, 입금 후보 목록 제공)
//   · 동일금액 입금 0건         → 추천 없음
function buildAmountOnlySuggestions(orders: AnyRow[], deposits: AnyRow[]) {
  const eligibleGroups = buildOrderGroups(orders);
  const eligibleDeposits = deposits.filter((deposit) => isEligibleDeposit(deposit).ok);

  const groupsByAmount = new Map<number, OrderGroupCandidate[]>();
  for (const group of eligibleGroups) {
    if (!group.amount || group.amount <= 0) continue;
    groupsByAmount.set(group.amount, [...(groupsByAmount.get(group.amount) || []), group]);
  }

  const depositsByAmount = new Map<number, AnyRow[]>();
  for (const deposit of eligibleDeposits) {
    const amount = depositAmount(deposit);
    if (!amount || amount <= 0) continue;
    depositsByAmount.set(amount, [...(depositsByAmount.get(amount) || []), deposit]);
  }

  const suggestions: any[] = [];

  for (const [amount, groupsAtAmount] of groupsByAmount.entries()) {
    // 같은 금액의 미결제 주문이 2건 이상이면 어느 주문인지 불명 → 추천하지 않음
    if (groupsAtAmount.length !== 1) continue;

    const depositsAtAmount = depositsByAmount.get(amount) || [];
    if (depositsAtAmount.length === 0) continue; // 일치하는 미확인 입금 없음

    const group = groupsAtAmount[0];
    const nicknameNorm = autoMatchName(group.nickname);
    const customerNorm = autoMatchName(group.customerName);

    if (depositsAtAmount.length === 1) {
      const deposit = depositsAtAmount[0];
      const depName = depositName(deposit);
      const depNameNorm = autoMatchName(depName);
      const nameMatched = Boolean(
        depNameNorm && (depNameNorm === nicknameNorm || (customerNorm && depNameNorm === customerNorm))
      );

      suggestions.push({
        confidence: "green",
        order_group_id: group.orderGroupId,
        order_ids: group.orderIds,
        order_nickname: group.nickname,
        order_customer_name: group.customerName,
        order_amount: group.amount,
        deposit_id: depositId(deposit),
        depositor_name: depName,
        deposit_amount: depositAmount(deposit),
        name_matched: nameMatched,
        reason: "그 금액의 미결제 주문 1건 + 미확인 입금 1건 (금액 단독 1:1)",
      });
    } else {
      suggestions.push({
        confidence: "yellow",
        order_group_id: group.orderGroupId,
        order_ids: group.orderIds,
        order_nickname: group.nickname,
        order_customer_name: group.customerName,
        order_amount: group.amount,
        deposit_candidates: depositsAtAmount.map((deposit) => ({
          deposit_id: depositId(deposit),
          depositor_name: depositName(deposit),
          deposit_amount: depositAmount(deposit),
        })),
        reason: "그 금액의 미결제 주문은 1건이나 동일금액 미확인 입금이 여러 건 — 입금자명 확인 필요",
      });
    }
  }

  return {
    suggestions,
    greenCount: suggestions.filter((item) => item.confidence === "green").length,
    yellowCount: suggestions.filter((item) => item.confidence === "yellow").length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const confirm = body?.confirm === "RUN_AUTO_MATCH";
    const nowIso = new Date().toISOString();

    async function fetchAllRows(table: string, applyFilter: ((q: any) => any) | null) {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
        if (applyFilter) query = applyFilter(query);
        const { data, error } = await query;
        if (error) return { data: null, error };
        const rows = data || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return { data: all, error: null };
    }

    const [ordersResult, depositsResult] = await Promise.all([
      fetchAllRows("orders", (q) => q.neq("is_deleted", true)),
      fetchAllRows("deposits", null),
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

    const rawOrdersForPaymentMatch = ordersResult.data || [];
    const orders = filterPaymentMatchEligibleOrders(rawOrdersForPaymentMatch);
    const deposits = depositsResult.data || [];

    const preview = buildCandidates(orders, deposits);

    if (!confirm) {
      // [읽기 전용] 금액 단독 추천. DB 쓰기/자동확정 없음. 미리보기 응답에만 포함.
      const amountOnly = buildAmountOnlySuggestions(orders, deposits);

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
          amount_only_green: amountOnly.greenCount,
          amount_only_yellow: amountOnly.yellowCount,
        },
        candidates: preview.candidates,
        blocked: preview.blocked,
        amount_only_suggestions: amountOnly.suggestions,
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
