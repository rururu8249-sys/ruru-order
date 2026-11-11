import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { loadChatCommandProducts } from "@/lib/liveChatProductCommandServer";
import { readProductIntro, readProductIntroIndex, productIntroKey } from "@/lib/productIntroServer";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import { normalizeWidgetTarget, widgetTargetKey } from "@/lib/widgetProductLibrary";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bc = params.get("bc") || "";
  const videoId = params.get("video") || "";
  const all = params.get("all") === "1";
  const target = normalizeWidgetTarget({ productId: params.get("product"), detailName: params.get("detail") || "" });
  const reply = (intro: unknown, status = 200) => NextResponse.json(all ? { items: intro ?? [] } : { intro }, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[\da-f-]{36}$/i.test(bc) || !/^[\w-]{11}$/.test(videoId) || (!all && !target)) return reply(null, 400);
  try {
    const sb = getServiceClient();
    if (all) {
      const [broadcast, catalog, records] = await Promise.all([
        sb.from("broadcasts").select("status,youtube_live_url").eq("id", bc).maybeSingle(),
        loadChatCommandProducts(sb, bc), readProductIntroIndex(sb, bc, videoId),
      ]);
      if (broadcast.error) return reply(null, 503);
      if (!broadcast.data || broadcast.data.status !== "ON" || youtubeVideoIdFromUrl(String(broadcast.data.youtube_live_url || "")) !== videoId) return reply(null);
      return reply(catalog.flatMap(({productId, detailName}) => {
        const intro = records.get(productIntroKey(bc, videoId, {productId, detailName}));
        return intro ? [{productId, detailName, intro}] : [];
      }));
    }
    if (!target) return reply(null, 400);
    const broadcast = await sb.from("broadcasts").select("status,youtube_live_url").eq("id", bc).maybeSingle();
    if (broadcast.error) return reply(null, 503);
    const row = broadcast.data;
    if (!row || row.status !== "ON" || youtubeVideoIdFromUrl(String(row.youtube_live_url || "")) !== videoId) return reply(null);
    const catalog = await loadChatCommandProducts(sb, bc);
    if (!catalog.some(p => widgetTargetKey(p) === widgetTargetKey(target))) return reply(null);
    return reply(await readProductIntro(sb, bc, videoId, target));
  } catch { return reply(null, 503); }
}
