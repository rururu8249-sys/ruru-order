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

type AnimationPhase = "idle" | "missOne" | "missTwo" | "catching" | "opening" | "result";

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

function pickPrizeKind(nickname: string, resultKey: string): PrizeKind {
  const seed = hashText(`${nickname}|${resultKey}`);

  if (seed % 4 === 0) return "bear";
  if (seed % 4 === 1) return "capsulePink";
  if (seed % 4 === 2) return "bunny";
  return "capsuleBlue";
}

function getElapsedPhase(elapsedMs: number, hasResult: boolean): AnimationPhase {
  if (!hasResult) return "idle";
  if (elapsedMs < 1300) return "missOne";
  if (elapsedMs < 2600) return "missTwo";
  if (elapsedMs < 4100) return "catching";
  if (elapsedMs < 5600) return "opening";
  return "result";
}

function prizeLabel(kind: PrizeKind) {
  if (kind === "bear" || kind === "bunny") return "인형 당첨";
  return "캡슐 당첨";
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
    const timer = window.setInterval(() => setNow(Date.now()), 80);
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
  const elapsedMs = hasResult && animationStartedAt ? now - animationStartedAt : 0;
  const phase = getElapsedPhase(elapsedMs, hasResult);
  const winnerNickname = cleanText(event?.winner_nickname) || "";
  const winnerNote = cleanText(event?.winner_note) || "이벤트 당첨";
  const prizeKind = useMemo(() => pickPrizeKind(winnerNickname, resultKey), [winnerNickname, resultKey]);

  const isCapsule = prizeKind === "capsulePink" || prizeKind === "capsuleBlue";
  const isDoll = prizeKind === "bear" || prizeKind === "bunny";

  const closedCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-closed.svg` : `${ASSET_BASE}/capsule-pink-closed.svg`;
  const openCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-open.svg` : `${ASSET_BASE}/capsule-pink-open.svg`;
  const dollFrontAsset =
    prizeKind === "bunny" ? `${ASSET_BASE}/doll-bunny-front.svg` : `${ASSET_BASE}/doll-bear-front.svg`;
  const dollBackAsset =
    prizeKind === "bunny" ? `${ASSET_BASE}/doll-bunny-back.svg` : `${ASSET_BASE}/doll-bear-back.svg`;

  const phaseClass = `phase-${phase}`;
  const showResult = phase === "result";
  const showOpening = phase === "opening" || showResult;

  return (
    <main className={`claw-overlay-root ${phaseClass}`}>
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
        }

        .fallback-note {
          position: absolute;
          left: 50%;
          top: 11%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
          padding: 8px 16px;
          color: rgba(100, 116, 139, 0.78);
          font-size: 13px;
          font-weight: 900;
          letter-spacing: -0.04em;
          opacity: 0;
        }

        .phase-idle .fallback-note {
          opacity: 0.9;
        }

        .claw-arm {
          position: absolute;
          left: 50%;
          top: 18%;
          width: 11%;
          height: auto;
          transform: translate(-50%, 0);
          transform-origin: 50% 0%;
          filter: drop-shadow(0 8px 10px rgba(15, 23, 42, 0.22));
          z-index: 4;
        }

        .phase-idle .claw-arm {
          animation: clawIdle 2.6s ease-in-out infinite;
        }

        .phase-missOne .claw-arm {
          animation: clawMissOne 1.3s ease-in-out both;
        }

        .phase-missTwo .claw-arm {
          animation: clawMissTwo 1.3s ease-in-out both;
        }

        .phase-catching .claw-arm {
          animation: clawCatch 1.5s ease-in-out both;
        }

        .phase-opening .claw-arm,
        .phase-result .claw-arm {
          transform: translate(-50%, 12%);
        }

        .grabbed-prize {
          position: absolute;
          left: 50%;
          top: 47%;
          width: 13%;
          transform: translate(-50%, -50%) scale(0.72);
          opacity: 0;
          z-index: 5;
          filter: drop-shadow(0 12px 12px rgba(15, 23, 42, 0.24));
        }

        .phase-catching .grabbed-prize {
          opacity: 1;
          animation: prizeLift 1.5s ease-in-out both;
        }

        .phase-opening .grabbed-prize,
        .phase-result .grabbed-prize {
          opacity: 1;
          transform: translate(-50%, -126%) scale(0.86);
        }

        .capsule-open {
          position: absolute;
          left: 50%;
          top: 38%;
          width: 25%;
          transform: translate(-50%, -50%) scale(0.7);
          opacity: 0;
          z-index: 8;
          filter: drop-shadow(0 15px 16px rgba(15, 23, 42, 0.2));
        }

        .phase-opening .capsule-open,
        .phase-result .capsule-open {
          opacity: 1;
          animation: popOpen 0.55s ease-out both;
        }

        .paper-result {
          position: absolute;
          left: 50%;
          top: 50%;
          min-width: 340px;
          max-width: 560px;
          transform: translate(-50%, -50%) scale(0.86);
          opacity: 0;
          z-index: 10;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.22);
          padding: 24px 30px;
          text-align: center;
        }

        .phase-result .paper-result {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.45s ease, transform 0.45s ease;
        }

        .result-label {
          color: #8b5cf6;
          font-size: 24px;
          font-weight: 1000;
          letter-spacing: -0.06em;
        }

        .result-name {
          margin-top: 10px;
          color: #0f172a;
          font-size: clamp(40px, 5.2vw, 76px);
          font-weight: 1000;
          line-height: 0.95;
          letter-spacing: -0.08em;
          word-break: keep-all;
        }

        .result-note {
          margin-top: 14px;
          color: #475569;
          font-size: clamp(22px, 2.3vw, 36px);
          font-weight: 950;
          letter-spacing: -0.05em;
        }

        .doll-result {
          position: absolute;
          left: 50%;
          top: 48%;
          width: 30%;
          transform: translate(-50%, -50%) scale(0.66);
          opacity: 0;
          z-index: 9;
          filter: drop-shadow(0 18px 18px rgba(15, 23, 42, 0.2));
        }

        .phase-opening .doll-front {
          opacity: 1;
          animation: dollFront 1.2s ease both;
        }

        .phase-opening .doll-back,
        .phase-result .doll-back {
          opacity: 1;
          animation: dollBack 0.55s ease both;
        }

        .doll-name-tag {
          position: absolute;
          left: 50%;
          top: 55%;
          width: 34%;
          transform: translate(-50%, -50%) scale(0.86);
          opacity: 0;
          z-index: 11;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.2);
          padding: 10px 16px;
          color: #0f172a;
          font-size: clamp(22px, 2.8vw, 42px);
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          letter-spacing: -0.07em;
        }

        .phase-result .doll-name-tag {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.45s ease, transform 0.45s ease;
        }

        .top-title {
          position: absolute;
          left: 50%;
          top: 5%;
          transform: translateX(-50%);
          z-index: 12;
          min-width: 280px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
          padding: 10px 18px;
          text-align: center;
          color: #0f172a;
          font-size: clamp(20px, 2vw, 34px);
          font-weight: 1000;
          letter-spacing: -0.06em;
          opacity: 0.95;
        }

        .phase-result .top-title {
          opacity: 0;
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

        @keyframes clawIdle {
          0%, 100% { transform: translate(-50%, 0) rotate(-2deg); }
          50% { transform: translate(-50%, 4%) rotate(2deg); }
        }

        @keyframes clawMissOne {
          0% { transform: translate(-74%, 0) rotate(-5deg); }
          55% { transform: translate(-74%, 62%) rotate(3deg); }
          100% { transform: translate(-74%, 0) rotate(-5deg); }
        }

        @keyframes clawMissTwo {
          0% { transform: translate(-24%, 0) rotate(4deg); }
          55% { transform: translate(-24%, 58%) rotate(-3deg); }
          100% { transform: translate(-24%, 0) rotate(4deg); }
        }

        @keyframes clawCatch {
          0% { transform: translate(-50%, 0); }
          45% { transform: translate(-50%, 66%); }
          72% { transform: translate(-50%, 66%) scale(1.02); }
          100% { transform: translate(-50%, 12%); }
        }

        @keyframes prizeLift {
          0%, 44% { transform: translate(-50%, 14%) scale(0.7); opacity: 0; }
          45% { transform: translate(-50%, 14%) scale(0.72); opacity: 1; }
          100% { transform: translate(-50%, -126%) scale(0.86); opacity: 1; }
        }

        @keyframes popOpen {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.55) rotate(-8deg); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
        }

        @keyframes dollFront {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.62) rotate(-5deg); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(0.92) rotate(0deg); }
        }

        @keyframes dollBack {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.76) rotateY(90deg); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(0.98) rotateY(0deg); }
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

        <div className="top-title">{event?.title || "🎁 선물이모티콘이벤트"}</div>

        {!event?.winner_nickname ? (
          <div className="fallback-note">
            {message || `${event?.participants?.length || 0}명 대기중`}
          </div>
        ) : null}

        <img src={`${ASSET_BASE}/claw.svg`} className="claw-arm" alt="" draggable={false} />

        {isCapsule ? (
          <>
            <img src={closedCapsuleAsset} className="grabbed-prize" alt="" draggable={false} />
            <img src={openCapsuleAsset} className="capsule-open" alt="" draggable={false} />
            <div className="paper-result">
              <div className="result-label">{prizeLabel(prizeKind)}</div>
              <div className="result-name">{winnerNickname}</div>
              <div className="result-note">{winnerNote}</div>
            </div>
          </>
        ) : null}

        {isDoll ? (
          <>
            <img src={dollFrontAsset} className="grabbed-prize" alt="" draggable={false} />
            <img src={dollFrontAsset} className="doll-result doll-front" alt="" draggable={false} />
            {showOpening ? (
              <img src={dollBackAsset} className="doll-result doll-back" alt="" draggable={false} />
            ) : null}
            {showResult ? <div className="doll-name-tag">{winnerNickname}</div> : null}
          </>
        ) : null}

        {message && !event ? <div className="debug-message">{message}</div> : null}
      </section>
    </main>
  );
}
