import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest, adminAuthErrorMessage } from "@/lib/adminAuth";
import {
  getConnectionStatus,
  saveLiveUrl,
  saveNotifySettings,
  postLiveChatMessage,
} from "@/lib/youtube";

export const runtime = "nodejs";

// 관리자 전용: 유튜브 알림 상태 조회 / 라이브 URL 저장 / 설정 저장 / 테스트 발송
export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: adminAuthErrorMessage(auth) }, { status: 401 });
  const status = await getConnectionStatus();
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: adminAuthErrorMessage(auth) }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "save-url") {
      await saveLiveUrl(String(body?.liveUrl || ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "save-settings") {
      await saveNotifySettings({
        notifyEnabled: typeof body?.notifyEnabled === "boolean" ? body.notifyEnabled : undefined,
        messageTemplate: typeof body?.messageTemplate === "string" ? body.messageTemplate : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "test") {
      const msg = String(body?.message || "").trim() || "🛒 루루동이 알림 테스트입니다";
      const result = await postLiveChatMessage(msg, { forceEvenIfDisabled: true });
      return NextResponse.json({ ok: result.ok, skipped: result.skipped, reason: result.reason });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
