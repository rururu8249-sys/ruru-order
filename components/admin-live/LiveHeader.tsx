"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminLiveBroadcast } from "./liveBroadcastController";
import { formatBroadcastTime } from "./liveBroadcastController";
import AdminLiveEventRoulettePanel from "./AdminLiveEventRoulettePanel";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  onVideoRatioChange: (value: VideoRatio) => void;
  activeBroadcast: AdminLiveBroadcast | null;
  savingBroadcast?: boolean;
  onStartBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  onEndBroadcast: () => Promise<void> | void;
  onSaveBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
};

function todayLabel() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
}

export default function LiveHeader({
  videoRatio,
  onVideoRatioChange,
  activeBroadcast,
  savingBroadcast = false,
  onStartBroadcast,
  onEndBroadcast,
  onSaveBroadcast,
}: Props) {
  const [title, setTitle] = useState("루루동이LIVE");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [titleSavedAt, setTitleSavedAt] = useState("");
  const [urlAppliedAt, setUrlAppliedAt] = useState("");

  useEffect(() => {
    if (!activeBroadcast) return;

    setTitle(activeBroadcast.public_title || "루루동이LIVE");
    setYoutubeUrl(activeBroadcast.youtube_live_url || "");
  }, [activeBroadcast?.id]);

  const statusLabel = useMemo(() => {
    if (activeBroadcast) return "방송중";
    return "대기";
  }, [activeBroadcast]);

  const saveCurrentBroadcast = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setTitleSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  const applyYoutubeUrl = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setUrlAppliedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  return (
    <header className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-[25px] font-black tracking-tight text-rose-deep">방송 컨트롤타워</h1>

        <div className="hidden h-7 w-px bg-slate-200 md:block" />

        <div className="text-xs font-black text-slate-500">📅 {todayLabel()}</div>

        <div
          className={[
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
            statusLabel === "방송중" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
          {statusLabel}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AdminLiveEventRoulettePanel
            buttonLabel="🎁 이벤트"
            buttonClassName="inline-flex shrink-0 rounded-xl font-black disabled:bg-slate-300 items-center justify-center whitespace-nowrap h-9 px-3 text-xs transition bg-violet-600 text-white hover:bg-violet-700"
          />
          <button
            type="button"
            disabled={savingBroadcast || Boolean(activeBroadcast)}
            onClick={() => onStartBroadcast({ title, youtubeUrl })}
            className="h-9 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-300"
          >
            ▶ 방송시작
          </button>
          <button
            type="button"
            disabled={savingBroadcast || !activeBroadcast}
            onClick={onEndBroadcast}
            className="h-9 rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:bg-slate-300"
          >
            ■ 방송종료
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[0.92fr_1.18fr_132px]">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] font-black text-slate-500">방송 제목</label>
            <span className="text-[10px] font-bold text-slate-400">
              {titleSavedAt ? `저장 ${titleSavedAt}` : activeBroadcast ? "방송중" : "저장 필요"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-line focus:ring-4 focus:ring-blue-50"
            />
            <button
              type="button"
              disabled={savingBroadcast || !activeBroadcast}
              onClick={saveCurrentBroadcast}
              className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white hover:bg-rose-deep/90 disabled:bg-slate-300"
            >
              저장
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] font-black text-slate-500">유튜브 라이브 URL</label>
            <span className="text-[10px] font-bold text-slate-400">
              {urlAppliedAt ? `적용 ${urlAppliedAt}` : "영상/채팅 연결"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-line focus:ring-4 focus:ring-blue-50"
            />
            <button
              type="button"
              disabled={savingBroadcast || !activeBroadcast}
              onClick={applyYoutubeUrl}
              className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white hover:bg-rose-deep/90 disabled:bg-slate-300"
            >
              적용
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-black text-slate-500">방송화면 비율</label>
          <select
            value={videoRatio}
            onChange={(event) => onVideoRatioChange(event.target.value as VideoRatio)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-rose-line focus:ring-4 focus:ring-blue-50"
          >
            <option value="vertical">세로 9:16</option>
            <option value="wide">가로 16:9</option>
            <option value="auto">자동</option>
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] font-black text-slate-500 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          시작시간 <span className="ml-1 text-slate-900">{activeBroadcast?.started_at ? formatBroadcastTime(activeBroadcast.started_at) : "방송시작 전"}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          주문묶음 <span className="ml-1 text-rose-deep">방송 시작~종료 시간 기준</span>
        </div>
      </div>
    </header>
  );
}
