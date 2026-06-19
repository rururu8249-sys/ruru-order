"use client";

import { useEffect, useMemo, useState } from "react";

type AdminTaskLike = {
  id?: string | number | null;
  title?: string | null;
  body?: string | null;
  memo?: string | null;
  status?: string | null;
  task_status?: string | null;
  type?: string | null;
  task_type?: string | null;
  customer_id?: string | number | null;
  customer_name?: string | null;
  nickname?: string | null;
  customer_nickname?: string | null;
  youtube_nickname?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

type AdminLiveCustomerIssueSummaryCardProps = {
  onOpenCustomers: () => void;
};

function clean(value: unknown): string {
  return String(value || "").trim();
}

function normalizeTasks(payload: any): AdminTaskLike[] {
  const candidates = [
    payload?.tasks,
    payload?.adminTasks,
    payload?.items,
    payload?.data,
    payload?.rows,
  ];

  const found = candidates.find((item) => Array.isArray(item));
  return Array.isArray(found) ? found : [];
}

function isOpenIssue(task: AdminTaskLike): boolean {
  const haystack = [
    task.title,
    task.body,
    task.memo,
    task.type,
    task.task_type,
    task.customer_id,
    JSON.stringify(task.raw_payload || {}),
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  const status = clean(task.status || task.task_status).toLowerCase();

  const issueLike =
    haystack.includes("고객이슈") ||
    haystack.includes("customerissue") ||
    haystack.includes("customer_issue") ||
    haystack.includes("issue") ||
    Boolean(task.customer_id);

  const closed =
    status.includes("done") ||
    status.includes("resolved") ||
    status.includes("complete") ||
    status.includes("hidden") ||
    status.includes("deleted") ||
    status.includes("해결") ||
    status.includes("완료") ||
    status.includes("삭제") ||
    status.includes("숨김");

  return issueLike && !closed;
}

function getIssueName(task: AdminTaskLike): string {
  const raw = task.raw_payload || {};

  const direct =
    clean(task.nickname) ||
    clean(task.customer_nickname) ||
    clean(task.youtube_nickname) ||
    clean(task.customer_name) ||
    clean(raw.nickname) ||
    clean(raw.customerNickname) ||
    clean(raw.customer_nickname) ||
    clean(raw.youtubeNickname) ||
    clean(raw.youtube_nickname) ||
    clean(raw.customerName) ||
    clean(raw.name);

  if (direct) return direct;

  const title = clean(task.title).replace("[고객이슈]", "").trim();

  if (title) {
    const first = title.split("-")[0]?.split("/")[0]?.trim();
    if (first) return first;
  }

  return "고객";
}

function getIssueType(task: AdminTaskLike): string {
  const text = [
    task.title,
    task.body,
    task.memo,
    JSON.stringify(task.raw_payload || {}),
  ].map(clean).join(" ");

  if (/환불/.test(text)) return "환불";
  if (/교환/.test(text)) return "교환";
  if (/반품/.test(text)) return "반품";
  if (/배송/.test(text)) return "배송";
  if (/입금/.test(text)) return "입금";
  return "기타";
}

export default function AdminLiveCustomerIssueSummaryCard({
  onOpenCustomers,
}: AdminLiveCustomerIssueSummaryCardProps) {
  const [tasks, setTasks] = useState<AdminTaskLike[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIssues = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setTasks([]);
        return;
      }

      setTasks(normalizeTasks(payload).filter(isOpenIssue));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();

    const handler = () => loadIssues();
    window.addEventListener("ruru-admin-task-updated", handler);

    return () => {
      window.removeEventListener("ruru-admin-task-updated", handler);
    };
  }, []);

  const previewIssues = useMemo(() => tasks.slice(0, 3), [tasks]);
  const typeSummary = useMemo(() => {
    const counts = tasks.reduce<Record<string, number>>((acc, task) => {
      const type = getIssueType(task);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .slice(0, 3)
      .map(([type, count]) => `${type} ${count}`)
      .join(" / ");
  }, [tasks]);

  return (
    <div className="rounded-2xl border border-warn-tx bg-warn-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-amber-900">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-amber-600 shadow-sm">
            !
          </span>
          <span className="truncate">고객이슈</span>
        </div>

        <button
          type="button"
          onClick={loadIssues}
          className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-black text-warn-tx ring-1 ring-amber-100"
        >
          {loading ? "확인중" : `${tasks.length}건`}
        </button>
      </div>

      {tasks.length ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-black text-amber-900">
            {typeSummary || "확인필요"}
          </p>

          <div className="space-y-1">
            {previewIssues.map((task, index) => (
              <div
                key={String(task.id || `${getIssueName(task)}-${index}`)}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface px-2.5 py-1.5 text-[11px] ring-1 ring-amber-100"
              >
                <span className="min-w-0 truncate font-black text-ink">
                  {getIssueName(task)}
                </span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-black text-warn-tx">
                  {getIssueType(task)}
                </span>
              </div>
            ))}
          </div>

          {tasks.length > previewIssues.length ? (
            <p className="text-[10px] font-bold text-warn-tx">
              외 {tasks.length - previewIssues.length}건 더 있음
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] font-bold leading-5 text-warn-tx">
          {loading ? "고객이슈를 불러오는 중입니다." : "미해결 고객이슈가 없습니다."}
        </p>
      )}

      <button
        type="button"
        onClick={onOpenCustomers}
        className="mt-2 w-full rounded-xl bg-surface px-3 py-2 text-[11px] font-black text-warn-tx ring-1 ring-amber-100 transition hover:bg-amber-100"
      >
        고객관리로 이동
      </button>
    </div>
  );
}
