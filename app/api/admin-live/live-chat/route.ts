// app/api/admin-live/live-chat/route.ts
// [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅 관리(관리자만, middleware + verifyAdminSession).
//   POST { action: "hide"|"mute30s"|"mute5m"|"ban", messageId }  → 글 지우기(+ 그 손님 잠깐 금지/차단)
//   POST { action: "lift", kakaoId? | messageId? }                → 금지 풀기
//   GET  → 지금 금지 중인 손님 목록
//   표 live_chat_messages / live_chat_bans 만 쓴다. 주문·돈·고객 차단(customers.is_blocked) 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { banActive, type LiveChatPenalty } from "@/lib/liveChat";
import { LIVE_CHAT_PENALTIES, moderateChatMessage } from "@/lib/liveChatServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const sb = getServiceClient();
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
