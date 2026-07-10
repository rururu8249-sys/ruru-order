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

// 100% 달성 축하 연출 지속시간(ms). 지나면 정적 고정 화면으로 전환.
const CELEBRATE_MS = 8000;

// 달성 폭죽 조각(고정값 — Math.random 안 씀 → SSR hydration 경고 없음)
const CONFETTI_COLORS = ["#F5C451", "#FF5C8E", "#63E6BE", "#ffffff"];
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  x: `${-190 + i * 29}px`,
  d: `${((i * 7) % 10) / 20}s`,
  c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

export default function MissionLiveWidget() {
  const [data, setData] = useState<MissionData | null>(null);
  const [preview, setPreview] = useState(false);
  // 바 폭(px). [2026-07-10] 사장님 지침 "가로 더 작게" → 560 → 470. ?w=520 처럼 조절 가능.
  const [barWidth, setBarWidth] = useState(470);
  const [phase, setPhase] = useState(0); // 0=설명 문구, 1=진행 바 (4초마다 전환)
  const [celebrate, setCelebrate] = useState(false); // 달성 순간 1회 반짝
  const wasDoneRef = useRef(false);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const q = new URLSearchParams(window.location.search);
    setPreview(q.get("preview") === "1");
    const w = Number(q.get("w"));
    if (Number.isFinite(w) && w >= 240 && w <= 1200) setBarWidth(w);
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

  // 100% 달성 "순간"에만 축하 연출(폭죽·반짝·🎉 튐)을 8초 재생하고, 이후엔 정적 고정 화면.
  //   [2026-07-10 사장님 지침] 무한 반복은 산만 → CELEBRATE_MS 동안만.
  useEffect(() => {
    const livePct =
      data && data.ok && data.active && data.goal && data.goal > 0 ? Math.min(100, data.pct || 0) : 0;
    const isDone = livePct >= 100;
    if (isDone && !wasDoneRef.current) {
      wasDoneRef.current = true;
      setCelebrate(true);
      const to = setTimeout(() => setCelebrate(false), CELEBRATE_MS);
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
        // [2026-07-09] 주문서 QR 왼쪽에 붙일 수 있게 가운데 정렬 → 왼쪽 정렬로 변경.
        //   OBS에서 소스를 QR 왼쪽으로 끌어다 놓으면 딱 맞는다.
        justifyContent: "flex-start",
        padding: "4px 6px",
        background: "transparent",
      }}
    >
      {/* [2026-07-10] 달성 연출 강화 — 금빛 반짝(무한) + 폭죽 낙하 + 🎉 튀는 효과.
          전부 CSS 애니메이션(표시 전용). 돈/지급 로직과 무관. */}
      <style>{`
@keyframes ruruPulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes ruruCelebrate{0%,100%{box-shadow:0 0 0 0 rgba(245,196,81,0),0 4px 14px rgba(0,0,0,0.18);transform:scale(1)}50%{box-shadow:0 0 20px 7px rgba(245,196,81,0.85),0 4px 14px rgba(0,0,0,0.28);transform:scale(1.02)}}
@keyframes ruruPop{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.25) rotate(-8deg)}}
@keyframes ruruFall{0%{opacity:0;transform:translate(var(--x),-26px) rotate(0)}12%{opacity:1}100%{opacity:0;transform:translate(calc(var(--x) + 16px),84px) rotate(420deg)}}
.ruru-conf{position:absolute;inset:0;overflow:visible;pointer-events:none}
.ruru-conf i{position:absolute;left:50%;top:0;width:8px;height:12px;border-radius:2px;background:var(--c);transform:translateX(var(--x));animation:ruruFall 1.8s linear var(--d) infinite}
`}</style>
      <div
        style={{
          // [2026-07-09] 화면 전체를 가로지르던 바(1080px)를 QR 옆에 들어가는 크기로 축소.
          //   ?w=560 처럼 쿼리로 폭을 조절할 수 있다(기본 560px).
          position: "relative",
          width: `min(96vw, ${barWidth}px)`,
          borderRadius: 11,
          background: panelBg,
          border,
          padding: "9px 18px",
          color: "#fff",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          // 달성 순간 8초만 반짝 → 이후 정적(초록 패널 + 금색 테두리로 달성 상태는 계속 인지됨)
          animation: celebrate
            ? "ruruCelebrate 1.4s ease-in-out infinite"
            : near && !done
            ? "ruruPulse 1s ease-in-out infinite"
            : "none",
        }}
      >
        {done ? (
          /* 달성 후: 바 없이 달성 문구 + 폭죽 (누가 봐도 "달성됐다"가 보이게) */
          <>
            {celebrate ? (
              <div className="ruru-conf" aria-hidden>
                {CONFETTI.map((c, i) => (
                  <i key={i} style={{ ["--x" as string]: c.x, ["--d" as string]: c.d, ["--c" as string]: c.c }} />
                ))}
              </div>
            ) : null}
            <div
              style={{
                position: "relative",
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                whiteSpace: "nowrap",
                fontSize: "25px",
                fontWeight: 900,
                textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.7)",
              }}
            >
              {/* [2026-07-09 사장님 지침] 달성 시 "선물이 펑펑펑" 안내 */}
              <span
                style={{
                  fontSize: "1.15em",
                  display: "inline-block",
                  animation: celebrate ? "ruruPop 1s ease-in-out infinite" : "none",
                }}
              >
                🎉
              </span>
              <span>
                100% 목표달성! <span style={{ color: "#F5C451" }}>선물이 펑펑펑</span>
                {reward > 0 ? (
                  <span style={{ color: "#F5C451" }}> — 전원 {won(reward)}P!</span>
                ) : null}
              </span>
            </div>
          </>
        ) : (
          <div style={{ position: "relative", height: 40 }}>
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
                fontSize: "25px",
                fontWeight: 900,
                textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.7)",
              }}
            >
              {/* [2026-07-10 사장님 지침] "다 같이 참여" 뉘앙스 추가 + 글씨 크게 */}
              <span style={{ fontSize: "1.15em" }}>🎯</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>다 같이 100% 목표달성 이벤트</span>
            </div>
            {/* 장면 B: 진행 바 + 보상 (바 안에 % 오버레이) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                gap: 11,
                whiteSpace: "nowrap",
                overflow: "hidden", // 포인트 금액이 길어도 위젯 박스 밖으로 안 나가게
                opacity: phase === 1 ? 1 : 0,
                transition: "opacity .55s ease",
              }}
            >
              <span style={{ fontSize: 26, flexShrink: 0, textShadow: "0 2px 5px rgba(0,0,0,0.8)" }}>🎁</span>
              {/* [2026-07-10] 바가 가로를 다 먹어 글씨가 작아지던 것 → 바를 고정폭(150px)으로 줄이고 글씨를 키움 */}
              <span
                style={{
                  position: "relative",
                  width: 150,
                  flexShrink: 0,
                  height: 26,
                  background: "rgba(255,255,255,0.3)",
                  borderRadius: 13,
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
                    borderRadius: 13,
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
                    fontSize: "18px",
                    fontWeight: 900,
                    color: "#fff",
                    textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                  }}
                >
                  {pctRounded}%
                </span>
              </span>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 900,
                  flexShrink: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.7)",
                }}
              >
                {/* [2026-07-10] 문구 근거(업계 검색):
                      ① Goal-Gradient — 목표에 가까울수록 행동이 빨라짐 → 90%↑엔 "조금만 더!" 별도 문구
                      ② 행동형 카피 — "N 남음"보다 "N 채우면 ○○이 열려요"가 전환이 높음 → "되면"→"채우면", "오픈" */}
                {near ? (
                  <>
                    조금만 더!{" "}
                    <span style={{ color: "#F5C451" }}>
                      곧 {reward > 0 ? `전원 ${won(reward)}P` : "전원"} 선물 오픈!
                    </span>
                  </>
                ) : (
                  <>
                    100% 채우면{" "}
                    <span style={{ color: "#F5C451" }}>
                      {reward > 0 ? `전원 ${won(reward)}P 선물 오픈!` : "전원 선물 오픈!"}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
