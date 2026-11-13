import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { QUICK_PHRASES_KEY, readQuickPhrases } from "@/lib/liveChatQuickPhrases";
import { postOwnerLiveChat } from "@/lib/youtubeOwnerServer";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
// [2026-11-13] 자주 쓰는 말 → 유튜브 라이브 채팅(나야루루 이름). 관리자 로그인 또는 확인된 채팅 관리자만,
//   그리고 «저장된 자주 쓰는 말»과 똑같은 글만(아무 글이나 사장님 이름으로 못 올리게). 돈·주문 무접촉.
let lastAt = 0;
export async function POST(request: NextRequest) {
  try {
    if (!sameChatOrigin(request)) return reply({ ok: false, message: "다시 시도해 주세요." }, 403);
    let ok = !!(await verifyAdminSessionFromRequest(request));
    if (!ok) { const id = chatIdentityFromRequest(request); ok = id ? (await verifiedChatRole(getServiceClient(), id)).isMod : false; }
    if (!ok) return reply({ ok: false, message: "관리자 로그인 또는 채팅 본인 확인이 필요해요." }, 403);
    const text = String((await request.json().catch(() => null))?.text || "").trim();
    const { data } = await getServiceClient().from("settings").select("value").eq("key", QUICK_PHRASES_KEY).maybeSingle();
    if (!text || !readQuickPhrases(data?.value).includes(text)) return reply({ ok: false, message: "저장된 자주 쓰는 말만 보낼 수 있어요." }, 400);
    const now = Date.now();
    if (now - lastAt < 1200) return reply({ ok: false, message: "너무 빨리 눌렀어요. 잠깐 뒤 다시 눌러 주세요." }, 429);
    lastAt = now;
    const r = await postOwnerLiveChat(text);
    if (!r.ok) return reply({ ok: false, notConnected: !!r.notConnected, message: r.reason || "유튜브에 못 보냈어요." }, r.notConnected ? 409 : 502);
    return reply({ ok: true, message: "유튜브 채팅에 보냈어요" });
  } catch { return reply({ ok: false, message: "유튜브에 못 보냈어요. 다시 눌러 주세요." }, 503); }
}
