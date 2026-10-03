import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  WIDGET_PRODUCT_HISTORY_SETTING_KEY,
  mergeWidgetHistory,
  parseWidgetHistory,
  parseWidgetLibraryRequest,
  parseWidgetRotation,
  recordWidgetHistory,
  removeWidgetHistory,
  widgetRotationSettingKey,
  type WidgetHistoryEntry,
} from "@/lib/widgetProductLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type AdminClient = ReturnType<typeof getSupabaseAdmin>;

async function readSetting(sb: AdminClient, key: string): Promise<string | null> {
  const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.value === "string" ? data.value : null;
}

async function writeSetting(sb: AdminClient, key: string, value: unknown) {
  const { error } = await sb.from("settings").upsert(
    { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

async function readHistory(sb: AdminClient): Promise<WidgetHistoryEntry[]> {
  return parseWidgetHistory(await readSetting(sb, WIDGET_PRODUCT_HISTORY_SETTING_KEY));
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const broadcastId = String(request.nextUrl.searchParams.get("broadcastId") || "").trim();
    if (broadcastId && !UUID_RE.test(broadcastId)) {
      return NextResponse.json({ ok: false, error: "잘못된 방송 ID입니다." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const [historyValue, rotationValue] = await Promise.all([
      readSetting(sb, WIDGET_PRODUCT_HISTORY_SETTING_KEY),
      broadcastId ? readSetting(sb, widgetRotationSettingKey(broadcastId)) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      history: parseWidgetHistory(historyValue),
      rotation: parseWidgetRotation(rotationValue),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "위젯 상품 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const parsed = parseWidgetLibraryRequest(await request.json().catch(() => null));
    if (!parsed) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });

    const sb = getSupabaseAdmin();
    if (parsed.action === "saveRotation") {
      await writeSetting(sb, widgetRotationSettingKey(parsed.broadcastId), parsed.rotation);
      return NextResponse.json({ ok: true, rotation: parsed.rotation });
    }

    const current = await readHistory(sb);
    const history = parsed.action === "merge"
      ? mergeWidgetHistory(current, parsed.entries)
      : parsed.action === "record"
        ? recordWidgetHistory(current, { ...parsed.target, label: parsed.label })
        : removeWidgetHistory(current, parsed.target);
    await writeSetting(sb, WIDGET_PRODUCT_HISTORY_SETTING_KEY, history);
    return NextResponse.json({ ok: true, history });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "위젯 상품 목록을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
