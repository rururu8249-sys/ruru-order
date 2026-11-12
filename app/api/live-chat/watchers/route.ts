// [2026-11-12 사장님 22:34] 방송 화면 «지금 보는 사람» 목록 — 관리자 로그인 또는 서버가 확인한 채팅 관리자만. 읽기만.
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, verifiedChatRole } from "@/lib/liveChatSession";
import { readLiveWatcherList } from "@/lib/liveAudienceServer";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorized(request: NextRequest) {
  if (await verifyAdminSessionFromRequest(request)) return true;
  const identity = chatIdentityFromRequest(request);
  return identity ? (await verifiedChatRole(getServiceClient(), identity)).isMod : false;
}
export async function GET(request: NextRequest) {
  try {
    if (!await authorized(request)) return reply({ ok: false, message: "관리자 로그인 또는 채팅 본인 확인이 필요해요." }, 403);
    return reply({ ok: true, ...(await readLiveWatcherList(getServiceClient())) });
  } catch {
    return reply({ ok: false, message: "목록을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요." }, 503);
  }
}
