import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

// 트렌드 추천 텍스트 저장/조회(settings 테이블, 비밀 아님). + 텔레그램 전송.
function svc(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function readSetting(sb: SupabaseClient, key: string): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return data ? String((data as any).value ?? "") : "";
}
async function writeSetting(sb: SupabaseClient, key: string, value: string): Promise<void> {
  const { data: existing } = await sb.from("settings").select("key").eq("key", key).limit(1);
  if (Array.isArray(existing) && existing.length > 0) await sb.from("settings").update({ value }).eq("key", key);
  else await sb.from("settings").insert({ key, value });
}

const KEY_TEXT = "trend_recommendation";
const KEY_AT = "trend_recommendation_at";

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sb = svc();
    const [text, updatedAt] = await Promise.all([readSetting(sb, KEY_TEXT), readSetting(sb, KEY_AT)]);
    return NextResponse.json({ ok: true, text, updatedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String((body as any)?.action || "save");
  try {
    const sb = svc();
    if (action === "save") {
      const text = String((body as any)?.text || "");
      await writeSetting(sb, KEY_TEXT, text);
      await writeSetting(sb, KEY_AT, new Date().toISOString());
      return NextResponse.json({ ok: true });
    }
    if (action === "send-telegram") {
      const text = await readSetting(sb, KEY_TEXT);
      if (!text.trim()) return NextResponse.json({ ok: false, reason: "추천 내용이 비어있어요" });
      const r = await sendTelegram(`📈 <b>오늘의 트렌드 추천</b>\n\n${text}`, { forceEvenIfDisabled: true });
      return NextResponse.json({ ok: r.ok, skipped: r.skipped, reason: r.reason });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
