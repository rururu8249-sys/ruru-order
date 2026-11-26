"use client";
// 2026-10-31 신규 — /youtube 짧은 주소: 누르면 폰을 보고 유튜브 앱 «루루동이2 채널 홈»으로 넘김.
// 주소·이동 규칙은 lib/youtubeChannelLink 한 곳(손님 화면 안내 팝업과 공용).
// [2026-11-01 사장님 16:40 「카톡 메시지 버튼으로 열면 앱 말고 인터넷창으로만」]
//   · 자동 이동은 인터넷 주소 대신(fallback 없는 intent) — 실패하면 이 화면에 머물러 버튼을 보여 준다.
//   · [16:53 사장님 「번거롭게」] 「크롬으로 열기」 버튼은 뺌 — 「유튜브 앱에서 열기」 하나 + 작은 웹 링크만.
//   · 「유튜브 앱에서 열기」 버튼은 손으로 누르는 것이라 앱이 없으면 인터넷 주소로(fallback 있는 intent).
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관.

import { useEffect, useState } from "react";
import {
  YOUTUBE_ANDROID_INTENT_NO_FALLBACK,
  YOUTUBE_CHANNEL_WEB_URL,
  detectYoutubeDevice,
  isKakaoInAppBrowser,
  kakaoOpenExternalUrl,
  YOUTUBE_CHANNEL_APP_LINK,
  youtubeChannelUrlFor,
  type YoutubeDevice,
} from "@/lib/youtubeChannelLink";


export default function YoutubeOpener() {
  const [device, setDevice] = useState<YoutubeDevice | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const d = detectYoutubeDevice(ua, navigator.maxTouchPoints || 0);
    const fallbackTimer = window.setTimeout(() => { setDevice(d); setShowFallback(true); }, 2500);
    if (d === "pc") {
      window.location.replace(YOUTUBE_CHANNEL_WEB_URL);
      return () => window.clearTimeout(fallbackTimer);
    }
    // [2026-11-26 사장님 「버튼 만들지 말고 제대로」] 카톡 안 브라우저는 페이지가 앱을 직접 못 연다(카카오가 막음 — 11/01 실패 원인).
    //   그래서 카카오가 공식으로 열어 주는 «밖으로 보내기» 주소로 유튜브 https 주소를 폰에 넘긴다 →
    //   폰(안드로이드·아이폰 둘 다)이 유튜브 https 주소를 받으면 유튜브 앱이 연다. 버튼 누를 필요 없음.
    if (isKakaoInAppBrowser(ua)) {
      window.location.replace(kakaoOpenExternalUrl(YOUTUBE_CHANNEL_APP_LINK));
      return () => window.clearTimeout(fallbackTimer);
    }
    if (d === "android") {
      window.location.href = YOUTUBE_ANDROID_INTENT_NO_FALLBACK;
      return () => window.clearTimeout(fallbackTimer);
    }
    window.location.href = youtubeChannelUrlFor(d);
    // 아이폰(카톡 밖): 앱이 열리면 화면이 가려져 타이머가 멈춤 → 그대로 보이면 앱이 없는 것 → 웹으로
    const webTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") window.location.href = YOUTUBE_CHANNEL_WEB_URL;
    }, 1500);
    return () => { window.clearTimeout(webTimer); window.clearTimeout(fallbackTimer); };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        color: "#111111",
        padding: "48px 16px",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <svg width="56" height="56" viewBox="0 0 48 48" aria-hidden="true" style={{ marginBottom: "12px" }}>
        <rect x="4" y="10" width="40" height="28" rx="9" fill="#FF0000" />
        <path d="M20 17.5v13l11-6.5z" fill="#FFFFFF" />
      </svg>
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>나야루루 유튜브 채널</h1>
      <p style={{ fontSize: "15px", color: "#707072", margin: "0 0 20px", lineHeight: 1.5, wordBreak: "keep-all" }}>
        유튜브 앱으로 넘어가는 중이에요…
      </p>
      {showFallback ? (
        <a href={device && device !== "pc" ? YOUTUBE_CHANNEL_APP_LINK : YOUTUBE_CHANNEL_WEB_URL} style={{ fontSize: "15px", color: "#111111", textDecoration: "underline", padding: "12px" }}>
          안 넘어가면 여기를 눌러 주세요
        </a>
      ) : null}
    </main>
  );
}
