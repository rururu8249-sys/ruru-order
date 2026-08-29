// [2026-08-29 사장님 요청] 접속 기록 — 날짜별 · 방송별 집계 (읽기 전용)
//
// 안전
//   · SELECT 만 한다. 아무것도 쓰지 않는다.
//   · 관리자 세션이 있어야 한다.
//   · public.visitor_visits 표가 아직 없으면 available:false 로 조용히 응답한다.
//   · 주문 / 입금 / 정산 / 배송 데이터는 읽지도 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 30;
const ROW_LIMIT = 20000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// 한국 날짜(YYYY-MM-DD) — 방송이 자정을 넘겨도 "그날 방송"으로 묶이게 서울 기준으로 자른다.
function seoulDate(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("visitor_visits")
      .select("visitor_key, page_type, broadcast_id, shop_mode, started_at")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(ROW_LIMIT);

    if (error) {
      // 표가 아직 없음 — 화면에서 "표를 만들어 주세요" 안내를 띄우게 한다.
      return NextResponse.json({ ok: true, available: false, daily: [], broadcasts: [], totals: null });
    }

    const rows = (data || []) as Array<Record<string, unknown>>;

    const dailyMap = new Map<string, { visitors: Set<string>; visits: number; live: number; shop: number }>();
    const bcMap = new Map<string, { visitors: Set<string>; visits: number; firstAt: string }>();
    const allVisitors = new Set<string>();

    for (const row of rows) {
      const key = String(row.visitor_key ?? "").trim();
      const startedAt = String(row.started_at ?? "");
      const date = seoulDate(startedAt);
      if (!key || !date) continue;
      allVisitors.add(key);

      const day = dailyMap.get(date) || { visitors: new Set<string>(), visits: 0, live: 0, shop: 0 };
      day.visitors.add(key);
      day.visits += 1;
      if (String(row.shop_mode ?? "") === "live") day.live += 1; else day.shop += 1;
      dailyMap.set(date, day);

      const bid = row.broadcast_id != null ? String(row.broadcast_id) : "";
      if (bid) {
        const bc = bcMap.get(bid) || { visitors: new Set<string>(), visits: 0, firstAt: startedAt };
        bc.visitors.add(key);
        bc.visits += 1;
        if (startedAt < bc.firstAt) bc.firstAt = startedAt;
        bcMap.set(bid, bc);
      }
    }

    // 방송 제목 붙이기 (없어도 집계는 그대로 나온다)
    const bcIds = Array.from(bcMap.keys()).slice(0, 60);
    const titles = new Map<string, string>();
    if (bcIds.length > 0) {
      const { data: bcs } = await supabase
        .from("broadcasts")
        .select("id, public_title, started_at")
        .in("id", bcIds);
      for (const b of (bcs || []) as Array<Record<string, unknown>>) {
        titles.set(String(b.id), String(b.public_title ?? "").trim());
      }
    }

    const daily = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, visitors: v.visitors.size, visits: v.visits, live: v.live, shop: v.shop }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, DAYS);

    const broadcasts = Array.from(bcMap.entries())
      .map(([id, v]) => ({
        broadcastId: id,
        title: titles.get(id) || `방송 ${id}`,
        visitors: v.visitors.size,
        visits: v.visits,
        startedAt: v.firstAt,
      }))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, 30);

    return NextResponse.json({
      ok: true,
      available: true,
      days: DAYS,
      totals: { visitors: allVisitors.size, visits: rows.length, capped: rows.length >= ROW_LIMIT },
      daily,
      broadcasts,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
