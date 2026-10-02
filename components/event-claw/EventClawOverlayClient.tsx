"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {clawDurationMs as getClawTotalDurationMs, sampleClawMotion as getMotionState} from "@/lib/eventClawScene";

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
    // [2026-08-06 부하개선] 표시할 이벤트가 없을 땐 폴링을 늦추기 위한 플래그.
    let hasEvent = false;

    async function loadOverlay() {
      try {
        const response = await fetch(`/api/event-claw/overlay?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as OverlayPayload;

        if (cancelled) return;

        if (!payload.ok || !payload.event) {
          hasEvent = false;
          setEvent(null);
          setMessage(payload.message || "표시할 인형뽑기 이벤트가 없습니다.");
          return;
        }

        hasEvent = true;
        setEvent(payload.event);
        setMessage("");
      } catch (error) {
        if (cancelled) return;
        hasEvent = false;
        setEvent(null);
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }

    // [2026-08-06 부하개선] 기존 setInterval(loadOverlay, 900) → 적응형 폴링.
    // 이벤트가 떠 있는 동안엔 기존과 동일한 0.9초, 없을 땐 5초.
    let timer: number | null = null;

    const tick = async () => {
      await loadOverlay();
      if (cancelled) return;
      timer = window.setTimeout(tick, hasEvent ? 900 : 5000);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
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
  const seed = hashText(`${winnerNickname}|${resultKey}`);
  const prizeKey = useMemo(() => pickPrizeKey(winnerNickname || "default", resultKey || "idle"), [winnerNickname, resultKey]);
  const prizeSrc = PRIZE_ASSETS[prizeKey];
  const missPrizeKey = pickPrizeKey((winnerNickname || "default") + "-miss", (resultKey || "idle") + "-miss");
  const missPrizeSrc = PRIZE_ASSETS[missPrizeKey === prizeKey ? (Object.keys(PRIZE_ASSETS) as PrizeKey[]).filter((k) => k !== prizeKey)[0] : missPrizeKey];
  const playAnimation = hasResult && isFreshResultForThisWidget;
  const elapsedMs = playAnimation && animationStartedAt ? now - animationStartedAt : 0;
  const motion = getMotionState(elapsedMs, seed, playAnimation, now);
  const clawResultCardVisibleMs = 5000;

  // 가장 단순하고 확실한 방식: 이번 판 경과시간이 연출 총길이를 넘으면 표시.
  // 기억(ref) 없음 -> 이전 판 영향 없음, 시작하자마자 뜨는 일 구조적으로 불가능.
  const clawTotalDurationMs = getClawTotalDurationMs(seed);
  const animationFinished =
    hasResult &&
    animationStartedAt > 0 &&
    elapsedMs >= clawTotalDurationMs &&
    elapsedMs < clawTotalDurationMs + clawResultCardVisibleMs;

  const resultCardVisible =
    isFreshResultForThisWidget &&
    Boolean(winnerNickname) &&
    animationFinished;

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
          bottom: -42px;
          width: 64px;
          height: 64px;
          transform: translateX(-50%);
          z-index: 13;
        }
        .claw-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: top center;
          filter: drop-shadow(0 4px 6px rgba(15,23,42,0.3));
          transition: opacity 0.12s ease;
        }

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
                <img
                  className="claw-img"
                  src={`${ASSET_BASE}/${motion.clawClosed ? "claw-closed" : "claw-open"}.png`}
                  alt="집게"
                />
              </div>
            </div>
          </div>

          {motion.showPrize ? (
            <img
              src={motion.isMiss ? missPrizeSrc : prizeSrc}
              alt={motion.isMiss ? "놓친 인형" : "당첨 인형"}
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
