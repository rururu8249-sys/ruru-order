"use client";

// 미션 게이지 OBS 위젯 (투명 배경, 읽기 전용).
//   - /api/event-mission/overlay 를 폴링해서 현재 방송의 공동목표 진행률을 슬림 바로 표시.
//   - 미션 OFF이거나 목표 미설정이면 아무것도 안 보임(완전 투명).
//   - 돈/포인트 로직 없음. OBS 브라우저 소스로 사용.
import { useEffect, useRef, useState } from "react";

const TOKEN = "mission_luludongi_live";

type MissionData = {
  ok: boolean;
  active?: boolean;
  title?: string;
  goalType?: "count" | "amount";
  goal?: number;
  current?: number;
  reward?: number;
  pct?: number;
};

const won = (n: number) => n.toLocaleString("ko-KR");

export default function MissionLiveWidget() {
  const [data, setData] = useState<MissionData | null>(null);
  const [preview, setPreview] = useState(false);
  const [phase, setPhase] = useState(0); // 0=설명 문구, 1=진행 바 (4초마다 전환)
  const [celebrate, setCelebrate] = useState(false); // 달성 순간 1회 반짝
  const wasDoneRef = useRef(false);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/event-mission/overlay?token=${TOKEN}`, { cache: "no-store" });
        const json = (await res.json()) as MissionData;
        if (alive) setData(json);
      } catch {
        /* 무시 — 다음 폴링에서 재시도 */
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // 문구 ↔ 진행 바 4초마다 전환
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p === 0 ? 1 : 0)), 4000);
    return () => clearInterval(t);
  }, []);

  // 100% 달성 "순간"에만 1회 반짝(이후엔 정적). data 기준으로 판정.
  useEffect(() => {
    const livePct =
      data && data.ok && data.active && data.goal && data.goal > 0 ? Math.min(100, data.pct || 0) : 0;
    const isDone = livePct >= 100;
    if (isDone && !wasDoneRef.current) {
      wasDoneRef.current = true;
      setCelebrate(true);
      const to = setTimeout(() => setCelebrate(false), 2600);
      return () => clearTimeout(to);
    }
    if (!isDone) wasDoneRef.current = false; // 다시 100% 미만이면 재발동 가능(새 방송 등)
  }, [data]);

  const liveOk = !!(data && data.ok && data.active && data.goal && data.goal > 0);
  if (!liveOk && !preview) {
    return <div style={{ background: "transparent" }} />;
  }
  const useSample = !liveOk; // preview 인데 미션 OFF/미설정 → 샘플로 디자인만 보여줌

  const reward = useSample ? 1000 : data!.reward || 0;
  const pct = useSample ? 63 : Math.min(100, data!.pct || 0);
  const pctRounded = Math.round(pct);

  const done = pct >= 100;
  const near = !done && pct >= 90;

  const panelBg = done ? "rgba(15,110,86,0.58)" : "rgba(123,45,67,0.5)";
  const border = done ? "2px solid rgba(245,196,81,0.9)" : near ? "2px solid rgba(245,196,81,0.9)" : "1.5px solid rgba(245,196,81,0.7)";
  const fillBg = done ? "#F5C451" : near ? "#FFB12E" : "#FF5C8E";

  return (
    <div
      style={{
        fontFamily: "'Noto Sans KR', system-ui, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "6px 10px",
        background: "transparent",
      }}
    >
      <style>{`@keyframes ruruPulse{0%,100%{opacity:1}50%{opacity:.55}}@keyframes ruruCelebrate{0%,100%{box-shadow:0 0 0 0 rgba(245,196,81,0),0 4px 14px rgba(0,0,0,0.18);transform:scale(1)}50%{box-shadow:0 0 18px 6px rgba(245,196,81,0.85),0 4px 14px rgba(0,0,0,0.28);transform:scale(1.015)}}`}</style>
      <div
        style={{
          width: "min(96vw, 1080px)",
          borderRadius: 13,
          background: panelBg,
          border,
          padding: "9px 18px",
          color: "#fff",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          animation: celebrate
            ? "ruruCelebrate 1.2s ease-in-out 2"
            : near
            ? "ruruPulse 1s ease-in-out infinite"
            : "none",
        }}
      >
        {done ? (
          /* 달성 후: 바 없이 달성+선물 문구만 (정적) */
          <div
            style={{
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              whiteSpace: "nowrap",
              fontSize: "clamp(15px, 3.6vw, 22px)",
              fontWeight: 800,
              textShadow: "0 2px 5px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
            }}
          >
            <span style={{ fontSize: "1.15em" }}>🏆</span>
            <span>
              목표 달성!{" "}
              {reward > 0 ? (
                <span style={{ color: "#F5C451" }}>구매자 전원 {won(reward)}P 선물!</span>
              ) : null}
            </span>
          </div>
        ) : (
          <div style={{ position: "relative", height: 32 }}>
            {/* 장면 A: 설명 문구 (바 없음) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                whiteSpace: "nowrap",
                opacity: phase === 0 ? 1 : 0,
                transition: "opacity .55s ease",
                fontSize: "clamp(15px, 3.6vw, 22px)",
                fontWeight: 800,
                textShadow: "0 2px 5px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
              }}
            >
              <span style={{ fontSize: "1.15em" }}>🛒</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>다 같이 구매할수록 바가 가득 차요!</span>
            </div>
            {/* 장면 B: 진행 바 + 보상 (바 안에 % 오버레이) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
                opacity: phase === 1 ? 1 : 0,
                transition: "opacity .55s ease",
              }}
            >
              <span style={{ fontSize: 21, flexShrink: 0, textShadow: "0 2px 5px rgba(0,0,0,0.8)" }}>🎁</span>
              <span
                style={{
                  position: "relative",
                  flex: 1,
                  minWidth: 40,
                  height: 22,
                  background: "rgba(255,255,255,0.3)",
                  borderRadius: 10,
                  overflow: "hidden",
                  display: "block",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: `${pct}%`,
                    height: "100%",
                    background: fillBg,
                    borderRadius: 10,
                    transition: "width .6s ease",
                    display: "block",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "clamp(12px, 2.4vw, 15px)",
                    fontWeight: 800,
                    color: "#fff",
                    textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                  }}
                >
                  {pctRounded}%
                </span>
              </span>
              <span
                style={{
                  fontSize: "clamp(14px, 3vw, 18px)",
                  fontWeight: 800,
                  flexShrink: 0,
                  textShadow: "0 2px 5px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
                }}
              >
                {reward > 0 ? (
                  <>
                    100% 되면 <span style={{ color: "#F5C451" }}>전원 {won(reward)}P 선물!</span>
                  </>
                ) : (
                  "100% 되면 목표 달성!"
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
