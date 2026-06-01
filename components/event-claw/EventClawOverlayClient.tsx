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

type PrizeKind =
  | "characterRed"
  | "characterYellow"
  | "characterOrange"
  | "characterGreen"
  | "capsulePink"
  | "capsuleBlue";

type CharacterKind = Exclude<PrizeKind, "capsulePink" | "capsuleBlue">;

type MotionPhase = "idle" | "move" | "drop" | "grip" | "lift" | "showFront" | "showBack";

type ClawMotion = {
  x: number;
  cable: number;
  closed: boolean;
  phase: MotionPhase;
  showGrabbed: boolean;
  showFront: boolean;
  showBack: boolean;
  showCapsuleOpen: boolean;
};

const FALLBACK_TOKEN = "claw_luludongi_live";
const ASSET_BASE = "/event-claw";

const CHARACTER_CLASS: Record<CharacterKind, string> = {
  characterRed: "character-red",
  characterYellow: "character-yellow",
  characterOrange: "character-orange",
  characterGreen: "character-green",
};

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

function easeInOut(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * easeInOut(ratio);
}

function pickPrizeKind(nickname: string, resultKey: string, winnerNote: string): PrizeKind {
  const note = `${winnerNote || ""}`.toLowerCase();
  const seed = hashText(`${nickname}|${resultKey}|${winnerNote}`);

  if (note.includes("캡슐")) {
    return seed % 2 === 0 ? "capsulePink" : "capsuleBlue";
  }

  const characters: CharacterKind[] = ["characterRed", "characterYellow", "characterOrange", "characterGreen"];
  return characters[seed % characters.length];
}

function prizeLabel(_kind?: PrizeKind) {
  return "당첨";
}

function getMotion(elapsedMs: number, seed: number, hasResult: boolean, now: number): ClawMotion {
  const baseCable = 70;
  const bottomCable = 300;

  if (!hasResult) {
    return {
      x: Math.sin(now / 900) * 132,
      cable: baseCable,
      closed: false,
      phase: "idle",
      showGrabbed: false,
      showFront: false,
      showBack: false,
      showCapsuleOpen: false,
    };
  }

  const missCount = seed % 2 === 0 ? 1 : 2;
  const missTargets = seed % 3 === 0 ? [-130, 96] : seed % 3 === 1 ? [126, -84] : [-62, 138];
  const catchTargets = [-118, -38, 42, 118];
  const catchX = catchTargets[seed % catchTargets.length];

  const targets = [...missTargets.slice(0, missCount), catchX];
  const moveMs = 950;
  const dropMs = 1450;
  const gripMs = 520;
  const liftMs = 1450;
  const pauseMs = 350;
  const showFrontMs = 1350;
  const singleAttemptMs = moveMs + dropMs + gripMs + liftMs + pauseMs;

  let cursor = 0;
  let previousX = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const targetX = targets[index] ?? catchX;
    const isFinalAttempt = index === targets.length - 1;

    if (elapsedMs < cursor + moveMs) {
      const local = (elapsedMs - cursor) / moveMs;

      return {
        x: lerp(previousX, targetX, local),
        cable: baseCable,
        closed: false,
        phase: "move",
        showGrabbed: false,
        showFront: false,
        showBack: false,
        showCapsuleOpen: false,
      };
    }

    cursor += moveMs;

    if (elapsedMs < cursor + dropMs) {
      const local = (elapsedMs - cursor) / dropMs;

      return {
        x: targetX,
        cable: lerp(baseCable, bottomCable, local),
        closed: false,
        phase: "drop",
        showGrabbed: false,
        showFront: false,
        showBack: false,
        showCapsuleOpen: false,
      };
    }

    cursor += dropMs;

    if (elapsedMs < cursor + gripMs) {
      return {
        x: targetX,
        cable: bottomCable,
        closed: true,
        phase: "grip",
        showGrabbed: false,
        showFront: false,
        showBack: false,
        showCapsuleOpen: false,
      };
    }

    cursor += gripMs;

    if (elapsedMs < cursor + liftMs) {
      const local = (elapsedMs - cursor) / liftMs;

      return {
        x: targetX,
        cable: lerp(bottomCable, baseCable, local),
        closed: isFinalAttempt,
        phase: "lift",
        showGrabbed: isFinalAttempt,
        showFront: false,
        showBack: false,
        showCapsuleOpen: false,
      };
    }

    cursor += liftMs;

    if (elapsedMs < cursor + pauseMs) {
      return {
        x: targetX,
        cable: baseCable,
        closed: false,
        phase: isFinalAttempt ? "lift" : "move",
        showGrabbed: isFinalAttempt,
        showFront: false,
        showBack: false,
        showCapsuleOpen: false,
      };
    }

    cursor += pauseMs;
    previousX = targetX;
  }

  const afterCatch = elapsedMs - cursor;

  if (afterCatch < showFrontMs) {
    return {
      x: catchX,
      cable: baseCable,
      closed: true,
      phase: "showFront",
      showGrabbed: false,
      showFront: true,
      showBack: false,
      showCapsuleOpen: true,
    };
  }

  return {
    x: catchX,
    cable: baseCable,
    closed: true,
    phase: "showBack",
    showGrabbed: false,
    showFront: false,
    showBack: true,
    showCapsuleOpen: false,
  };
}

function CharacterPrize({
  kind,
  side,
  name,
  className = "",
}: {
  kind: CharacterKind;
  side: "front" | "back";
  name?: string;
  className?: string;
}) {
  return (
    <div className={`character-prize ${CHARACTER_CLASS[kind]} ${side === "back" ? "is-back" : "is-front"} ${className}`}>
      <div className="character-head">
        <span className="character-hair" />
        {side === "front" ? (
          <>
            <span className="character-eye character-eye-left" />
            <span className="character-eye character-eye-right" />
            <span className="character-mouth" />
          </>
        ) : null}
      </div>
      <div className="character-body">
        {side === "back" ? <div className="character-name-patch">{name || "-"}</div> : null}
      </div>
      <span className="character-arm character-arm-left" />
      <span className="character-arm character-arm-right" />
      <span className="character-leg character-leg-left" />
      <span className="character-leg character-leg-right" />
    </div>
  );
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
          setMessage(payload.message || "표시할 이벤트가 없습니다.");
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
  const motion = getMotion(elapsedMs, seed, hasResult, now);

  const prizeKind = useMemo(
    () => pickPrizeKind(winnerNickname, resultKey, winnerNote),
    [winnerNickname, resultKey, winnerNote],
  );

  const isCapsule = prizeKind === "capsulePink" || prizeKind === "capsuleBlue";
  const isCharacter = !isCapsule;
  const characterKind: CharacterKind = isCharacter ? (prizeKind as CharacterKind) : "characterRed";

  const closedCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-closed.svg` : `${ASSET_BASE}/capsule-pink-closed.svg`;
  const openCapsuleAsset =
    prizeKind === "capsuleBlue" ? `${ASSET_BASE}/capsule-blue-open.svg` : `${ASSET_BASE}/capsule-pink-open.svg`;

  const grabbedLeft = `calc(50% + ${motion.x}px)`;
  const grabbedTop = `calc(33.2% + ${motion.cable + 50}px)`;

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

        .glass-brightener {
          position: absolute;
          left: 17.6%;
          top: 29.5%;
          width: 64.8%;
          height: 39.5%;
          z-index: 2;
          border-radius: 10px 10px 18px 18px;
          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.58) 0%,
              rgba(255, 255, 255, 0.42) 34%,
              rgba(255, 255, 255, 0.26) 67%,
              rgba(255, 255, 255, 0.14) 100%
            );
          mix-blend-mode: screen;
        }

        .machine-sign {
          position: absolute;
          left: 50%;
          top: 24.7%;
          transform: translateX(-50%);
          z-index: 8;
          min-width: 250px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
          padding: 6px 15px;
          color: #0f172a;
          font-size: clamp(16px, 1.9vw, 25px);
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          letter-spacing: -0.07em;
        }

        .rail {
          position: absolute;
          left: 24%;
          right: 24%;
          top: 33.5%;
          z-index: 5;
          height: 13px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(226, 232, 240, 0.98), rgba(100, 116, 139, 0.98));
          box-shadow:
            inset 0 2px 0 rgba(255, 255, 255, 0.72),
            inset 0 -3px 0 rgba(15, 23, 42, 0.2),
            0 5px 10px rgba(15, 23, 42, 0.17);
        }

        .rail-car {
          position: absolute;
          left: 50%;
          top: 31.9%;
          width: 58px;
          height: 27px;
          z-index: 7;
          border-radius: 13px;
          background: linear-gradient(180deg, #f8fafc, #94a3b8);
          box-shadow: 0 7px 12px rgba(15, 23, 42, 0.2);
        }

        .rail-car::before,
        .rail-car::after {
          content: "";
          position: absolute;
          top: 7px;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #334155;
        }

        .rail-car::before {
          left: 13px;
        }

        .rail-car::after {
          right: 13px;
        }

        .claw-rig {
          position: absolute;
          left: 50%;
          top: 33.2%;
          width: 72px;
          height: 410px;
          z-index: 7;
          filter: drop-shadow(0 7px 8px rgba(15, 23, 42, 0.24));
        }

        .claw-cable {
          position: absolute;
          left: 50%;
          top: 0;
          width: 5px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, #64748b 0%, #334155 100%);
        }

        .claw-head {
          position: absolute;
          left: 50%;
          width: 58px;
          height: 52px;
          transform: translateX(-50%);
        }

        .claw-head::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          width: 25px;
          height: 19px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #475569;
        }

        .claw-left,
        .claw-right {
          position: absolute;
          top: 14px;
          width: 25px;
          height: 35px;
          border-bottom: 6px solid #334155;
          border-radius: 0 0 999px 999px;
          transition: transform 0.18s ease;
        }

        .claw-left {
          left: 4px;
          border-left: 6px solid #334155;
          transform: rotate(25deg);
        }

        .claw-right {
          right: 4px;
          border-right: 6px solid #334155;
          transform: rotate(-25deg);
        }

        .claw-rig.is-closed .claw-left {
          transform: rotate(3deg);
        }

        .claw-rig.is-closed .claw-right {
          transform: rotate(-3deg);
        }

        .grabbed-prize {
          position: absolute;
          width: 92px;
          min-height: 92px;
          transform: translate(-50%, -50%) scale(0.86);
          opacity: 0;
          z-index: 6;
          filter: drop-shadow(0 12px 12px rgba(15, 23, 42, 0.24));
        }

        .grabbed-prize.is-visible {
          opacity: 1;
        }

        .grabbed-prize img {
          width: 100%;
          height: auto;
          display: block;
        }

        .character-prize {
          position: relative;
          width: 138px;
          height: 178px;
          transform-origin: center;
        }

        .grabbed-prize .character-prize {
          width: 92px;
          height: 120px;
        }

        .character-head {
          position: absolute;
          left: 50%;
          top: 0;
          width: 86px;
          height: 76px;
          transform: translateX(-50%);
          border-radius: 48% 48% 44% 44%;
          background: #ffd6a5;
          box-shadow: inset 0 -8px 0 rgba(15, 23, 42, 0.07);
        }

        .grabbed-prize .character-head {
          width: 58px;
          height: 52px;
        }

        .character-hair {
          position: absolute;
          left: 7px;
          top: -4px;
          width: 72px;
          height: 24px;
          border-radius: 999px 999px 30px 30px;
          background: var(--hair);
        }

        .grabbed-prize .character-hair {
          left: 5px;
          width: 48px;
          height: 17px;
        }

        .character-eye {
          position: absolute;
          top: 31px;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #111827;
        }

        .character-eye-left {
          left: 25px;
        }

        .character-eye-right {
          right: 25px;
        }

        .character-mouth {
          position: absolute;
          left: 50%;
          bottom: 15px;
          width: 22px;
          height: 12px;
          transform: translateX(-50%);
          border-radius: 0 0 999px 999px;
          background: #7f1d1d;
        }

        .character-body {
          position: absolute;
          left: 50%;
          top: 68px;
          width: 98px;
          height: 78px;
          transform: translateX(-50%);
          border-radius: 42px 42px 28px 28px;
          background: var(--body);
          box-shadow: inset 0 -10px 0 rgba(15, 23, 42, 0.08);
        }

        .grabbed-prize .character-body {
          top: 46px;
          width: 66px;
          height: 52px;
        }

        .character-arm {
          position: absolute;
          top: 80px;
          width: 24px;
          height: 42px;
          border-radius: 999px;
          background: var(--body);
        }

        .character-arm-left {
          left: 11px;
          transform: rotate(18deg);
        }

        .character-arm-right {
          right: 11px;
          transform: rotate(-18deg);
        }

        .character-leg {
          position: absolute;
          bottom: 0;
          width: 25px;
          height: 42px;
          border-radius: 999px;
          background: #fde68a;
        }

        .character-leg-left {
          left: 43px;
        }

        .character-leg-right {
          right: 43px;
        }

        .character-red {
          --body: #ef4444;
          --hair: #111827;
        }

        .character-yellow {
          --body: #facc15;
          --hair: #111827;
        }

        .character-orange {
          --body: #fb923c;
          --hair: #b45309;
        }

        .character-green {
          --body: #22c55e;
          --hair: #334155;
        }

        .character-prize.is-back .character-head {
          background: var(--hair);
        }

        .character-prize.is-back .character-hair,
        .character-prize.is-back .character-eye,
        .character-prize.is-back .character-mouth {
          display: none;
        }

        .character-name-patch {
          position: absolute;
          left: 50%;
          top: 23px;
          max-width: 112px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.18);
          padding: 8px 13px;
          color: #0f172a;
          font-size: 20px;
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          letter-spacing: -0.07em;
          word-break: keep-all;
        }

        .result-character {
          position: absolute;
          left: 50%;
          top: 48%;
          transform: translate(-50%, -50%) scale(0.84);
          opacity: 0;
          z-index: 12;
          filter: drop-shadow(0 18px 18px rgba(15, 23, 42, 0.2));
        }

        .result-character.is-visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          transition: opacity 0.42s ease, transform 0.42s ease;
        }

        .capsule-open {
          position: absolute;
          left: 50%;
          top: 43%;
          width: 17%;
          transform: translate(-50%, -50%);
          opacity: 0;
          z-index: 9;
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

        <div className="glass-brightener" aria-hidden="true" />
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
            transform: `translate(calc(-50% + ${motion.x}px), 0)`,
          }}
        >
          <div
            className="claw-cable"
            style={{
              height: `${motion.cable}px`,
            }}
          />
          <div
            className="claw-head"
            style={{
              top: `${motion.cable - 2}px`,
            }}
          >
            <span className="claw-left" />
            <span className="claw-right" />
          </div>
        </div>

        <div
          className={`grabbed-prize ${motion.showGrabbed ? "is-visible" : ""}`}
          style={{
            left: grabbedLeft,
            top: grabbedTop,
          }}
        >
          {isCharacter ? (
            <CharacterPrize kind={characterKind} side="front" />
          ) : (
            <img src={closedCapsuleAsset} alt="" draggable={false} />
          )}
        </div>

        {isCharacter ? (
          <>
            <div className={`result-character ${motion.showFront ? "is-visible" : ""}`}>
              <CharacterPrize kind={characterKind} side="front" />
            </div>
            <div className={`result-character ${motion.showBack ? "is-visible" : ""}`}>
              <CharacterPrize kind={characterKind} side="back" name={winnerNickname} />
            </div>
          </>
        ) : null}

        {isCapsule ? (
          <>
            <img
              src={openCapsuleAsset}
              className={`capsule-open ${motion.showCapsuleOpen ? "is-visible" : ""}`}
              alt=""
              draggable={false}
            />
            <div className={`paper-result ${motion.showBack ? "is-visible" : ""}`}>
              <div className="result-label">{prizeLabel(prizeKind)}</div>
              <div className="result-name">{winnerNickname}</div>
              <div className="result-note">{winnerNote}</div>
            </div>
          </>
        ) : null}

        {message && !event ? <div className="debug-message">{message}</div> : null}
      </section>
    </main>
  );
}
