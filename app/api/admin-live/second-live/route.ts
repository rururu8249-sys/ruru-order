// [2026-11-06 사장님 「두 채널 다 채팅 주문글 안내」·「방송화면 두 개면 정신없다」]
//   두 번째 채널(동시 방송) 라이브 URL — 주문 알림 채팅만 거기에도 올린다. 관리자 화면 영상·채팅은 메인 URL 그대로.
//   관리자만(middleware + verifyAdminSession). settings 한 칸(youtube_second_live_v1)만 쓴다. 주문·입금·돈 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  SETTING_SECOND_LIVE,
  extractVideoId,
  getAccessToken,
  getServiceClient,
  readActiveBroadcastId,
  readActiveBroadcastLiveUrl,
  readRefreshToken,
  readSecondLive,
  resolveVideoLiveChatId,
  writeSetting,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const cfg = await readSecondLive(getServiceClient());
    return NextResponse.json({ ok: true, url: cfg?.url || "", chatFound: Boolean(cfg?.chatId) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || "불러오기 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim().slice(0, 300);
    const sb = getServiceClient();
    if (!url) {
      await writeSetting(sb, SETTING_SECOND_LIVE, "");
      return NextResponse.json({ ok: true, url: "", chatFound: false, message: "두 번째 채널을 껐어요." });
    }
    const broadcastId = await readActiveBroadcastId(sb);
    if (!broadcastId) return NextResponse.json({ ok: false, message: "방송을 시작한 뒤에 넣어 주세요." }, { status: 400 });
    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ ok: false, message: "유튜브 라이브 주소가 아니에요." }, { status: 400 });
    const mainVideo = extractVideoId(await readActiveBroadcastLiveUrl(sb));
    if (mainVideo && mainVideo === videoId) return NextResponse.json({ ok: false, message: "위 메인 라이브 URL 과 같은 영상이에요." }, { status: 400 });
    let chatId = "";
    const refreshToken = await readRefreshToken(sb);
    if (refreshToken) chatId = await resolveVideoLiveChatId(await getAccessToken(refreshToken), videoId);
    await writeSetting(sb, SETTING_SECOND_LIVE, JSON.stringify({ broadcastId, url, videoId, chatId }));
    return NextResponse.json({
      ok: true,
      url,
      chatFound: Boolean(chatId),
      message: chatId ? "두 번째 채널 채팅방을 찾았어요. 주문 알림이 두 채널에 올라가요." : "저장했어요. 아직 채팅방을 못 찾았어요(라이브 시작 전이면 시작 후 첫 주문 때 다시 찾아요).",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || "저장 실패" }, { status: 500 });
  }
}
