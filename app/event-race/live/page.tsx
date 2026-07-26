"use client";

// 🏁 달리기 대회(100m 스프린트) OBS 위젯 (투명 배경, 읽기 전용).
//   - 참가자 전원을 졸라맨 러너로 가로 레인에 세우고, 왼→오른쪽으로 달려 결승선 통과.
//   - 서버가 확정한 당첨자(survivor_nicknames)를 그대로 "먼저 결승선 통과한 1~K등"으로 재현.
//     (서바이벌과 동일한 event_roulette_events 엔진 재사용 — 추첨/포인트 로직은 서버가 담당)
//   - 크기·채팅 안전 배치는 서바이벌 위젯과 동일(상단 63vh, 하단은 채팅 자리로 투명).
//   - 돈/포인트 로직 없음. OBS 브라우저 소스로 사용.
import React, { useCallback, useEffect, useRef, useState } from "react";

const ROSE = "#7B2D43";
const GOLD = "#F0C45A";
const TOKEN = "race_luludongi_live"; // 공개 오버레이 API 고정 토큰
const LANE_COLORS = ["#FF8A5A", "#6FC3E8", "#B8E8C4", "#F0C45A", "#E88FB8", "#9D8DF1", "#7ED8C3", "#F5A3C7"];

const FRONT = ["꽃님", "봄날", "행복", "예쁜", "루루", "하늘", "달콤", "사랑", "미소", "햇살",
  "바다", "노을", "향기", "구름", "달빛", "새록", "포근", "설렘", "단비", "온유",
  "고운", "초록", "은하", "다온", "여울", "가온", "라온", "하율", "소담", "윤슬"];
const BACK = ["맘", "님", "언니", "여사", "공주", "이", "네", "댁", "홀릭", "러버", "데이", "가든"];

type Runner = {
  id: number;
  name: string;
  lane: number;      // 0..N-1
  color: string;
  finishTime: number; // 초 — 결승선 통과 예정 시각(당첨자 우선). 연출 순서 결정.
  wobbleA: number;    // 초반 흔들림 진폭
  wobbleF: number;    // 흔들림 주기
  pace: number;       // 커브 지수(0.85~1.15)
  x: number;          // 현재 진행 0~100
  rank: number | null;
};

// 참가자 이름 → 러너 배열. names 없으면 데모용 가짜 n명.
function makeRunners(names: string[] | null, n: number, winnerOrder: string[]): Runner[] {
  const list: string[] = [];
  if (names && names.length > 0) {
    for (const nm of names) list.push(String(nm || "").trim() || "고객");
  } else {
    const set = new Set<string>();
    let guard = 0;
    while (list.length < n && guard < 5000) {
      guard++;
      const name = FRONT[Math.floor(Math.random() * FRONT.length)] + BACK[Math.floor(Math.random() * BACK.length)];
      if (set.has(name)) continue;
      set.add(name);
      list.push(name);
    }
  }
  const total = list.length;
  // 당첨자 닉네임 → 결승 순서 인덱스(0=1등). 없으면 -1(일반 러너).
  const winIdx = new Map<string, number>();
  winnerOrder.forEach((nm, i) => winIdx.set(String(nm || "").trim(), i));

  // 당첨자는 4.6초부터 0.5초 간격으로 먼저 통과, 일반 러너는 그 뒤에 흩어져 통과.
  const K = winnerOrder.length;
  const lastWinT = 4.6 + Math.max(0, K - 1) * 0.5;
  return list.map((name, i) => {
    const wi = winIdx.has(name) ? (winIdx.get(name) as number) : -1;
    let finishTime: number;
    if (wi >= 0) {
      finishTime = 4.6 + wi * 0.5 + (Math.random() * 0.12 - 0.06); // 당첨자: 순서대로, 근소차
    } else {
      finishTime = lastWinT + 0.55 + Math.random() * 3.2; // 일반: 당첨자 이후 흩뿌림
    }
    return {
      id: i,
      name,
      lane: i,
      color: LANE_COLORS[i % LANE_COLORS.length],
      finishTime,
      wobbleA: 3 + Math.random() * 6,
      wobbleF: 0.6 + Math.random() * 1.1,
      pace: 0.86 + Math.random() * 0.28,
      x: 0,
      rank: null,
    };
  });
}

// 러너 진행 곡선: 0~1 정규화 시간 t에서 진행률(%) — 초반 엎치락뒤치락, 결승선(finishTime)에서 100%.
function progressAt(elapsed: number, r: Runner): number {
  const t = Math.min(1, elapsed / r.finishTime);
  const base = Math.pow(t, r.pace) * 100;
  const wob = Math.sin(elapsed * r.wobbleF * 2 * Math.PI + r.id) * r.wobbleA * (1 - t); // 초반만 흔들림
  return Math.max(0, Math.min(100, base + wob));
}

const FINISH_X = 88; // 결승선 위치(%)

function RunnerStick({ color, running, size, finished }: { color: string; running: boolean; size: number; finished: boolean }) {
  // 달리는 졸라맨: 다리 2개가 번갈아 움직이는 프레임 애니메이션
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 26 30" style={{ overflow: "visible" }}>
      <g style={{ animation: running ? "runBob .28s steps(2) infinite" : "none", transformOrigin: "13px 26px" }}>
        <circle cx="14" cy="5" r="4.4" fill="none" stroke={color} strokeWidth="2.6" />
        {/* 앞으로 살짝 기운 몸통 */}
        <line x1="14" y1="9" x2="12" y2="19" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        {/* 팔(앞뒤로 흔듦) */}
        <line x1="13" y1="12" x2={running ? 20 : 18} y2={running ? 9 : 15} stroke={color} strokeWidth="2.6" strokeLinecap="round" style={{ animation: running ? "armL .28s ease-in-out infinite alternate" : "none", transformOrigin: "13px 12px" }} />
        <line x1="13" y1="12" x2={running ? 5 : 8} y2={running ? 15 : 15} stroke={color} strokeWidth="2.6" strokeLinecap="round" style={{ animation: running ? "armR .28s ease-in-out infinite alternate" : "none", transformOrigin: "13px 12px" }} />
        {/* 다리(달리는 스텝) */}
        <line x1="12" y1="19" x2={running ? 19 : 8} y2="28" stroke={color} strokeWidth="2.6" strokeLinecap="round" style={{ animation: running ? "legA .28s ease-in-out infinite alternate" : "none", transformOrigin: "12px 19px" }} />
        <line x1="12" y1="19" x2={running ? 6 : 17} y2="28" stroke={color} strokeWidth="2.6" strokeLinecap="round" style={{ animation: running ? "legB .28s ease-in-out infinite alternate" : "none", transformOrigin: "12px 19px" }} />
      </g>
      {finished && <text x="13" y="-4" textAnchor="middle" fontSize="12">💨</text>}
    </svg>
  );
}

export default function RaceLiveWidget() {
  const [total, setTotal] = useState(20);
  const [winnerCount, setWinnerCount] = useState(1);
  const [title, setTitle] = useState("🏁 루루동이 달리기 대회");
  const [names, setNames] = useState<string[] | null>(null);
  const [winnerOrder, setWinnerOrder] = useState<string[]>([]);

  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState(false);
  const [hasEvent, setHasEvent] = useState(false);
  const [runners, setRunners] = useState<Runner[]>(() => makeRunners(null, 20, []));
  const [phase, setPhase] = useState<"ready" | "countdown" | "running" | "done">("ready");
  const [countText, setCountText] = useState("");
  const [finishedRanks, setFinishedRanks] = useState<{ name: string; rank: number; color: string }[]>([]);

  const runnersRef = useRef(runners);
  useEffect(() => { runnersRef.current = runners; }, [runners]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const rankCounterRef = useRef(0);
  const winnerSetRef = useRef<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addT = (t: ReturnType<typeof setTimeout>) => timers.current.push(t);
  const clearAll = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
  };
  const lastEventKeyRef = useRef("");
  const firstLoadRef = useRef(true);
  const rosterKeyRef = useRef("");
  const stageRef = useRef<HTMLDivElement | null>(null);

  const done = phase === "done";
  const winnerNames = new Set(winnerOrder.map((n) => String(n || "").trim()));

  // ── 효과음: /sfx/race-{start|run|finish}.mp3 있으면 사용, 없으면 WebAudio 합성. ?sound=0 끔.
  const soundOnRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sfxFilesRef = useRef<Record<string, string>>({});
  const runLoopRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    ["start", "run", "finish"].forEach((k) => {
      const url = `/sfx/race-${k}.mp3`;
      const a = new Audio();
      a.preload = "auto";
      a.oncanplaythrough = () => { sfxFilesRef.current[k] = url; };
      a.onerror = () => {};
      a.src = url;
    });
  }, [mounted]);
  const ensureAudio = () => {
    if (!soundOnRef.current) return null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      if (audioCtxRef.current.state === "suspended") void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch { return null; }
  };
  const playSfx = useCallback((kind: string) => {
    if (!soundOnRef.current) return;
    const url = sfxFilesRef.current[kind];
    if (url && kind !== "run") { try { const a = new Audio(url); a.volume = 0.85; void a.play(); return; } catch { /* fall */ } }
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
      if (kind === "start") {
        // 출발 호루라기: 삐이익 (고음 + 살짝 떨림)
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 2100;
        const trill = ctx.createOscillator(); trill.type = "sine"; trill.frequency.value = 28;
        const tg = ctx.createGain(); tg.gain.value = 120; trill.connect(tg); tg.connect(o.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.4, t0 + 0.03); g.gain.setValueAtTime(0.4, t0 + 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.62);
        o.connect(g).connect(out); trill.start(t0); o.start(t0); o.stop(t0 + 0.65); trill.stop(t0 + 0.65);
      } else if (kind === "finish") {
        // 결승 환호 팡파레
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
          const g = ctx.createGain(); const ts = t0 + i * 0.1;
          g.gain.setValueAtTime(0.0001, ts); g.gain.linearRampToValueAtTime(0.3, ts + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ts + 0.6);
          o.connect(g).connect(out); o.start(ts); o.stop(ts + 0.65);
        });
      }
    } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const q = new URLSearchParams(window.location.search);
    const isPreview = q.get("preview") === "1";
    setPreview(isPreview);
    soundOnRef.current = q.get("sound") !== "0";
    if (isPreview) {
      const t = Math.max(2, Math.min(60, Number(q.get("total")) || 12));
      const w = Math.max(1, Math.min(t - 1, Number(q.get("winners")) || 1));
      const demo = makeRunners(null, t, []);
      const nmeNames = demo.map((r) => r.name);
      // 데모: 랜덤 당첨자 w명 순서 지정
      const shuffled = [...nmeNames].sort(() => Math.random() - 0.5).slice(0, w);
      setTotal(t); setWinnerCount(w); setNames(nmeNames); setWinnerOrder(shuffled);
      setRunners(makeRunners(nmeNames, t, shuffled));
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 러너 배치(대기 화면)
  const showRoster = useCallback((participantNames: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makeRunners(participantNames, participantNames.length, []);
    runnersRef.current = scene;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || 1)); setTitle(ttl || "🏁 루루동이 달리기 대회");
    setNames(participantNames); setWinnerOrder([]); setRunners(scene);
    setFinishedRanks([]); setPhase("ready"); setHasEvent(true); setCountText("");
  }, []);

  // 애니메이션 루프
  const animate = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const cur = runnersRef.current;
    let allWinnersDone = true;
    const next = cur.map((r) => {
      if (r.rank !== null) return r;
      const x = progressAt(elapsed, r);
      if (x >= FINISH_X && r.rank === null) {
        rankCounterRef.current += 1;
        const rank = rankCounterRef.current;
        const isWin = winnerSetRef.current.has(r.name);
        if (isWin) {
          setFinishedRanks((prev) => [...prev, { name: r.name, rank, color: r.color }]);
          playSfx("finish");
        }
        return { ...r, x: 100, rank };
      }
      if (winnerSetRef.current.has(r.name)) allWinnersDone = false;
      return { ...r, x };
    });
    runnersRef.current = next;
    setRunners(next);

    const finishedWinners = next.filter((r) => r.rank !== null && winnerSetRef.current.has(r.name)).length;
    if (finishedWinners >= winnerSetRef.current.size && winnerSetRef.current.size > 0) {
      // 당첨자 전원 통과 → 0.8초 후 종료 연출
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      addT(setTimeout(() => setPhase("done"), 800));
      return;
    }
    if (elapsed > 14) { // 안전 타임아웃
      setPhase("done"); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return;
    }
    void allWinnersDone;
    rafRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSfx]);

  const beginRace = useCallback((participantNames: string[], winners: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makeRunners(participantNames, participantNames.length, winners);
    if (winners.length <= 0 || winners.length >= scene.length) return; // 안전장치
    runnersRef.current = scene;
    winnerSetRef.current = new Set(winners.map((n) => String(n || "").trim()));
    rankCounterRef.current = 0;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || winners.length)); setTitle(ttl || "🏁 루루동이 달리기 대회");
    setNames(participantNames); setWinnerOrder(winners); setRunners(scene);
    setFinishedRanks([]); setHasEvent(true);
    // 카운트다운 3·2·1·출발!
    setPhase("countdown");
    setCountText("3");
    addT(setTimeout(() => setCountText("2"), 700));
    addT(setTimeout(() => setCountText("1"), 1400));
    addT(setTimeout(() => { setCountText("출발!"); playSfx("start"); }, 2100));
    addT(setTimeout(() => {
      setCountText(""); setPhase("running");
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(animate);
    }, 2800));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, playSfx]);

  // preview 시작 버튼
  const startPreview = useCallback(() => {
    ensureAudio();
    if (!names) return;
    beginRace(names, winnerOrder, winnerCount, title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, winnerOrder, winnerCount, title, beginRace]);

  const resetPreview = useCallback(() => {
    if (!names) return;
    const w = Math.max(1, winnerCount);
    const order = [...names].sort(() => Math.random() - 0.5).slice(0, w);
    setWinnerOrder(order); setRunners(makeRunners(names, names.length, [])); setFinishedRanks([]);
    setPhase("ready"); setCountText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, winnerCount]);

  // 실제 모드: 서버 폴링
  useEffect(() => {
    if (!mounted || preview) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/event-race/overlay?token=${TOKEN}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive || !data?.ok || !data.event) return;
        const ev = data.event as {
          title?: string; status?: string;
          participants?: { nickname?: string }[]; survivors?: string[];
          winner_count?: number; result_at?: string | null; updated_at?: string | null;
        };
        const pNames = Array.isArray(ev.participants) ? ev.participants.map((p) => String(p?.nickname || "").trim()).filter(Boolean) : [];
        const wNames = Array.isArray(ev.survivors) ? ev.survivors.map((s) => String(s || "").trim()).filter(Boolean) : [];
        const ttl = String(ev.title || "🏁 루루동이 달리기 대회");

        if (ev.status !== "result") {
          firstLoadRef.current = false;
          if (phase !== "running" && phase !== "countdown") {
            const rkey = "roster:" + pNames.join("|");
            if (pNames.length > 0) { if (rkey !== rosterKeyRef.current) { rosterKeyRef.current = rkey; showRoster(pNames, Number(ev.winner_count || 1), ttl); } }
            else if (rosterKeyRef.current !== "") { rosterKeyRef.current = ""; setHasEvent(false); }
          }
          return;
        }
        const key = `${ev.result_at || ""}|${ev.updated_at || ""}`;
        if (!key || key === lastEventKeyRef.current) return;
        if (firstLoadRef.current) {
          lastEventKeyRef.current = key; firstLoadRef.current = false;
          if (pNames.length > 0) { rosterKeyRef.current = "roster:" + pNames.join("|"); showRoster(pNames, Number(ev.winner_count || wNames.length || 1), ttl); }
          else setHasEvent(false);
          return;
        }
        if (wNames.length <= 0 || pNames.length <= 0) return;
        lastEventKeyRef.current = key; rosterKeyRef.current = "";
        beginRace(pNames, wNames, Number(ev.winner_count || wNames.length), ttl);
      } catch { /* 다음 폴링 재시도 */ }
    };
    void load();
    const t = setInterval(() => void load(), 2500);
    return () => { alive = false; clearInterval(t); };
  }, [mounted, preview, phase, showRoster, beginRace]);

  useEffect(() => () => { clearAll(); if (runLoopRef.current) runLoopRef.current.pause(); }, []);

  if (!mounted) return null;
  if (!preview && !hasEvent) return null;

  // 러너가 많을수록 레인 얇게 + 졸라맨 작게. 이름은 리더/당첨자만.
  const laneCount = Math.max(1, total);
  const trackTop = 22;      // % — HUD 아래
  const trackBottom = 96;   // %
  const laneH = (trackBottom - trackTop) / laneCount;
  const figSize = Math.max(10, Math.min(26, (laneH / 100) * 630 * 0.8));
  const running = phase === "running";
  // 현재 선두 순위(진행률 기준) — 이름 표시할 리더 판정용
  const orderByX = [...runners].filter((r) => r.rank === null).sort((a, b) => b.x - a.x);
  const leaderIds = new Set(orderByX.slice(0, 8).map((r) => r.id));
  const showAllNames = total <= 14;

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh",
      position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-start",
      justifyContent: "center", background: "transparent", paddingTop: "1.5vh" }}>
      <style>{`
        @keyframes runBob{0%{transform:translateY(0)}100%{transform:translateY(-2px)}}
        @keyframes legA{from{transform:rotate(28deg)}to{transform:rotate(-30deg)}}
        @keyframes legB{from{transform:rotate(-30deg)}to{transform:rotate(28deg)}}
        @keyframes armL{from{transform:rotate(-25deg)}to{transform:rotate(25deg)}}
        @keyframes armR{from{transform:rotate(25deg)}to{transform:rotate(-25deg)}}
        @keyframes countPop{0%{transform:scale(.3);opacity:0}40%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes tapeBreak{0%{opacity:1;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1.4)}}
        @keyframes medalPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
        @keyframes confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(340px) rotate(540deg);opacity:.9}}
        @keyframes winnerPanelIn{0%{transform:translateY(24px);opacity:0}100%{transform:translateY(0);opacity:1}}
        @keyframes dashFlow{to{background-position:0 -16px}}
      `}</style>

      {/* 위젯 크기·배치: 서바이벌과 동일(상단 63vh, 하단 채팅 자리 투명). PC 가로상한. */}
      <div ref={stageRef} style={{ position: "relative", width: "min(96vw, 105vh)", height: "63vh",
        borderRadius: 20, overflow: "hidden",
        background: "linear-gradient(180deg,rgba(18,20,32,.62),rgba(30,34,52,.62))",
        border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>

        {/* HUD */}
        <div style={{ position: "absolute", top: 8, left: 0, right: 0, textAlign: "center", zIndex: 40, pointerEvents: "none", padding: "0 8px" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.8)" }}>{title}</div>
          <div style={{ minHeight: 22, marginTop: 2 }}>
            {phase === "ready" && <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.9)" }}>출발하면 {winnerCount}등까지 당첨! 🏅</span>}
            {phase === "running" && <span style={{ fontSize: 14, fontWeight: 900, color: GOLD, textShadow: "0 1px 8px #000" }}>🏃 결승선까지 전력질주!</span>}
            {done && <span style={{ fontSize: 15, fontWeight: 900, color: GOLD, textShadow: "0 2px 10px #000" }}>🎉 {winnerCount > 1 ? `${winnerCount}명 ` : ""}당첨 확정! 🎉</span>}
          </div>
        </div>

        {/* 결승선(체커보드) */}
        <div style={{ position: "absolute", left: `${FINISH_X}%`, top: `${trackTop - 2}%`, bottom: `${100 - trackBottom}%`,
          width: 12, transform: "translateX(-50%)", zIndex: 20,
          backgroundImage: "repeating-conic-gradient(#fff 0% 25%, #111 0% 50%)", backgroundSize: "12px 12px",
          borderRadius: 2, boxShadow: "0 0 10px rgba(255,255,255,.35)" }} />
        <div style={{ position: "absolute", left: `${FINISH_X}%`, top: `${trackTop - 6}%`, transform: "translateX(-50%)",
          zIndex: 21, fontSize: 16 }}>🏁</div>

        {/* 레인 + 러너 */}
        {runners.map((r) => {
          const y = trackTop + (r.lane + 0.5) * laneH;
          const isWin = winnerNames.has(r.name);
          const nameOn = isWin || showAllNames || leaderIds.has(r.id) || r.rank !== null;
          return (
            <div key={r.id}>
              {/* 레인 바닥선 */}
              {laneH > 3.2 && (
                <div style={{ position: "absolute", left: "2%", right: "4%", top: `${y + laneH * 0.42}%`, height: 1,
                  background: "rgba(255,255,255,.08)" }} />
              )}
              <div style={{ position: "absolute", left: `${2 + (r.x / 100) * (FINISH_X - 2)}%`, top: `${y}%`,
                transform: "translate(-50%,-50%)", zIndex: r.rank !== null ? 30 : 12,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                transition: running ? "none" : "left .3s linear" }}>
                {nameOn && (
                  <span style={{ fontSize: isWin ? 11 : 9, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.2,
                    color: isWin ? "#231018" : "#fff", background: isWin ? GOLD : "rgba(0,0,0,.5)",
                    padding: isWin ? "1px 7px" : "0px 4px", borderRadius: 6,
                    boxShadow: isWin ? "0 2px 8px rgba(240,196,90,.5)" : "none" }}>
                    {r.rank !== null && isWin ? `${r.rank}등 ` : ""}{r.name}
                  </span>
                )}
                <RunnerStick color={isWin ? GOLD : r.color} running={running && r.rank === null} size={figSize} finished={r.rank !== null && isWin} />
              </div>
            </div>
          );
        })}

        {/* 카운트다운 */}
        {phase === "countdown" && countText && (
          <div key={countText} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
            <span style={{ fontSize: countText === "출발!" ? 64 : 96, fontWeight: 900,
              color: countText === "출발!" ? GOLD : "#fff", textShadow: "0 4px 20px rgba(0,0,0,.8)",
              animation: "countPop .5s ease" }}>{countText}</span>
          </div>
        )}

        {/* 완료: 색종이 + 당첨자 패널 */}
        {done && Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${Math.random() * 100}%`, width: 6, height: 10,
            background: ["#F0C45A", "#7B2D43", "#6FC3E8", "#FF8A5A", "#fff"][i % 5], borderRadius: 2, zIndex: 35,
            animation: `confetti ${1.3 + Math.random() * 1.1}s linear ${Math.random()}s infinite` }} />
        ))}
        {done && finishedRanks.length > 0 && (
          <div style={{ position: "absolute", left: "50%", bottom: preview ? 60 : 16, transform: "translateX(-50%)",
            zIndex: 45, maxWidth: "94%", padding: "11px 16px 12px", borderRadius: 16,
            background: "rgba(14,14,22,.9)", border: `2px solid ${GOLD}`,
            boxShadow: "0 8px 32px rgba(0,0,0,.55), 0 0 24px rgba(240,196,90,.35)",
            animation: "winnerPanelIn .5s ease", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, marginBottom: 7, textShadow: "0 1px 6px #000" }}>
              🏅 당첨자 {finishedRanks.length}명 🏅
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
              {finishedRanks.sort((a, b) => a.rank - b.rank).map((w, i) => (
                <span key={w.name} style={{ fontSize: 15, fontWeight: 900, color: "#231018", background: GOLD,
                  padding: "3px 12px", borderRadius: 999, lineHeight: 1.4, boxShadow: "0 3px 10px rgba(240,196,90,.45)",
                  animation: "medalPop .4s ease", animationDelay: `${i * 0.08}s`, animationFillMode: "both" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${w.rank}등`} {w.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* preview 컨트롤 */}
        {preview && (
          <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8, zIndex: 70 }}>
            {phase === "ready" ? (
              <button onClick={startPreview} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999,
                border: "none", cursor: "pointer", color: "#fff", background: ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
                ▶  출발 (미리보기)
              </button>
            ) : done ? (
              <button onClick={resetPreview} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999,
                border: "none", cursor: "pointer", color: "#fff", background: ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
                🔄  다시 하기
              </button>
            ) : (
              <span style={{ padding: "10px 26px", fontSize: 14, fontWeight: 900, borderRadius: 999,
                color: "#fff", background: "rgba(0,0,0,.5)" }}>경주 진행 중…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
