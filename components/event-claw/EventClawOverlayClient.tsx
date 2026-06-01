"use client";

import { useEffect, useMemo, useState } from "react";

type ClawStatus = "idle" | "spinning" | "result" | "closed";

type ClawParticipant = {
  nickname: string;
};

type ClawEvent = {
  title: string;
  mode: "live" | "test" | "preview";
  is_test: boolean;
  status: ClawStatus;
  participants: ClawParticipant[];
  winner_nickname: string;
  winner_note: string;
  spin_started_at: string | null;
  spin_duration_ms: number | null;
  result_at: string | null;
  updated_at: string | null;
};

type OverlayPayload = {
  ok: boolean;
  message?: string;
  event?: ClawEvent;
};

type EventClawOverlayClientProps = {
  initialToken: string;
};

type PrizeKind = "capsulePink" | "capsuleBlue" | "bear" | "bunny";

type MotionPhase = "idle" | "miss" | "catch" | "open" | "final";

type ClawMotion = {
  x: number;
  y: number;
  phase: MotionPhase;
  closed: boolean;
  showGrabbed: boolean;
  showOpen: boolean;
  showFinal: boolean;
};

const FALLBACK_TOKEN = "claw_luludongi_live";
const ASSET_BASE = "/event-claw";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function makeResultKey(event: ClawEvent | null) {
  if (!event || event.status !== "result" || !event.winner_nickname) {
    return "";
  }

  return [
    event.updated_at || "",
    event.result_at || "",
    event.winner_nickname,
    event.winner_note || "",
  ].join("|");
}

function hashText(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function pickPrizeKind(nickname: string, resultKey: string, winnerNote: string): PrizeKind {
  const note = `${winnerNote || ""}`.toLowerCase();
  const seed = hashText(`${nickname}|${resultKey}|${winnerNote}`);

  if (note.includes("캡슐")) {
    return seed % 2 === 0 ? "capsulePink" : "capsuleBlue";
  }

  if (note.includes("인형") || note.includes("곰") || note.includes("토끼")) {
    return seed % 2 === 0 ? "bear" : "bunny";
  }

  // 기본은 인형 비율을 높입니다. 캡슐만 계속 나오는 느낌 방지.
  const pool: PrizeKind[] = ["bear", "bunny", "bear", "bunny", "bear", "bunny", "capsulePink", "capsuleBlue"];
  return pool[seed % pool.length];
}

function prizeLabel(_kind?: PrizeKind) {
  return "당첨";
}

function getMotion(elapsedMs: number, seed: number, hasResult: boolean): ClawMotion {
  if (!hasResult) {
    return {
      x: Math.sin(Date.now() / 680) * 158,
      y: 0,
      phase: "idle",
      closed: false,
      showGrabbed: false,
      showOpen: false,
      showFinal: false,
    };
  }

  const missCount = seed % 2 === 0 ? 1 : 2;
  const missTargets = seed % 3 === 0 ? [-150, 86] : seed % 3 === 1 ? [138, -88] : [-72, 146];
  const catchTargets = [-128, -44, 44, 128];
  const catchX = catchTargets[seed % catchTargets.length];

  const missDuration = 1320;
  const catchDuration = 1650;
  const openDuration = 1350;
  const missTotal = missCount * missDuration;

  function downUp(targetX: number, localMs: number, duration: number, isCatch: boolean) {
    const t = Math.max(0, Math.min(1, localMs / duration));
    let y = 0;
    let closed = false;

    if (t < 0.18) {
      y = 0;
    } else if (t < 0.5) {
      y = ((t - 0.18) / 0.32) * 278;
    } else if (t < 0.68) {
      y = 278;
      closed = true;
    } else {
      y = (1 - (t - 0.68) / 0.32) * 278;
      closed = isCatch;
    }

    return {
      x: targetX,
      y,
      closed,
    };
  }

  if (elapsedMs < missTotal) {
    const missIndex = Math.min(missCount - 1, Math.floor(elapsedMs / missDuration));
    const localMs = elapsedMs - missIndex * missDuration;
    const motion = downUp(missTargets[missIndex] ?? missTargets[0], localMs, missDuration, false);

    return {
      ...motion,
      phase: "miss",
      showGrabbed: false,
      showOpen: false,
      showFinal: false,
    };
  }

  const catchElapsed = elapsedMs - missTotal;

  if (catchElapsed < catchDuration) {
    const motion = downUp(catchX, catchElapsed, catchDuration, true);
    const t = catchElapsed / catchDuration;

    return {
      ...motion,
      phase: "catch",
      closed: t > 0.48,
      showGrabbed: t > 0.52,
      showOpen: false,
      showFinal: false,
    };
  }

  const openElapsed = catchElapsed - catchDuration;

  if (openElapsed < openDuration) {
    return {
      x: catchX,
      y: 0,
      phase: "open",
      closed: true,
      showGrabbed: false,
      showOpen: true,
      showFinal: false,
    };
  }

  return {
    x: catchX,
    y: 0,
    phase: "final",
    closed: true,
    showGrabbed: false,
    showOpen: false,
    showFinal: true,
  };
}

export default function EventClawOverlayClient({ initialToken }: EventClawOverlayClientProps) {
  const token = cleanText(initialToken) || FALLBACK_TOKEN;
  const [event, setEvent] = useState<ClawEvent | null>(null);
  const [message, setMessage] = useState("");
  const [resultKey, setResultKey] = useState("");
  const [animationStartedAt, setAnimationStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [machineSrc, setMachineSrc] = useState(`${ASSET_BASE}/claw-machine-main.png`);

  useEffect(() => {
    let cancelled = false;

    async function loadOverlay() {
      try {
        const response = await fetch(`/api/event-claw/overlay?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as OverlayPayload;

        if (cancelled) return;

        if (!payload.ok || !payload.event) {
          setEvent(null);
          setMessage(payload.message || "표시할 인형뽑기 이벤트가 없습니다.");
          return;
        }

        setEvent(payload.event);
        setMessage("");
      } catch (error) {
        if (cancelled) return;
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
    const nextResultKey = makeResultKey(event);

    if (nextResultKey && nextResultKey !== resultKey) {
      setResultKey(nextResultKey);
      setAnimationStartedAt(Date.now());
    }
  }, [event, resultKey]);

  const hasResult = Boolean(event?.status === "result" && event.winner_nickname);
  const winnerNickname = cleanText(event?.winner_nickname) || "";
  const winnerNote = cleanText(event?.winner_note) || "이벤트 당첨";
  const elapsedMs = hasResult && animationStartedAt ? now - animationStartedAt : 0;
  const seed = hashText(`${winnerNickname}|${resultKey}|${winnerNote}`);
  const motion = getMotion(elapsedMs, seed, hasResult);

  const prizeKind = useMemo(
    () => pickPrizeKind(winnerNickname, resultKey, winnerNote),
    [winnerNickname, resultKey, winnerNote],
  );

  const isCapsule = prizeKind === "capsulePink" || prizeKind === "capsuleBlue";
  const isDoll = !isCapsule;

  const closedCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-closed.svg` : `${ASSET_BASE}/capsule-pink-closed.svg`;
  const openCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-open.svg` : `${ASSET_BASE}/capsule-pink-open.svg`;
  const dollFrontAsset =
    prizeKind === "bunny" ? `${ASSET_BASE}/doll-bunny-front.svg` : `${ASSET_BASE}/doll-bear-front.svg`;
  const dollBackAsset =
    prizeKind === "bunny" ? `${ASSET_BASE}/doll-bunny-back.svg` : `${ASSET_BASE}/doll-bear-back.svg`;

  const grabbedAsset = isCapsule ? closedCapsuleAsset : dollFrontAsset;

  return (
    <main className={`claw-overlay-root phase-${motion.phase}`}>
      <style>{`
        html,
        body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent !important;
        }

        .claw-overlay-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
        }

        .claw-stage {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(76vw, 860px);
          aspect-ratio: 0.72;
          transform: translate(-50%, -50%);
        }

        .machine {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 22px 35px rgba(15, 23, 42, 0.18));
          user-select: none;
          z-index: 1;
        }

        .machine-sign {
          position: absolute;
          left: 50%;
          top: 8.2%;
          transform: translateX(-50%);
          z-index: 8;
          min-width: 330px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 12px 26px rgba(15, 23, 42, 0.16);
          padding: 10px 20px;
          color: #0f172a;
          font-size: clamp(20px, 2.3vw, 32px);
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          letter-spacing: -0.07em;
        }

        .rail {
          position: absolute;
          left: 18%;
          right: 18%;
          top: 23.8%;
          z-index: 5;
          height: 17px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(226, 232, 240, 0.96), rgba(100, 116, 139, 0.92));
          box-shadow:
            inset 0 2px 0 rgba(255, 255, 255, 0.7),
            inset 0 -3px 0 rgba(15, 23, 42, 0.18),
            0 6px 12px rgba(15, 23, 42, 0.18);
        }

        .rail::before,
        .rail::after {
          content: "";
          position: absolute;
          top: 50%;
          width: 10px;
          height: 30px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: rgba(71, 85, 105, 0.9);
        }

        .rail::before {
          left: -8px;
        }

        .rail::after {
          right: -8px;
        }

        .rail-car {
          position: absolute;
          left: 50%;
          top: 21.5%;
          width: 70px;
          height: 34px;
          z-index: 7;
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fafc, #94a3b8);
          box-shadow: 0 8px 14px rgba(15, 23, 42, 0.2);
        }

        .rail-car::before,
        .rail-car::after {
          content: "";
          position: absolute;
          top: 7px;
          width: 13px;
          height: 13px;
          border-radius: 999px;
          background: #334155;
        }

        .rail-car::before {
          left: 12px;
        }

        .rail-car::after {
          right: 12px;
        }

        .claw-rig {
          position: absolute;
          left: 50%;
          top: 25%;
          width: 78px;
          height: 142px;
          z-index: 7;
          filter: drop-shadow(0 7px 8px rgba(15, 23, 42, 0.24));
        }

        .claw-cable {
          position: absolute;
          left: 50%;
          top: 0;
          width: 5px;
          height: 78px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, #64748b 0%, #334155 100%);
        }

        .claw-head {
          position: absolute;
          left: 50%;
          top: 66px;
          width: 58px;
          height: 48px;
          transform: translateX(-50%);
        }

        .claw-head::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          width: 24px;
          height: 18px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #475569;
        }

        .claw-left,
        .claw-right {
          position: absolute;
          top: 14px;
          width: 25px;
          height: 34px;
          border-bottom: 6px solid #334155;
          border-radius: 0 0 999px 999px;
          transition: transform 0.12s ease;
        }

        .claw-left {
          left: 4px;
          border-left: 6px solid #334155;
          transform: rotate(18deg);
        }

        .claw-right {
          right: 4px;
          border-right: 6px solid #334155;
          transform: rotate(-18deg);
        }

        .claw-rig.is-closed .claw-left {
          transform: rotate(4deg);
        }

        .claw-rig.is-closed .claw-right {
          transform: rotate(-4deg);
        }

        .grabbed-prize {
          position: absolute;
          width: 12%;
          transform: translate(-50%, -50%);
          opacity: 0;
          z-index: 6;
          filter: drop-shadow(0 12px 12px rgba(15, 23, 42, 0.24));
        }

        .grabbed-prize.is-visible {
          opacity: 1;
        }

        .capsule-open {
          position: absolute;
          left: 50%;
          top: 43%;
          width: 17%;
          transform: translate(-50%, -50%);
          opacity: 0;
          z-index: 8;
          filter: drop-shadow(0 15px 16px rgba(15, 23, 42, 0.2));
        }

        .capsule-open.is-visible {
          opacity: 1;
          animation: popOpen 0.55s ease-out both;
        }

        .paper-result {
          position: absolute;
          left: 50%;
          top: 49%;
          min-width: 250px;
          max-width: 400px;
          transform: translate(-50%, -50%) scale(0.9);
          opacity: 0;
          z-index: 12;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.22);
          padding: 16px 20px;
          text-align: center;
        }

        .paper-result.is-visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }

        .result-label {
          color: #8b5cf6;
          font-size: 16px;
          font-weight: 1000;
          letter-spacing: -0.06em;
        }

        .result-name {
          margin-top: 8px;
          color: #0f172a;
          font-size: clamp(28px, 4.3vw, 52px);
          font-weight: 1000;
          line-height: 0.98;
          letter-spacing: -0.08em;
          word-break: keep-all;
        }

        .result-note {
          margin-top: 8px;
          color: #475569;
          font-size: clamp(15px, 1.7vw, 24px);
          font-weight: 950;
          letter-spacing: -0.05em;
        }

        .doll-front-result,
        .doll-back-result {
          position: absolute;
          left: 50%;
          top: 49%;
          width: 25%;
          transform: translate(-50%, -50%) scale(0.78);
          opacity: 0;
          z-index: 10;
          filter: drop-shadow(0 18px 18px rgba(15, 23, 42, 0.2));
        }

        .doll-front-result.is-visible,
        .doll-back-result.is-visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }

        .doll-name-tag {
          position: absolute;
          left: 50%;
          top: 58%;
          max-width: 320px;
          transform: translate(-50%, -50%) scale(0.9);
          opacity: 0;
          z-index: 13;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.2);
          padding: 10px 18px;
          color: #0f172a;
          font-size: clamp(22px, 2.8vw, 38px);
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          letter-spacing: -0.07em;
          word-break: keep-all;
        }

        .doll-name-tag.is-visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }

        .debug-message {
          position: absolute;
          left: 50%;
          bottom: 7%;
          transform: translateX(-50%);
          z-index: 30;
          max-width: 680px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
          padding: 8px 16px;
          color: rgba(100, 116, 139, 0.82);
          font-size: 14px;
          font-weight: 900;
          text-align: center;
        }

        @keyframes popOpen {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.55) rotate(-8deg);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
        }
      `}</style>

      <section className="claw-stage">
        <img
          src={machineSrc}
          onError={() => setMachineSrc(`${ASSET_BASE}/machine.svg`)}
          className="machine"
          alt=""
          draggable={false}
        />

        <div className="machine-sign">🎁 루루동이 인형뽑기</div>
        <div className="rail" aria-hidden="true" />

        <div
          className="rail-car"
          aria-hidden="true"
          style={{
            transform: `translate(calc(-50% + ${motion.x}px), 0)`,
          }}
        />

        <div
          className={`claw-rig ${motion.closed ? "is-closed" : ""}`}
          aria-hidden="true"
          style={{
            transform: `translate(calc(-50% + ${motion.x}px), ${motion.y}px)`,
          }}
        >
          <div className="claw-cable" />
          <div className="claw-head">
            <span className="claw-left" />
            <span className="claw-right" />
          </div>
        </div>

        <img
          src={grabbedAsset}
          className={`grabbed-prize ${motion.showGrabbed ? "is-visible" : ""}`}
          alt=""
          draggable={false}
          style={{
            left: `calc(50% + ${motion.x}px)`,
            top: `calc(33% + ${motion.y + 96}px)`,
          }}
        />

        {isCapsule ? (
          <>
            <img
              src={openCapsuleAsset}
              className={`capsule-open ${motion.showOpen ? "is-visible" : ""}`}
              alt=""
              draggable={false}
            />
            <div className={`paper-result ${motion.showFinal ? "is-visible" : ""}`}>
              <div className="result-label">{prizeLabel(prizeKind)}</div>
              <div className="result-name">{winnerNickname}</div>
              <div className="result-note">{winnerNote}</div>
            </div>
          </>
        ) : null}

        {isDoll ? (
          <>
            <img
              src={dollFrontAsset}
              className={`doll-front-result ${motion.showOpen ? "is-visible" : ""}`}
              alt=""
              draggable={false}
            />
            <img
              src={dollBackAsset}
              className={`doll-back-result ${motion.showFinal ? "is-visible" : ""}`}
              alt=""
              draggable={false}
            />
            <div className={`doll-name-tag ${motion.showFinal ? "is-visible" : ""}`}>
              {winnerNickname}
            </div>
          </>
        ) : null}

        {message && !event ? <div className="debug-message">{message}</div> : null}
      </section>
    </main>
  );
}
