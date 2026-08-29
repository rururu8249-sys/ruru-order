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
