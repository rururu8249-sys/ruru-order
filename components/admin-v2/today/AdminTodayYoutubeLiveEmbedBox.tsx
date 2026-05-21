"use client";

// components/admin-v2/today/AdminTodayYoutubeLiveEmbedBox.tsx
// 목적: 오늘할일 관제탑 안에서 유튜브 방송 화면과 라이브 채팅창을 읽기 전용으로 크게 표시
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

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">
            방송 화면 / 라이브 채팅
          </div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            왼쪽은 방송 화면, 오른쪽은 채팅창입니다. 같은 높이로 맞춰서 방송 중 바로 확인합니다.
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
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)] xl:items-stretch">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-black">
            <div className="flex items-center justify-between border-b border-white/10 bg-neutral-950 px-3 py-2">
              <div className="text-xs font-black text-white">
                LIVE 영상
              </div>
              <div className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white">
                재생/소리 조절은 영상 하단 컨트롤
              </div>
            </div>

            <div className="h-[320px] sm:h-[420px] xl:h-[560px] 2xl:h-[640px]">
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

          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2">
              <div className="text-xs font-black text-neutral-950">
                LIVE 채팅
              </div>
              <button
                type="button"
                onClick={onOpenChat}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-black text-neutral-600 active:scale-[0.98]"
              >
                크게 보기
              </button>
            </div>

            <div className="h-[420px] xl:h-[560px] 2xl:h-[640px]">
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
      )}

      <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold leading-relaxed text-neutral-500">
        영상은 유튜브 기본 플레이어라 재생/일시정지/음소거/소리 조절은 영상 하단 컨트롤에서 가능합니다.
        채팅 입력은 안전상 넣지 않았습니다. 채팅이 안 보이면 [채팅 새창]을 사용하세요.
      </div>
    </section>
  );
}
