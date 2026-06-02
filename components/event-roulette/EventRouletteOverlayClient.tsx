"use client";

import { useEffect, useMemo, useState } from "react";

type RouletteEvent = {
  title?: string | null;
  status?: string | null;
  is_test?: boolean | null;
  winner_nickname?: string | null;
  winner_note?: string | null;
  updated_at?: string | null;
  result_at?: string | null;
  spin_started_at?: string | null;
  spin_duration_ms?: number | null;
  participant_snapshot?: unknown;
  participants?: unknown;
};

type OverlayPayload = {
  ok: boolean;
  message?: string;
  event?: RouletteEvent;
};

type EventRouletteOverlayClientProps = {
  initialToken: string;
};

const FALLBACK_TOKEN = "roulette_luludongi_live";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function hashText(value: string) {
  return Array.from(value).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function makeResultKey(event: RouletteEvent | null) {
  if (!event || cleanText(event.status) !== "result" || !cleanText(event.winner_nickname)) {
    return "";
  }

  return [
    cleanText(event.updated_at),
    cleanText(event.result_at),
    cleanText(event.winner_nickname),
    cleanText(event.winner_note),
  ].join("|");
}

function normalizeParticipants(event: RouletteEvent | null) {
  const source = Array.isArray(event?.participants)
    ? event?.participants
    : Array.isArray(event?.participant_snapshot)
      ? event?.participant_snapshot
      : [];

  const names = source
    .map((item) => {
      if (typeof item === "string") return cleanText(item);

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return cleanText(record.nickname || record.name || record.youtube_nickname);
      }

      return "";
    })
    .filter(Boolean);

  return names.length > 0
    ? names.slice(0, 12)
    : ["행운", "당첨", "이벤트", "루루동이", "럭키", "기프트", "LIVE", "WIN"];
}

function easeOutCubic(x: number) {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

export default function EventRouletteOverlayClient({ initialToken }: EventRouletteOverlayClientProps) {
  const token = cleanText(initialToken) || FALLBACK_TOKEN;
  const [event, setEvent] = useState<RouletteEvent | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [resultKey, setResultKey] = useState("");
  const [animationStartedAt, setAnimationStartedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOverlay() {
      try {
        const response = await fetch(`/api/event-roulette/overlay?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as OverlayPayload;

        if (cancelled) return;

        if (!payload.ok || !payload.event) {
          setEvent(null);
          setMessage(payload.message || "표시할 룰렛 이벤트가 없습니다.");
          return;
        }

        setEvent(payload.event);
        setMessage("");
      } catch (error) {
        if (cancelled) return;
        setEvent(null);
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadOverlay();
    const timer = window.setInterval(loadOverlay, 900);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const nextKey = makeResultKey(event);
    if (nextKey && nextKey !== resultKey) {
      setResultKey(nextKey);
      setAnimationStartedAt(Date.now());
    }
  }, [event, resultKey]);

  const participants = useMemo(() => normalizeParticipants(event), [event]);
  const winnerNickname = cleanText(event?.winner_nickname);
  const winnerNote = cleanText(event?.winner_note) || "이벤트 당첨";
  const hasResult = cleanText(event?.status) === "result" && Boolean(winnerNickname);
  const seed = hashText(`${winnerNickname}|${resultKey}`);
  const segmentCount = Math.max(8, Math.min(10, participants.length));
  const visibleSegments = participants.slice(0, segmentCount);
  const idleRotation = (now / 45) % 360;

  let wheelRotation = idleRotation;
  if (hasResult && animationStartedAt) {
    const elapsed = now - animationStartedAt;
    const total = 4200;
    const targetIndex = seed % segmentCount;
    const segmentAngle = 360 / segmentCount;
    const finalAngle = 360 * 6 + (360 - targetIndex * segmentAngle - segmentAngle / 2);
    const progress = Math.min(1, elapsed / total);
    wheelRotation = finalAngle * easeOutCubic(progress);
  }

  return (
    <main className="roulette-root">
      <style>{`
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent !important;
        }
        .roulette-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          pointer-events: none;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .roulette-stage {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 760px);
          aspect-ratio: 1 / 1.12;
        }
        .title-pill {
          position: absolute;
          left: 50%;
          top: 2%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 10px 24px rgba(15,23,42,0.12);
          padding: 10px 18px;
          font-size: clamp(16px, 1.8vw, 22px);
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.03em;
          z-index: 20;
        }
        .pointer {
          position: absolute;
          left: 50%;
          top: 18.8%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 20px solid transparent;
          border-right: 20px solid transparent;
          border-top: 34px solid #f43f5e;
          filter: drop-shadow(0 6px 12px rgba(15,23,42,0.18));
          z-index: 25;
        }
        .wheel-shell {
          position: absolute;
          left: 50%;
          top: 54%;
          width: 82%;
          aspect-ratio: 1 / 1;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: linear-gradient(145deg, #ffffff, #f8fafc);
          box-shadow:
            0 22px 50px rgba(15,23,42,0.18),
            inset 0 8px 18px rgba(255,255,255,0.92),
            inset 0 -10px 16px rgba(148,163,184,0.22);
          z-index: 10;
        }
        .wheel-face {
          position: absolute;
          inset: 4.5%;
          border-radius: 999px;
          overflow: hidden;
          background:
            conic-gradient(
              from -90deg,
              #7c3aed 0deg 45deg,
              #ec4899 45deg 90deg,
              #fb7185 90deg 135deg,
              #f59e0b 135deg 180deg,
              #22c55e 180deg 225deg,
              #06b6d4 225deg 270deg,
              #3b82f6 270deg 315deg,
              #8b5cf6 315deg 360deg
            );
        }
        .wheel-gloss {
          position: absolute;
          inset: 8%;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0));
          z-index: 2;
        }
        .center-cap {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 18%;
          aspect-ratio: 1 / 1;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, #ffffff, #f8fafc 55%, #cbd5e1 100%);
          box-shadow: 0 6px 14px rgba(15,23,42,0.15);
          z-index: 4;
        }
        .label {
          position: absolute;
          left: 50%;
          top: 50%;
          transform-origin: center center;
          width: 42%;
          text-align: center;
          font-size: clamp(11px, 1.2vw, 15px);
          font-weight: 900;
          color: rgba(255,255,255,0.96);
          letter-spacing: -0.03em;
          text-shadow: 0 1px 3px rgba(15,23,42,0.20);
          z-index: 3;
        }
        .message-pill {
          position: absolute;
          left: 50%;
          bottom: 8%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.72);
          color: #ffffff;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 800;
          max-width: min(80vw, 420px);
          text-align: center;
        }
        .result-card {
          position: absolute;
          left: 50%;
          bottom: 0;
          transform: translateX(-50%);
          width: min(84%, 360px);
          border-radius: 28px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 18px 44px rgba(15,23,42,0.18);
          padding: 18px 18px 20px;
          text-align: center;
          z-index: 30;
        }
        .result-kicker {
          font-size: 17px;
          font-weight: 900;
          color: #7c3aed;
          letter-spacing: -0.03em;
        }
        .result-name {
          margin-top: 4px;
          font-size: clamp(28px, 3.2vw, 40px);
          font-weight: 900;
          color: #020617;
          line-height: 1.08;
          letter-spacing: -0.05em;
        }
        .result-note {
          margin-top: 6px;
          font-size: clamp(15px, 1.8vw, 22px);
          font-weight: 800;
          color: #475569;
          letter-spacing: -0.03em;
        }
      `}</style>

      <div className="roulette-stage">
        <div className="title-pill">🎯 루루동이 룰렛</div>
        <div className="pointer" />

        <div className="wheel-shell">
          <div
            className="wheel-face"
            style={{
              transform: `rotate(${wheelRotation}deg)`,
            }}
          >
            <div className="wheel-gloss" />
            {visibleSegments.map((label, index) => {
              const angle = (360 / segmentCount) * index;
              return (
                <div
                  key={`${label}-${index}`}
                  className="label"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-118px) rotate(${-angle}deg)`,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <div className="center-cap" />
        </div>

        {winnerNickname ? (
          <div className="result-card">
            <div className="result-kicker">당첨</div>
            <div className="result-name">{winnerNickname}</div>
            <div className="result-note">{winnerNote}</div>
          </div>
        ) : message ? (
          <div className="message-pill">{message}</div>
        ) : null}
      </div>
    </main>
  );
}
