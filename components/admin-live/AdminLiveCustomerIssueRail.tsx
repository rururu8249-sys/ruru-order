"use client";

// components/admin-live/AdminLiveCustomerIssueRail.tsx
// 목적: 고객관리 오른쪽 고객이슈 패널
// 주의: 주문/입금/배송/정산 상태 변경 없음. 고객이슈 admin_tasks 조회/등록/수정만 처리.

import { useEffect, useMemo, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
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

type IssueForm = {
  nickname: string;
  name: string;
  phone: string;
  taskType: string;
  priority: string;
  memo: string;
};

const ISSUE_TYPE_OPTIONS = [
  ["exchange", "교환"],
  ["refund", "환불"],
  ["return", "반품"],
  ["shipping", "배송"],
  ["payment", "입금"],
  ["address", "주소"],
  ["product", "상품"],
  ["complaint", "불만"],
  ["general", "기타"],
];

const PRIORITY_OPTIONS = [
  ["normal", "보통"],
  ["high", "중요"],
  ["urgent", "긴급"],
  ["low", "낮음"],
];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean)
    .join("\n")
    .trim();
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

function rawValue(task: AdminIssueTask, keys: string[]) {
  const rawPayload = task.raw_payload || {};

  for (const key of keys) {
    const value = clean(rawPayload[key]);

    if (value) return value;
  }

  return "";
}

function getNickname(task: AdminIssueTask) {
  return (
    clean(task.customer_nickname) ||
    rawValue(task, ["nickname", "youtube_nickname", "customer_nickname"]) ||
    clean(task.title).replace("[고객이슈]", "").split("-")[0]?.trim() ||
    "-"
  );
}

function getName(task: AdminIssueTask) {
  return clean(task.customer_name) || rawValue(task, ["name", "customer_name"]) || "-";
}

function getPhone(task: AdminIssueTask) {
  return clean(task.customer_phone) || rawValue(task, ["phone", "customer_phone"]) || "-";
}

function getCustomerId(task: AdminIssueTask) {
  return clean(task.customer_id) || rawValue(task, ["customer_id", "customerId", "id"]) || "-";
}

function getIssueTypeLabel(value: unknown) {
  const raw = clean(value) || "general";
  const found = ISSUE_TYPE_OPTIONS.find(([key]) => key === raw);

  return found?.[1] || raw;
}

function getPriorityLabel(value: unknown) {
  const raw = clean(value) || "normal";
  const found = PRIORITY_OPTIONS.find(([key]) => key === raw);

  return found?.[1] || raw;
}

function getIssueText(task: AdminIssueTask) {
  const text = cleanMultiline(task.body);

  if (!text) return clean(task.title).replace("[고객이슈]", "").trim() || "고객이슈 내용 없음";

  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  const contentLine =
    lines.find((line) => line.startsWith("내용:")) ||
    lines.find((line) => line.startsWith("메모:")) ||
    lines.find((line) => !line.includes(":")) ||
    lines[0] ||
    text;

  return contentLine.replace(/^(내용|메모):\s*/, "").trim();
}

function getFullMemo(task: AdminIssueTask) {
  return cleanMultiline(task.body) || getIssueText(task);
}

function getOrderSummary(task: AdminIssueTask) {
  return (
    rawValue(task, [
      "order_summary",
      "orderSummary",
      "order_text",
      "orderText",
      "order_item",
      "orderItem",
      "product_name",
      "productName",
      "related_product",
    ]) || "-"
  );
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

function issueRows(task: AdminIssueTask) {
  return [
    ["자동날짜", dateLabel(task.created_at)],
    ["이슈유형", getIssueTypeLabel(task.task_type)],
    ["닉네임", getNickname(task)],
    ["이름", getName(task)],
    ["전화번호", getPhone(task)],
    ["고객ID", getCustomerId(task)],
    ["주문내용", getOrderSummary(task)],
    ["메모", getIssueText(task)],
  ];
}

function IssueRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[70px_1fr] gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <div className="text-[11px] font-black text-slate-400">{label}</div>
      <div
        className={`min-w-0 break-words text-[12px] leading-5 ${
          strong ? "font-black text-slate-950" : "font-bold text-slate-700"
        }`}
        title={value}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function IssueCard({
  task,
  index,
  onEdit,
}: {
  task: AdminIssueTask;
  index: number;
  onEdit: (task: AdminIssueTask) => void;
}) {
  const done = isResolved(task);
  const rows = issueRows(task);

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
              {getIssueTypeLabel(task.task_type)}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-500 ring-1 ring-slate-100">
              {getPriorityLabel(task.priority)}
            </span>
          </div>

          <div className="mt-2 truncate text-[15px] font-black text-slate-950" title={getNickname(task)}>
            {getNickname(task)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onEdit(task)}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50"
        >
          수정
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-white">
        {rows.map(([label, value]) => (
          <IssueRow key={label} label={label} value={value} strong={label === "메모"} />
        ))}
      </div>
    </article>
  );
}

function emptyIssueForm(): IssueForm {
  return {
    nickname: "",
    name: "",
    phone: "",
    taskType: "general",
    priority: "normal",
    memo: "",
  };
}

export default function AdminLiveCustomerIssueRail() {
  const [activeTab, setActiveTab] = useState<IssueTab>("open");
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [newIssueForm, setNewIssueForm] = useState<IssueForm>(() => emptyIssueForm());
  const [editingIssueTask, setEditingIssueTask] = useState<AdminIssueTask | null>(null);
  const [editingIssueMemo, setEditingIssueMemo] = useState("");
  const [editingIssueType, setEditingIssueType] = useState("general");
  const [editingIssuePriority, setEditingIssuePriority] = useState("normal");

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

  useEffect(() => {
    const reload = () => setReloadKey((value) => value + 1);

    window.addEventListener("ruru-admin-task-updated", reload);

    return () => {
      window.removeEventListener("ruru-admin-task-updated", reload);
    };
  }, []);

  const openCount = useMemo(() => tasks.filter((task) => !isResolved(task)).length, [tasks]);
  const resolvedCount = useMemo(() => tasks.filter(isResolved).length, [tasks]);

  const visibleTasks = useMemo(() => {
    if (activeTab === "open") return tasks.filter((task) => !isResolved(task));
    if (activeTab === "resolved") return tasks.filter(isResolved);

    return tasks;
  }, [activeTab, tasks]);

  const updateNewIssueForm = (patch: Partial<IssueForm>) => {
    setNewIssueForm((current) => ({ ...current, ...patch }));
  };

  const openEdit = (task: AdminIssueTask) => {
    setEditingIssueTask(task);
    setEditingIssueMemo(getFullMemo(task));
    setEditingIssueType(clean(task.task_type) || "general");
    setEditingIssuePriority(clean(task.priority) || "normal");
  };

  const closeEdit = () => {
    setEditingIssueTask(null);
    setEditingIssueMemo("");
    setEditingIssueType("general");
    setEditingIssuePriority("normal");
  };

  const saveIssueMemo = async () => {
    const memo = cleanMultiline(newIssueForm.memo);

    if (!memo) {
      showAdminToast("고객이슈 메모 내용을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const nickname = clean(newIssueForm.nickname);
      const name = clean(newIssueForm.name);
      const phone = clean(newIssueForm.phone);
      const titleName = nickname || name || phone || "수동메모";

      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_type: newIssueForm.taskType || "general",
          title: `[고객이슈] ${titleName}`,
          body: memo,
          customer_name: name,
          customer_nickname: nickname,
          priority: newIssueForm.priority || "normal",
          source: "admin-live-customers",
          raw_payload: {
            nickname,
            name,
            phone,
            memo,
            source: "admin-live-customers",
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "고객이슈 메모 추가 실패");
      }

      setShowMemoAdd(false);
      setNewIssueForm(emptyIssueForm());
      setActiveTab("open");
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("고객이슈 메모를 추가했습니다.");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const saveEditedIssueMemo = async () => {
    const task = editingIssueTask;

    if (!task) return;

    const id = clean(task.id);

    if (!id) {
      showAdminToast("수정할 고객이슈 ID가 없습니다.");
      return;
    }

    const memo = cleanMultiline(editingIssueMemo);

    if (!memo) {
      showAdminToast("수정할 메모 내용을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action: "update",
          title: clean(task.title) || `[고객이슈] ${getNickname(task)}`,
          body: memo,
          task_type: editingIssueType || "general",
          priority: editingIssuePriority || "normal",
          raw_payload: {
            ...(task.raw_payload || {}),
            memo,
            edited_from: "admin-live-customers",
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "고객이슈 메모 수정 실패");
      }

      closeEdit();
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("고객이슈 메모를 수정했습니다.");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">CUSTOMER ISSUE</div>
          <h2 className="mt-1 text-[22px] font-black tracking-[-0.04em] text-slate-950">{CUSTOMER_TERMS.customerIssue}</h2>
          <p className="mt-1 text-[12px] font-bold text-slate-500">고객관리 화면에서 이슈를 같이 확인합니다.</p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setShowMemoAdd(true)}
            className="h-9 rounded-xl bg-blue-600 px-3 text-[12px] font-black text-white hover:bg-blue-700"
          >
            + 메모
          </button>

          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>
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
          visibleTasks.slice(0, 30).map((task, index) => (
            <IssueCard key={taskKey(task, index)} task={task} index={index} onEdit={openEdit} />
          ))
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-[12px] font-bold leading-relaxed text-blue-700">
        고객이슈는 이 화면에서 메모 추가/수정이 가능합니다. 해결완료·삭제 처리는 기존 오늘할일/이슈 관리 흐름을 유지합니다.
      </div>

      {showMemoAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">ADD CUSTOMER ISSUE</div>
                <h3 className="mt-1 text-lg font-black text-slate-950">고객이슈 메모 추가</h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMemoAdd(false);
                  setNewIssueForm(emptyIssueForm());
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <input
                value={newIssueForm.nickname}
                onChange={(event) => updateNewIssueForm({ nickname: event.target.value })}
                placeholder="닉네임"
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <input
                value={newIssueForm.name}
                onChange={(event) => updateNewIssueForm({ name: event.target.value })}
                placeholder="이름"
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <input
                value={newIssueForm.phone}
                onChange={(event) => updateNewIssueForm({ phone: event.target.value })}
                placeholder="전화번호"
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <select
                value={newIssueForm.taskType}
                onChange={(event) => updateNewIssueForm({ taskType: event.target.value })}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                {ISSUE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2">
              <select
                value={newIssueForm.priority}
                onChange={(event) => updateNewIssueForm({ priority: event.target.value })}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    우선순위: {label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={newIssueForm.memo}
              onChange={(event) => updateNewIssueForm({ memo: event.target.value })}
              placeholder="고객이슈 내용을 입력하세요."
              className="mt-2 min-h-[180px] w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm font-bold leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMemoAdd(false);
                  setNewIssueForm(emptyIssueForm());
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editingIssueTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">EDIT CUSTOMER ISSUE</div>
                <h3 className="mt-1 text-lg font-black text-slate-950">고객이슈 메모 수정</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {getNickname(editingIssueTask)} · {getPhone(editingIssueTask)}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <select
                value={editingIssueType}
                onChange={(event) => setEditingIssueType(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                {ISSUE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                value={editingIssuePriority}
                onChange={(event) => setEditingIssuePriority(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    우선순위: {label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={editingIssueMemo}
              onChange={(event) => setEditingIssueMemo(event.target.value)}
              className="mt-2 min-h-[220px] w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm font-bold leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEditedIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                수정 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
