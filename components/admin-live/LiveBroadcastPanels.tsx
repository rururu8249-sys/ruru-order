"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import type { CustomerRow } from "@/lib/admin-v2/types";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";

function nowProdListSummary(raw: unknown): string {
  if (Array.isArray(raw)) return raw.filter(Boolean).join(", ");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
    } catch {
      // 쉼표 구분 문자열일 수 있음
    }
    return raw.trim();
  }
  return "";
}

function nowProdImageOf(p: any): string {
  if (!p) return "";
  const direct = p.image_url || p.cover_image_url || p.main_image_url || p.thumbnail_url || "";
  if (direct) return resolveProductImageUrl(String(direct).trim());
  const arr = p.images || p.image_urls || p.detail_image_urls;
  if (Array.isArray(arr) && arr[0]) return resolveProductImageUrl(String(arr[0]).trim());
  return "";
}

type IssueStatusFilter = "open" | "all" | "resolved";
type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  youtubeUrl?: string | null;
  activeBroadcastId?: string | number | null;
  variant?: "row" | "column"; // row=가로 띠(기존) / column=우측 세로 컬럼(시안 2단)
  hideProducts?: boolean; // column에서 "지금 띄운 상품" 패널 숨김(그 자리에 고객이슈 패널을 대신 배치할 때)
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
  { label: "교환", taskType: "exchange", className: "bg-rose-soft text-rose-deep border-rose-line" },
  { label: "반품", taskType: "return", className: "bg-violet-100 text-violet-700 border-violet-200" },
  { label: "환불", taskType: "refund", className: "bg-red-100 text-danger-tx border-line" },
  { label: "구매", taskType: "product", className: "bg-green-100 text-ok-tx border-green-200" },
  { label: "진상", taskType: "complaint", className: "bg-rose-100 text-rose-700 border-rose-200" },
  { label: "기타", taskType: "general", className: "bg-surface-2 text-ink border-line" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function videoSizeClass(videoRatio: VideoRatio) {
  if (videoRatio === "wide") return "aspect-video h-[430px] w-full max-w-[760px]";
  if (videoRatio === "auto") return "aspect-[4/5] h-full max-w-full";
  return "aspect-[9/16] w-full";
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

function CustomerIssueSummaryRow({
  task,
  onDetail,
}: {
  task: AdminIssueTask;
  onDetail: () => void;
}) {
  const metas = getIssueTypeMetas(task);
  const nickname = getTaskNickname(task);
  const name = getTaskName(task);
  const displayName = [nickname, name].filter((value) => value && value !== "-").join(" / ") || "-";

  return (
    <button
      type="button"
      onClick={onDetail}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-rose-soft"
      title="고객관리에서 자세히 보기"
    >
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-warn-tx">
        미해결
      </span>

      <div className="min-w-0 truncate text-[12px] font-black text-ink">
        {displayName}
      </div>

      <div className="flex min-w-0 flex-wrap justify-end gap-1">
        {metas.map((meta) => (
          <span
            key={meta.taskType}
            className={`rounded-md border px-2 py-0.5 text-[11px] font-black ${meta.className}`}
          >
            {meta.label}
          </span>
        ))}
      </div>
    </button>
  );
}

export default function LiveBroadcastPanels({ videoRatio, youtubeUrl, activeBroadcastId, variant = "row", hideProducts = false }: Props) {
  const isCol = variant === "column";
  const [pinnedProduct, setPinnedProduct] = useState<any | null>(null);
  const [rotationProducts, setRotationProducts] = useState<any[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null); // 상품 사진 클릭 확대
  // 라이브 통계(동접·좋아요) — 25초 폴링. 읽기 전용.
  const [liveStats, setLiveStats] = useState<{ concurrentViewers: number | null; likeCount: number | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/youtube/live-stats", { cache: "no-store" });
        const j = await r.json();
        if (!alive || !j?.ok) return;
        const cv = j.concurrentViewers ?? null;
        const lc = j.likeCount ?? null;
        // 숫자가 실제로 바뀔 때만 갱신(같으면 prev 그대로 반환 → 리렌더 0, 깜박임 없음).
        setLiveStats((prev) => (prev && prev.concurrentViewers === cv && prev.likeCount === lc ? prev : { concurrentViewers: cv, likeCount: lc }));
      } catch { /* 무시 */ }
    };
    load();
    const t = setInterval(load, 25000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const [liveIdx, setLiveIdx] = useState(0);
  const [cycleOn, setCycleOn] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadNow = async () => {
      try {
        const { data: products, error } = await supabase.from("products").select("*");
        if (error || !alive) return;
        const list = (products || []) as any[];
        // 고정모드: is_pinned 상품 1개
        const pinned = list.find((p: any) => p?.is_pinned === true || p?.pinned === true) || null;
        if (alive) setPinnedProduct(pinned);
        // 순환모드: 활성 방송의 broadcast_products 연결 상품들
        if (activeBroadcastId) {
          const { data: links } = await supabase
            .from("broadcast_products")
            .select("product_id, sort_order")
            .eq("broadcast_id", activeBroadcastId)
            .order("sort_order", { ascending: true });
          const linkIds = ((links as { product_id: unknown }[]) || []).map((r) => String(r.product_id));
          const byId = new Map(list.map((p: any) => [String(p?.id ?? p?.product_id), p]));
          const rotation = linkIds.map((pid) => byId.get(pid)).filter(Boolean);
          if (alive) setRotationProducts(rotation);
        } else if (alive) {
          setRotationProducts([]);
        }
      } catch {
        // 무시 (상품 로드 실패해도 방송화면엔 영향 없음)
      }
    };
    loadNow();
    const onUpdated = () => loadNow();
    window.addEventListener("ruru-live-product-updated", onUpdated);
    return () => {
      alive = false;
      window.removeEventListener("ruru-live-product-updated", onUpdated);
    };
  }, [activeBroadcastId]);

  // 지금 방송 상품: 현재 인덱스/상품 (rotationProducts 단일 데이터원)
  const liveCount = rotationProducts.length;
  const safeIdx = liveCount ? (((liveIdx % liveCount) + liveCount) % liveCount) : 0;
  const liveProduct = liveCount ? rotationProducts[safeIdx] : null;

  // 선택 상품을 DB 고정(LIVE) 처리 — AdminLiveProductManagePopup과 동일 방식
  const pinLiveProduct = async (productId: string) => {
    if (!productId) return;
    try {
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
      await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: true }, filters: [{ type: "eq", col: "id", val: productId }] });
      window.dispatchEvent(new Event("ruru-live-product-updated"));
    } catch {
      // 무시 (고정 실패해도 방송화면엔 영향 없음)
    }
  };

  // 이전/다음/그리드 클릭 → 인덱스 점프 + 해당 상품 고정(수동 선택 시 자동순환 해제)
  const goToLiveIdx = (idx: number) => {
    if (liveCount === 0) return;
    const safe = (((idx % liveCount) + liveCount) % liveCount);
    setLiveIdx(safe);
    if (cycleOn) setCycleOn(false);
    const prod = rotationProducts[safe];
    void pinLiveProduct(String(prod?.id ?? prod?.product_id ?? ""));
  };

  // 자동순환 토글: 켜면 모든 고정 해제(개별 고정 안 함), interval은 표시용
  const toggleCycle = async () => {
    const next = !cycleOn;
    setCycleOn(next);
    if (next) {
      try {
        await adminCatalogWrite({ table: "products", op: "update", values: { is_pinned: false }, filters: [{ type: "eq", col: "is_pinned", val: true }] });
        window.dispatchEvent(new Event("ruru-live-product-updated"));
      } catch {
        // 무시
      }
    }
  };

  // 자동순환 ON일 때 liveIdx만 자동 증가(화면 표시용)
  useEffect(() => {
    if (!cycleOn || liveCount === 0) return;
    const timer = setInterval(() => {
      setLiveIdx((i) => (i + 1) % liveCount);
    }, 4000);
    return () => clearInterval(timer);
  }, [cycleOn, liveCount]);

  // OBS 위젯(상품) 주소 복사
  const copyObsWidgetUrl = async () => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await navigator.clipboard.writeText(`${origin}/product-widget`);
      showAdminToast("OBS 위젯 주소를 복사했어요.", "success");
    } catch {
      showAdminToast("주소 복사에 실패했어요.", "error");
    }
  };

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
  const [editingIssueTask, setEditingIssueTask] = useState<AdminIssueTask | null>(null);
  const [editingIssueMemo, setEditingIssueMemo] = useState("");
  const [savingEditMemo, setSavingEditMemo] = useState(false);

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
  const videoEmbedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&enablejsapi=1` : "";
  // 영상 음소거/볼륨 — 유튜브 자체 컨트롤이 cover로 잘려 안 보이므로 별도 제어(IFrame API postMessage)
  const videoIframeRef = useRef<HTMLIFrameElement>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoVolume, setVideoVolume] = useState(100);
  const ytCmd = (func: string, args: (number | string)[] = []) =>
    videoIframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  const toggleVideoMute = () => {
    setVideoMuted((m) => {
      const next = !m;
      ytCmd(next ? "mute" : "unMute");
      if (!next) ytCmd("setVolume", [videoVolume]);
      return next;
    });
  };
  const changeVideoVolume = (v: number) => {
    setVideoVolume(v);
    ytCmd("setVolume", [v]);
    if (v > 0 && videoMuted) { setVideoMuted(false); ytCmd("unMute"); }
    if (v === 0 && !videoMuted) { setVideoMuted(true); ytCmd("mute"); }
  };
  const chatEmbedUrl = videoId && embedDomain ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${embedDomain}` : "";

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => !isResolved(task))
      .sort((a, b) => {
        const aTime = new Date(String(a.created_at || a.updated_at || 0)).getTime() || 0;
        const bTime = new Date(String(b.created_at || b.updated_at || 0)).getTime() || 0;
        return bTime - aTime;
      });
  }, [tasks]);

  const openCount = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / 8));
  const safePage = Math.min(Math.max(1, taskPage), totalPages);
  const visibleTasks = filteredTasks.slice((safePage - 1) * 8, safePage * 8);
  const pageNumbers = Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1);

  const goCustomerManagement = () => {
    window.dispatchEvent(
      new CustomEvent("ruru-admin-live-open-panel", {
        detail: "customers",
      })
    );
  };

  const searchCustomers = async () => {
    const keyword = customerKeyword.trim();

    if (keyword.length < 1) {
      showAdminToast("검색어를 입력해주세요.");
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
        showAdminToast("고객 검색 실패\n\n" + error.message);
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
      showAdminToast("고객을 먼저 선택해주세요.");
      return;
    }

    const memo = memoText.trim();

    if (!memo) {
      showAdminToast("메모 내용을 입력해주세요.");
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
        showAdminToast("고객이슈 저장 실패\n\n" + (payload?.message || "알 수 없는 오류"));
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
      showAdminToast("해결 처리할 이슈 ID가 없습니다.");
      return;
    }

    const ok = await showAdminConfirm("이 고객이슈를 해결완료 처리할까요?");
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
      showAdminToast("해결완료 처리 실패\n\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    await loadTasks();
  };

  const hideResolvedTask = async (task: AdminIssueTask) => {
    const id = taskId(task);

    if (!id) {
      showAdminToast("삭제 처리할 이슈 ID가 없습니다.");
      return;
    }

    const ok = await showAdminConfirm("해결완료 목록에서 이 이슈를 삭제할까요?\n\nDB 완전삭제가 아니라 목록 숨김 처리됩니다.");
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
      showAdminToast("삭제 처리 실패\n\n" + (payload?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-updated"));
    await loadTasks();
  };

  const editIssueMemo = (task: AdminIssueTask) => {
    const id = taskId(task);

    if (!id) {
      showAdminToast("수정할 이슈 ID가 없습니다.");
      return;
    }

    setShowMemoAdd(false);
    setEditingIssueTask(task);
    setEditingIssueMemo(getTaskContent(task));
  };

  const closeIssueMemoEditor = () => {
    if (savingEditMemo) return;

    setEditingIssueTask(null);
    setEditingIssueMemo("");
  };

  const saveEditedIssueMemo = async () => {
    const task = editingIssueTask;

    if (!task) {
      showAdminToast("수정할 고객이슈를 찾지 못했습니다.");
      return;
    }

    const id = taskId(task);

    if (!id) {
      showAdminToast("수정할 이슈 ID가 없습니다.");
      return;
    }

    const memo = editingIssueMemo.trim();

    if (!memo) {
      showAdminToast("메모 내용은 비워둘 수 없습니다.");
      return;
    }

    setSavingEditMemo(true);

    try {
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
        showAdminToast("고객이슈 수정 실패\n\n" + (payload?.message || "알 수 없는 오류"));
        return;
      }

      window.dispatchEvent(new Event("ruru-admin-task-updated"));
      await loadTasks();
      setEditingIssueTask(null);
      setEditingIssueMemo("");
    } finally {
      setSavingEditMemo(false);
    }
  };

  return (
    <section className={isCol ? `flex w-full flex-col gap-3${hideProducts ? "" : " xl:h-full"}` : "mb-4 flex w-full items-stretch gap-3"}>
      <div className={`min-w-0 rounded-2xl border border-line bg-surface p-3.5 shadow-sm flex flex-col ${isCol ? (videoEmbedUrl ? "h-[480px] w-full xl:h-[44vh] xl:min-h-[260px] xl:shrink-0" : "h-[140px] w-full xl:shrink-0") : "h-[420px]"}`} style={isCol ? undefined : { flex: "1 1 0%" }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-ink">
            방송화면
            <span
              className={[
                "rounded-md px-2 py-0.5 text-[11px] font-black",
                videoEmbedUrl ? "bg-emerald-600 text-white" : "bg-warn-bg text-warn-tx",
              ].join(" ")}
            >
              {videoEmbedUrl ? "영상 연결" : "URL 대기"}
            </span>
            {liveStats?.concurrentViewers != null ? (
              <span className="rounded-md bg-rose-soft px-2 py-0.5 text-[11px] font-black text-rose-deep" title="동시 시청자 수">👁 {liveStats.concurrentViewers.toLocaleString("ko-KR")}</span>
            ) : null}
            {liveStats?.likeCount != null ? (
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-black text-ink-soft" title="좋아요 수">👍 {liveStats.likeCount.toLocaleString("ko-KR")}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {videoEmbedUrl ? (
              <>
                <button
                  type="button"
                  onClick={toggleVideoMute}
                  title={videoMuted ? "소리 켜기" : "음소거"}
                  className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[13px] leading-none hover:bg-surface-3"
                >
                  {videoMuted ? "🔇" : "🔊"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={videoVolume}
                  onChange={(e) => changeVideoVolume(Number(e.target.value))}
                  title={`볼륨 ${videoVolume}%`}
                  className="h-1 w-16 cursor-pointer accent-rose-deep"
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="relative flex-1 min-h-0 w-full overflow-hidden rounded-2xl border border-line bg-slate-950">
          {videoEmbedUrl ? (
            <iframe
              ref={videoIframeRef}
              title="YouTube live video"
              src={videoEmbedUrl}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[128%] w-auto max-w-none aspect-[9/16]"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 via-stone-100 to-slate-100">
              <div className="w-[78%] rounded-[2rem] bg-surface/70 p-6 text-center shadow-sm backdrop-blur">
                <div className="text-5xl">👟</div>
                <div className="mt-4 text-lg font-black text-ink">루루동이LIVE</div>
                <div className="mt-2 text-xs font-bold text-ink-soft">유튜브 라이브 URL을 적용하면 방송화면이 표시됩니다.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`min-w-0 rounded-2xl border border-line bg-surface p-3.5 shadow-sm flex flex-col ${isCol ? (chatEmbedUrl ? "h-[560px] w-full xl:h-[calc(100vh-44vh-1.75rem)] xl:min-h-[260px] xl:shrink-0" : "h-[140px] w-full xl:shrink-0") : "h-[420px]"}`} style={isCol ? undefined : { flex: "3 1 0%" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-ink">라이브 채팅</h2>
          <span className="text-xs font-bold text-ink-soft">{chatEmbedUrl ? "채팅 연결" : "URL 대기"}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-line bg-surface-2">
          {chatEmbedUrl ? (
            <iframe
              title="YouTube live chat"
              src={chatEmbedUrl}
              className="h-full w-full bg-surface"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <div className="text-4xl">💬</div>
                <div className="mt-3 text-sm font-black text-ink">라이브 채팅 연결 대기</div>
                <div className="mt-2 text-xs font-bold leading-5 text-ink-mute">
                  유튜브 라이브 URL을 입력하고 적용하면<br />
                  이 영역에 실제 채팅창이 표시됩니다.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {hideProducts ? null : isCol ? (
        /* 컴팩트(우측 컬럼): 지금 띄운 상품. 영상·채팅 아래(스크롤) — 남은 세로공간을 채워 빈공간 방지 */
        <div className="min-w-0 w-full shrink-0 xl:flex-1 xl:min-h-0 rounded-2xl border border-line bg-surface p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-black text-ink-mute">🛍 지금 띄운 상품{liveCount > 1 ? ` · ${safeIdx + 1}/${liveCount}` : ""}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleCycle}
                title="자동순환(여러 상품을 번갈아 표시)"
                className={["rounded-lg px-2 py-1 text-[11px] font-black transition", cycleOn ? "bg-rose-deep text-white" : "border border-line bg-surface-2 text-ink-soft hover:bg-surface-3"].join(" ")}
              >
                {cycleOn ? "⏸ 순환 ON" : "▶ 순환"}
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("ruru-reopen-product-manage"))}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-3"
              >
                관리·변경
              </button>
            </div>
          </div>
          {liveProduct ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => { const u = nowProdImageOf(liveProduct); if (u) setLightbox(u); }}
                  title="사진 크게 보기"
                  className="h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-line bg-surface-2"
                >
                  {nowProdImageOf(liveProduct) ? (
                    <img src={nowProdImageOf(liveProduct)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-lg">👟</span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-black text-ink">{liveProduct.product_name || liveProduct.name || liveProduct.title || "상품명 없음"}</div>
                  <div className="text-[13px] font-black text-rose-deep">{Number(liveProduct.price ?? liveProduct.sale_price ?? liveProduct.selling_price ?? 0).toLocaleString("ko-KR")}원</div>
                </div>
                {liveCount > 1 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => goToLiveIdx(safeIdx - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-soft transition hover:bg-surface-3">‹</button>
                    <button type="button" onClick={() => goToLiveIdx(safeIdx + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-soft transition hover:bg-surface-3">›</button>
                  </div>
                ) : null}
              </div>
              {liveCount > 1 ? (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {rotationProducts.map((p: any, i: number) => (
                    <button
                      type="button"
                      key={String(p?.id ?? i)}
                      onClick={() => goToLiveIdx(i)}
                      title={p?.product_name || p?.name || ""}
                      className={["relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-surface-2 transition", i === safeIdx ? "border-rose-deep ring-1 ring-rose-deep" : "border-line hover:border-rose-line"].join(" ")}
                    >
                      {nowProdImageOf(p) ? (
                        <img src={nowProdImageOf(p)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-sm">👟</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs font-bold leading-5 text-ink-mute">상품관리에서 순환 담기 또는 새 상품 등록 시 표시됩니다.</div>
          )}
        </div>
      ) : (
      <div className="min-w-0 rounded-2xl border border-line bg-surface p-3.5 shadow-sm flex flex-col h-[420px]" style={{ flex: "1.2 1 0%" }}>
        {/* 헤더: 제목 + 자동순환 토글 */}
        <div className="mb-2 flex items-center gap-2 text-sm font-black text-ink">
          지금 방송 상품
          <button
            type="button"
            onClick={toggleCycle}
            className={[
              "ml-auto rounded-lg px-2.5 py-1 text-[11px] font-black transition",
              cycleOn ? "text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3",
            ].join(" ")}
            style={cycleOn ? { background: "#7B2D43" } : undefined}
          >
            {cycleOn ? "⏸ 자동순환 ON" : "▶ 자동순환"}
          </button>
        </div>

        {liveProduct ? (
          <div className="flex flex-1 min-h-0 flex-col">
            {/* 큰 카드: 지금 띄운 상품 1개 */}
            <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-line bg-surface-2">
              {nowProdImageOf(liveProduct) ? (
                <img src={nowProdImageOf(liveProduct)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl">👟</div>
              )}
              {/* LIVE 배지 + 카운터 */}
              <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-0.5 text-[10px] font-black text-white">
                <span>🔴 LIVE</span>
                <span className="opacity-90">{safeIdx + 1}/{liveCount}</span>
              </div>
              {/* 이전/다음 */}
              {liveCount > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => goToLiveIdx(safeIdx - 1)}
                    className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => goToLiveIdx(safeIdx + 1)}
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
                  >
                    ›
                  </button>
                </>
              ) : null}
            </div>

            {/* 상품명/가격 */}
            <div className="mt-2 truncate text-[14px] font-black text-ink">
              {liveProduct.product_name || liveProduct.name || liveProduct.title || "상품명 없음"}
            </div>
            <div className="text-[15px] font-black text-rose-deep">
              {Number(liveProduct.price ?? liveProduct.sale_price ?? liveProduct.selling_price ?? 0).toLocaleString("ko-KR")}원
            </div>

            {/* 썸네일 가로 1줄 (가로 스크롤) — 칸 겹침 방지 */}
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {rotationProducts.map((p: any, i: number) => {
                const on = i === safeIdx;
                return (
                  <button
                    type="button"
                    key={String(p?.id ?? i)}
                    onClick={() => goToLiveIdx(i)}
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-surface-2"
                    style={on ? { borderWidth: "2px", borderColor: "var(--color-rose-deep)" } : { borderColor: "#E5E7EB" }}
                  >
                    {nowProdImageOf(p) ? (
                      <img src={nowProdImageOf(p)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-lg">👟</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2 px-4 text-center text-xs font-bold leading-5 text-ink-mute">
            상품관리에서 순환 담기 또는<br />새 상품을 등록하면 여기에 표시됩니다.
          </div>
        )}

        {/* 하단 버튼 */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("ruru-open-quick-product-panel"))}
            className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black text-white"
            style={{ background: "#7B2D43" }}
          >
            + 즉석
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("ruru-reopen-product-manage"))}
            className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-black text-ink-soft hover:bg-surface-2"
          >
            관리
          </button>
          <button
            type="button"
            onClick={copyObsWidgetUrl}
            title="OBS 위젯 주소 복사"
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft hover:bg-surface-2"
          >
            🔗
          </button>
        </div>
      </div>
      )}
      {lightbox ? (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 24 }}
        >
          <img src={lightbox} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 12 }} />
        </div>
      ) : null}
</section>
  );
}
