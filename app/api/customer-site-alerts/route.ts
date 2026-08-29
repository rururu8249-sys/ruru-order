import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const cleanSessionKey = (v: unknown) => {
  const t = String(v ?? "").trim();
  return !t || t.length < 6 || t.length > 80 ? "" : t;
};

// [2026-08-30 근본 수정] 알림을 "브라우저"가 아니라 "사람"에게 붙인다.
//   예전에는 target_session_key(장바구니 세션키)로만 찾았다.
//   그 키는 브라우저 localStorage 에 있어서 —
//     · 손님이 폰 대신 PC로 들어오면 못 본다
//     · 앱 안 브라우저로 열면 못 본다
//     · 저장소를 지우면 못 본다
//   표에는 customer_phone 인덱스(idx_customer_site_alerts_phone_active)가 이미 있었는데
//   조회에서 쓰지 않고 있었다. 설계 의도와 구현이 어긋나 있던 것.
//   → 세션키 "또는" 전화번호로 찾는다. 숫자만 남겨 안전하게 쓴다.
const cleanPhone = (v: unknown) => {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 && d.length <= 11 ? d : "";
};

/** 세션키·전화번호 중 있는 것으로 대상을 좁힌다(둘 다 있으면 OR). */
function matchTarget<T extends { or: (f: string) => T; eq: (c: string, v: string) => T }>(
  query: T,
  sessionKey: string,
  phone: string,
): T {
  if (sessionKey && phone) return query.or(`target_session_key.eq.${sessionKey},customer_phone.eq.${phone}`);
  if (sessionKey) return query.eq("target_session_key", sessionKey);
  return query.eq("customer_phone", phone);
}

export async function GET(request: NextRequest) {
  try {
    const sessionKey = cleanSessionKey(request.nextUrl.searchParams.get("sessionKey"));
    const phone = cleanPhone(request.nextUrl.searchParams.get("phone"));
    if (!sessionKey && !phone) return NextResponse.json({ ok: true, alert: null, box: [], unread: 0 });
    const sb = getSupabaseAdmin();

    // [2026-08-30 사장님 요청] 쪽지함 — 팝업을 실수로 닫아도 다시 볼 수 있게.
    //   mode=box 면 최근 쪽지 목록을 준다(닫은 것 포함). 팝업 조회와 분리해서 가볍게 유지.
    if (request.nextUrl.searchParams.get("mode") === "box") {
      const { data: rows, error: boxError } = await matchTarget(
        sb
          .from("customer_site_alerts")
          .select("id,kind,title,message,created_at,expires_at,seen_at,dismissed_at") as any,
        sessionKey,
        phone,
      )
        .gt("expires_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30);

      if (boxError) return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
      const box = (rows || []) as Array<Record<string, unknown>>;
      const unread = box.filter((r) => !r.seen_at).length;
      return NextResponse.json({ ok: true, box, unread });
    }
    const { data, error } = await matchTarget(
      sb
        .from("customer_site_alerts")
        .select("id,kind,title,message,created_at,expires_at") as any,
      sessionKey,
      phone,
    )
      .eq("is_active", true)
      .is("dismissed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (data?.id) {
      // 읽음 표시 — 관리자 화면에서 "손님이 봤는지" 확인하는 근거가 된다.
      await sb.from("customer_site_alerts").update({ seen_at: new Date().toISOString() }).eq("id", data.id).is("seen_at", null);
    }
    return NextResponse.json({ ok: true, alert: data || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const sessionKey = cleanSessionKey(body?.sessionKey);
    const phone = cleanPhone(body?.phone);
    const id = Math.floor(Number(body?.id) || 0);
    if ((!sessionKey && !phone) || id <= 0) return NextResponse.json({ ok: false, error: "잘못된 알림 요청" }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await matchTarget(
      sb
        .from("customer_site_alerts")
        .update({ is_active: false, dismissed_at: new Date().toISOString() })
        .eq("id", id) as any,
      sessionKey,
      phone,
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
