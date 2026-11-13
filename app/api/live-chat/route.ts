import {publicChatRow} from '@/lib/chatPresentation';
// app/api/live-chat/route.ts
// [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅(손님용).
//   GET ?bc=방송id → 최근 글 50개(지운 글 빼고) + 고정 공지.
//   POST { kakao_id, bc, body } → 글 쓰기. 닉네임은 손님이 보낸 값이 아니라 회원 표(customers)의 유튜브 닉네임.
//   채팅 표 + 관리자 /상품번호 명령의 위젯 순환 설정·소개 고정 해제만 쓴다. 주문·돈·포인트 무접촉.
//   새 글은 DB 트리거가 소식(Broadcast)으로 모두에게 보낸다.
import { NextRequest, NextResponse, after } from "next/server";
import { runLiveChatBot } from "@/lib/liveChatBotServer";
import { parseChatProductQueries, parseChatProductSelection } from "@/lib/liveChatProductCommand";
import { validateIntroCapture } from "@/lib/productIntro";
import { saveProductIntros } from "@/lib/productIntroServer";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import { runChatProductCommand } from "@/lib/liveChatProductCommandServer";
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
import { normalizeWidgetTarget } from "@/lib/widgetProductLibrary";
import { chatIdentityFromRequest, sameChatOrigin, verifiedChatRole } from "@/lib/liveChatSession";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { manualChatOperator, validManualSelection, manualChatFailure } from "@/lib/liveAutomationManualChat";
import { AUTO_TEST_AVATAR, AUTO_TEST_KAKAO_ID } from "@/lib/autoTestOrder";
import {readAutomationRequest,AutomationError} from '@/lib/liveAutomationAuth';

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
    // Metadata polling needs only the setting. Initial history reads are independent
    // and can run in parallel; disabled chat still returns no messages or pin.
    if (request.nextUrl.searchParams.get("meta") === "1") {
      const setting = await readSetting(sb);
      return NextResponse.json(setting.enabled
        ? { ok: true, enabled: true, notice: setting.notice }
        : { ok: true, enabled: false, notice: "", messages: [], pinned: null });
    }
    const cols = "id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, public_avatar_id, public_avatar_key, bot_ref";
    const [setting, listRes, pinRes] = await Promise.all([
      readSetting(sb),
      sb.from("live_chat_messages").select(cols).eq("broadcast_id", bc).is("hidden_at", null).order("id", { ascending: false }).limit(LIVE_CHAT_RECENT),
      sb.from("live_chat_messages").select(cols).eq("broadcast_id", bc).is("hidden_at", null).not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!setting.enabled) return NextResponse.json({ ok: true, enabled: false, notice: "", messages: [], pinned: null });
    if (listRes.error) return fail("채팅을 못 불러왔어요.", 500);
    const messages = (listRes.data ?? []).map(row=>parseChatMessage(publicChatRow(row))).filter(Boolean).reverse();
    return NextResponse.json({ ok: true, enabled: true, notice: setting.notice, messages, pinned: pinRes.data ? parseChatMessage(publicChatRow(pinRes.data)) : null });
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
    const automation=await readAutomationRequest(request,{owner:kakaoId},'chat',sb);
    if(automation&&(automation.campaign.broadcast_id!==bc||raw.manual!==undefined||body.startsWith('/')))return fail('허용되지 않은 채팅 요청이에요.',403);
    let manualOperator: string | null = null;
    if (raw.manual !== undefined) {
      if (!sameChatOrigin(request)) return fail("잘못된 요청입니다.", 403);
      if (!validManualSelection(raw.manual)) return fail("닉네임을 다시 선택해 주세요.");
      manualOperator = await manualChatOperator(request, sb);
      if (!manualOperator || (manualOperator.startsWith("kakao:") && manualOperator !== `kakao:${kakaoId}`)) return fail("관리자 본인 확인이 필요해요.", 403);
      if (body.startsWith("/")) return fail("선택한 닉네임으로는 채팅만 보낼 수 있어요.", 403);
    }
    const [setting, role, bcRes, custRes, bansRes, lastRes] = await Promise.all([
      readSetting(sb),
      chatRoleOfKakao(sb, kakaoId).catch(() => ({ badge: null, isMod: false })),
      sb.from("broadcasts").select("id, status, widget_card_enabled, youtube_live_url").eq("id", bc).maybeSingle(),
      sb.from("customers").select("id, youtube_nickname, is_blocked, kakao_profile_image").eq("kakao_id", kakaoId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("live_chat_bans").select("until_at, lifted_at").eq("kakao_id", kakaoId).is("lifted_at", null).order("id", { ascending: false }).limit(5),
      sb.from("live_chat_messages").select("created_at").eq(automation?'automation_actor_id':'kakao_id',automation?automation.actor.id:kakaoId).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!setting.enabled) return fail("지금은 채팅을 쓸 수 없어요.", 403);

    if (bcRes.error) return fail("방송 상태를 확인하지 못했어요. 잠시 후 다시 보내 주세요.", 503);

    // 방송이 켜져 있을 때만
    const bcRow = bcRes.data as { status?: unknown; widget_card_enabled?: boolean; youtube_live_url?: string } | null;
    if (!bcRow || String(bcRow.status ?? "") !== "ON") return fail("방송 중에만 쓸 수 있어요.", 403);

    // 닉네임은 회원 표에서(카카오 계정 기준, 최신 1줄)
    const c = custRes.data as { id?: string; youtube_nickname?: string; is_blocked?: unknown; kakao_profile_image?: unknown } | null;
    const nickname = String(automation?.actor.nickname ?? c?.youtube_nickname ?? "").trim().slice(0, 40);
    if (!c || !nickname) return fail("닉네임을 먼저 정해 주세요.", 403);
    if (isBlockedValue(c.is_blocked)) return fail("채팅을 쓸 수 없어요.", 403);

    // 금지(잠깐 금지·차단)
    const active = (bansRes.data ?? []).find((b) => banActive(b as { until_at?: string | null; lifted_at?: string | null }));
    if (active) return fail(banMessage(active as { until_at?: string | null }), 403);

    // 너무 빨리 연달아 쓰기 막기
    const lastAt = Date.parse(String((lastRes.data as { created_at?: string } | null)?.created_at ?? ""));
    if (Number.isFinite(lastAt) && Date.now() - lastAt < LIVE_CHAT_MIN_GAP_MS) return fail("조금 천천히 써 주세요.", 429);

    if (body.startsWith("/")) {
      if (!role.isMod) return fail("상품 순환 명령은 채팅 관리자만 사용할 수 있어요.", 403);
      const query = parseChatProductQueries(body);
      const target = raw.target && typeof raw.target === "object" && "targets" in raw.target
        ? parseChatProductSelection(raw.target) : normalizeWidgetTarget(raw.target);
      if (raw.target != null && !target) return fail("선택한 상품 목록을 확인해 주세요. 한 번에 20개까지 가능해요.");
      if (!query && !target) return fail("/프509, 버307처럼 입력하거나 목록에서 상품을 골라 주세요.");
      if (bcRow.widget_card_enabled === false) return fail("방송 관리에서 상품 위젯을 먼저 켜 주세요.");
      try {
        let introNotice: string | undefined;
        const rawTarget = raw.target as Record<string, unknown> | undefined;
        const wantsIntro = target && "targets" in target && target.mode === "replace" && rawTarget && "intro" in rawTarget;
        const capture = wantsIntro ? validateIntroCapture(rawTarget.intro, youtubeVideoIdFromUrl(String(bcRow.youtube_live_url || ""))) : null;
        const recordIntro = wantsIntro ? async (targets: import("@/lib/widgetProductLibrary").WidgetProductTarget[]) => {
          // Auxiliary recording must never turn successful widget/chat changes into a retry.
          try {
            if (!capture) { introNotice = "상품 소개 완료 · 현재 영상 위치를 확인하지 못했어요. 영상이 열린 상태에서 다시 선택해 주세요."; return; }
            const identity = chatIdentityFromRequest(request);
            const verified = sameChatOrigin(request) && (await verifyAdminSessionFromRequest(request) || (identity?.sub === kakaoId && (await verifiedChatRole(sb, identity)).isMod));
            if (!verified) { introNotice = "상품 소개 완료 · 영상 연결은 채팅 본인 확인 후 사용할 수 있어요."; return; }
            const result = await saveProductIntros(sb, bc, targets, capture, "first");
            introNotice = result.kept ? "상품 소개 완료 · 기존 소개영상 위치는 유지했어요." : "상품 소개 완료 · 소개영상도 연결했어요.";
          } catch { introNotice = "상품 소개 완료 · 소개영상 연결은 저장하지 못했어요."; }
        } : undefined;
        const message = await runChatProductCommand(sb, bc, query || "", { kakao_id: kakaoId, customer_id: c.id ?? null, nickname, body, badge: role.badge ?? null, avatar_url: kakaoId === AUTO_TEST_KAKAO_ID ? AUTO_TEST_AVATAR : (cleanKakaoPhotoUrl(c.kakao_profile_image) || null) }, target ?? undefined, recordIntro);
        // Only the sender receives this receipt; public history/events retain the hidden flag.
        return NextResponse.json({ ok: true, privateCommand: true, introNotice, message: parseChatMessage(publicChatRow({ ...message, hidden_at: null, pinned_at: null })) }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "상품 순환을 변경하지 못했어요.");
      }
    }

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
    if (manualOperator && validManualSelection(raw.manual)) {
      const { data, error } = await sb.rpc("live_automation_manual_send", {
        p_broadcast: bc, p_token: raw.manual.token, p_operator: manualOperator,
        p_client: raw.manual.clientId, p_request: raw.manual.requestId, p_body: finalBody,
      });
      if (error) { const e = manualChatFailure(error.message); return fail(e.message, e.status); }
      return NextResponse.json({ ok: true, message: parseChatMessage(publicChatRow(data)) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if(automation){
      const {data,error}=await sb.rpc('live_automation_chat',{p_action:automation.capability.action,p_lease:automation.capability.lease,p_revision:automation.capability.revision,p_body:finalBody});
      if(error)return fail('채팅 실행 조건이 변경되어 전송하지 않았어요.',409);
      return NextResponse.json({ok:true,message:parseChatMessage(publicChatRow(data))},{headers:{'Cache-Control':'no-store'}});
    }
    const { data: ins, error } = await sb
      .from("live_chat_messages")
      .insert({ broadcast_id: bc, kakao_id: kakaoId, customer_id: c.id ?? null, nickname, body: finalBody, badge: role.badge ?? null, avatar_url: kakaoId === AUTO_TEST_KAKAO_ID ? AUTO_TEST_AVATAR : (cleanKakaoPhotoUrl(c.kakao_profile_image) || null) })
      .select("id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, public_avatar_id, public_avatar_key, bot_ref")
      .single();
    if (error) return fail("못 보냈어요. 다시 눌러 주세요.", 500);
    // [2026-11-10] 루루동이AI — 응답을 보낸 «뒤»에 상품 안내·자주 묻는 말(손님 글 쓰기를 늦추지 않음, 실패해도 무관)
    //   이모티콘은 빼고 글자만 봄(이모티콘만 보낸 글이면 안내 안 함)
    const botText = chatBodyWithoutEmoji(finalBody);
    if (botText) after(() => runLiveChatBot(sb, bc, botText));
    return NextResponse.json({ ok: true, message: parseChatMessage(publicChatRow(ins)) });
  } catch (error) {
    if(error instanceof AutomationError)return fail('채팅 실행 권한을 확인하지 못했어요.',error.status);
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
      // A raw account ID must never grant the role that can read private deleted originals.
      if (!sameChatOrigin(request)) return fail("잘못된 요청입니다.", 403);
      const verifiedOwner = await verifyAdminSessionFromRequest(request) || (await verifiedChatRole(sb, chatIdentityFromRequest(request))).isOwner;
      if (!verifiedOwner) return fail("채팅 본인 확인 후 관리자 권한을 변경할 수 있어요.", 401);
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
