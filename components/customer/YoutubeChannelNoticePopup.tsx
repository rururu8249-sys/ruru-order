"use client";
// components/customer/YoutubeChannelNoticePopup.tsx
// 2026-11-01 신규 — 손님 화면 접속 때 «유튜브 채널이 바뀌었어요» 안내 팝업.
// · 「새 채널 바로가기」 → 유튜브 앱 채널 홈(lib/youtubeChannelLink, /youtube 와 같은 규칙). 누르면 다시 안 뜸.
// · 「다시 보지 않기」 → 다시 안 뜸. 「닫기」 → 이번 접속에서만 닫힘(다음 접속에 다시).
// · 켜기/끄기 = 설정 › 손님 공지 「유튜브 채널 변경 안내 팝업」(settings youtube_channel_notice_enabled).
// 브라우저 저장소는 «이 손님이 이미 봤는지» 편의용만. 돈/주문/입금/배송 로직 무관.

import { useEffect, useState } from "react";
import { openYoutubeChannel } from "@/lib/youtubeChannelLink";

const DONE_KEY = "ruru_yt_channel_notice_v1_done";
const SESSION_KEY = "ruru_yt_channel_notice_v1_closed";

export default function YoutubeChannelNoticePopup({ enabled, blocked }: { enabled: boolean; blocked: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    let show = false;
    try {
      show = !localStorage.getItem(DONE_KEY) && !sessionStorage.getItem(SESSION_KEY);
    } catch {
      show = false; // 저장소를 못 쓰면 매번 뜨는 것보다 안 띄우는 게 낫다
    }
    setOpen(show);
  }, [enabled]);

  if (!open || blocked) return null;

  const markDone = () => {
    try { localStorage.setItem(DONE_KEY, String(Date.now())); } catch { /* 무시 */ }
    setOpen(false);
  };
  const closeForNow = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* 무시 */ }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="yt-channel-notice-title"
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div style={{ width: "100%", maxWidth: "360px", background: "#FFFFFF", borderRadius: "20px", boxShadow: "0 24px 70px rgba(0,0,0,0.32)", overflow: "hidden" }}>
        <div style={{ padding: "28px 20px 8px", textAlign: "center" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", margin: "0 auto 12px" }}>
            <rect x="4" y="10" width="40" height="28" rx="9" fill="#FF0000" />
            <path d="M20 17.5v13l11-6.5z" fill="#FFFFFF" />
          </svg>
          <h2 id="yt-channel-notice-title" style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#111111", lineHeight: 1.4 }}>
            유튜브 채널이 바뀌었어요
          </h2>
          <p style={{ margin: "12px 0 0", fontSize: "16px", fontWeight: 500, color: "#111111", lineHeight: 1.6, wordBreak: "keep-all" }}>
            루루동이 라이브는 이제
            <br />
            <b>새 채널(루루동이2)</b>에서 해요.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "15px", color: "#707072", lineHeight: 1.6, wordBreak: "keep-all" }}>
            새 채널에서 <b style={{ color: "#111111" }}>구독</b>과 <b style={{ color: "#111111" }}>알림 설정</b>을
            <br />
            꼭 눌러 주세요.
          </p>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              markDone();
              openYoutubeChannel();
            }}
            style={{ height: "52px", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", border: "none", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}
          >
            새 채널 바로가기
          </button>
          <button
            type="button"
            onClick={closeForNow}
            style={{ height: "48px", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", border: "1px solid #CACACB", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={markDone}
            style={{ height: "44px", background: "transparent", color: "#707072", border: "none", fontSize: "14px", fontWeight: 500, cursor: "pointer", textDecoration: "underline" }}
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
