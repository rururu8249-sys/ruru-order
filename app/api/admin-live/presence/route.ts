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
