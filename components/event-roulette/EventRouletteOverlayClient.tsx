"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type OverlayParticipant = {
  nickname: string;
};

type OverlayEvent = {
  title: string;
  mode: "live" | "test" | "preview";
  is_test: boolean;
  status: "idle" | "spinning" | "result" | "closed";
  participants: OverlayParticipant[];
  winner_nickname: string;
  winner_note: string;
  spin_started_at: string | null;
  spin_duration_ms: number;
  result_at: string | null;
  updated_at: string | null;
};

type OverlayPayload = {
  ok: boolean;
  message?: string;
  event?: OverlayEvent;
};

function normalizeToken(value: string) {
  return String(value || "").trim();
}

const ROULETTE_COLORS = ["#fbcfe8", "#ddd6fe", "#bfdbfe", "#a7f3d0", "#fde68a", "#fed7aa", "#c7d2fe", "#bae6fd", "#bbf7d0", "#f5d0fe"];
const MIN_SPIN_DISPLAY_MS = 10000;
const RESULT_REVEAL_PAUSE_MS = 1200;
const WINNER_STOP_SPINS = 14;

function normalizeRouletteName(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeRotation(value: number) {
  const result = value % 360;

  return result < 0 ? result + 360 : result;
}

function getWinnerStopRotation(params: {
  currentRotation: number;
  participants: OverlayParticipant[];
  winnerNickname: string;
}) {
  const list = params.participants.length > 0 ? params.participants.slice(0, 48) : [{ nickname: "READY" }];
  const total = Math.max(list.length, 1);
  const step = 360 / total;
  const winnerName = normalizeRouletteName(params.winnerNickname);
  const winnerIndex = list.findIndex((participant) => normalizeRouletteName(participant.nickname) === winnerName);
  const safeIndex = winnerIndex >= 0 ? winnerIndex : 0;
  const winnerCenterAngle = safeIndex * step + step / 2;
  const targetModulo = normalizeRotation(360 - winnerCenterAngle);
  const currentModulo = normalizeRotation(params.currentRotation);
  const forwardDelta = normalizeRotation(targetModulo - currentModulo);

  return params.currentRotation + WINNER_STOP_SPINS * 360 + forwardDelta;
}

function segmentGradient(participants: OverlayParticipant[]) {
  const list = participants.length > 0 ? participants.slice(0, 48) : [{ nickname: "READY" }];
  const step = 360 / list.length;

  return `conic-gradient(${list
    .map((_, index) => {
      const from = Math.round(index * step);
      const to = Math.round((index + 1) * step);
      return `${ROULETTE_COLORS[index % ROULETTE_COLORS.length]} ${from}deg ${to}deg`;
    })
    .join(", ")})`;
}

function splitRouletteTitle(value: string) {
  const raw = String(value || "🎁 루루동이룰렛").trim();
  const hasGift = raw.includes("🎁");
  const clean = raw.replace(/🎁/g, "").trim();

  if (clean === "루루동이룰렛") {
    return {
      gift: hasGift ? "🎁" : "",
      lines: ["루루동이", "룰렛 이벤트"],
    };
  }

  return {
    gift: hasGift ? "🎁" : "",
    lines: [clean || "루루동이룰렛"],
  };
}

export default function EventRouletteOverlayClient({ initialToken }: { initialToken: string }) {
  const [token] = useState(() => normalizeToken(initialToken));
  const [event, setEvent] = useState<OverlayEvent | null>(null);
  const [message, setMessage] = useState("룰렛 준비중");
  const [loadedAt, setLoadedAt] = useState(0);
  const [revealedResultKey, setRevealedResultKey] = useState("");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [isWheelDecelerating, setIsWheelDecelerating] = useState(false);
  const activeSpinResultKeyRef = useRef("");
  const visibleParticipantsRef = useRef<OverlayParticipant[]>([]);
  const winnerNicknameRef = useRef("");
  const spinTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.style.background = "transparent";
    body.style.background = "transparent";
    body.style.margin = "0";
    body.style.overflow = "hidden";

    return () => {
      html.style.background = "";
      body.style.background = "";
      body.style.margin = "";
      body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setMessage("위젯주소 token이 없습니다.");
      return;
    }

    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(`/api/event-roulette/overlay?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as OverlayPayload | null;

        if (!alive) return;

        if (!response.ok || !payload?.ok || !payload.event) {
          setMessage(payload?.message || "룰렛 이벤트를 찾지 못했습니다.");
          return;
        }

        setEvent(payload.event);
        setMessage("");
        setLoadedAt(Date.now());
      } catch (error) {
        if (!alive) return;
        setMessage(error instanceof Error ? error.message : "룰렛 정보를 불러오지 못했습니다.");
      }
    };

    void load();
    const timer = window.setInterval(load, 1200);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token]);

  const participants = event?.participants || [];
  const visibleParticipants = useMemo(() => participants.slice(0, 48), [participants]);
  const titleParts = useMemo(() => splitRouletteTitle(event?.title || "🎁 루루동이룰렛"), [event?.title]);
  const gradient = useMemo(() => segmentGradient(visibleParticipants), [visibleParticipants]);
  const resultKey =
    event?.status === "result" && event.winner_nickname
      ? `${event.updated_at || ""}|${event.result_at || ""}|${event.winner_nickname}|${event.winner_note || ""}`
      : "";
  const isPendingResult = Boolean(resultKey) && revealedResultKey !== resultKey;
  const isWaitingForResult = event?.status === "spinning" && !resultKey;
  const isRouletteSpinning = isWaitingForResult || isPendingResult;
  const hasResult = event?.status === "result" && Boolean(event.winner_nickname) && revealedResultKey === resultKey;
  const idleRotation = loadedAt % 360;
  const displayRotation = isWaitingForResult || isPendingResult || hasResult ? wheelRotation : idleRotation;
  const statusMessage = isRouletteSpinning ? "🔥 룰렛 추첨 중..." : message;

  useEffect(() => {
    visibleParticipantsRef.current = visibleParticipants;
    winnerNicknameRef.current = event?.winner_nickname || "";
  }, [visibleParticipants, event?.winner_nickname]);

  useEffect(() => {
    spinTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    spinTimersRef.current = [];

    if (!resultKey) {
      activeSpinResultKeyRef.current = "";

      if (revealedResultKey) {
        setRevealedResultKey("");
      }

      setIsWheelDecelerating(false);
      return;
    }

    if (revealedResultKey === resultKey || activeSpinResultKeyRef.current === resultKey) {
      return;
    }

    activeSpinResultKeyRef.current = resultKey;
    setIsWheelDecelerating(false);

    const startTimer = window.setTimeout(() => {
      setIsWheelDecelerating(true);
      setWheelRotation((currentRotation) =>
        getWinnerStopRotation({
          currentRotation,
          participants: visibleParticipantsRef.current,
          winnerNickname: winnerNicknameRef.current,
        }),
      );
    }, 50);

    const revealTimer = window.setTimeout(() => {
      setRevealedResultKey(resultKey);
      setIsWheelDecelerating(false);
      activeSpinResultKeyRef.current = "";
      spinTimersRef.current = [];
    }, MIN_SPIN_DISPLAY_MS + RESULT_REVEAL_PAUSE_MS);

    spinTimersRef.current = [startTimer, revealTimer];

    return () => {
      spinTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      spinTimersRef.current = [];
    };
  }, [resultKey]);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent p-6 text-center text-4xl font-black text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)]">
        위젯주소를 다시 확인해주세요.
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-transparent">
      {hasResult ? (
        <section className="flex min-h-screen w-full items-center justify-center bg-transparent px-8 text-center">
          <div className="rounded-[42px] bg-white/92 px-10 py-9 shadow-[0_24px_80px_rgba(0,0,0,0.32)] ring-1 ring-white/70 backdrop-blur-md">
            <div className="text-3xl font-black text-violet-700">🎉 당첨자</div>
            <div className="mt-5 max-w-[860px] break-keep text-7xl font-black leading-tight text-slate-950">
              {event?.winner_nickname || ""}
            </div>
            <div className="mt-5 max-w-[860px] break-keep text-4xl font-black text-slate-700">
              {event?.winner_note || "룰렛 당첨"}
            </div>
          </div>
        </section>
      ) : (
        <section className="relative flex h-screen w-screen items-center justify-center bg-transparent">
          <div className="absolute left-1/2 top-[9%] z-20 h-0 w-0 -translate-x-1/2 border-x-[22px] border-t-[42px] border-x-transparent border-t-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />

          <div className="relative flex aspect-square w-[min(74vw,74vh)] max-w-[720px] items-center justify-center overflow-hidden rounded-full bg-slate-900/10 shadow-[0_22px_80px_rgba(0,0,0,0.28)] ring-[9px] ring-slate-500/70">
            <div className="absolute left-1/2 top-0 z-30 h-0 w-0 -translate-x-1/2 -translate-y-[2px] border-x-[20px] border-t-[38px] border-x-transparent border-t-rose-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />

            <div
              className="absolute inset-[3%] rounded-full"
              style={{
                background: gradient,
                transform: `rotate(${displayRotation}deg)`,
                transition: isWheelDecelerating
                  ? `transform ${MIN_SPIN_DISPLAY_MS}ms cubic-bezier(.06,.82,.12,1)`
                  : undefined,
                willChange: isRouletteSpinning ? "transform" : undefined,
                animation: isWaitingForResult ? "ruruRouletteFastSpin 0.42s linear infinite" : undefined,
              }}
            >
              <div className="absolute inset-0 rounded-full ring-1 ring-slate-500/15" />
              <div className="absolute inset-[16%] rounded-full border-[2px] border-slate-500/25" />

              {visibleParticipants.map((participant, index) => {
                const total = Math.max(visibleParticipants.length, 1);
                const angle = (360 / total) * index + 360 / total / 2;

                return (
                  <div
                    key={`${participant.nickname}-${index}`}
                    className="absolute inset-0 flex items-start justify-center"
                    style={{ transform: `rotate(${angle}deg)` }}
                  >
                    <div
                      className="mt-[9%] flex h-[34%] min-w-[22px] max-w-[30px] items-center justify-start overflow-hidden rounded-full bg-white/35 px-1 py-2 text-center text-[clamp(9px,1.5vw,15px)] font-black leading-none text-slate-800 drop-shadow-[0_2px_5px_rgba(255,255,255,0.45)]"
                      style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                    >
                      {participant.nickname || "참여자"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex h-[34%] w-[34%] flex-col items-center justify-center rounded-full bg-white/92 text-center shadow-[0_16px_36px_rgba(15,23,42,0.22)] ring-[4px] ring-white/95 backdrop-blur">
                {titleParts.gift ? (
                  <div className="mb-1 text-[clamp(20px,3.3vw,38px)] leading-none">{titleParts.gift}</div>
                ) : null}
                <div className="flex flex-col items-center justify-center px-3 text-[clamp(18px,3.1vw,34px)] font-black leading-[1.14] text-slate-950">
                  {titleParts.lines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
                <div className="mt-2 text-[clamp(12px,1.9vw,20px)] font-black text-slate-500">
                  {participants.length.toLocaleString("ko-KR")}명 참여
                </div>
              </div>
            </div>
          </div>

          {statusMessage ? (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/75 px-6 py-3 text-xl font-black text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur">
              {statusMessage}
            </div>
          ) : null}

          <style jsx global>{`
            html,
            body {
              margin: 0 !important;
              background: transparent !important;
              overflow: hidden !important;
            }

            @keyframes ruruRouletteFastSpin {
              from {
                transform: rotate(0deg) translateZ(0);
              }
              to {
                transform: rotate(360deg) translateZ(0);
              }
            }
          `}</style>
        </section>
      )}
    </main>
  );
}
