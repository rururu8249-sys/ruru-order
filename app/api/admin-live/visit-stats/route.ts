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
// [2026-08-29 사장님 요청] "기록에 닉네임이 왜 없냐" → 날짜/방송마다 누가 왔는지 같이 내려준다.
//   화면이 감당할 수 있게 한 줄당 최근 120명까지만.
const NAMES_PER_ROW = 120;

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
      .select("visitor_key, nickname, page_type, broadcast_id, shop_mode, started_at, last_seen_at")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(ROW_LIMIT);

    if (error) {
      // 표가 아직 없음 — 화면에서 "표를 만들어 주세요" 안내를 띄우게 한다.
      return NextResponse.json({ ok: true, available: false, daily: [], broadcasts: [], totals: null });
    }

    const rows = (data || []) as Array<Record<string, unknown>>;

    // 방문자 한 명(visitor_key)당 한 줄. 이름은 있으면 쓰고, 없으면 "비회원".
    type Person = { name: string; visits: number; lastAt: string; live: boolean };
    type DayBucket = { visitors: Set<string>; visits: number; live: number; shop: number; people: Map<string, Person> };
    type BcBucket = { visitors: Set<string>; visits: number; firstAt: string; people: Map<string, Person> };

    const dailyMap = new Map<string, DayBucket>();
    const bcMap = new Map<string, BcBucket>();
    const allVisitors = new Set<string>();

    const addPerson = (people: Map<string, Person>, key: string, name: string, lastAt: string, live: boolean) => {
      const before = people.get(key);
      if (!before) {
        people.set(key, { name, visits: 1, lastAt, live });
        return;
      }
      before.visits += 1;
      if (lastAt > before.lastAt) before.lastAt = lastAt;
      if (live) before.live = true;
      // 나중에 닉네임을 적은 방문이 있으면 그걸 쓴다 (처음엔 비회원이었다가 로그인하는 경우)
      if (name !== "비회원" && before.name === "비회원") before.name = name;
    };

    for (const row of rows) {
      const key = String(row.visitor_key ?? "").trim();
      const startedAt = String(row.started_at ?? "");
      const date = seoulDate(startedAt);
      if (!key || !date) continue;
      allVisitors.add(key);

      const name = String(row.nickname ?? "").trim() || "비회원";
      const lastAt = String(row.last_seen_at ?? "") || startedAt;
      const isLive = String(row.shop_mode ?? "") === "live";

      const day = dailyMap.get(date)
        || { visitors: new Set<string>(), visits: 0, live: 0, shop: 0, people: new Map<string, Person>() };
      day.visitors.add(key);
      day.visits += 1;
      if (isLive) day.live += 1; else day.shop += 1;
      addPerson(day.people, key, name, lastAt, isLive);
      dailyMap.set(date, day);

      const bid = row.broadcast_id != null ? String(row.broadcast_id) : "";
      if (bid) {
        const bc = bcMap.get(bid)
          || { visitors: new Set<string>(), visits: 0, firstAt: startedAt, people: new Map<string, Person>() };
        bc.visitors.add(key);
        bc.visits += 1;
        if (startedAt < bc.firstAt) bc.firstAt = startedAt;
        addPerson(bc.people, key, name, lastAt, isLive);
        bcMap.set(bid, bc);
      }
    }

    // 최근에 온 사람부터 (실무에서 "방금 누가 왔나"를 먼저 보게 된다)
    const namesOf = (people: Map<string, Person>) =>
      Array.from(people.values())
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
        .slice(0, NAMES_PER_ROW)
        .map((p) => ({ name: p.name, visits: p.visits, lastAt: p.lastAt, live: p.live }));

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
      .map(([date, v]) => ({
        date,
        visitors: v.visitors.size,
        visits: v.visits,
        live: v.live,
        shop: v.shop,
        names: namesOf(v.people),
        namesCapped: v.people.size > NAMES_PER_ROW,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, DAYS);

    const broadcasts = Array.from(bcMap.entries())
      .map(([id, v]) => ({
        broadcastId: id,
        title: titles.get(id) || `방송 ${id}`,
        visitors: v.visitors.size,
        visits: v.visits,
        startedAt: v.firstAt,
        names: namesOf(v.people),
        namesCapped: v.people.size > NAMES_PER_ROW,
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
