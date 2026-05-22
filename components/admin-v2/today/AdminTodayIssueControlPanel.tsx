// components/admin-v2/today/AdminTodayIssueControlPanel.tsx
// 목적: 오늘할일 오른쪽 상단 고객이슈 컨트롤 패널
// 주의: 주문/입금/배송/정산 상태 변경 없음.

"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomerRow, OrderGroup } from "@/lib/admin-v2/types";
import AdminTodayQuickIssueCreate from "@/components/admin-v2/today/AdminTodayQuickIssueCreate";

type IssuePanelTab = "create" | "list";

type AdminIssueTask = {
  id?: string | number;
  task_id?: string | number;
  title?: string | null;
  body?: string | null;
  memo?: string | null;
  content?: string | null;
  task_type?: string | null;
  type?: string | null;
  status?: string | null;
  is_done?: boolean | null;
  completed_at?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  customer_name?: string | null;
  customer_nickname?: string | null;
  customer_phone?: string | null;
  related_product?: string | null;
};

const PAGE_SIZE = 5;

const ISSUE_LABELS = [
  { key: "exchange", label: "교환", words: ["교환", "exchange"], className: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "return", label: "반품", words: ["반품", "return"], className: "bg-violet-100 text-violet-700 border-violet-200" },
  { key: "refund", label: "환불", words: ["환불", "취소", "refund"], className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { key: "purchase", label: "구매", words: ["구매", "추가구매", "상품", "purchase", "product"], className: "bg-green-100 text-green-700 border-green-200" },
  { key: "complaint", label: "진상", words: ["진상", "불만", "주의", "complaint"], className: "bg-rose-100 text-rose-700 border-rose-200" },
  { key: "etc", label: "기타", words: ["기타", "일반", "general", "etc"], className: "bg-neutral-100 text-neutral-700 border-neutral-200" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function taskId(task: AdminIssueTask) {
  return clean(task.id || task.task_id || `${task.created_at}-${task.title}`);
}

function taskText(task: AdminIssueTask) {
  return [
    task.title,
    task.body,
    task.memo,
    task.content,
    task.task_type,
    task.type,
    task.related_product,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function getIssueLabels(task: AdminIssueTask) {
  const target = taskText(task).toLowerCase();

  const matched = ISSUE_LABELS.filter((label) =>
    label.words.some((word) => target.includes(word.toLowerCase()))
  );

  return matched.length > 0 ? matched : [ISSUE_LABELS[ISSUE_LABELS.length - 1]];
}

function isResolved(task: AdminIssueTask) {
  const status = clean(task.status).toLowerCase();

  return (
    Boolean(task.is_done) ||
    Boolean(task.completed_at) ||
    Boolean(task.resolved_at) ||
    ["done", "complete", "completed", "resolved", "closed", "완료", "해결"].includes(status)
  );
}

function formatDate(value: unknown) {
  const raw = clean(value);
  const date = raw ? new Date(raw) : new Date();

  if (!Number.isFinite(date.getTime())) {
    return raw || "-";
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd}(${weekday}) ${hh}:${mi}`;
}

function parseBodyValue(body: string, label: string) {
  const line = body
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${label}:`));

  return clean(line?.replace(`${label}:`, ""));
}

function getNickname(task: AdminIssueTask) {
  const body = clean(task.body || task.memo || task.content);

  return (
    clean(task.customer_nickname) ||
    parseBodyValue(body, "닉네임") ||
    clean(task.title).replace("[고객이슈]", "").split("-")[0]?.trim() ||
    "-"
  );
}

function getName(task: AdminIssueTask) {
  const body = clean(task.body || task.memo || task.content);
  return clean(task.customer_name) || parseBodyValue(body, "이름") || "-";
}

function getPhone(task: AdminIssueTask) {
  const body = clean(task.body || task.memo || task.content);
  return clean(task.customer_phone) || parseBodyValue(body, "전화번호") || "-";
}

function getIssueContent(task: AdminIssueTask) {
  const body = clean(task.body || task.memo || task.content);

  if (!body) {
    return clean(task.title) || "내용 없음";
  }

  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("자동날짜:"))
    .filter((line) => !line.startsWith("이슈유형:"))
    .filter((line) => !line.startsWith("닉네임:"))
    .filter((line) => !line.startsWith("이름:"))
    .filter((line) => !line.startsWith("전화번호:"))
    .filter((line) => !line.startsWith("주문번호:"))
    .filter((line) => !line.startsWith("상품명:"))
    .filter((line) => !line.startsWith("주문금액:"));

  return lines.join(" / ") || clean(task.title) || "내용 없음";
}

function normalizeTasksPayload(payload: any): AdminIssueTask[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.adminTasks)) return payload.adminTasks;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function StatusChip({ done }: { done: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[12px] font-black ${
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-orange-200 bg-orange-50 text-orange-700"
      }`}
    >
      {done ? "완료" : "미해결"}
    </span>
  );
}

function IssuePostItCard({
  task,
  featured,
}: {
  task: AdminIssueTask;
  featured?: boolean;
}) {
  const labels = getIssueLabels(task);
  const done = isResolved(task);
  const mainLabel = labels[0];

  return (
    <article
      className={`relative overflow-hidden border border-yellow-200 bg-[#fff7c9] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        featured ? "rounded-[22px] p-4" : "rounded-2xl p-3"
      }`}
    >
      <div className="pointer-events-none absolute right-2 top-1 rotate-12 text-[24px] opacity-70">
        {featured ? "📎" : "📌"}
      </div>

      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_auto] gap-3 pr-8">
          <div className="min-w-0">
            <div className="grid grid-cols-[64px_1fr] gap-y-1 text-[12px] font-black text-neutral-500">
              <div>닉네임</div>
              <div className="truncate text-neutral-950">{getNickname(task)}</div>

              <div>이름</div>
              <div className="truncate text-neutral-800">{getName(task)}</div>

              <div>전화번호</div>
              <div className="truncate text-neutral-800">{getPhone(task)}</div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusChip done={done} />
            {mainLabel ? (
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${mainLabel.className}`}>
                {mainLabel.label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-yellow-200/80 pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="text-[13px] font-black text-neutral-950">
              {clean(task.title || "").replace("[고객이슈]", "").trim() || "고객이슈 메모"}
            </div>

            {labels.slice(1, 4).map((label) => (
              <span
                key={label.key}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${label.className}`}
              >
                {label.label}
              </span>
            ))}
          </div>

          <div
            className={`rounded-xl border border-yellow-100 bg-white/55 px-3 py-3 text-neutral-900 shadow-sm ${
              featured
                ? "min-h-[86px] text-[14px] font-bold leading-relaxed"
                : "text-[13px] font-bold leading-snug"
            }`}
          >
            {getIssueContent(task)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-neutral-500">
          <span>📅 {formatDate(task.created_at || task.updated_at)}</span>
          <span className="text-neutral-400">메모지 이슈</span>
        </div>
      </div>
    </article>
  );
}

function CustomerIssuePostItList() {
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setTasks([]);
        return;
      }

      setTasks(normalizeTasksPayload(payload));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();

    const reload = () => void loadTasks();
    window.addEventListener("ruru-admin-task-created", reload);
    window.addEventListener("ruru-admin-task-updated", reload);

    return () => {
      window.removeEventListener("ruru-admin-task-created", reload);
      window.removeEventListener("ruru-admin-task-updated", reload);
    };
  }, []);

  const filteredTasks = useMemo(() => {
    const word = appliedKeyword.trim().toLowerCase();

    return tasks
      .filter((task) => {
        const done = isResolved(task);

        if (statusFilter === "open" && done) return false;
        if (statusFilter === "done" && !done) return false;

        if (typeFilter !== "all") {
          const labels = getIssueLabels(task).map((label) => label.key);
          if (!labels.includes(typeFilter)) return false;
        }

        if (!word) return true;

        const target = [
          getNickname(task),
          getName(task),
          getPhone(task),
          getIssueContent(task),
          taskText(task),
        ]
          .join(" ")
          .toLowerCase();

        return target.includes(word);
      })
      .sort((a, b) => {
        const aTime = new Date(String(a.created_at || a.updated_at || 0)).getTime() || 0;
        const bTime = new Date(String(b.created_at || b.updated_at || 0)).getTime() || 0;
        return bTime - aTime;
      });
  }, [tasks, appliedKeyword, statusFilter, typeFilter]);

  const openCount = filteredTasks.filter((task) => !isResolved(task)).length;
  const doneCount = filteredTasks.filter((task) => isResolved(task)).length;
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleTasks = filteredTasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const featuredTask = visibleTasks[0];
  const restTasks = visibleTasks.slice(1);

  const selectFilter = (nextStatus: "all" | "open" | "done", nextType = "all") => {
    setStatusFilter(nextStatus);
    setTypeFilter(nextType);
    setPage(1);
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setAppliedKeyword(keyword);
              setPage(1);
            }
          }}
          placeholder="닉네임, 이름, 전번, 상품명, 메모 검색"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-bold outline-none transition-all duration-150 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-200"
        />

        <button
          type="button"
          onClick={() => {
            setAppliedKeyword(keyword);
            setPage(1);
          }}
          className="h-11 rounded-xl bg-neutral-950 px-4 text-[13px] font-black text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]"
        >
          검색
        </button>

        <button
          type="button"
          onClick={() => {
            setKeyword("");
            setAppliedKeyword("");
            setStatusFilter("all");
            setTypeFilter("all");
            setPage(1);
          }}
          className="h-11 rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-black text-neutral-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-50 hover:shadow-md active:scale-[0.97]"
        >
          초기화
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectFilter("all")}
          className={`rounded-full px-3 py-2 text-[12px] font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.97] ${
            statusFilter === "all" && typeFilter === "all"
              ? "bg-neutral-950 text-white"
              : "border border-neutral-200 bg-white text-neutral-700"
          }`}
        >
          전체 {tasks.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter("open")}
          className={`rounded-full px-3 py-2 text-[12px] font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.97] ${
            statusFilter === "open"
              ? "border border-orange-200 bg-orange-50 text-orange-700"
              : "border border-neutral-200 bg-white text-neutral-700"
          }`}
        >
          미해결 {tasks.filter((task) => !isResolved(task)).length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter("done")}
          className={`rounded-full px-3 py-2 text-[12px] font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.97] ${
            statusFilter === "done"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-neutral-200 bg-white text-neutral-700"
          }`}
        >
          완료 {tasks.filter((task) => isResolved(task)).length}
        </button>
      </div>

      <div className="rounded-[22px] border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[20px] font-black tracking-[-0.04em] text-neutral-950">
              고객 이슈 큐
            </div>
            <div className="mt-1 text-[12px] font-bold text-neutral-500">
              미해결 {openCount}건 · 완료 {doneCount}건 · 고객별 메모지 목록
            </div>
          </div>

          <button
            type="button"
            onClick={loadTasks}
            className="text-[13px] font-black text-neutral-500 transition-all duration-150 hover:text-blue-600 active:scale-[0.96]"
          >
            🔄 새로고침
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-neutral-50 px-4 py-10 text-center text-[13px] font-black text-neutral-400">
            고객이슈 불러오는 중...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl bg-neutral-50 px-4 py-10 text-center text-[13px] font-black text-neutral-400">
            표시할 고객이슈가 없습니다.
          </div>
        ) : (
          <div className="grid gap-3">
            {featuredTask ? <IssuePostItCard task={featuredTask} featured /> : null}
            {restTasks.map((task) => (
              <IssuePostItCard key={taskId(task)} task={task} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-neutral-400">
          총 {filteredTasks.length.toLocaleString("ko-KR")}건
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages, 6) }, (_, index) => index + 1).map((pageNo) => (
            <button
              key={pageNo}
              type="button"
              onClick={() => setPage(pageNo)}
              className={`h-9 w-9 rounded-xl text-[13px] font-black transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] ${
                safePage === pageNo
                  ? "bg-neutral-950 text-white"
                  : "border border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              {pageNo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminTodayIssueControlPanel({
  customers,
  groups,
}: {
  customers: CustomerRow[];
  groups: OrderGroup[];
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<IssuePanelTab>("list");

  const refreshIssuePanel = () => {
    window.dispatchEvent(new Event("ruru-admin-task-created"));
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
  };

  return (
    <section className="rounded-[26px] border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[24px] font-black tracking-[-0.04em] text-neutral-950">고객이슈 컨트롤</div>
          <div className="mt-1 text-[13px] font-bold text-neutral-500">
            검색·등록·확인을 오늘할일 안에서 바로 처리합니다.
          </div>
        </div>

        <button
          type="button"
          onClick={refreshIssuePanel}
          className="text-[13px] font-black text-neutral-500 transition-all duration-150 hover:text-blue-600 active:scale-[0.96]"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 rounded-2xl bg-neutral-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={`rounded-xl px-4 py-3 text-[14px] font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
            activeTab === "create" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500 hover:bg-white/70"
          }`}
        >
          빠른등록
          <div className="mt-0.5 text-[11px] font-bold text-neutral-400">고객 검색 후 등록</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`rounded-xl px-4 py-3 text-[14px] font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
            activeTab === "list" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500 hover:bg-white/70"
          }`}
        >
          이슈목록
          <div className="mt-0.5 text-[11px] font-bold text-neutral-400">미해결/완료 확인</div>
        </button>
      </div>

      {activeTab === "create" ? <AdminTodayQuickIssueCreate customers={customers} groups={groups} /> : null}
      {activeTab === "list" ? <CustomerIssuePostItList /> : null}
    </section>
  );
}
