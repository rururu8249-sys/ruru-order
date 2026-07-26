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
  y: number;          // 세로 위치(%) — 무리(crowd) 흩뿌림. 레인 없음(마라톤 방식).
  color: string;
  role: "win" | "lose"; // 당첨자(결승 통과)/일반(통과 못 함)
  crossTime: number;  // 초 — 당첨자가 결승선을 '끊는' 시각(순서대로 → 통과 순서 보존). 일반=Infinity.
  lungeDur: number;   // 결승 런지 길이(초) — 러너마다 달라 통과 방식 제각각(멀리서 길게/코앞서 툭).
  lungePow: number;   // 런지 가속 지수(러너마다 달라)
  sprintB: number;    // 마지막 스퍼트 가속 배율(러너마다 달라 — 어떤 당첨자는 확 치고 나옴)
  spd: number;        // 기본 전진 속도(%/s)
  amp: number;        // 속도 진동 진폭(0~1) — 러너끼리 앞서거니 뒤서거니(엎치락뒤치락). 속도만 흔들어 절대 뒤로 안 감.
  w: number;          // 속도 진동 각속도
  phase: number;      // 속도 진동 위상(러너마다 달라 leapfrog)
  bx: number;         // 적분된 기본 위치(아이템 전) — 매 프레임 전진 누적.
  x: number;          // 화면 표시 위치 0~100 (아이템 반영, 100=결승선).
  lunge: { x0: number; t0: number; dur: number; pow: number } | null; // 결승 런지 상태(당첨자만)
  rank: number | null;
  hit: boolean;       // 아이템 맞아 뱅글뱅글(카트라이더) 상태
  fallen: boolean;    // 넘어짐 상태
};

// 렌더용 이펙트 조각(매 프레임 refs에서 재구성). kind에 따라 표현 다름.
//   fly=날아가는 발사체(미사일), ground=바닥 아이템(바나나), puff=충돌/부스터 순간 이펙트
type ItemFx = { id: string; emoji: string; x: number; y: number; kind: "fly" | "ground" | "puff" | "boom" };
// 소스 오브젝트(refs 보관)
type Shot = { id: string; emoji: string; fromX: number; fromY: number; toX: number; toY: number; targetId: number; born: number; dur: number; resolved: boolean; clutch?: boolean };
type Banana = { id: string; x: number; y: number; born: number; consumed: boolean };
type Puff = { id: string; emoji: string; x: number; y: number; born: number; big?: boolean };

const TRACK_TOP = 24;    // % — HUD 아래
const TRACK_BOTTOM = 94; // %
const FINISH_PCT = 88;   // 결승선 화면 위치(%). x=100이 여기에 매핑됨.
const START_PCT = 4;
const RACE_LEAD = 8.0;   // 첫 당첨자 결승선 통과 시각(초) — 게임 길이 기준(카운트다운 별도)
const SPRINT = 5.8;      // 마지막 스퍼트 시작(초) — 선두 무리가 결승선 코앞까지 몰려가 난투극
const LOSE_CAP = 95;     // 일반 러너 진행 상한(%) — 결승선(100) 코앞까지 갔다가 못 넘음(덴탈 대상).
const WIN_CAP = 92;      // 당첨자 런지 전 상한(%) — 결승선 바로 앞에 붙음 → 런지 짧아져 '후다닥' 안 됨
const MAXBACK = 3.0;     // 한 프레임 최대 뒤로 이동(%) — 아이템 넉백이 순간이동식으로 튀지 않게(부드러운 스텀블)

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

  // [2026-07-26 재설계] 엎치락뒤치락 + 결승선 역전 연출.
  //   ▸ 위치는 매 프레임 "속도"를 적분해 전진(animate). 속도만 진동(amp/w/phase)시켜 서로 앞서거니 뒤서거니 →
  //     leapfrog(엎치락뒤치락). 속도는 항상 ≥0이라 절대 뒤로 안 감(옛 출렁임 버그 원인=위치에 sine 더한 것과 다름).
  //   ▸ 일반 러너: 빨리 치고 나가 선두 무리 형성(트랙 전체로 펼침), 상한 LOSE_CAP(<100)에서 결승선 못 넘음.
  //   ▸ 당첨자: 중상위권에 섞여 달리다, 지정 순서(crossTime) 되면 결승 런지로 앞 무리 제치고 통과 → 역전.
  //     crossTime이 gap 간격으로 순서대로라 통과 순서=서버 지정 순서 보존(런지 시간 동일 → 추월 불가).
  const K = winnerOrder.length;
  const WIN_WINDOW = Math.min(2.6, Math.max(0.9, K * 0.45)); // 당첨자 통과 총폭(포토피니시)
  const gap = Math.min(0.6, WIN_WINDOW / Math.max(1, K));    // 당첨자 간 통과 간격
  const spread = TRACK_BOTTOM - TRACK_TOP;
  return list.map((name, i) => {
    const wi = winIdx.has(name) ? (winIdx.get(name) as number) : -1;
    const amp = 0.5 + Math.random() * 0.35;      // 속도 진동 진폭 — 클수록 확확 치고 나감(<1이라 항상 전진)
    const w = 2.0 + Math.random() * 2.2;         // 진동 각속도
    const phase = Math.random() * Math.PI * 2;   // 위상(러너마다 달라 leapfrog)
    if (wi >= 0) {
      return {
        id: i, name, role: "win" as const,
        crossTime: RACE_LEAD + wi * gap + Math.random() * 0.12, // 결승선 끊는 시각(순서 보존 + 약간 랜덤)
        lungeDur: 0.45 + Math.random() * 0.5,     // 통과 방식 제각각: 멀리서 길게(큰값)/코앞서 툭(작은값)
        lungePow: 1.2 + Math.random() * 0.7,      // 가속 지수도 제각각
        sprintB: 1.8 + Math.random() * 1.6,       // 스퍼트 가속 제각각(어떤 당첨자는 확 치고 나옴)
        spd: 8.0 + Math.random() * 2.0,           // 당첨자: 중상위권 속도
        amp, w, phase, color: runnerColor(i),
        y: TRACK_TOP + spread * (0.16 + Math.random() * 0.68),
        bx: 0, x: 0, lunge: null, rank: null, hit: false, fallen: false,
      };
    }
    return {
      id: i, name, role: "lose" as const,
      crossTime: Infinity, lungeDur: 0, lungePow: 1,
      sprintB: 1.4 + Math.random() * 0.7,         // 일반도 스퍼트엔 결승선으로 몰림(선두 무리 형성)
      spd: 6.5 + Math.random() * 5.0,             // 빠른 러너는 선두, 느린 러너는 후미(펼침)
      amp, w, phase, color: runnerColor(i),
      y: TRACK_TOP + spread * Math.random(),
      bx: 0, x: 0, lunge: null, rank: null, hit: false, fallen: false,
    };
  });
}

// 달리는 졸라맨 — 앞으로 기운 몸통 + 팔다리가 크게 교차하는 러닝 사이클(관절 회전).
//   hit=아이템 맞아 뱅글뱅글 / fallen=넘어져 나뒹굼(카트라이더 반칙 연출).
function RunnerStick({ color, running, size, finished, hit, fallen }: { color: string; running: boolean; size: number; finished: boolean; hit: boolean; fallen: boolean }) {
  const jointArm = { transformBox: "fill-box" as const, transformOrigin: "left center" };
  const jointLeg = { transformBox: "fill-box" as const, transformOrigin: "left top" };
  // 넘어짐: 뒤로 벌러덩 자빠져 드러눕고 그대로 유지(forwards). 맞음: 계속 뱅글뱅글.
  const bodyAnim = fallen ? "wipeout .45s ease-out forwards" : hit ? "hitSpin .4s linear infinite" : running ? "runBob .24s ease-in-out infinite" : "none";
  const limbsRun = running && !hit && !fallen; // 맞거나 넘어지면 팔다리 러닝 멈춤
  const emph = fallen || hit ? 1.35 : 1; // 사고 난 러너는 크게 → 눈에 확 띔
  return (
    <svg width={size * emph} height={size * 1.25 * emph} viewBox="0 0 30 34" style={{ overflow: "visible" }}>
      {fallen && <text x="17" y="-3" textAnchor="middle" fontSize="17" style={{ animation: "starSpin .5s linear infinite" }}>💫</text>}
      {hit && !fallen && <text x="17" y="-4" textAnchor="middle" fontSize="15" style={{ animation: "starSpin .4s linear infinite" }}>😵‍💫</text>}
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
  const [shaking, setShaking] = useState(false);    // 큰 충돌 시 화면 흔들림
  const shakingRef = useRef(false);
  const sprintFiredRef = useRef(false);
  const nextClutchRef = useRef(0);      // 결승선 덴탈(선두 비당첨자 미사일) 다음 발사 시각
  const lastCrossRef = useRef(RACE_LEAD); // 마지막 당첨자 통과 예정 시각(덴탈/종료 창)
  const lastElapsedRef = useRef(0);     // 직전 프레임 경과시간 — 속도 적분용 dt
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
    setLeader(""); setFinalSprint(false); sprintFiredRef.current = false; nextClutchRef.current = 0; lastElapsedRef.current = 0;
    setShaking(false); shakingRef.current = false;
    setItems([]); bumpRef.current = {}; offRef.current = {}; hitUntilRef.current = {}; fallUntilRef.current = {};
    shotsRef.current = []; bananasRef.current = []; puffsRef.current = [];
    nextShotRef.current = 0; nextBananaRef.current = 0; nextBoostRef.current = 0;
  }, []);

  const nid = () => `fx${idSeqRef.current++}`;
  // 큰 충돌 시 화면 흔들림(중복 방지). 결승 clutch·선두 와이프아웃에만.
  const triggerShake = () => {
    if (shakingRef.current) return;
    shakingRef.current = true; setShaking(true);
    addT(setTimeout(() => { shakingRef.current = false; setShaking(false); }, 320));
  };
  const BOOMS = ["꽝!", "펑!", "쿵!", "퍽!"];

  // 🚀 미사일 발사 — 뒷사람이 앞사람(선두권)에게 발사. 날아가서 맞으면 뱅글/넘어짐 + 감속.
  const spawnShot = useCallback((now: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null && !r.lunge);
    if (alive.length < 5) return;
    // 표적은 '선두 무리'(상위 6명) — 시청자 눈이 보는 곳에서 사고가 나야 극적임.
    const leaders = [...alive].sort((a, b) => b.x - a.x).slice(0, Math.min(6, alive.length));
    const target = leaders[Math.floor(Math.random() * leaders.length)];
    const behind = alive.filter((r) => r.x < target.x - 3 && r.id !== target.id);
    const attacker = behind.length ? behind[Math.floor(Math.random() * behind.length)] : alive[Math.floor(Math.random() * alive.length)];
    if (!attacker || attacker.id === target.id) return;
    shotsRef.current.push({ id: nid(), emoji: "☄️", fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, targetId: target.id, born: now, dur: 340, resolved: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🎯 지정 대상 미사일(결승 clutch용) — 대상 뒤 러너가 발사. 선두(비당첨)에게 꽂아 1등 뺏김 연출.
  const spawnShotAt = useCallback((now: number, target: Runner, dur: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null && !r.lunge && r.id !== target.id);
    const behind = alive.filter((r) => r.x < target.x);
    const attacker = behind.length ? behind[Math.floor(Math.random() * behind.length)] : (alive.length ? alive[Math.floor(Math.random() * alive.length)] : null);
    const fromX = attacker ? attacker.x : Math.max(2, target.x - 18);
    const fromY = attacker ? attacker.y : target.y;
    shotsRef.current.push({ id: nid(), emoji: "☄️", fromX, fromY, toX: target.x, toY: target.y, targetId: target.id, born: now, dur, resolved: false, clutch: true });
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
    const dt = Math.min(0.05, Math.max(0, elapsed - lastElapsedRef.current)); // 탭 비활성 등 큰 점프 방지
    lastElapsedRef.current = elapsed;

    // 아이템 스케줄(마지막 스퍼트 전까지 — 스퍼트 구간은 결승선 덴탈이 담당). 자주 터져 시끌시끌.
    const itemWindow = elapsed > 0.8 && elapsed < SPRINT;
    if (itemWindow) {
      if (elapsed > nextShotRef.current) { spawnShot(now); nextShotRef.current = elapsed + 0.45 + Math.random() * 0.5; }
      if (elapsed > nextBananaRef.current) { spawnBanana(now); nextBananaRef.current = elapsed + 0.8 + Math.random() * 0.8; }
      if (elapsed > nextBoostRef.current) { spawnBoost(now); nextBoostRef.current = elapsed + 1.0 + Math.random() * 1.0; }
    }

    // 🎯 결승선 덴탈: 스퍼트 동안 결승선 코앞(x>78) 선두 비당첨자에게 미사일 반복 발사 →
    //    "1등 눈앞에서 자빠지고 뒤에서 당첨자가 통과"가 결승선에서 계속 벌어짐(반전의 반전).
    if (elapsed > SPRINT + 0.3 && elapsed < lastCrossRef.current + 0.1 && elapsed > nextClutchRef.current) {
      const lead = runnersRef.current
        .filter((r) => r.role === "lose" && r.rank === null && !r.lunge && r.x > 78)
        .sort((a, b) => b.x - a.x)[0];
      if (lead) spawnShotAt(now, lead, 200);
      nextClutchRef.current = elapsed + 0.34 + Math.random() * 0.15;
    }

    // 미사일 도착 처리: 명중 → 대상 뱅글/넘어짐 + 감속 + 💥 (clutch는 더 세게)
    for (const s of shotsRef.current) {
      if (!s.resolved && now >= s.born + s.dur) {
        s.resolved = true;
        const tgt = runnersRef.current.find((r) => r.id === s.targetId && r.rank === null && !r.lunge);
        if (tgt) {
          const mag = s.clutch ? (10 + Math.random() * 6) : (5 + Math.random() * 5);
          bumpRef.current[tgt.id] = (bumpRef.current[tgt.id] || 0) - mag;
          const fall = s.clutch ? true : Math.random() < 0.55; // clutch는 무조건 자빠짐(1등 뺏김)
          if (fall) {
            fallUntilRef.current[tgt.id] = now + 850;         // 넘어져 드러눕고 그동안 정지 → 제쳐짐
            puffsRef.current.push({ id: nid(), emoji: "💥", x: s.toX, y: s.toY, born: now });
            puffsRef.current.push({ id: nid(), emoji: BOOMS[Math.floor(Math.random() * BOOMS.length)], x: s.toX, y: s.toY, born: now, big: true });
            triggerShake();
          } else {
            hitUntilRef.current[tgt.id] = now + 620;
            puffsRef.current.push({ id: nid(), emoji: "💥", x: s.toX, y: s.toY, born: now });
          }
        }
      }
    }
    // 오래된 것 정리
    shotsRef.current = shotsRef.current.filter((s) => now - s.born < s.dur + 120);
    bananasRef.current = bananasRef.current.filter((b) => !b.consumed && now - b.born < 6000);
    puffsRef.current = puffsRef.current.filter((p) => now - p.born < 750);

    // ── 러너 갱신(refs 직접 갱신 — 속도 적분 상태 유지). React 렌더는 아래 스로틀에서 복제 반영.
    for (const r of runnersRef.current) {
      if (r.rank !== null) continue;
      // (1) 결승 런지: crossTime-lungeDur에 돌입해 crossTime에 결승선(100) 통과. 통과 '시각'이 순서대로라
      //     런지 길이/가속이 러너마다 달라도(멀리서 길게/코앞서 툭) 통과 순서=서버 지정 순서 100% 보존.
      if (r.role === "win" && !r.lunge && elapsed >= r.crossTime - r.lungeDur) {
        r.lunge = { x0: r.x, t0: elapsed, dur: Math.max(0.15, r.crossTime - elapsed), pow: r.lungePow };
      }
      if (r.lunge) {
        const p = Math.min(1, (elapsed - r.lunge.t0) / r.lunge.dur);
        r.x = r.lunge.x0 + (100 - r.lunge.x0) * Math.pow(p, r.lunge.pow); // 러너별 제각각 대시
        r.hit = false; r.fallen = false;
        if (p >= 1) {
          r.x = 100;
          rankCounterRef.current += 1;
          const rank = rankCounterRef.current;
          r.rank = rank;
          if (winnerSetRef.current.has(r.name)) {
            setFinishedRanks((prev) => [...prev, { name: r.name, rank, color: GOLD }]);
            playSfx("finish");
          }
        }
        continue;
      }
      // (2) 속도 적분(항상 전진). 속도만 진동 → 서로 앞서거니 뒤서거니(엎치락뒤치락). 절대 뒤로 안 감.
      //     ★맞으면 실제로 멈춤/느려짐 → 제쳐짐(손해가 눈에 보임). 당첨자는 crossTime 런지로 통과라 순서 무관.
      let v = r.spd * (1 + r.amp * Math.sin(r.w * elapsed + r.phase));
      if (v < 0) v = 0;
      if (elapsed > SPRINT) v *= r.sprintB; // 마지막 스퍼트: 선두 무리가 결승선 코앞까지 몰림(런지 짧아짐)
      const isDown = now < (fallUntilRef.current[r.id] || 0);
      const isHit = !isDown && now < (hitUntilRef.current[r.id] || 0);
      if (isDown) v = 0;          // 쓰러진 동안 완전 정지(드러누움)
      else if (isHit) v *= 0.3;   // 맞고 비틀 — 크게 느려짐
      r.bx += v * dt;
      const cap = r.role === "win" ? WIN_CAP : LOSE_CAP;
      if (r.bx > cap) r.bx = cap;
      // (3) 아이템 오프셋(부드럽게 추격 → 순간이동 방지) + 한 프레임 최대 뒤로 제한
      let bump = bumpRef.current[r.id] || 0;
      bump *= 0.93;
      if (Math.abs(bump) < 0.15) bump = 0;
      bumpRef.current[r.id] = bump;
      let off = offRef.current[r.id] || 0;
      off += (bump - off) * 0.25;
      if (Math.abs(off) < 0.05) off = 0;
      offRef.current[r.id] = off;
      let vis = r.bx + off;
      if (vis > cap) vis = cap;
      if (vis < 0) vis = 0;
      if (vis < r.x - MAXBACK) vis = r.x - MAXBACK; // 넉백은 스텀블로(순간이동 금지)
      // (4) 바나나 스윕 충돌: 두 프레임 사이에 지나쳤으면 반드시 밟힘(빠르게 지나가도 안 놓침)
      for (const b of bananasRef.current) {
        if (b.consumed) continue;
        const crossed = (r.x <= b.x && vis >= b.x) || Math.abs(vis - b.x) < 2.6;
        if (crossed && Math.abs(r.y - b.y) < 7) {
          b.consumed = true;
          bumpRef.current[r.id] = (bumpRef.current[r.id] || 0) - (4 + Math.random() * 4);
          hitUntilRef.current[r.id] = now + 550;
          puffsRef.current.push({ id: nid(), emoji: "💫", x: b.x, y: b.y, born: now });
        }
      }
      r.x = vis;
      r.fallen = now < (fallUntilRef.current[r.id] || 0);
      r.hit = !r.fallen && now < (hitUntilRef.current[r.id] || 0);
    }
    const next = runnersRef.current;
    // 렌더는 ≈30fps로 스로틀(100명도 부드럽게). 복제 배열로 setState → React 리렌더.
    if (now - lastRenderRef.current > 32) {
      lastRenderRef.current = now;
      setRunners(next.map((r) => ({ ...r })));
      // 이펙트 조각 재구성: 날아가는 미사일(보간 위치)·바닥 바나나·순간 이펙트
      const fx: ItemFx[] = [];
      for (const s of shotsRef.current) {
        const p = Math.min(1, (now - s.born) / s.dur);
        fx.push({ id: s.id, emoji: s.emoji, x: s.fromX + (s.toX - s.fromX) * p, y: s.fromY + (s.toY - s.fromY) * p, kind: "fly" });
      }
      for (const b of bananasRef.current) if (!b.consumed) fx.push({ id: b.id, emoji: "🍌", x: b.x, y: b.y, kind: "ground" });
      for (const p of puffsRef.current) fx.push({ id: p.id, emoji: p.emoji, x: p.x, y: p.y, kind: p.big ? "boom" : "puff" });
      setItems(fx);
    }

    // 실시간 선두(결승 전 러너 중 가장 앞) — 같은 값이면 React가 리렌더 생략
    let lead = ""; let leadX = -1;
    for (const r of next) { if (r.rank === null && r.x > leadX) { leadX = r.x; lead = r.name; } }
    if (lead) setLeader(lead);

    // 마지막 스퍼트: 첫 당첨자 통과 ~1.6초 전부터 드럼롤 + HUD (1회)
    if (!sprintFiredRef.current && elapsed > SPRINT) {
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
  }, [playSfx, spawnShot, spawnShotAt, spawnBanana, spawnBoost]);

  const beginRace = useCallback((participantNames: string[], winners: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makeRunners(participantNames, participantNames.length, winners);
    if (winners.length <= 0 || winners.length >= scene.length) return; // 안전장치
    runnersRef.current = scene;
    winnerSetRef.current = new Set(winners.map((n) => String(n || "").trim()));
    rankCounterRef.current = 0;
    // 마지막 당첨자 통과 예정 시각(WIN_WINDOW = min(2.6, max(.9, K*.45)), gap 동일) + 안전 종료 여유.
    const K = winners.length;
    const WIN_WINDOW = Math.min(2.6, Math.max(0.9, K * 0.45));
    const gap = Math.min(0.6, WIN_WINDOW / Math.max(1, K));
    lastCrossRef.current = RACE_LEAD + (K - 1) * gap + 0.12;
    endGuardRef.current = lastCrossRef.current + 2.0;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || winners.length)); setTitle(ttl || "🏁 루루동이 달리기 대회");
    setNames(participantNames); setWinnerOrder(winners); setRunners(scene);
    setFinishedRanks([]); setHasEvent(true);
    setLeader(""); setFinalSprint(false); sprintFiredRef.current = false; nextClutchRef.current = 0; lastElapsedRef.current = 0;
    setShaking(false); shakingRef.current = false;
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

  // 레인 없음(마라톤 무리). 인원 많을수록 졸라맨 작게. 이름은 선두 소수 + 통과 당첨자만(글씨벽 방지).
  const figSize = total <= 16 ? 38 : total <= 35 ? 30 : total <= 60 ? 22 : total <= 90 ? 17 : 15;
  const running = phase === "running";
  // [2026-07-26 사장님] 닉네임 겹침 해소 + 대기 중 노출 방지: "달리는 중" 현재 선두 상위 N명만 이름표.
  //   출발 전(ready/countdown)엔 다들 출발선(x=0)이라 이름 안 뜸(대기 화면 스포일러/글씨벽 방지). 통과 당첨자는 항상.
  const NAME_TOP = 8;
  const leadNameSet = running
    ? new Set([...runners].filter((r) => r.rank === null).sort((a, b) => b.x - a.x).slice(0, NAME_TOP).map((r) => r.id))
    : new Set<number>();
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
        @keyframes wipeout{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-45deg) translateY(-6px)}55%{transform:rotate(-115deg) translateY(-1px)}80%{transform:rotate(-96deg) translateY(7px)}100%{transform:rotate(-90deg) translateY(7px)}}
        @keyframes starSpin{0%{transform:rotate(0) scale(1)}50%{transform:rotate(180deg) scale(1.2)}100%{transform:rotate(360deg) scale(1)}}
        @keyframes shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,-2px)}80%{transform:translate(3px,2px)}}
        @keyframes boomPop{0%{transform:translate(-50%,-50%) scale(.3) rotate(-8deg);opacity:0}30%{transform:translate(-50%,-50%) scale(1.35) rotate(4deg);opacity:1}70%{transform:translate(-50%,-70%) scale(1.1) rotate(-2deg);opacity:1}100%{transform:translate(-50%,-120%) scale(.9);opacity:0}}
        @keyframes itemFloat{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}25%{transform:translate(-50%,-115%) scale(1.3);opacity:1}100%{transform:translate(-50%,-210%) scale(1);opacity:0}}
      `}</style>

      {/* 위젯 크기·배치: 서바이벌과 동일(상단 63vh, 하단 채팅 자리 투명). PC 가로상한. */}
      <div ref={stageRef} style={{ position: "relative", width: "min(96vw, 105vh)", height: "63vh",
        borderRadius: 20, overflow: "hidden",
        background: "linear-gradient(180deg,rgba(18,20,32,.62),rgba(30,34,52,.62))",
        border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 12px 40px rgba(0,0,0,.4)",
        animation: shaking ? "shake .32s ease-in-out" : "none" }}>

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
          // 이름표: 통과 당첨자(금색) + 현재 선두 상위 N명만 → 60명도 글씨벽 안 생김.
          const showName = finished || leadNameSet.has(r.id);
          const nameFs = finished ? 11 : total <= 30 ? 10 : 9;
          return (
            <div key={r.id} style={{ position: "absolute", left: `${left}%`, top: `${r.y}%`,
              transform: "translate(-50%,-50%)", zIndex: z,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
              transition: "left .09s linear, top .12s linear" }}>
              {showName && (
                <span style={{ fontSize: nameFs, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.2,
                  color: finished ? "#231018" : "#fff",
                  background: finished ? GOLD : "rgba(0,0,0,.55)",
                  padding: finished ? "1px 7px" : "0px 5px", borderRadius: 6, marginBottom: 1,
                  boxShadow: finished ? "0 2px 8px rgba(240,196,90,.5)" : "none",
                  animation: finished ? "medalPop .35s ease" : "none" }}>
                  {finished ? `${r.rank}등 ` : ""}{r.name}
                </span>
              )}
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
                fontSize: 19, pointerEvents: "none", transform: "translate(-50%,-50%)",
                filter: "drop-shadow(0 2px 2px rgba(0,0,0,.45))" }}>{it.emoji}</div>
            );
          }
          if (it.kind === "fly") {
            // 미사일: 큰 이모지 + 뒤로 끌리는 불꼬리(속도감).
            return (
              <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 34,
                pointerEvents: "none", transform: "translate(-50%,-50%)" }}>
                <div style={{ position: "absolute", right: "48%", top: "50%", transform: "translateY(-50%)",
                  width: 44, height: 6, borderRadius: 4, filter: "blur(1.2px)",
                  background: "linear-gradient(90deg, rgba(255,150,30,0) 0%, rgba(255,120,40,.55) 55%, rgba(255,220,120,.95) 100%)" }} />
                <div style={{ fontSize: 25, filter: "drop-shadow(0 0 8px rgba(255,160,40,1))" }}>{it.emoji}</div>
              </div>
            );
          }
          if (it.kind === "boom") {
            // 큰 충돌 온오마토페("꽝!") — 노란 굵은 글씨가 팡 튀어오름
            return (
              <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 38,
                fontSize: 30, fontWeight: 900, color: "#FFD21E", pointerEvents: "none", letterSpacing: "-1px",
                textShadow: "1.5px 1.5px 0 #7a1f00,-1.5px 1.5px 0 #7a1f00,1.5px -1.5px 0 #7a1f00,-1.5px -1.5px 0 #7a1f00,0 3px 8px rgba(0,0,0,.6)",
                animation: "boomPop .7s ease-out forwards" }}>{it.emoji}</div>
            );
          }
          // puff: 충돌/부스터 순간 이펙트 — 크게 떴다 사라짐
          return (
            <div key={it.id} style={{ position: "absolute", left: `${left}%`, top: `${it.y}%`, zIndex: 35,
              fontSize: 26, pointerEvents: "none", animation: "itemFloat .75s ease-out forwards" }}>{it.emoji}</div>
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
