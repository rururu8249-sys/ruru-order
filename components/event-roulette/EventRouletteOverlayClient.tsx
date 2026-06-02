"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type RouletteEvent = {
  id?: string;
  title?: string | null;
  overlay_token?: string | null;
  status?: string | null;
  participants?: unknown;
  participant_snapshot?: unknown;
  winner_nickname?: string | null;
  winner_note?: string | null;
  spin_started_at?: string | null;
  result_at?: string | null;
  updated_at?: string | null;
};

type OverlayPayload = {
  ok?: boolean;
  message?: string;
  event?: RouletteEvent | null;
};

type EventRouletteOverlayClientProps = {
  initialToken?: string;
};

const FALLBACK_TOKEN = "roulette_luludongi_live";
const SPIN_TURNS = 30;
const SPIN_MS = 9200;

const COLORS = [
  "#ec4899",
  "#fb7185",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#7c3aed",
];

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getTokenFromLocation(initialToken?: string) {
  const fromProp = cleanText(initialToken);
  if (fromProp) return fromProp;

  if (typeof window === "undefined") return FALLBACK_TOKEN;

  const token = new URLSearchParams(window.location.search).get("token");
  return cleanText(token) || FALLBACK_TOKEN;
}

function getScaleFromLocation() {
  if (typeof window === "undefined") return 0.72;

  const params = new URLSearchParams(window.location.search);
  const raw = params.get("scale") || params.get("size") || "";
  const parsed = Number(raw);

  if (!raw) return 0.72;

  return clampNumber(parsed, 0.5, 1.15);
}

function normalizeParticipants(event: RouletteEvent | null) {
  const source = Array.isArray(event?.participants)
    ? event?.participants
    : Array.isArray(event?.participant_snapshot)
      ? event?.participant_snapshot
      : [];

  return source
    .map((item) => {
      if (typeof item === "string") return cleanText(item);

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return cleanText(record.nickname || record.name || record.youtube_nickname);
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 90);
}

function winnerIndexOf(names: string[], winner: string) {
  const target = cleanText(winner).toLowerCase();
  if (!target) return -1;

  return names.findIndex((name) => cleanText(name).toLowerCase() === target);
}

function makeWheelGradient(count: number) {
  const safeCount = Math.max(count, 1);
  const step = 100 / safeCount;

  return `conic-gradient(from -90deg, ${Array.from({ length: safeCount })
    .map((_, index) => {
      const start = index * step;
      const end = (index + 1) * step;
      const color = COLORS[index % COLORS.length];
      return `${color} ${start}% ${end}%`;
    })
    .join(", ")})`;
}

function getLabelPoint(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const sliceAngle = 360 / safeTotal;
  const angle = -90 + sliceAngle * index + sliceAngle / 2;
  const rad = (angle * Math.PI) / 180;

  // 칸 경계선이 아니라 칸 안쪽 중심선에 닉네임을 놓는다.
  // 참여자가 많을수록 안쪽으로 조금 당긴다.
  const labelRadius =
    safeTotal >= 70 ? 22 :
    safeTotal >= 55 ? 23 :
    safeTotal >= 40 ? 24 :
    safeTotal >= 24 ? 26 :
    29;

  return {
    x: 50 + Math.cos(rad) * labelRadius,
    y: 50 + Math.sin(rad) * labelRadius,
    rotation: angle,
  };
}

export function EventRouletteOverlayClient({ initialToken }: EventRouletteOverlayClientProps) {
  const [event, setEvent] = useState<RouletteEvent | null>(null);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
  const [showResult, setShowResult] = useState(false);
  const [scale, setScale] = useState(0.72);

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const lastAnimatedKeyRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<Animation | null>(null);

  const participants = useMemo(() => normalizeParticipants(event), [event]);
  const winnerNickname = cleanText(event?.winner_nickname);
  const eventIdentity = cleanText(event?.id) || cleanText(event?.overlay_token) || (event ? FALLBACK_TOKEN : "");
  const participantCount = Math.max(participants.length, 1);
  const segmentAngle = 360 / participantCount;
  const wheelGradient = useMemo(() => makeWheelGradient(participantCount), [participantCount]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    setScale(getScaleFromLocation());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const token = getTokenFromLocation(initialToken);
        const response = await fetch(`/api/event-roulette/overlay?token=${encodeURIComponent(token)}&_=${Date.now()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as OverlayPayload;

        if (cancelled) return;

        if (!payload.ok || !payload.event) {
          setEvent(null);
          setMessage(payload.message || "표시할 룰렛 이벤트가 없습니다.");
          setPhase("idle");
          setShowResult(false);
          return;
        }

        setEvent(payload.event);
        setMessage("");
      } catch (error) {
        if (cancelled) return;
        setEvent(null);
        setMessage(error instanceof Error ? error.message : "룰렛 정보를 불러오지 못했습니다.");
      }
    };

    load();
    const interval = window.setInterval(load, 900);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [initialToken]);

  useEffect(() => {
    if (!eventIdentity || !event) {
      animationRef.current?.cancel();
      animationRef.current = null;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setPhase("idle");
      setShowResult(false);
      return;
    }

    const currentEvent = event;

    const spinSignal = cleanText(currentEvent.spin_started_at) || cleanText(currentEvent.result_at) || cleanText(currentEvent.updated_at);
    const key = `${eventIdentity}-${currentEvent.status || ""}-${spinSignal}-${currentEvent.winner_nickname || ""}`;

    if (currentEvent.status === "result" && winnerNickname) {
      if (lastAnimatedKeyRef.current === key) return;

      lastAnimatedKeyRef.current = key;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const wheel = wheelRef.current;
      if (!wheel) return;

      const winnerIndex = winnerIndexOf(participants, winnerNickname);
      const safeWinnerIndex = winnerIndex >= 0 ? winnerIndex : 0;
      const winnerCenterAngle = safeWinnerIndex * segmentAngle + segmentAngle / 2;
      const finalAngle = SPIN_TURNS * 360 + (360 - winnerCenterAngle);

      animationRef.current?.cancel();
      animationRef.current = null;

      wheel.style.transform = "rotate(0deg)";
      wheel.getBoundingClientRect();

      setShowResult(false);
      setPhase("spinning");

      const animation = wheel.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: `rotate(${finalAngle}deg)` },
        ],
        {
          duration: SPIN_MS,
          easing: "cubic-bezier(0.06, 0.8, 0.08, 1)",
          fill: "forwards",
        }
      );

      animationRef.current = animation;

      timerRef.current = setTimeout(() => {
        setPhase("result");
        setShowResult(true);
        timerRef.current = null;
      }, SPIN_MS + 450);

      return;
    }

    if (currentEvent.status !== "result") {
      animationRef.current?.cancel();
      animationRef.current = null;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (wheelRef.current) {
        wheelRef.current.style.transform = "rotate(0deg)";
      }

      setPhase("idle");
      setShowResult(false);
      lastAnimatedKeyRef.current = "";
    }
  }, [
    eventIdentity,
    event?.id,
    event?.status,
    event?.spin_started_at,
    event?.result_at,
    event?.winner_nickname,
    event?.updated_at,
    participants,
    segmentAngle,
    winnerNickname,
  ]);

  const labelFontSize =
    participants.length >= 70
      ? "clamp(5px, 1.04vw, 7.5px)"
      : participants.length >= 55
        ? "clamp(5.5px, 1.18vw, 8px)"
        : participants.length >= 40
          ? "clamp(6.5px, 1.38vw, 9.5px)"
          : participants.length >= 24
            ? "clamp(8px, 1.72vw, 11.5px)"
            : "clamp(10px, 2.1vw, 15px)";

  return (
    <main className="roulette-overlay-root">
      <section className="roulette-stage" style={{ transform: `scale(${scale})` }} aria-label="루루동이 룰렛">
        <div className="pointer-wrap" aria-hidden="true">
          <div className="pointer-shadow" />
          <div className="pointer-outline" />
          <div className="pointer-main" />
          <div className="pointer-dot" />
        </div>

        <div className="wheel-wrap">
          <div
            ref={wheelRef}
            className="wheel"
            style={{
              background: wheelGradient,
            } as CSSProperties}
          >
            <div className="inner-soft-ring" />

            {participants.map((name, index) => {
              const point = getLabelPoint(index, participantCount);

              return (
                <div
                  key={`${name}-${index}`}
                  className="name-label"
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    transform: `translate(-50%, -50%) rotate(${point.rotation}deg)`,
                    fontSize: labelFontSize,
                  }}
                >
                  <span>{name}</span>
                </div>
              );
            })}
          </div>

          <div className="fixed-center-cap" aria-hidden="true">
            <div>루루동이</div>
            <div>이벤트</div>
            <div className="participant-count">현재 {participants.length}명 참여중</div>
          </div>
        </div>

        {phase === "spinning" ? <div className="spin-status">룰렛 돌아가는 중...</div> : null}

        {showResult && winnerNickname ? (
          <div className="result-card">
            <div className="result-eyebrow">당첨</div>
            <div className="result-name">{winnerNickname}</div>
            <div className="result-note">{cleanText(event?.winner_note) || "이벤트 당첨"}</div>
          </div>
        ) : null}

        {!event && message ? <div className="empty-message">{message}</div> : null}
      </section>

      <style jsx>{`
        .roulette-overlay-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family:
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .roulette-stage {
          position: relative;
          width: min(104vw, 900px);
          aspect-ratio: 1 / 1.02;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          overflow: visible;
          transform-origin: center center;
        }

        .pointer-wrap {
          position: absolute;
          left: 50%;
          top: 3.4%;
          z-index: 90;
          width: clamp(86px, 15vw, 150px);
          height: clamp(90px, 15vw, 150px);
          transform: translateX(-50%);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          pointer-events: none;
        }

        .pointer-shadow {
          position: absolute;
          left: 50%;
          top: 14%;
          width: 82%;
          height: 76%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(239, 68, 68, 0.42);
          filter: blur(16px);
        }

        .pointer-outline {
          position: absolute;
          top: 10%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: clamp(36px, 6vw, 62px) solid transparent;
          border-right: clamp(36px, 6vw, 62px) solid transparent;
          border-top: clamp(64px, 10.5vw, 108px) solid #ffffff;
          filter:
            drop-shadow(0 8px 10px rgba(15, 23, 42, 0.25))
            drop-shadow(0 0 16px rgba(253, 224, 71, 0.75));
        }

        .pointer-main {
          position: absolute;
          top: 17%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: clamp(27px, 4.7vw, 47px) solid transparent;
          border-right: clamp(27px, 4.7vw, 47px) solid transparent;
          border-top: clamp(50px, 8.2vw, 86px) solid #ef4444;
          filter:
            drop-shadow(0 7px 10px rgba(127, 29, 29, 0.48))
            drop-shadow(0 0 18px rgba(239, 68, 68, 0.72));
        }

        .pointer-dot {
          position: absolute;
          top: 0;
          left: 50%;
          width: clamp(28px, 4.4vw, 44px);
          height: clamp(28px, 4.4vw, 44px);
          transform: translateX(-50%);
          border-radius: 999px;
          background: #ffffff;
          border: clamp(5px, 0.9vw, 8px) solid #ef4444;
          box-shadow:
            0 0 0 4px #facc15,
            0 8px 20px rgba(127, 29, 29, 0.32);
        }


        .wheel-wrap {
          position: relative;
          width: 91%;
          aspect-ratio: 1 / 1;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.98);
          box-shadow:
            0 30px 80px rgba(15, 23, 42, 0.2),
            inset 0 0 0 clamp(14px, 2vw, 24px) rgba(255, 255, 255, 0.96);
          overflow: visible;
        }

        .wheel {
          position: relative;
          width: 92%;
          aspect-ratio: 1 / 1;
          border-radius: 999px;
          overflow: hidden;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.28),
            inset 0 0 42px rgba(255, 255, 255, 0.16);
          will-change: transform;
          transform-origin: center center;
        }

        .inner-soft-ring {
          position: absolute;
          inset: 16%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          pointer-events: none;
        }

        .fixed-center-cap {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 45;
          width: 24%;
          aspect-ratio: 1 / 1;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(circle at 36% 30%, #ffffff 0%, #f8fafc 52%, #e5e7eb 100%);
          box-shadow:
            0 12px 28px rgba(15, 23, 42, 0.18),
            inset 0 0 0 1px rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #111827;
          font-weight: 950;
          line-height: 1.04;
          letter-spacing: -0.08em;
          font-size: clamp(11px, 2.25vw, 20px);
          text-align: center;
          pointer-events: none;
          gap: 2px;
        }

        .fixed-center-cap div + div {
          margin-top: 3px;
          color: #7c3aed;
        }

        .participant-count {
          margin-top: 4px;
          color: #475569;
          font-size: clamp(6px, 1.2vw, 10px);
          font-weight: 900;
          letter-spacing: -0.06em;
          white-space: nowrap;
        }

        .name-label {
          position: absolute;
          z-index: 12;
          width: clamp(74px, 14vw, 138px);
          height: 18px;
          transform-origin: center center;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(17, 24, 39, 0.98);
          font-weight: 1000;
          line-height: 1;
          letter-spacing: -0.07em;
          text-align: center;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.9),
            0 0 5px rgba(255, 255, 255, 0.7);
          white-space: nowrap;
          pointer-events: none;
        }

        .name-label span {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .spin-status {
          position: absolute;
          left: 50%;
          bottom: 4.8%;
          z-index: 55;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.76);
          color: #ffffff;
          padding: 8px 16px;
          font-size: clamp(13px, 2.4vw, 18px);
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .result-card {
          position: absolute;
          left: 50%;
          top: 55%;
          z-index: 80;
          width: min(76%, 430px);
          transform: translate(-50%, -50%);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          backdrop-filter: blur(6px);
        }

        .result-eyebrow {
          color: #7c3aed;
          font-size: clamp(15px, 3vw, 24px);
          font-weight: 950;
          letter-spacing: -0.05em;
        }

        .result-name {
          margin-top: 6px;
          color: #111827;
          font-size: clamp(34px, 8vw, 72px);
          font-weight: 950;
          line-height: 1.05;
          letter-spacing: -0.08em;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }

        .result-note {
          margin-top: 10px;
          color: #475569;
          font-size: clamp(15px, 3.2vw, 25px);
          font-weight: 900;
          letter-spacing: -0.05em;
        }

        .empty-message {
          position: absolute;
          left: 50%;
          bottom: 8%;
          z-index: 40;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.76);
          color: #ffffff;
          padding: 8px 14px;
          font-size: clamp(12px, 2.4vw, 16px);
          font-weight: 850;
          white-space: nowrap;
        }

        @media (max-width: 520px) {
          .roulette-stage {
            width: 112vw;
          }

          .name-label {
            width: clamp(62px, 15vw, 118px);
          }

          .fixed-center-cap {
            width: 24%;
          }
        }
      `}</style>
    </main>
  );
}

export default EventRouletteOverlayClient;
