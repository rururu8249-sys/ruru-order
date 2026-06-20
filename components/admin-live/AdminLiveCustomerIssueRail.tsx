"use client";

// components/admin-live/AdminLiveCustomerIssueRail.tsx
// 목적: 고객관리 오른쪽 고객이슈 패널
// 주의: 주문/입금/배송/정산 상태 변경 없음. 고객이슈 admin_tasks 조회/등록/수정만 처리.

import { useEffect, useMemo, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
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

type CustomerIssueCustomerOption = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
};

type Props = {
  customerOptions?: CustomerIssueCustomerOption[];
};

type IssueTab = "open" | "all" | "resolved";

type IssueForm = {
  nickname: string;
  name: string;
  phone: string;
  taskTypes: string[];
  priority: string;
  memo: string;
};

const ISSUE_TYPE_OPTIONS: Array<[string, string]> = [
  ["exchange", "교환"],
  ["return", "반품"],
  ["refund", "환불"],
  ["purchase", "구매"],
  ["bad_customer", "진상"],
  ["general", "기타"],
];

const PRIORITY_OPTIONS: Array<[string, string]> = [
  ["normal", "보통"],
  ["high", "중요"],
  ["urgent", "긴급"],
  ["low", "낮음"],
];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanCompact(value: unknown) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

  return clean(value) || "-";
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

function rawArray(task: AdminIssueTask, key: string) {
  const rawPayload = task.raw_payload || {};
  const value = rawPayload[key];

  if (!Array.isArray(value)) return [];

  return value.map(clean).filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
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

function getIssueTypes(task: AdminIssueTask) {
  const rawTypes = rawArray(task, "issue_types");
  const single = clean(task.task_type);
  const values = uniqueValues([...rawTypes, single]).filter((value) =>
    ISSUE_TYPE_OPTIONS.some(([key]) => key === value)
  );

  return values.length > 0 ? values : ["general"];
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
  const text = cleanMultiline(task.body);

  if (!text) return getIssueText(task);

  const metaPrefixes = [
    "자동날짜:",
    "이슈유형:",
    "닉네임:",
    "이름:",
    "전화번호:",
    "고객ID:",
    "수정날짜:",
    "주문내용:",
  ];

  const memoLines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !metaPrefixes.some((prefix) => line.startsWith(prefix)))
    .map((line) => line.replace(/^(내용|메모):\s*/, "").trim())
    .filter(Boolean);

  return memoLines.join("\n").trim() || getIssueText(task);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateLabel(value: unknown) {
  const text = clean(value);

  if (!text) return "-";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}(${weekdays[date.getDay()]}) ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

function issueRows(task: AdminIssueTask) {
  return [
    ["닉네임", getNickname(task)],
    ["이름", getName(task)],
    ["전화번호", formatPhone(getPhone(task))],
    ["메모", getIssueText(task)],
  ];
}

function IssueRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[62px_1fr] gap-2 border-b border-line py-1.5 last:border-b-0">
      <div className="text-[11px] font-black text-ink-mute">{label}</div>
      <div
        className={`min-w-0 break-words text-[12px] leading-5 ${
          strong ? "font-black text-ink" : "font-bold text-ink"
        }`}
        title={value}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function IssueTypeChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (nextValue: string[]) => void;
}) {
  const selected = value.length > 0 ? value : ["general"];

  return (
    <div className="flex flex-wrap gap-2">
      {ISSUE_TYPE_OPTIONS.map(([key, label]) => {
        const active = selected.includes(key);

        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = active ? selected.filter((item) => item !== key) : [...selected, key];

              onChange(next.length > 0 ? next : ["general"]);
            }}
            className={`h-9 rounded-xl px-3 text-sm font-black ${
              active ? "bg-rose-deep text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3"
            }`}
          >
            {active ? "✓ " : ""}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function IssueCard({
  task,
  index,
  onEdit,
  onResolve,
  onHide,
}: {
  task: AdminIssueTask;
  index: number;
  onEdit: (task: AdminIssueTask) => void;
  onResolve: (task: AdminIssueTask) => void | Promise<void>;
  onHide: (task: AdminIssueTask) => void | Promise<void>;
}) {
  const done = isResolved(task);
  const rows = issueRows(task);
  const issueTypes = getIssueTypes(task);

  return (
    <article
      key={taskKey(task, index)}
      className="relative overflow-hidden rounded-xl border border-line bg-surface p-3 pl-4 shadow-sm"
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${done ? "bg-emerald-400" : "bg-red-400"}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                done ? "bg-surface-3 text-ink-soft" : "bg-danger-bg text-danger-tx"
              }`}
            >
              {done ? CUSTOMER_TERMS.issueResolved : CUSTOMER_TERMS.issueOpen}
            </span>

            {issueTypes.map((type) => (
              <span
                key={type}
                className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-black text-ink-soft ring-1 ring-line"
              >
                {getIssueTypeLabel(type)}
              </span>
            ))}

            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-black text-ink-soft ring-1 ring-line">
              {getPriorityLabel(task.priority)}
            </span>
          </div>

          <div className="mt-2 truncate text-[15px] font-black text-ink" title={getNickname(task)}>
            {getNickname(task)}
          </div>
          <div className="mt-0.5 text-[11px] font-black text-ink-mute">{dateLabel(task.created_at)}</div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[11px] font-black text-ink-soft hover:bg-surface-2"
          >
            수정
          </button>

          {done ? (
            <button
              type="button"
              onClick={() => onHide(task)}
              className="rounded-xl border border-danger-tx bg-danger-bg px-3 py-2 text-[11px] font-black text-danger-tx hover:bg-danger-bg"
              title="DB 완전삭제가 아니라 해결목록 숨김 처리"
            >
              목록삭제
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onResolve(task)}
              className="rounded-xl border border-line bg-ok-bg px-3 py-2 text-[11px] font-black text-ok-tx hover:bg-emerald-100"
            >
              해결완료
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-surface/70 px-3 py-2 ring-1 ring-white">
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
    taskTypes: ["general"],
    priority: "normal",
    memo: "",
  };
}

export default function AdminLiveCustomerIssueRail({ customerOptions = [] }: Props) {
  const [activeTab, setActiveTab] = useState<IssueTab>("open");
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [newIssueForm, setNewIssueForm] = useState<IssueForm>(() => emptyIssueForm());
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [customerSearchKeyword, setCustomerSearchKeyword] = useState("");
  // 카톡 내용 붙여넣기 → 규칙(키워드) 기반 자동 분류로 아래 폼 채우기 (AI/API 불필요)
  const [pasteDraft, setPasteDraft] = useState("");
  const parseKakaoToForm = () => {
    const raw = pasteDraft.replace(/\r/g, "").trim();
    if (!raw) return;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const isDate = (l: string) => /^\d{4}[.\-]\s?\d{1,2}[.\-]\s?\d{1,2}/.test(l) || /요일$/.test(l);
    const isTime = (l: string) => /^(오전|오후)\s*\d{1,2}:?\d{0,2}$/.test(l);
    // 판매자/봇/관리자/안내 줄은 전부 버림(이 표식이 붙음)
    const SELLER = ["보냄", "보낸 메시지", "메시지 가이드", "상담매니저", "챗봇", "채널 관리자", "(광고)", "Kanana", "카나나", "수신거부", "채널을 추가", "채널 추가"];
    const isSeller = (l: string) => SELLER.some((k) => l.includes(k));
    // 손님 이름줄: 짧고(≤12) 이름/닉형태, 문장부호 없음
    const isNameish = (l: string) => l.length <= 12 && /^[가-힣A-Za-z0-9_]+( [가-힣A-Za-z0-9_]+)?$/.test(l) && !/[?!.…ㅠㅋ~]/.test(l);

    let speaker: "customer" | "other" | null = null;
    let custName = "";
    const msgs: string[] = [];
    for (const l of lines) {
      if (isDate(l) || isTime(l)) { speaker = null; continue; }
      if (isSeller(l)) { speaker = "other"; continue; }
      if (speaker !== "customer" && isNameish(l)) { speaker = "customer"; if (!custName) custName = l; continue; }
      if (speaker === "customer") { msgs.push(l); }
    }

    // 대화형이면 손님 말만, 아니면(한 줄 붙여넣기) 전체를 내용으로
    const content = msgs.length > 0 ? msgs.join("\n") : raw;
    let nickname = "";
    let name = "";
    if (custName) {
      const t = custName.split(/\s+/).filter(Boolean);
      if (t.length >= 2) { nickname = t[0]; name = t[1]; } else { name = t[0]; }
    } else {
      const t = (lines[0] || "").split(/\s+/).filter(Boolean);
      if (t.length >= 1) { nickname = t[0].slice(0, 12); if (t.length >= 2 && /^[가-힣]{2,4}$/.test(t[1])) name = t[1]; }
    }

    const KW: [string, string][] = [
      ["교환", "exchange"], ["반품", "return"], ["환불", "refund"], ["취소", "refund"],
      ["불량", "exchange"], ["하자", "exchange"], ["진상", "complaint"],
    ];
    let type = "general";
    for (const [kw, t] of KW) { if (content.includes(kw)) { type = t; break; } }

    setNewIssueForm((f) => ({ ...f, nickname: nickname || f.nickname, name: name || f.name, taskTypes: [type], memo: content }));
  };

  // ChatGPT 새 창으로 분석(공짜) — 분석 지시문+대화를 클립보드에 담고 chatgpt.com 새 창 열기.
  //   ChatGPT는 iframe 임베드를 막아서 끼워넣기는 불가 → 새 창 + 붙여넣기 방식.
  const chatgptAnalyze = async () => {
    const text = pasteDraft.trim();
    if (!text) {
      showAdminToast("먼저 카톡 대화를 붙여넣어주세요.");
      return;
    }
    const prompt =
      '아래는 우리 쇼핑몰 손님과의 카카오톡 대화입니다. 판매자(루루동이/유혜원/한두희/관리자)·자동봇(카나나 상담매니저/챗봇)·공지·시스템 안내 줄은 전부 무시하고, "손님"이 직접 한 말만 골라서 아래 형식으로 정리해줘:\n\n닉네임:\n이름:\n유형(교환/반품/환불/배송/기타 중 하나):\n핵심내용(2~3줄):\n\n[대화 내용]\n' +
      text;
    try {
      await navigator.clipboard.writeText(prompt);
      showAdminToast("분석문구를 복사했어요. 열린 ChatGPT 창에 붙여넣기(Ctrl/Cmd+V) → 결과를 복사해 아래 폼에 넣으세요.");
    } catch {
      showAdminToast("ChatGPT 창을 열었어요. 위 카톡 내용을 붙여넣어 분석을 요청하세요.");
    }
    window.open("https://chatgpt.com/", "_blank", "noopener");
  };
  const issuePageSize = 3;
  const [issuePage, setIssuePage] = useState(1);
  const [editingIssueTask, setEditingIssueTask] = useState<AdminIssueTask | null>(null);
  const [editingIssueMemo, setEditingIssueMemo] = useState("");
  const [editingIssueTypes, setEditingIssueTypes] = useState<string[]>(["general"]);
  const [editingIssuePriority, setEditingIssuePriority] = useState("normal");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);

      try {
        const response = await fetch("/api/admin-v2/admin-tasks", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const rows = normalizePayload(payload)
          .filter((task) => {
            const haystack = [task.title, task.body, task.task_type].map(clean).join(" ");

            return haystack.includes("고객이슈") || haystack.includes("issue") || Boolean(task.customer_id);
          })
          .filter((task) => clean(task.status).toLowerCase() !== "deleted");

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

  const issueTotalPages = Math.max(1, Math.ceil(visibleTasks.length / issuePageSize));
  const safeIssuePage = Math.min(Math.max(1, issuePage), issueTotalPages);
  const pageTasks = visibleTasks.slice((safeIssuePage - 1) * issuePageSize, safeIssuePage * issuePageSize);

  const customerSearchResults = useMemo(() => {
    const keyword = cleanCompact(customerSearchKeyword || customerSearchDraft);

    if (!keyword) return [];

    return customerOptions
      .filter((customer) => {
        const haystack = cleanCompact(`${customer.nickname} ${customer.name} ${customer.phone} ${formatPhone(customer.phone)}`);

        return haystack.includes(keyword);
      })
      .slice(0, 8);
  }, [customerOptions, customerSearchDraft, customerSearchKeyword]);

  const updateNewIssueForm = (patch: Partial<IssueForm>) => {
    setNewIssueForm((current) => ({ ...current, ...patch }));
  };

  const selectCustomer = (customer: CustomerIssueCustomerOption) => {
    updateNewIssueForm({
      nickname: customer.nickname,
      name: customer.name,
      phone: customer.phone,
    });
    setCustomerSearchDraft(`${customer.nickname} ${customer.name} ${formatPhone(customer.phone)}`);
    setCustomerSearchKeyword("");
  };

  const closeAdd = () => {
    setShowMemoAdd(false);
    setNewIssueForm(emptyIssueForm());
    setCustomerSearchDraft("");
    setCustomerSearchKeyword("");
  };

  const openEdit = (task: AdminIssueTask) => {
    setEditingIssueTask(task);
    setEditingIssueMemo(getFullMemo(task));
    setEditingIssueTypes(getIssueTypes(task));
    setEditingIssuePriority(clean(task.priority) || "normal");
  };

  const closeEdit = () => {
    setEditingIssueTask(null);
    setEditingIssueMemo("");
    setEditingIssueTypes(["general"]);
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
      const issueTypes = newIssueForm.taskTypes.length > 0 ? newIssueForm.taskTypes : ["general"];
      const titleName = nickname || name || phone || "수동메모";

      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_type: issueTypes[0] || "general",
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
            issue_types: issueTypes,
            memo,
            source: "admin-live-customers",
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "고객이슈 메모 추가 실패");
      }

      closeAdd();
      setActiveTab("open");
      setIssuePage(1);
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      showAdminToast("고객이슈 메모를 추가했습니다.");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const resolveIssueTask = async (task: AdminIssueTask) => {
    const id = clean(task.id);

    if (!id) {
      showAdminToast("해결 처리할 고객이슈 ID가 없습니다.");
      return;
    }

    const ok = await showAdminConfirm("이 고객이슈를 해결완료 처리할까요?");
    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        action: "resolve",
        resolved_note: "고객관리에서 해결완료 처리",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      showAdminToast("해결완료 처리 실패\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    setIssuePage(1);
    setReloadKey((value) => value + 1);
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    showAdminToast("고객이슈를 해결완료 처리했습니다.");
  };

  const hideResolvedIssueTask = async (task: AdminIssueTask) => {
    const id = clean(task.id);

    if (!id) {
      showAdminToast("목록삭제 처리할 고객이슈 ID가 없습니다.");
      return;
    }

    const ok = await showAdminConfirm("해결완료 목록에서 이 고객이슈를 삭제할까요?\n\nDB 완전삭제가 아니라 목록 숨김 처리됩니다.");
    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        action: "hide",
        resolved_note: "고객관리에서 해결완료 목록 숨김삭제",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      showAdminToast("목록삭제 처리 실패\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    setIssuePage(1);
    setReloadKey((value) => value + 1);
    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    showAdminToast("해결완료 목록에서 숨김 처리했습니다.");
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

    const issueTypes = editingIssueTypes.length > 0 ? editingIssueTypes : ["general"];

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
          task_type: issueTypes[0] || "general",
          priority: editingIssuePriority || "normal",
          raw_payload: {
            ...(task.raw_payload || {}),
            issue_types: issueTypes,
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
      setIssuePage(1);
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
    <aside className="flex flex-col">
        <div className="mb-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowMemoAdd(true)}
            className="h-9 rounded-xl bg-rose-deep px-3 text-[12px] font-black text-white hover:bg-rose-deep"
          >
            + 메모
          </button>

          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-[12px] font-black text-ink-soft hover:bg-surface-2"
          >
            새로고침
          </button>
        </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-2 p-1">
        {[
          ["open", `미해결 전체 ${openCount}건`],
          ["all", `전체 ${tasks.length}건`],
          ["resolved", `해결 전체 ${resolvedCount}건`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key as IssueTab);
              setIssuePage(1);
            }}
            className={`h-9 rounded-xl text-[12px] font-black ${
              activeTab === key ? "bg-surface text-rose-deep shadow-sm" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-2xl bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">
            고객이슈 불러오는 중...
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">
            표시할 고객이슈가 없습니다.
          </div>
        ) : (
          pageTasks.map((task, index) => (
            <IssueCard
              key={taskKey(task, index)}
              task={task}
              index={index}
              onEdit={openEdit}
              onResolve={resolveIssueTask}
              onHide={hideResolvedIssueTask}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-2">
        <div className="text-xs font-black text-ink-mute">
          현재페이지 {pageTasks.length.toLocaleString("ko-KR")}건 · 전체 {visibleTasks.length.toLocaleString("ko-KR")}건
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft">
            3개씩 보기
          </div>

          <button
            type="button"
            onClick={() => setIssuePage(Math.max(1, safeIssuePage - 1))}
            disabled={safeIssuePage <= 1}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
          >
            이전
          </button>

          <div className="h-9 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">
            {safeIssuePage} / {issueTotalPages}
          </div>

          <button
            type="button"
            onClick={() => setIssuePage(Math.min(issueTotalPages, safeIssuePage + 1))}
            disabled={safeIssuePage >= issueTotalPages}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </div>

      {showMemoAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-[28px] border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-rose-deep">ADD CUSTOMER ISSUE</div>
                <h3 className="mt-1 text-lg font-black text-ink">고객이슈 메모 추가</h3>
              </div>

              <button
                type="button"
                onClick={closeAdd}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink">📋 카톡 내용 붙여넣기 → 자동 분류</div>
              <textarea
                value={pasteDraft}
                onChange={(event) => setPasteDraft(event.target.value)}
                rows={3}
                placeholder="예: 둘리 홍길동 245 작아서 교환하고 싶어요"
                className="mt-2 w-full rounded-xl border border-line bg-surface p-2.5 text-sm font-bold text-ink outline-none focus:border-rose-deep"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={chatgptAnalyze}
                  className="h-9 rounded-lg bg-rose-deep px-3 text-xs font-black text-white"
                >
                  🤖 ChatGPT로 분석 (새 창·공짜)
                </button>
                <button
                  type="button"
                  onClick={parseKakaoToForm}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2"
                >
                  규칙으로 빠르게(한글이름)
                </button>
              </div>
              <div className="mt-1.5 text-[11px] font-bold leading-4 text-ink-mute">
                🤖 ChatGPT(공짜): 분석문구가 복사돼요 → 열린 창에 붙여넣기 → 결과를 복사해 아래 폼에. 이모지·문장 이름도 정확.
                <br />규칙(빠르게): 한글 이름·교환/반품/환불 단어면 바로 폼에 채움(이모지·괄호·문장 이름은 부정확).
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-black text-ink-soft">고객 검색</div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_96px]">
                <input
                  value={customerSearchDraft}
                  onChange={(event) => {
                    setCustomerSearchDraft(event.target.value);
                    setCustomerSearchKeyword("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setCustomerSearchKeyword(customerSearchDraft);
                    }
                  }}
                  placeholder="닉네임 / 이름 / 전화번호 검색"
                  className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
                />

                <button
                  type="button"
                  onClick={() => setCustomerSearchKeyword(customerSearchDraft)}
                  className="h-11 rounded-xl bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-700"
                >
                  검색
                </button>
              </div>

              <div className="mt-2 rounded-2xl border border-dashed border-line bg-surface-2 p-2">
                {!clean(customerSearchDraft) ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">
                    닉네임·이름·전화번호를 검색하면 고객 추천이 표시됩니다.
                  </div>
                ) : customerSearchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">
                    검색 결과가 없습니다. 직접 입력도 가능합니다.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {customerSearchResults.map((customer) => (
                      <button
                        key={customer.key}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="grid w-full grid-cols-[1fr_auto] gap-2 rounded-xl bg-surface px-3 py-2 text-left text-xs font-bold text-ink-soft hover:bg-rose-soft"
                      >
                        <span className="min-w-0 truncate">
                          <b className="text-ink">{customer.nickname || "-"}</b> · {customer.name || "-"}
                        </span>
                        <span className="font-black text-rose-deep">{formatPhone(customer.phone)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <input
                value={newIssueForm.nickname}
                onChange={(event) => updateNewIssueForm({ nickname: event.target.value })}
                placeholder="닉네임"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
              />
              <input
                value={newIssueForm.name}
                onChange={(event) => updateNewIssueForm({ name: event.target.value })}
                placeholder="이름"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
              />
              <input
                value={newIssueForm.phone}
                onChange={(event) => updateNewIssueForm({ phone: event.target.value })}
                placeholder="전화번호"
                className="h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
              />
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-black text-ink-soft">이슈유형 다중선택</div>
              <IssueTypeChips
                value={newIssueForm.taskTypes}
                onChange={(nextValue) => updateNewIssueForm({ taskTypes: nextValue })}
              />
            </div>

            <div className="mt-3">
              <select
                value={newIssueForm.priority}
                onChange={(event) => updateNewIssueForm({ priority: event.target.value })}
                className="h-11 w-full rounded-xl border border-line px-3 text-sm font-black text-ink outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
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
              className="mt-3 min-h-[180px] w-full resize-none rounded-2xl border border-line p-3 text-sm font-bold leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAdd}
                className="h-11 rounded-xl border border-line bg-surface text-sm font-black text-ink-soft hover:bg-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-rose-deep text-sm font-black text-white hover:bg-rose-deep disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editingIssueTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-[560px] rounded-[28px] border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-rose-deep">EDIT CUSTOMER ISSUE</div>
                <h3 className="mt-1 text-lg font-black text-ink">고객이슈 메모 수정</h3>
                <p className="mt-1 text-xs font-bold text-ink-soft">
                  {getNickname(editingIssueTask)} / {getName(editingIssueTask)}
                </p>
                <p className="mt-1 text-[11px] font-bold text-rose-deep">
                  고객정보는 수정하지 않고 이슈유형·우선순위·메모만 수정합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-black text-ink-soft">이슈유형 다중선택</div>
              <IssueTypeChips value={editingIssueTypes} onChange={setEditingIssueTypes} />
            </div>

            <div className="mt-3">
              <select
                value={editingIssuePriority}
                onChange={(event) => setEditingIssuePriority(event.target.value)}
                className="h-11 w-full rounded-xl border border-line px-3 text-sm font-black text-ink outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
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
              className="mt-3 min-h-[220px] w-full resize-none rounded-2xl border border-line p-3 text-sm font-bold leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-info-bg"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="h-11 rounded-xl border border-line bg-surface text-sm font-black text-ink-soft hover:bg-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEditedIssueMemo}
                disabled={saving}
                className="h-11 rounded-xl bg-rose-deep text-sm font-black text-white hover:bg-rose-deep disabled:opacity-50"
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
