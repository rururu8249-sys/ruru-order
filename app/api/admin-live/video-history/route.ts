import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import { loadBroadcastVideoHistory, replaceBroadcastVideo, VideoHistoryConflict } from "@/lib/broadcastVideoHistoryServer";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{"Cache-Control":"no-store"}});
export async function GET(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) return reply({error:"관리자 로그인이 필요합니다."},401);
  try { return reply({items: await loadBroadcastVideoHistory(getServiceClient())}); }
  catch { return reply({error:"지난 영상을 불러오지 못했어요. 다시 시도해 주세요."},503); }
}
export async function POST(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) return reply({error:"관리자 로그인이 필요합니다."},401);
  const body = await request.json().catch(()=>null);
  if (!body || typeof body.broadcastId !== "string" || !/^[\da-f-]{36}$/i.test(body.broadcastId) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 500 || typeof body.youtubeUrl !== "string" || body.youtubeUrl.length > 2048 || (body.youtubeUrl.trim() && !youtubeVideoIdFromUrl(body.youtubeUrl)) || typeof body.expectedUrl !== "string" || body.expectedUrl.length > 2048) return reply({error:"방송 제목과 유튜브 영상 주소를 확인해 주세요."},400);
  try {
    const data = await replaceBroadcastVideo(getServiceClient(),{broadcastId:body.broadcastId,title:body.title.trim(),youtubeUrl:body.youtubeUrl.trim(),expectedUrl:body.expectedUrl});
    return reply({data});
  } catch(error) {
    return reply({error:error instanceof Error ? error.message : "영상을 저장하지 못했어요."},error instanceof VideoHistoryConflict ? 409 : 503);
  }
}
