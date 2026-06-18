import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  getConnectionStatus,
  saveNotifySettings,
  postLiveChatMessage,
  getYoutubeDiag,
} from "@/lib/youtube";

export const runtime = "nodejs";

// 관리자 전용: 유튜브 알림 상태 조회 / 설정 저장 / 테스트 발송
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const status = await getConnectionStatus();
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
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
      const _dbg = await getYoutubeDiag(); // 연결된 채널/소유자 활성방송 chatId 진단
      const reason = result.ok ? result.reason : `${result.reason || ""} | 연결채널=${(_dbg as any)?.channel?.title || "?"} 영상=${(_dbg as any)?.videoId || "?"} 그영상챗=${(_dbg as any)?.idChatId || "?"} videos챗=${(_dbg as any)?.videosChatId || "?"}`;
      return NextResponse.json({ ok: result.ok, skipped: result.skipped, reason, _dbg });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
