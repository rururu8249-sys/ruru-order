// lib/youtubeChannelLink.ts
// 2026-11-01 — 루루동이 유튜브 채널(루루동이2) 주소와 «유튜브 앱으로 열기» 규칙 한 곳.
// /youtube 짧은 주소 페이지와 손님 화면 채널 변경 안내 팝업이 같이 쓴다. 채널 바뀌면 CHANNEL 한 줄만.
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관.

export const YOUTUBE_CHANNEL = "youtube.com/channel/UC8jr9s1rZBEIPPTBPAwYE5A?si=P8OAzC4y2XTFCgag";
export const YOUTUBE_CHANNEL_WEB_URL = `https://${YOUTUBE_CHANNEL}`;
const ANDROID_URL = `intent://${YOUTUBE_CHANNEL}#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=${encodeURIComponent(YOUTUBE_CHANNEL_WEB_URL)};end`;
const IOS_URL = `youtube://${YOUTUBE_CHANNEL}`;

export type YoutubeDevice = "android" | "ios" | "pc";

export function detectYoutubeDevice(ua: string, maxTouchPoints = 0): YoutubeDevice {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ 는 맥처럼 보임
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "pc";
}

export function youtubeChannelUrlFor(device: YoutubeDevice): string {
  if (device === "android") return ANDROID_URL;
  if (device === "ios") return IOS_URL;
  return YOUTUBE_CHANNEL_WEB_URL;
}

/** 지금 기기에 맞게 유튜브 앱 채널 홈을 연다. 아이폰은 1.5초 안에 앱이 안 열리면 인터넷 주소로. */
export function openYoutubeChannel(): void {
  if (typeof window === "undefined") return;
  const device = detectYoutubeDevice(navigator.userAgent || "", navigator.maxTouchPoints || 0);
  if (device === "pc") {
    window.open(YOUTUBE_CHANNEL_WEB_URL, "_blank", "noopener");
    return;
  }
  window.location.href = youtubeChannelUrlFor(device);
  if (device === "ios") {
    window.setTimeout(() => {
      if (document.visibilityState === "visible") window.location.href = YOUTUBE_CHANNEL_WEB_URL;
    }, 1500);
  }
}
