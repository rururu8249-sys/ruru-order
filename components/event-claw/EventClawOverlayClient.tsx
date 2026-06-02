"use client";

import { useEffect, useMemo, useState } from "react";

type ClawEvent = {
  id: number | string;
  title: string | null;
  winner_nickname: string | null;
  winner_note: string | null;
  status: string | null;
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
  | "shinchan"
  | "bo"
  | "himawari"
  | "nene"
  | "masao"
  | "kazama"
  | "shiro";

type MotionPhase = "idle" | "move" | "drop" | "grab" | "lift" | "release" | "result";

type ClawMotion = {
  x: number;
  cable: number;
  closed: boolean;
  phase: MotionPhase;
  showPrize: boolean;
  prizeX: number;
  prizeY: number;
  prizeIsWinner: boolean;
  showResult: boolean;
};

const FALLBACK_TOKEN = "claw_luludongi_live";
const ASSET_BASE = "/event-claw";

const PRIZE_ASSETS: Record<PrizeKind, { src: string; alt: string }> = {
  shinchan: { src: `${ASSET_BASE}/prize-shinchan-front.png`, alt: "짱구 인형" },
  bo: { src: `${ASSET_BASE}/prize-bo-front.png`, alt: "맹구 인형" },
  himawari: { src: `${ASSET_BASE}/prize-himawari-front.png`, alt: "짱아 인형" },
  nene: { src: `${ASSET_BASE}/prize-nene-front.png`, alt: "네네 인형" },
  masao: { src: `${ASSET_BASE}/prize-masao-front.png`, alt: "훈이 인형" },
  kazama: { src: `${ASSET_BASE}/prize-kazama-front.png`, alt: "철수 인형" },
  shiro: { src: `${ASSET_BASE}/prize-shiro-front.png`, alt: "흰둥이 인형" },
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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

function pickPrizeKind(nickname: string, resultKey: string, winnerNote: string): PrizeKind {
  const note = `${winnerNote || ""}`.toLowerCase();
  const seed = hashText(`${nickname}|${resultKey}|${winnerNote}`);

  if (note.includes("흰둥") || note.includes("시로")) return "shiro";
  if (note.includes("맹구")) return "bo";
  if (note.includes("짱아")) return "himawari";
  if (note.includes("철수")) return "kazama";
  if (note.includes("훈이")) return "masao";
  if (note.includes("유리") || note.includes("네네")) return "nene";
  if (note.includes("짱구")) return "shinchan";

  const pool: PrizeKind[] = ["shinchan", "bo", "himawari", "nene", "masao", "kazama", "shiro"];
  return pool[seed % pool.length];
}

function getMotion(elapsedMs: number, seed: number, hasResult: boolean, now: number): ClawMotion {
  const idleCable = 72;
  const bottomCable = 300;
  const liftedCable = 126;

  if (!hasResult) {
    return {
      x: Math.sin(now / 900) * 108,
      cable: idleCable,
      closed: false,
      phase: "idle",
      showPrize: false,
      prizeX: 0,
      prizeY: 0,
      prizeIsWinner: false,
      showResult: false,
    };
  }

  const missCount = seed % 2 === 0 ? 1 : 2;
  const missTargets = seed % 3 === 0 ? [-118, 88] : seed % 3 === 1 ? [112, -82] : [-52, 126];
  const successTargets = [-104, -34, 34, 104];
  const finalX = successTargets[seed % successTargets.length];
  const targets = [...missTargets.slice(0, missCount), finalX];

  const moveMs = 860;
  const dropMs = 980;
  const grabMs = 360;
  const liftMs = 1040;
  const releaseMs = 760;
  const settleMs = 280;
  const resultMs = 1700;

  let cursor = 0;
  let previousX = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const targetX = targets[index] ?? finalX;
    const isFinal = index === targets.length - 1;

    if (elapsedMs < cursor + moveMs) {
      const local = (elapsedMs - cursor) / moveMs;
      return {
        x: lerp(previousX, targetX, local),
        cable: idleCable,
        closed: false,
        phase: "move",
        showPrize: false,
        prizeX: targetX,
        prizeY: bottomCable + 26,
        prizeIsWinner: false,
        showResult: false,
      };
    }
    cursor += moveMs;

    if (elapsedMs < cursor + dropMs) {
      const local = (elapsedMs - cursor) / dropMs;
      return {
        x: targetX,
        cable: lerp(idleCable, bottomCable, local),
        closed: false,
        phase: "drop",
        showPrize: false,
        prizeX: targetX,
        prizeY: bottomCable + 26,
        prizeIsWinner: false,
        showResult: false,
      };
    }
    cursor += dropMs;

    if (elapsedMs < cursor + grabMs) {
      return {
        x: targetX,
        cable: bottomCable,
        closed: true,
        phase: "grab",
        showPrize: false,
        prizeX: targetX,
        prizeY: bottomCable + 26,
        prizeIsWinner: false,
        showResult: false,
      };
    }
    cursor += grabMs;

    if (elapsedMs < cursor + liftMs) {
      const local = (elapsedMs - cursor) / liftMs;
      const cable = lerp(bottomCable, liftedCable, local);
      return {
        x: targetX,
        cable,
        closed: true,
        phase: "lift",
        showPrize: true,
        prizeX: targetX,
        prizeY: cable + 58,
        prizeIsWinner: isFinal,
        showResult: false,
      };
    }
    cursor += liftMs;

    if (!isFinal) {
      if (elapsedMs < cursor + releaseMs) {
        const local = (elapsedMs - cursor) / releaseMs;
        return {
          x: targetX,
          cable: liftedCable,
          closed: false,
          phase: "release",
          showPrize: true,
          prizeX: targetX,
          prizeY: lerp(liftedCable + 58, bottomCable + 26, local),
          prizeIsWinner: false,
          showResult: false,
        };
      }
      cursor += releaseMs;

      if (elapsedMs < cursor + settleMs) {
        return {
          x: targetX,
          cable: idleCable,
          closed: false,
          phase: "move",
          showPrize: false,
          prizeX: targetX,
          prizeY: bottomCable + 26,
          prizeIsWinner: false,
          showResult: false,
        };
      }
      cursor += settleMs;
      previousX = targetX;
      continue;
    }

    if (elapsedMs < cursor + resultMs) {
      const local = (elapsedMs - cursor) / resultMs;
      return {
        x: targetX,
        cable: liftedCable,
        closed: true,
        phase: "result",
        showPrize: true,
        prizeX: targetX,
        prizeY: liftedCable + 42,
        prizeIsWinner: true,
        showResult: local > 0.32,
      };
    }

    return {
      x: targetX,
      cable: liftedCable,
      closed: true,
      phase: "result",
      showPrize: true,
      prizeX: targetX,
      prizeY: liftedCable + 42,
      prizeIsWinner: true,
      showResult: true,
    };
  }

  return {
    x: 0,
    cable: idleCable,
    closed: false,
    phase: "idle",
    showPrize: false,
    prizeX: 0,
    prizeY: 0,
    prizeIsWinner: false,
    showResult: false,
  };
}

function PrizeImage({
  kind,
  nickname,
  subtleTag = false,
  className = "",
}: {
  kind: PrizeKind;
  nickname?: string;
  subtleTag?: boolean;
  className?: string;
}) {
  const asset = PRIZE_ASSETS[kind];

  return (
    <div className={`prize-image ${className}`}>
      <img src={asset.src} alt={asset.alt} />
      {nickname ? (
        <div className={`prize-front-tag ${subtleTag ? "is-subtle" : ""}`}>
          {nickname}
        </div>
      ) : null}
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
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const nextResultKey = makeResultKey(event);

    if (nextResultKey && nextResultKey !== resultKey) {
      setResultKey(nextResultKey);
      setAnimationStartedAt(Date.now());
    }
  }, [event, resultKey]);

  const hasResult = Boolean(event?.status === "result" && event?.winner_nickname);
  const winnerNickname = cleanText(event?.winner_nickname) || "";
  const winnerNote = cleanText(event?.winner_note) || "이벤트 당첨";
  const elapsedMs = hasResult && animationStartedAt ? now - animationStartedAt : 0;
  const seed = hashText(`${winnerNickname}|${resultKey}|${winnerNote}`);
  const motion = getMotion(elapsedMs, seed, hasResult, now);

  const prizeKind = useMemo(
    () => pickPrizeKind(winnerNickname, resultKey, winnerNote),
    [winnerNickname, resultKey, winnerNote]
  );

  const floatingLeft = `calc(50% + ${motion.prizeX}px)`;
  const floatingTop = `calc(30.4% + ${motion.prizeY}px)`;

  return (
    <main className={`claw-overlay-root phase-${motion.phase}`}>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>

      <style jsx>{`
        .claw-overlay-root {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          font-family:
            "Pretendard",
            "Apple SD Gothic Neo",
            "Malgun Gothic",
            sans-serif;
        }

        .overlay-stage {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .overlay-message {
          position: absolute;
          left: 50%;
          top: 7%;
          transform: translateX(-50%);
          z-index: 30;
          max-width: min(92vw, 720px);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.82);
          color: #ffffff;
          padding: 12px 18px;
          font-size: clamp(14px, 1.6vw, 24px);
          font-weight: 800;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .machine-shell {
          position: relative;
          width: min(74vw, 520px);
          aspect-ratio: 9 / 14;
        }

        .machine-base {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          z-index: 1;
          user-select: none;
          -webkit-user-drag: none;
        }

        .machine-sign {
          position: absolute;
          left: 50%;
          top: 22.7%;
          transform: translateX(-50%);
          z-index: 12;
          min-width: 250px;
          max-width: 76%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
          padding: 7px 16px;
          color: #0f172a;
          font-size: clamp(16px, 1.9vw, 24px);
          font-weight: 1000;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
        }

        .machine-rail {
          position: absolute;
          left: 24.2%;
          right: 24.2%;
          top: 33.2%;
          height: 12px;
          z-index: 10;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(232, 240, 248, 0.98), rgba(104, 122, 142, 0.98));
          box-shadow:
            inset 0 2px 0 rgba(255, 255, 255, 0.72),
            inset 0 -3px 0 rgba(15, 23, 42, 0.22),
            0 5px 10px rgba(15, 23, 42, 0.17);
        }

        .machine-rail-car {
          position: absolute;
          top: 31.6%;
          width: 58px;
          height: 28px;
          z-index: 13;
          transform: translateX(-50%);
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fafc, #94a3b8);
          box-shadow: 0 7px 12px rgba(15, 23, 42, 0.2);
        }

        .machine-rail-car::before,
        .machine-rail-car::after {
          content: "";
          position: absolute;
          top: 8px;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #334155;
        }

        .machine-rail-car::before {
          left: 13px;
        }

        .machine-rail-car::after {
          right: 13px;
        }

        .machine-claw {
          position: absolute;
          top: 33.0%;
          width: 74px;
          height: 380px;
          z-index: 14;
          transform: translateX(-50%);
          filter: drop-shadow(0 7px 8px rgba(15, 23, 42, 0.22));
        }

        .machine-claw-cable {
          position: absolute;
          left: 50%;
          top: 0;
          width: 5px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, #64748b 0%, #334155 100%);
        }

        .machine-claw-head {
          position: absolute;
          left: 50%;
          width: 58px;
          height: 52px;
          transform: translateX(-50%);
        }

        .machine-claw-head::before {
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

        .claw-arm {
          position: absolute;
          top: 14px;
          width: 25px;
          height: 35px;
          border-bottom: 6px solid #334155;
          border-radius: 0 0 999px 999px;
          transition: transform 0.18s ease;
        }

        .claw-arm-left {
          left: 4px;
          border-left: 6px solid #334155;
          transform: rotate(25deg);
        }

        .claw-arm-right {
          right: 4px;
          border-right: 6px solid #334155;
          transform: rotate(-25deg);
        }

        .machine-claw.is-closed .claw-arm-left {
          transform: rotate(3deg);
        }

        .machine-claw.is-closed .claw-arm-right {
          transform: rotate(-3deg);
        }

        .floating-prize {
          position: absolute;
          z-index: 11;
          transform: translate(-50%, -50%);
          width: 100px;
          min-height: 100px;
          pointer-events: none;
          filter: drop-shadow(0 12px 12px rgba(15, 23, 42, 0.24));
        }

        .floating-prize.is-miss {
          opacity: 0.98;
        }

        .floating-prize.is-winner {
          opacity: 1;
        }

        .prize-image {
          position: relative;
          width: 100%;
        }

        .prize-image img {
          display: block;
          width: 100%;
          height: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .prize-front-tag {
          position: absolute;
          left: 50%;
          bottom: 20%;
          transform: translateX(-50%);
          max-width: 72%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
          color: rgba(15, 23, 42, 0.9);
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
          backdrop-filter: blur(4px);
          box-shadow: 0 6px 12px rgba(15, 23, 42, 0.14);
        }

        .prize-front-tag.is-subtle {
          opacity: 0.72;
          filter: blur(0.15px);
        }

        .result-panel {
          position: absolute;
          left: 50%;
          bottom: 22.5%;
          z-index: 20;
          transform: translateX(-50%);
          width: min(76%, 360px);
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
          padding: 16px 18px 18px;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .result-kicker {
          color: #8b5cf6;
          font-size: clamp(15px, 1.7vw, 22px);
          font-weight: 1000;
          line-height: 1.1;
        }

        .result-winner-name {
          margin-top: 8px;
          color: #0f172a;
          font-size: clamp(28px, 3.4vw, 48px);
          font-weight: 1000;
          line-height: 1.05;
          word-break: keep-all;
        }

        .result-note {
          margin-top: 9px;
          color: #475569;
          font-size: clamp(14px, 1.55vw, 21px);
          font-weight: 800;
          line-height: 1.2;
        }

        @media (max-width: 768px) {
          .machine-shell {
            width: min(88vw, 480px);
          }

          .machine-sign {
            min-width: 220px;
            padding: 6px 14px;
          }

          .result-panel {
            width: 74%;
            bottom: 22%;
          }
        }
      `}</style>

      <div className="overlay-stage">
        {message ? <div className="overlay-message">{message}</div> : null}

        <div className="machine-shell">
          <img
            src={machineSrc}
            alt="루루동이 인형뽑기 기계"
            className="machine-base"
            onError={() => setMachineSrc(`${ASSET_BASE}/machine.svg`)}
          />

          <div className="machine-sign">🎁 루루동이 인형뽑기</div>

          <div className="machine-rail" aria-hidden="true" />

          <div
            className="machine-rail-car"
            aria-hidden="true"
            style={{ left: `calc(50% + ${motion.x}px)` }}
          />

          <div
            className={`machine-claw ${motion.closed ? "is-closed" : ""}`}
            aria-hidden="true"
            style={{ left: `calc(50% + ${motion.x}px)` }}
          >
            <div className="machine-claw-cable" style={{ height: `${motion.cable}px` }} />
            <div className="machine-claw-head" style={{ top: `${motion.cable - 2}px` }}>
              <span className="claw-arm claw-arm-left" />
              <span className="claw-arm claw-arm-right" />
            </div>
          </div>

          {motion.showPrize ? (
            <div
              className={`floating-prize ${motion.prizeIsWinner ? "is-winner" : "is-miss"}`}
              style={{
                left: floatingLeft,
                top: floatingTop,
              }}
            >
              <PrizeImage kind={prizeKind} nickname={winnerNickname} subtleTag />
            </div>
          ) : null}

          {motion.showResult ? (
            <div className="result-panel">
              <div className="result-kicker">당첨</div>
              <div className="result-winner-name">{winnerNickname || "-"}</div>
              <div className="result-note">{winnerNote}</div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
