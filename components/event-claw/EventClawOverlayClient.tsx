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

type PrizeAsset =
  | {
      type: "capsule";
      id: string;
      closed: string;
      open: string;
    }
  | {
      type: "doll";
      id: string;
      front: string;
      back: string;
    };

const ASSET_BASE = "/event-claw";
const MIN_PLAY_MS = 9600;
const REVEAL_PAUSE_MS = 1000;

const PRIZE_ASSETS: PrizeAsset[] = [
  {
    type: "capsule",
    id: "capsule-pink",
    closed: `${ASSET_BASE}/capsule-pink-closed.svg`,
    open: `${ASSET_BASE}/capsule-pink-open.svg`,
  },
  {
    type: "capsule",
    id: "capsule-blue",
    closed: `${ASSET_BASE}/capsule-blue-closed.svg`,
    open: `${ASSET_BASE}/capsule-blue-open.svg`,
  },
  {
    type: "doll",
    id: "doll-bear",
    front: `${ASSET_BASE}/doll-bear-front.svg`,
    back: `${ASSET_BASE}/doll-bear-back.svg`,
  },
  {
    type: "doll",
    id: "doll-bunny",
    front: `${ASSET_BASE}/doll-bunny-front.svg`,
    back: `${ASSET_BASE}/doll-bunny-back.svg`,
  },
];

function normalizeToken(value: string) {
  return String(value || "").trim();
}

function pickPrizeAsset(winnerNickname: string, resultKey: string) {
  const seed = `${winnerNickname || "ready"}|${resultKey || "idle"}`;
  const value = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return PRIZE_ASSETS[value % PRIZE_ASSETS.length];
}

export default function EventClawOverlayClient({ initialToken }: { initialToken: string }) {
  const [token] = useState(() => normalizeToken(initialToken));
  const [event, setEvent] = useState<OverlayEvent | null>(null);
  const [message, setMessage] = useState("인형뽑기 준비중");
  const [revealedResultKey, setRevealedResultKey] = useState("");
  const [activeResultKey, setActiveResultKey] = useState("");
  const timersRef = useRef<number[]>([]);

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
      setMessage("인형뽑기 위젯주소 token이 없습니다.");
      return;
    }

    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(`/api/event-claw/overlay?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as OverlayPayload | null;

        if (!alive) return;

        if (!response.ok || !payload?.ok || !payload.event) {
          setMessage(payload?.message || "인형뽑기 이벤트를 찾지 못했습니다.");
          return;
        }

        setEvent(payload.event);
        setMessage("");
      } catch (error) {
        if (!alive) return;
        setMessage(error instanceof Error ? error.message : "인형뽑기 정보를 불러오지 못했습니다.");
      }
    };

    void load();
    const timer = window.setInterval(load, 1200);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token]);

  const resultKey =
    event?.status === "result" && event.winner_nickname
      ? `${event.updated_at || ""}|${event.result_at || ""}|${event.winner_nickname}|${event.winner_note || ""}`
      : "";

  const prizeAsset = useMemo(() => pickPrizeAsset(event?.winner_nickname || "", resultKey), [event?.winner_nickname, resultKey]);
  const isPlaying = Boolean(activeResultKey) && revealedResultKey !== activeResultKey;
  const hasResult = Boolean(resultKey) && revealedResultKey === resultKey;
  const participants = event?.participants || [];

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];

    if (!resultKey) {
      setActiveResultKey("");
      if (revealedResultKey) setRevealedResultKey("");
      return;
    }

    if (revealedResultKey === resultKey || activeResultKey === resultKey) {
      return;
    }

    setActiveResultKey(resultKey);

    const revealTimer = window.setTimeout(() => {
      setRevealedResultKey(resultKey);
      setActiveResultKey("");
      timersRef.current = [];
    }, MIN_PLAY_MS + REVEAL_PAUSE_MS);

    timersRef.current = [revealTimer];

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
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
        <section className="relative flex min-h-screen w-full items-center justify-center bg-transparent px-8 text-center">
          <div className="relative flex flex-col items-center">
            <div className="mb-5 rounded-full bg-white/80 px-7 py-3 text-3xl font-black text-pink-700 shadow-[0_12px_38px_rgba(0,0,0,0.2)] backdrop-blur">
              🎉 당첨 공개!
            </div>

            {prizeAsset.type === "capsule" ? (
              <div className="relative flex flex-col items-center">
                <img src={prizeAsset.open} alt="" className="h-[260px] w-[310px] object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.22)]" />
                <div className="mt-[-78px] rounded-[30px] bg-white/95 px-10 py-7 shadow-[0_18px_58px_rgba(0,0,0,0.25)] ring-1 ring-white/80">
                  <div className="text-2xl font-black text-amber-700">캡슐 속 당첨자</div>
                  <div className="mt-4 max-w-[820px] break-keep text-7xl font-black leading-tight text-slate-950">
                    {event?.winner_nickname || ""}
                  </div>
                  <div className="mt-4 max-w-[820px] break-keep text-4xl font-black text-slate-700">
                    {event?.winner_note || "이벤트 당첨"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex flex-col items-center">
                <img src={prizeAsset.back} alt="" className="h-[330px] w-[280px] object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.22)]" />
                <div className="absolute top-[178px] rounded-2xl bg-white/95 px-5 py-3 text-3xl font-black text-slate-950 shadow">
                  {event?.winner_nickname || ""}
                </div>
                <div className="mt-4 rounded-[30px] bg-white/95 px-10 py-6 shadow-[0_18px_58px_rgba(0,0,0,0.25)] ring-1 ring-white/80">
                  <div className="text-4xl font-black text-slate-950">{event?.winner_note || "이벤트 당첨"}</div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="relative flex h-screen w-screen items-center justify-center bg-transparent">
          <div className="relative h-[min(92vh,900px)] w-[min(62vw,560px)] min-w-[420px]">
            <img src={`${ASSET_BASE}/machine.svg`} alt="" className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_26px_70px_rgba(0,0,0,0.28)]" />

            <div className="absolute left-[14%] right-[14%] top-[11%] h-[49%] overflow-hidden rounded-[42px] bg-white/10">
              <div className="absolute inset-0 bg-sky-100/20 backdrop-blur-[1px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-white/10" />

              <img
                src={`${ASSET_BASE}/claw.svg`}
                alt=""
                className={[
                  "absolute left-1/2 top-[-4%] z-30 h-[170px] w-[140px] -translate-x-1/2 object-contain",
                  isPlaying ? "animate-[ruruClawPlay_9.6s_ease-in-out_forwards]" : "animate-[ruruClawIdle_2.2s_ease-in-out_infinite]",
                ].join(" ")}
              />

              <div className="absolute bottom-[6%] left-[10%] right-[10%] flex flex-wrap items-end justify-center gap-2">
                <img src={`${ASSET_BASE}/capsule-pink-closed.svg`} alt="" className="h-14 w-14 object-contain" />
                <img src={`${ASSET_BASE}/doll-bear-front.svg`} alt="" className="h-24 w-20 object-contain" />
                <img src={`${ASSET_BASE}/capsule-blue-closed.svg`} alt="" className="h-14 w-14 object-contain" />
                <img src={`${ASSET_BASE}/doll-bunny-front.svg`} alt="" className="h-24 w-20 object-contain" />
                <img src={`${ASSET_BASE}/capsule-pink-closed.svg`} alt="" className="h-14 w-14 object-contain" />
                <img src={`${ASSET_BASE}/doll-bear-front.svg`} alt="" className="h-24 w-20 object-contain" />
              </div>

              {isPlaying ? (
                <img
                  src={prizeAsset.type === "capsule" ? prizeAsset.closed : prizeAsset.front}
                  alt=""
                  className="absolute left-1/2 top-[47%] z-20 h-[96px] w-[96px] -translate-x-1/2 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.22)] animate-[ruruPrizeCatch_9.6s_ease-in-out_forwards]"
                />
              ) : null}
            </div>

            <div className="absolute left-[20%] right-[20%] top-[64%] rounded-3xl bg-white/82 px-5 py-4 text-center shadow backdrop-blur">
              <div className="text-2xl font-black text-pink-700">🎁 선물이모티콘이벤트</div>
              <div className="mt-1 text-sm font-black text-slate-600">
                {participants.length.toLocaleString("ko-KR")}명 참여
              </div>
            </div>

            {message ? (
              <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-6 py-3 text-lg font-black text-slate-950 shadow backdrop-blur">
                {message}
              </div>
            ) : null}

            {isPlaying ? (
              <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-6 py-3 text-lg font-black text-pink-700 shadow backdrop-blur">
                인형뽑기 진행중...
              </div>
            ) : null}
          </div>

          <style jsx global>{`
            html,
            body {
              margin: 0 !important;
              background: transparent !important;
              overflow: hidden !important;
            }

            @keyframes ruruClawIdle {
              0% {
                transform: translateX(-50%) translateY(0) rotate(-2deg);
              }
              50% {
                transform: translateX(-50%) translateY(16px) rotate(2deg);
              }
              100% {
                transform: translateX(-50%) translateY(0) rotate(-2deg);
              }
            }

            @keyframes ruruClawPlay {
              0% {
                transform: translateX(-50%) translateY(0) rotate(-8deg);
              }
              18% {
                transform: translateX(-72%) translateY(150px) rotate(8deg);
              }
              28% {
                transform: translateX(-72%) translateY(18px) rotate(-6deg);
              }
              44% {
                transform: translateX(-28%) translateY(165px) rotate(-10deg);
              }
              54% {
                transform: translateX(-28%) translateY(20px) rotate(5deg);
              }
              76% {
                transform: translateX(-50%) translateY(170px) rotate(0deg);
              }
              100% {
                transform: translateX(-50%) translateY(42px) rotate(0deg);
              }
            }

            @keyframes ruruPrizeCatch {
              0%,
              62% {
                opacity: 0;
                transform: translateX(-50%) translateY(140px) scale(0.85);
              }
              76% {
                opacity: 1;
                transform: translateX(-50%) translateY(104px) scale(0.9);
              }
              100% {
                opacity: 1;
                transform: translateX(-50%) translateY(-28px) scale(1.05);
              }
            }
          `}</style>
        </section>
      )}
    </main>
  );
}
