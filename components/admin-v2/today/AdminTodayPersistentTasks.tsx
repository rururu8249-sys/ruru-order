"use client";

// components/admin-v2/today/AdminTodayPersistentTasks.tsx
// 목적: 직접 등록한 고객 이슈를 해결 전까지 표시하고 완료 이력도 확인
// 주의: 주문/입금/배송/정산 상태 변경 없음. admin_tasks만 조회/완료 처리.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminTaskRow } from "@/lib/admin-v2/types";
import AdminTodayTaskCard from "@/components/admin-v2/today/AdminTodayTaskCard";
import AdminTodayTaskDetailDrawer from "@/components/admin-v2/today/AdminTodayTaskDetailDrawer";
import AdminTodayTaskModeTabs, {
  type AdminTaskViewMode,
} from "@/components/admin-v2/today/AdminTodayTaskModeTabs";
import {
  ADMIN_TASK_FILTERS,
  type AdminTaskFilter,
} from "@/components/admin-v2/today/adminTaskMeta";

const normalize = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, "").toLowerCase();

export default function AdminTodayPersistentTasks() {
  const [tasks, setTasks] = useState<AdminTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [viewMode, setViewMode] = useState<AdminTaskViewMode>("open");
  const [activeFilter, setActiveFilter] = useState<AdminTaskFilter>("all");
  const [draftSearchText, setDraftSearchText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedTask, setSelectedTask] = useState<AdminTaskRow | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "GET",
    });

    const result = await response.json().catch(() => null);

    setLoading(false);

    if (!response.ok || !result?.ok) {
      setErrorText(result?.message || "고객 이슈 조회 실패");
      return;
    }

    setTasks((result.tasks || []) as AdminTaskRow[]);
  }, []);

  useEffect(() => {
    loadTasks();

    const refresh = () => {
      loadTasks();
    };

    window.addEventListener("ruru-admin-task-created", refresh);
    return () => window.removeEventListener("ruru-admin-task-created", refresh);
  }, [loadTasks]);

  const openTasks = useMemo(
    () => tasks.filter((task) => !task.resolved_at),
    [tasks]
  );

  const resolvedTasks = useMemo(
    () => tasks.filter((task) => Boolean(task.resolved_at)),
    [tasks]
  );

  const baseTasks = viewMode === "open" ? openTasks : resolvedTasks;

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: baseTasks.length };

    baseTasks.forEach((task) => {
      const key = task.task_type || "general";
      result[key] = (result[key] || 0) + 1;
    });

    return result;
  }, [baseTasks]);

  const filteredTasks = useMemo(() => {
    const word = normalize(searchText);

    return baseTasks.filter((task) => {
      const taskType = task.task_type || "general";

      if (activeFilter !== "all" && taskType !== activeFilter) {
        return false;
      }

      if (!word) return true;

      const target = normalize(
        [
          task.title,
          task.body,
          task.customer_name,
          task.customer_nickname,
          task.related_product,
          task.source,
          task.task_type,
          task.resolved_note,
        ].join(" ")
      );

      return target.includes(word);
    });
  }, [baseTasks, activeFilter, searchText]);

  const resolveTask = async (task: AdminTaskRow, note = "") => {
    const ok = window.confirm(`고객 이슈를 해결완료 처리할까요?\n\n${task.title}`);

    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: task.id,
        action: "resolve",
        resolved_note: note.trim() || "관리자 해결완료 처리",
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      alert("해결완료 처리 실패\n\n" + (result?.message || "알 수 없는 오류"));
      return;
    }

    setSelectedTask(null);
    await loadTasks();
  };

  const emptyText =
    viewMode === "open"
      ? "처리 대기 고객 이슈가 없습니다."
      : "완료된 고객 이슈 이력이 없습니다.";

  return (
    <>
      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
                고객 이슈 큐
              </h2>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-700">
                미해결 {openTasks.length.toLocaleString()}건
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                완료 {resolvedTasks.length.toLocaleString()}건
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-neutral-500">
              불량·교환·환불·배송·주소확인 이슈는 해결 전까지 계속 표시합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTasks}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
          >
            새로고침
          </button>
        </div>

        <AdminTodayTaskModeTabs
          value={viewMode}
          openCount={openTasks.length}
          resolvedCount={resolvedTasks.length}
          onChange={(nextMode) => {
            setViewMode(nextMode);
            setActiveFilter("all");
            setSelectedTask(null);
            setDraftSearchText("");
            setSearchText("");
          }}
        />

        <div className="mb-3 flex flex-wrap gap-1.5">
          {ADMIN_TASK_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.value;
            const count = counts[filter.value] || 0;

            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`rounded-full px-2.5 py-1.5 text-[11px] font-black active:scale-[0.98] ${
                  isActive
                    ? "bg-neutral-950 text-white"
                    : "border border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                {filter.label} {count}
              </button>
            );
          })}
        </div>

        <div className="mb-3 grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={draftSearchText}
            onChange={(event) => setDraftSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setSearchText(draftSearchText.trim());
            }}
            placeholder="고객명, 닉네임, 상품명, 메모 검색"
            className="h-10 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
          <button
            type="button"
            onClick={() => setSearchText(draftSearchText.trim())}
            className="h-10 rounded-2xl bg-neutral-950 px-4 text-xs font-black text-white active:scale-[0.98]"
          >
            검색
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftSearchText("");
              setSearchText("");
            }}
            className="h-10 rounded-2xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-600 active:scale-[0.98]"
          >
            초기화
          </button>
        </div>

        {errorText ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">
            admin_tasks 조회 실패: {errorText}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-center text-sm font-black text-neutral-400">
            고객 이슈 불러오는 중...
          </div>
        ) : null}

        {!loading && !errorText && baseTasks.length === 0 ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-center text-sm font-black text-neutral-400">
            {emptyText}
          </div>
        ) : null}

        {!loading && !errorText && baseTasks.length > 0 && filteredTasks.length === 0 ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-center text-sm font-black text-neutral-400">
            현재 조건에 맞는 고객 이슈가 없습니다.
          </div>
        ) : null}

        {!loading && !errorText && filteredTasks.length > 0 ? (
          <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
            {filteredTasks.map((task) => (
              <AdminTodayTaskCard
                key={task.id}
                task={task}
                canResolve={viewMode === "open"}
                onOpenDetail={setSelectedTask}
                onResolve={resolveTask}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-[11px] font-bold text-neutral-400">
          해결완료 처리된 이슈는 완료 이력으로 이동합니다.
        </div>
      </section>

      <AdminTodayTaskDetailDrawer
        task={selectedTask}
        canResolve={viewMode === "open"}
        onClose={() => setSelectedTask(null)}
        onResolve={resolveTask}
      />
    </>
  );
}
