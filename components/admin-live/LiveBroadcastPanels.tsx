"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CustomerRow } from "@/lib/admin-v2/types";

type IssueStatusFilter = "open" | "all" | "resolved";
type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  youtubeUrl?: string | null;
};

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
  customer_id?: string | number | null;
  customer_name?: string | null;
  customer_nickname?: string | null;
  customer_phone?: string | null;
  related_product?: string | null;
  priority?: string | null;
  raw_payload?: {
    selected_types?: string[];
    selected_labels?: string[];
    customer_phone?: string | null;
  } | null;
};

const ISSUE_TYPES = [
  { label: "교환", taskType: "exchange", className: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "반품", taskType: "return", className: "bg-violet-100 text-violet-700 border-violet-200" },
  { label: "환불", taskType: "refund", className: "bg-red-100 text-red-700 border-red-200" },
  { label: "구매", taskType: "product", className: "bg-green-100 text-green-700 border-green-200" },
  { label: "진상", taskType: "complaint", className: "bg-rose-100 text-rose-700 border-rose-200" },
  { label: "기타", taskType: "general", className: "bg-slate-100 text-slate-700 border-slate-200" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function videoSizeClass(videoRatio: VideoRatio) {
  if (videoRatio === "wide") return "aspect-video h-[300px] w-full max-w-[540px]";
  if (videoRatio === "auto") return "aspect-[4/5] h-[330px] w-auto";
  return "aspect-[9/16] h-[330px] w-auto";
}

function extractYoutubeVideoId(rawUrl?: string | null) {
  const value = clean(rawUrl);
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").split("?")[0];
    }

    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;

    const pathParts = url.pathname.split("/").filter(Boolean);
    const liveIndex = pathParts.indexOf("live");
    if (liveIndex >= 0 && pathParts[liveIndex + 1]) return pathParts[liveIndex + 1];

    const embedIndex = pathParts.indexOf("embed");
    if (embedIndex >= 0 && pathParts[embedIndex + 1]) return pathParts[embedIndex + 1];

    return "";
  } catch {
    const match = value.match(/(?:v=|youtu\.be\/|live\/|embed\/)([a-zA-Z0-9_-]{6,})/);
    return match?.[1] || "";
  }
}

function normalizeTasksPayload(payload: unknown): AdminIssueTask[] {
  const source = payload as {
    tasks?: AdminIssueTask[];
    adminTasks?: AdminIssueTask[];
    data?: AdminIssueTask[];
    items?: AdminIssueTask[];
  };

  if (Array.isArray(payload)) return payload as AdminIssueTask[];
  if (Array.isArray(source?.tasks)) return source.tasks;
  if (Array.isArray(source?.adminTasks)) return source.adminTasks;
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.items)) return source.items;

  return [];
}

function taskId(task: AdminIssueTask) {
  return clean(task.id || task.task_id || `${task.created_at}-${task.title}`);
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
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

function parseBodyValue(body: string, label: string) {
  const line = body
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${label}:`));

  return clean(line?.replace(`${label}:`, ""));
}

function getTaskBody(task: AdminIssueTask) {
  return clean(task.body || task.memo || task.content);
}

function getTaskNickname(task: AdminIssueTask) {
  const body = getTaskBody(task);

  return (
    clean(task.customer_nickname) ||
    parseBodyValue(body, "닉네임") ||
    clean(task.title).replace("[고객이슈]", "").split("-")[0]?.trim() ||
    "-"
  );
}

function getTaskName(task: AdminIssueTask) {
  const body = getTaskBody(task);
  return clean(task.customer_name) || parseBodyValue(body, "이름") || "-";
}

function getTaskPhone(task: AdminIssueTask) {
  const body = getTaskBody(task);
  return clean(task.customer_phone) || parseBodyValue(body, "전화번호") || "-";
}

function getTaskContent(task: AdminIssueTask) {
  const body = getTaskBody(task);

  if (!body) return clean(task.title) || "내용 없음";

  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("자동날짜:"))
    .filter((line) => !line.startsWith("이슈유형:"))
    .filter((line) => !line.startsWith("닉네임:"))
    .filter((line) => !line.startsWith("이름:"))
    .filter((line) => !line.startsWith("전화번호:"))
    .filter((line) => !line.startsWith("고객ID:"))
    .filter((line) => !line.startsWith("수정날짜:"));

  return lines.join(" / ") || clean(task.title) || "내용 없음";
}

function buildEditedTaskBody(task: AdminIssueTask, editedMemo: string) {
  const body = getTaskBody(task);
  const metaLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        line.startsWith("자동날짜:") ||
        line.startsWith("이슈유형:") ||
        line.startsWith("닉네임:") ||
        line.startsWith("이름:") ||
        line.startsWith("전화번호:") ||
        line.startsWith("고객ID:")
    );

  const updatedAtLine = `수정날짜: ${formatDate(new Date().toISOString())}`;
  const safeMetaLines = metaLines.length > 0 ? metaLines : [`자동날짜: ${formatDate(task.created_at || new Date().toISOString())}`];

  return [...safeMetaLines, updatedAtLine, "", editedMemo.trim()].join("\n");
}

function getIssueTypeMetas(task: AdminIssueTask) {
  const rawTypes = Array.isArray(task.raw_payload?.selected_types)
    ? task.raw_payload?.selected_types || []
    : [];

  const body = getTaskBody(task);
  const bodyLabelLine = parseBodyValue(body, "이슈유형");
  const bodyLabels = bodyLabelLine
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const byRawTypes = rawTypes
    .map((taskType) => ISSUE_TYPES.find((item) => item.taskType === taskType))
    .filter(Boolean) as typeof ISSUE_TYPES;

  const byBodyLabels = bodyLabels
    .map((label) => ISSUE_TYPES.find((item) => item.label === label))
    .filter(Boolean) as typeof ISSUE_TYPES;

  const mainType = clean(task.task_type || task.type || "general");
  const fallback = ISSUE_TYPES.find((item) => item.taskType === mainType) || ISSUE_TYPES[ISSUE_TYPES.length - 1];

  const merged = [...byRawTypes, ...byBodyLabels, fallback];
  const unique = new Map<string, (typeof ISSUE_TYPES)[number]>();

  merged.forEach((item) => {
    if (item?.taskType) unique.set(item.taskType, item);
  });

  return Array.from(unique.values());
}

function normalizePhone(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function isBlockedCustomer(customer: CustomerRow) {
  return customer.is_blocked === true || customer.is_blocked === "true" || customer.is_blocked === "Y";
}

function CustomerIssueCard({
  task,
  onResolve,
  onHide,
  onEdit,
}: {
  task: AdminIssueTask;
  onResolve: (task: AdminIssueTask) => void;
  onHide: (task: AdminIssueTask) => void;
  onEdit: (task: AdminIssueTask) => void;
}) {
  const done = isResolved(task);
  const metas = getIssueTypeMetas(task);

  return (
    <div
      className={[
        "rounded-xl border p-2.5 shadow-sm",
        done ? "border-slate-200 bg-slate-50 opacity-65" : "border-amber-200 bg-amber-50",
      ].join(" ")}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {metas.map((meta) => (
          <span key={meta.taskType} className={`rounded-md border px-2 py-0.5 text-[11px] font-black ${meta.className}`}>
            {meta.label}
          </span>
        ))}
        {done ? (
          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600">
            해결완료
          </span>
        ) : (
          <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-black text-orange-700">
            미해결
          </span>
        )}
      </div>

      <div className="grid grid-cols-[52px_1fr] gap-y-0.5 text-[11px] font-black">
        <div className="text-slate-400">닉네임</div>
        <div className="truncate text-slate-900">{getTaskNickname(task)}</div>
        <div className="text-slate-400">이름</div>
        <div className="truncate text-slate-700">{getTaskName(task)}</div>
        <div className="text-slate-400">전화</div>
        <div className="truncate text-slate-700">{getTaskPhone(task)}</div>
      </div>

      <div className="mt-2 rounded-lg bg-white/65 px-2.5 py-2 text-xs font-bold leading-4 text-slate-700">
        {getTaskContent(task)}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="mr-auto text-[11px] font-bold text-slate-400">
          {formatDate(task.created_at || task.updated_at)}
        </span>
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-black text-blue-600 hover:bg-blue-50"
        >
          수정
        </button>
        {!done ? (
          <button
            type="button"
            onClick={() => onResolve(task)}
            className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white hover:bg-slate-700"
          >
            해결완료
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onHide(task)}
            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-black text-red-600 hover:bg-red-50"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

export default function LiveBroadcastPanels({ videoRatio, youtubeUrl }: Props) {
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<IssueStatusFilter>("open");
  const [tasks, setTasks] = useState<AdminIssueTask[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskPage, setTaskPage] = useState(1);
  const [embedDomain, setEmbedDomain] = useState("");

  const [customerKeyword, setCustomerKeyword] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["general"]);
  const [memoText, setMemoText] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEmbedDomain(window.location.hostname);
  }, []);

  const loadTasks = async () => {
    setTaskLoading(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setTasks([]);
        return;
      }

      setTasks(
        normalizeTasksPayload(payload).filter(
          (task) => clean(task.status).toLowerCase() !== "deleted"
        )
      );
    } finally {
      setTaskLoading(false);
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

  const videoId = useMemo(() => extractYoutubeVideoId(youtubeUrl), [youtubeUrl]);
  const videoEmbedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0` : "";
  const chatEmbedUrl = videoId && embedDomain ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${embedDomain}` : "";

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const done = isResolved(task);

        if (statusFilter === "open") return !done;
        if (statusFilter === "resolved") return done;
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(String(a.created_at || a.updated_at || 0)).getTime() || 0;
        const bTime = new Date(String(b.created_at || b.updated_at || 0)).getTime() || 0;
        return bTime - aTime;
      });
  }, [tasks, statusFilter]);

  const openCount = tasks.filter((task) => !isResolved(task)).length;
  const resolvedCount = tasks.filter((task) => isResolved(task)).length;
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / 3));
  const safePage = Math.min(taskPage, totalPages);
  const visibleTasks = filteredTasks.slice((safePage - 1) * 3, safePage * 3);

  const searchCustomers = async () => {
    const keyword = customerKeyword.trim();

    if (keyword.length < 1) {
      alert("검색어를 입력해주세요.");
      return;
    }

    setCustomerLoading(true);

    try {
      const phoneDigits = normalizePhone(keyword);
      const orFilters = [
        `youtube_nickname.ilike.%${keyword}%`,
        `customer_name.ilike.%${keyword}%`,
        `customer_phone.ilike.%${keyword}%`,
      ];

      if (phoneDigits) {
        orFilters.push(`customer_phone.ilike.%${phoneDigits}%`);
      }

      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(orFilters.join(","))
        .order("last_order_at", { ascending: false, nullsFirst: false })
        .limit(8);

      if (error) {
        alert("고객 검색 실패\n\n" + error.message);
        setCustomerResults([]);
        return;
      }

      setCustomerResults((data || []) as CustomerRow[]);
    } finally {
      setCustomerLoading(false);
    }
  };

  const toggleIssueType = (taskType: string) => {
    setSelectedTypes((prev) => {
      if (prev.includes(taskType)) {
        const next = prev.filter((item) => item !== taskType);
        return next.length > 0 ? next : ["general"];
      }

      return [...prev.filter((item) => item !== "general"), taskType];
    });
  };

  const resetMemoForm = () => {
    setCustomerKeyword("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setSelectedTypes(["general"]);
    setMemoText("");
  };

  const saveIssueMemo = async () => {
    if (!selectedCustomer) {
      alert("고객을 먼저 선택해주세요.");
      return;
    }

    const memo = memoText.trim();

    if (!memo) {
      alert("메모 내용을 입력해주세요.");
      return;
    }

    setSavingMemo(true);

    try {
      const selectedLabels = ISSUE_TYPES
        .filter((item) => selectedTypes.includes(item.taskType))
        .map((item) => item.label);

      const mainType = selectedTypes[0] || "general";
      const nickname = clean(selectedCustomer.youtube_nickname);
      const customerName = clean(selectedCustomer.customer_name);
      const phone = clean(selectedCustomer.customer_phone);

      const body = [
        `자동날짜: ${formatDate(new Date().toISOString())}`,
        `이슈유형: ${selectedLabels.join(", ") || "기타"}`,
        `닉네임: ${nickname || "-"}`,
        `이름: ${customerName || "-"}`,
        `전화번호: ${phone || "-"}`,
        `고객ID: ${selectedCustomer.id || "-"}`,
        "",
        memo,
      ].join("\n");

      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          task_type: mainType,
          title: `[고객이슈] ${nickname || customerName || phone || "고객"} - ${selectedLabels.join("/") || "기타"}`,
          body,
          customer_id: selectedCustomer.id || null,
          customer_name: customerName || null,
          customer_nickname: nickname || null,
          related_product: null,
          source: "admin_live_control_tower",
          priority: selectedTypes.includes("complaint") ? "high" : "normal",
          raw_payload: {
            selected_types: selectedTypes,
            selected_labels: selectedLabels,
            customer_phone: phone,
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        alert("고객이슈 저장 실패\n\n" + (payload?.message || "알 수 없는 오류"));
        return;
      }

      window.dispatchEvent(new Event("ruru-admin-task-created"));
      await loadTasks();
      resetMemoForm();
      setShowMemoAdd(false);
    } finally {
      setSavingMemo(false);
    }
  };

  const resolveTask = async (task: AdminIssueTask) => {
    const id = taskId(task);

    if (!id) {
      alert("해결 처리할 이슈 ID가 없습니다.");
      return;
    }

    const ok = confirm("이 고객이슈를 해결완료 처리할까요?");
    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        id,
        action: "resolve",
        resolved_note: "방송 컨트롤타워에서 해결완료 처리",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      alert("해결완료 처리 실패\n\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    await loadTasks();
  };

  const hideResolvedTask = async (task: AdminIssueTask) => {
    const id = taskId(task);

    if (!id) {
      alert("삭제 처리할 이슈 ID가 없습니다.");
      return;
    }

    const ok = confirm("해결완료 목록에서 이 이슈를 삭제할까요?\n\nDB 완전삭제가 아니라 목록 숨김 처리됩니다.");
    if (!ok) return;

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        id,
        action: "hide",
        resolved_note: "방송 컨트롤타워에서 해결완료 목록 숨김삭제",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      alert("삭제 처리 실패\n\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    await loadTasks();
  };

  const editIssueMemo = async (task: AdminIssueTask) => {
    const id = taskId(task);

    if (!id) {
      alert("수정할 이슈 ID가 없습니다.");
      return;
    }

    const currentMemo = getTaskContent(task);
    const editedMemo = window.prompt("고객이슈 메모를 수정하세요.", currentMemo);

    if (editedMemo === null) return;

    const memo = editedMemo.trim();

    if (!memo) {
      alert("메모 내용은 비워둘 수 없습니다.");
      return;
    }

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        id,
        action: "update",
        title: task.title || `[고객이슈] ${getTaskNickname(task)}`,
        body: buildEditedTaskBody(task, memo),
        task_type: task.task_type || task.type || "general",
        priority: task.priority || "normal",
        raw_payload: task.raw_payload || {},
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      alert("고객이슈 수정 실패\n\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    await loadTasks();
  };

  return (
    <section className="mb-4 grid grid-cols-12 items-stretch gap-3">
      <div className="col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            방송화면
            <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] text-white">LIVE</span>
          </div>
          <div className="text-xs font-black text-slate-400">
            {videoRatio === "vertical" ? "9:16 세로" : videoRatio === "wide" ? "16:9 가로" : "자동"}
          </div>
        </div>

        <div className="flex h-[360px] items-center justify-center rounded-2xl bg-slate-100 p-2">
          <div className={`relative overflow-hidden rounded-[1.5rem] bg-slate-950 shadow-sm ${videoSizeClass(videoRatio)}`}>
            {videoEmbedUrl ? (
              <iframe
                title="YouTube live video"
                src={videoEmbedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 via-stone-100 to-slate-100">
                <div className="w-[78%] rounded-[2rem] bg-white/70 p-6 text-center shadow-sm backdrop-blur">
                  <div className="text-5xl">👟</div>
                  <div className="mt-4 text-lg font-black text-slate-900">루루동이LIVE</div>
                  <div className="mt-2 text-xs font-bold text-slate-500">유튜브 라이브 URL을 적용하면 영상이 표시됩니다.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-950">라이브 채팅</h2>
          <span className="text-xs font-bold text-slate-500">{chatEmbedUrl ? "YouTube Chat" : "URL 대기"}</span>
        </div>

        <div className="h-[346px] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          {chatEmbedUrl ? (
            <iframe
              title="YouTube live chat"
              src={chatEmbedUrl}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <div className="text-4xl">💬</div>
                <div className="mt-3 text-sm font-black text-slate-700">라이브 채팅 연결 대기</div>
                <div className="mt-2 text-xs font-bold leading-5 text-slate-400">
                  방송 시작 후 유튜브 라이브 URL을 입력하고 적용하면<br />
                  이 영역에 실제 채팅창이 표시됩니다.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-950">고객 특이사항 · 고객이슈 {openCount}</h2>
          <button
            type="button"
            onClick={() => setShowMemoAdd((value) => !value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-50"
          >
            + 메모 추가
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-xl bg-slate-50 p-1">
          {[
            ["open", `미해결 ${openCount}`],
            ["all", `전체 ${tasks.length}`],
            ["resolved", `해결 ${resolvedCount}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatusFilter(key as IssueStatusFilter);
                setTaskPage(1);
              }}
              className={[
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-black",
                statusFilter === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-[292px] space-y-2 overflow-y-auto pr-1">
          {taskLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">
              고객이슈 불러오는 중...
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">
              표시할 특이사항이 없습니다.
            </div>
          ) : (
            visibleTasks.map((task) => (
              <CustomerIssueCard
                key={taskId(task)}
                task={task}
                onResolve={resolveTask}
                onHide={hideResolvedTask}
                onEdit={editIssueMemo}
              />
            ))
          )}
        </div>

        <div className="mt-2 flex items-center justify-center gap-2 text-sm font-black">
          <button
            type="button"
            onClick={() => setTaskPage(Math.max(1, safePage - 1))}
            className="text-slate-300"
          >
            ‹
          </button>
          {Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1).map((pageNo) => (
            <button
              key={pageNo}
              type="button"
              onClick={() => setTaskPage(pageNo)}
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full",
                safePage === pageNo ? "bg-blue-600 text-white" : "text-slate-500",
              ].join(" ")}
            >
              {pageNo}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTaskPage(Math.min(totalPages, safePage + 1))}
            className="text-slate-400"
          >
            ›
          </button>
        </div>

        {showMemoAdd && (
          <div className="absolute right-full top-10 z-30 mr-3 w-[350px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl">
            <div className="mb-3 flex items-center">
              <h3 className="text-sm font-black text-slate-950">특이사항 추가</h3>
              <button
                type="button"
                onClick={() => {
                  setShowMemoAdd(false);
                  resetMemoForm();
                }}
                className="ml-auto text-lg text-slate-400 hover:text-slate-800"
              >
                ×
              </button>
            </div>

            <label className="mb-1 block text-xs font-black text-slate-500">고객 검색</label>
            <div className="mb-2 flex gap-2">
              <input
                value={customerKeyword}
                onChange={(event) => setCustomerKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchCustomers();
                }}
                placeholder="닉네임 / 이름 / 전번 검색"
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <button
                type="button"
                onClick={searchCustomers}
                disabled={customerLoading}
                className="rounded-xl bg-slate-900 px-3 text-xs font-black text-white disabled:bg-slate-300"
              >
                {customerLoading ? "검색중" : "검색"}
              </button>
            </div>

            <div className="mb-3 max-h-[122px] space-y-1.5 overflow-y-auto">
              {selectedCustomer ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs">
                  <div className="font-black text-blue-800">
                    선택됨: {selectedCustomer.youtube_nickname || "-"} · {selectedCustomer.customer_name || "-"}
                  </div>
                  <div className="mt-1 font-bold text-blue-600">{selectedCustomer.customer_phone || "-"}</div>
                  {isBlockedCustomer(selectedCustomer) && (
                    <div className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">
                      차단회원 {selectedCustomer.block_reason ? `· ${selectedCustomer.block_reason}` : ""}
                    </div>
                  )}
                  {selectedCustomer.customer_memo && (
                    <div className="mt-2 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] font-bold leading-4 text-slate-600">
                      기존메모: {selectedCustomer.customer_memo}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white"
                  >
                    고객 다시 선택
                  </button>
                </div>
              ) : customerResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] font-bold text-slate-400">
                  고객을 검색하면 결과가 표시됩니다.
                </div>
              ) : (
                customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedCustomer(customer)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left text-xs hover:bg-blue-50"
                  >
                    <div className="font-black text-slate-900">
                      {customer.youtube_nickname || "-"} · {customer.customer_name || "-"}
                    </div>
                    <div className="mt-1 font-bold text-slate-500">{customer.customer_phone || "-"}</div>
                    {isBlockedCustomer(customer) && (
                      <div className="mt-1 text-[11px] font-black text-red-600">차단회원</div>
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="mb-3">
              <div className="mb-1 text-xs font-black text-slate-500">이슈유형 다중선택</div>
              <div className="flex flex-wrap gap-1">
                {ISSUE_TYPES.map((type) => {
                  const active = selectedTypes.includes(type.taskType);
                  return (
                    <button
                      key={type.taskType}
                      type="button"
                      onClick={() => toggleIssueType(type.taskType)}
                      className={[
                        "rounded-lg px-2 py-1 text-xs font-black",
                        active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                      ].join(" ")}
                    >
                      {active ? "✓ " : ""}
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mb-1 block text-xs font-black text-slate-500">메모내용</label>
            <textarea
              rows={4}
              value={memoText}
              onChange={(event) => setMemoText(event.target.value)}
              placeholder="특이사항 내용을 입력하세요"
              className="mb-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />

            <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">
              메모날짜 자동입력 · 저장 후 미해결 이슈로 표시됩니다.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMemoAdd(false);
                  resetMemoForm();
                }}
                className="h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveIssueMemo}
                disabled={savingMemo}
                className="h-10 flex-1 rounded-xl bg-blue-600 text-xs font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {savingMemo ? "저장중" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
