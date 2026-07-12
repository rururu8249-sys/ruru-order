"use client";

// 서바이벌(폭풍 생존게임) OBS 위젯 (투명 배경, 읽기 전용).
//   - 구매자 전원을 막대 인간으로 뿌리고, 라운드마다 재난이 여러 명씩 탈락 → 최종 생존자 K명.
//   - 탈락 엔진은 "미리 정해진 생존자(survivorIds)를 제외한 나머지"만 탈락시킨다.
//     → 서버가 확정한 생존자 집합을 그대로 연출로 재현(Phase 3 연동 시 이 페이지 재작성 불필요).
//   - Phase 1: 서버 연동 전. ?preview=1(또는 기본)로 가짜 명단 데모.
//     실데이터 폴링(/api/event-survival/overlay)은 Phase 3에서 붙인다.
//   - 돈/포인트 로직 없음. OBS 브라우저 소스로 사용.
import React, { useCallback, useEffect, useRef, useState } from "react";

const ROSE = "#7B2D43";
const GOLD = "#F0C45A";
const NAME_SHOW_AT = 12; // 남은 인원이 이 값 이하면 이름 표시
const TOKEN = "survival_luludongi_live"; // 공개 오버레이 API 고정 토큰

const FRONT = ["꽃님", "봄날", "행복", "예쁜", "루루", "하늘", "달콤", "사랑", "미소", "햇살",
  "바다", "노을", "향기", "구름", "달빛", "새록", "포근", "설렘", "단비", "온유",
  "고운", "초록", "은하", "다온", "여울", "가온", "라온", "하율", "소담", "윤슬"];
const BACK = ["맘", "님", "언니", "여사", "공주", "이", "네", "댁", "홀릭", "러버", "데이", "가든"];

const DISASTERS = [
  { id: "lightning", label: "⛈️ 번개가 번쩍!", accent: "#F0C45A", emoji: "💀" },
  { id: "wave", label: "🌊 파도가 덮쳤어요!", accent: "#6FC3E8", emoji: "🌊" },
  { id: "wind", label: "🌪️ 돌풍이 몰아쳐요!", accent: "#B8E8C4", emoji: "💨" },
  { id: "hail", label: "❄️ 우박이 쏟아져요!", accent: "#E0EAFF", emoji: "❄️" },
  { id: "meteor", label: "☄️ 운석이 떨어져요!", accent: "#FF8A5A", emoji: "🔥" },
];
const CONFETTI = ["#F0C45A", "#7B2D43", "#F5E6EB", "#6FC3E8", "#FF8A5A", "#fff"];

type Player = {
  id: number;
  name: string;
  x: number;
  y: number;
  dead: boolean;
  hit: boolean;
  dtype: string | null;
};

// 참가자 명단(이름 배열)을 받아 격자 좌표로 배치. 명단 없으면 가짜로 n명 생성(데모).
function makeScene(names: string[] | null, n: number): Player[] {
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
  const cols = 10;
  const rows = Math.max(1, Math.ceil(total / cols));
  return list.map((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 7 + (col + 0.5) * (86 / cols) + (Math.random() * 5 - 2.5);
    const y = 30 + (row + 0.5) * (64 / rows) + (Math.random() * 4 - 2);
    return { id: i, name, x, y, dead: false, hit: false, dtype: null };
  });
}

function Stick({ color, dead, hit, zap }: { color: string; dead: boolean; hit: boolean; zap: boolean }) {
  const c = dead ? "#8a8a8a" : color;
  return (
    <svg width="20" height="27" viewBox="0 0 26 34"
      style={{ overflow: "visible", animation: zap ? "electroFlick .4s linear" : "none" }}>
      <circle cx="13" cy="6" r="5" fill="none" stroke={c} strokeWidth="2.8" />
      <line x1="13" y1="11" x2="13" y2="22" stroke={c} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="13" y1="14" x2={hit ? 3 : 6} y2={hit ? 7 : 17} stroke={c} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="13" y1="14" x2={hit ? 23 : 20} y2={hit ? 7 : 17} stroke={c} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="13" y1="22" x2="7" y2="32" stroke={c} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="13" y1="22" x2="19" y2="32" stroke={c} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

function deathTransform(t: string | null) {
  switch (t) {
    case "wave": return "translate(-50%,-50%) translate(60px,70px) rotate(120deg)";
    case "wind": return "translate(-50%,-50%) translate(220px,-40px) rotate(560deg)";
    case "hail": return "translate(-50%,-50%) translateY(35px) rotate(90deg) scaleY(.4)";
    case "meteor": return "translate(-50%,-50%) translate(-50px,25px) rotate(-100deg)";
    default: return "translate(-50%,-50%) translateY(45px) rotate(95deg)";
  }
}
function streakPoints(x: number, y: number, fromX: number) {
  const pts: number[][] = [[fromX, 0]];
  for (let i = 1; i < 4; i++) pts.push([fromX + (x - fromX) * (i / 4) + (Math.random() * 6 - 3), (y * i) / 4]);
  pts.push([x, y]);
  return pts.map((p) => p.join(",")).join(" ");
}

type FxState = { type: string; key: number; streaks: { id: number; pts: string }[]; accent: string } | null;
type Burst = { id: string; x: number; y: number; emoji: string; accent: string; dtype: string };
type MsgState = { label: string; dead: string[] } | null;

export default function SurvivalLiveWidget() {
  // 설정: preview 모드에서는 쿼리로 총원/생존자 수 조절 (기본 100명 중 1명 생존).
  const [total, setTotal] = useState(100);
  const [winnerCount, setWinnerCount] = useState(1);
  const [names, setNames] = useState<string[] | null>(null);
  const [survivorIds, setSurvivorIds] = useState<Set<number>>(new Set());

  const [mounted, setMounted] = useState(false); // SSR 후 클라 마운트 전까지 렌더 보류(hydration 불일치 방지)
  const [preview, setPreview] = useState(false);  // ?preview=1 이면 가짜 명단 데모(관리자 확인용)
  const [hasEvent, setHasEvent] = useState(false); // 실제 모드에서 서버 이벤트를 받았는지 (없으면 완전 투명)
  const [players, setPlayers] = useState<Player[]>(() => makeScene(null, 100));
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [message, setMessage] = useState<MsgState>(null);
  const [winners, setWinners] = useState<Player[]>([]);
  const [fx, setFx] = useState<FxState>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);

  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);
  const survivorIdsRef = useRef(survivorIds);
  useEffect(() => { survivorIdsRef.current = survivorIds; }, [survivorIds]);
  const running = useRef(false);
  const lastEventKeyRef = useRef(""); // 같은 판을 두 번 연출하지 않도록 하는 키(result_at|updated_at)
  const firstLoadRef = useRef(true); // 위젯 로드 후 첫 폴링 — 켠 시점에 이미 끝난 옛 결과 자동재생 방지
  const rosterKeyRef = useRef(""); // 현재 대기(명단)화면 참가자 키 — 매 폴링 재배치(깜빡임) 방지
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addT = (t: ReturnType<typeof setTimeout>) => timers.current.push(t);
  const clearT = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const aliveCount = players.filter((p) => !p.dead).length;
  const showNames = aliveCount <= NAME_SHOW_AT || phase === "done";
  const done = phase === "done";
  const winnerIdSet = new Set(winners.map((w) => w.id));

  // 투명 배경(OBS) + 쿼리 파싱. preview=1이면 가짜 명단 데모, 아니면 서버 이벤트를 기다린다.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const q = new URLSearchParams(window.location.search);
    const isPreview = q.get("preview") === "1";
    setPreview(isPreview);

    if (isPreview) {
      const t = Math.max(2, Math.min(200, Number(q.get("total")) || 100));
      const w = Math.max(1, Math.min(t - 1, Number(q.get("winners")) || 1));
      setTotal(t);
      setWinnerCount(w);
      const scene = makeScene(null, t);
      setPlayers(scene);
      setNames(scene.map((p) => p.name));
      const ids = scene.map((p) => p.id);
      const surv = new Set<number>();
      while (surv.size < w && surv.size < ids.length) {
        surv.add(ids[Math.floor(Math.random() * ids.length)]);
      }
      setSurvivorIds(surv);
    }

    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    running.current = false; clearT();
    const scene = makeScene(names, total);
    setPlayers(scene);
    // 새 판: 생존자 재선정(데모)
    const ids = scene.map((p) => p.id);
    const surv = new Set<number>();
    while (surv.size < winnerCount && surv.size < ids.length) {
      surv.add(ids[Math.floor(Math.random() * ids.length)]);
    }
    setSurvivorIds(surv);
    setMessage(null); setWinners([]); setFx(null); setBursts([]);
    setPhase("ready");
  }, [names, total, winnerCount]);

  const shake = (strong: boolean) => {
    const el = stageRef.current;
    if (!el || !el.animate) return;
    const m = strong ? 8 : 5;
    el.animate([{ transform: "translate(0,0)" }, { transform: `translate(-${m}px,${m / 2}px)` },
      { transform: `translate(${m}px,-${m / 3}px)` }, { transform: `translate(-${m / 2}px,0)` },
      { transform: "translate(0,0)" }], { duration: 360, easing: "ease-out" });
  };

  const tick = useCallback(() => {
    if (!running.current) return;
    const cur = playersRef.current;
    const survSet = survivorIdsRef.current;
    const alive = cur.filter((p) => !p.dead);
    // 탈락 후보 = 살아있으면서 생존자로 지정되지 않은 사람
    const eliminable = alive.filter((p) => !survSet.has(p.id));
    if (eliminable.length <= 0) {
      // 남은 사람 = 지정 생존자 전원 → 종료
      running.current = false;
      setWinners(alive);
      setPhase("done"); setFx(null); setBursts([]);
      return;
    }
    // 이번 라운드 탈락 인원(남은 탈락후보 규모에 따라 가변)
    const a = eliminable.length;
    let w: number;
    if (a > 70) w = 9; else if (a > 45) w = 7; else if (a > 25) w = 5;
    else if (a > 14) w = 3; else if (a > 7) w = 2; else w = 1;
    w = Math.min(w, a); // 후보 전부 탈락시켜도 생존자는 남음
    const pool = [...eliminable];
    const victims: Player[] = [];
    for (let k = 0; k < w; k++) {
      const idx = Math.floor(Math.random() * pool.length);
      victims.push(pool[idx]); pool.splice(idx, 1);
    }
    const vids = new Set(victims.map((v) => v.id));
    const dis = DISASTERS[Math.floor(Math.random() * DISASTERS.length)];
    const next = cur.map((p) =>
      vids.has(p.id) ? { ...p, dead: true, hit: true, dtype: dis.id } : (p.hit ? { ...p, hit: false } : p));
    let streaks: { id: number; pts: string }[] = [];
    if (dis.id === "lightning") streaks = victims.map((v) => ({ id: v.id, pts: streakPoints(v.x, v.y, v.x) }));
    if (dis.id === "meteor") streaks = victims.map((v) => ({ id: v.id, pts: streakPoints(v.x, v.y, v.x - 25) }));
    setFx({ type: dis.id, key: Date.now(), streaks, accent: dis.accent });
    setBursts(victims.map((v) => ({ id: v.id + "-" + Date.now(), x: v.x, y: v.y, emoji: dis.emoji, accent: dis.accent, dtype: dis.id })));
    shake(dis.id === "meteor" || dis.id === "lightning");
    addT(setTimeout(() => setFx(null), 850));
    addT(setTimeout(() => setBursts([]), dis.id === "lightning" ? 800 : 650));
    setMessage({ label: dis.label, dead: victims.map((v) => v.name) });
    setPlayers(next);
    // 다음 라운드 간격: 남은 탈락후보 규모로 조절(줄수록 느려져 긴장감↑)
    const na = next.filter((p) => !p.dead && !survSet.has(p.id)).length;
    let d: number;
    if (na > 70) d = 550; else if (na > 45) d = 700; else if (na > 25) d = 900;
    else if (na > 14) d = 1150; else if (na > 7) d = 1550; else if (na > 2) d = 2050; else d = 2500;
    addT(setTimeout(tick, d));
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true; setPhase("running");
    addT(setTimeout(tick, 700));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // 서버가 확정한 참가자·생존자 명단으로 판을 세팅하고 바로 연출을 시작한다.
  //   생존자는 서버가 이미 정한 사람들이라, 연출은 "그 사람들만 남기고" 나머지를 탈락시킨다.
  const startFromServer = useCallback((participantNames: string[], survivorNames: string[], k: number) => {
    const scene = makeScene(participantNames, participantNames.length);
    const survKeys = new Set(survivorNames.map((n) => String(n || "").trim()));
    const surv = new Set<number>(scene.filter((p) => survKeys.has(p.name)).map((p) => p.id));

    // 명단이 안 맞으면(생존자 0명 or 전원 생존) 연출하지 않는다 — 전원 탈락 사고 방지.
    if (surv.size <= 0 || surv.size >= scene.length) return;

    running.current = false;
    clearT();
    // 타이머가 옛 상태를 읽지 않도록 ref를 즉시 맞춘다.
    playersRef.current = scene;
    survivorIdsRef.current = surv;

    setTotal(scene.length);
    setWinnerCount(Math.max(1, k || surv.size));
    setNames(participantNames);
    setPlayers(scene);
    setSurvivorIds(surv);
    setWinners([]);
    setMessage(null);
    setFx(null);
    setBursts([]);
    setHasEvent(true);
    setPhase("running");
    running.current = true;
    addT(setTimeout(tick, 900));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // 명단만 대기 표시(연출 시작 안 함): 위젯을 켜거나 아직 안 돌렸을 때 참가자 로스터만 보여준다.
  const showRosterReady = useCallback((participantNames: string[], k: number) => {
    running.current = false;
    clearT();
    const scene = makeScene(participantNames, participantNames.length);
    playersRef.current = scene;
    survivorIdsRef.current = new Set();
    setTotal(scene.length);
    setWinnerCount(Math.max(1, k || 1));
    setNames(participantNames);
    setPlayers(scene);
    setSurvivorIds(new Set());
    setWinners([]);
    setMessage(null);
    setFx(null);
    setBursts([]);
    setHasEvent(true);
    setPhase("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 실제 모드(OBS): 공개 오버레이 API 폴링. 결과 전이면 명단만 대기 표시,
  //   위젯이 켜져 있는 동안 '새로' 확정된 결과에만 연출. 껐다 켜도(remount) 켠 시점의 옛 결과는 재생 안 함.
  useEffect(() => {
    if (!mounted || preview) return;
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/event-survival/overlay?token=${TOKEN}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive || !data?.ok || !data.event) return;

        const ev = data.event as {
          status?: string;
          participants?: { nickname?: string }[];
          survivors?: string[];
          winner_count?: number;
          result_at?: string | null;
          updated_at?: string | null;
        };

        const participantNames = Array.isArray(ev.participants)
          ? ev.participants.map((p) => String(p?.nickname || "").trim()).filter(Boolean)
          : [];
        const survivorNames = Array.isArray(ev.survivors) ? ev.survivors : [];

        // 아직 결과 전(idle/spinning): 참가자 명단만 대기 표시(연출 시작 안 함).
        if (ev.status !== "result") {
          firstLoadRef.current = false;
          if (!running.current) {
            const rkey = "roster:" + participantNames.join("|");
            if (participantNames.length > 0) {
              if (rkey !== rosterKeyRef.current) { rosterKeyRef.current = rkey; showRosterReady(participantNames, Number(ev.winner_count || 1)); }
            } else if (rosterKeyRef.current !== "") { rosterKeyRef.current = ""; setHasEvent(false); }
          }
          return;
        }

        const key = `${ev.result_at || ""}|${ev.updated_at || ""}`;
        if (!key || key === lastEventKeyRef.current) return; // 같은 판이면 아무것도 안 함

        // 위젯을 켠 '시점에 이미' 확정돼 있던 옛 결과 → 재생하지 않고 명단만 대기 표시.
        if (firstLoadRef.current) {
          lastEventKeyRef.current = key;
          firstLoadRef.current = false;
          if (participantNames.length > 0) { rosterKeyRef.current = "roster:" + participantNames.join("|"); showRosterReady(participantNames, Number(ev.winner_count || survivorNames.length || 1)); }
          else setHasEvent(false);
          return;
        }

        // 위젯이 켜져 있는 동안 '새로' 확정된 결과 → 연출 시작.
        if (survivorNames.length <= 0 || participantNames.length <= 0) return;
        lastEventKeyRef.current = key;
        rosterKeyRef.current = "";
        startFromServer(participantNames, survivorNames, Number(ev.winner_count || survivorNames.length));
      } catch {
        /* 무시 — 다음 폴링에서 재시도 */
      }
    };

    void load();
    const t = setInterval(() => void load(), 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mounted, preview, startFromServer, showRosterReady]);

  useEffect(() => () => { running.current = false; clearT(); }, []);

  const multi = winners.length > 1;

  // 클라 마운트 전(SSR 시점)에는 아무것도 안 그림 → Math.random 기반 렌더의 hydration 불일치 방지.
  if (!mounted) return null;
  // 실제 모드(OBS): 서버에 확정된 이벤트가 없으면 완전 투명(방송 화면에 빈 박스 안 뜨게).
  if (!preview && !hasEvent) return null;

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
      minHeight: "100vh", position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <style>{`
        @keyframes rainfall{to{transform:translateY(120vh)}}
        @keyframes flick{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes rise{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1)}}
        @keyframes spot{0%,100%{opacity:.45}50%{opacity:.85}}
        @keyframes waveSweep{0%{transform:translateX(-110%) skewX(-8deg)}100%{transform:translateX(110%) skewX(-8deg)}}
        @keyframes windSweep{0%{transform:translateX(-130%) rotate(-9deg);opacity:0}25%{opacity:.9}100%{transform:translateX(130%) rotate(-9deg);opacity:0}}
        @keyframes hailFall{0%{transform:translateY(-15%);opacity:0}20%{opacity:1}100%{transform:translateY(130%);opacity:.2}}
        @keyframes flashOut{0%{opacity:1}100%{opacity:0}}
        @keyframes ringExpand{0%{width:8px;height:8px;opacity:.9}100%{width:64px;height:64px;opacity:0}}
        @keyframes burstPop{0%{transform:scale(.3);opacity:0}35%{transform:scale(1.5);opacity:1}100%{transform:scale(1);opacity:0}}
        @keyframes confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(420px) rotate(540deg);opacity:.9}}
        @keyframes crownBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes electroFlick{0%,100%{filter:none}20%{filter:brightness(4) drop-shadow(0 0 6px #FFE08A)}40%{filter:brightness(1.5)}60%{filter:brightness(4) drop-shadow(0 0 8px #FFF)}80%{filter:brightness(1.5)}}
        @keyframes zapShake{0%,100%{transform:translate(-50%,-50%)}15%{transform:translate(-54%,-52%) rotate(-7deg)}30%{transform:translate(-46%,-48%) rotate(6deg)}45%{transform:translate(-53%,-51%) rotate(-5deg)}60%{transform:translate(-47%,-50%) rotate(4deg)}80%{transform:translate(-51%,-50%) rotate(-2deg)}}
        @keyframes skullZap{0%{transform:scale(.2);opacity:0}22%{transform:scale(1.6);opacity:1}55%{transform:scale(1.2);opacity:1}100%{transform:scale(1.1);opacity:0}}
        @keyframes sparkFlick{0%,100%{opacity:1}33%{opacity:.15}66%{opacity:.9}}
      `}</style>

      {/* ── 정사각(1:1) 게임 위젯 : OBS 소스로 얹힘(투명 배경) ── */}
      <div ref={stageRef} style={{ position: "relative", width: "min(96vw, 96vh)", aspectRatio: "1 / 1",
        borderRadius: 20, overflow: "hidden",
        background: "linear-gradient(180deg,rgba(20,12,30,.62),rgba(45,26,44,.62))",
        border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>

        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: "-10%", left: `${Math.random() * 100}%`,
            width: 1.5, height: 18, background: "linear-gradient(transparent,rgba(210,220,255,.5))",
            animation: `rainfall ${0.5 + Math.random() * 0.5}s linear ${Math.random()}s infinite`,
            opacity: phase === "running" ? 0.5 : 0.2 }} />
        ))}

        {/* HUD */}
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center",
          pointerEvents: "none", zIndex: 40, padding: "0 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.75)", letterSpacing: 2 }}>남은 사람</div>
          <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1,
            textShadow: "0 2px 12px rgba(0,0,0,.85)", fontVariantNumeric: "tabular-nums",
            animation: phase === "running" ? "flick .6s infinite" : "none" }}>
            {done ? winners.length : aliveCount}<span style={{ fontSize: 18, color: "rgba(255,255,255,.55)" }}> / {total}</span>
          </div>
          <div style={{ minHeight: 40, marginTop: 3 }}>
            {phase === "ready" && <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,.9)" }}>시작하면 재난이 몰아쳐요 ⚡ (생존 {winnerCount}명)</span>}
            {phase === "running" && message && (
              <div key={message.dead.join() + message.label} style={{ animation: "rise .3s ease" }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", textShadow: "0 1px 8px #000" }}>{message.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: GOLD, textShadow: "0 1px 8px #000" }}>
                  💥 {message.dead.length > 4 ? `${message.dead.length}명` : message.dead.join(", ")} 탈락!
                </div>
              </div>
            )}
            {done && winners.length > 0 && (
              <div style={{ animation: "pop .5s ease" }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: GOLD, textShadow: "0 2px 12px #000" }}>
                  🎉 최종 생존자 {winners.length > 1 ? `${winners.length}명` : ""} 🎉
                </span>
              </div>
            )}
          </div>
        </div>

        {fx && <DisasterFX fx={fx} />}

        {players.map((p) => {
          const isW = winnerIdSet.has(p.id);
          const scale = isW ? (done ? (multi ? 1.7 : 2.6) : 1.7) : aliveCount <= 6 ? 1.4 : aliveCount <= NAME_SHOW_AT ? 1.15 : 1;
          // 단독 우승이면 가운데로 모음. 다중이면 제자리 강조.
          const cx = isW && done && !multi ? 50 : p.x;
          const cy = isW && done && !multi ? 52 : p.y;
          return (
            <div key={p.id} style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`,
              transform: p.dead ? deathTransform(p.dtype) : `translate(-50%,-50%) scale(${scale})`,
              transition: "left .7s ease, top .7s ease, transform .8s cubic-bezier(.3,.8,.4,1), opacity .8s ease",
              opacity: p.dead ? 0 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              zIndex: isW ? 30 : 10 }}>
              {isW && done && <div style={{ fontSize: multi ? 15 : 18, animation: "crownBounce 1s ease-in-out infinite" }}>👑</div>}
              {!p.dead && (showNames || isW) && (
                <span style={{ fontSize: isW && done ? (multi ? 12 : 14) : isW ? 12 : 10, fontWeight: 900,
                  color: isW ? "#231018" : "#fff", whiteSpace: "nowrap",
                  background: isW ? GOLD : "rgba(0,0,0,.55)", padding: isW && done ? "2px 9px" : "1px 5px",
                  borderRadius: 7, lineHeight: 1.3,
                  boxShadow: isW && done ? "0 4px 14px rgba(240,196,90,.6)" : "none" }}>{p.name}</span>
              )}
              <div style={{ animation: isW ? "flick .6s ease-in-out infinite" : "none" }}>
                <Stick color={isW ? GOLD : "#fff"} dead={p.dead} hit={p.hit} zap={p.dead && p.dtype === "lightning"} />
              </div>
              {isW && <div style={{ position: "absolute", inset: done && !multi ? -50 : -28, borderRadius: "50%",
                background: "radial-gradient(circle,rgba(240,196,90,.55),transparent 70%)",
                animation: "spot 1.1s infinite", zIndex: -1 }} />}
            </div>
          );
        })}

        {done && Array.from({ length: 32 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${Math.random() * 100}%`,
            width: 6, height: 10, background: CONFETTI[i % CONFETTI.length], borderRadius: 2, zIndex: 35,
            animation: `confetti ${1.4 + Math.random() * 1.2}s linear ${Math.random() * 1.1}s infinite` }} />
        ))}

        {bursts.map((b) => b.dtype === "lightning" ? (
          <div key={b.id} style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`,
            transform: "translate(-50%,-50%)", zIndex: 26, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center", animation: "zapShake .5s ease-in-out" }}>
            <div style={{ position: "absolute", borderRadius: "50%", border: "3px solid #FFE08A",
              boxShadow: "0 0 16px #F0C45A", animation: "ringExpand .6s ease-out forwards" }} />
            {[[-18, -12], [20, -9], [-14, 14], [16, 13]].map(([dx, dy], k) => (
              <span key={k} style={{ position: "absolute", transform: `translate(${dx}px,${dy}px)`,
                fontSize: 12, animation: `sparkFlick .45s linear ${k * 0.03}s` }}>⚡</span>
            ))}
            <span style={{ fontSize: 28, animation: "skullZap .75s ease-out forwards",
              filter: "drop-shadow(0 0 6px rgba(255,224,138,.9))" }}>💀</span>
          </div>
        ) : (
          <div key={b.id} style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`,
            transform: "translate(-50%,-50%)", zIndex: 25, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", borderRadius: "50%", border: `3px solid ${b.accent}`,
              boxShadow: `0 0 12px ${b.accent}`, animation: "ringExpand .55s ease-out forwards" }} />
            <span style={{ fontSize: 20, animation: "burstPop .55s ease-out forwards",
              filter: "drop-shadow(0 0 4px rgba(0,0,0,.6))" }}>{b.emoji}</span>
          </div>
        ))}

        {/* 진행자 컨트롤 — 미리보기(?preview=1)에서만. 실제 방송은 관리자 ▶돌리기가 서버로 트리거한다. */}
        {preview ? (
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex",
          justifyContent: "center", gap: 8, zIndex: 70 }}>
          {!done ? (
            <button onClick={start} disabled={phase === "running"} style={{
              padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999, border: "none",
              cursor: phase === "running" ? "default" : "pointer", color: "#fff",
              background: phase === "running" ? "rgba(0,0,0,.5)" : ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
              {phase === "running" ? "폭풍 진행 중…" : "▶  시작 (미리보기)"}
            </button>
          ) : (
            <button onClick={reset} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900,
              borderRadius: 999, border: "none", cursor: "pointer", color: "#fff", background: ROSE,
              boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>🔄  다시 하기</button>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}

function DisasterFX({ fx }: { fx: NonNullable<FxState> }) {
  const { type, accent, streaks } = fx;
  if (type === "lightning" || type === "meteor") {
    const flash = type === "meteor" ? "rgba(255,140,80,.45)" : "rgba(255,255,255,.6)";
    return (<>
      <div style={{ position: "absolute", inset: 0, background: flash, pointerEvents: "none",
        zIndex: 15, animation: "flashOut .3s ease-out forwards" }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 16 }}>
        {streaks.map((s) => (
          <polyline key={s.id} points={s.pts} fill="none" stroke={accent} strokeWidth="3.5"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 7px ${accent})` }} />
        ))}
      </svg>
    </>);
  }
  if (type === "wave") return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 20 }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "70%",
        background: "linear-gradient(90deg,transparent,rgba(70,160,220,.55) 60%,rgba(190,230,255,.75))",
        borderRadius: "0 60% 60% 0 / 0 50% 50% 0", animation: "waveSweep .9s ease-in-out" }} />
    </div>);
  if (type === "wind") return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 20 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", top: `${8 + i * 11}%`, left: 0, width: "70%", height: 3,
          background: `linear-gradient(90deg,transparent,${accent},transparent)`, borderRadius: 3,
          animation: `windSweep .8s ease-in ${i * 0.04}s` }} />
      ))}
    </div>);
  if (type === "hail") return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 20 }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${Math.random() * 100}%`,
          width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}`,
          animation: `hailFall ${0.5 + Math.random() * 0.3}s linear ${Math.random() * 0.2}s` }} />
      ))}
    </div>);
  return null;
}
