import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { loadChatCommandProducts, applyProductRotation } from "@/lib/liveChatProductCommandServer";
import { readProductIntroIndex, productIntroKey, saveProductIntros } from "@/lib/productIntroServer";
import { validateIntroCapture } from "@/lib/productIntro";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import { parseChatProductSelection } from "@/lib/liveChatProductCommand";
import { widgetTargetKey } from "@/lib/widgetProductLibrary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => reply({ ok: false, message }, status);
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
async function authorized(request: NextRequest) {
  if (await verifyAdminSessionFromRequest(request)) return true;
  const identity = chatIdentityFromRequest(request);
  return identity ? (await verifiedChatRole(getServiceClient(), identity)).isMod : false;
}
async function broadcast(sb: ReturnType<typeof getServiceClient>, bc: string) {
  const result = await sb.from("broadcasts").select("status,is_deleted,youtube_live_url,widget_card_enabled").eq("id", bc).maybeSingle();
  if (result.error) throw new Error("방송 정보를 확인하지 못했어요.");
  return result.data && !result.data.is_deleted ? result.data : null;
}
export async function GET(request: NextRequest) {
  try {
    if (!await authorized(request)) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const bc = request.nextUrl.searchParams.get("bc") || "";
    if (!uuid.test(bc)) return fail("방송을 선택해 주세요.");
    const sb = getServiceClient(), row = await broadcast(sb, bc);
    if (!row) return fail("방송을 찾지 못했어요.", 404);
    const videoId = youtubeVideoIdFromUrl(String(row.youtube_live_url || ""));
    const [items, records] = await Promise.all([loadChatCommandProducts(sb, bc), videoId ? readProductIntroIndex(sb, bc, videoId) : Promise.resolve(new Map())]);
    return reply({ ok: true, videoId, widgetAvailable: row.status === "ON" && row.widget_card_enabled !== false,
      items: items.map(item => ({ ...item, intro: records.get(productIntroKey(bc, videoId, item)) ?? null })) });
  } catch { return fail("상품 정보를 불러오지 못했어요. 다시 시도해 주세요.", 503); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameChatOrigin(request) || !await authorized(request)) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const raw = await request.json();
    const bc = String(raw.bc || ""), action = raw.action;
    const selection = parseChatProductSelection({ targets: raw.targets, mode: "replace" });
    if (!uuid.test(bc) || !selection || !["register", "change", "rotate", "append"].includes(action)) return fail("상품과 작업을 확인해 주세요.");
    const sb = getServiceClient(), row = await broadcast(sb, bc);
    if (!row) return fail("방송을 찾지 못했어요.", 404);
    const videoId = youtubeVideoIdFromUrl(String(row.youtube_live_url || ""));
    if (raw.videoId !== videoId) return fail("방송 영상이 바뀌었어요. 창을 다시 열어 주세요.", 409);
    const catalog = await loadChatCommandProducts(sb, bc);
    const selected = selection.targets.map(t => catalog.find(p => widgetTargetKey(p) === widgetTargetKey(t)));
    if (selected.some(p => !p)) return fail("현재 방송 상품이 아닌 항목이 있어요. 창을 다시 열어 주세요.");
    if (action === "rotate" || action === "append") {
      if (row.status !== "ON" || row.widget_card_enabled === false) return fail("방송과 상품 위젯을 켠 뒤 사용할 수 있어요.", 409);
      if (selected.some(p => p?.soldOut)) return fail("품절 상품은 위젯에 표시할 수 없어요.");
      await applyProductRotation(sb, bc, catalog, selection.targets, action === "append" ? "append" : "replace");
      return reply({ ok: true, message: action === "append" ? "기존 순환에 추가했어요. 소개영상 위치는 그대로예요." : `${selection.targets.length === 1 ? "선택 상품을 고정했어요" : `선택한 ${selection.targets.length}개 상품을 순환해요`}. 소개영상 위치는 그대로예요.` });
    }
    const capture = validateIntroCapture(raw.capture, videoId);
    if (!capture) return fail("영상 위치를 확인하지 못했어요. 영상을 열거나 시·분·초를 직접 입력해 주세요.");
    const result = await saveProductIntros(sb, bc, selection.targets, capture, action === "change" ? "replace" : "first");
    return reply({ ok: true, ...result, message: `${result.saved}개 소개영상 ${action === "change" ? "위치 변경" : "등록"} 완료${result.kept ? ` · 기존 ${result.kept}개 위치 유지` : ""}` });
  } catch { return fail("저장하지 못했어요. 현재 상태를 다시 확인해 주세요.", 503); }
}
