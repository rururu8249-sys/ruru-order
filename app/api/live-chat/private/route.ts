import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { CHAT_TEMP_ID_BASE, parseChatMessage } from "@/lib/liveChat";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, X-Chat-Account, X-Chat-Session" } });
const fail = (message: string, status: number) => json({ ok: false, message }, status);
const columns = "id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, avatar_url, bot_ref";

export async function GET(request: NextRequest) {
  const bc = request.nextUrl.searchParams.get("bc") || "";
  if (!UUID.test(bc)) return fail("방송 정보가 없어요.", 400);
  try {
    const identity = chatIdentityFromRequest(request);
    const admin = await verifyAdminSessionFromRequest(request);
    if (!identity && !admin) return fail("내 글 삭제와 삭제글 확인은 카카오 본인 확인 후 사용할 수 있어요.", 401);
    const sb = getServiceClient();
    const role = admin ? { isMod: true } : await verifiedChatRole(sb, identity);
    const [own, deleted, hidden] = await Promise.all([
      identity ? sb.from("live_chat_messages").select("id").eq("broadcast_id", bc).eq("kakao_id", identity.sub).is("hidden_at", null).order("id", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
      role.isMod ? sb.from("live_chat_messages").select(columns).eq("broadcast_id", bc).eq("hidden_by", "author").not("hidden_at", "is", null).order("id", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
      sb.from("live_chat_messages").select("id").eq("broadcast_id", bc).not("hidden_at", "is", null).order("id", { ascending: false }).limit(200),
    ]);
    if (own.error || deleted.error || hidden.error) return fail("채팅 권한 정보를 불러오지 못했어요.", 503);
    // Only this authenticated response may contain original deleted bodies.
    const deletedMessages = (deleted.data ?? []).map(row => {
      const message = parseChatMessage({ ...row, hidden_at: null, pinned_at: null });
      return message ? { ...message, deletedByAuthor: true } : null;
    }).filter(Boolean);
    return json({ ok: true, verified: Boolean(identity), canReviewDeleted: role.isMod, ownIds: (own.data ?? []).map(r => r.id), hiddenIds: (hidden.data ?? []).map(r => r.id), deletedMessages });
  } catch { return fail("채팅 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}

export async function DELETE(request: NextRequest) {
  if (!sameChatOrigin(request)) return fail("잘못된 요청입니다.", 403);
  const identity = chatIdentityFromRequest(request);
  if (!identity) return fail("카카오 본인 확인 후 내 글을 삭제할 수 있어요.", 401);
  try {
    const raw = await request.json();
    const id = Number(raw.messageId);
    const bc = String(raw.bc || "");
    if (!Number.isSafeInteger(id) || id <= 0 || id >= CHAT_TEMP_ID_BASE || !UUID.test(bc)) return fail("글 번호를 확인해 주세요.", 400);
    const sb = getServiceClient();
    const found = await sb.from("live_chat_messages").select("id, hidden_at, badge").eq("id", id).eq("broadcast_id", bc).eq("kakao_id", identity.sub).maybeSingle();
    if (found.error) return fail("글을 확인하지 못했어요.", 503);
    if (!found.data || found.data.badge === "bot") return fail("본인이 쓴 글만 삭제할 수 있어요.", 403);
    if (!found.data.hidden_at) {
      const saved = await sb.from("live_chat_messages").update({ hidden_at: new Date().toISOString(), hidden_by: "author", pinned_at: null })
        .eq("id", id).eq("broadcast_id", bc).eq("kakao_id", identity.sub).is("hidden_at", null);
      if (saved.error) return fail("삭제하지 못했어요. 다시 시도해 주세요.", 503);
    }
    return json({ ok: true, message: "내 글을 삭제했어요." });
  } catch { return fail("삭제하지 못했어요.", 503); }
}
