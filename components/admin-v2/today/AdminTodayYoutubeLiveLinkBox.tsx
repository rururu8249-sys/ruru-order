"use client";

// components/admin-v2/today/AdminTodayYoutubeLiveLinkBox.tsx
// 목적: 유튜브 방송 URL/영상ID 입력 및 채팅창 열기

export default function AdminTodayYoutubeLiveLinkBox({
  liveUrl,
  videoId,
  setLiveUrl,
  onSave,
  onOpenWatch,
  onOpenChat,
}: {
  liveUrl: string;
  videoId: string;
  setLiveUrl: (value: string) => void;
  onSave: () => void;
  onOpenWatch: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <div className="grid gap-2 xl:grid-cols-[1fr_auto_auto_auto] xl:items-center">
        <div className="min-w-0">
          <input
            value={liveUrl}
            onChange={(event) => setLiveUrl(event.target.value)}
            placeholder="유튜브 라이브 URL 또는 영상ID"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
          />
          <div className="mt-1 text-[11px] font-bold text-neutral-400">
            영상ID: {videoId || "아직 없음"}
          </div>
        </div>

        <button
          type="button"
          onClick={onSave}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
        >
          저장
        </button>

        <button
          type="button"
          onClick={onOpenWatch}
          className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
        >
          유튜브
        </button>

        <button
          type="button"
          onClick={onOpenChat}
          className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
        >
          채팅
        </button>
      </div>
    </div>
  );
}
