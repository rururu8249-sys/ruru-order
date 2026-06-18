"use client";

// 미션 게이지 OBS 위젯 (투명 배경, 읽기 전용).
//   - /api/event-mission/overlay 를 폴링해서 현재 방송의 공동목표 진행률을 슬림 바로 표시.
//   - 미션 OFF이거나 목표 미설정이면 아무것도 안 보임(완전 투명).
//   - 돈/포인트 로직 없음. OBS 브라우저 소스로 사용.
import { useEffect, useState } from "react";

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

  const panelBg = done ? "rgba(15,110,86,0.42)" : "rgba(123,45,67,0.34)";
  const border = done ? "1.5px solid rgba(245,196,81,0.85)" : near ? "1.5px solid rgba(245,196,81,0.85)" : "1px solid rgba(245,196,81,0.5)";
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
      <style>{`@keyframes ruruPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
      <div
        style={{
          width: "min(96vw, 1080px)",
          borderRadius: 12,
          background: panelBg,
          border,
          padding: "5px 14px",
          color: "#fff",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          animation: near ? "ruruPulse 1s ease-in-out infinite" : "none",
        }}
      >
        <div style={{ position: "relative", height: 24 }}>
          {/* 장면 A: 설명 문구 (바 없음) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              whiteSpace: "nowrap",
              opacity: !done && phase === 0 ? 1 : 0,
              transition: "opacity .55s ease",
              fontSize: "clamp(12px, 3vw, 16px)",
              fontWeight: 800,
              textShadow: "0 1px 3px rgba(0,0,0,0.55)",
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
              opacity: done || phase === 1 ? 1 : 0,
              transition: "opacity .55s ease",
            }}
          >
            <span style={{ fontSize: 17, flexShrink: 0, textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}>{done ? "🏆" : "🎁"}</span>
            <span
              style={{
                position: "relative",
                flex: 1,
                minWidth: 40,
                height: 16,
                background: "rgba(255,255,255,0.24)",
                borderRadius: 7,
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
                  borderRadius: 7,
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
                  fontSize: "clamp(10px, 2vw, 12px)",
                  fontWeight: 800,
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                {pctRounded}%
              </span>
            </span>
            <span
              style={{
                fontSize: "clamp(11px, 2.6vw, 14px)",
                fontWeight: 800,
                flexShrink: 0,
                textShadow: "0 1px 3px rgba(0,0,0,0.55)",
              }}
            >
              {done ? (
                <>
                  목표 달성! <span style={{ color: "#F5C451" }}>전원 {won(reward)}P 선물 🎉</span>
                </>
              ) : reward > 0 ? (
                <>
                  100% 되면 <span style={{ color: "#F5C451" }}>전원 {won(reward)}P 선물!</span>
                </>
              ) : (
                "100% 되면 목표 달성!"
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
