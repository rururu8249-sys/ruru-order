// lib/youtubeChatRead.ts
// [2026-08-14] 유튜브 라이브 채팅 "읽기" 전용 — 0~1단계(적재만).
//   - lib/youtube.ts 의 토큰/chatId 배관을 그대로 재사용. 토큰 로직을 새로 만들지 않는다.
//   - broadcasts.status='ON' 아니면 유튜브를 아예 호출하지 않는다 → 쿼터 0
//   - 절대 throw로 호출측을 막지 않는다 (lib/youtube.ts 원칙 승계)
//   - chat_orders / youtube_api_usage 에만 쓴다. 돈·주문·재고 로직 무접촉.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceClient, readSetting, writeSetting,
  readRefreshToken, getAccessToken, resolveLiveChatId, extractVideoId,
} from "@/lib/youtube";

export const SETTING_CHAT_READ_ENABLED = "chat_order_read_enabled";
const SETTING_CHAT_ID = "chat_order_chat_id";
const SETTING_PAGE_TOKEN = "chat_order_page_token";
// [테스트용] 값이 있으면 broadcasts.status=ON 검사를 건너뛰고 이 URL의 채팅만 읽는다.
//   → 관리자 「방송시작」을 누르지 않으므로 손님 화면에 방송 배너가 뜨지 않는다.
export const SETTING_TEST_LIVE_URL = "chat_order_test_live_url";

export type ChatReadResult = {
  ok: boolean; skipped?: boolean; reason?: string;
  fetched?: number; stored?: number;
  pollingIntervalMillis?: number | null;
  calls?: Record<string, number>;
};

async function bumpUsage(sb: SupabaseClient, method: string) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const { data } = await sb.from("youtube_api_usage")
      .select("id,calls").eq("day", day).eq("method", method).limit(1).maybeSingle();
    if (data) {
      await sb.from("youtube_api_usage")
        .update({ calls: Number((data as any).calls || 0) + 1 }).eq("id", (data as any).id);
    } else {
      await sb.from("youtube_api_usage").insert({ day, method, calls: 1 });
    }
  } catch { /* 통계 실패는 무시 */ }
}

async function isBroadcastOn(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.from("broadcasts")
    .select("id,status,is_deleted,started_at")
    .neq("is_deleted", true)
    .order("started_at", { ascending: false }).limit(20);
  return ((data || []) as Record<string, unknown>[])
    .some((r) => String(r.status ?? "").toUpperCase() === "ON");
}

async function resolveChatIdFromUrl(accessToken: string, liveUrl: string): Promise<string> {
  const videoId = extractVideoId(liveUrl);
  if (!videoId) return "";
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=" + encodeURIComponent(videoId),
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    const json: any = await res.json().catch(() => ({}));
    return String(json?.items?.[0]?.liveStreamingDetails?.activeLiveChatId || "").trim();
  } catch {
    return "";
  }
}

export async function readLiveChatOnce(): Promise<ChatReadResult> {
  const calls: Record<string, number> = {};
  try {
    const sb = getServiceClient();
    if ((await readSetting(sb, SETTING_CHAT_READ_ENABLED)) !== "true")
      return { ok: true, skipped: true, reason: "채팅읽기 OFF" };
    const testLiveUrl = await readSetting(sb, SETTING_TEST_LIVE_URL);
    if (!testLiveUrl && !(await isBroadcastOn(sb)))
      return { ok: true, skipped: true, reason: "방송 OFF" };

    const refreshToken = await readRefreshToken(sb);
    if (!refreshToken) return { ok: false, skipped: true, reason: "유튜브 미연결" };
    const accessToken = await getAccessToken(refreshToken);

    let chatId = await readSetting(sb, SETTING_CHAT_ID);
    if (!chatId) {
      chatId = testLiveUrl
        ? await resolveChatIdFromUrl(accessToken, testLiveUrl)
        : await resolveLiveChatId(sb, accessToken);
      calls["videos.list"] = 1;
      await bumpUsage(sb, "videos.list");
      if (!chatId) return { ok: false, skipped: true, reason: "활성 라이브 채팅 없음", calls };
      await writeSetting(sb, SETTING_CHAT_ID, chatId);
      await writeSetting(sb, SETTING_PAGE_TOKEN, "");
    }

    const pageToken = await readSetting(sb, SETTING_PAGE_TOKEN);
    const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    url.searchParams.set("liveChatId", chatId);
    url.searchParams.set("part", "snippet,authorDetails");
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    calls["liveChatMessages.list"] = 1;
    await bumpUsage(sb, "liveChatMessages.list");

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let j: any = {}; try { j = JSON.parse(raw); } catch { /* non-json */ }
      const reason = String(j?.error?.errors?.[0]?.reason || j?.error?.status || res.status);
      if (res.status === 404 || res.status === 403 || /liveChatNotFound|liveChatEnded/i.test(reason)) {
        await writeSetting(sb, SETTING_CHAT_ID, "");
        await writeSetting(sb, SETTING_PAGE_TOKEN, "");
      }
      return { ok: false, reason: "읽기 실패 " + res.status + " " + reason, calls };
    }

    const json: any = await res.json().catch(() => ({}));
    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    await writeSetting(sb, SETTING_PAGE_TOKEN, String(json?.nextPageToken || ""));

    let stored = 0;
    if (items.length > 0) {
      const rows = items.map((it) => ({
        message_id: String(it?.id || ""),
        live_chat_id: chatId,
        channel_id: String(it?.authorDetails?.channelId || ""),
        display_name: String(it?.authorDetails?.displayName || ""),
        raw_message: String(it?.snippet?.displayMessage || it?.snippet?.textMessageDetails?.messageText || ""),
        published_at: it?.snippet?.publishedAt || null,
        parse_status: "raw",
      })).filter((r) => r.message_id && r.raw_message);
      if (rows.length > 0) {
        const { error } = await sb.from("chat_orders")
          .upsert(rows, { onConflict: "message_id", ignoreDuplicates: true });
        if (!error) stored = rows.length;
      }
    }

    return {
      ok: true, fetched: items.length, stored,
      pollingIntervalMillis: json?.pollingIntervalMillis != null ? Number(json.pollingIntervalMillis) : null,
      calls,
    };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e), calls };
  }
}
