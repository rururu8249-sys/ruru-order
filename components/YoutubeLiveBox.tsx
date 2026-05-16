// app/components/YoutubeLiveBox.tsx
// 새 파일 생성용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/YoutubeLiveBox.tsx

"use client";

import { useMemo, useState } from "react";

function getYoutubeId(url: string) {
  const text = String(url || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(text);

    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace("/", "").trim();
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v") || "";

    const liveMatch = parsed.pathname.match(/\/live\/([^/?]+)/);
    if (liveMatch?.[1]) return liveMatch[1];

    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch?.[1]) return embedMatch[1];

    return "";
  } catch {
    return "";
  }
}

export default function YoutubeLiveBox({ youtubeUrl }: { youtubeUrl?: string }) {
  const [open, setOpen] = useState(false);
  const videoId = useMemo(() => getYoutubeId(youtubeUrl || ""), [youtubeUrl]);

  if (!videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`;

  return (
    <section className="mb-4 rounded-[1.7rem] border border-pink-100 bg-white p-4 shadow-[0_14px_35px_rgba(255,120,160,0.13)]">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <div className="text-lg font-black text-gray-950">📺 라이브 방송 보면서 주문서 작성</div>
          <div className="mt-1 text-xs font-bold text-gray-500">영상은 접었다 펼칠 수 있습니다.</div>
        </div>
        <div className="rounded-full bg-gray-950 px-4 py-2 text-sm font-black text-white">{open ? "접기 ▲" : "보기 ▼"}</div>
      </button>

      {open && (
        <div className="mt-4 overflow-hidden rounded-[1.25rem] bg-black">
          <iframe
            src={embedUrl}
            title="루루동이 유튜브 라이브"
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      )}
    </section>
  );
}
