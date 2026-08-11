import { NextRequest, NextResponse } from "next/server";
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

// [2026-08-11 부하개선] sinceIso가 있으면 그 이후 입금만 조회(기본 90일).
//   sinceIso=null(전체 기간 버튼)일 때만 예전처럼 전량 — 기존 화면·매칭 표시는 동일, 스캔량만 감소.
async function selectDeposits(supabase: any, sinceIso: string | null) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    let q = supabase
      .from("deposits")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q;
    if (error) {
      // 정렬 조회 실패 시: 정렬 없이 전체 페이지네이션 fallback
      const fb: any[] = [];
      let ffrom = 0;
      while (true) {
        let fq = supabase
          .from("deposits")
          .select("*")
          .range(ffrom, ffrom + pageSize - 1);
        if (sinceIso) fq = fq.gte("created_at", sinceIso);
        const { data: fdata, error: ferror } = await fq;
        if (ferror) return { data: null, error: ferror };
        const frows = fdata || [];
        fb.push(...frows);
        if (frows.length < pageSize) break;
        ffrom += pageSize;
      }
      return { data: fb, error: null };
    }
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

function chunkList(list: string[], size: number) {
  const out: string[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// [2026-08-06 부하개선] orders 전체 스캔 폴백(예전 동작 그대로 — 타깃 조회가 실패할 때만 사용)
async function selectAllOrdersFallback(supabase: any) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// [2026-08-06 부하개선] 기존에는 orders 전체를 1000행씩 끝까지 select("*") 했지만,
// buildOrderMaps/attachLinkedOrders 는 "deposits 가 실제로 들고 있는 키"만 조회에 쓴다.
// 따라서 그 키(order_group_id / order_lookup_code / id)에 해당하는 행만 가져와도
// linked_orders 결과는 완전히 동일하고, 전체 테이블 스캔만 사라진다.
// 참조 키가 하나도 없으면(=매칭된 입금 0건) orders 조회 자체를 생략한다.
async function selectOrdersForDeposits(supabase: any, deposits: AnyRow[]) {
  const groupKeys = new Set<string>();
  const orderIdKeys = new Set<string>();

  for (const deposit of deposits) {
    const { groupKeys: gKeys, orderKeys: oKeys } = depositLinkedKeys(deposit);
    for (const key of gKeys) groupKeys.add(key);
    for (const key of oKeys) orderIdKeys.add(key);
  }

  if (groupKeys.size === 0 && orderIdKeys.size === 0) {
    return { data: [] as AnyRow[], error: null };
  }

  const collected: AnyRow[] = [];
  const CHUNK = 150;

  const runIn = async (column: string, values: string[] | number[]) => {
    for (const part of chunkList(values as string[], CHUNK)) {
      const { data, error } = await supabase.from("orders").select("*").in(column, part);
      // 없는 컬럼(42703) 등은 조용히 건너뛴다 — 기존 first() 방어 로직과 동일한 취지
      if (error) {
        if (String((error as any)?.code || "") === "42703") return true;
        throw error;
      }
      collected.push(...((data as AnyRow[]) || []));
    }
    return true;
  };

  try {
    const groupList = Array.from(groupKeys);

    if (groupList.length > 0) {
      await runIn("order_group_id", groupList);
      await runIn("order_lookup_code", groupList);
      // buildOrderMaps 의 first() 가 보던 대체 컬럼도 동일하게 시도한다.
      // 실제 스키마에 없으면 42703 으로 조용히 건너뛰므로 기존 동작과 어긋나지 않는다.
      await runIn("group_id", groupList);
      await runIn("lookup_code", groupList);
    }

    const numericIds = Array.from(orderIdKeys)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    if (numericIds.length > 0) {
      await runIn("id", numericIds as unknown as string[]);
      await runIn("order_id", numericIds as unknown as string[]);
    }
  } catch (error) {
    // 타깃 조회가 실패하면 예전 전체조회로 폴백해서 화면이 비지 않게 한다.
    return await selectAllOrdersFallback(supabase);
  }

  // 여러 키로 중복 수집될 수 있어 id 기준 1회만 남긴다(uniqueRows 와 동일 기준).
  const seen = new Set<string>();
  const deduped: AnyRow[] = [];

  for (const row of collected) {
    const key = cleanText(first(row, ["id", "order_id"])) || JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return { data: deduped, error: null };
}

export async function GET(request: NextRequest) {
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
    // [2026-08-11 부하개선] ?days=N(기본 90) 이후 입금만. ?days=all 이면 예전처럼 전체.
    const daysRaw = request.nextUrl.searchParams.get("days");
    const sinceIso = (() => {
      if (daysRaw === "all") return null;
      const n = Math.floor(Number(daysRaw));
      const days = Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 90;
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    })();
    const depositsResult = await selectDeposits(supabase, sinceIso);

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

    const deposits: AnyRow[] = Array.isArray(depositsResult.data) ? (depositsResult.data as AnyRow[]) : [];

    const ordersResult = await selectOrdersForDeposits(supabase, deposits);

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

    const orders: AnyRow[] = Array.isArray(ordersResult.data) ? (ordersResult.data as AnyRow[]) : [];
    const maps = buildOrderMaps(orders);
    const enrichedDeposits = deposits.map((deposit: AnyRow) => attachLinkedOrders(deposit, maps));
    const linkedDepositCount = enrichedDeposits.filter((deposit: AnyRow) => Array.isArray(deposit.linked_orders) && deposit.linked_orders.length > 0).length;

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
