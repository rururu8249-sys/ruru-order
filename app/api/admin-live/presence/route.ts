import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePresence } from "@/lib/presenceWrite";
import { buildLiveVisitors, summarizeLiveVisitors, excludePresenceRows, type CustomerRow, type CartRow, type OrderRow } from "@/lib/presenceLive";
import { loadExcludedCustomers } from "@/lib/visitStatsExclude";
import { readAutomationAdminActivity } from "@/lib/liveAutomationAdminActivity";

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

// KST 오늘 0시(ISO) — 방송 꺼진 날의 주문 범위
function kstTodayStartIso(now: number) {
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 9 * 60 * 60 * 1000).toISOString();
}

// [2026-08-29 사장님 요청] 왼쪽 사이드바에서 "지금 몇 명 들어와 있는지" 바로 보이게.
//   ops-status 는 주문 80건까지 같이 읽어와서 방송 피크에 부담이 된다.
//   그래서 접속자만 보는 가벼운 읽기 전용 API 를 따로 둔다. (visitor_presence 단일 인덱스 조회)
export async function GET() {
  try {
    const supabase = getSupabase();
    const now = Date.now();
    const activeSince = new Date(now - 1000 * 120).toISOString();

    // [2026-08-29] 접속자가 100명이 넘어도 숫자는 정확해야 한다.
    //   → 총 인원은 count 로 세고, 목록은 최근 60명만 가져온다(화면에 다 못 넣으므로).
    const { count: totalCount } = await supabase
      .from("visitor_presence")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", activeSince);

    // [2026-11-09] kakao_id·activity* 포함(visitor_presence_activity.sql) — 칸이 아직 없으면 옛 select 로 폴백(viewing_product 도 같은 방식)
    const selects = [
      "id, visitor_key, nickname, page_type, last_seen_at, viewing_product, kakao_id, activity, activity_label, activity_at, activity_log",
      "id, visitor_key, nickname, page_type, last_seen_at, viewing_product, kakao_id, activity, activity_label, activity_at",
      "id, visitor_key, nickname, page_type, last_seen_at, viewing_product",
      "id, visitor_key, nickname, page_type, last_seen_at",
    ];
    let data: Array<Record<string, unknown>> | null = null;
    let error: { message?: string } | null = null;
    for (const sel of selects) {
      const r = await supabase
        .from("visitor_presence")
        .select(sel)
        .gte("last_seen_at", activeSince)
        .order("last_seen_at", { ascending: false })
        .limit(500);   // 분류(주문서/조회/기타) 숫자를 정확히 세기 위해 넉넉히 읽고, 목록은 아래에서 자른다
      data = (r.data ?? null) as Array<Record<string, unknown>> | null;
      error = r.error;
      if (!error || !/column .* does not exist|could not find the .* column|PGRST204|42703/i.test(String(error.message ?? ""))) break;
    }

    if (error) {
      // 표가 아직 없거나 권한 문제여도 관리자 화면을 막지 않는다.
      return NextResponse.json({ ok: true, available: false, total: 0, byType: { orderForm: 0, orderLookup: 0, admin: 0, others: 0 }, visitors: [] });
    }

    const automation = await readAutomationAdminActivity(supabase);
    const actorByVisitor = new Map(automation.sessions.map(s=>[s.visitorKey,s.actorId]));
    const rawRows = ((data || []) as Array<Record<string, unknown>>).map(row=>({...row,automation_actor_id:actorByVisitor.get(String(row.visitor_key))}));
    // [2026-11-09 ③] 관리자 화면 줄 + 접속 기록 「제외 계정」(사장님 계정 — 카카오 계정·닉네임 전부)은 목록·숫자에서 뺀다. 목록 못 읽으면 관리자 줄만 뺌.
    let excludeKakao: string[] = [];
    let excludeNames: string[] = [];
    try {
      const ex = await loadExcludedCustomers(supabase);
      excludeKakao = ex.kakaoIds;
      excludeNames = Array.from(ex.allNames);
    } catch { /* 제외 목록 못 읽음 → 관리자 줄만 */ }
    const allRows = excludePresenceRows(rawRows, { kakaoIds: excludeKakao, names: excludeNames });
    const removed = rawRows.length - allRows.length;
    const listedRows = allRows.slice(0, 60);

    // [2026-11-09] 회원·장바구니·오늘(이번 방송) 주문을 붙인다 — 읽기 SELECT 3~4개(목록 60명 기준), 실패하면 그 정보만 빈 값.
    const kakaoIds = Array.from(new Set(listedRows.map((r) => clean(r.kakao_id)).filter(Boolean)));
    const nicks = Array.from(new Set(listedRows.map((r) => clean(r.nickname)).filter(Boolean)));
    const nowIso = new Date(now).toISOString();
    // 주문 범위: 방송 켜져 있으면 그 방송 시작부터, 아니면 오늘(KST) 0시부터
    let since = kstTodayStartIso(now);
    try {
      const { data: bc } = await supabase.from("broadcasts").select("started_at,status,is_deleted").order("started_at", { ascending: false }).limit(20);
      const on = ((bc || []) as Array<Record<string, unknown>>).find((b) => b.is_deleted !== true && String(b.status || "").toUpperCase() === "ON");
      if (on?.started_at) since = String(on.started_at);
    } catch { /* 범위는 오늘로 */ }

    const [custRes, cartRes, ordKakaoRes, ordNickRes] = await Promise.all([
      (kakaoIds.length || nicks.length)
        ? supabase.from("customers").select("kakao_id,youtube_nickname,customer_name,customer_phone,is_blocked")
            .or([kakaoIds.length ? `kakao_id.in.(${kakaoIds.map((v) => `"${v}"`).join(",")})` : "", nicks.length ? `youtube_nickname.in.(${nicks.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})` : ""].filter(Boolean).join(","))
            .limit(300)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      supabase.from("cart_reservations").select("kakao_id,nickname,qty,unit_price,product_name,detail_name,expires_at").gt("expires_at", nowIso).limit(2000),
      kakaoIds.length
        ? supabase.from("orders").select("id,order_group_id,kakao_id,youtube_nickname,admin_order_status_v2,order_manage_status,final_amount,total_price,created_at,is_deleted,is_test_order,product_name,automation_actor_id").gte("created_at", since).in("kakao_id", kakaoIds).limit(2000)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      nicks.length
        ? supabase.from("orders").select("id,order_group_id,kakao_id,youtube_nickname,admin_order_status_v2,order_manage_status,final_amount,total_price,created_at,is_deleted,is_test_order,product_name,automation_actor_id").gte("created_at", since).in("youtube_nickname", nicks).limit(2000)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
    const ordersMerged = new Map<string, OrderRow>();
    for (const o of [...((ordKakaoRes.data || []) as OrderRow[]), ...((ordNickRes.data || []) as OrderRow[])]) ordersMerged.set(String(o.id), o);

    const visitors = buildLiveVisitors({
      rows: listedRows,
      customers: (custRes.data || []) as CustomerRow[],
      carts: [...(cartRes.data || []),...automation.holds] as CartRow[],
      orders: Array.from(ordersMerged.values()),
      now,
    });

    // 분류 숫자는 읽어온 전체(최대 500)로 센다 — 목록은 60명만 보여줘도 숫자는 맞아야 한다.
    const byType = { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
    allRows.forEach((row) => {
      const t = clean(row.page_type) || "page";
      if (t === "order_form") byType.orderForm += 1;
      else if (t === "order_lookup") byType.orderLookup += 1;
      else if (t === "admin") byType.admin += 1;
      else byType.others += 1;
    });

    // 총 인원 = count 에서 뺀 줄(관리자·제외 계정) 만큼 빼기(500줄 넘게 읽었을 때도 숫자 유지)
    const total = Number.isFinite(totalCount as number) && (totalCount as number) - removed >= visitors.length
      ? (totalCount as number) - removed
      : visitors.length;

    return NextResponse.json({ ok: true, available: true, total, listed: visitors.length, byType, summary: summarizeLiveVisitors(visitors, total), since, visitors });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ── 접속 신호 저장(POST) ────────────────────────────────────────────────────
// [2026-08-29 수정] 실제 저장 로직은 lib/presenceWrite.ts 로 옮겼다.
//   손님 브라우저는 middleware 에 막혀 이 주소로 올 수 없기 때문에
//   공개 주소 /api/presence 를 새로 두고, 두 곳이 같은 함수를 쓴다.
//   이 POST 는 예전 화면(캐시된 옛 JS)이 아직 이 주소로 보낼 수 있어 그대로 남겨둔다.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const clientIp = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      || (request.headers.get("x-real-ip") || "").trim();
    const result = await writePresence(body, clientIp);

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json({ ok: true, lastSeenAt: result.lastSeenAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
