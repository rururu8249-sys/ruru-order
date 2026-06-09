// app/api/admin-v2/integrity-check/route.ts
// 목적: 돈/입금 데이터 정합성 점검 (읽기 전용 안전장치).
// 주의: SELECT만 한다. insert/update/delete 등 DB write는 절대 없다.
//       기존 매칭/입금/정산 로직은 건드리지 않고, orders/deposits를 읽어 메모리에서만 점검한다.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// 행수 캡(~1000) 방지: .range로 1000개씩 끝까지 전체를 가져온다. (deposits/route.ts와 동일 방식)
async function fetchAllRows(supabase: any, table: string, columns: string) {
  const pageSize = 1000;
  let from = 0;
  const all: AnyRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// 주문 표시금액: final_amount → adjusted_total_price → total_price 순.
function orderAmount(order: AnyRow): number {
  const raw = order.final_amount ?? order.adjusted_total_price ?? order.total_price;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function depositAmountNum(deposit: AnyRow): number {
  const n = Number(deposit.amount);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { ok: false, message: "Supabase 환경변수가 없습니다." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const ORDER_COLUMNS =
      "id, order_lookup_code, youtube_nickname, customer_name, final_amount, adjusted_total_price, total_price, admin_order_status_v2, order_group_id, is_deleted, is_test_order, deposit_confirmed_at, created_at";
    const DEPOSIT_COLUMNS =
      "id, depositor_name, amount, deposited_time, match_order_group_id, match_customer_id, match_status, confirmed_at, created_at";

    const [ordersResult, depositsResult] = await Promise.all([
      fetchAllRows(supabase, "orders", ORDER_COLUMNS),
      fetchAllRows(supabase, "deposits", DEPOSIT_COLUMNS),
    ]);

    if (ordersResult.error) {
      return NextResponse.json(
        { ok: false, message: "orders 조회 실패", detail: ordersResult.error.message },
        { status: 500 },
      );
    }

    if (depositsResult.error) {
      return NextResponse.json(
        { ok: false, message: "deposits 조회 실패", detail: depositsResult.error.message },
        { status: 500 },
      );
    }

    const allOrders: AnyRow[] = ordersResult.data || [];
    const allDeposits: AnyRow[] = depositsResult.data || [];

    // 대상 주문: 삭제(true) 아님 + 테스트 주문(true) 아님.
    const orders = allOrders.filter(
      (order) => order.is_deleted !== true && order.is_test_order !== true,
    );

    // ── 점검1) 자동입금확인인데 연결 입금 없음 ──────────────────────────────
    // 자동입금확인 주문의 order_group_id를, match_order_group_id로 가진 deposit이 하나도 없는 경우.
    const matchedGroupIds = new Set<string>();
    for (const deposit of allDeposits) {
      const gid = cleanText(deposit.match_order_group_id);
      if (gid) matchedGroupIds.add(gid);
    }

    const check1Items = orders
      .filter((order) => cleanText(order.admin_order_status_v2) === "자동입금확인")
      .filter((order) => {
        const gid = cleanText(order.order_group_id);
        return !gid || !matchedGroupIds.has(gid);
      })
      .map((order) => ({
        order_id: order.id,
        order_lookup_code: order.order_lookup_code ?? null,
        nickname: order.youtube_nickname ?? null,
        amount: orderAmount(order),
        created_at: order.created_at ?? null,
      }));

    // ── 점검2) 한 주문그룹에 2건 이상 deposit 연결 ─────────────────────────
    // (의미 명확화) match_order_group_id 기준으로 묶어, 연결된 deposit이 2건 이상인 주문그룹.
    const depositsByGroup = new Map<string, AnyRow[]>();
    for (const deposit of allDeposits) {
      const gid = cleanText(deposit.match_order_group_id);
      if (!gid) continue;
      const prev = depositsByGroup.get(gid) ?? [];
      prev.push(deposit);
      depositsByGroup.set(gid, prev);
    }

    const check2Items = Array.from(depositsByGroup.entries())
      .filter(([, deps]) => deps.length >= 2)
      .map(([gid, deps]) => {
        const times = deps
          .map((d) => d.deposited_time)
          .filter(Boolean)
          .sort();
        return {
          order_group_id: gid,
          deposit_ids: deps.map((d) => d.id),
          total_deposit_amount: deps.reduce((sum, d) => sum + depositAmountNum(d), 0),
          latest_deposited_time: times.length ? times[times.length - 1] : null,
        };
      });

    // ── 점검3) 중복 입금내역 (depositor_name + amount + deposited_time 동일) ──
    const depositsByKey = new Map<string, AnyRow[]>();
    for (const deposit of allDeposits) {
      const key = [
        cleanText(deposit.depositor_name),
        cleanText(deposit.amount),
        cleanText(deposit.deposited_time),
      ].join("__");
      const prev = depositsByKey.get(key) ?? [];
      prev.push(deposit);
      depositsByKey.set(key, prev);
    }

    const check3Items = Array.from(depositsByKey.values())
      .filter((deps) => deps.length >= 2)
      .map((deps) => ({
        depositor_name: deps[0].depositor_name ?? null,
        amount: depositAmountNum(deps[0]),
        deposited_time: deps[0].deposited_time ?? null,
        deposit_ids: deps.map((d) => d.id),
      }));

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: {
        check1_auto_paid_no_deposit: check1Items.length,
        check2_group_multi_deposit: check2Items.length,
        check3_duplicate_deposit: check3Items.length,
      },
      check1: { count: check1Items.length, items: check1Items },
      check2: { count: check2Items.length, items: check2Items },
      check3: { count: check3Items.length, items: check3Items },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "정합성 점검 실패",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
