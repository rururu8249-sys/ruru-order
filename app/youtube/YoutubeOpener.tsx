"use client";
// 2026-10-31 신규 — /youtube 짧은 주소: 누르면 폰을 보고 유튜브 앱 «루루동이2 채널 홈»으로 넘김.
// 주소·이동 규칙은 lib/youtubeChannelLink 한 곳(손님 화면 채널 변경 안내 팝업과 공용).
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관.

import { useEffect, useState } from "react";
import {
  YOUTUBE_CHANNEL_WEB_URL,
  detectYoutubeDevice,
  youtubeChannelUrlFor,
  type YoutubeDevice,
} from "@/lib/youtubeChannelLink";

export default function YoutubeOpener() {
  const [device, setDevice] = useState<YoutubeDevice | null>(null);

  useEffect(() => {
    const d = detectYoutubeDevice(navigator.userAgent || "", navigator.maxTouchPoints || 0);
    setDevice(d);
    if (d === "pc") {
      window.location.replace(YOUTUBE_CHANNEL_WEB_URL);
      return;
    }
    window.location.href = youtubeChannelUrlFor(d);
    if (d === "ios") {
      // 앱이 열리면 화면이 가려져 타이머가 멈춤 → 그대로 보이면 앱이 없는 것
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
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>루루동이 유튜브 채널</h1>
      <p style={{ fontSize: "15px", color: "#707072", margin: "0 0 32px", lineHeight: 1.5, wordBreak: "keep-all" }}>
        유튜브 앱으로 넘어가는 중이에요.
        <br />
        안 넘어가면 아래 버튼을 눌러 주세요.
      </p>
      <a
        href={device ? youtubeChannelUrlFor(device) : YOUTUBE_CHANNEL_WEB_URL}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          maxWidth: "360px",
          height: "52px",
          borderRadius: "999px",
          background: "#111111",
          color: "#FFFFFF",
          fontSize: "16px",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        유튜브 앱에서 열기
      </a>
      <a
        href={YOUTUBE_CHANNEL_WEB_URL}
        style={{
          marginTop: "16px",
          fontSize: "14px",
          color: "#707072",
          textDecoration: "underline",
          padding: "12px",
        }}
      >
        인터넷으로 보기
      </a>
    </main>
  );
}
