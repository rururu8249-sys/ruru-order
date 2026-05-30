"use client";

import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useState } from "react";

type RouletteMode = "live" | "test" | "preview";

const FIXED_OVERLAY_TOKEN = "roulette_luludongi_live";

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
  buttonLabel = "🎁 이벤트 룰렛",
  buttonClassName = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl bg-violet-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-violet-700",
}: AdminLiveEventRoulettePanelProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RouletteMode>("test");
  const [sourceDate] = useState(todayText);
  const [broadcasts, setBroadcasts] = useState<RouletteBroadcast[]>([]);
  const [broadcastId, setBroadcastId] = useState("");
  const [title, setTitle] = useState("🎁 루루동이룰렛");
  const [winnerNote, setWinnerNote] = useState("룰렛 당첨");
  const [participants, setParticipants] = useState<RouletteParticipant[]>([]);
  const [currentEvent, setCurrentEvent] = useState<RouletteEvent | null>(null);
  const [events, setEvents] = useState<RouletteEvent[]>([]);
  const [winners, setWinners] = useState<RouletteWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const overlayUrl = useMemo(() => buildOverlayUrl(currentEvent), [currentEvent]);

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

  const deleteWinnerRecord = async (winner: RouletteWinner) => {
    if (!winner?.id) {
      showAdminToast("삭제할 당첨 기록 ID가 없습니다.", "warning");
      return;
    }

    if (!winner.is_test) {
      showAdminToast("운영 당첨 기록은 삭제할 수 없습니다. 테스트 기록만 삭제 가능합니다.", "warning");
      return;
    }

    if (!window.confirm(`테스트 당첨 기록을 삭제할까요?\n\n${winner.nickname}`)) return;

    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_winner",
          winnerId: winner.id,
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "테스트 당첨 기록 삭제 실패");
      }

      showAdminToast("테스트 당첨 기록을 삭제했습니다.", "success");
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast("테스트 당첨 기록 삭제 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 px-4 py-5 backdrop-blur-sm">
          <div className="flex h-[min(94vh,900px)] w-full max-w-[1240px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-2xl">
            <div className="shrink-0 border-b border-slate-200 bg-white/95 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-2xl font-black tracking-tight text-slate-950">🎁 이벤트 룰렛</div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${modeBadgeClass(mode)}`}>
                      {modeLabel(mode)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                      최종 후보 {participants.length.toLocaleString("ko-KR")}명
                    </span>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                      14바퀴 · 10초 감속
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    방송 중 실시간 추첨 · 고정 위젯주소 · 같은 방송 중복당첨 자동 제외
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMode: RouletteMode = "test";
                      setMode(nextMode);
                      void loadParticipants(nextMode, sourceDate, broadcastId);
                    }}
                    className={`rounded-2xl px-4 py-2 text-sm font-black ring-1 transition ${
                      mode === "test"
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    🧪 테스트 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextMode: RouletteMode = "live";
                      setMode(nextMode);
                      void loadParticipants(nextMode, sourceDate, broadcastId);
                    }}
                    className={`rounded-2xl px-4 py-2 text-sm font-black ring-1 transition ${
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
                    className="ml-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-slate-500 hover:bg-slate-50"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_600px]">
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-black ${
                    mode === "live"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {mode === "live"
                    ? "운영 모드입니다. 실제 운영 당첨 기록으로 저장되며, 같은 방송 중복당첨 방지가 적용됩니다."
                    : "현재 테스트 모드입니다. 실제 운영 기록과 분리되며, 테스트 기록은 정리할 수 있습니다."}
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="shrink-0 text-sm font-black text-slate-900">방송용 위젯주소</div>
                  <div className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-100">
                    {overlayUrl || "고정 방송용 위젯주소를 준비중입니다."}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(overlayUrl)}
                    disabled={!overlayUrl}
                    className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    고정주소 복사
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
              <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="grid min-h-0 grid-rows-[auto_1fr] gap-5">
                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div>
                            <div className="text-lg font-black text-slate-950">룰렛 준비</div>
                            <div className="mt-1 text-xs font-bold text-slate-400">
                              방송 선택 → 참여자 불러오기 → 룰렛 만들기 → 룰렛 시작
                            </div>
                          </div>
                          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                            중복당첨 제외 적용
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                          <label className="block">
                            <span className="text-xs font-black text-slate-500">방송리스트</span>
                            <select
                              value={broadcastId}
                              onChange={(event) => {
                                const nextBroadcastId = event.target.value;
                                setBroadcastId(nextBroadcastId);
                                void loadParticipants(mode, sourceDate, nextBroadcastId);
                              }}
                              className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                            >
                              <option value="">방송을 선택하세요</option>
                              {broadcasts.map((broadcast) => (
                                <option key={broadcast.id} value={broadcast.id}>
                                  {broadcast.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="text-xs font-black text-slate-500">룰렛 제목</span>
                            <input
                              value={title}
                              onChange={(event) => setTitle(event.target.value)}
                              maxLength={30}
                              className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                          <label className="block">
                            <span className="text-xs font-black text-slate-500">당첨내용 / 상품명</span>
                            <input
                              value={winnerNote}
                              onChange={(event) => setWinnerNote(event.target.value)}
                              maxLength={40}
                              placeholder="예: 1,000포인트 / 향수 샘플 / 무료배송쿠폰"
                              className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => loadParticipants(mode, sourceDate, broadcastId)}
                            disabled={loading}
                            className="mt-5 h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            👥 참여자 불러오기
                          </button>
                        </div>
                      </div>

                      <div className="flex min-h-[168px] flex-col items-center justify-center rounded-3xl bg-[radial-gradient(circle_at_50%_35%,#ffffff,#f5f3ff_52%,#1e1b4b_100%)] p-4 text-center shadow-inner ring-1 ring-violet-100">
                        <div className="relative mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-white/80 shadow-lg ring-4 ring-violet-200">
                          <div className="absolute h-full w-full rounded-full border-[14px] border-violet-200 border-t-amber-300 border-r-rose-200" />
                          <div className="z-10 h-5 w-5 rounded-full bg-violet-600" />
                        </div>
                        <div className="text-sm font-black text-white drop-shadow">루루동이룰렛</div>
                        <div className="mt-1 text-[11px] font-black text-white/80 drop-shadow">방송 위젯 미리보기</div>
                      </div>
                    </div>
                  </section>

                  <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                      <div>
                        <div className="text-lg font-black text-slate-950">참여자 목록</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">
                          최종 후보 {participants.length.toLocaleString("ko-KR")}명 · 닉네임 기준 그룹
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                        금액·주문수·가중치 표시
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                      {participants.length === 0 ? (
                        <div className="px-4 py-16 text-center text-sm font-bold text-slate-400">
                          참여자가 없습니다. 방송리스트를 선택하고 참여자 불러오기를 눌러주세요.
                        </div>
                      ) : (
                        participants.slice(0, 120).map((item) => (
                          <div key={`${item.nickname}-${item.order_ids?.join("-")}`} className="grid grid-cols-[1fr_120px_90px] gap-3 px-5 py-3 text-sm">
                            <div className="min-w-0">
                              <div className="truncate font-black text-slate-900">{item.nickname}</div>
                              <div className="mt-1 text-xs font-bold text-slate-400">
                                주문 {Number(item.order_count || 0).toLocaleString("ko-KR")}건 · 수량{" "}
                                {Number(item.qty_sum || 0).toLocaleString("ko-KR")}개
                              </div>
                            </div>
                            <div className="text-right font-black text-slate-700">{money(item.amount_sum)}</div>
                            <div className="text-right text-xs font-black text-violet-600">
                              가중치 {Number(item.weight || 1).toFixed(2)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <aside className="grid min-h-0 grid-rows-[auto_1fr_240px] gap-5">
                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-black text-slate-950">현재 룰렛</div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${currentEvent ? modeBadgeClass(currentEvent.mode) : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                        {currentEvent ? currentEvent.status : "대기"}
                      </span>
                    </div>

                    {currentEvent ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-black text-slate-400">상태</div>
                          <div className="mt-2 text-lg font-black text-slate-950">{currentEvent.status}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-black text-slate-400">참여자</div>
                          <div className="mt-2 text-lg font-black text-slate-950">
                            {Number(currentEvent.participant_count || currentEvent.participants?.length || 0).toLocaleString("ko-KR")}명
                          </div>
                        </div>
                        <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-black text-slate-400">현재 당첨자</div>
                          <div className="mt-2 truncate text-xl font-black text-slate-950">{currentEvent.winner_nickname || "-"}</div>
                        </div>
                        <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-black text-slate-400">당첨내용</div>
                          <div className="mt-2 truncate text-sm font-black text-slate-700">{currentEvent.winner_note || winnerNote || "-"}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
                        아직 만든 룰렛이 없습니다.
                      </div>
                    )}
                  </section>

                  <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex shrink-0 items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-black text-slate-950">당첨자 리스트</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">테스트 기록은 정리 가능, 운영 기록은 보존</div>
                      </div>
                      <button
                        type="button"
                        onClick={loadEventsAndWinners}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-200"
                      >
                        새로고침
                      </button>
                    </div>

                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {winners.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
                          당첨 기록이 없습니다.
                        </div>
                      ) : (
                        winners.slice(0, 50).map((winner) => (
                          <div key={winner.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-950">{winner.nickname}</div>
                                <div className="mt-1 text-xs font-bold text-slate-500">{winner.winner_note || "룰렛 당첨"}</div>
                                <div className="mt-1 text-xs font-bold text-slate-400">{dateTime(winner.winner_at)}</div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ring-1 ${winner.is_test ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
                                {winner.is_test ? "테스트" : "운영"}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2">
                              <button
                                type="button"
                                onClick={() => markRewardDone(winner, !winner.is_reward_done)}
                                className={`w-full rounded-xl px-3 py-2 text-xs font-black ${
                                  winner.is_reward_done
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white text-slate-700 ring-1 ring-slate-200"
                                }`}
                              >
                                {winner.is_reward_done ? "지급완료됨" : "지급완료 체크"}
                              </button>
                              {winner.is_test ? (
                                <button
                                  type="button"
                                  onClick={() => void deleteWinnerRecord(winner)}
                                  className="w-full rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
                                >
                                  테스트 기록 삭제
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex shrink-0 items-center justify-between gap-2">
                      <div>
                        <div className="text-base font-black text-slate-950">최근 이벤트</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">이전 이벤트 선택 시 현재 룰렛으로 불러옵니다.</div>
                      </div>
                      <div className="text-xs font-black text-slate-400">최근 {Math.min(events.length, 20)}개</div>
                    </div>

                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {events.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-400">최근 이벤트 없음</div>
                      ) : (
                        events.slice(0, 20).map((event) => (
                          <button
                            key={event.id || `${event.title}-${event.result_at}`}
                            type="button"
                            onClick={() => setCurrentEvent(event)}
                            className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left hover:bg-white"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-black text-slate-900">{event.title}</div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ring-1 ${modeBadgeClass(event.mode)}`}>
                                {modeLabel(event.mode)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {event.status} · {event.winner_nickname || "당첨 전"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white/95 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAllTestRecords()}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-700 hover:bg-amber-100"
                  >
                    테스트기록 정리
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(overlayUrl)}
                    disabled={!overlayUrl}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    위젯주소 복사
                  </button>
                  <button
                    type="button"
                    onClick={createEvent}
                    disabled={loading || participants.length <= 0}
                    className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    룰렛 만들기
                  </button>
                  <button
                    type="button"
                    onClick={spinEvent}
                    disabled={spinning || !currentEvent?.id}
                    className="rounded-2xl bg-slate-950 px-7 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                  >
                    {spinning ? "룰렛 진행중..." : "룰렛 시작"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
