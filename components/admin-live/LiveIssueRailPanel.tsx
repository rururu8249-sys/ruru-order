"use client";

// 방송 우측 레일 "고객이슈" 패널 ("지금 띄운 상품" 자리 대체).
//   방송 중 미해결 고객이슈를 한눈에 보고, '전체 보기'로 고객·이슈 패널(고객 이슈 탭)로 이동.
//   데이터는 기존 고객이슈와 동일(admin_tasks, /api/admin-v2/admin-tasks GET). 읽기 전용.
//   돈/입금/정산/주문 무관.

import { useCallback, useEffect, useState } from "react";

type Task = {
  id?: unknown;
  title?: string | null;
  status?: string | null;
  is_resolved?: boolean | null;
  resolved_at?: string | null;
  customer_nickname?: string | null;
  created_at?: string | null;
};

function isResolved(t: Task) {
  const s = String(t.status || "").toLowerCase();
  return Boolean(
    t.is_resolved ||
      t.resolved_at ||
      s.includes("resolved") ||
      s.includes("done") ||
      s.includes("complete") ||
      s.includes("해결") ||
      s.includes("완료"),
  );
}

function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return (
    d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  );
}

type Props = {
  onOpenAll?: () => void;
  /** [2026-09-21] 미해결 건수를 바깥(탭 배지 등)에 알려준다 — 같은 조회를 두 번 하지 않으려고. */
  onCountChange?: (openCount: number) => void;
  /**
   * 그리는 모양.
   *   "rail"   — 원래 모양(방송 우측 좁은 세로 칸). 목록을 전부 세로로 늘어놓는다.
   *   "banner" — 한 줄 띠. 고객 메뉴 맨 위처럼 «넓은 화면»에 쓴다.
   *
   * [2026-09-21 사장님] 「고객 목록 보는 페이지 맨 위에 떠서 레이아웃이 이상함」
   *   이 패널은 파일 첫 줄대로 «방송 우측 레일»용인데, 고객 메뉴에 전체 폭으로 붙어 있었다.
   *   미해결 11건이 세로로 늘어나 첫 화면을 통째로 먹고 정작 회원 목록은 한참 아래로 밀렸다.
   *   게다가 아래 「고객이슈」 탭이 같은 admin_tasks 를 또 보여줘 내용이 두 번 나왔다.
   *   → 넓은 화면에서는 «한 줄 요약 + 바로 처리 버튼»만 두고, 자세한 건 탭에서 본다.
   */
  variant?: "rail" | "banner";
};

export default function LiveIssueRailPanel({ onOpenAll, onCountChange, variant = "rail" }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin-v2/admin-tasks", { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (r?.ok && Array.isArray(r.tasks)) setTasks(r.tasks as Task[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    const onChanged = () => void load();
    if (typeof window !== "undefined") window.addEventListener("ruru-admin-tasks-changed", onChanged);
    return () => {
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("ruru-admin-tasks-changed", onChanged);
    };
  }, [load]);

  const open = tasks.filter((t) => !isResolved(t));

  useEffect(() => {
    onCountChange?.(open.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.length]);

  if (variant === "banner") {
    // 미해결이 없으면 띠 자체를 안 그린다 — 평소엔 화면이 깨끗해야 한다.
    if (open.length === 0) return null;

    // 가장 오래 묵은 건(=맨 아래로 밀려 잊히기 쉬운 건)을 같이 보여준다.
    const oldest = open.reduce<Task | null>((acc, t) => {
      if (!t.created_at) return acc;
      if (!acc?.created_at) return t;
      return new Date(t.created_at) < new Date(acc.created_at) ? t : acc;
    }, null);

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn-tx/40 bg-warn-bg px-4 py-2.5">
        <span className="text-[13px] font-black text-warn-tx">📮 미해결 고객이슈 {open.length}건</span>
        {oldest?.created_at ? (
          <span className="text-[12px] font-bold text-ink-soft">가장 오래된 건 {timeLabel(oldest.created_at)}</span>
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          title="새로고침"
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={onOpenAll}
          className="ml-auto rounded-lg bg-rose-deep px-3 py-1.5 text-[12px] font-black text-white transition hover:opacity-90"
        >
          바로 처리 →
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full rounded-2xl border border-line bg-surface p-3 shadow-sm flex flex-col xl:h-full">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs font-black text-ink">📮 고객이슈</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[11px] font-black",
              open.length > 0 ? "bg-danger-bg text-danger-tx" : "bg-surface-2 text-ink-mute",
            ].join(" ")}
          >
            미해결 {open.length}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            title="새로고침"
            className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-black text-ink-soft transition hover:bg-surface-3"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {open.length === 0 ? (
          <div className="flex h-full min-h-[64px] items-center justify-center rounded-lg bg-surface-2 px-3 py-4 text-center text-[11px] font-bold text-ink-mute">
            {loading ? "불러오는 중…" : "미해결 고객이슈 없음 👍"}
          </div>
        ) : (
          <ul className="space-y-1">
            {open.map((t, i) => (
              <li key={String(t.id ?? i)} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-danger-tx)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-black text-ink">{t.title || "제목 없음"}</div>
                  <div className="truncate text-[11px] font-bold text-ink-mute">
                    {t.customer_nickname || ""}
                    {t.created_at ? ` · ${timeLabel(t.created_at)}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenAll}
        className="mt-2 shrink-0 w-full rounded-lg border border-line bg-surface-2 py-1.5 text-[11px] font-black text-ink-soft transition hover:bg-surface-3"
      >
        고객이슈 전체 보기 · 처리 →
      </button>
    </div>
  );
}
