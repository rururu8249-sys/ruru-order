"use client";
// 2026-10-31 신규 — /youtube 짧은 주소: 누르면 폰을 보고 유튜브 앱 «루루동이2 채널 홈»으로 넘김.
// 안드로이드 = intent(앱 없으면 인터넷 주소로), 아이폰 = youtube://(1.5초 안에 안 넘어가면 인터넷 주소), PC = 인터넷 주소.
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관. 채널 바뀌면 CHANNEL 한 줄만 바꾸면 됨.

import { useEffect, useState } from "react";

const CHANNEL = "youtube.com/channel/UC8jr9s1rZBEIPPTBPAwYE5A?si=P8OAzC4y2XTFCgag";
const WEB_URL = `https://${CHANNEL}`;
const ANDROID_URL = `intent://${CHANNEL}#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=${encodeURIComponent(WEB_URL)};end`;
const IOS_URL = `youtube://${CHANNEL}`;

type Device = "android" | "ios" | "pc";

function detectDevice(ua: string): Device {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ 는 맥처럼 보임
  if (/macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) return "ios";
  return "pc";
}

function appUrlFor(device: Device): string {
  if (device === "android") return ANDROID_URL;
  if (device === "ios") return IOS_URL;
  return WEB_URL;
}

export default function YoutubeOpener() {
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    const d = detectDevice(navigator.userAgent || "");
    setDevice(d);
    if (d === "pc") {
      window.location.replace(WEB_URL);
      return;
    }
    window.location.href = appUrlFor(d);
    if (d === "ios") {
      // 앱이 열리면 화면이 가려져 타이머가 멈춤 → 그대로 보이면 앱이 없는 것
      const timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") window.location.href = WEB_URL;
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
        href={device ? appUrlFor(device) : WEB_URL}
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
        href={WEB_URL}
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
