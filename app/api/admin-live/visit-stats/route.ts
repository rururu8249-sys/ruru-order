// [2026-08-29 사장님 요청] 접속 기록 — 날짜별 · 방송별 집계 (읽기 전용)
// [2026-11-07 사장님 「1인당 1회만 유효 카운트 · 실무에서 보기 쉽게」] 전면 손봄
//   · 30일 기록을 «전부» 읽는다(예전엔 1,000줄만 읽혀 5일치만 보였음 — 실측 13,791줄)
//   · 사람 = 닉네임 기준(폰 2대도 1명), 비회원은 브라우저 1개 = 1명  (lib/visitStatsAgg)
//   · 처음 온 사람(customers.first_login_at) · 주문한 사람(orders, 취소·테스트 제외)도 같이 센다
//
// 안전
//   · SELECT 만 한다. 아무것도 쓰지 않는다. (visitor_visits · customers · orders · broadcasts 읽기)
//   · 관리자 세션이 있어야 한다.
//   · public.visitor_visits 표가 아직 없으면 available:false 로 조용히 응답한다.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { aggregateVisits, seoulDate, type OrderMark, type VisitRow } from "@/lib/visitStatsAgg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 30;
const PAGE = 1000;
const MAX_ROWS = 60000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// 1,000줄씩 끝까지 읽기(supabase 기본 상한이 1,000줄)
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ rows: T[]; error: unknown }> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows: out, error };
    const chunk = (Array.isArray(data) ? data : []) as T[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { rows: out, error: null };
}

function isCanceled(r: Record<string, unknown>) {
  return String(r.admin_order_status_v2 || "").includes("취소") || String(r.order_manage_status || "").includes("취소");
}

async function loadFirstDays(sb: SupabaseClient, nicks: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < nicks.length; i += 200) {
    const part = nicks.slice(i, i + 200);
    const { data } = await sb.from("customers").select("youtube_nickname, first_login_at, created_at").in("youtube_nickname", part);
    for (const c of (data || []) as Array<Record<string, unknown>>) {
      const nick = String(c.youtube_nickname || "").trim();
      const at = String(c.first_login_at || c.created_at || "");
      if (nick && at && !out.has(nick)) out.set(nick, seoulDate(at));
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const visits = await readAll<VisitRow>((from, to) =>
      supabase
        .from("visitor_visits")
        .select("visitor_key, nickname, broadcast_id, shop_mode, started_at, last_seen_at, ip")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .range(from, to)
    );
    if (visits.error) {
      return NextResponse.json({ ok: true, available: false, daily: [], broadcasts: [], totals: null });
    }
    const rows = visits.rows;

    // 닉네임 모음 → 처음 로그인한 날
    const nickSet = new Set<string>();
    for (const r of rows) {
      const n = String(r.nickname || "").trim();
      if (n) nickSet.add(n);
    }
    const firstDayByNick = await loadFirstDays(supabase, Array.from(nickSet));

    // 주문한 사람(읽기만 · 취소·테스트·삭제 제외)
    const orderRows = await readAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("orders")
        .select("youtube_nickname, created_at, broadcast_id, admin_order_status_v2, order_manage_status, is_test_order, is_deleted")
        .gte("created_at", since)
        .range(from, to)
    );
    const orders: OrderMark[] = [];
    for (const o of orderRows.rows) {
      if (o.is_deleted === true || o.is_test_order === true || isCanceled(o)) continue;
      const nick = String(o.youtube_nickname || "").trim();
      if (!nick) continue;
      orders.push({ nickname: nick, date: seoulDate(String(o.created_at || "")), broadcastId: o.broadcast_id ? String(o.broadcast_id) : "" });
    }

    // 방송 제목·시작 시각
    const bcIds = Array.from(new Set(rows.map((r) => (r.broadcast_id ? String(r.broadcast_id) : "")).filter(Boolean))).slice(0, 80);
    const titles = new Map<string, string>();
    const starts = new Map<string, string>();
    if (bcIds.length > 0) {
      const { data: bcs } = await supabase.from("broadcasts").select("id, public_title, started_at").in("id", bcIds);
      for (const b of (bcs || []) as Array<Record<string, unknown>>) {
        titles.set(String(b.id), String(b.public_title ?? "").trim());
        if (b.started_at) starts.set(String(b.id), String(b.started_at));
      }
    }

    const agg = aggregateVisits({ rows, firstDayByNick, orders, broadcastStart: starts });

    return NextResponse.json({
      ok: true,
      available: true,
      days: DAYS,
      totals: { visitors: agg.totalVisitors, visits: agg.totalVisits, capped: rows.length >= MAX_ROWS },
      daily: agg.daily.slice(0, DAYS),
      broadcasts: agg.broadcasts.slice(0, 40).map((b) => ({ ...b, title: titles.get(b.broadcastId) || `방송 ${b.broadcastId.slice(0, 8)}` })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
