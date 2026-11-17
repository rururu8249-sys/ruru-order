import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers:{ "Cache-Control":"private, no-store" } });

export async function GET(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) return reply({ok:false,message:"관리자 로그인이 필요해요."},401);
  const broadcastId = request.nextUrl.searchParams.get("broadcastId") || "";
  if (!uuid.test(broadcastId)) return reply({ok:false,message:"정확한 방송을 골라 주세요."},400);
  try {
    const sb = getServiceClient();
    const {data,error} = await sb.from("broadcast_work_periods")
      .select("id,broadcast_id,started_at,ended_at,source")
      .eq("broadcast_id",broadcastId).order("started_at",{ascending:true});
    if (error) return reply({ok:false,message:"방송 구간을 읽지 못했어요."},503);
    return reply({ok:true,periods:data||[]});
  } catch { return reply({ok:false,message:"구간을 읽지 못했어요. 다시 열어 주세요."},503); }
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSessionFromRequest(request)) return reply({ok:false,message:"관리자 로그인이 필요해요."},401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ok:false,message:"요청 출처를 확인해 주세요."},403);
  const body = await request.json().catch(() => null);
  const broadcastId = String(body?.broadcastId || "");
  if (body?.action === "manualSplit") {
    const splitAt = String(body?.splitAt || "");
    if (!uuid.test(broadcastId) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(splitAt) || !Number.isFinite(Date.parse(splitAt)))
      return reply({ok:false,message:"한국시간 기준 구분 시각을 정확하게 입력해 주세요."},400);
    try {
      const { data, error } = await getServiceClient().rpc("ruru_admin_split_broadcast_work_period", {
        p_broadcast_id: broadcastId, p_split_at: splitAt,
      });
      if (error) return reply({ok:false,message:error.message},409);
      return reply({ok:true,data});
    } catch { return reply({ok:false,message:"작업 구간을 나누지 못했어요."},503); }
  }
  if (!uuid.test(broadcastId) || typeof body?.paused !== "boolean") return reply({ok:false,message:"방송 및 일시정지 상태를 확인해 주세요."},400);
  try {
    const {data,error}=await getServiceClient().rpc("ruru_admin_set_broadcast_pause_period",{
      p_broadcast_id:broadcastId,p_paused:body.paused
    });
    if (error) return reply({ok:false,message:error.message},503);
    return reply({ok:true,data});
  } catch { return reply({ok:false,message:"방송 상태를 저장하지 못했어요."},503); }
}
