"use client";

import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useState, type ClipboardEvent } from "react";

type RouletteMode = "live" | "test" | "preview";

const FIXED_OVERLAY_TOKEN = "roulette_luludongi_live";
const FIXED_CLAW_OVERLAY_TOKEN = "claw_luludongi_live";

type RouletteBroadcast = {
  id: string;
  title: string;
  label: string;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
};

type RouletteParticipant = {
  nickname: string;
  order_count?: number;
  qty_sum?: number;
  amount_sum?: number;
  order_ids?: string[];
  weight?: number;
};

type RouletteEvent = {
  id?: string;
  title: string;
  overlay_token?: string;
  overlay_api_path?: string;
  mode: RouletteMode;
  is_test: boolean;
  status: "idle" | "spinning" | "result" | "closed";
  event_date?: string | null;
  source_date?: string | null;
  participants?: RouletteParticipant[];
  participant_count?: number;
  winner_nickname?: string | null;
  winner_note?: string | null;
  winner_order_ids?: string[];
  spin_started_at?: string | null;
  spin_duration_ms?: number | null;
  result_at?: string | null;
};

type RouletteWinner = {
  id: string;
  event_id: string;
  nickname: string;
  winner_note: string;
  winner_at: string;
  is_reward_done: boolean;
  reward_done_at?: string | null;
  is_test: boolean;
  memo?: string | null;
  created_at?: string;
};

type BroadcastsPayload = {
  ok: boolean;
  message?: string;
  broadcasts?: RouletteBroadcast[];
};

type ParticipantsPayload = {
  ok: boolean;
  message?: string;
  mode?: RouletteMode;
  source_date?: string;
  participant_count?: number;
  participants?: RouletteParticipant[];
};

type EventPayload = {
  ok: boolean;
  message?: string;
  event?: RouletteEvent;
  saved?: boolean;
};

type EventsPayload = {
  ok: boolean;
  message?: string;
  events?: RouletteEvent[];
};

type AdminLiveEventRoulettePanelProps = {
  buttonLabel?: string;
  buttonClassName?: string;
  renderTrigger?: boolean;
  controlledOpen?: boolean;
  onRequestClose?: () => void;
  activeBroadcastId?: string | number | null;
};

type WinnersPayload = {
  ok: boolean;
  message?: string;
  winners?: RouletteWinner[];
};

function todayText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return kst.toISOString().slice(0, 10);
}

function money(value: unknown) {
  const amount = Math.floor(Number(value || 0));

  return `${amount.toLocaleString("ko-KR")}원`;
}

function dateTime(value: unknown) {
  const raw = String(value || "");

  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 년월일(요일) 시간 — 예: 2026.06.06(금) 21:40
function dateTimeFull(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd}(${wd}) ${hh}:${mi}`;
}

function modeLabel(mode: RouletteMode) {
  if (mode === "live") return "실제 운영";
  if (mode === "test") return "테스트";
  return "미리보기";
}

function modeBadgeClass(mode: RouletteMode) {
  if (mode === "live") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (mode === "test") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload?.message || "룰렛 요청 실패");
  }

  return payload;
}

function buildOverlayUrl(_event: RouletteEvent | null) {
  if (typeof window === "undefined") return "";

  return "https://ruru-order.vercel.app/event-roulette/live?token=roulette_luludongi_live&scale=0.72&v=b50";
}

function buildClawOverlayUrl() {
  if (typeof window === "undefined") return "";

  return `${window.location.origin}/event-claw/overlay?token=${encodeURIComponent(FIXED_CLAW_OVERLAY_TOKEN)}`;
}

async function copyText(value: string) {
  if (!value) {
    showAdminToast("복사할 위젯주소가 없습니다.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showAdminToast("방송용 위젯주소를 복사했습니다.", "success");
  } catch {
    showAdminToast("복사 실패. 주소를 직접 선택해서 복사해주세요.", "error");
  }
}

export default function AdminLiveEventRoulettePanel({
  buttonLabel = "🎁 이벤트",
  buttonClassName = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl bg-violet-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-violet-700",
  renderTrigger = true,
  controlledOpen,
  onRequestClose,
  activeBroadcastId,
}: AdminLiveEventRoulettePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const closePanel = () => {
    if (controlledOpen !== undefined) onRequestClose?.();
    else setInternalOpen(false);
  };
  const [mode, setMode] = useState<RouletteMode>("test");
  const [sourceDate] = useState(todayText);
  const [broadcasts, setBroadcasts] = useState<RouletteBroadcast[]>([]);
  const [broadcastId, setBroadcastId] = useState("");
  const [title, setTitle] = useState("🎁 선물이모티콘이벤트");
  const [winnerNote, setWinnerNote] = useState("이벤트 당첨");
  const [participants, setParticipants] = useState<RouletteParticipant[]>([]);
  const [currentEvent, setCurrentEvent] = useState<RouletteEvent | null>(null);
  const [events, setEvents] = useState<RouletteEvent[]>([]);
  const [winners, setWinners] = useState<RouletteWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [eventTab, setEventTab] = useState<"roulette" | "claw">("claw");
  const [participantSource, setParticipantSource] = useState<"auto" | "paid" | "manual">("auto");
  const [manualParticipantText, setManualParticipantText] = useState("");
  const [fixedWinnerNickname, setFixedWinnerNickname] = useState("");
  const [clawResultType, setClawResultType] = useState<"capsule" | "doll">("capsule");
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [giftType, setGiftType] = useState<"point" | "custom">("point");
  const [giftPointAmount, setGiftPointAmount] = useState("");
  // 시안 신규 UI 상태 (추첨 로직 무변경 — 표시/선택용)
  const [excludeDailyDup, setExcludeDailyDup] = useState(true);
  const [useWeight, setUseWeight] = useState(false);
  const [listPeriod, setListPeriod] = useState<"today" | "week" | "month" | "date">("today");
  const [listDate, setListDate] = useState("");


  const overlayUrl = useMemo(() => buildOverlayUrl(currentEvent), [currentEvent]);
  const clawOverlayUrl = useMemo(() => buildClawOverlayUrl(), []);

  const manualParticipants = useMemo<RouletteParticipant[]>(() => {
    const seen = new Set<string>();

    return manualParticipantText
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((nickname) => {
        if (seen.has(nickname)) return false;
        seen.add(nickname);
        return true;
      })
      .map((nickname) => ({
        nickname,
        order_count: 0,
        qty_sum: 0,
        amount_sum: 0,
        order_ids: [],
        weight: 1,
      }));
  }, [manualParticipantText]);

  const finalParticipants = participantSource === "manual" ? manualParticipants : participants;
  const selectedWinnerNickname =
    fixedWinnerNickname.trim() ||
    finalParticipants[0]?.nickname ||
    currentEvent?.winner_nickname ||
    "";

  const recentEvents = events.slice(0, 3);
  const recentWinners = winners.slice(0, 100);
  const autoParticipantCount = participants.length;
  const manualParticipantCount = manualParticipants.length;

  // 룰렛 휠 색상(시안 팔레트) + conic-gradient (참가자 N등분)
  const WHEEL_COLORS = ["#ec4899", "#fb7185", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#7c3aed"];
  const wheelCount = Math.max(finalParticipants.length, 1);
  const wheelGradient = `conic-gradient(${Array.from({ length: wheelCount })
    .map((_, i) => {
      const start = (i / wheelCount) * 100;
      const end = ((i + 1) / wheelCount) * 100;
      return `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${start}% ${end}%`;
    })
    .join(", ")})`;

  // 이벤트목록 기간필터 (오늘/이번주/이번달/날짜선택) — winner_at 기준 클라이언트 필터
  const filteredWinners = useMemo(() => {
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;
    if (listPeriod === "today") {
      from = startOf(now);
    } else if (listPeriod === "week") {
      const day = (now.getDay() + 6) % 7; // 월요일 시작
      from = startOf(now) - day * 86400000;
    } else if (listPeriod === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (listPeriod === "date" && listDate) {
      const picked = new Date(listDate);
      from = startOf(picked);
      to = from + 86400000;
    }
    return recentWinners.filter((w) => {
      const raw = String(w.winner_at || "");
      const t = raw ? new Date(raw).getTime() : 0;
      if (!Number.isFinite(t) || t === 0) return listPeriod === "today" ? false : true;
      return t >= from && t < to;
    });
  }, [recentWinners, listPeriod, listDate]);

  const openEventPanel = () => {
    setInternalOpen(true);
  };

  // 초기화: 참가자 + 당첨고정 + 당첨자발표(현재 이벤트) 동시 리셋. 기록/목록은 건드리지 않음.
  const resetEvent = () => {
    setParticipants([]);
    setManualParticipantText("");
    setFixedWinnerNickname("");
    setCurrentEvent(null);
  };

  const changeMode = (nextMode: RouletteMode) => {
    setMode(nextMode);
    void loadParticipants(nextMode, sourceDate, broadcastId);
  };

  const changeBroadcast = (nextBroadcastId: string) => {
    setBroadcastId(nextBroadcastId);
    void loadParticipants(mode, sourceDate, nextBroadcastId);
  };

  // 참가자 불러오기 기준 = 현재 활성 방송(activeBroadcast) 기간. 방송 OFF면 안내.
  const liveBroadcastId = activeBroadcastId != null ? String(activeBroadcastId) : "";

  const changeParticipantSource = (source: "auto" | "paid" | "manual") => {
    setParticipantSource(source);

    if (source === "auto" || source === "paid") {
      if (!liveBroadcastId) {
        showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 시작한 뒤 참가자를 불러올 수 있어요.", "warning");
        return;
      }
      void loadParticipants(mode, sourceDate, liveBroadcastId, source === "paid");
    }
  };

  // 채팅 붙여넣기 → @닉네임만 추출(중복 제거). @가 없으면 줄/쉼표 단위로 처리.
  const parseChatNicknames = (raw: string) => {
    const atTokens = raw.match(/@[^\s,@]+/g);
    const source = atTokens && atTokens.length > 0 ? atTokens.map((t) => t.slice(1)) : raw.split(/\r?\n|,/);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const token of source) {
      const name = token.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      result.push(name);
    }
    return result;
  };

  const handleManualPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted.includes("@")) return; // 일반 붙여넣기는 그대로
    event.preventDefault();
    const existing = manualParticipantText.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
    const merged = parseChatNicknames([...existing, ...parseChatNicknames(pasted)].join("\n"));
    setManualParticipantText(merged.join("\n"));
  };

  const addManualSample = () => {
    const current = manualParticipantText.trim();

    if (!current) {
      setManualParticipantText("눈누난나\n뽀글이\n오랑이");
      return;
    }

    setManualParticipantText(`${current}\n새참가자`);
  };

  const previewClawAnimation = () => {
    showAdminToast("인형뽑기 미리보기는 다음 단계에서 방송용 위젯에 연결합니다.", "info");
  };

  const startClawEvent = async () => {
    if (finalParticipants.length === 0) {
      showAdminToast("참가자 명단이 없습니다. 자동 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }

    setCurrentEvent(null); // 이전 당첨자 표시 제거 후 새 게임
    setSpinning(true);

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          mode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: "claw",
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "인형뽑기 이벤트 생성 실패");
      }

      const eventId = createPayload.event.id;

      if (!eventId) {
        setCurrentEvent(createPayload.event);
        setParticipants(createPayload.event.participants || finalParticipants);
        showAdminToast("인형뽑기 미리보기 이벤트를 불러왔습니다.", "success");
        return;
      }

      const spinPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
        
          manualParticipantText,
        }),
      });

      if (!spinPayload.ok || !spinPayload.event) {
        throw new Error(spinPayload.message || "인형뽑기 시작 실패");
      }

      setCurrentEvent(spinPayload.event);
      setParticipants(spinPayload.event.participants || createPayload.event.participants || finalParticipants);
      await loadEventsAndWinners();
      showAdminToast(`인형뽑기 당첨자: ${spinPayload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("인형뽑기 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const loadBroadcasts = async () => {
    try {
      const payload = await requestJson<BroadcastsPayload>("/api/admin-live/event-roulette?action=broadcasts");

      if (!payload.ok) {
        throw new Error(payload.message || "방송리스트 조회 실패");
      }

      const list = payload.broadcasts || [];
      setBroadcasts(list);

      return list;
    } catch (error) {
      showAdminToast("방송리스트 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      return [];
    }
  };

  const loadParticipants = async (nextMode = mode, nextSourceDate = sourceDate, nextBroadcastId = broadcastId, paidOnly = false) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        action: "participants",
        mode: nextMode,
        sourceDate: nextSourceDate,
      });

      if (nextBroadcastId) {
        params.set("broadcastId", nextBroadcastId);
      }

      // 입금완료만 필터 (서버 지원 시 적용 · P2에서 서버 연동)
      if (paidOnly) {
        params.set("paidOnly", "true");
      }

      const payload = await requestJson<ParticipantsPayload>(`/api/admin-live/event-roulette?${params.toString()}`);

      if (!payload.ok) {
        throw new Error(payload.message || "참여자 조회 실패");
      }

      setParticipants(payload.participants || []);
      await ensureRoulettePreviewEvent(payload.participants || []);
    } catch (error) {
      showAdminToast("룰렛 참여자 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadEventsAndWinners = async () => {
    try {
      const [eventsPayload, winnersPayload] = await Promise.all([
        requestJson<EventsPayload>("/api/admin-live/event-roulette?action=events&includeTest=true"),
        requestJson<WinnersPayload>("/api/admin-live/event-roulette?action=winners&includeTest=true"),
      ]);

      if (eventsPayload.ok) setEvents(eventsPayload.events || []);
      if (winnersPayload.ok) setWinners(winnersPayload.winners || []);
    } catch (error) {
      showAdminToast("룰렛 기록 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  useEffect(() => {
    if (!open) return;

    const bootstrap = async () => {
      const list = await loadBroadcasts();
      const nextBroadcastId = broadcastId || list[0]?.id || "";

      if (nextBroadcastId) {
        setBroadcastId(nextBroadcastId);
      }

      await loadParticipants(mode, sourceDate, nextBroadcastId);
      await loadEventsAndWinners();
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createEvent = async () => {
    setLoading(true);

    try {
      const payload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          mode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: "roulette",
        }),
      });

      if (!payload.ok || !payload.event) {
        throw new Error(payload.message || "룰렛 이벤트 생성 실패");
      }

      setCurrentEvent(payload.event);
      setParticipants(payload.event.participants || participants);
      await loadEventsAndWinners();

      if (payload.saved === false) {
        showAdminToast("미리보기 룰렛을 불러왔습니다. 실제 기록에는 저장되지 않습니다.", "success");
      } else {
        showAdminToast(`${modeLabel(mode)} 룰렛 이벤트를 만들었습니다.`, "success");
      }
    } catch (error) {
      showAdminToast("룰렛 이벤트 생성 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setLoading(false);
    }
  };

  const spinEvent = async () => {
    if (!currentEvent?.id) {
      showAdminToast("먼저 테스트 또는 실제 운영 룰렛 이벤트를 만들어주세요.", "warning");
      return;
    }

    if (!String(currentEvent.overlay_token || "").startsWith("roulette_")) {
      setCurrentEvent(null);
      setSpinning(false);
      showAdminToast("현재 선택된 이벤트가 룰렛이 아닙니다. 룰렛 만들기를 먼저 눌러주세요.", "warning");
      return;
    }

    setSpinning(true);

    try {
      const payload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId: currentEvent.id,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
        
          manualParticipantText,
        }),
      });

      if (!payload.ok || !payload.event) {
        throw new Error(payload.message || "룰렛 시작 실패");
      }

      setCurrentEvent(payload.event);
      await loadEventsAndWinners();
      showAdminToast(`당첨자: ${payload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("룰렛 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const ensureRoulettePreviewEvent = async (nextParticipants: RouletteParticipant[]) => {
    if (eventTab !== "roulette") return;
    if (nextParticipants.length === 0) return;

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          title,
          mode,
          sourceDate,
          broadcastId,
          participants: nextParticipants,
          eventKind: "roulette",
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "룰렛 미리보기 이벤트 생성 실패");
      }

      setCurrentEvent(createPayload.event);
      setParticipants(createPayload.event.participants || nextParticipants);
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast(
        "룰렛 미리보기 생성 실패\\n\\n" + (error instanceof Error ? error.message : String(error)),
        "error"
      );
    }
  };

  const startRouletteOneClick = async () => {
    if (finalParticipants.length === 0) {
      showAdminToast("먼저 주문서 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }

    if (spinning) {
      return;
    }

    setCurrentEvent(null); // 이전 당첨자 표시 제거 후 새 게임
    setSpinning(true);

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          title,
          mode,
          sourceDate,
          broadcastId,
          participantSource,
          participants: finalParticipants,
          manualParticipantText,
          eventKind: "roulette",
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "룰렛 이벤트 생성 실패");
      }

      setCurrentEvent(createPayload.event);
      setParticipants(createPayload.event.participants || finalParticipants);

      const spinPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId: createPayload.event.id,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
          manualParticipantText,
        }),
      });

      if (!spinPayload.ok || !spinPayload.event) {
        throw new Error(spinPayload.message || "룰렛 시작 실패");
      }

      setCurrentEvent(spinPayload.event);
      setParticipants(spinPayload.event.participants || createPayload.event.participants || finalParticipants);
      await loadEventsAndWinners();
      showAdminToast(`당첨자: ${spinPayload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("룰렛 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const markRewardDone = async (winner: RouletteWinner, isRewardDone: boolean) => {
    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_reward_done",
          winnerId: winner.id,
          isRewardDone,
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "지급완료 처리 실패");
      }

      await loadEventsAndWinners();
      showAdminToast(isRewardDone ? "지급완료 체크했습니다." : "지급완료 체크를 해제했습니다.", "success");
    } catch (error) {
      showAdminToast("지급완료 처리 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const deleteRouletteEvent = async (
    event: {
      id?: string | null;
      title?: string | null;
      mode?: string | null;
      is_test?: boolean | null;
      winner_nickname?: string | null;
    },
    sourceLabel: string,
  ) => {
    if (!event?.id) {
      showAdminToast("삭제할 룰렛 이벤트 ID가 없습니다.", "warning");
      return;
    }

    const isLive = event.mode === "live" || event.is_test === false;
    const confirmMessage = isLive
      ? `운영 룰렛 이벤트를 삭제합니다.\n\n이벤트: ${event.title || sourceLabel}\n당첨자: ${event.winner_nickname || "-"}\n\n이 룰렛 이벤트와 연결 당첨자 기록이 당첨자 관리에서 모두 삭제됩니다.\n이미 지급/고객 안내한 내용은 별도로 확인해야 합니다.\n\n정말 삭제할까요?`
      : `테스트 룰렛 이벤트를 삭제할까요?\n\n${event.title || sourceLabel}`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_event",
          eventId: event.id,
          allowLiveDelete: isLive,
          liveConfirmText: isLive ? "운영이벤트삭제" : "",
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "룰렛 이벤트 삭제 실패");
      }

      if (currentEvent?.id && currentEvent.id === event.id) {
        setCurrentEvent(null);
      }

      showAdminToast("룰렛 이벤트를 삭제했습니다.", "success");
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast("룰렛 이벤트 삭제 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const deleteWinnerRecord = async (winner: RouletteWinner) => {
    if (!winner?.event_id) {
      showAdminToast("연결된 룰렛 이벤트 ID가 없어 당첨자 기록만 삭제할 수 없습니다.", "warning");
      return;
    }

    await deleteRouletteEvent(
      {
        id: winner.event_id,
        title: `${winner.nickname} 당첨 룰렛`,
        mode: winner.is_test ? "test" : "live",
        is_test: winner.is_test,
        winner_nickname: winner.nickname,
      },
      winner.is_test ? "테스트 당첨 룰렛" : "운영 당첨 룰렛",
    );
  };


  const deleteAllTestRecords = async () => {
    if (!window.confirm("테스트 룰렛 이벤트와 테스트 당첨 기록을 모두 삭제할까요?\n\n운영 기록은 삭제하지 않습니다.")) return;

    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_test_records",
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "테스트 기록 삭제 실패");
      }

      if (currentEvent?.is_test) {
        setCurrentEvent(null);
      }

      showAdminToast("테스트 룰렛 기록을 삭제했습니다.", "success");
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast("테스트 기록 삭제 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };


  const startSpin = eventTab === "roulette" ? startRouletteOneClick : startClawEvent;
  const widgetUrl = eventTab === "roulette" ? overlayUrl : clawOverlayUrl;
  const periodChips: { key: "today" | "week" | "month" | "date"; label: string }[] = [
    { key: "today", label: "오늘" },
    { key: "week", label: "이번주" },
    { key: "month", label: "이번달" },
    { key: "date", label: "날짜선택" },
  ];

  return (
    <>
      {renderTrigger ? (
        <button type="button" onClick={openEventPanel} className={buttonClassName}>
          {buttonLabel}
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
          <section className="flex h-[calc(100vh-24px)] w-[min(1400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">

            {/* 헤더: ◆ 이벤트 + 룰렛/인형뽑기 탭 + 모드 + 초기화 + ✕ */}
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
              <div className="mr-1 text-[20px] font-black text-slate-950">◆ 이벤트</div>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                <button type="button" onClick={() => { setEventTab("roulette"); setCurrentEvent(null); setSpinning(false); }}
                  className={["h-9 rounded-xl px-6 text-sm font-black transition", eventTab === "roulette" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"].join(" ")}>룰렛</button>
                <button type="button" onClick={() => { setEventTab("claw"); setCurrentEvent(null); setSpinning(false); }}
                  className={["h-9 rounded-xl px-6 text-sm font-black transition", eventTab === "claw" ? "bg-violet-600 text-white shadow-sm" : "text-slate-500"].join(" ")}>인형뽑기</button>
              </div>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                <button type="button" onClick={() => changeMode("test")}
                  className={["h-9 rounded-xl px-3 text-xs font-black transition", mode === "test" ? "bg-amber-100 text-amber-700" : "text-slate-500"].join(" ")}>🧪 테스트</button>
                <button type="button" onClick={() => changeMode("live")}
                  className={["h-9 rounded-xl px-3 text-xs font-black transition", mode === "live" ? "bg-emerald-100 text-emerald-700" : "text-slate-500"].join(" ")}>운영</button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={resetEvent}
                  className="h-9 rounded-2xl border border-rose-line bg-rose-soft px-4 text-xs font-black text-rose-deep transition hover:bg-rose-soft/80">↺ 초기화</button>
                <button type="button" onClick={closePanel}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">✕</button>
              </div>
            </header>

            {/* 본문 2단 */}
            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden bg-slate-50 p-4 xl:grid-cols-[minmax(0,1fr)_440px]">

              {/* 좌측: 당첨고정 + 룰렛 + 돌리기 + 위젯주소 + 이벤트목록 */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                {fixedWinnerNickname ? (
                  <div className="rounded-2xl bg-rose-deep px-4 py-2 text-center text-sm font-black text-white">👑 당첨고정: {fixedWinnerNickname}</div>
                ) : null}

                {/* 룰렛 휠 (conic-gradient) + 화살표 + 가운데 당첨자 오버레이 */}
                <div className="relative mx-auto aspect-square w-full max-w-[340px]">
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-3xl leading-none text-red-500 drop-shadow">▼</div>
                  <div className="absolute inset-0 rounded-full shadow-xl ring-8 ring-white" style={{ background: wheelGradient }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-[44%] w-[44%] flex-col items-center justify-center rounded-full bg-white/95 px-2 text-center shadow-inner">
                      {currentEvent?.winner_nickname ? (
                        <>
                          <div className="text-[11px] font-black text-violet-500">🏆 당첨</div>
                          <div className="truncate text-[17px] font-black leading-tight text-slate-950">{currentEvent.winner_nickname}</div>
                        </>
                      ) : (
                        <div className="text-[12px] font-black leading-tight text-slate-500">{finalParticipants.length.toLocaleString("ko-KR")}명<br />{eventTab === "roulette" ? "룰렛" : "인형뽑기"}</div>
                      )}
                    </div>
                  </div>
                </div>

                <button type="button" onClick={startSpin} disabled={spinning || finalParticipants.length === 0}
                  className="h-12 rounded-2xl bg-violet-600 text-base font-black text-white shadow-sm transition hover:bg-violet-700 disabled:bg-slate-300">
                  {spinning ? "진행중..." : eventTab === "roulette" ? "▶ 룰렛 돌리기" : "▶ 인형뽑기 시작"}
                </button>

                {/* 위젯주소 복사 */}
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                  <span className="shrink-0 text-xs font-black text-slate-500">방송 위젯주소</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">{widgetUrl || "준비중"}</span>
                  <button type="button" onClick={() => void copyText(widgetUrl)} disabled={!widgetUrl}
                    className="h-8 shrink-0 rounded-xl bg-violet-600 px-3 text-xs font-black text-white disabled:opacity-50">복사</button>
                </div>

                {/* 이벤트 목록 (기간필터 + 달력) */}
                <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                    <span className="text-sm font-black text-slate-950">이벤트 목록</span>
                    <div className="flex flex-wrap gap-1">
                      {periodChips.map((chip) => (
                        <button key={chip.key} type="button" onClick={() => setListPeriod(chip.key)}
                          className={["rounded-full px-2.5 py-1 text-[11px] font-black transition", listPeriod === chip.key ? "bg-rose-deep text-white" : "bg-slate-100 text-slate-500"].join(" ")}>{chip.label}</button>
                      ))}
                    </div>
                    {listPeriod === "date" ? (
                      <input type="date" value={listDate} onChange={(e) => setListDate(e.target.value)}
                        className="h-8 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-600" />
                    ) : null}
                    <div className="ml-auto flex gap-1.5">
                      <button type="button" onClick={() => void loadEventsAndWinners()}
                        className="h-8 rounded-xl bg-slate-100 px-2.5 text-[11px] font-black text-slate-600 hover:bg-slate-200">새로고침</button>
                      <button type="button" onClick={() => void deleteAllTestRecords()}
                        className="h-8 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-black text-amber-700 hover:bg-amber-100">테스트정리</button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {filteredWinners.length === 0 ? (
                      <div className="flex h-full min-h-[120px] items-center justify-center text-center text-sm font-bold text-slate-400">해당 기간 당첨 기록이 없습니다.</div>
                    ) : (
                      <div className="space-y-2">
                        {filteredWinners.map((winner) => (
                          <div key={`winner-${winner.id}`} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-black text-slate-950">🏆 {winner.nickname}</div>
                                <div className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{dateTimeFull(winner.winner_at)}</div>
                              </div>
                              <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ring-1", winner.is_test ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"].join(" ")}>{winner.is_test ? "테스트" : "운영"}</span>
                            </div>
                            <div className="mt-1.5 truncate rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 shadow-sm">{winner.winner_note || "이벤트 당첨"}</div>
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_70px] gap-2">
                              <button type="button" onClick={() => markRewardDone(winner, !winner.is_reward_done)}
                                className={["rounded-lg px-2 py-1.5 text-[11px] font-black transition", winner.is_reward_done ? "bg-emerald-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"].join(" ")}>{winner.is_reward_done ? "지급완료됨" : "지급완료"}</button>
                              <button type="button" onClick={() => void deleteWinnerRecord(winner)}
                                className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] font-black text-amber-700 hover:bg-amber-50">삭제</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 우측: 참가자 + 당첨고정 + 토글 + 당첨선물 */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                {/* 참가자 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-950">참가자 <span className="text-violet-600">{finalParticipants.length.toLocaleString("ko-KR")}명</span></span>
                    {participantSource !== "manual" ? (
                      <button type="button" onClick={() => setShowParticipantList((v) => !v)}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-100">{showParticipantList ? "목록 숨김" : "목록 보기"}</button>
                    ) : null}
                  </div>
                  <div className="inline-flex w-full rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => changeParticipantSource("auto")} disabled={!liveBroadcastId}
                      title={!liveBroadcastId ? "방송 시작 후 사용" : undefined}
                      className={["h-9 flex-1 rounded-lg text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40", participantSource === "auto" ? "bg-rose-deep text-white shadow-sm" : "text-slate-500"].join(" ")}>주문서 전체</button>
                    <button type="button" onClick={() => changeParticipantSource("paid")} disabled={!liveBroadcastId}
                      title={!liveBroadcastId ? "방송 시작 후 사용" : undefined}
                      className={["h-9 flex-1 rounded-lg text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40", participantSource === "paid" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500"].join(" ")}>입금완료</button>
                    <button type="button" onClick={() => changeParticipantSource("manual")}
                      className={["h-9 flex-1 rounded-lg text-xs font-black transition", participantSource === "manual" ? "bg-violet-600 text-white shadow-sm" : "text-slate-500"].join(" ")}>수동 입력</button>
                  </div>
                  {!liveBroadcastId && participantSource !== "manual" ? (
                    <div className="mt-2 text-[11px] font-black text-amber-600">⚠ 방송 OFF — 방송 시작 후 명단을 불러올 수 있어요.</div>
                  ) : null}

                  {participantSource === "manual" ? (
                    <textarea value={manualParticipantText} onChange={(e) => setManualParticipantText(e.target.value)} onPaste={handleManualPaste}
                      placeholder={"닉네임 한 줄에 한 명.\n채팅 붙여넣으면 @닉네임만 자동 추출(중복 제거)."}
                      className="mt-3 h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400" />
                  ) : showParticipantList ? (
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-slate-100">
                      {participants.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs font-bold text-slate-400">명단 없음 — 위 버튼으로 불러오세요.</div>
                      ) : (
                        participants.slice(0, 300).map((p, i) => (
                          <div key={`${p.nickname}-${i}`} className="flex items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-xs">
                            <span className="w-5 shrink-0 text-slate-400">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate font-black text-slate-800">{p.nickname}</span>
                            <span className="shrink-0 font-bold text-slate-400">{money(p.amount_sum)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">참가자 {autoParticipantCount.toLocaleString("ko-KR")}명 · “목록 보기”로 펼치기</div>
                  )}
                </div>

                {/* 당첨고정 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-950">당첨 고정</span>
                    {fixedWinnerNickname ? (
                      <button type="button" onClick={() => setFixedWinnerNickname("")} className="text-[11px] font-black text-slate-400 hover:text-slate-600">해제</button>
                    ) : null}
                  </div>
                  <div className="flex max-h-[88px] flex-wrap gap-1.5 overflow-y-auto">
                    {finalParticipants.length === 0 ? (
                      <span className="text-[11px] font-bold text-slate-400">참가자를 먼저 불러오세요.</span>
                    ) : (
                      finalParticipants.map((p, i) => {
                        const on = fixedWinnerNickname === p.nickname;
                        return (
                          <button key={`fix-${p.nickname}-${i}`} type="button" onClick={() => setFixedWinnerNickname(on ? "" : p.nickname)}
                            className={["rounded-full px-2.5 py-1 text-[11px] font-black transition", on ? "bg-rose-deep text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"].join(" ")}>{on ? "👑 " : ""}{p.nickname}</button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 추첨 옵션 토글 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 text-sm font-black text-slate-950">추첨 옵션</div>
                  <button type="button" onClick={() => setExcludeDailyDup((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="text-xs font-black text-slate-700">당일 중복당첨 금지</span>
                    <span className={["relative h-5 w-9 rounded-full transition", excludeDailyDup ? "bg-rose-deep" : "bg-slate-300"].join(" ")}>
                      <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", excludeDailyDup ? "right-0.5" : "left-0.5"].join(" ")} />
                    </span>
                  </button>
                  <button type="button" onClick={() => setUseWeight((v) => !v)}
                    className="mt-2 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="text-left text-xs font-black text-slate-700">가중치 적용<br /><span className="text-[10px] font-bold text-slate-400">고정: 누적금액 40% + 당일 60%</span></span>
                    <span className={["relative h-5 w-9 shrink-0 rounded-full transition", useWeight ? "bg-rose-deep" : "bg-slate-300"].join(" ")}>
                      <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", useWeight ? "right-0.5" : "left-0.5"].join(" ")} />
                    </span>
                  </button>
                </div>

                {/* 당첨선물 + 제목 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 text-xs font-black text-slate-500">이벤트 제목</div>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none focus:border-violet-400" />
                  <div className="mb-2 mt-3 text-xs font-black text-slate-500">당첨 선물</div>
                  <div className="flex gap-2">
                    <select value={giftType} onChange={(e) => {
                        const next = e.target.value as "point" | "custom";
                        setGiftType(next);
                        if (next === "point") setWinnerNote(`포인트 ${Number(giftPointAmount || 0).toLocaleString("ko-KR")}P`);
                      }}
                      className="h-10 w-1/2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none focus:border-violet-400">
                      <option value="point">포인트</option>
                      <option value="custom">직접입력</option>
                    </select>
                    {giftType === "point" ? (
                      <input value={giftPointAmount ? Number(giftPointAmount).toLocaleString("ko-KR") : ""} inputMode="numeric" placeholder="포인트 금액"
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "");
                          setGiftPointAmount(digits);
                          setWinnerNote(`포인트 ${Number(digits || 0).toLocaleString("ko-KR")}P`);
                        }}
                        className="h-10 w-1/2 rounded-xl border border-slate-200 px-3 text-right text-sm font-black text-slate-900 outline-none focus:border-violet-400" />
                    ) : (
                      <input value={winnerNote} onChange={(e) => setWinnerNote(e.target.value)} maxLength={40} placeholder="예: 선물이모티콘"
                        className="h-10 w-1/2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none focus:border-violet-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
