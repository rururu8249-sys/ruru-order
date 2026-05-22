"use client";

import { useMemo, useState } from "react";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  onVideoRatioChange: (value: VideoRatio) => void;
};

function nowLabel() {
  return new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LiveHeader({ videoRatio, onVideoRatioChange }: Props) {
  const [title, setTitle] = useState("루루동이LIVE 여름 신발 특가 라이브");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [titleSavedAt, setTitleSavedAt] = useState("");
  const [urlAppliedAt, setUrlAppliedAt] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");

  const statusLabel = useMemo(() => {
    if (startedAt && !endedAt) return "LIVE";
    if (startedAt && endedAt) return "종료";
    return "대기";
  }, [startedAt, endedAt]);

  return (
    <header className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-[25px] font-black tracking-tight text-slate-950">방송 컨트롤타워</h1>

        <div className="hidden h-7 w-px bg-slate-200 md:block" />

        <div className="text-xs font-black text-slate-500">📅 2026.05.23 금요일</div>

        <div
          className={[
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
            statusLabel === "LIVE"
              ? "bg-emerald-50 text-emerald-700"
              : statusLabel === "종료"
                ? "bg-slate-100 text-slate-600"
                : "bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          <span
            className={[
              "h-2 w-2 rounded-full",
              statusLabel === "LIVE" ? "bg-emerald-500" : statusLabel === "종료" ? "bg-slate-400" : "bg-amber-500",
            ].join(" ")}
          />
          {statusLabel}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setStartedAt(nowLabel());
              setEndedAt("");
            }}
            className="h-9 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
          >
            ▶ 방송시작
          </button>
          <button
            onClick={() => setEndedAt(nowLabel())}
            className="h-9 rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-red-700"
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
              {titleSavedAt ? `저장 ${titleSavedAt}` : "저장 필요"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <button
              onClick={() => setTitleSavedAt(nowLabel())}
              className="h-9 shrink-0 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-700"
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
              className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <button
              onClick={() => setUrlAppliedAt(nowLabel())}
              className="h-9 shrink-0 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700"
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
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          >
            <option value="vertical">세로 9:16</option>
            <option value="wide">가로 16:9</option>
            <option value="auto">자동</option>
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] font-black text-slate-500 md:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          시작시간 <span className="ml-1 text-slate-900">{startedAt || "방송시작 전"}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          종료시간 <span className="ml-1 text-slate-900">{endedAt || (startedAt ? "방송중" : "-")}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          주문묶음 <span className="ml-1 text-blue-700">방송 시작~종료 시간 기준</span>
        </div>
      </div>
    </header>
  );
}
