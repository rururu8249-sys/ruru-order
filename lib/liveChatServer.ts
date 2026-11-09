// [2026-11-10] 사이트 채팅 — 서버 공용(지우기·금지·관리 권한 확인). service_role 클라이언트로만 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { penaltyUntil, type LiveChatPenalty } from "@/lib/liveChat";
import { LIVE_WATCH_KEY, parseLiveWatchSetting } from "@/lib/liveWatch";

export const LIVE_CHAT_PENALTIES: LiveChatPenalty[] = ["hide", "mute30s", "mute5m", "ban"];
const LABEL: Record<LiveChatPenalty, string> = {
  hide: "지웠어요",
  mute30s: "지우고 30초 금지했어요",
  mute5m: "지우고 5분 금지했어요",
  ban: "지우고 채팅 차단했어요",
};

/** 이 카카오 계정이 채팅 관리자인지 — 관리자 시험 계정 표(켜진 것) 또는 「방송 보며 주문」 허용 번호 */
export async function isChatModeratorKakao(sb: SupabaseClient, kakaoId: string): Promise<boolean> {
  if (!kakaoId) return false;
  const { data: cust } = await sb.from("customers").select("customer_phone").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const phone = String((cust as { customer_phone?: string } | null)?.customer_phone ?? "").replace(/[^0-9]/g, "");
  if (!phone) return false;
  const { data: ops } = await sb.from("operator_test_accounts").select("customer_phone, is_active").eq("is_active", true);
  if ((ops ?? []).some((o) => String((o as { customer_phone?: string }).customer_phone ?? "").replace(/[^0-9]/g, "") === phone)) return true;
  const { data: st } = await sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle();
  return parseLiveWatchSetting((st as { value?: unknown } | null)?.value).phones.includes(phone);
}

/** 글 지우기(+ 그 손님 잠깐 금지/차단). 결과 문구를 돌려준다. */
export async function moderateChatMessage(sb: SupabaseClient, messageId: number, p: LiveChatPenalty): Promise<{ ok: boolean; message: string; status?: number }> {
  const { data: msg } = await sb.from("live_chat_messages").select("id, kakao_id, nickname").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "글을 못 찾았어요.", status: 404 };
  const kakaoId = String((msg as { kakao_id: string }).kakao_id);
  const nickname = String((msg as { nickname: string }).nickname ?? "");
  const { error: hideErr } = await sb
    .from("live_chat_messages")
    .update({ hidden_at: new Date().toISOString(), hidden_by: "admin" })
    .eq("id", messageId)
    .is("hidden_at", null);
  if (hideErr) return { ok: false, message: "못 지웠어요.", status: 500 };
  const until = penaltyUntil(p);
  if (until !== undefined) {
    const { error: banErr } = await sb.from("live_chat_bans").insert({ kakao_id: kakaoId, nickname, until_at: until, reason: p });
    if (banErr) return { ok: true, message: "지웠어요. 금지는 저장 못 했어요." };
  }
  return { ok: true, message: LABEL[p] };
}
