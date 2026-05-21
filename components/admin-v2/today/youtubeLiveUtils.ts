// components/admin-v2/today/youtubeLiveUtils.ts
// 목적: 유튜브 LIVE 모니터용 URL/영상ID 보조 유틸
// 주의: UI 보조 전용. 주문/입금/배송/정산 로직 없음.

export const YOUTUBE_LIVE_STORAGE_KEY = "ruru-admin-youtube-live-url";

export function extractYoutubeVideoId(input: string) {
  const raw = input.trim();

  if (!raw) return "";

  if (/^[a-zA-Z0-9_-]{8,20}$/.test(raw) && !raw.includes("/")) {
    return raw;
  }

  try {
    const url = new URL(raw);

    const v = url.searchParams.get("v");
    if (v) return v;

    const parts = url.pathname.split("/").filter(Boolean);

    const liveIndex = parts.findIndex((part) => part === "live");
    if (liveIndex >= 0 && parts[liveIndex + 1]) return parts[liveIndex + 1];

    const shortsIndex = parts.findIndex((part) => part === "shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];

    if (url.hostname.includes("youtu.be") && parts[0]) return parts[0];

    return "";
  } catch {
    return "";
  }
}
