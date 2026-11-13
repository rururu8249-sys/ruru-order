// [2026-11-10] 사이트 채팅 — 서버 공용(지우기·금지·관리 권한 확인). service_role 클라이언트로만 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { penaltyUntil, type LiveChatPenalty } from "@/lib/liveChat";
import { LIVE_WATCH_KEY, chatBadgeOf, isChatOwnerPhone, parseLiveWatchSetting, serializeLiveWatchSetting, type LiveChatBadge } from "@/lib/liveWatch";
import { buildBlockReason } from "@/lib/customerBlockReason";
import { koreanPhoneVariants } from "@/lib/order/phone";
import { AUTO_TEST_PHONE } from "@/lib/autoTestOrder";

export const LIVE_CHAT_PENALTIES: LiveChatPenalty[] = ["hide", "mute30s", "mute5m", "ban"];
const LABEL: Record<LiveChatPenalty, string> = {
  hide: "지웠어요",
  mute30s: "지우고 30초 금지했어요",
  mute5m: "지우고 5분 금지했어요",
  ban: "지우고 사이트 접속을 차단했어요",
};

async function phoneOfKakao(sb: SupabaseClient, kakaoId: string): Promise<string> {
  if (!kakaoId) return "";
  const { data: cust } = await sb.from("customers").select("customer_phone").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return String((cust as { customer_phone?: string } | null)?.customer_phone ?? "").replace(/[^0-9]/g, "");
}

async function readWatchSetting(sb: SupabaseClient) {
  const { data: st } = await sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle();
  return parseLiveWatchSetting((st as { value?: unknown } | null)?.value);
}

/** 이 카카오 계정의 채팅 역할 — 표시(badge)·관리 가능·총관리자. 관리자 시험 계정 표(켜진 것)도 채팅 관리자. */
export async function chatRoleOfKakao(sb: SupabaseClient, kakaoId: string): Promise<{ phone: string; badge: LiveChatBadge | null; isMod: boolean; isOwner: boolean; isManager: boolean }> {
  // 서로 독립적인 조회를 함께 시작 — 글마다 회원 조회가 끝날 때까지 기다리지 않는다.
  const [phone, setting, opsRes] = await Promise.all([
    phoneOfKakao(sb, kakaoId),
    readWatchSetting(sb),
    sb.from("operator_test_accounts").select("customer_phone, is_active").eq("is_active", true),
  ]);
  if (!phone) return { phone: "", badge: null, isMod: false, isOwner: false, isManager: false };
  const isOwner = isChatOwnerPhone(setting, phone);
  // [2026-11-13] 자동 테스트 회원 번호는 시험 계정 표에 있어도 채팅에선 평범한 손님(R 표시·관리 권한 없음)
  const isOp = phone !== AUTO_TEST_PHONE && (opsRes.data ?? []).some((o) => String((o as { customer_phone?: string }).customer_phone ?? "").replace(/[^0-9]/g, "") === phone);
  const badge = chatBadgeOf(setting, phone) ?? (isOp ? "mod" : null);
  return { phone, badge, isMod: isOwner || isOp || setting.mods.includes(phone), isOwner, isManager: isOwner || isOp };
}

/** 이 카카오 계정이 채팅 관리자인지 — 총관리자·관리자 시험 계정 표(켜진 것)·설정 mods 번호 */
export async function isChatModeratorKakao(sb: SupabaseClient, kakaoId: string): Promise<boolean> {
  return (await chatRoleOfKakao(sb, kakaoId)).isMod;
}

/** 고정 댓글 — 그 방송에 하나만. pin 이면 같은 방송 다른 고정은 먼저 풂. */
export async function pinChatMessage(sb: SupabaseClient, messageId: number, pin: boolean): Promise<{ ok: boolean; message: string; status?: number }> {
  const { data: msg } = await sb.from("live_chat_messages").select("id, broadcast_id, hidden_at").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "글을 못 찾았어요.", status: 404 };
  const m = msg as { broadcast_id: string; hidden_at: string | null };
  if (!pin) {
    const { error } = await sb.from("live_chat_messages").update({ pinned_at: null }).eq("id", messageId);
    return error ? { ok: false, message: "고정을 못 풀었어요.", status: 500 } : { ok: true, message: "고정을 풀었어요." };
  }
  if (m.hidden_at) return { ok: false, message: "지운 글은 고정할 수 없어요.", status: 400 };
  await sb.from("live_chat_messages").update({ pinned_at: null }).eq("broadcast_id", m.broadcast_id).not("pinned_at", "is", null).neq("id", messageId);
  const { error } = await sb.from("live_chat_messages").update({ pinned_at: new Date().toISOString() }).eq("id", messageId);
  return error ? { ok: false, message: "고정을 못 했어요.", status: 500 } : { ok: true, message: "맨 위에 고정했어요." };
}

/** 채팅 관리자 지정·해제 — 그 글 쓴 사람의 회원 전화번호를 설정 mods 에 넣고 뺌(총관리자만 부른다). */
export async function setChatManager(sb: SupabaseClient, messageId: number, grant: boolean): Promise<{ ok: boolean; message: string; status?: number }> {
  const { data: msg } = await sb.from("live_chat_messages").select("id, kakao_id, nickname").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "글을 못 찾았어요.", status: 404 };
  const nick = String((msg as { nickname?: string }).nickname ?? "");
  const phone = await phoneOfKakao(sb, String((msg as { kakao_id: string }).kakao_id));
  if (!phone) return { ok: false, message: "이 손님의 회원 번호를 못 찾았어요.", status: 404 };
  const setting = await readWatchSetting(sb);
  if (isChatOwnerPhone(setting, phone)) return { ok: false, message: "총관리자는 바꿀 수 없어요.", status: 400 };
  const mods = grant ? Array.from(new Set([...setting.mods, phone])) : setting.mods.filter((x) => x !== phone);
  const { error } = await sb.from("settings").update({ value: serializeLiveWatchSetting({ ...setting, mods }) }).eq("key", LIVE_WATCH_KEY);
  if (error) return { ok: false, message: "저장 못 했어요.", status: 500 };
  return { ok: true, message: grant ? `${nick}님을 채팅 관리자로 지정했어요. 다음 글부터 R 표시가 붙어요.` : `${nick}님을 채팅 관리자에서 해제했어요.` };
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
