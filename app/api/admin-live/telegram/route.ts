import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getTelegramStatus, saveTelegramConfig, sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

// 관리자 전용: 텔레그램 알림 상태 조회 / 설정 저장 / 테스트 발송
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const status = await getTelegramStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String((body as any)?.action || "");

  try {
    if (action === "save") {
      await saveTelegramConfig({
        botToken: typeof (body as any)?.botToken === "string" ? (body as any).botToken : undefined,
        chatId: typeof (body as any)?.chatId === "string" ? (body as any).chatId : undefined,
        enabled: typeof (body as any)?.enabled === "boolean" ? (body as any).enabled : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "test") {
      const msg = String((body as any)?.message || "").trim() || "🔔 루루동이 텔레그램 알림 테스트입니다. 잘 도착했어요!";
      const r = await sendTelegram(msg, { forceEvenIfDisabled: true });
      return NextResponse.json({ ok: r.ok, skipped: r.skipped, reason: r.reason });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
