import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { pokeLiveSetting } from "@/lib/liveEvents";
import { SITE_PRODUCT_CARD_OFF_KEY, isSiteProductCardOff, siteProductCardValue } from "@/lib/liveSiteProductCard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => reply({ ok: false, message }, status);
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 관리자 로그인 또는 서버가 확인한 채팅 관리자만. 상품·순환·돈 무접촉 — settings 한 줄만 씀.
async function authorized(request: NextRequest) {
  if (await verifyAdminSessionFromRequest(request)) return true;
  const identity = chatIdentityFromRequest(request);
  return identity ? (await verifiedChatRole(getServiceClient(), identity)).isMod : false;
}
export async function GET(request: NextRequest) {
  const bc = request.nextUrl.searchParams.get("bc") || "";
  if (!uuid.test(bc)) return fail("방송을 선택해 주세요.");
  const { data, error } = await getServiceClient().from("settings").select("value").eq("key", SITE_PRODUCT_CARD_OFF_KEY).maybeSingle();
  if (error) return fail("설정을 읽지 못했어요.", 503);
  return reply({ ok: true, off: isSiteProductCardOff(data?.value, bc) });
}
export async function POST(request: NextRequest) {
  try {
    if (!sameChatOrigin(request) || !await authorized(request)) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const raw = await request.json();
    const bc = String(raw?.bc || ""), off = raw?.off === true;
    if (!uuid.test(bc)) return fail("방송을 선택해 주세요.");
    const { error } = await getServiceClient().from("settings").upsert([{ key: SITE_PRODUCT_CARD_OFF_KEY, value: siteProductCardValue(bc, off) }], { onConflict: "key" });
    if (error) return fail("저장하지 못했어요.", 503);
    await pokeLiveSetting("site_product_card");
    return reply({ ok: true, off, message: off ? "사이트 상품 카드를 껐어요" : "사이트 상품 카드를 켰어요" });
  } catch { return fail("저장하지 못했어요. 다시 시도해 주세요.", 503); }
}
