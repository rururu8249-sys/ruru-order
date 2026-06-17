// lib/youtube.ts
// 유튜브 라이브 채팅 자동 알림 (서버 전용).
//   - refresh token: youtube_integration 테이블(서버 전용, RLS로 anon 차단)에 저장/조회.
//   - 비밀 아닌 설정(라이브 URL, 캐시된 liveChatId, ON/OFF, 문구): settings 테이블(youtube_* 키).
//   - 흐름: refresh token → access token 발급 → 라이브 URL에서 videoId → activeLiveChatId 조회(캐시)
//           → liveChatMessages.insert 로 채팅 글 작성.
//   - 절대 throw로 호출측(주문 제출 등)을 막지 않는다. 실패 시 {ok:false} 반환.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SETTING_LIVE_CHAT_ID = "youtube_live_chat_id";
const SETTING_LIVE_VIDEO_ID = "youtube_live_video_id";
export const SETTING_NOTIFY_ENABLED = "youtube_notify_enabled";
export const SETTING_MESSAGE_TEMPLATE = "youtube_message_template";

// 기본 문구. {{nickname}} 닉네임 / {{items}} 주문요약(예: "뉴발2000 외 2건") / {{amount}} 총 결제금액(택배비 포함)
export const DEFAULT_MESSAGE_TEMPLATE = "🛒 {{nickname}}님 주문 감사합니다! ({{items}} · {{amount}})";

export function getYoutubeClientId(): string {
  return String(process.env.YOUTUBE_CLIENT_ID || "").trim();
}
export function getYoutubeClientSecret(): string {
  return String(process.env.YOUTUBE_CLIENT_SECRET || "").trim();
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---- 설정(settings) 읽기/쓰기 (서비스롤) ----
async function readSetting(sb: SupabaseClient, key: string): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", key).limit(1).maybeSingle();
  return data ? String((data as any).value ?? "").trim() : "";
}
async function writeSetting(sb: SupabaseClient, key: string, value: string): Promise<void> {
  const { data: existing } = await sb.from("settings").select("key").eq("key", key).limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    await sb.from("settings").update({ value }).eq("key", key);
  } else {
    await sb.from("settings").insert({ key, value });
  }
}

// ---- refresh token (서버 전용 테이블) ----
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const sb = getServiceClient();
  const { data: existing } = await sb.from("youtube_integration").select("id").eq("id", 1).limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    await sb.from("youtube_integration").update({ refresh_token: refreshToken, updated_at: new Date().toISOString() }).eq("id", 1);
  } else {
    await sb.from("youtube_integration").insert({ id: 1, refresh_token: refreshToken });
  }
}
async function readRefreshToken(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("youtube_integration").select("refresh_token").eq("id", 1).limit(1).maybeSingle();
  return data ? String((data as any).refresh_token ?? "").trim() : "";
}

// 메인 컨트롤타워에서 저장한 "현재 방송(status=ON)"의 유튜브 라이브 URL을 그대로 사용한다.
// (설정에서 또 입력할 필요 없음 — 한 곳에서만 관리)
async function readActiveBroadcastLiveUrl(sb: SupabaseClient): Promise<string> {
  const { data } = await sb
    .from("broadcasts")
    .select("youtube_live_url")
    .eq("status", "ON")
    .neq("is_deleted", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? String((data as any).youtube_live_url ?? "").trim() : "";
}

export async function getConnectionStatus(): Promise<{ connected: boolean; liveUrl: string; notifyEnabled: boolean; messageTemplate: string }> {
  try {
    const sb = getServiceClient();
    const [token, liveUrl, notify, template] = await Promise.all([
      readRefreshToken(sb),
      readActiveBroadcastLiveUrl(sb),
      readSetting(sb, SETTING_NOTIFY_ENABLED),
      readSetting(sb, SETTING_MESSAGE_TEMPLATE),
    ]);
    return {
      connected: !!token,
      liveUrl,
      notifyEnabled: notify === "true",
      messageTemplate: template || DEFAULT_MESSAGE_TEMPLATE,
    };
  } catch {
    return { connected: false, liveUrl: "", notifyEnabled: false, messageTemplate: DEFAULT_MESSAGE_TEMPLATE };
  }
}

export async function saveNotifySettings(opts: { notifyEnabled?: boolean; messageTemplate?: string }): Promise<void> {
  const sb = getServiceClient();
  if (typeof opts.notifyEnabled === "boolean") await writeSetting(sb, SETTING_NOTIFY_ENABLED, opts.notifyEnabled ? "true" : "false");
  if (typeof opts.messageTemplate === "string") await writeSetting(sb, SETTING_MESSAGE_TEMPLATE, opts.messageTemplate);
}

// ---- access token 발급 ----
async function getAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: getYoutubeClientId(),
    client_secret: getYoutubeClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error("access token 발급 실패: " + (json.error_description || json.error || res.status));
  }
  return String(json.access_token);
}

// ---- 코드 → 토큰 교환 (OAuth 콜백에서 사용) ----
export async function exchangeCodeForRefreshToken(code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: getYoutubeClientId(),
    client_secret: getYoutubeClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.refresh_token) {
    throw new Error("토큰 교환 실패(refresh token 없음): " + (json.error_description || json.error || res.status));
  }
  return String(json.refresh_token);
}

// ---- 라이브 URL에서 videoId 추출 ----
export function extractVideoId(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  // 이미 11자 id면 그대로
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const v = u.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    // youtu.be/ID, /live/ID, /shorts/ID, /embed/ID
    const m = u.pathname.match(/\/(?:live|shorts|embed)\/([a-zA-Z0-9_-]{11})/) || u.pathname.match(/^\/([a-zA-Z0-9_-]{11})$/);
    if (m) return m[1];
  } catch {
    // not a URL
  }
  const m2 = s.match(/([a-zA-Z0-9_-]{11})/);
  return m2 ? m2[1] : "";
}

// ---- 활성 라이브 채팅 ID 조회(캐시) ----
async function resolveLiveChatId(sb: SupabaseClient, accessToken: string): Promise<string> {
  // 현재 방송(메인 컨트롤타워)의 라이브 URL → videoId
  const liveUrl = await readActiveBroadcastLiveUrl(sb);
  const videoId = extractVideoId(liveUrl);
  if (!videoId) return "";

  // 캐시: 같은 영상이면 재사용, 방송(영상)이 바뀌면 자동으로 다시 조회
  const cachedChat = await readSetting(sb, SETTING_LIVE_CHAT_ID);
  const cachedVid = await readSetting(sb, SETTING_LIVE_VIDEO_ID);
  if (cachedChat && cachedVid === videoId) return cachedChat;

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json: any = await res.json().catch(() => ({}));
  const chatId = String(json?.items?.[0]?.liveStreamingDetails?.activeLiveChatId || "").trim();
  if (chatId) {
    await writeSetting(sb, SETTING_LIVE_CHAT_ID, chatId);
    await writeSetting(sb, SETTING_LIVE_VIDEO_ID, videoId);
  }
  return chatId;
}

export type PostResult = { ok: boolean; skipped?: boolean; reason?: string };

// ---- 채팅 글 1건 작성 (핵심) ----
// forceEvenIfDisabled: 테스트 발송은 ON/OFF 무시하고 보냄.
export async function postLiveChatMessage(messageText: string, opts?: { forceEvenIfDisabled?: boolean }): Promise<PostResult> {
  try {
    const text = String(messageText || "").trim().slice(0, 200);
    if (!text) return { ok: false, reason: "빈 메시지" };

    const sb = getServiceClient();

    if (!opts?.forceEvenIfDisabled) {
      const enabled = (await readSetting(sb, SETTING_NOTIFY_ENABLED)) === "true";
      if (!enabled) return { ok: false, skipped: true, reason: "알림 OFF" };
    }

    const refreshToken = await readRefreshToken(sb);
    if (!refreshToken) return { ok: false, skipped: true, reason: "유튜브 미연결" };

    const accessToken = await getAccessToken(refreshToken);
    let liveChatId = await resolveLiveChatId(sb, accessToken);
    if (!liveChatId) return { ok: false, skipped: true, reason: "활성 라이브 채팅을 찾지 못함(라이브 URL 확인)" };

    const postOnce = async (chatId: string) => {
      return fetch("https://www.googleapis.com/youtube/v3/liveChatMessages?part=snippet", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          snippet: {
            liveChatId: chatId,
            type: "textMessageEvent",
            textMessageDetails: { messageText: text },
          },
        }),
      });
    };

    let res = await postOnce(liveChatId);
    if (!res.ok) {
      // 캐시된 chatId가 만료(이전 방송)일 수 있음 → 캐시 비우고 1회 재조회 후 재시도
      const errJson: any = await res.json().catch(() => ({}));
      const reason = errJson?.error?.errors?.[0]?.reason || errJson?.error?.status || res.status;
      if (String(reason).includes("liveChatNotFound") || String(reason).includes("liveChatEnded") || res.status === 404 || res.status === 403) {
        await writeSetting(sb, SETTING_LIVE_CHAT_ID, "");
        liveChatId = await resolveLiveChatId(sb, accessToken);
        if (!liveChatId) return { ok: false, skipped: true, reason: "활성 라이브 채팅 없음" };
        res = await postOnce(liveChatId);
        if (!res.ok) {
          const e2: any = await res.json().catch(() => ({}));
          return { ok: false, reason: "발송 실패: " + (e2?.error?.message || res.status) };
        }
      } else {
        return { ok: false, reason: "발송 실패: " + (errJson?.error?.message || reason) };
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

// 문구 템플릿에 닉네임/주문요약/금액 채우기.
//   nickname: 주문 닉네임 / itemsSummary: "뉴발2000 외 2건" 같은 요약 / amount: 총 결제금액(택배비 포함)
//   (itemsSummary·amount는 3단계에서 주문 데이터로 만들어 전달)
export async function buildOrderMessage(opts: { nickname: string; itemsSummary?: string; amount?: number }): Promise<string> {
  const sb = getServiceClient();
  const template = (await readSetting(sb, SETTING_MESSAGE_TEMPLATE)) || DEFAULT_MESSAGE_TEMPLATE;
  const nick = String(opts.nickname || "").trim() || "고객";
  const items = String(opts.itemsSummary || "").trim();
  const amountText = opts.amount && opts.amount > 0 ? `${Number(opts.amount).toLocaleString("ko-KR")}원` : "";
  return template
    .replace(/\{\{\s*nickname\s*\}\}/g, nick)
    .replace(/\{\{\s*items\s*\}\}/g, items)
    .replace(/\{\{\s*amount\s*\}\}/g, amountText)
    // 빈 placeholder로 생긴 "( · )" 같은 잔여 기호 정리
    .replace(/\(\s*[·\-/]?\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
