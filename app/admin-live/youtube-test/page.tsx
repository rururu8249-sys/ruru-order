"use client";

import { useMemo, useState } from "react";

function extractYoutubeVideoId(rawUrl?: string | null) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").split("?")[0];
    }

    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;

    const pathParts = url.pathname.split("/").filter(Boolean);

    const liveIndex = pathParts.indexOf("live");
    if (liveIndex >= 0 && pathParts[liveIndex + 1]) return pathParts[liveIndex + 1];

    const embedIndex = pathParts.indexOf("embed");
    if (embedIndex >= 0 && pathParts[embedIndex + 1]) return pathParts[embedIndex + 1];

    return "";
  } catch {
    const match = value.match(/(?:v=|youtu\.be\/|live\/|embed\/)([a-zA-Z0-9_-]{6,})/);
    return match?.[1] || "";
  }
}

export default function YoutubeLiveTestPage() {
  const [url, setUrl] = useState("");
  const [appliedUrl, setAppliedUrl] = useState("");

  const videoId = useMemo(() => extractYoutubeVideoId(appliedUrl), [appliedUrl]);

  const embedDomain =
    typeof window !== "undefined" ? window.location.hostname : "localhost";

  const videoEmbedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`
    : "";

  const chatEmbedUrl = videoId
    ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${embedDomain}`
    : "";

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.18em] text-blue-600">
                DB SAFE TEST
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.05em]">
                유튜브 라이브 iframe 테스트
              </h1>
              <p className="mt-2 text-sm font-bold text-slate-500">
                이 페이지는 방송시작/종료, 주문, 입금, 정산 DB를 전혀 수정하지 않습니다.
              </p>
            </div>

            <a
              href="/admin-live"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              ← 컨트롤타워로 돌아가기
            </a>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_120px]">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setAppliedUrl(url.trim());
              }}
              placeholder="유튜브 라이브 URL 붙여넣기: https://www.youtube.com/watch?v=..."
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              onClick={() => setAppliedUrl(url.trim())}
              className="h-12 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
            >
              테스트 적용
            </button>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-6 text-slate-500">
            추출된 videoId:{" "}
            <span className="font-black text-slate-950">{videoId || "아직 없음"}</span>
            <br />
            채팅은 유튜브 라이브 공개상태, 퍼가기 허용, embed_domain 정책에 따라 안 뜰 수 있습니다.
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">방송화면 테스트</h2>
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                YouTube Video
              </span>
            </div>

            <div className="flex h-[620px] items-center justify-center rounded-3xl bg-slate-950 p-3">
              <div className="aspect-[9/16] h-full overflow-hidden rounded-[28px] bg-black">
                {videoEmbedUrl ? (
                  <iframe
                    title="YouTube live video test"
                    src={videoEmbedUrl}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-900 p-6 text-center text-white">
                    <div>
                      <div className="text-5xl">📺</div>
                      <div className="mt-4 text-lg font-black">URL을 넣고 테스트 적용</div>
                      <div className="mt-2 text-xs font-bold text-slate-400">
                        실제 방송 DB에는 저장되지 않습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">라이브 채팅 테스트</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                채팅 연결
              </span>
            </div>

            <div className="h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              {chatEmbedUrl ? (
                <iframe
                  title="YouTube live chat test"
                  src={chatEmbedUrl}
                  className="h-full w-full bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div>
                    <div className="text-5xl">💬</div>
                    <div className="mt-4 text-lg font-black text-slate-700">채팅 연결 대기</div>
                    <div className="mt-2 text-sm font-bold leading-6 text-slate-400">
                      URL 적용 후 이 영역에 채팅 iframe을 띄웁니다.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
