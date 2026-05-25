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

function first(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && cleanText(value) !== "") return value;
  }

  return "";
}

function addKey(map: Map<string, AnyRow[]>, key: unknown, order: AnyRow) {
  const text = cleanText(key);
  if (!text) return;

  const previous = map.get(text) ?? [];
  previous.push(order);
  map.set(text, previous);
}

function uniqueRows(rows: AnyRow[]) {
  const seen = new Set<string>();
  const result: AnyRow[] = [];

  for (const row of rows) {
    const key = cleanText(first(row, ["id", "order_id", "order_lookup_code", "order_group_id"])) || JSON.stringify(row);

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(row);
  }

  return result;
}

function depositLinkedKeys(deposit: AnyRow) {
  const groupKeys = [
    first(deposit, ["match_order_group_id", "matched_order_group_id", "order_group_id", "matched_group_id"]),
    first(deposit, ["order_lookup_code", "lookup_code"]),
  ]
    .map(cleanText)
    .filter(Boolean);

  const orderKeys = [
    first(deposit, ["match_order_id", "matched_order_id", "order_id"]),
  ]
    .map(cleanText)
    .filter(Boolean);

  return { groupKeys, orderKeys };
}

function buildOrderMaps(orders: AnyRow[]) {
  const byGroup = new Map<string, AnyRow[]>();
  const byId = new Map<string, AnyRow[]>();

  for (const order of orders) {
    addKey(byId, first(order, ["id", "order_id"]), order);

    addKey(byGroup, first(order, ["order_group_id", "group_id"]), order);
    addKey(byGroup, first(order, ["order_lookup_code", "lookup_code"]), order);
  }

  return { byGroup, byId };
}

function attachLinkedOrders(deposit: AnyRow, maps: ReturnType<typeof buildOrderMaps>) {
  const { groupKeys, orderKeys } = depositLinkedKeys(deposit);
  const linked: AnyRow[] = [];

  for (const key of orderKeys) {
    linked.push(...(maps.byId.get(key) ?? []));
  }

  for (const key of groupKeys) {
    linked.push(...(maps.byGroup.get(key) ?? []));
  }

  return {
    ...deposit,
    linked_orders: uniqueRows(linked).slice(0, 30),
  };
}

async function selectDeposits(supabase: ReturnType<typeof createClient>) {
  const ordered = await supabase
    .from("deposits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(3000);

  if (!ordered.error) return ordered;

  return supabase.from("deposits").select("*").limit(3000);
}

export async function GET() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase 환경변수가 없습니다.",
        deposits: [],
      },
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
    const depositsResult = await selectDeposits(supabase);

    if (depositsResult.error) {
      return NextResponse.json(
        {
          ok: false,
          message: depositsResult.error.message || "입금내역 조회 실패",
          deposits: [],
        },
        { status: 500 },
      );
    }

    const deposits = depositsResult.data ?? [];

    const ordersResult = await supabase
      .from("orders")
      .select("*")
      .limit(5000);

    if (ordersResult.error) {
      return NextResponse.json({
        ok: true,
        deposits,
        order_enrichment: {
          ok: false,
          message: ordersResult.error.message,
          linkedDepositCount: 0,
        },
      });
    }

    const orders = ordersResult.data ?? [];
    const maps = buildOrderMaps(orders);
    const enrichedDeposits = deposits.map((deposit) => attachLinkedOrders(deposit, maps));
    const linkedDepositCount = enrichedDeposits.filter((deposit) => Array.isArray(deposit.linked_orders) && deposit.linked_orders.length > 0).length;

    return NextResponse.json({
      ok: true,
      deposits: enrichedDeposits,
      order_enrichment: {
        ok: true,
        linkedDepositCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "입금내역 조회 실패";

    return NextResponse.json(
      {
        ok: false,
        message,
        deposits: [],
      },
      { status: 500 },
    );
  }
}
