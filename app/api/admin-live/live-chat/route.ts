// app/api/admin-live/live-chat/route.ts
// [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅 관리(관리자만, middleware + verifyAdminSession).
//   POST { action: "hide"|"mute30s"|"mute5m"|"ban", messageId }  → 글 지우기(+ 그 손님 잠깐 금지/차단)
//   POST { action: "lift", kakaoId? | messageId? }                → 금지 풀기
//   GET  → 지금 금지 중인 손님 목록 / GET ?bc=방송id → 그 방송 최근 글 80개 + 고정 댓글(관리자 PC 오른쪽 채팅 칸)
//   POST { action: "post", bc, body }  → [2026-11-10 사장님 05:54] 관리자 PC 에서 글 쓰기 — 총관리자(금색 왕관) 회원 이름으로 올라감
//   POST { action: "pin"|"unpin", messageId } → 고정 댓글
//   표 live_chat_messages / live_chat_bans 만 쓴다. 주문·돈·고객 차단(customers.is_blocked) 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { banActive, cleanChatBody, parseChatMessage, type LiveChatPenalty } from "@/lib/liveChat";
import { LIVE_CHAT_PENALTIES, moderateChatMessage, pinChatMessage } from "@/lib/liveChatServer";
import { LIVE_WATCH_KEY, parseLiveWatchSetting } from "@/lib/liveWatch";
import { cleanKakaoPhotoUrl } from "@/lib/kakaoPhoto";
import { koreanPhoneVariants } from "@/lib/order/phone";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_COLS = "id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, avatar_url, bot_ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const sb = getServiceClient();
    const bc = String(request.nextUrl.searchParams.get("bc") ?? "").trim();
    if (bc) {
      if (!UUID.test(bc)) return fail("방송 정보가 없어요.");
      const [listRes, pinRes] = await Promise.all([
        sb.from("live_chat_messages").select(MSG_COLS).eq("broadcast_id", bc).is("hidden_at", null).order("id", { ascending: false }).limit(80),
        sb.from("live_chat_messages").select(MSG_COLS).eq("broadcast_id", bc).is("hidden_at", null).not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (listRes.error) return fail("채팅을 못 불러왔어요.", 500);
      const messages = (listRes.data ?? []).map(parseChatMessage).filter(Boolean).reverse();
      return NextResponse.json({ ok: true, messages, pinned: pinRes.data ? parseChatMessage(pinRes.data) : null });
    }
    const { data, error } = await sb
      .from("live_chat_bans")
      .select("id, kakao_id, nickname, until_at, lifted_at, reason, created_at")
      .is("lifted_at", null)
      .order("id", { ascending: false })
      .limit(200);
    if (error) return fail("목록을 못 불러왔어요.", 500);
    const seen = new Set<string>();
    const bans = (data ?? []).filter((b) => {
      const row = b as { kakao_id: string; until_at: string | null; lifted_at: string | null };
      if (seen.has(row.kakao_id) || !banActive(row)) return false;
      seen.add(row.kakao_id);
      return true;
    }).map((b) => {
      const row = b as { kakao_id: string; nickname: string | null; until_at: string | null; created_at: string };
      return { kakaoId: row.kakao_id, nickname: row.nickname || "", untilAt: row.until_at, createdAt: row.created_at };
    });
    return NextResponse.json({ ok: true, bans });
  } catch {
    return fail("목록을 못 불러왔어요.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(raw.action ?? "");
    const messageId = Number(raw.messageId);
    const sb = getServiceClient();

    // 글 주인 찾기
    let kakaoId = String(raw.kakaoId ?? "").trim().slice(0, 64);
    if (Number.isFinite(messageId) && messageId > 0) {
      const { data: msg } = await sb.from("live_chat_messages").select("id, kakao_id").eq("id", messageId).maybeSingle();
      if (!msg) return fail("글을 못 찾았어요.", 404);
      kakaoId = String((msg as { kakao_id: string }).kakao_id);
    }

    if (action === "post") {
      const bc = String(raw.bc ?? "").trim();
      const body = cleanChatBody(raw.body);
      if (!UUID.test(bc)) return fail("방송 정보가 없어요.");
      if (!body) return fail("글을 써 주세요.");
      // 글쓴이 = 설정의 총관리자(금색 왕관 먼저) 회원 — 손님 화면에 그 닉네임·사진·왕관으로 보임
      const { data: st } = await sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle();
      const setting = parseLiveWatchSetting((st as { value?: unknown } | null)?.value);
      const owner = setting.owners.find((o) => o.badge === "crown") ?? setting.owners[0];
      if (!owner) return fail("총관리자 번호가 설정에 없어요.", 400);
      const { data: cust } = await sb.from("customers").select("id, kakao_id, youtube_nickname, kakao_nickname, kakao_profile_image")
        .in("customer_phone", Array.from(new Set([owner.phone, ...koreanPhoneVariants(owner.phone)]))).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const c = cust as { id?: string; kakao_id?: string; youtube_nickname?: string; kakao_nickname?: string; kakao_profile_image?: string } | null;
      const nickname = String(c?.youtube_nickname || c?.kakao_nickname || "루루동이").trim().slice(0, 40);
      const { data: ins, error } = await sb.from("live_chat_messages").insert({
        broadcast_id: bc, kakao_id: String(c?.kakao_id || "admin:owner"), customer_id: c?.id ?? null, nickname, body,
        badge: owner.badge, avatar_url: cleanKakaoPhotoUrl(c?.kakao_profile_image) || null,
      }).select(MSG_COLS).single();
      if (error) return fail("못 보냈어요. 다시 눌러 주세요.", 500);
      return NextResponse.json({ ok: true, message: parseChatMessage(ins) });
    }

    if (action === "pin" || action === "unpin") {
      if (!(Number.isFinite(messageId) && messageId > 0)) return fail("글 번호가 없어요.");
      const r = await pinChatMessage(sb, messageId, action === "pin");
      return NextResponse.json({ ok: r.ok, message: r.message }, { status: r.ok ? 200 : r.status || 500 });
    }

    if (action === "lift") {
      if (!kakaoId) return fail("누구를 풀지 몰라요.");
      const { error } = await sb.from("live_chat_bans").update({ lifted_at: new Date().toISOString() }).eq("kakao_id", kakaoId).is("lifted_at", null);
      if (error) return fail("못 풀었어요.", 500);
      return NextResponse.json({ ok: true, message: "금지를 풀었어요." });
    }

    if (!LIVE_CHAT_PENALTIES.includes(action as LiveChatPenalty)) return fail("모르는 동작이에요.");
    if (!(Number.isFinite(messageId) && messageId > 0)) return fail("글 번호가 없어요.");
    const r = await moderateChatMessage(sb, messageId, action as LiveChatPenalty);
    return NextResponse.json({ ok: r.ok, message: r.message }, { status: r.ok ? 200 : r.status || 500 });
  } catch {
    return fail("처리 못 했어요.", 500);
  }
}
