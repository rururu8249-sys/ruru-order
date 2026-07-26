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
// [2026-07-26 사장님] 색상 다양화 — 황금각(137.5°)으로 색상환을 고르게 분배해 60명+도 전부 다른 색.
function runnerColor(i: number): string {
  const hue = (i * 137.508) % 360;
  const sat = 68 + (i % 3) * 8;   // 68/76/84
  const light = 56 + (i % 4) * 5; // 56~71
  return `hsl(${hue.toFixed(0)}, ${sat}%, ${light}%)`;
}

const FRONT = ["꽃님", "봄날", "행복", "예쁜", "루루", "하늘", "달콤", "사랑", "미소", "햇살",
  "바다", "노을", "향기", "구름", "달빛", "새록", "포근", "설렘", "단비", "온유",
  "고운", "초록", "은하", "다온", "여울", "가온", "라온", "하율", "소담", "윤슬"];
const BACK = ["맘", "님", "언니", "여사", "공주", "이", "네", "댁", "홀릭", "러버", "데이", "가든"];

type Runner = {
  id: number;
  name: string;
  y: number;         // 세로 위치(%) — 무리(crowd) 흩뿌림. 레인 없음(마라톤 방식).
  color: string;
  finishTime: number; // 초 — 결승선 통과 예정 시각(당첨자 우선). 연출 순서 결정.
  mix: number;        // 직선 성분 비율(0~1) — 낮을수록 후반 가속(뒤에서 치고 나옴)
  pace: number;       // 후반 가속 지수
  x: number;          // 현재 진행 0~100 (100=결승선).
  rank: number | null;
  hit: boolean;       // 아이템 맞아 뱅글뱅글(카트라이더) 상태
  fallen: boolean;    // 넘어짐 상태
};

// 렌더용 이펙트 조각(매 프레임 refs에서 재구성). kind에 따라 표현 다름.
//   fly=날아가는 발사체(미사일), ground=바닥 아이템(바나나), puff=충돌/부스터 순간 이펙트
type ItemFx = { id: string; emoji: string; x: number; y: number; kind: "fly" | "ground" | "puff" };
// 소스 오브젝트(refs 보관)
type Shot = { id: string; emoji: string; fromX: number; fromY: number; toX: number; toY: number; targetId: number; born: number; dur: number; resolved: boolean };
type Banana = { id: string; x: number; y: number; born: number; consumed: boolean };
type Puff = { id: string; emoji: string; x: number; y: number; born: number };

const TRACK_TOP = 24;    // % — HUD 아래
const TRACK_BOTTOM = 94; // %
const FINISH_PCT = 88;   // 결승선 화면 위치(%). x=100이 여기에 매핑됨.
const START_PCT = 4;

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

  // [2026-07-26 긴장감 설계] 첫 당첨자는 RACE_LEAD(8초)에 통과 → 게임시간 확보(너무 빠르지 않게).
  //   당첨자들은 좁은 포토피니시 창(WIN_WINDOW) 안에서 아슬아슬 순서대로 통과, 일반 러너는 그 뒤.
  const K = winnerOrder.length;
  const WIN_WINDOW = Math.min(2.2, Math.max(0.5, K * 0.42)); // 당첨자 통과 총폭(포토피니시)
  const lastWinT = RACE_LEAD + WIN_WINDOW;
  return list.map((name, i) => {
    const wi = winIdx.has(name) ? (winIdx.get(name) as number) : -1;
    let finishTime: number;
    let pace: number;
    let mix: number;
    if (wi >= 0) {
      const frac = K > 1 ? wi / (K - 1) : 0;
      finishTime = RACE_LEAD + frac * WIN_WINDOW + (Math.random() * 0.16 - 0.08); // 순서대로, 근소차(포토피니시)
      pace = 2.0 + Math.random() * 0.6;   // 당첨자: 후반 가속 크게 → 뒤에서 치고 나와 역전
      mix = 0.15 + Math.random() * 0.2;   // 직선 성분 적음(초반 느림)
    } else {
      finishTime = lastWinT + 1.4 + Math.random() * 2.8; // 일반: 당첨자보다 한참 뒤(결승선 못 넘김, 뭉침 방지)
      pace = 1.15 + Math.random() * 0.35; // 일반: 완만한 가속(초반 앞서다 후반 따라잡힘)
      mix = 0.5 + Math.random() * 0.4;    // 직선 성분 많음(꾸준)
    }
    // 무리 흩뿌림: 세로 위치를 트랙 전체에 랜덤 배치(레인 없음). 당첨자는 약간 가운데로 모아 눈에 띄게.
    const spread = TRACK_BOTTOM - TRACK_TOP;
    const y = wi >= 0
      ? TRACK_TOP + spread * (0.22 + Math.random() * 0.56)   // 당첨자: 중앙대
      : TRACK_TOP + spread * Math.random();                  // 일반: 전체 흩뿌림
    return {
      id: i,
      name,
      y,
      color: runnerColor(i),
      finishTime,
      mix,
      pace,
      x: 0,
      rank: null,
      hit: false,
      fallen: false,
    };
  });
}

const RACE_LEAD = 8.0; // 첫 당첨자 결승 통과 시각(초) — 게임 길이 기준(카운트다운 별도)

// 러너 진행 0~100(=결승선). ★단조 증가 — 절대 뒤로 안 감(출렁임 제거).
//   f = mix·u + (1-mix)·u^pace : 두 증가함수의 블렌드라 항상 전진.
//   러너마다 mix/pace가 달라 '가속 시점'이 갈려 자연스러운 추월(엎치락뒤치락) 발생.
//   당첨자는 mix 낮고 pace 높음 → 초반 뒤처졌다 후반 가속으로 앞질러 결승선 통과.
function progressAt(elapsed: number, r: Runner): number {
  const u = Math.min(1, elapsed / r.finishTime);
  const f = r.mix * u + (1 - r.mix) * Math.pow(u, r.pace);
  return f * 100; // u=1 → 100(결승선)
}

// 달리는 졸라맨 — 앞으로 기운 몸통 + 팔다리가 크게 교차하는 러닝 사이클(관절 회전).
//   hit=아이템 맞아 뱅글뱅글 / fallen=넘어져 나뒹굼(카트라이더 반칙 연출).
function RunnerStick({ color, running, size, finished, hit, fallen }: { color: string; running: boolean; size: number; finished: boolean; hit: boolean; fallen: boolean }) {
  const jointArm = { transformBox: "fill-box" as const, transformOrigin: "left center" };
  const jointLeg = { transformBox: "fill-box" as const, transformOrigin: "left top" };
  const bodyAnim = fallen ? "fallSpin .7s ease-out" : hit ? "hitSpin .6s linear" : running ? "runBob .24s ease-in-out infinite" : "none";
  const limbsRun = running && !hit && !fallen; // 맞거나 넘어지면 팔다리 러닝 멈춤
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 30 34" style={{ overflow: "visible" }}>
      {(hit || fallen) && <text x="17" y="-4" textAnchor="middle" fontSize="13">💫</text>}
      <g style={{ animation: bodyAnim, transformBox: "fill-box", transformOrigin: "center bottom" }}>
        {/* 머리 */}
        <circle cx="17" cy="6" r="4.6" fill={color} />
        {/* 몸통(앞으로 기움) */}
        <line x1="17" y1="10" x2="14" y2="21" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
        {/* 뒤팔 */}
        <line x1="15" y1="13" x2="7" y2="16" stroke={color} strokeWidth="2.8" strokeLinecap="round"
          style={{ ...jointArm, animation: limbsRun ? "armB .24s ease-in-out infinite" : "none" }} />
        {/* 앞팔 */}
        <line x1="15" y1="13" x2="24" y2="11" stroke={color} strokeWidth="2.8" strokeLinecap="round"
          style={{ ...jointArm, animation: limbsRun ? "armF .24s ease-in-out infinite" : "none" }} />
        {/* 뒷다리(밀어내기) */}
        <line x1="14" y1="21" x2="7" y2="31" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ ...jointLeg, animation: limbsRun ? "legB .24s ease-in-out infinite" : "none" }} />
        {/* 앞다리(내딛기) */}
        <line x1="14" y1="21" x2="22" y2="30" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ ...jointLeg, animation: limbsRun ? "legF .24s ease-in-out infinite" : "none" }} />
      </g>
      {finished && <text x="17" y="-3" textAnchor="middle" fontSize="13">🎉</text>}
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
  const [leader, setLeader] = useState("");        // 실시간 선두 닉네임(긴장감)
  const [finalSprint, setFinalSprint] = useState(false); // 마지막 스퍼트 구간
  const [items, setItems] = useState<ItemFx[]>([]); // 아이템 이펙트(바나나/부스터…)
  const sprintFiredRef = useRef(false);
  const endGuardRef = useRef(14); // 안전 종료 타임아웃(초) — beginRace에서 인원/당첨수에 맞춰 설정
  const lastRenderRef = useRef(0); // 렌더 스로틀(≈30fps) — 100명도 버벅임 없이
  // 카트라이더식 아이템: 러너별 순간 가감속(bump)·피격(hit)·넘어짐(fall) 시각. 순서 보존 위해 base와 분리.
  const bumpRef = useRef<Record<number, number>>({}); // 목표 가감속(피격/부스터로 즉시 변함, 감쇠 회복)
  const offRef = useRef<Record<number, number>>({});  // 화면표시 오프셋 — bump을 부드럽게 추격(순간이동식 튐 방지)
  const hitUntilRef = useRef<Record<number, number>>({});
  const fallUntilRef = useRef<Record<number, number>>({});
  const shotsRef = useRef<Shot[]>([]);     // 날아가는 미사일들
  const bananasRef = useRef<Banana[]>([]); // 바닥 바나나들
  const puffsRef = useRef<Puff[]>([]);     // 충돌/부스터 순간 이펙트
  const nextShotRef = useRef(0);
  const nextBananaRef = useRef(0);
  const nextBoostRef = useRef(0);
  const idSeqRef = useRef(0);

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
      } else if (kind === "drumroll") {
        // 두구두구 드럼롤 — 점점 빨라지고 커짐(마지막 스퍼트 긴장감). 약 1.8초.
        let ts = t0; let gap = 0.075; const end = t0 + 1.8;
        while (ts < end) {
          const hit = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
          hit.buffer = buf;
          const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
          const g = ctx.createGain();
          const vol = 0.12 + 0.28 * ((ts - t0) / 1.8); // 점점 커짐
          g.gain.setValueAtTime(vol, ts); g.gain.exponentialRampToValueAtTime(0.001, ts + 0.06);
          hit.connect(lp).connect(g).connect(out); hit.start(ts);
          gap = Math.max(0.028, gap * 0.93); // 점점 빨라짐
          ts += gap;
        }
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
    setLeader(""); setFinalSprint(false); sprintFiredRef.current = false;
    setItems([]); bumpRef.current = {}; offRef.current = {}; hitUntilRef.current = {}; fallUntilRef.current = {};
    shotsRef.current = []; bananasRef.current = []; puffsRef.current = [];
    nextShotRef.current = 0; nextBananaRef.current = 0; nextBoostRef.current = 0;
  }, []);

  const nid = () => `fx${idSeqRef.current++}`;

  // 🚀 미사일 발사 — 뒷사람이 앞사람(선두권)에게 발사. 날아가서 맞으면 뱅글/넘어짐 + 감속.
  const spawnShot = useCallback((now: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null);
    if (alive.length < 5) return;
    const attacker = alive[Math.floor(Math.random() * alive.length)];
    const ahead = alive.filter((r) => r.x > attacker.x + 4 && r.id !== attacker.id);
    const target = (ahead.length ? ahead[Math.floor(Math.random() * ahead.length)] : alive[Math.floor(Math.random() * alive.length)]);
    if (target.id === attacker.id) return;
    shotsRef.current.push({ id: nid(), emoji: "☄️", fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, targetId: target.id, born: now, dur: 380, resolved: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🍌 바닥 바나나 — 앞쪽 트랙 임의 위치에 깔림. 러너가 밟으면 미끄러짐.
  const spawnBanana = useCallback((now: number) => {
    const x = 20 + Math.random() * 55; // 트랙 중앙대
    const y = TRACK_TOP + 4 + Math.random() * (TRACK_BOTTOM - TRACK_TOP - 8);
    bananasRef.current.push({ id: nid(), x, y, born: now, consumed: false });
  }, []);

  // 💨 부스터 — 러너 하나가 가속.
  const spawnBoost = useCallback((now: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null);
    if (alive.length < 3) return;
    const b = alive[Math.floor(Math.random() * alive.length)];
    bumpRef.current[b.id] = (bumpRef.current[b.id] || 0) + (6 + Math.random() * 7);
    puffsRef.current.push({ id: nid(), emoji: "💨", x: Math.max(2, b.x - 5), y: b.y, born: now });
  }, []);

  // 애니메이션 루프
  const animate = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const cur = runnersRef.current;

    // 아이템 스케줄(막판 스퍼트 전까지만 → 결말 보존)
    const itemWindow = elapsed > 1.0 && elapsed < RACE_LEAD - 1.8;
    if (itemWindow) {
      if (elapsed > nextShotRef.current) { spawnShot(now); nextShotRef.current = elapsed + 0.55 + Math.random() * 0.7; }
      if (elapsed > nextBananaRef.current) { spawnBanana(now); nextBananaRef.current = elapsed + 1.1 + Math.random() * 1.1; }
      if (elapsed > nextBoostRef.current) { spawnBoost(now); nextBoostRef.current = elapsed + 1.3 + Math.random() * 1.3; }
    }

    // 미사일 도착 처리: 명중 → 대상 뱅글/넘어짐 + 감속 + 💥
    for (const s of shotsRef.current) {
      if (!s.resolved && now >= s.born + s.dur) {
        s.resolved = true;
        const tgt = runnersRef.current.find((r) => r.id === s.targetId && r.rank === null);
        if (tgt) {
          bumpRef.current[tgt.id] = (bumpRef.current[tgt.id] || 0) - (5 + Math.random() * 5);
          const fall = Math.random() < 0.4;
          if (fall) fallUntilRef.current[tgt.id] = now + 750; else hitUntilRef.current[tgt.id] = now + 620;
          puffsRef.current.push({ id: nid(), emoji: "💥", x: s.toX, y: s.toY, born: now });
        }
      }
    }
    // 오래된 것 정리
    shotsRef.current = shotsRef.current.filter((s) => now - s.born < s.dur + 120);
    bananasRef.current = bananasRef.current.filter((b) => !b.consumed && now - b.born < 5000);
    puffsRef.current = puffsRef.current.filter((p) => now - p.born < 750);

    const next = cur.map((r) => {
      if (r.rank !== null) return r;
      const u = Math.min(1, elapsed / r.finishTime);
      const base = progressAt(elapsed, r);
      if (base >= 100) { // 결승선 도달(정해진 finishTime 기준 → 순서 보존). 부드럽게 도달.
        rankCounterRef.current += 1;
        const rank = rankCounterRef.current;
        if (winnerSetRef.current.has(r.name)) {
          setFinishedRanks((prev) => [...prev, { name: r.name, rank, color: GOLD }]);
          playSfx("finish");
        }
        return { ...r, x: 100, rank, hit: false, fallen: false };
      }
      // 아이템 가감속: bump=목표값(감쇠 회복). off=화면표시 오프셋이 bump을 부드럽게 추격(EASE)
      //   → 피격/부스터가 순간이동식으로 튀지 않고 자연스러운 스텀블/가속으로 보임.
      //   결승 근처(u→1)엔 (1-u)^1.3 로 효과 0 → 정해진 순서 그대로 보존.
      let bump = bumpRef.current[r.id] || 0;
      bump *= 0.93;
      if (Math.abs(bump) < 0.15) bump = 0;
      bumpRef.current[r.id] = bump;
      let off = offRef.current[r.id] || 0;
      off += (bump - off) * 0.22; // 부드럽게 따라감
      if (Math.abs(off) < 0.05) off = 0;
      offRef.current[r.id] = off;
      const vis = Math.max(0, Math.min(97, base + off * Math.pow(1 - u, 1.3)));
      // 바나나 충돌: 밟으면 미끄러짐(소비)
      if (itemWindow) {
        for (const b of bananasRef.current) {
          if (!b.consumed && Math.abs(vis - b.x) < 1.6 && Math.abs(r.y - b.y) < 4.5) {
            b.consumed = true;
            bumpRef.current[r.id] = (bumpRef.current[r.id] || 0) - (4 + Math.random() * 4);
            hitUntilRef.current[r.id] = now + 600;
            puffsRef.current.push({ id: nid(), emoji: "💫", x: b.x, y: b.y, born: now });
          }
        }
      }
      const fallen = now < (fallUntilRef.current[r.id] || 0);
      const hit = !fallen && now < (hitUntilRef.current[r.id] || 0);
      return { ...r, x: vis, hit, fallen };
    });
    runnersRef.current = next;
    // 렌더는 ≈30fps로 스로틀(100명도 부드럽게). CSS 트랜지션이 사이를 매끄럽게 이음.
    if (now - lastRenderRef.current > 32) {
      lastRenderRef.current = now;
      setRunners(next);
      // 이펙트 조각 재구성: 날아가는 미사일(보간 위치)·바닥 바나나·순간 이펙트
      const fx: ItemFx[] = [];
      for (const s of shotsRef.current) {
        const p = Math.min(1, (now - s.born) / s.dur);
        fx.push({ id: s.id, emoji: s.emoji, x: s.fromX + (s.toX - s.fromX) * p, y: s.fromY + (s.toY - s.fromY) * p, kind: "fly" });
      }
      for (const b of bananasRef.current) if (!b.consumed) fx.push({ id: b.id, emoji: "🍌", x: b.x, y: b.y, kind: "ground" });
      for (const p of puffsRef.current) fx.push({ id: p.id, emoji: p.emoji, x: p.x, y: p.y, kind: "puff" });
      setItems(fx);
    }

    // 실시간 선두(결승 전 러너 중 가장 앞) — 같은 값이면 React가 리렌더 생략
    let lead = ""; let leadX = -1;
    for (const r of next) { if (r.rank === null && r.x > leadX) { leadX = r.x; lead = r.name; } }
    if (lead) setLeader(lead);

    // 마지막 스퍼트: 첫 당첨자 통과 ~1.6초 전부터 드럼롤 + HUD (1회)
    if (!sprintFiredRef.current && elapsed > RACE_LEAD - 1.6) {
      sprintFiredRef.current = true;
      setFinalSprint(true);
      playSfx("drumroll");
    }

    const finishedWinners = next.filter((r) => r.rank !== null && winnerSetRef.current.has(r.name)).length;
    if (finishedWinners >= winnerSetRef.current.size && winnerSetRef.current.size > 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setRunners(next); // 스로틀로 놓친 마지막 프레임 확정 반영
      addT(setTimeout(() => setPhase("done"), 400)); // 마지막 당첨자 통과 직후 종료(일반 러너 뭉침 방지)
      return;
    }
    if (elapsed > endGuardRef.current) { // 안전 타임아웃(당첨수에 맞춰 동적)
      setPhase("done"); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return;
    }
    rafRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSfx, spawnShot, spawnBanana, spawnBoost]);

  const beginRace = useCallback((participantNames: string[], winners: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makeRunners(participantNames, participantNames.length, winners);
    if (winners.length <= 0 || winners.length >= scene.length) return; // 안전장치
    runnersRef.current = scene;
    winnerSetRef.current = new Set(winners.map((n) => String(n || "").trim()));
    rankCounterRef.current = 0;
    // 안전 종료: 마지막 당첨자 예상 통과 + 여유. (WIN_WINDOW = min(2.2, max(.5, K*.42)))
    const K = winners.length;
    endGuardRef.current = RACE_LEAD + Math.min(2.2, Math.max(0.5, K * 0.42)) + 2.5;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || winners.length)); setTitle(ttl || "🏁 루루동이 달리기 대회");
    setNames(participantNames); setWinnerOrder(winners); setRunners(scene);
    setFinishedRanks([]); setHasEvent(true);
    setLeader(""); setFinalSprint(false); sprintFiredRef.current = false;
    setItems([]); bumpRef.current = {}; offRef.current = {}; hitUntilRef.current = {}; fallUntilRef.current = {};
    shotsRef.current = []; bananasRef.current = []; puffsRef.current = [];
    nextShotRef.current = 0; nextBananaRef.current = 0; nextBoostRef.current = 0;
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

  // 레인 없음(마라톤 무리). 인원 많을수록 졸라맨 작게. 이름은 선두 소수 + 당첨자만.
  const figSize = total <= 16 ? 32 : total <= 35 ? 24 : total <= 60 ? 18 : total <= 90 ? 15 : 13;
  const running = phase === "running";
  // [2026-07-26 사장님] 스포일러 방지: 경주 중엔 이름표·금색 없음(누가 이길지 모르게).
  //   결승선을 통과(rank 배정)한 러너만 그 순간 금색 이름표+등수 표시 → 통과=당첨이 자연스럽게 공개.
  //   현재 선두는 상단 HUD "현재 1위 OOO"로만 안내.

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh",
      position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-start",
      justifyContent: "center", background: "transparent", paddingTop: "1.5vh" }}>
      <style>{`
        @keyframes runBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes legF{0%{transform:rotate(38deg)}50%{transform:rotate(-32deg)}100%{transform:rotate(38deg)}}
        @keyframes legB{0%{transform:rotate(-32deg)}50%{transform:rotate(38deg)}100%{transform:rotate(-32deg)}}
        @keyframes armF{0%{transform:rotate(-34deg)}50%{transform:rotate(30deg)}100%{transform:rotate(-34deg)}}
        @keyframes armB{0%{transform:rotate(30deg)}50%{transform:rotate(-34deg)}100%{transform:rotate(30deg)}}
        @keyframes countPop{0%{transform:scale(.3);opacity:0}40%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes tapeBreak{0%{opacity:1;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1.4)}}
        @keyframes medalPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
        @keyframes confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(340px) rotate(540deg);opacity:.9}}
        @keyframes winnerPanelIn{0%{transform:translateY(24px);opacity:0}100%{transform:translateY(0);opacity:1}}
        @keyframes dashFlow{to{background-position:0 -16px}}
        @keyframes flash{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes hitSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
        @keyframes fallSpin{0%{transform:rotate(0)}60%{transform:rotate(88deg) translateY(4px)}100%{transform:rotate(82deg) translateY(4px)}}
        @keyframes itemFloat{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}25%{transform:translate(-50%,-115%) scale(1.3);opacity:1}100%{transform:translate(-50%,-210%) scale(1);opacity:0}}
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
            {phase === "running" && (
              finalSprint
                ? <span style={{ fontSize: 15, fontWeight: 900, color: "#FF6B6B", textShadow: "0 1px 8px #000", animation: "flash .4s infinite" }}>🔥 마지막 스퍼트!! 🔥</span>
                : <span style={{ fontSize: 14, fontWeight: 900, color: GOLD, textShadow: "0 1px 8px #000" }}>🏃 현재 1위 <b style={{ color: "#fff" }}>{leader || "…"}</b></span>
            )}
            {done && <span style={{ fontSize: 15, fontWeight: 900, color: GOLD, textShadow: "0 2px 10px #000" }}>🎉 {winnerCount > 1 ? `${winnerCount}명 ` : ""}당첨 확정! 🎉</span>}
          </div>
        </div>

        {/* 결승선 줄 하나(체커보드) + 깃발 */}
        <div style={{ position: "absolute", left: `${FINISH_PCT}%`, top: `${TRACK_TOP - 3}%`, bottom: `${100 - TRACK_BOTTOM - 1}%`,
          width: 10, transform: "translateX(-50%)", zIndex: 20,
          backgroundImage: "repeating-conic-gradient(#fff 0% 25%, #111 0% 50%)", backgroundSize: "10px 10px",
          borderRadius: 2, boxShadow: "0 0 10px rgba(255,255,255,.35)" }} />
        <div style={{ position: "absolute", left: `${FINISH_PCT}%`, top: `${TRACK_TOP - 8}%`, transform: "translateX(-50%)",
          zIndex: 21, fontSize: 18 }}>🏁</div>
        {/* 출발선(왼쪽 옅은 줄) */}
        <div style={{ position: "absolute", left: "3.5%", top: `${TRACK_TOP - 1}%`, bottom: `${100 - TRACK_BOTTOM}%`,
          width: 2, background: "rgba(255,255,255,.25)", zIndex: 5 }} />

        {/* 러너 무리(마라톤) — 레인 없음. x=진행, y=고정 흩뿌림. 앞선 러너가 위로 겹침. */}
        {runners.map((r) => {
          const finished = r.rank !== null;           // 결승선 통과 = 당첨 확정(그때만 금색+등수)
          const left = START_PCT + (r.x / 100) * (FINISH_PCT - START_PCT);
          const z = finished ? 30 : 10 + Math.round(r.x / 3); // 앞설수록 위
          // 닉네임은 항상 표시(경주 중엔 중립색). 인원 많으면 작게.
          const nameFs = finished ? 11 : total <= 30 ? 9 : 8;
          return (
            <div key={r.id} style={{ position: "absolute", left: `${left}%`, top: `${r.y}%`,
              transform: "translate(-50%,-50%)", zIndex: z,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
              transition: "left .1s linear, top .1s linear" }}>
              <span style={{ fontSize: nameFs, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.2,
                color: finished ? "#231018" : "#fff",
                background: finished ? GOLD : "rgba(0,0,0,.5)",
                padding: finished ? "1px 7px" : "0px 4px", borderRadius: 6, marginBottom: 1,
                boxShadow: finished ? "0 2px 8px rgba(240,196,90,.5)" : "none",
                animation: finished ? "medalPop .35s ease" : "none" }}>
                {finished ? `${r.rank}등 ` : ""}{r.name}
              </span>
              <RunnerStick color={finished ? GOLD : r.color} running={running && !finished} size={figSize}
                finished={finished} hit={r.hit} fallen={r.fallen} />
            </div>
          );
        })}

        {/* 🎮 아이템 이펙트 — fly:날아가는 미사일 / ground:바닥 바나나 / puff:충돌·부스터 순간 */}
        {items.map((it) => {
          const left = START_PCT + (it.x / 100) * (FINISH_PCT - START_PCT);
          if (it.kind === "ground") {
            return (
              <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 30,
                fontSize: 17, pointerEvents: "none", transform: "translate(-50%,-50%)",
                filter: "drop-shadow(0 2px 2px rgba(0,0,0,.4))" }}>{it.emoji}</div>
            );
          }
          if (it.kind === "fly") {
            return (
              <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 34,
                fontSize: 19, pointerEvents: "none", transform: "translate(-50%,-50%)",
                filter: "drop-shadow(0 0 5px rgba(255,180,60,.9))" }}>{it.emoji}</div>
            );
          }
          // puff: 충돌/부스터 순간 이펙트 — 떴다 사라짐
          return (
            <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 35,
              fontSize: 21, pointerEvents: "none", animation: "itemFloat .75s ease-out forwards" }}>{it.emoji}</div>
          );
        })}

        {/* 참가 인원 표시(무리 규모) */}
        {(phase === "ready" || running) && (
          <div style={{ position: "absolute", right: "5%", bottom: "3%", zIndex: 41, pointerEvents: "none",
            fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.75)", textShadow: "0 1px 6px #000" }}>
            🏃 {total}명 참가
          </div>
        )}

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
