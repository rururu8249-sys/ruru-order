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

type Props = { onOpenAll?: () => void };

export default function LiveIssueRailPanel({ onOpenAll }: Props) {
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
  const recent = open.slice(0, 5);

  return (
    <div className="min-w-0 w-full shrink-0 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-black text-ink">📮 고객이슈</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-black",
              open.length > 0 ? "bg-danger-bg text-danger-tx" : "bg-surface-2 text-ink-mute",
            ].join(" ")}
          >
            미해결 {open.length}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            title="새로고침"
            className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-black text-ink-soft transition hover:bg-surface-3"
          >
            ↻
          </button>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="rounded-lg bg-surface-2 px-3 py-4 text-center text-[11px] font-bold text-ink-mute">
          {loading ? "불러오는 중…" : "미해결 고객이슈 없음 👍"}
        </div>
      ) : (
        <ul className="space-y-1">
          {recent.map((t, i) => (
            <li key={String(t.id ?? i)} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-black text-ink">{t.title || "제목 없음"}</div>
                <div className="truncate text-[10px] font-bold text-ink-mute">
                  {t.customer_nickname || ""}
                  {t.created_at ? ` · ${timeLabel(t.created_at)}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onOpenAll}
        className="mt-2 w-full rounded-lg border border-line bg-surface-2 py-1.5 text-[11px] font-black text-ink-soft transition hover:bg-surface-3"
      >
        고객이슈 전체 보기 · 처리 →
      </button>
    </div>
  );
}
