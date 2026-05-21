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
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;
  }, [videoId]);

  const chatSrc = useMemo(() => {
    if (!videoId || !embedDomain) return "";
    return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(embedDomain)}`;
  }, [videoId, embedDomain]);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">
            방송 화면 / 라이브 채팅
          </div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            방송과 채팅을 보면서 주문·입금·문의 처리를 같이 확인합니다.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenWatch}
            className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
          >
            유튜브 새창
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
          >
            채팅 새창
          </button>
        </div>
      </div>

      {!videoId ? (
        <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
          방송 링크 또는 영상ID를 입력하면 방송 화면과 채팅창이 표시됩니다.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-black">
            <iframe
              src={videoSrc}
              title="유튜브 LIVE 방송 화면"
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
            {chatSrc ? (
              <iframe
                src={chatSrc}
                title="유튜브 LIVE 채팅"
                className="h-[360px] w-full bg-white"
              />
            ) : (
              <div className="flex h-[360px] items-center justify-center text-sm font-black text-neutral-400">
                채팅창 도메인 준비 중입니다.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold leading-relaxed text-neutral-500">
        채팅 입력은 안전상 넣지 않았습니다. 채팅이 안 보이면 [채팅 새창]을 사용하세요.
      </div>
    </section>
  );
}
