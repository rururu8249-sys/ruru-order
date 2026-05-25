"use client";

import { showAdminToast } from "@/lib/adminToast";

// components/admin-v2/today/AdminTodayPersistentTasks.tsx
// 목적: 고객 이슈 큐를 해결 전까지 표시하고, 많아지면 페이지/더보기로 관리
// 주의: 주문/입금/배송/정산 상태 변경 없음. admin_tasks 서버 API만 사용.

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

const PAGE_SIZE = 4;

export default function AdminTodayPersistentTasks() {
  const [tasks, setTasks] = useState<AdminTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [viewMode, setViewMode] = useState<AdminTaskViewMode>("open");
  const [activeFilter, setActiveFilter] = useState<AdminTaskFilter>("all");
  const [draftSearchText, setDraftSearchText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedTask, setSelectedTask] = useState<AdminTaskRow | null>(null);
  const [page, setPage] = useState(1);
  const [moreOpen, setMoreOpen] = useState(false);

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
    window.addEventListener("ruru-admin-task-updated", refresh);

    return () => {
      window.removeEventListener("ruru-admin-task-created", refresh);
      window.removeEventListener("ruru-admin-task-updated", refresh);
    };
  }, [loadTasks]);

  useEffect(() => {
    setPage(1);
  }, [viewMode, activeFilter, searchText]);

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

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleTasks = filteredTasks.slice(pageStart, pageStart + PAGE_SIZE);

  const resolveTask = async (task: AdminTaskRow, note = "") => {
    const taskId = String(
      (task as unknown as { id?: string; task_id?: string; taskId?: string }).id ||
        (task as unknown as { id?: string; task_id?: string; taskId?: string }).task_id ||
        (task as unknown as { id?: string; task_id?: string; taskId?: string }).taskId ||
        ""
    ).trim();

    if (!taskId) {
      showAdminToast("고객 이슈 ID를 찾지 못했습니다. 새로고침 후 다시 시도해주세요.");
      return;
    }

    const ok = window.confirm(`고객 이슈를 해결완료 처리할까요?\n\n${task.title}`);

    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: taskId,
        task_id: taskId,
        action: "resolve",
        resolved_note: note.trim() || "관리자 해결완료 처리",
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      showAdminToast("해결완료 처리 실패\n\n" + (result?.message || "알 수 없는 오류"));
      return;
    }

    setSelectedTask(null);
    await loadTasks();
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
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
              실제 등록된 고객 이슈만 표시합니다.
            </p>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={loadTasks}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
            >
              더보기
            </button>
          </div>
        </div>

        <AdminTodayTaskModeTabs
          value={viewMode}
          openCount={openTasks.length}
          resolvedCount={resolvedTasks.length}
          onChange={(nextMode) => {
            setViewMode(nextMode);
            setActiveFilter("all");
            setDraftSearchText("");
            setSearchText("");
            setSelectedTask(null);
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
          <>
            <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
              {visibleTasks.map((task) => (
                <AdminTodayTaskCard
                  key={task.id}
                  task={task}
                  canResolve={viewMode === "open"}
                  onOpenDetail={setSelectedTask}
                  onResolve={resolveTask}
                />
              ))}
            </div>

            <IssuePagination
              page={safePage}
              totalPages={totalPages}
              totalCount={filteredTasks.length}
              onPageChange={setPage}
            />
          </>
        ) : null}

        <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-[11px] font-bold text-neutral-400">
          해결완료 처리된 이슈는 완료 이력으로 이동합니다.
        </div>
      </section>

      {moreOpen ? (
        <IssueMoreDrawer
          tasks={filteredTasks}
          viewMode={viewMode}
          onClose={() => setMoreOpen(false)}
          onOpenDetail={setSelectedTask}
          onResolve={resolveTask}
        />
      ) : null}

      <AdminTodayTaskDetailDrawer
        task={selectedTask}
        canResolve={viewMode === "open"}
        onClose={() => setSelectedTask(null)}
        onResolve={resolveTask}
      />
    </>
  );
}

function IssuePagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <div className="mt-3 text-center text-[11px] font-bold text-neutral-400">
        총 {totalCount.toLocaleString()}건
      </div>
    );
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 7);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-black text-neutral-600 disabled:opacity-30"
      >
        이전
      </button>

      {pages.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPageChange(item)}
          className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black ${
            item === page
              ? "bg-neutral-950 text-white"
              : "border border-neutral-200 bg-white text-neutral-600"
          }`}
        >
          {item}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-black text-neutral-600 disabled:opacity-30"
      >
        다음
      </button>
    </div>
  );
}

function IssueMoreDrawer({
  tasks,
  viewMode,
  onClose,
  onOpenDetail,
  onResolve,
}: {
  tasks: AdminTaskRow[];
  viewMode: AdminTaskViewMode;
  onClose: () => void;
  onOpenDetail: (task: AdminTaskRow) => void;
  onResolve: (task: AdminTaskRow, note?: string) => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/30">
      <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-black tracking-[-0.05em] text-neutral-950">
              고객 이슈 전체보기
            </h2>
            <p className="mt-1 text-xs font-bold text-neutral-500">
              현재 조건 기준 {tasks.length.toLocaleString()}건을 한 번에 확인합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full bg-neutral-950 px-4 text-xs font-black text-white active:scale-[0.98]"
          >
            닫기
          </button>
        </div>

        <div className="grid flex-1 gap-2 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
              표시할 고객 이슈가 없습니다.
            </div>
          ) : (
            tasks.map((task) => (
              <AdminTodayTaskCard
                key={`drawer-${task.id}`}
                task={task}
                canResolve={viewMode === "open"}
                onOpenDetail={onOpenDetail}
                onResolve={onResolve}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
