// app/yt-test/page.tsx
// 2026-10-31 신규 — 알림톡 「앱링크」 버튼과 똑같은 주소를 폰에서 미리 눌러 보는 시험 페이지(표시 전용).
// 돈/주문/입금/배송 로직 무관. 검색 노출 안 함(robots noindex). 시험 끝나면 지워도 됨.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "유튜브 버튼 시험",
  robots: { index: false, follow: false },
};

const CHANNEL = "youtube.com/channel/UC8jr9s1rZBEIPPTBPAwYE5A?si=P8OAzC4y2XTFCgag";

const LINKS: { label: string; href: string; note: string }[] = [
  {
    label: "① 안드로이드 버튼 (intent)",
    href: `intent://${CHANNEL}#Intent;package=com.google.android.youtube;scheme=https;end`,
    note: "알림톡 안드로이드 칸에 넣은 주소 그대로",
  },
  {
    label: "② 아이폰 버튼 (youtube://)",
    href: `youtube://${CHANNEL}`,
    note: "알림톡 iOS 칸에 넣은 주소 그대로",
  },
  {
    label: "③ 일반 인터넷 주소",
    href: `https://${CHANNEL}`,
    note: "비교용",
  },
];

export default function YoutubeButtonTestPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", color: "#111111", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>유튜브 버튼 시험</h1>
      <p style={{ fontSize: "14px", color: "#707072", margin: "0 0 24px", lineHeight: 1.5 }}>
        폰에 맞는 버튼을 눌러 유튜브 앱에서 루루동이2 채널 홈이 열리는지 보세요.
      </p>
      <div style={{ display: "grid", gap: "12px" }}>
        {LINKS.map((l) => (
          <a
            key={l.label}
            href={l.href}
            style={{ display: "block", padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", textDecoration: "none", color: "#111111" }}
          >
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{l.label}</div>
            <div style={{ fontSize: "13px", color: "#707072", marginTop: "4px" }}>{l.note}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
