"use client";

import { useMemo, useState } from "react";
import type { AdminLiveBroadcast } from "./liveBroadcastController";
import { formatBroadcastTime } from "./liveBroadcastController";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  onVideoRatioChange: (value: VideoRatio) => void;
  activeBroadcast: AdminLiveBroadcast | null;
  savingBroadcast?: boolean;
  onStartBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  onEndBroadcast: () => Promise<void> | void;
  onSaveBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  title: string;
  onTitleChange: (value: string) => void;
  youtubeUrl: string;
  onYoutubeUrlChange: (value: string) => void;
  // 자리만(다음 단계 연결): 새 방송 생성 / 진열 상품 수
  onCreateBroadcast?: () => void;
  productCount?: number;
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
  title,
  onTitleChange,
  youtubeUrl,
  onYoutubeUrlChange,
  onCreateBroadcast,
  productCount,
}: Props) {
  const [titleSavedAt, setTitleSavedAt] = useState("");
  const [urlAppliedAt, setUrlAppliedAt] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  // 쇼핑몰 열기/닫기 토글 — 자리만(저장 컬럼 없음, 다음 단계 연결)
  const [shopOpenPlaceholder, setShopOpenPlaceholder] = useState(true);

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
    <header className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      {/* 상단줄: 제목 + 날짜 + 상태배지 + [＋새 방송][▶방송시작][■방송종료] */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-[20px] font-black tracking-tight text-rose-deep">방송 컨트롤타워</h1>

        <div className="hidden h-6 w-px bg-slate-200 md:block" />

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
          {/* ＋새 방송 — 자리만(다음 단계: onCreateBroadcast 연결). 방송시작과 분리된 별도 흐름 */}
          <button
            type="button"
            onClick={() => onCreateBroadcast?.()}
            className="h-9 rounded-xl border border-rose-line bg-rose-soft px-3.5 text-sm font-black text-rose-deep transition hover:bg-rose-soft/70"
          >
            ＋ 새 방송
          </button>
          <button
            type="button"
            disabled={savingBroadcast || Boolean(activeBroadcast)}
            onClick={() => onStartBroadcast({ title, youtubeUrl })}
            className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-300"
          >
            ▶ 방송시작
          </button>
          <button
            type="button"
            disabled={savingBroadcast || !activeBroadcast}
            onClick={onEndBroadcast}
            className="h-9 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:bg-slate-300"
          >
            ■ 방송종료
          </button>
        </div>
      </div>

      {/* 압축 상태바: ● 방송명 · 상품 N개 · 시작시간 + 우측 [쇼핑몰 토글][URL 수정] */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
        <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
        <span className="text-slate-900">{title.trim() || activeBroadcast?.public_title || "방송명 미설정"}</span>
        <span className="text-slate-300">·</span>
        <span>상품 {typeof productCount === "number" ? productCount : "—"}개</span>
        <span className="text-slate-300">·</span>
        <span>{activeBroadcast?.started_at ? `시작 ${formatBroadcastTime(activeBroadcast.started_at)}` : "방송시작 전"}</span>
        <span className="hidden text-slate-400 md:inline">· 주문묶음=방송 시작~종료 기준</span>

        <div className="ml-auto flex items-center gap-2">
          {/* 쇼핑몰 열기/닫기 — 자리만(저장 컬럼 없음, 다음 단계 연결) */}
          <button
            type="button"
            onClick={() => setShopOpenPlaceholder((v) => !v)}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition",
              shopOpenPlaceholder ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500",
            ].join(" ")}
            title="쇼핑몰 열기/닫기 (다음 단계 연결)"
          >
            🛍 쇼핑몰 {shopOpenPlaceholder ? "열림" : "닫힘"}
          </button>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-100"
          >
            {editOpen ? "닫기 ▲" : "제목·URL 수정 ▼"}
          </button>
        </div>
      </div>

      {/* 인라인 편집(접힘): 평소엔 숨김. controlled 값/onChange/저장·적용 disabled 그대로 */}
      {editOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
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
                onChange={(event) => onTitleChange(event.target.value)}
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
                onChange={(event) => onYoutubeUrlChange(event.target.value)}
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
        </div>
      ) : null}
    </header>
  );
}
