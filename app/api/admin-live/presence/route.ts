import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePresence } from "@/lib/presenceWrite";

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

    // [2026-08-29] 접속자가 100명이 넘어도 숫자는 정확해야 한다.
    //   → 총 인원은 count 로 세고, 목록은 최근 60명만 가져온다(화면에 다 못 넣으므로).
    const { count: totalCount } = await supabase
      .from("visitor_presence")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", activeSince);

    // [2026-08-31] viewing_product(지금 담은 상품) 포함 — 칸이 아직 없으면(SQL 전) 옛 select 로 폴백
    let { data, error } = await supabase
      .from("visitor_presence")
      .select("id, visitor_key, nickname, page_type, last_seen_at, viewing_product")
      .gte("last_seen_at", activeSince)
      .order("last_seen_at", { ascending: false })
      .limit(500);   // 분류(주문서/조회/기타) 숫자를 정확히 세기 위해 넉넉히 읽고, 목록은 아래에서 자른다
    if (error && /column .* does not exist|42703/i.test(String(error.message ?? ""))) {
      const retry = await supabase
        .from("visitor_presence")
        .select("id, visitor_key, nickname, page_type, last_seen_at")
        .gte("last_seen_at", activeSince)
        .order("last_seen_at", { ascending: false })
        .limit(500);
      data = (retry.data ?? null) as typeof data; error = retry.error;
    }

    if (error) {
      // 표가 아직 없거나 권한 문제여도 관리자 화면을 막지 않는다.
      return NextResponse.json({ ok: true, available: false, total: 0, byType: { orderForm: 0, orderLookup: 0, admin: 0, others: 0 }, visitors: [] });
    }

    const allRows = (data || []) as Array<Record<string, unknown>>;
    const visitors = allRows.slice(0, 60).map((row) => ({
      id: String(row.id),
      nickname: clean(row.nickname) || "비회원 방문자",
      pageType: clean(row.page_type) || "page",
      pageLabel: pageLabel(clean(row.page_type) || "page"),
      lastSeenAt: clean(row.last_seen_at),
      viewingProduct: clean((row as { viewing_product?: unknown }).viewing_product),
    }));

    // 분류 숫자는 읽어온 전체(최대 500)로 센다 — 목록은 60명만 보여줘도 숫자는 맞아야 한다.
    const byType = { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
    allRows.forEach((row) => {
      const t = clean(row.page_type) || "page";
      if (t === "order_form") byType.orderForm += 1;
      else if (t === "order_lookup") byType.orderLookup += 1;
      else if (t === "admin") byType.admin += 1;
      else byType.others += 1;
    });

    const total = Number.isFinite(totalCount as number) && (totalCount as number) >= visitors.length
      ? (totalCount as number)
      : visitors.length;

    return NextResponse.json({ ok: true, available: true, total, listed: visitors.length, byType, visitors });
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
    const result = await writePresence(body);

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
