import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { QUICK_PHRASES_KEY, cleanQuickPhrases, readQuickPhrases } from "@/lib/liveChatQuickPhrases";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => reply({ ok: false, message }, status);
// [2026-11-13] 사이트 채팅 «자주 쓰는 말» — 관리자 로그인 또는 서버가 확인한 채팅 관리자만. settings 한 줄만 씀(돈·주문 무접촉).
async function authorized(request: NextRequest) {
  if (await verifyAdminSessionFromRequest(request)) return true;
  const identity = chatIdentityFromRequest(request);
  return identity ? (await verifiedChatRole(getServiceClient(), identity)).isManager : false;
}
export async function GET(request: NextRequest) {
  try {
    if (!await authorized(request)) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const { data, error } = await getServiceClient().from("settings").select("value").eq("key", QUICK_PHRASES_KEY).maybeSingle();
    if (error) return fail("자주 쓰는 말을 읽지 못했어요.", 503);
    return reply({ ok: true, phrases: readQuickPhrases(data?.value) });
  } catch { return fail("자주 쓰는 말을 읽지 못했어요.", 503); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameChatOrigin(request) || !await authorized(request)) return fail("관리자 로그인 또는 채팅 본인 확인이 필요해요.", 403);
    const raw = await request.json();
    if (!Array.isArray(raw?.phrases)) return fail("저장할 말이 없어요.");
    const phrases = cleanQuickPhrases(raw.phrases);
    const { error } = await getServiceClient().from("settings").upsert([{ key: QUICK_PHRASES_KEY, value: JSON.stringify(phrases) }], { onConflict: "key" });
    if (error) return fail("저장하지 못했어요.", 503);
    return reply({ ok: true, phrases, message: "자주 쓰는 말을 저장했어요" });
  } catch { return fail("저장하지 못했어요. 다시 시도해 주세요.", 503); }
}
