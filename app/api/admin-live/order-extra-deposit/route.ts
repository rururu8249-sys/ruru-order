// app/api/admin-live/order-extra-deposit/route.ts
// [2026-11-15] 「추가 입금 연결」 — 입금확인된 주문서에 나중 입금(차액)을 붙인다.
//   ⚠️ orders 는 읽기만. deposits 의 연결 칸(match_order_group_id·match_customer_id·match_status·confirmed_at·confirmed_note)만 쓴다.
//   GET ?groupId=     → 주문 금액·연결된 입금 합·부족액·붙일 수 있는 입금 후보
//   GET ?list=shortage → 추가 입금 기다리는 주문 목록(최근 60일)
//   POST {groupId, depositIds} → 연결(관리자 로그인 + same-origin)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { parseMultiOrderGroups } from "@/lib/multiOrderDeposit";
import {
  EXTRA_DEPOSIT_NOTE,
  buildShortageList,
  extraDepositOrderBlock,
  extraDepositResult,
  isLinkableDeposit,
  liveRows,
  orderGroupTotal,
  rankExtraDeposits,
} from "@/lib/extraDeposit";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
const DEP_COLS = "id, depositor_name, amount, deposited_time, created_at, match_status, match_order_group_id, match_customer_id, confirmed_at, confirmed_note";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readGroup(sb: ReturnType<typeof admin>, groupId: string) {
  const { data: orders, error } = await sb.from("orders").select("*").eq("order_group_id", groupId).neq("is_deleted", true);
  if (error) throw new Error(error.message || "주문 조회 실패");
  const { data: linked, error: le } = await sb.from("deposits").select(DEP_COLS).eq("match_order_group_id", groupId);
  if (le) throw new Error(le.message || "입금 조회 실패");
  const rows = (orders ?? []) as Row[];
  const deps = (linked ?? []) as Row[];
  const multi = deps.some((d) => parseMultiOrderGroups(d.confirmed_note).length > 0);
  const total = orderGroupTotal(rows);
  const linkedSum = deps.reduce((s, d) => s + (Number(d.amount || 0) || 0), 0);
  const block = rows.length === 0 ? "주문을 찾을 수 없어요." : multi ? "여러 주문을 합친 입금이 걸린 주문이에요." : extraDepositOrderBlock(rows);
  const extras = deps.filter((d) => String(d.confirmed_note ?? "") === EXTRA_DEPOSIT_NOTE).map((d) => ({ id: Number(d.id), name: String(d.depositor_name ?? ""), amount: Number(d.amount || 0) }));
  return { rows, total, linkedSum, linkedCount: deps.length, block, extras };
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const sb = admin();
    if (request.nextUrl.searchParams.get("list") === "shortage") {
      const since = new Date(Date.now() - 60 * 86400_000).toISOString();
      const orders: Row[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await sb
          .from("orders")
          .select("id, order_group_id, order_lookup_code, youtube_nickname, customer_name, payment_method, admin_order_status_v2, order_manage_status, order_status, final_amount, adjusted_total_price, total_price, is_deleted, is_test_order, exclude_from_payment_match")
          .gte("created_at", since)
          .neq("is_deleted", true)
          .or("admin_order_status_v2.ilike.*입금확인*,order_manage_status.ilike.*입금확인*")
          .order("id", { ascending: true })
          .range(from, from + 999);
        if (error) return fail(error.message || "주문 조회 실패", 500);
        orders.push(...((data ?? []) as Row[]));
        if (!data || data.length < 1000) break;
      }
      const groups = Array.from(new Set(orders.map((o) => String(o.order_group_id || "")).filter(Boolean)));
      const deposits: Row[] = [];
      for (let i = 0; i < groups.length; i += 200) {
        const { data, error } = await sb.from("deposits").select("amount, match_order_group_id, confirmed_note").in("match_order_group_id", groups.slice(i, i + 200));
        if (error) return fail(error.message || "입금 조회 실패", 500);
        deposits.push(...((data ?? []) as Row[]));
      }
      return NextResponse.json({ ok: true, items: buildShortageList(orders, deposits) }, { headers: { "Cache-Control": "no-store" } });
    }

    const groupId = String(request.nextUrl.searchParams.get("groupId") || "").trim();
    if (!groupId) return fail("groupId가 없습니다.");
    const g = await readGroup(sb, groupId);
    const first = liveRows(g.rows)[0] ?? g.rows[0] ?? {};
    const shortage = Math.max(0, g.total - g.linkedSum);
    const since = new Date(Date.now() - 45 * 86400_000).toISOString();
    const { data: cand, error } = await sb
      .from("deposits")
      .select(DEP_COLS)
      .is("match_order_group_id", null)
      .is("confirmed_at", null)
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(300);
    if (error) return fail(error.message || "입금 조회 실패", 500);
    const names = [first.youtube_nickname, first.customer_name, first.depositor_name].map((v) => String(v ?? ""));
    const ranked = rankExtraDeposits((cand ?? []) as Row[], names, shortage).slice(0, 40).map((d) => ({
      id: Number(d.id),
      name: String(d.depositor_name ?? ""),
      amount: Number(d.amount || 0),
      at: String(d.created_at || ""),
      time: /^\d{1,2}:\d{2}/.test(String(d.deposited_time || "")) ? String(d.deposited_time).slice(0, 5) : "",
      nameMatch: d.nameMatch,
      exact: d.exact,
    }));
    return NextResponse.json({ ok: true, total: g.total, linkedSum: g.linkedSum, linkedCount: g.linkedCount, shortage, block: g.block, extras: g.extras, candidates: ranked }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "조회 실패", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("잘못된 요청입니다.", 403);
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const groupId = String(body.groupId || "").trim();
    const ids = Array.from(new Set((Array.isArray(body.depositIds) ? body.depositIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
    if (!groupId) return fail("주문 정보가 없습니다.");
    // 「연결 취소」 — 이 기능으로 붙인 입금만 다시 미확인으로(원래 입금확인 입금은 안 건드림)
    if (body.action === "unlink") {
      if (ids.length !== 1) return fail("취소할 입금을 하나 골라 주세요.");
      const sb0 = admin();
      const { data: un, error: une } = await sb0
        .from("deposits")
        .update({ match_order_group_id: null, match_customer_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null })
        .eq("id", ids[0])
        .eq("match_order_group_id", groupId)
        .eq("confirmed_note", EXTRA_DEPOSIT_NOTE)
        .select("id");
      if (une) return fail(une.message || "취소 실패", 500);
      if (!un || un.length !== 1) return fail("이 기능으로 붙인 입금만 연결 취소할 수 있어요.", 409);
      return NextResponse.json({ ok: true, unlinked: 1 }, { headers: { "Cache-Control": "no-store" } });
    }
    if (ids.length === 0) return fail("붙일 입금을 골라 주세요.");
    if (ids.length > 10) return fail("한 번에 10건까지만 붙일 수 있어요.");

    const sb = admin();
    const g = await readGroup(sb, groupId);
    if (g.block) return fail(g.block, 409);
    if (g.linkedCount === 0) return fail("입금 없이 확인한 주문이라 붙일 입금 기준이 없어요. 입금확인 취소 후 입금매칭에서 확인하세요.", 409);

    const { data: deps, error } = await sb.from("deposits").select(DEP_COLS).in("id", ids);
    if (error) return fail(error.message || "입금 조회 실패", 500);
    const rows = (deps ?? []) as Row[];
    if (rows.length !== ids.length) return fail("고른 입금 중 없는 게 있어요. 새로고침해 주세요.", 404);
    const bad = rows.find((d) => !isLinkableDeposit(d));
    if (bad) return fail(`이미 다른 주문에 연결됐거나 정리된 입금이에요. (입금 ${bad.id})`, 409);
    const addSum = rows.reduce((s, d) => s + (Number(d.amount || 0) || 0), 0);
    const clientSum = Number(body.selectedTotal || 0);
    if (clientSum > 0 && clientSum !== addSum) return fail(`고른 금액이 달라요: 화면 ${clientSum.toLocaleString()}원 / 서버 ${addSum.toLocaleString()}원`);

    const first = liveRows(g.rows)[0] ?? g.rows[0];
    const now = new Date().toISOString();
    const done: number[] = [];
    for (const id of ids) {
      // 동시에 다른 화면이 같은 입금을 연결하지 못하게: 아직 연결 안 된 줄일 때만 바꿈
      const { data: upd, error: ue } = await sb
        .from("deposits")
        .update({ match_order_group_id: groupId, match_customer_id: first?.customer_id ?? null, match_status: "수동입금확인", confirmed_at: now, confirmed_note: EXTRA_DEPOSIT_NOTE })
        .eq("id", id)
        .is("match_order_group_id", null)
        .is("confirmed_at", null)
        .select("id");
      if (ue || !upd || upd.length !== 1) {
        if (done.length) {
          await sb.from("deposits").update({ match_order_group_id: null, match_customer_id: null, match_status: "미확인", confirmed_at: null, confirmed_note: null }).in("id", done).eq("confirmed_note", EXTRA_DEPOSIT_NOTE);
        }
        return fail("다른 화면에서 먼저 처리된 입금이 있어 되돌렸어요. 새로고침 후 다시 해 주세요.", 409);
      }
      done.push(id);
    }
    const r = extraDepositResult(g.total, g.linkedSum, addSum);
    return NextResponse.json({ ok: true, linked: done.length, addSum, ...r, total: g.total }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "연결 실패", 500);
  }
}
