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

  const liveOk = !!(data && data.ok && data.active && data.goal && data.goal > 0);
  if (!liveOk && !preview) {
    return <div style={{ background: "transparent" }} />;
  }
  const useSample = !liveOk; // preview 인데 미션 OFF/미설정 → 샘플로 디자인만 보여줌

  const goalType: "count" | "amount" = useSample ? "count" : data!.goalType === "amount" ? "amount" : "count";
  const goal = useSample ? 100 : data!.goal || 0;
  const current = useSample ? 63 : data!.current || 0;
  const reward = useSample ? 1000 : data!.reward || 0;
  const pct = useSample ? 63 : Math.min(100, data!.pct || 0);
  const title = useSample ? "미리보기" : data!.title || "";
  const remaining = Math.max(0, goal - current);

  const goalText =
    goalType === "amount" ? `오늘 매출 ${won(goal)}원 목표` : `오늘 누적 판매 ${goal}개 목표`;
  const currentText = goalType === "amount" ? `현재 ${won(current)}원` : `현재 ${current}개`;
  const remainText =
    pct >= 100
      ? "목표 달성!"
      : goalType === "amount"
      ? `${won(remaining)}원 남았어요!`
      : `${remaining}개 남았어요!`;

  const done = pct >= 100;
  const near = !done && pct >= 90;

  const panelBg = done ? "rgba(15,110,86,0.72)" : "rgba(123,45,67,0.55)";
  const border = done ? "2px solid #F5C451" : near ? "2px solid #F5C451" : "1.5px solid rgba(245,196,81,0.6)";
  const fillBg = done ? "#F5C451" : near ? "#FFB12E" : "#FF5C8E";

  return (
    <div
      style={{
        fontFamily: "'Noto Sans KR', system-ui, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "10px 12px",
        background: "transparent",
      }}
    >
      <style>{`@keyframes ruruPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
      <div
        style={{
          width: "min(96vw, 1080px)",
          borderRadius: 16,
          background: panelBg,
          border,
          padding: "10px 16px",
          color: "#fff",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          animation: near ? "ruruPulse 1s ease-in-out infinite" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>{done ? "🏆" : near ? "🔥" : "🎁"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: done ? "#C7F0E2" : "#FFE3EC", fontWeight: 500 }}>
              {done ? "목표 달성! 모두 고마워요" : "다 같이 채우면 — 구매자 전원 포인트!"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 1 }}>
              {title ? `${title} · ` : ""}
              {goalText} <span style={{ color: done ? "#C7F0E2" : "#FFE3EC" }}>· {currentText}</span>
            </div>
          </div>
          {reward > 0 ? (
            <div
              style={{
                background: "#F5C451",
                color: "#5A3A00",
                fontSize: 14,
                fontWeight: 800,
                padding: "6px 12px",
                borderRadius: 10,
                whiteSpace: "nowrap",
              }}
            >
              구매자 전원 {won(reward)}P
            </div>
          ) : null}
        </div>
        <div
          style={{
            marginTop: 9,
            height: 16,
            background: "rgba(255,255,255,0.24)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: fillBg, borderRadius: 8, transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 13, color: done ? "#C7F0E2" : "#FFE3EC", marginTop: 5, fontWeight: 500 }}>
          {done ? `구매자 전원에게 ${won(reward)}P 지급 예정! 🎉` : remainText}
        </div>
      </div>
    </div>
  );
}
