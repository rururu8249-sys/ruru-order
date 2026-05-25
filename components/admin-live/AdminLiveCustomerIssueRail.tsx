"use client";

// components/admin-live/AdminLiveCustomerIssueRail.tsx
// 목적: 고객관리 오른쪽 고객이슈 패널
// 주의: 1차는 읽기전용 조회/표시 전용. 해결완료/수정/삭제/차단 저장 로직 없음.

import { useEffect, useMemo, useState } from "react";
import { CUSTOMER_TERMS } from "./adminLiveCustomerTerms";

type AdminIssueTask = {
  id?: string | number | null;
  title?: string | null;
  body?: string | null;
  task_type?: string | null;
  status?: string | null;
  priority?: string | null;
  customer_id?: string | number | null;
  customer_nickname?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  completed_at?: string | null;
  is_resolved?: boolean | null;
  raw_payload?: Record<string, unknown> | null;
};

type IssueTab = "open" | "all" | "resolved";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePayload(payload: unknown): AdminIssueTask[] {
  const row = payload as {
    tasks?: AdminIssueTask[];
    adminTasks?: AdminIssueTask[];
    data?: AdminIssueTask[];
    items?: AdminIssueTask[];
  };

  if (Array.isArray(payload)) return payload as AdminIssueTask[];
  if (Array.isArray(row?.tasks)) return row.tasks;
  if (Array.isArray(row?.adminTasks)) return row.adminTasks;
  if (Array.isArray(row?.data)) return row.data;
  if (Array.isArray(row?.items)) return row.items;

  return [];
}

function isResolved(task: AdminIssueTask) {
  const status = clean(task.status).toLowerCase();
  return Boolean(
    task.is_resolved ||
      task.resolved_at ||
      task.completed_at ||
      status.includes("resolved") ||
      status.includes("done") ||
      status.includes("complete") ||
      status.includes("해결") ||
      status.includes("완료")
  );
}

function taskKey(task: AdminIssueTask, index: number) {
  return clean(task.id) || `${clean(task.title)}-${clean(task.created_at)}-${index}`;
}

function getNickname(task: AdminIssueTask) {
  const rawPayload = task.raw_payload || {};
  return (
    clean(task.customer_nickname) ||
    clean(rawPayload["nickname"]) ||
    clean(rawPayload["youtube_nickname"]) ||
    clean(task.title).replace("[고객이슈]", "").split("-")[0]?.trim() ||
    "-"
  );
}

function getName(task: AdminIssueTask) {
  const rawPayload = task.raw_payload || {};
  return clean(task.customer_name) || clean(rawPayload["name"]) || clean(rawPayload["customer_name"]) || "-";
}

function getPhone(task: AdminIssueTask) {
  const rawPayload = task.raw_payload || {};
  return clean(task.customer_phone) || clean(rawPayload["phone"]) || clean(rawPayload["customer_phone"]) || "-";
}

function getIssueText(task: AdminIssueTask) {
  const text = clean(task.body);
  if (!text) return clean(task.title).replace("[고객이슈]", "").trim() || "고객이슈 내용 없음";

  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  const contentLine =
    lines.find((line) => line.startsWith("내용:")) ||
    lines.find((line) => !line.includes(":")) ||
    lines[0] ||
    text;

  return contentLine.replace(/^내용:\s*/, "").trim();
}

function dateLabel(value: unknown) {
  const text = clean(value);
  if (!text) return "-";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IssueCard({ task, index }: { task: AdminIssueTask; index: number }) {
  const done = isResolved(task);
  const nickname = getNickname(task);
  const issueText = getIssueText(task);

  return (
    <article
      key={taskKey(task, index)}
      className={`rounded-2xl border p-3 shadow-sm ${
        done ? "border-slate-100 bg-slate-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                done ? "bg-slate-200 text-slate-600" : "bg-red-100 text-red-700"
              }`}
            >
              {done ? CUSTOMER_TERMS.issueResolved : CUSTOMER_TERMS.issueOpen}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-100">
              {clean(task.task_type) || "기타"}
            </span>
          </div>

          <div className="mt-2 truncate text-[15px] font-black text-slate-950" title={nickname}>
            {nickname}
          </div>
        </div>

        <div className="shrink-0 text-right text-[11px] font-black text-slate-400">
          {dateLabel(task.created_at)}
        </div>
      </div>

      <div className="mt-2 line-clamp-3 text-[13px] font-bold leading-relaxed text-slate-700" title={issueText}>
        {issueText}
      </div>

      <div className="mt-3 grid grid-cols-[42px_1fr] gap-y-1 text-[12px] font-bold text-slate-500">
        <div>이름</div>
        <div className="truncate text-slate-800">{getName(task)}</div>
        <div>전화</div>
        <div className="truncate text-slate-800">{getPhone(task)}</div>
      </div>
    </article>
  );
}

export default function AdminLiveCustomerIssueRail() {
  const [activeTab, setActiveTab] = useState<IssueTab>("open");
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);

      try {
        const response = await fetch("/api/admin-v2/admin-tasks", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const rows = normalizePayload(payload).filter((task) => {
          const haystack = [task.title, task.body, task.task_type].map(clean).join(" ");
          return haystack.includes("고객이슈") || haystack.includes("issue") || Boolean(task.customer_id);
        });

        if (alive) setTasks(rows);
      } catch {
        if (alive) setTasks([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const openCount = useMemo(() => tasks.filter((task) => !isResolved(task)).length, [tasks]);
  const resolvedCount = useMemo(() => tasks.filter(isResolved).length, [tasks]);

  const visibleTasks = useMemo(() => {
    if (activeTab === "open") return tasks.filter((task) => !isResolved(task));
    if (activeTab === "resolved") return tasks.filter(isResolved);
    return tasks;
  }, [activeTab, tasks]);

  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">CUSTOMER ISSUE</div>
          <h2 className="mt-1 text-[22px] font-black tracking-[-0.04em] text-slate-950">{CUSTOMER_TERMS.customerIssue}</h2>
          <p className="mt-1 text-[12px] font-bold text-slate-500">고객관리 화면에서 이슈를 같이 확인합니다.</p>
        </div>

        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 p-1">
        {[
          ["open", `미해결 ${openCount}`],
          ["all", `전체 ${tasks.length}`],
          ["resolved", `해결 ${resolvedCount}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as IssueTab)}
            className={`h-9 rounded-xl text-[12px] font-black ${
              activeTab === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
            고객이슈 불러오는 중...
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
            표시할 고객이슈가 없습니다.
          </div>
        ) : (
          visibleTasks.slice(0, 30).map((task, index) => <IssueCard key={taskKey(task, index)} task={task} index={index} />)
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-[12px] font-bold leading-relaxed text-blue-700">
        1차는 조회 전용입니다. 수정·해결완료·차단 저장은 DB 필드 확인 후 2차에서 연결합니다.
      </div>
    </aside>
  );
}
