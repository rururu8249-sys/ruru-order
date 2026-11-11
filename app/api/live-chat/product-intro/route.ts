import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { loadChatCommandProducts } from "@/lib/liveChatProductCommandServer";
import { readProductIntro } from "@/lib/productIntroServer";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import { normalizeWidgetTarget, widgetTargetKey } from "@/lib/widgetProductLibrary";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bc = params.get("bc") || "";
  const videoId = params.get("video") || "";
  const target = normalizeWidgetTarget({ productId: params.get("product"), detailName: params.get("detail") || "" });
  const reply = (intro: unknown, status = 200) => NextResponse.json({ intro }, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[\da-f-]{36}$/i.test(bc) || !/^[\w-]{11}$/.test(videoId) || !target) return reply(null, 400);
  try {
    const sb = getServiceClient();
    const broadcast = await sb.from("broadcasts").select("status,youtube_live_url").eq("id", bc).maybeSingle();
    if (broadcast.error) return reply(null, 503);
    const row = broadcast.data;
    if (!row || row.status !== "ON" || youtubeVideoIdFromUrl(String(row.youtube_live_url || "")) !== videoId) return reply(null);
    const catalog = await loadChatCommandProducts(sb, bc);
    if (!catalog.some(p => widgetTargetKey(p) === widgetTargetKey(target))) return reply(null);
    return reply(await readProductIntro(sb, bc, videoId, target));
  } catch { return reply(null, 503); }
}
