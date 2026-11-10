// app/api/live-chat/route.ts
// [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅(손님용).
//   GET ?bc=방송id → 최근 글 50개(지운 글 빼고) + 고정 공지.
//   POST { kakao_id, bc, body } → 글 쓰기. 닉네임은 손님이 보낸 값이 아니라 회원 표(customers)의 유튜브 닉네임.
//   표 live_chat_messages / live_chat_bans 만 쓴다(supabase/sql/live_chat.sql). 주문·돈·포인트 무접촉.
//   새 글은 DB 트리거가 소식(Broadcast)으로 모두에게 보낸다.
import { NextRequest, NextResponse, after } from "next/server";
import { runLiveChatBot } from "@/lib/liveChatBotServer";
import { getServiceClient } from "@/lib/youtube";
import {
  LIVE_CHAT_DEFAULT_WORDS,
  LIVE_CHAT_KEY,
  LIVE_CHAT_MIN_GAP_MS,
  LIVE_CHAT_RECENT,
  banActive,
  banMessage,
  cleanChatBody,
  maskBannedWords,
  parseChatMessage,
  parseLiveChatSetting,
  LIVE_CHAT_ACTIONS,
  isPenaltyAction,
  type LiveChatAction,
} from "@/lib/liveChat";
import { cleanKakaoPhotoUrl } from "@/lib/kakaoPhoto";
import { chatBodyWithoutEmoji, encodeEmojiTokens } from "@/lib/liveChatEmoji";
import { canUseChatEmoji, readEmojiSetting } from "@/lib/liveChatEmojiServer";
import { chatRoleOfKakao, moderateChatMessage, pinChatMessage, setChatManager } from "@/lib/liveChatServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

const isBlockedValue = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || s === "true" || s === "y" || s === "1" || s === "yes";
};

async function readSetting(sb: ReturnType<typeof getServiceClient>) {
  const { data } = await sb.from("settings").select("value").eq("key", LIVE_CHAT_KEY).maybeSingle();
  return parseLiveChatSetting((data as { value?: unknown } | null)?.value);
}

export async function GET(request: NextRequest) {
  const bc = String(request.nextUrl.searchParams.get("bc") ?? "").trim();
  if (!UUID.test(bc)) return fail("방송 정보가 없어요.");
  try {
    const sb = getServiceClient();
    const setting = await readSetting(sb);
    if (!setting.enabled) return NextResponse.json({ ok: true, enabled: false, notice: "", messages: [], pinned: null });
    // [2026-11-10 09:50] 설정만(켜짐·공지) — 손님 화면이 공지 바뀐 걸 다시 읽을 때
    if (request.nextUrl.searchParams.get("meta") === "1") return NextResponse.json({ ok: true, enabled: true, notice: setting.notice });
    const cols = "id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, avatar_url, bot_ref";
    const [listRes, pinRes] = await Promise.all([
      sb.from("live_chat_messages").select(cols).eq("broadcast_id", bc).is("hidden_at", null).order("id", { ascending: false }).limit(LIVE_CHAT_RECENT),
      sb.from("live_chat_messages").select(cols).eq("broadcast_id", bc).is("hidden_at", null).not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (listRes.error) return fail("채팅을 못 불러왔어요.", 500);
    const messages = (listRes.data ?? []).map(parseChatMessage).filter(Boolean).reverse();
    return NextResponse.json({ ok: true, enabled: true, notice: setting.notice, messages, pinned: pinRes.data ? parseChatMessage(pinRes.data) : null });
  } catch {
    return fail("채팅을 못 불러왔어요.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kakaoId = String(raw.kakao_id ?? "").trim().slice(0, 64);
    const bc = String(raw.bc ?? "").trim();
    const body = cleanChatBody(raw.body);
    if (!kakaoId) return fail("카카오 로그인 후 쓸 수 있어요.", 401);
    if (!UUID.test(bc)) return fail("방송 정보가 없어요.");
    if (!body) return fail("내용을 적어 주세요.");

    const sb = getServiceClient();
    // 빠르게 — 서로 상관없는 읽기는 한꺼번에
    const [setting, role, bcRes, custRes, bansRes, lastRes] = await Promise.all([
      readSetting(sb),
      chatRoleOfKakao(sb, kakaoId).catch(() => ({ badge: null })),
      sb.from("broadcasts").select("id, status").eq("id", bc).maybeSingle(),
      sb.from("customers").select("id, youtube_nickname, is_blocked, kakao_profile_image").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("live_chat_bans").select("until_at, lifted_at").eq("kakao_id", kakaoId).is("lifted_at", null).order("id", { ascending: false }).limit(5),
      sb.from("live_chat_messages").select("created_at").eq("kakao_id", kakaoId).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!setting.enabled) return fail("지금은 채팅을 쓸 수 없어요.", 403);

    // 방송이 켜져 있을 때만
    const bcRow = bcRes.data as { status?: unknown } | null;
    if (!bcRow || String(bcRow.status ?? "") !== "ON") return fail("방송 중에만 쓸 수 있어요.", 403);

    // 닉네임은 회원 표에서(카카오 계정 기준, 최신 1줄)
    const c = custRes.data as { id?: string; youtube_nickname?: string; is_blocked?: unknown; kakao_profile_image?: unknown } | null;
    const nickname = String(c?.youtube_nickname ?? "").trim().slice(0, 40);
    if (!c || !nickname) return fail("닉네임을 먼저 정해 주세요.", 403);
    if (isBlockedValue(c.is_blocked)) return fail("채팅을 쓸 수 없어요.", 403);

    // 금지(잠깐 금지·차단)
    const active = (bansRes.data ?? []).find((b) => banActive(b as { until_at?: string | null; lifted_at?: string | null }));
    if (active) return fail(banMessage(active as { until_at?: string | null }), 403);

    // 너무 빨리 연달아 쓰기 막기
    const lastAt = Date.parse(String((lastRes.data as { created_at?: string } | null)?.created_at ?? ""));
    if (Number.isFinite(lastAt) && Date.now() - lastAt < LIVE_CHAT_MIN_GAP_MS) return fail("조금 천천히 써 주세요.", 429);

    const masked = maskBannedWords(body, [...LIVE_CHAT_DEFAULT_WORDS, ...setting.words]);
    // [2026-11-10] 이모티콘 — «:이름:» 이 있고 쓸 수 있는 손님이면 그림 표식으로(아니면 글자 그대로)
    let finalBody = masked.text;
    if (/:[^:\s]{1,10}:/.test(finalBody)) {
      try {
        const emojiSetting = await readEmojiSetting(sb);
        if (emojiSetting.items.some((e) => e.on) && (await canUseChatEmoji(sb, kakaoId, emojiSetting))) {
          finalBody = encodeEmojiTokens(finalBody, emojiSetting.items).text;
        }
      } catch { /* 이모티콘 확인 실패 — 글자 그대로 */ }
    }
    const { data: ins, error } = await sb
      .from("live_chat_messages")
      .insert({ broadcast_id: bc, kakao_id: kakaoId, customer_id: c.id ?? null, nickname, body: finalBody, badge: role.badge ?? null, avatar_url: cleanKakaoPhotoUrl(c.kakao_profile_image) || null })
      .select("id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, avatar_url, bot_ref")
      .single();
    if (error) return fail("못 보냈어요. 다시 눌러 주세요.", 500);
    // [2026-11-10] 루루동이AI — 응답을 보낸 «뒤»에 상품 안내·자주 묻는 말(손님 글 쓰기를 늦추지 않음, 실패해도 무관)
    //   이모티콘은 빼고 글자만 봄(이모티콘만 보낸 글이면 안내 안 함)
    const botText = chatBodyWithoutEmoji(finalBody);
    if (botText) after(() => runLiveChatBot(sb, bc, botText));
    return NextResponse.json({ ok: true, message: parseChatMessage(ins) });
  } catch {
    return fail("못 보냈어요. 다시 눌러 주세요.", 500);
  }
}

// PATCH { kakao_id, messageId, action } — 방송 화면에서 길게 눌러
//   지우기·금지·고정·고정 해제 = 채팅 관리자(총관리자·시험 계정·mods) / 채팅 관리자 지정·해제 = 총관리자만
export async function PATCH(request: NextRequest) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kakaoId = String(raw.kakao_id ?? "").trim().slice(0, 64);
    const messageId = Number(raw.messageId);
    const action = String(raw.action ?? "") as LiveChatAction;
    if (!LIVE_CHAT_ACTIONS.includes(action)) return fail("모르는 동작이에요.");
    if (!(Number.isFinite(messageId) && messageId > 0)) return fail("글 번호가 없어요.");
    const sb = getServiceClient();
    const role = await chatRoleOfKakao(sb, kakaoId);
    if (!role.isMod) return fail("관리자만 할 수 있어요.", 403);
    let r: { ok: boolean; message: string; status?: number };
    if (action === "grant" || action === "revoke") {
      if (!role.isOwner) return fail("총관리자만 할 수 있어요.", 403);
      r = await setChatManager(sb, messageId, action === "grant");
    } else if (action === "pin" || action === "unpin") {
      // 고정 댓글은 왕관 표시 두 사람(금색·분홍 왕관)만 — 사장님 11/10 04:12
      if (role.badge !== "crown" && role.badge !== "crown_pink") return fail("고정은 왕관 표시 관리자만 할 수 있어요.", 403);
      r = await pinChatMessage(sb, messageId, action === "pin");
    } else if (isPenaltyAction(action)) {
      r = await moderateChatMessage(sb, messageId, action);
    } else return fail("모르는 동작이에요.");
    return NextResponse.json({ ok: r.ok, message: r.message }, { status: r.ok ? 200 : r.status || 500 });
  } catch {
    return fail("처리 못 했어요.", 500);
  }
}
