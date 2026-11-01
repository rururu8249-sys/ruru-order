// lib/openLinkInApp.ts
// 2026-11-01 — 안내 팝업 버튼 주소 열기. 유튜브·네이버밴드 주소면 폰에서 그 앱으로(안드로이드 intent, 아이폰 youtube://),
// 사이트 안 주소(/로 시작)는 이 창에서, 나머지는 새 창으로. 표시·이동 전용.

import { detectYoutubeDevice } from "./youtubeChannelLink";

function appPackageFor(host: string): string | null {
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") return "com.google.android.youtube";
  if (/(^|\.)band\.us$/.test(host)) return "com.nhn.android.band";
  return null;
}

export function openLinkInApp(url: string): void {
  if (typeof window === "undefined") return;
  const u = url.trim();
  if (!u) return;
  if (u.startsWith("/") && !u.startsWith("//")) {
    window.location.href = u;
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return;
  }
  const device = detectYoutubeDevice(navigator.userAgent || "", navigator.maxTouchPoints || 0);
  const pkg = appPackageFor(parsed.hostname.toLowerCase());
  const rest = u.replace(/^https?:\/\//, "");
  if (pkg && device === "android") {
    window.location.href = `intent://${rest}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodeURIComponent(u)};end`;
    return;
  }
  if (pkg === "com.google.android.youtube" && device === "ios") {
    window.location.href = `youtube://${rest}`;
    window.setTimeout(() => {
      if (document.visibilityState === "visible") window.location.href = u;
    }, 1500);
    return;
  }
  if (device === "pc") {
    window.open(u, "_blank", "noopener");
    return;
  }
  window.location.href = u;
}
