"use client";

import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useState } from "react";

type RouletteMode = "live" | "test" | "preview";

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

function buildOverlayUrl(event: RouletteEvent | null) {
  if (typeof window === "undefined") return "";
  if (!event?.overlay_token) return "";

  return `${window.location.origin}/event-roulette/overlay?token=${encodeURIComponent(event.overlay_token)}`;
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
  const [sourceDate, setSourceDate] = useState(todayText);
  const [title, setTitle] = useState("🎁 루루동이룰렛");
  const [winnerNote, setWinnerNote] = useState("룰렛 당첨");
  const [participants, setParticipants] = useState<RouletteParticipant[]>([]);
  const [currentEvent, setCurrentEvent] = useState<RouletteEvent | null>(null);
  const [events, setEvents] = useState<RouletteEvent[]>([]);
  const [winners, setWinners] = useState<RouletteWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const overlayUrl = useMemo(() => buildOverlayUrl(currentEvent), [currentEvent]);

  const loadParticipants = async (nextMode = mode, nextSourceDate = sourceDate) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        action: "participants",
        mode: nextMode,
        sourceDate: nextSourceDate,
      });

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

    void loadParticipants();
    void loadEventsAndWinners();
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
        <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/40">
          <div className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-slate-50 shadow-2xl">
            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-black text-slate-950">🎁 이벤트 룰렛</div>
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    관리자에서 조작하고, 프리즘에는 방송용 위젯주소만 붙여넣습니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                테스트는 실제 운영 기록과 구분됩니다. 포인트 자동지급은 하지 않으며, 지급은 고객상세 포인트 버튼에서 직접 처리합니다.
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-black text-slate-950">룰렛 설정</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">
                        실제 운영 전 테스트 모드로 먼저 확인하세요.
                      </div>
                    </div>

                    <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${modeBadgeClass(mode)}`}>
                      {modeLabel(mode)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-black text-slate-500">모드</span>
                      <select
                        value={mode}
                        onChange={(event) => {
                          const nextMode = event.target.value as RouletteMode;
                          setMode(nextMode);
                          void loadParticipants(nextMode, sourceDate);
                        }}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                      >
                        <option value="test">테스트</option>
                        <option value="live">실제 운영</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-black text-slate-500">주문 기준일</span>
                      <input
                        type="date"
                        value={sourceDate}
                        onChange={(event) => {
                          setSourceDate(event.target.value);
                        }}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-xs font-black text-slate-500">룰렛 제목</span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-xs font-black text-slate-500">당첨내용 / 상품명</span>
                      <input
                        value={winnerNote}
                        onChange={(event) => setWinnerNote(event.target.value)}
                        placeholder="예: 1,000포인트 / 향수 샘플 / 무료배송쿠폰"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => loadParticipants()}
                      disabled={loading}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      참여자 불러오기
                    </button>

                    <button
                      type="button"
                      onClick={createEvent}
                      disabled={loading}
                      className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      룰렛 만들기
                    </button>

                    <button
                      type="button"
                      onClick={spinEvent}
                      disabled={spinning || !currentEvent?.id}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                    >
                      {spinning ? "룰렛 진행중..." : "룰렛 시작"}
                    </button>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-slate-900">방송용 위젯주소</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          프리즘라이브 &gt; Web Browser Widget/Web Source에 붙여넣기
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyText(overlayUrl)}
                        disabled={!overlayUrl}
                        className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        위젯주소 복사
                      </button>
                    </div>

                    <div className="mt-3 break-all rounded-xl bg-white px-3 py-3 text-xs font-bold text-slate-500 ring-1 ring-slate-100">
                      {overlayUrl || "테스트/실제 운영 룰렛을 만든 뒤 위젯주소가 표시됩니다."}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div className="text-sm font-black text-slate-900">
                        참여자 {participants.length.toLocaleString("ko-KR")}명
                      </div>
                      <div className="text-xs font-bold text-slate-400">닉네임 기준 그룹</div>
                    </div>

                    <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                      {participants.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                          참여자가 없습니다. 주문 기준일 또는 모드를 확인하세요.
                        </div>
                      ) : (
                        participants.slice(0, 80).map((item) => (
                          <div key={`${item.nickname}-${item.order_ids?.join("-")}`} className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-3 text-sm">
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
                  </div>
                </section>

                <aside className="space-y-4">
                  <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-base font-black text-slate-950">현재 룰렛</div>

                    {currentEvent ? (
                      <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
                        <div>상태: {currentEvent.status}</div>
                        <div>참여자: {Number(currentEvent.participant_count || currentEvent.participants?.length || 0).toLocaleString("ko-KR")}명</div>
                        <div>당첨자: {currentEvent.winner_nickname || "-"}</div>
                        <div>당첨내용: {currentEvent.winner_note || winnerNote || "-"}</div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-400">
                        아직 만든 룰렛이 없습니다.
                      </div>
                    )}
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-black text-slate-950">당첨자 리스트</div>
                      <button
                        type="button"
                        onClick={loadEventsAndWinners}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-200"
                      >
                        새로고침
                      </button>
                    </div>

                    <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
                      {winners.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-400">
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

                            <button
                              type="button"
                              onClick={() => markRewardDone(winner, !winner.is_reward_done)}
                              className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-black ${
                                winner.is_reward_done
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-700 ring-1 ring-slate-200"
                              }`}
                            >
                              {winner.is_reward_done ? "지급완료됨" : "지급완료 체크"}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-base font-black text-slate-950">최근 이벤트</div>
                    <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
                      {events.length === 0 ? (
                        <div className="text-sm font-bold text-slate-400">최근 이벤트 없음</div>
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
          </div>
        </div>
      ) : null}
    </>
  );
}
