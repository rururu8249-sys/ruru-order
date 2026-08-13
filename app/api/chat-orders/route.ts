// app/api/chat-orders/route.ts
// [2026-08-14] 대기열 조회 + 읽기 ON/OFF 토글. 관리자 인증 필수.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SETTING_CHAT_READ_ENABLED } from "@/lib/youtubeChatRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const sb = sbAdmin();
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") || 100) || 100, 500);
    const day = new Date().toISOString().slice(0, 10);
    const rowsRes = await sb.from("chat_orders")
      .select("id,display_name,raw_message,published_at,parse_status")
      .order("id", { ascending: false }).limit(limit);
    const usageRes = await sb.from("youtube_api_usage").select("method,calls").eq("day", day);
    const setRes = await sb.from("settings").select("value").eq("key", SETTING_CHAT_READ_ENABLED).limit(1).maybeSingle();
    return NextResponse.json({
      ok: true,
      enabled: String((setRes.data as any)?.value ?? "") === "true",
      usage: usageRes.data || [],
      rows: rowsRes.data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message || e) } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const enabled = (body as any)?.enabled === true;
    const value = enabled ? "true" : "false";
    const sb = sbAdmin();
    const { data: exist } = await sb.from("settings").select("key").eq("key", SETTING_CHAT_READ_ENABLED).limit(1);
    if (Array.isArray(exist) && exist.length > 0) {
      await sb.from("settings").update({ value }).eq("key", SETTING_CHAT_READ_ENABLED);
    } else {
      await sb.from("settings").insert({ key: SETTING_CHAT_READ_ENABLED, value });
    }
    return NextResponse.json({ ok: true, enabled });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message || e) } }, { status: 500 });
  }
}
