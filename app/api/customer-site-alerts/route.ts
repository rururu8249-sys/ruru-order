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

export async function GET(request: NextRequest) {
  try {
    const sessionKey = cleanSessionKey(request.nextUrl.searchParams.get("sessionKey"));
    if (!sessionKey) return NextResponse.json({ ok: true, alert: null });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("customer_site_alerts")
      .select("id,kind,title,message,created_at,expires_at")
      .eq("target_session_key", sessionKey)
      .eq("is_active", true)
      .is("dismissed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (data?.id) {
      await sb.from("customer_site_alerts").update({ seen_at: new Date().toISOString() }).eq("id", data.id).eq("target_session_key", sessionKey).is("seen_at", null);
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
    const id = Math.floor(Number(body?.id) || 0);
    if (!sessionKey || id <= 0) return NextResponse.json({ ok: false, error: "잘못된 알림 요청" }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("customer_site_alerts")
      .update({ is_active: false, dismissed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("target_session_key", sessionKey);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
