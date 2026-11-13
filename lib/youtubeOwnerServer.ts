// lib/youtubeOwnerServer.ts
// [2026-11-13 사장님 「단축키로 유튜브 채팅창에 써지게」] 자주 쓰는 말을 «나야루루(채널 주인) 이름으로» 유튜브 채팅에 바로 보내기.
//   유튜브 채팅칸은 유튜브 화면(다른 사이트)이라 우리 화면이 글자를 넣을 수 없고, 그 칸에서 누른 키도 우리 화면에 안 옴 → 유튜브 API 로 보냄.
//   주문 알림용 봇 계정(주문Ai, youtube_integration 1번 줄)과 «따로» 저장 — 비공개 저장소 admin-private/youtube-owner.json(서버만).
//   주문 알림·채팅 주문 읽기·봇 채널 번호 기록은 무접촉(이 파일은 그 칸들을 안 씀).
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedLiveChatId, getAccessToken, getServiceClient, writeSetting } from "./youtube";

const BUCKET = "admin-private";
const FILE = "youtube-owner.json";

export type YoutubeOwner = { refreshToken: string; channelId: string; channelTitle: string; connectedAt: string };

function isNotFound(error: unknown): boolean {
  const e = (error || {}) as { message?: string; statusCode?: string | number; status?: number; error?: string };
  const msg = `${e.message || ""} ${e.error || ""}`.toLowerCase();
  return String(e.statusCode) === "404" || e.status === 404 || msg.includes("not found");
}

export async function readYoutubeOwner(sb: SupabaseClient): Promise<YoutubeOwner | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(FILE);
  if (error) { if (isNotFound(error)) return null; throw new Error(error.message || "유튜브 계정 정보를 읽지 못했어요"); }
  if (!data) return null;
  try {
    const j = JSON.parse(await data.text());
    const refreshToken = String(j?.refreshToken || "").trim();
    if (!refreshToken) return null;
    return { refreshToken, channelId: String(j?.channelId || ""), channelTitle: String(j?.channelTitle || ""), connectedAt: String(j?.connectedAt || "") };
  } catch { return null; }
}

export async function saveYoutubeOwner(sb: SupabaseClient, owner: YoutubeOwner): Promise<void> {
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (error || !data) {
    const { error: e2 } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024 });
    if (e2 && !String(e2.message || "").toLowerCase().includes("already")) throw new Error(e2.message);
  }
  const { error: upErr } = await sb.storage.from(BUCKET)
    .upload(FILE, new Blob([JSON.stringify(owner)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (upErr) throw new Error(upErr.message || "유튜브 계정 저장 실패");
}

/** 연결한 구글 계정의 유튜브 채널 이름(사장님이 맞는 계정으로 로그인했는지 화면에 보여 주려고). */
export async function fetchMyChannel(accessToken: string): Promise<{ channelId: string; channelTitle: string }> {
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = (await r.json().catch(() => ({}))) as { items?: { id?: string; snippet?: { title?: string } }[] };
  const it = j?.items?.[0];
  return { channelId: String(it?.id || ""), channelTitle: String(it?.snippet?.title || "") };
}

export type OwnerPostResult = { ok: boolean; notConnected?: boolean; reason?: string };

export async function postOwnerLiveChat(messageText: string): Promise<OwnerPostResult> {
  const text = String(messageText || "").trim().slice(0, 200);
  if (!text) return { ok: false, reason: "빈 글" };
  try {
    const sb = getServiceClient();
    const owner = await readYoutubeOwner(sb);
    if (!owner) return { ok: false, notConnected: true, reason: "나야루루 계정이 아직 연결 안 됐어요" };
    const accessToken = await getAccessToken(owner.refreshToken);
    let chatId = await cachedLiveChatId(sb, accessToken);
    if (!chatId) return { ok: false, reason: "지금 켜진 유튜브 라이브 채팅을 못 찾았어요(방송 관리의 라이브 주소 확인)" };
    const post = (id: string) => fetch("https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { liveChatId: id, type: "textMessageEvent", textMessageDetails: { messageText: text } } }),
    });
    let res = await post(chatId);
    if (!res.ok && (res.status === 403 || res.status === 404)) {
      const first = await res.text().catch(() => "");
      if (/liveChatNotFound|liveChatEnded|notFound/i.test(first) || res.status === 404) {
        await writeSetting(sb, "youtube_live_chat_id", ""); // 지난 방송 채팅방 번호면 비우고 한 번 다시 찾기(주문 알림과 같은 칸)
        chatId = await cachedLiveChatId(sb, accessToken);
        if (!chatId) return { ok: false, reason: "지금 켜진 유튜브 라이브 채팅을 못 찾았어요" };
        res = await post(chatId);
      } else {
        return { ok: false, reason: explain(first) };
      }
    }
    if (!res.ok) return { ok: false, reason: explain(await res.text().catch(() => "")) };
    return { ok: true };
  } catch (e) {
    const m = String((e as Error)?.message || e);
    if (/invalid_grant/i.test(m)) return { ok: false, notConnected: true, reason: "나야루루 계정 연결이 풀렸어요. 다시 연결해 주세요" };
    return { ok: false, reason: m };
  }
}

function explain(raw: string): string {
  if (/quotaExceeded|dailyLimitExceeded/i.test(raw)) return "유튜브 하루 사용 한도를 다 썼어요(내일 다시 돼요)";
  if (/rateLimitExceeded/i.test(raw)) return "너무 빨리 보냈어요. 잠깐 뒤 다시 눌러 주세요";
  if (/forbidden|insufficientPermissions/i.test(raw)) return "이 계정으로는 이 방송 채팅에 쓸 수 없어요";
  return "유튜브에 못 보냈어요. 다시 눌러 주세요";
}
