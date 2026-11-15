import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeEmojiTokens } from "./liveChatEmoji";
import { readEmojiSetting } from "./liveChatEmojiServer";
import { hashOf, siteEmojiText, varyTailAgainst } from "./liveAutomationLines";

// DB live_automation_chat 이 거절하는 말(같은 규칙) — 이모티콘 이름 때문에 글이 막히면 이모티콘 없이 보냄
const DB_REJECT = /(테스트|\btest\b|\bAI\b|API|프롬프트|한도|시스템|결제.{0,3}완료|입금.{0,3}완료|https?:\/\/)/i;

/**
 * [2026-11-15 18:57 사장님] 가상 손님 글 마무리 — 서버(모든 가상 손님 글이 지나는 곳)에서 한 번.
 * ① 바로 앞 가상 손님 글 2개와 끝맺음(:) ^^ ~ 이모지…)이 같으면 다른 끝맺음
 * ② 기본 유니코드 이모지 → 사장님이 등록한 사이트 이모티콘(켜진 것만)
 * 실패하면 글 그대로(채팅은 막지 않음). 돈·주문 무관.
 */
export async function automationChatBody(sb: SupabaseClient, bc: string | number, actorId: string, body: string): Promise<string> {
  let text = body;
  try {
    const { data } = await sb.from("live_chat_messages").select("body").eq("broadcast_id", bc).not("automation_actor_id", "is", null).is("hidden_at", null).order("id", { ascending: false }).limit(2);
    const prev = (data || []).map((r) => String((r as { body?: unknown }).body || ""));
    text = varyTailAgainst(text, prev, hashOf(actorId + ":" + body));
  } catch { /* 앞 글 못 읽음 — 그대로 */ }
  try {
    const setting = await readEmojiSetting(sb);
    const on = setting.items.filter((e) => e.on);
    if (!on.length) return text;
    const withNames = siteEmojiText(text, on.map((e) => e.name), hashOf("actor:" + actorId), hashOf(text + actorId));
    const encoded = encodeEmojiTokens(withNames, on).text;
    if (encoded.trim().length >= 1 && encoded.trim().length <= 100 && !DB_REJECT.test(encoded)) return encoded;
    return text.replace(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu, "").replace(/\s{2,}/g, " ").trim() || text;
  } catch {
    return text;
  }
}
