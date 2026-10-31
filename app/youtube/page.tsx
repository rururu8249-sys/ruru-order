// app/youtube/page.tsx
// 2026-10-31 신규 — 카톡채널 광고·설명란 등에 쓰는 짧은 주소. 누르면 유튜브 앱 루루동이2 채널 홈으로.
// 표시·이동 전용(YoutubeOpener). 돈/주문/입금/배송 로직 무관.

import type { Metadata } from "next";
import YoutubeOpener from "./YoutubeOpener";

export const metadata: Metadata = {
  title: "루루동이 유튜브 채널",
  description: "루루동이 유튜브 라이브 채널로 이동합니다.",
  robots: { index: false, follow: false },
};

export default function YoutubePage() {
  return <YoutubeOpener />;
}
