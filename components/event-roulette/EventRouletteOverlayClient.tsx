"use client";

import { useEffect, useMemo, useState } from "react";

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

function segmentGradient(participants: OverlayParticipant[]) {
  const list = participants.length > 0 ? participants.slice(0, 24) : [{ nickname: "READY" }];
  const step = 360 / list.length;
  const colors = ["#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#06b6d4", "#6366f1"];

  return `conic-gradient(${list
    .map((_, index) => {
      const from = Math.round(index * step);
      const to = Math.round((index + 1) * step);
      return `${colors[index % colors.length]} ${from}deg ${to}deg`;
    })
    .join(", ")})`;
}

export default function EventRouletteOverlayClient({ initialToken }: { initialToken: string }) {
  const [token] = useState(() => normalizeToken(initialToken));
  const [event, setEvent] = useState<OverlayEvent | null>(null);
  const [message, setMessage] = useState("룰렛 준비중");
  const [loadedAt, setLoadedAt] = useState(0);

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
  const hasResult = event?.status === "result" && Boolean(event.winner_nickname);
  const gradient = useMemo(() => segmentGradient(visibleParticipants), [visibleParticipants]);
  const rotation = loadedAt % 360;

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

          <div className="relative flex aspect-square w-[min(78vw,78vh)] max-w-[760px] items-center justify-center overflow-hidden rounded-full shadow-[0_22px_80px_rgba(0,0,0,0.35)] ring-[10px] ring-white/95">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: gradient,
                transform: event?.status === "spinning" ? undefined : `rotate(${rotation}deg)`,
                animation: event?.status === "spinning" ? "ruruRouletteSpin 4.5s cubic-bezier(.18,.82,.25,1) infinite" : undefined,
              }}
            >
              <div className="absolute inset-[10%] rounded-full border-[3px] border-white/70" />

              {visibleParticipants.map((participant, index) => {
                const total = Math.max(visibleParticipants.length, 1);
                const angle = (360 / total) * index + 360 / total / 2;

                return (
                  <div
                    key={`${participant.nickname}-${index}`}
                    className="absolute inset-0 flex items-start justify-center"
                    style={{ transform: `rotate(${angle}deg)` }}
                  >
                    <div className="mt-[11%] max-w-[19%] truncate rounded-full bg-black/18 px-2 py-1 text-center text-[clamp(8px,1.25vw,14px)] font-black text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.75)]">
                      {participant.nickname || "참여자"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex h-[38%] w-[38%] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_12px_30px_rgba(0,0,0,0.22)] ring-1 ring-white">
                <div className="-translate-y-1 px-3 text-[clamp(18px,3.8vw,42px)] font-black leading-[1.08] text-violet-700">
                  {event?.title || "🎁 루루동이룰렛"}
                </div>
                <div className="mt-2 -translate-y-1 text-[clamp(12px,2vw,22px)] font-black text-slate-500">
                  {participants.length.toLocaleString("ko-KR")}명 참여
                </div>
              </div>
            </div>
          </div>

          {message ? (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-6 py-3 text-xl font-black text-white backdrop-blur">
              {message}
            </div>
          ) : null}

          <style jsx global>{`
            html,
            body {
              margin: 0 !important;
              background: transparent !important;
              overflow: hidden !important;
            }

            @keyframes ruruRouletteSpin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(1080deg);
              }
            }
          `}</style>
        </section>
      )}
    </main>
  );
}
