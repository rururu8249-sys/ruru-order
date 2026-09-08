"use client";

// components/admin-live/AdminLiveBroadcastRail.tsx
// [2026-09-08 5단계 · 레이아웃 B] 오른쪽 접이식 「방송 · 채팅」 레일.
//   · 어느 화면에 있든 방송 화면·라이브 채팅이 옆에 붙어 있다. 손잡이(◀/▶)로 접었다 펼친다.
//   · 방송 시작/종료 · 카톡 · 카드결제 · 알림음(예전 사이드바 「빠른보기」)을 여기로 모았다.
//   · 접혀 있어도 영상·채팅은 마운트 유지(hidden) — 유튜브 iframe 이 다시 로드되지 않게.
//   · 돈/포인트 로직 없음. 방송 시작/종료는 부모 핸들러(확인창 포함) 그대로.

import LiveBroadcastPanels from "./LiveBroadcastPanels";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  open: boolean;
  onToggle: () => void;
  broadcastOn: boolean;
  videoRatio: VideoRatio;
  youtubeUrl: string;
  activeBroadcastId: string | null;
};

export default function AdminLiveBroadcastRail({
  open,
  onToggle,
  broadcastOn,
  videoRatio,
  youtubeUrl,
  activeBroadcastId,
}: Props) {
  return (
    <>
      {/* 손잡이 — 항상 화면 오른쪽 가장자리 */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "방송·채팅 접기" : "방송·채팅 펼치기"}
        title={open ? "방송·채팅 접기" : "방송·채팅 펼치기"}
        className={[
          "fixed right-0 top-1/2 z-[45] -translate-y-1/2 rounded-l-2xl border border-r-0 px-2 py-5 text-[12px] font-black shadow-lg transition",
          broadcastOn ? "border-danger-tx/40 bg-danger-bg text-danger-tx" : "border-line bg-surface text-ink-soft hover:bg-surface-2",
        ].join(" ")}
        style={{ writingMode: "vertical-rl" }}
      >
        {open ? "▶ 접기" : `◀ 방송·채팅${broadcastOn ? " · LIVE" : ""}`}
      </button>

      {/* [2026-09-08] 오른쪽에서 밀려 나오는 사이드 팝업(본문 위로 덮음). 크기는 한 가지(420px) — 「크게(2/3)」는 사장님 판단으로 삭제.
          접혀 있어도 마운트는 유지(유튜브 iframe 재로드 방지) — 화면 밖으로 밀어 둔다. */}
      <div
        onClick={onToggle}
        aria-hidden={!open}
        className={[
          "fixed inset-0 z-[44] bg-slate-950/35 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <aside
        aria-label="방송 · 채팅"
        aria-hidden={!open}
        className={[
          "fixed inset-y-0 right-0 z-[46] flex flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-3 shadow-2xl transition-transform duration-300",
          "w-[420px] min-w-[320px] max-w-[92vw]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* [2026-09-08 사장님 지적] 알림음·카톡채널·카드결제는 화면과 상관없이 늘 쓰는 것 → 사이드바로 옮겼다.
            여기(레일)는 «방송화면 + 라이브채팅»만 본다. */}
        <div className="mb-1 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-black text-ink">
            <span className={`inline-block h-2 w-2 rounded-full ${broadcastOn ? "bg-danger-tx" : "bg-line"}`} />
            {broadcastOn ? "방송 중" : "방송 대기"}
          </div>
          <span className="flex items-center gap-1">
            <button type="button" onClick={onToggle} className="rounded-lg px-2 py-0.5 text-[11px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink">
              접기 ▶
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <LiveBroadcastPanels variant="column" hideProducts videoRatio={videoRatio} youtubeUrl={youtubeUrl} activeBroadcastId={activeBroadcastId} />
        </div>
      </aside>
    </>
  );
}
