"use client";

import { useEffect, useMemo, useState, useRef } from "react";

type ClawEvent = {
  title?: string | null;
  status?: string | null;
  is_test?: boolean | null;
  winner_nickname?: string | null;
  winner_note?: string | null;
  updated_at?: string | null;
  result_at?: string | null;
};

type OverlayPayload = {
  ok: boolean;
  message?: string;
  event?: ClawEvent;
};

type EventClawOverlayClientProps = {
  initialToken: string;
};

type PrizeKey =
  | "shinchan"
  | "bo"
  | "himawari"
  | "shiro"
  | "kazama"
  | "nene"
  | "masao";

type MotionState = {
  phase:
    | "idle"
    | "move-miss"
    | "drop-miss"
    | "grab-miss"
    | "lift-miss"
    | "fall-miss"
    | "move-catch"
    | "drop-catch"
    | "grab-catch"
    | "lift-catch"
    | "result";
  x: number;
  cable: number;
  clawClosed: boolean;
  showPrize: boolean;
  prizeX: number;
  prizeY: number;
  showResult: boolean;
};

const FALLBACK_TOKEN = "claw_luludongi_live";
const ASSET_BASE = "/event-claw";

const PRIZE_ASSETS: Record<PrizeKey, string> = {
  shinchan: `${ASSET_BASE}/prize-shinchan-front.png`,
  bo: `${ASSET_BASE}/prize-bo-front.png`,
  himawari: `${ASSET_BASE}/prize-himawari-front.png`,
  shiro: `${ASSET_BASE}/prize-shiro-front.png`,
  kazama: `${ASSET_BASE}/prize-kazama-front.png`,
  nene: `${ASSET_BASE}/prize-nene-front.png`,
  masao: `${ASSET_BASE}/prize-masao-front.png`,
};

const PILE_LAYOUT: Array<{ key: PrizeKey; left: number; bottom: number; size: number; z: number }> = [
  { key: "nene", left: 18, bottom: 14, size: 19, z: 2 },
  { key: "bo", left: 29, bottom: 7, size: 19, z: 3 },
  { key: "shiro", left: 43, bottom: 18, size: 15, z: 2 },
  { key: "shinchan", left: 50, bottom: 8, size: 22, z: 4 },
  { key: "masao", left: 61, bottom: 17, size: 18, z: 2 },
  { key: "himawari", left: 74, bottom: 8, size: 18, z: 3 },
  { key: "kazama", left: 82, bottom: 17, size: 19, z: 2 },
];

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function hashText(value: string) {
  return Array.from(value).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function easeInOut(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * easeInOut(t);
}

function makeResultKey(event: ClawEvent | null) {
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

function pickPrizeKey(nickname: string, resultKey: string): PrizeKey {
  const seed = hashText(`${nickname}|${resultKey}`);
  const list: PrizeKey[] = ["shinchan", "bo", "himawari", "shiro", "kazama", "nene", "masao"];
  return list[seed % list.length];
}

function getMotionState(elapsedMs: number, seed: number, hasResult: boolean, now: number): MotionState {
  const topCable = 54;
  const deepCable = 292;
  const midCable = 178;

  const idleX = Math.sin(now / 1500) * 86;

  if (!hasResult) {
    return {
      phase: "idle",
      x: idleX,
      cable: topCable,
      clawClosed: false,
      showPrize: false,
      prizeX: idleX,
      prizeY: 0,
      showResult: false,
    };
  }

  const missXOptions = [-58, -22, 42];
  const catchXOptions = [-26, 6, 30];
  const missX = missXOptions[seed % missXOptions.length];
  const catchX = catchXOptions[seed % catchXOptions.length];

  const moveMissMs = 2300;
  const dropMissMs = 2200;
  const grabMissMs = 700;
  const liftMissMs = 1500;
  const fallMissMs = 1100;
  const moveCatchMs = 2100;
  const dropCatchMs = 2200;
  const grabCatchMs = 700;
  const liftCatchMs = 2200;

  let t = elapsedMs;

  if (t <= moveMissMs) {
    return {
      phase: "move-miss",
      x: lerp(idleX, missX, t / moveMissMs),
      cable: topCable,
      clawClosed: false,
      showPrize: false,
      prizeX: missX,
      prizeY: deepCable,
      showResult: false,
    };
  }
  t -= moveMissMs;

  if (t <= dropMissMs) {
    return {
      phase: "drop-miss",
      x: missX,
      cable: lerp(topCable, deepCable, t / dropMissMs),
      clawClosed: false,
      showPrize: false,
      prizeX: missX,
      prizeY: deepCable,
      showResult: false,
    };
  }
  t -= dropMissMs;

  if (t <= grabMissMs) {
    return {
      phase: "grab-miss",
      x: missX,
      cable: deepCable,
      clawClosed: t > grabMissMs * 0.65,
      showPrize: true,
      prizeX: missX,
      prizeY: deepCable + 6,
      showResult: false,
    };
  }
  t -= grabMissMs;

  if (t <= liftMissMs) {
    return {
      phase: "lift-miss",
      x: missX,
      cable: lerp(deepCable, midCable, t / liftMissMs),
      clawClosed: true,
      showPrize: true,
      prizeX: missX,
      prizeY: lerp(deepCable + 6, midCable + 26, t / liftMissMs),
      showResult: false,
    };
  }
  t -= liftMissMs;

  if (t <= fallMissMs) {
    return {
      phase: "fall-miss",
      x: missX + 10,
      cable: lerp(midCable, deepCable, t / fallMissMs),
      clawClosed: false,
      showPrize: t < fallMissMs * 0.6,
      prizeX: missX + 10,
      prizeY: lerp(midCable + 26, deepCable + 14, t / fallMissMs),
      showResult: false,
    };
  }
  t -= fallMissMs;

  if (t <= moveCatchMs) {
    return {
      phase: "move-catch",
      x: lerp(missX + 10, catchX, t / moveCatchMs),
      cable: topCable,
      clawClosed: false,
      showPrize: false,
      prizeX: catchX,
      prizeY: deepCable,
      showResult: false,
    };
  }
  t -= moveCatchMs;

  if (t <= dropCatchMs) {
    return {
      phase: "drop-catch",
      x: catchX,
      cable: lerp(topCable, deepCable + 8, t / dropCatchMs),
      clawClosed: false,
      showPrize: false,
      prizeX: catchX,
      prizeY: deepCable + 8,
      showResult: false,
    };
  }
  t -= dropCatchMs;

  if (t <= grabCatchMs) {
    return {
      phase: "grab-catch",
      x: catchX,
      cable: deepCable + 8,
      clawClosed: t > grabCatchMs * 0.65,
      showPrize: true,
      prizeX: catchX,
      prizeY: deepCable + 12,
      showResult: false,
    };
  }
  t -= grabCatchMs;

  if (t <= liftCatchMs) {
    return {
      phase: "lift-catch",
      x: catchX,
      cable: lerp(deepCable + 8, 126, t / liftCatchMs),
      clawClosed: true,
      showPrize: true,
      prizeX: catchX,
      prizeY: lerp(deepCable + 12, 160, t / liftCatchMs),
      showResult: false,
    };
  }

  return {
    phase: "result",
    x: catchX,
    cable: 108,
    clawClosed: true,
    showPrize: true,
    prizeX: catchX,
    prizeY: 142,
    showResult: true,
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

  const winnerNickname = cleanText(event?.winner_nickname);
  const winnerNote = cleanText(event?.winner_note) || "이벤트 당첨";
  const hasResult = cleanText(event?.status) === "result" && Boolean(winnerNickname);
  const resultDisplayKey = hasResult
    ? [cleanText(event?.result_at), cleanText(event?.updated_at), winnerNickname].join("|")
    : "";
  const mountedAtRef = useRef(Date.now());
  const resultEventTime = Date.parse(cleanText(event?.result_at) || cleanText(event?.updated_at) || "");
  const isFreshResultForThisWidget =
    Number.isFinite(resultEventTime) && resultEventTime >= mountedAtRef.current - 1000;
  const elapsedMs = hasResult && animationStartedAt ? now - animationStartedAt : 0;
  const clawResultCardDelayMs = 13500;
  const clawResultCardVisibleMs = 5000;
  const resultCardVisible =
    isFreshResultForThisWidget &&
    Boolean(winnerNickname) &&
    elapsedMs >= clawResultCardDelayMs &&
    elapsedMs < clawResultCardDelayMs + clawResultCardVisibleMs;
  const seed = hashText(`${winnerNickname}|${resultKey}`);
  const prizeKey = useMemo(() => pickPrizeKey(winnerNickname || "default", resultKey || "idle"), [winnerNickname, resultKey]);
  const prizeSrc = PRIZE_ASSETS[prizeKey];
  const motion = getMotionState(elapsedMs, seed, hasResult, now);

  return (
    <main className="claw-root">
      <style>{`
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent !important;
        }
        .claw-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          pointer-events: none;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .claw-stage {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(92vw, 720px);
          aspect-ratio: 0.74;
          transform: translate(-50%, -50%);
        }
        .machine {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          user-select: none;
          filter: drop-shadow(0 18px 30px rgba(15, 23, 42, 0.20));
        }
        .machine-title {
          position: absolute;
          left: 50%;
          top: 11%;
          transform: translateX(-50%);
          min-width: 46%;
          max-width: 62%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 8px 16px rgba(15,23,42,0.12);
          padding: 8px 18px;
          font-size: clamp(13px, 1.4vw, 18px);
          font-weight: 900;
          color: #0f172a;
          z-index: 20;
          letter-spacing: -0.03em;
        }
        .glass-clip {
          position: absolute;
          left: 18.5%;
          top: 26.2%;
          width: 63%;
          height: 45.8%;
          overflow: hidden;
          z-index: 5;
        }
        .rail {
          position: absolute;
          left: 4%;
          right: 4%;
          top: 4.5%;
          height: 11px;
          border-radius: 999px;
          background: linear-gradient(180deg, #cbd5e1, #94a3b8);
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(51,65,85,0.35);
          z-index: 10;
        }
        .rail-car {
          position: absolute;
          left: 50%;
          top: 0.9%;
          width: 40px;
          height: 34px;
          transform: translateX(-50%);
          z-index: 12;
        }
        .rail-car-body {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: linear-gradient(180deg, #f8fafc, #cbd5e1);
          box-shadow: 0 2px 4px rgba(15,23,42,0.18);
        }
        .rail-wheel {
          position: absolute;
          top: 8px;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #475569;
        }
        .rail-wheel.left { left: 10px; }
        .rail-wheel.right { right: 10px; }

        .cable {
          position: absolute;
          left: 50%;
          top: 18px;
          width: 3px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, #475569, #1e293b);
          border-radius: 999px;
          z-index: 11;
        }
        .claw {
          position: absolute;
          left: 50%;
          bottom: -28px;
          width: 44px;
          height: 38px;
          transform: translateX(-50%);
          z-index: 13;
        }
        .claw-core {
          position: absolute;
          left: 50%;
          top: 0;
          width: 18px;
          height: 18px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #475569;
        }
        .claw-arm {
          position: absolute;
          top: 12px;
          width: 4px;
          height: 32px;
          background: #334155;
          border-radius: 999px;
          transform-origin: top center;
        }
        .claw-arm.center {
          left: 50%;
          transform: translateX(-50%) rotate(0deg);
        }
        .claw-arm.left {
          left: 12px;
          transform: rotate(-70deg);
        }
        .claw-arm.right {
          right: 12px;
          transform: rotate(70deg);
        }
        .claw.closed .claw-arm.left { transform: rotate(-6deg); }
        .claw.closed .claw-arm.right { transform: rotate(6deg); }

        .grabbed-prize {
          position: absolute;
          left: 50%;
          width: 24%;
          transform: translate(-50%, -50%);
          z-index: 9;
          filter: drop-shadow(0 10px 14px rgba(15, 23, 42, 0.18));
        }

        .pile-item {
          position: absolute;
          transform: translate(-50%, 0);
          user-select: none;
          z-index: 3;
          filter: drop-shadow(0 8px 10px rgba(15,23,42,0.12));
        }

        .message-pill {
          position: absolute;
          left: 50%;
          top: 6%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.72);
          color: #ffffff;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 800;
          max-width: min(80vw, 420px);
          text-align: center;
          letter-spacing: -0.02em;
        }

        .result-card {
          position: absolute;
          left: 50%;
          top: 53%;
          transform: translate(-50%, -50%);
          width: min(76%, 360px);
          border-radius: 24px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
          padding: 14px 18px 16px;
          text-align: center;
          z-index: 60;
          opacity: 0;
          transition: opacity 0.35s ease;
        }
        .result-card.show {
          opacity: 1;
        }
        .result-label {
          font-size: 18px;
          font-weight: 900;
          color: #7c3aed;
          letter-spacing: -0.03em;
        }
        .result-name {
          margin-top: 2px;
          font-size: clamp(30px, 5.5vw, 52px);
          font-weight: 900;
          line-height: 1.08;
          letter-spacing: -0.05em;
          color: #020617;
          word-break: keep-all;
        }
        .result-note {
          margin-top: 6px;
          font-size: clamp(16px, 1.8vw, 22px);
          font-weight: 800;
          color: #475569;
          letter-spacing: -0.03em;
        }
      `}</style>

      <div className="claw-stage">
        <img
          src={machineSrc}
          alt="루루동이 인형뽑기"
          className="machine"
          onError={() => setMachineSrc(`${ASSET_BASE}/machine.svg`)}
        />

        <div className="machine-title">🎁 루루동이 인형뽑기</div>

        <div className="glass-clip">
          <div className="rail" />

          <div
            className="rail-car"
            style={{
              transform: `translateX(calc(-50% + ${motion.x}px))`,
            }}
          >
            <div className="rail-car-body" />
            <div className="rail-wheel left" />
            <div className="rail-wheel right" />

            <div className="cable" style={{ height: `${motion.cable}px` }}>
              <div className={`claw ${motion.clawClosed ? "closed" : ""}`}>
                <div className="claw-core" />
                <div className="claw-arm center" />
                <div className="claw-arm left" />
                <div className="claw-arm right" />
              </div>
            </div>
          </div>

          {motion.showPrize ? (
            <img
              src={prizeSrc}
              alt="당첨 인형"
              className="grabbed-prize"
              style={{
                left: `calc(50% + ${motion.prizeX}px)`,
                top: `${motion.prizeY}px`,
              }}
            />
          ) : null}

          {PILE_LAYOUT.map((item, index) => (
            <img
              key={`${item.key}-${index}`}
              src={PRIZE_ASSETS[item.key]}
              alt={item.key}
              className="pile-item"
              style={{
                left: `${item.left}%`,
                bottom: `${item.bottom}%`,
                width: `${item.size}%`,
                zIndex: item.z,
              }}
            />
          ))}
        </div>

        {message && !winnerNickname ? <div className="message-pill">{message}</div> : null}

        <div className={`result-card ${resultCardVisible && winnerNickname ? "show" : ""}`}>
          <div className="result-label">당첨</div>
          <div className="result-name">{winnerNickname || "대기중"}</div>
          <div className="result-note">{winnerNote}</div>
        </div>
      </div>
    </main>
  );
}
