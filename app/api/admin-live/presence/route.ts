import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function pageLabel(pageType: string) {
  if (pageType === "order_form") return "주문서 작성중";
  if (pageType === "order_lookup") return "주문조회";
  if (pageType === "group_buy") return "공구상품";
  if (pageType === "admin") return "관리자";
  return "사이트 접속";
}

// [2026-08-29 사장님 요청] 왼쪽 사이드바에서 "지금 몇 명 들어와 있는지" 바로 보이게.
//   ops-status 는 주문 80건까지 같이 읽어와서 방송 피크에 부담이 된다.
//   그래서 접속자만 보는 가벼운 읽기 전용 API 를 따로 둔다. (visitor_presence 단일 인덱스 조회)
export async function GET() {
  try {
    const supabase = getSupabase();
    const activeSince = new Date(Date.now() - 1000 * 120).toISOString();

    const { data, error } = await supabase
      .from("visitor_presence")
      .select("id, visitor_key, nickname, page_type, last_seen_at")
      .gte("last_seen_at", activeSince)
      .order("last_seen_at", { ascending: false })
      .limit(60);

    if (error) {
      // 표가 아직 없거나 권한 문제여도 관리자 화면을 막지 않는다.
      return NextResponse.json({ ok: true, available: false, total: 0, byType: { orderForm: 0, orderLookup: 0, admin: 0, others: 0 }, visitors: [] });
    }

    const visitors = (data || []).map((row) => ({
      id: String(row.id),
      nickname: clean(row.nickname) || "비회원 방문자",
      pageType: clean(row.page_type) || "page",
      pageLabel: pageLabel(clean(row.page_type) || "page"),
      lastSeenAt: clean(row.last_seen_at),
    }));

    const byType = { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
    visitors.forEach((v) => {
      if (v.pageType === "order_form") byType.orderForm += 1;
      else if (v.pageType === "order_lookup") byType.orderLookup += 1;
      else if (v.pageType === "admin") byType.admin += 1;
      else byType.others += 1;
    });

    return NextResponse.json({ ok: true, available: true, total: visitors.length, byType, visitors });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ── [2026-08-29 사장님 요청] 접속 "기록" 남기기 ─────────────────────────────
//   visitor_presence 는 같은 줄을 계속 덮어써서 "지금 몇 명"만 알 수 있고
//   "어제 몇 명 왔는지", "지난 방송에 몇 명이었는지"는 남지 않는다.
//   → public.visitor_visits 에 방문 기록을 쌓는다.
//
// 부하 보호 (방송 피크에 DB 터지지 않게)
//   · 진행 중인 방송 조회는 60초 캐시 — 손님 수와 무관하게 1분에 1번만 조회
//   · 신호는 30초마다 오지만, 같은 방문 기록은 5분에 한 번만 갱신
//   · 30분 이상 끊겼다 다시 오면 새 방문으로 본다
//   · 표가 아직 없거나 오류가 나면 조용히 넘어간다 (손님 화면·현재 접속자에 영향 없음)
const VISIT_SESSION_GAP_MS = 30 * 60 * 1000;
const VISIT_TOUCH_MS = 5 * 60 * 1000;
const BROADCAST_CACHE_MS = 60 * 1000;

let broadcastCache: { at: number; id: number | null } = { at: 0, id: null };

async function currentBroadcastId(supabase: ReturnType<typeof getSupabase>) {
  if (Date.now() - broadcastCache.at < BROADCAST_CACHE_MS) return broadcastCache.id;
  try {
    const { data } = await supabase
      .from("broadcasts")
      .select("id,status,is_deleted,started_at")
      .order("started_at", { ascending: false })
      .limit(20);
    const active = ((data || []) as Record<string, unknown>[]).find(
      (row) => row.is_deleted !== true && String(row.status || "").toUpperCase() === "ON",
    );
    const id = active?.id != null ? Number(active.id) : null;
    broadcastCache = { at: Date.now(), id: Number.isFinite(id as number) ? (id as number) : null };
  } catch {
    broadcastCache = { at: Date.now(), id: null };
  }
  return broadcastCache.id;
}

async function recordVisit(
  supabase: ReturnType<typeof getSupabase>,
  params: { visitorKey: string; nickname: string; pageType: string; path: string; nowIso: string },
) {
  try {
    const broadcastId = await currentBroadcastId(supabase);

    const { data, error } = await supabase
      .from("visitor_visits")
      .select("id,last_seen_at")
      .eq("visitor_key", params.visitorKey)
      .order("last_seen_at", { ascending: false })
      .limit(1);

    if (error) return;   // 표가 아직 없으면 여기서 조용히 끝

    const last = (data || [])[0] as { id?: number; last_seen_at?: string } | undefined;
    const lastMs = last?.last_seen_at ? Date.parse(last.last_seen_at) : 0;
    const gap = Date.now() - lastMs;

    if (!last || !lastMs || gap > VISIT_SESSION_GAP_MS) {
      await supabase.from("visitor_visits").insert({
        visitor_key: params.visitorKey,
        nickname: params.nickname || null,
        page_type: params.pageType,
        path: params.path || null,
        broadcast_id: broadcastId,
        shop_mode: broadcastId ? "live" : "shop",
        started_at: params.nowIso,
        last_seen_at: params.nowIso,
      });
      return;
    }

    if (gap > VISIT_TOUCH_MS) {
      await supabase
        .from("visitor_visits")
        .update({ last_seen_at: params.nowIso, ...(params.nickname ? { nickname: params.nickname } : {}) })
        .eq("id", last.id);
    }
  } catch {
    // 기록 실패는 접속 표시를 막지 않는다.
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const visitorKey = clean(body.visitorKey);
    const pageType = clean(body.pageType || "page");
    const path = clean(body.path || "");
    const nickname = clean(body.nickname || "");

    if (!visitorKey) {
      return NextResponse.json(
        { ok: false, message: "visitorKey가 없습니다." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("visitor_presence")
      .upsert(
        {
          visitor_key: visitorKey,
          nickname: nickname || null,
          page_type: pageType,
          path,
          last_seen_at: nowIso,
          updated_at: nowIso,
        },
        {
          onConflict: "visitor_key",
        }
      );

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    // 기록은 실패해도 응답을 막지 않는다.
    await recordVisit(supabase, { visitorKey, nickname, pageType, path, nowIso });

    return NextResponse.json({ ok: true, lastSeenAt: nowIso });
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
