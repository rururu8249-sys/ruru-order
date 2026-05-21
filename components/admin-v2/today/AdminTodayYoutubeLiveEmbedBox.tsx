"use client";

// components/admin-v2/today/AdminTodayYoutubeLiveEmbedBox.tsx
// 목적: 오늘할일 관제탑 안에서 유튜브 방송 화면과 라이브 채팅창을 읽기 전용으로 표시
// 주의: YouTube API/OAuth/채팅 글쓰기 없음. iframe 표시 전용.

import { useEffect, useMemo, useState } from "react";

export default function AdminTodayYoutubeLiveEmbedBox({
  videoId,
  onOpenWatch,
  onOpenChat,
}: {
  videoId: string;
  onOpenWatch: () => void;
  onOpenChat: () => void;
}) {
  const [embedDomain, setEmbedDomain] = useState("");

  useEffect(() => {
    try {
      setEmbedDomain(window.location.hostname);
    } catch {
      setEmbedDomain("");
    }
  }, []);

  const videoSrc = useMemo(() => {
    if (!videoId) return "";

    return `https://www.youtube.com/embed/${encodeURIComponent(
      videoId
    )}?rel=0&modestbranding=1&playsinline=1&controls=1`;
  }, [videoId]);

  const chatSrc = useMemo(() => {
    if (!videoId || !embedDomain) return "";

    return `https://www.youtube.com/live_chat?v=${encodeURIComponent(
      videoId
    )}&embed_domain=${encodeURIComponent(embedDomain)}`;
  }, [videoId, embedDomain]);

  if (!videoId) {
    return (
      <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
        방송 링크 또는 영상ID를 입력하면 방송 화면과 채팅창이 표시됩니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(170px,220px)_minmax(320px,1fr)] xl:items-start">
      <div className="overflow-hidden rounded-2xl bg-black">
        <div className="flex items-center justify-between bg-neutral-950 px-3 py-2">
          <span className="text-xs font-black text-white">LIVE 영상</span>
          <button
            type="button"
            onClick={onOpenWatch}
            className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white active:scale-[0.98]"
          >
            새창
          </button>
        </div>

        <div className="h-[240px] sm:h-[260px] 2xl:h-[290px]">
          <iframe
            src={videoSrc}
            title="유튜브 LIVE 방송 화면"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-neutral-50">
        <div className="flex items-center justify-between bg-white px-3 py-2">
          <span className="text-xs font-black text-neutral-950">LIVE 채팅</span>
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-black text-neutral-600 active:scale-[0.98]"
          >
            크게 보기
          </button>
        </div>

        <div className="h-[240px] sm:h-[260px] 2xl:h-[290px]">
          {chatSrc ? (
            <iframe
              src={chatSrc}
              title="유튜브 LIVE 채팅"
              className="h-full w-full bg-white"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-black text-neutral-400">
              채팅창 도메인 준비 중입니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
