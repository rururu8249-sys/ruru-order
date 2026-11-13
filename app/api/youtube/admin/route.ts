import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  getConnectionStatus,
  getYoutubeDiag,
  saveNotifySettings,
  postLiveChatMessage,
  getServiceClient,
} from "@/lib/youtube";
import { readYoutubeOwner } from "@/lib/youtubeOwnerServer";

export const runtime = "nodejs";

// 관리자 전용: 유튜브 알림 상태 조회 / 설정 저장 / 테스트 발송
export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const status = await getConnectionStatus();
  // [2026-11-13] 자주 쓰는 말 유튜브 보내기용 «채널 주인» 계정 — 연결 여부·채널 이름만(토큰은 안 내보냄)
  const owner = await readYoutubeOwner(getServiceClient()).catch(() => null);
  const ownerInfo = { ownerConnected: !!owner, ownerChannel: owner?.channelTitle || "" };
  // [2026-11-09] ?diag=1 → 연결된 구글 계정이 «어느 채널»인지·이 방송을 소유자로 읽히는지(읽기만). 방송 중 제목 바꾸기 가능 여부 확인용.
  if (request.nextUrl.searchParams.get("diag") === "1") {
    const diag = await getYoutubeDiag();
    return NextResponse.json({ ok: true, ...status, ...ownerInfo, diag });
  }
  return NextResponse.json({ ok: true, ...status, ...ownerInfo });
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
      return NextResponse.json({ ok: result.ok, skipped: result.skipped, reason: result.reason });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
