// [2026-11-10] 사이트 채팅 — 서버 공용(지우기·금지·관리 권한 확인). service_role 클라이언트로만 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { penaltyUntil, type LiveChatPenalty } from "@/lib/liveChat";
import { LIVE_WATCH_KEY, parseLiveWatchSetting } from "@/lib/liveWatch";
import { buildBlockReason } from "@/lib/customerBlockReason";
import { koreanPhoneVariants } from "@/lib/order/phone";

export const LIVE_CHAT_PENALTIES: LiveChatPenalty[] = ["hide", "mute30s", "mute5m", "ban"];
const LABEL: Record<LiveChatPenalty, string> = {
  hide: "지웠어요",
  mute30s: "지우고 30초 금지했어요",
  mute5m: "지우고 5분 금지했어요",
  ban: "지우고 사이트 접속을 차단했어요",
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
  const { data: msg } = await sb.from("live_chat_messages").select("id, kakao_id, nickname, body").eq("id", messageId).maybeSingle();
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
  if (p === "ban") {
    // 사이트 접속 차단 — 고객 › 회원 차단과 같은 두 곳(customers.is_blocked + customer_phone_blocks). 풀기는 회원 목록 「차단해제」.
    const r = await blockCustomerSite(sb, kakaoId, String((msg as { body?: string }).body ?? ""));
    // 그 손님의 이 방송 다른 글도 지움(트리거가 화면에서 빼라고 알림)
    await sb.from("live_chat_messages").update({ hidden_at: new Date().toISOString(), hidden_by: "admin" }).eq("kakao_id", kakaoId).is("hidden_at", null);
    if (!r) return { ok: true, message: "지웠어요. 사이트 차단은 저장 못 했어요 — 회원 목록에서 차단해 주세요." };
  }
  return { ok: true, message: LABEL[p] };
}

/** 카카오 계정 → 회원 전화번호로 사이트 접속 차단. 성공하면 true. */
async function blockCustomerSite(sb: SupabaseClient, kakaoId: string, body: string): Promise<boolean> {
  if (await isChatModeratorKakao(sb, kakaoId)) return false; // 관리자 계정은 차단 안 함
  const { data: cust } = await sb.from("customers").select("customer_phone").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const phoneDigits = String((cust as { customer_phone?: string } | null)?.customer_phone ?? "").replace(/[^0-9]/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 11) return false;
  const reason = buildBlockReason({ type: "harassment", memo: `방송 채팅: ${body.slice(0, 60)}` });
  const variants = Array.from(new Set([phoneDigits, ...koreanPhoneVariants(phoneDigits)]));
  const { error: e1 } = await sb.from("customers").update({ is_blocked: true, block_reason: reason }).in("customer_phone", variants);
  if (e1) return false;
  const { error: e2 } = await sb.from("customer_phone_blocks").upsert(
    { phone: phoneDigits, is_blocked: true, reason, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
  return !e2;
}
