"use client";

import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useState } from "react";

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

  return `${window.location.origin}/event-roulette/overlay?token=${encodeURIComponent(FIXED_OVERLAY_TOKEN)}`;
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
}: AdminLiveEventRoulettePanelProps) {
  const [open, setOpen] = useState(false);
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
  const [participantSource, setParticipantSource] = useState<"auto" | "manual">("auto");
  const [manualParticipantText, setManualParticipantText] = useState("");
  const [fixedWinnerNickname, setFixedWinnerNickname] = useState("");
  const [clawResultType, setClawResultType] = useState<"capsule" | "doll">("capsule");


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

  const finalParticipants = participantSource === "auto" ? participants : manualParticipants;
  const selectedWinnerNickname =
    fixedWinnerNickname.trim() ||
    finalParticipants[0]?.nickname ||
    currentEvent?.winner_nickname ||
    "";

  const recentEvents = events.slice(0, 3);
  const recentWinners = winners.slice(0, 100);
  const autoParticipantCount = participants.length;
  const manualParticipantCount = manualParticipants.length;

  const openEventPanel = () => {
    setOpen(true);
  };

  const changeMode = (nextMode: RouletteMode) => {
    setMode(nextMode);
    void loadParticipants(nextMode, sourceDate, broadcastId);
  };

  const changeBroadcast = (nextBroadcastId: string) => {
    setBroadcastId(nextBroadcastId);
    void loadParticipants(mode, sourceDate, nextBroadcastId);
  };

  const changeParticipantSource = (source: "auto" | "manual") => {
    setParticipantSource(source);

    if (source === "auto" && participants.length === 0) {
      void loadParticipants(mode, sourceDate, broadcastId);
    }
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
    showAdminToast("인형뽑기 연출 미리보기는 다음 단계에서 방송용 위젯에 연결합니다.", "info");
  };

  const startClawEvent = async () => {
    if (finalParticipants.length === 0) {
      showAdminToast("참가자 명단이 없습니다. 자동 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }

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

  const loadParticipants = async (nextMode = mode, nextSourceDate = sourceDate, nextBroadcastId = broadcastId) => {
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

      const payload = await requestJson<ParticipantsPayload>(`/api/admin-live/event-roulette?${params.toString()}`);

      if (!payload.ok) {
        throw new Error(payload.message || "참여자 조회 실패");
      }

      setParticipants(payload.participants || []);
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

    setSpinning(true);

    try {
      const payload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId: currentEvent.id,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
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
      ? `운영 룰렛 이벤트를 삭제합니다.\n\n이벤트: ${event.title || sourceLabel}\n당첨자: ${event.winner_nickname || "-"}\n\n이 룰렛 이벤트와 연결 당첨자 기록이 최근 이벤트/당첨자 리스트에서 모두 삭제됩니다.\n이미 지급/고객 안내한 내용은 별도로 확인해야 합니다.\n\n정말 삭제할까요?`
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


  return (
    <>
      <button type="button" onClick={openEventPanel} className={buttonClassName}>
        {buttonLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm"
          data-ruru-event-ui-shell="event-panel-final-winner-list-expanded-v1"
        >
          <section className="flex h-[min(940px,calc(100vh-24px))] w-[min(1560px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-2xl">🎁</div>
                    <div className="min-w-0">
                      <div className="text-[30px] font-black leading-none tracking-tight text-slate-950">이벤트</div>
                      <div className="mt-2 text-sm font-bold text-slate-500">
                        룰렛과 인형뽑기를 같은 방식으로 관리합니다.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 inline-flex rounded-2xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setEventTab("roulette")}
                      className={[
                        "h-10 rounded-xl px-9 text-sm font-black transition active:scale-[0.98]",
                        eventTab === "roulette" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800",
                      ].join(" ")}
                    >
                      룰렛
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventTab("claw")}
                      className={[
                        "h-10 rounded-xl px-9 text-sm font-black transition active:scale-[0.98]",
                        eventTab === "claw" ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800",
                      ].join(" ")}
                    >
                      인형뽑기
                    </button>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeMode("test")}
                    className={`h-10 rounded-xl px-5 text-sm font-black ring-1 transition active:scale-[0.98] ${
                      mode === "test"
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    🧪 테스트 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMode("live")}
                    className={`h-10 rounded-xl px-5 text-sm font-black ring-1 transition active:scale-[0.98] ${
                      mode === "live"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    ● 운영 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-black text-slate-500 transition hover:bg-slate-50 active:scale-95"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <div
                  className={`flex min-h-[48px] items-center rounded-2xl border px-4 py-2.5 text-sm font-black ${
                    mode === "live"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {mode === "live"
                    ? "현재 운영 모드입니다. 실제 운영 기록으로 저장됩니다."
                    : "⚠ 현재 테스트 모드입니다. 실제 운영 기록과 구분됩니다."}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                    <div className="shrink-0 text-xs font-black text-slate-950">룰렛 위젯</div>
                    <div className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-100">
                      {overlayUrl || "룰렛 위젯주소 준비중"}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(overlayUrl)}
                      disabled={!overlayUrl}
                      className="h-9 shrink-0 rounded-xl bg-violet-600 px-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      복사
                    </button>
                  </div>

                  <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-pink-200 bg-pink-50 px-3">
                    <div className="shrink-0 text-xs font-black text-pink-900">인형뽑기 위젯</div>
                    <div className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-pink-100">
                      {clawOverlayUrl || "인형뽑기 위젯주소 준비중"}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(clawOverlayUrl)}
                      disabled={!clawOverlayUrl}
                      className="h-9 shrink-0 rounded-xl bg-pink-600 px-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      복사
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-50 px-5 py-4">
              <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                <main className="flex min-h-0 flex-col gap-4 overflow-hidden">
                  <section className="shrink-0 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xl font-black text-slate-950">1. 참가자 설정</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {eventTab === "roulette"
                            ? "룰렛도 인형뽑기와 같은 방식으로 명단을 확인하고 진행합니다."
                            : "자동 명단 또는 수동 입력 명단으로 진행합니다."}
                        </div>
                      </div>

                      <div className="inline-flex shrink-0 rounded-2xl bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => changeParticipantSource("auto")}
                          className={[
                            "h-10 rounded-xl px-4 text-xs font-black transition",
                            participantSource === "auto" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500",
                          ].join(" ")}
                        >
                          자동 명단으로 시작
                        </button>
                        <button
                          type="button"
                          onClick={() => changeParticipantSource("manual")}
                          className={[
                            "h-10 rounded-xl px-4 text-xs font-black transition",
                            participantSource === "manual" ? "bg-violet-600 text-white shadow-sm" : "text-slate-500",
                          ].join(" ")}
                        >
                          수동 입력으로 시작
                        </button>
                      </div>
                    </div>

                    <div className="grid min-h-[335px] gap-4 xl:grid-cols-[300px_minmax(420px,1fr)_300px]">
                      <div className="flex h-full flex-col justify-between gap-3">
                        <label className="block">
                          <span className="text-xs font-black text-slate-500">방송리스트</span>
                          <select
                            value={broadcastId}
                            onChange={(event) => changeBroadcast(event.target.value)}
                            className="mt-1 h-[44px] w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="">방송을 선택하세요</option>
                            {broadcasts.map((broadcast) => (
                              <option key={broadcast.id} value={broadcast.id}>
                                {broadcast.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() => void loadParticipants(mode, sourceDate, broadcastId)}
                          disabled={loading}
                          className="h-[44px] w-full rounded-2xl bg-blue-600 px-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
                        >
                          {loading ? "불러오는중..." : "주문서 명단 불러오기"}
                        </button>

                        <label className="block">
                          <span className="text-xs font-black text-slate-500">{eventTab === "roulette" ? "룰렛 제목" : "이벤트 제목"}</span>
                          <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            maxLength={30}
                            className="mt-1 h-[44px] w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs font-black text-slate-500">당첨내용 / 상품명</span>
                          <input
                            value={winnerNote}
                            onChange={(event) => setWinnerNote(event.target.value)}
                            maxLength={40}
                            placeholder="예: 이벤트 당첨"
                            className="mt-1 h-[44px] w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border-2 border-violet-100 bg-white">
                        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_112px] items-end gap-3 border-b border-slate-100 px-4 py-3">
                          <div className="min-w-0">
                            <div className="whitespace-nowrap text-base font-black text-slate-950">주문서 작성자 명단 자동</div>
                            <div className="mt-1 text-xs font-bold text-slate-400">
                              총 {autoParticipantCount.toLocaleString("ko-KR")}명 · 닉네임 기준 중복 제거
                            </div>
                          </div>
                          <div className="text-right text-xs font-black text-slate-400">주문 / 금액</div>
                        </div>

                        <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                          {participants.length === 0 ? (
                            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm font-bold leading-6 text-slate-400">
                              자동 명단이 없습니다.<br />방송리스트 선택 후 명단을 불러오세요.
                            </div>
                          ) : (
                            participants.slice(0, 220).map((item, index) => (
                              <div
                                key={`${item.nickname}-${item.order_ids?.join("-") || index}`}
                                className="grid grid-cols-[34px_minmax(0,1fr)_118px] items-center gap-3 px-4 py-2.5 text-sm"
                              >
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-xs font-black text-violet-700">
                                  {index + 1}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black text-slate-950">{item.nickname}</div>
                                  <div className="mt-0.5 text-[11px] font-bold text-slate-400">
                                    수량 {Number(item.qty_sum || 0).toLocaleString("ko-KR")}개 · 가중치 {Number(item.weight || 1).toLocaleString("ko-KR")}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-black text-slate-600">
                                    {Number(item.order_count || 0).toLocaleString("ko-KR")}건
                                  </div>
                                  <div className="mt-0.5 text-xs font-black text-slate-950">
                                    {money(item.amount_sum)}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="flex h-full flex-col gap-3">
                        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-base font-black text-slate-950">수동 참가자 추가</div>
                            <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                              {manualParticipantCount.toLocaleString("ko-KR")}명
                            </span>
                          </div>
                          <textarea
                            value={manualParticipantText}
                            onChange={(event) => setManualParticipantText(event.target.value)}
                            placeholder={"닉네임을 한 줄에 한 명씩 입력하세요.\n예: 눈누난나\n뽀글이\n오랑이"}
                            className="min-h-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400"
                          />
                          <button
                            type="button"
                            onClick={addManualSample}
                            className="mt-2 h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700"
                          >
                            + 샘플/참가자 추가
                          </button>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                          <div className="text-base font-black text-slate-950">당첨자 미리 지정</div>
                          <select
                            value={fixedWinnerNickname}
                            onChange={(event) => setFixedWinnerNickname(event.target.value)}
                            className="mt-2 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 outline-none focus:border-violet-400"
                          >
                            <option value="">자동 선택</option>
                            {finalParticipants.map((participant, index) => (
                              <option key={`${participant.nickname}-${index}`} value={participant.nickname}>
                                {participant.nickname}
                              </option>
                            ))}
                          </select>
                          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-black leading-5 text-amber-700">
                            지정한 닉네임이 있으면 해당 참가자를 우선 당첨자로 사용합니다.
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="min-h-0 flex-1 overflow-hidden rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xl font-black text-slate-950">
                          2. {eventTab === "roulette" ? "룰렛 연출" : "인형뽑기 연출"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {eventTab === "roulette"
                            ? "기존 룰렛 기능은 유지하고 같은 구성으로 관리합니다."
                            : "1~2회 실패 후 정식 집기 성공, 마지막에 앞모습 후 뒷모습으로 당첨자를 공개합니다."}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-500">
                        <span className="rounded-full bg-violet-50 px-3 py-2 text-violet-700">
                          {eventTab === "roulette" ? "명단 확인" : "1~2회 실패"}
                        </span>
                        <span>→</span>
                        <span className="rounded-full bg-slate-100 px-3 py-2">
                          {eventTab === "roulette" ? "룰렛 만들기" : "정식 집기 성공"}
                        </span>
                        <span>→</span>
                        <span className="rounded-full bg-pink-50 px-3 py-2 text-pink-700">당첨 공개</span>
                      </div>
                    </div>

                    {eventTab === "roulette" ? (
                      <div className="grid h-[calc(100%-48px)] min-h-[320px] gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="relative overflow-hidden rounded-3xl border border-violet-100 bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#f4efff_45%,#2d1f66_100%)] p-6">
                          <div className="absolute left-4 top-4 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-black text-white">
                            룰렛 위젯 미리보기
                          </div>

                          <div className="flex h-full items-center justify-center">
                            <div className="relative flex h-[230px] w-[230px] items-center justify-center rounded-full bg-white/90 shadow-2xl ring-8 ring-violet-100">
                              <div className="absolute inset-4 rounded-full border-[34px] border-violet-300 border-r-rose-300 border-t-amber-300 border-b-blue-300" />
                              <div className="absolute left-1/2 top-2 h-8 w-4 -translate-x-1/2 rounded-b-full bg-red-500 shadow" />
                              <div className="z-10 flex h-20 w-20 items-center justify-center rounded-full bg-violet-600 text-sm font-black text-white shadow-lg">
                                START
                              </div>
                            </div>
                          </div>

                          <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white/80 px-4 py-3 text-center text-sm font-black text-slate-800 shadow-sm">
                            {title || "🎁 선물이모티콘이벤트"}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-violet-100 bg-white p-4 shadow-sm">
                          <div className="rounded-2xl bg-violet-600 px-4 py-3 text-center text-sm font-black text-white">
                            당첨 공개!
                          </div>

                          <div className="mt-4 rounded-3xl border border-dashed border-violet-200 bg-violet-50 p-4 text-center">
                            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
                              🏆
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-4 text-base font-black text-slate-950 shadow-sm">
                              {selectedWinnerNickname || currentEvent?.winner_nickname || "당첨자"}
                            </div>
                            <p className="mt-3 text-xs font-bold text-slate-500">
                              룰렛 결과 닉네임 공개
                            </p>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-2">
                            <button
                              type="button"
                              onClick={createEvent}
                              disabled={loading || finalParticipants.length === 0}
                              className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              룰렛 만들기
                            </button>
                            <button
                              type="button"
                              onClick={spinEvent}
                              disabled={spinning || !currentEvent?.id}
                              className="h-11 rounded-2xl bg-violet-600 text-sm font-black text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.98] disabled:bg-slate-300"
                            >
                              {spinning ? "룰렛 진행중..." : "룰렛 시작"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid h-[calc(100%-48px)] min-h-[320px] gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
                        <div className="grid h-full gap-3 md:grid-cols-3">
                          {[1, 2, 3].map((step) => (
                            <div key={step} className="relative overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-b from-pink-50 to-white p-3">
                              <div className="absolute left-3 top-3 z-10 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-black text-white">
                                {step < 3 ? `${step}회차 실패` : "정식 집기 성공"}
                              </div>

                              <div className="mx-auto mt-8 flex h-[260px] max-w-[230px] flex-col overflow-hidden rounded-t-[34px] border-[7px] border-pink-400 bg-white/70 shadow-inner">
                                <div className="h-8 shrink-0 rounded-t-[24px] bg-pink-500" />
                                <div className="relative min-h-0 flex-1 overflow-hidden bg-white/45 backdrop-blur-[1px]">
                                  <div className="absolute inset-0 bg-sky-100/35" />
                                  <div
                                    className={[
                                      "absolute left-1/2 h-20 w-1 -translate-x-1/2 bg-slate-400",
                                      step === 1 ? "top-5" : step === 2 ? "top-10" : "top-12",
                                    ].join(" ")}
                                  />
                                  <div
                                    className={[
                                      "absolute left-1/2 h-8 w-12 -translate-x-1/2 rounded-b-full border-4 border-slate-500 border-t-0",
                                      step === 1 ? "top-20 rotate-12" : step === 2 ? "top-28 -rotate-6" : "top-32",
                                    ].join(" ")}
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 flex h-16 items-end justify-center gap-1 px-2">
                                    {["bg-pink-400", "bg-emerald-400", "bg-blue-400", "bg-violet-400", "bg-amber-300", "bg-rose-400"].map((color, index) => (
                                      <span key={index} className={["h-7 w-7 rounded-full shadow-sm", color].join(" ")} />
                                    ))}
                                  </div>
                                  <div className="absolute bottom-9 left-1/2 flex -translate-x-1/2 items-end gap-1">
                                    <span className="h-10 w-8 rounded-t-full bg-orange-300" />
                                    <span className="h-11 w-9 rounded-t-full bg-red-400" />
                                    <span className="h-10 w-8 rounded-t-full bg-green-300" />
                                  </div>
                                  {step === 3 ? (
                                    <div className="absolute left-1/2 top-[130px] -translate-x-1/2 rounded-full bg-orange-300 px-3 py-2 text-xs font-black text-slate-900 shadow">
                                      인형
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex h-12 shrink-0 items-center justify-center gap-5 bg-pink-500">
                                  <span className="h-5 w-5 rounded-full bg-pink-200" />
                                  <span className="h-5 w-5 rounded-full bg-yellow-300" />
                                  <span className="h-5 w-5 rounded-full bg-rose-300" />
                                </div>
                              </div>
                              <div className="mt-2 text-center text-xs font-black text-slate-500">
                                {step < 3 ? "집기 실패" : "인형 집기 성공"}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-3xl border border-pink-100 bg-white p-4 shadow-sm">
                          <div className="rounded-2xl bg-pink-500 px-4 py-3 text-center text-sm font-black text-white">
                            당첨 공개!
                          </div>

                          <div className="mt-4 rounded-3xl border border-dashed border-amber-200 bg-amber-50 p-4 text-center">
                            <div className="mx-auto mb-3 flex h-20 w-16 items-center justify-center rounded-t-full bg-orange-300 text-xs font-black text-slate-900 shadow">
                              앞모습
                            </div>
                            <div className="text-xs font-black text-slate-400">앞모습 공개 후</div>
                            <div className="mx-auto mt-3 flex h-24 w-20 items-center justify-center rounded-t-full bg-orange-400 px-2 text-center text-xs font-black text-slate-900 shadow">
                              뒷모습<br />{selectedWinnerNickname || currentEvent?.winner_nickname || "당첨자"}
                            </div>
                            <p className="mt-3 text-xs font-bold text-slate-500">인형 등 뒤 닉네임 공개</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </main>

                <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
                  <section className="shrink-0 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-xl font-black text-slate-950">
                        현재 {eventTab === "roulette" ? "룰렛" : "인형뽑기"}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${currentEvent ? modeBadgeClass(currentEvent.mode) : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                        {currentEvent?.status || "idle"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-black text-slate-400">참여자 수</div>
                        <div className="mt-1 text-xl font-black text-slate-950">{finalParticipants.length.toLocaleString("ko-KR")}명</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-black text-slate-400">자동 참가자</div>
                        <div className="mt-1 text-xl font-black text-slate-950">{autoParticipantCount.toLocaleString("ko-KR")}명</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-black text-slate-400">수동 참가자</div>
                        <div className="mt-1 text-xl font-black text-slate-950">{manualParticipantCount.toLocaleString("ko-KR")}명</div>
                      </div>
                      <div className="col-span-3 rounded-2xl bg-violet-50 p-3">
                        <div className="text-xs font-black text-violet-500">현재 당첨자</div>
                        <div className="mt-1 truncate text-lg font-black text-violet-900">🏆 {currentEvent?.winner_nickname || selectedWinnerNickname || "당첨 전"}</div>
                      </div>
                    </div>

                    {currentEvent ? (
                      <button
                        type="button"
                        onClick={() => void deleteRouletteEvent(currentEvent, `현재 ${eventTab === "roulette" ? "룰렛" : "인형뽑기"}`)}
                        className="mt-3 h-10 w-full rounded-2xl border border-amber-200 bg-amber-50 text-xs font-black text-amber-700 transition hover:bg-amber-100 active:scale-[0.98]"
                      >
                        현재 이벤트 기록 삭제
                      </button>
                    ) : null}
                  </section>

                  <section className="flex min-h-0 flex-[1.55] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <div className="min-w-0">
                        <div className="text-xl font-black text-slate-950">당첨자 리스트</div>
                        <div className="mt-1 truncate text-xs font-bold text-slate-400">지급완료와 기록 삭제를 관리합니다.</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadEventsAndWinners()}
                          className="h-9 rounded-2xl bg-slate-100 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-200 active:scale-95"
                        >
                          새로고침
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAllTestRecords()}
                          className="h-9 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700 transition hover:bg-amber-100 active:scale-[0.98]"
                        >
                          테스트기록 정리
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                      {recentWinners.length === 0 ? (
                        <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-sm font-bold text-slate-400">
                          아직 당첨 기록이 없습니다.
                        </div>
                      ) : (
                        recentWinners.map((winner, index) => (
                          <div key={winner.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-700">
                                {index + 1}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-base font-black text-slate-950">🏆 {winner.nickname}</div>
                                <div className="mt-1 truncate text-xs font-bold text-slate-500">{dateTime(winner.winner_at)}</div>
                              </div>
                              <span className={`h-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${winner.is_test ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
                                {winner.is_test ? "테스트" : "운영"}
                              </span>
                            </div>

                            <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm">
                              {winner.winner_note || "이벤트 당첨"}
                            </div>

                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                              <button
                                type="button"
                                onClick={() => markRewardDone(winner, !winner.is_reward_done)}
                                className={`rounded-xl px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                                  winner.is_reward_done
                                    ? "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
                                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 active:bg-slate-100"
                                }`}
                              >
                                {winner.is_reward_done ? "지급완료됨" : "지급완료 체크"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteWinnerRecord(winner)}
                                className={`rounded-xl border bg-white px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                                  winner.is_test
                                    ? "border-red-100 text-red-600 hover:bg-red-50 active:bg-red-100"
                                    : "border-amber-200 text-amber-700 hover:bg-amber-50 active:bg-amber-100"
                                }`}
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="flex min-h-[150px] max-h-[190px] shrink-0 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
                      <div>
                        <div className="text-lg font-black text-slate-950">최근 이벤트 기록</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">최근 {Math.min(events.length, 3)}개</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadEventsAndWinners()}
                        className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 transition hover:bg-slate-50"
                      >
                        더보기 &gt;
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
                      {recentEvents.length === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-sm font-bold text-slate-400">
                          최근 이벤트 없음
                        </div>
                      ) : (
                        recentEvents.map((event, eventIndex) => (
                          <div key={event.id || `${event.title}-${event.status}-${event.winner_nickname || "none"}-${eventIndex}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <button
                              type="button"
                              onClick={() => setCurrentEvent(event)}
                              className="w-full text-left transition active:scale-[0.99]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate text-sm font-black text-slate-900">🎁 {event.title}</div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${modeBadgeClass(event.mode)}`}>
                                  {modeLabel(event.mode)}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs font-bold text-slate-500">
                                {event.status} · {event.winner_nickname || "당첨 전"}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteRouletteEvent(event, "최근 이벤트")}
                              className="mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-700 transition hover:bg-amber-100 active:scale-[0.98]"
                            >
                              이 이벤트 기록 삭제
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-9 text-sm font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  닫기
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={previewClawAnimation}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-10 text-sm font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                  >
                    ▶ 연출 미리보기
                  </button>
                  {eventTab === "roulette" ? (
                    <button
                      type="button"
                      onClick={currentEvent?.id ? spinEvent : createEvent}
                      disabled={spinning || loading || finalParticipants.length === 0}
                      className="h-12 rounded-2xl bg-violet-600 px-12 text-sm font-black text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.98] disabled:bg-slate-300"
                    >
                      {currentEvent?.id ? (spinning ? "룰렛 진행중..." : "▶ 룰렛 시작") : "룰렛 만들기"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startClawEvent}
                      disabled={spinning || finalParticipants.length === 0}
                      className="h-12 rounded-2xl bg-violet-600 px-12 text-sm font-black text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.98] disabled:bg-slate-300"
                    >
                      {spinning ? "인형뽑기 진행중..." : "▶ 인형뽑기 시작"}
                    </button>
                  )}
                </div>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
