"use client";

// components/admin-live/LiveMissionGauge.tsx
// [2026-09-08 4단계-B] 방송 콘솔에 붙는 미션 게이지 — 읽기 전용(GET /api/admin-live/mission 10초마다).
//   미션이 켜져 있고 목표가 있을 때만 보인다. 돈/포인트 로직 없음.

import { useEffect, useState } from "react";

type Progress = {
  active: boolean;
  goalType: "count" | "amount";
  goal: number;
  reward: number;
  title: string;
  current: number;
  pct: number;
};

type Props = {
  /** 방송이 켜져 있을 때만 폴링한다 */
  broadcastOn: boolean;
  /** 「수정」 → 이벤트 › 미션 탭 열기 */
  onOpenMission?: () => void;
};

const won = (n: number) => Number(n || 0).toLocaleString("ko-KR");

export default function LiveMissionGauge({ broadcastOn, onOpenMission }: Props) {
  const [prog, setProg] = useState<Progress | null>(null);

  useEffect(() => {
    if (!broadcastOn) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin-live/mission", { cache: "no-store" });
        const j = (await res.json()) as Progress & { ok?: boolean };
        if (!alive) return;
        setProg(j && j.ok ? j : null);
      } catch {
        /* 조회 실패 — 이전 표시 유지 */
      }
    };
    void load();
    const t = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [broadcastOn]);

  if (!broadcastOn || !prog || !prog.active || !(prog.goal > 0)) return null;

  const unit = prog.goalType === "amount" ? "원" : "개";
  const achieved = prog.pct >= 100;

  return (
    <div className={`mb-3 rounded-2xl border px-4 py-3 ${achieved ? "border-ok-tx/40 bg-ok-bg" : "border-rose-line bg-rose-soft"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-black text-ink">
          🎯 {prog.title || "오늘의 미션"}
          <span className={`ml-2 text-xs font-black ${achieved ? "text-ok-tx" : "text-rose-deep"}`}>
            {achieved ? "달성! 방송 종료 때 지급 버튼이 나옵니다" : `${prog.pct}%`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
          <span>
            {won(prog.current)}{unit} / 목표 {won(prog.goal)}{unit}
            {prog.reward > 0 ? ` · 달성 시 구매자 전원 ${won(prog.reward)}P` : " · 달성 시 선물(명단은 미션 탭)"}
          </span>
          {onOpenMission ? (
            <button type="button" onClick={onOpenMission} className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2">
              수정
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full transition-all ${achieved ? "bg-ok-tx" : "bg-rose-deep"}`} style={{ width: `${Math.min(100, Math.max(0, prog.pct))}%` }} />
      </div>
    </div>
  );
}
