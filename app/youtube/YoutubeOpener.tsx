"use client";
// 2026-10-31 신규 — /youtube 짧은 주소: 누르면 폰을 보고 유튜브 앱 «루루동이2 채널 홈»으로 넘김.
// 주소·이동 규칙은 lib/youtubeChannelLink 한 곳(손님 화면 안내 팝업과 공용).
// [2026-11-01 사장님 16:40 「카톡 메시지 버튼으로 열면 앱 말고 인터넷창으로만」]
//   · 자동 이동은 인터넷 주소 대신(fallback 없는 intent) — 실패하면 이 화면에 머물러 버튼을 보여 준다.
//   · 카톡 안 브라우저면 「크롬으로 열기」(카카오 제공 kakaotalk://web/openExternal) 버튼을 맨 위에.
//   · 「유튜브 앱에서 열기」 버튼은 손으로 누르는 것이라 앱이 없으면 인터넷 주소로(fallback 있는 intent).
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관.

import { useEffect, useState } from "react";
import {
  YOUTUBE_ANDROID_INTENT_NO_FALLBACK,
  YOUTUBE_CHANNEL_WEB_URL,
  detectYoutubeDevice,
  isKakaoInAppBrowser,
  kakaoOpenExternalUrl,
  youtubeChannelUrlFor,
  type YoutubeDevice,
} from "@/lib/youtubeChannelLink";

const btn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  maxWidth: "360px",
  height: "52px",
  borderRadius: "999px",
  fontSize: "16px",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default function YoutubeOpener() {
  const [device, setDevice] = useState<YoutubeDevice | null>(null);
  const [inKakao, setInKakao] = useState(false);
  const [selfUrl, setSelfUrl] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const d = detectYoutubeDevice(ua, navigator.maxTouchPoints || 0);
    setDevice(d);
    setInKakao(isKakaoInAppBrowser(ua));
    setSelfUrl(window.location.href);
    if (d === "pc") {
      window.location.replace(YOUTUBE_CHANNEL_WEB_URL);
      return;
    }
    if (d === "android") {
      // 실패해도 인터넷 주소로 안 넘어가게(fallback 없음) — 버튼이 남아 있다
      window.location.href = YOUTUBE_ANDROID_INTENT_NO_FALLBACK;
      return;
    }
    window.location.href = youtubeChannelUrlFor(d);
    // 아이폰: 앱이 열리면 화면이 가려져 타이머가 멈춤 → 그대로 보이면 앱이 없는 것.
    // 카톡 안에서는 인터넷으로 넘기지 않고 버튼을 보여 준다.
    if (!isKakaoInAppBrowser(ua)) {
      const timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") window.location.href = YOUTUBE_CHANNEL_WEB_URL;
      }, 1500);
      return () => window.clearTimeout(timer);
    }
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
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>루루동이 유튜브 채널</h1>
      <p style={{ fontSize: "15px", color: "#707072", margin: "0 0 28px", lineHeight: 1.5, wordBreak: "keep-all" }}>
        {inKakao ? (
          <>
            카톡 안에서는 앱이 안 열릴 수 있어요.
            <br />
            아래 버튼을 눌러 주세요.
          </>
        ) : (
          <>
            유튜브 앱으로 넘어가는 중이에요.
            <br />
            안 넘어가면 아래 버튼을 눌러 주세요.
          </>
        )}
      </p>
      <a href={device ? youtubeChannelUrlFor(device) : YOUTUBE_CHANNEL_WEB_URL} style={{ ...btn, background: "#111111", color: "#FFFFFF" }}>
        유튜브 앱에서 열기
      </a>
      {inKakao && selfUrl ? (
        <a href={kakaoOpenExternalUrl(selfUrl)} style={{ ...btn, marginTop: "12px", background: "#FFFFFF", color: "#111111", border: "1.5px solid #111111" }}>
          크롬(인터넷)으로 열기
        </a>
      ) : null}
      <a href={YOUTUBE_CHANNEL_WEB_URL} style={{ marginTop: "16px", fontSize: "14px", color: "#707072", textDecoration: "underline", padding: "12px" }}>
        유튜브 웹으로 보기
      </a>
    </main>
  );
}
