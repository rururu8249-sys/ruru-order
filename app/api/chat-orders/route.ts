// app/api/chat-orders/route.ts
// [2026-08-14] 대기열 조회 + 읽기 ON/OFF 토글. 관리자 인증 필수.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SETTING_CHAT_READ_ENABLED, SETTING_TEST_LIVE_URL } from "@/lib/youtubeChatRead";

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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sb = sbAdmin();

    const put = async (key: string, value: string) => {
      const { data: exist } = await sb.from("settings").select("key").eq("key", key).limit(1);
      if (Array.isArray(exist) && exist.length > 0) {
        await sb.from("settings").update({ value }).eq("key", key);
      } else {
        await sb.from("settings").insert({ key, value });
      }
    };

    const out: Record<string, unknown> = { ok: true };
    if (typeof body.enabled === "boolean") {
      await put(SETTING_CHAT_READ_ENABLED, body.enabled ? "true" : "false");
      out.enabled = body.enabled;
    }
    // 테스트 라이브 URL: 값이 있으면 「방송시작」 없이 그 URL의 채팅만 읽는다(손님 화면 무변화).
    // 빈 문자열을 보내면 해제되고 다시 방송 ON 기준으로 돌아간다.
    if (typeof body.testLiveUrl === "string") {
      await put(SETTING_TEST_LIVE_URL, String(body.testLiveUrl).trim());
      await put("chat_order_chat_id", "");
      await put("chat_order_page_token", "");
      out.testLiveUrl = String(body.testLiveUrl).trim();
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message || e) } }, { status: 500 });
  }
}
