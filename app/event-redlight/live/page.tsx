"use client";

// 무궁화 꽃이 피었습니다(오징어게임) OBS 위젯 (투명 배경, 읽기 전용).
//   - 참가자 전원이 '초록 트레이닝복 졸라맨'으로 출발선에 서고, 저편에 거대한 영희 인형.
//   - 초록불(영희가 등 돌리고 "무궁화 꽃이 피었습니다"): 다 같이 전진.
//   - 빨간불(영희가 홱 돌아봄, 눈 번쩍): 전원 정지. 이때 '비당첨자'가 움직였다 걸려서 탈락(탕!+쓰러짐).
//   - 서버가 확정한 당첨자(survivor_nicknames) K명만 절대 안 걸리고 살아남아 결승선 통과 = 당첨.
//     (서바이벌·달리기와 동일한 event_roulette_events 엔진 재사용 — 추첨/포인트 로직은 서버가 담당)
//   - 크기·채팅 안전 배치는 다른 위젯과 동일(상단 63vh, 하단은 채팅 자리로 투명).
//   - 돈/포인트 로직 없음. OBS 브라우저 소스로 사용. ?blood=0 이면 유혈 연출 끔(광고 안전용).
import React, { useCallback, useEffect, useRef, useState } from "react";

const GOLD = "#F0C45A";
const ROSE = "#7B2D43";
const TOKEN = "redlight_luludongi_live"; // 공개 오버레이 API 고정 토큰
const DOLL_DRESS = "#E8632A";   // 영희 주황 원피스
const DOLL_SHIRT = "#F2C94C";   // 노란 셔츠
const DOLL_HAIR = "#241a12";    // 양갈래 머리(진갈색)
const DOLL_SKIN = "#F6CDA0";
const DOLL_TIE = "#c0392b";     // 머리끈/리본
const DOLL_SOCK = "#F4E9D8";
const GUARD_SUIT = "#D83B57";   // 진행요원 빨간 점프수트(오리지널)
const GUARD_MASK = "#171717";
const EYE_X = 50;               // 영희 눈 화면 x(%) — 레이저 출발점
const EYE_Y = 16;               // 영희 눈 화면 y(%)

// 초록 트레이닝복 색 — 오징어게임 청록빛 초록, 살짝씩 톤 다르게(구분).
function suitColor(i: number): string {
  const h = 158 + (i % 5) * 5;          // 158~178 (초록~청록)
  const s = 46 + (i % 3) * 10;          // 채도
  const l = 34 + (i % 4) * 6;           // 명도
  return `hsl(${h}, ${s}%, ${l}%)`;
}

const FRONT = ["꽃님", "봄날", "행복", "예쁜", "루루", "하늘", "달콤", "사랑", "미소", "햇살",
  "바다", "노을", "향기", "구름", "달빛", "새록", "포근", "설렘", "단비", "온유",
  "고운", "초록", "은하", "다온", "여울", "가온", "라온", "하율", "소담", "윤슬"];
const BACK = ["맘", "님", "언니", "여사", "공주", "이", "네", "댁", "홀릭", "러버", "데이", "가든"];

type PState = "run" | "frozen" | "caught" | "done";
type Player = {
  id: number;
  num: number;        // 가슴 번호(오징어게임 느낌)
  name: string;
  color: string;      // 트레이닝복 색
  y: number;          // 세로 위치(%)
  x: number;          // 진행 0~100 (100=결승선/영희)
  role: "win" | "lose";
  spd: number;        // 초록불 전진 속도(%/s)
  elimRound: number;  // 걸릴 라운드(비당첨자만). 당첨자=Infinity
  crossGate: number;  // 결승 통과 허용 시각(당첨자, 순서 보존)
  state: PState;
  caughtT: number;    // 걸린 시각(연출 타이머)
  rank: number | null;
};
type Blood = { id: string; x: number; y: number; born: number; big: boolean };
type Beam = { id: string; tx: number; ty: number; born: number }; // 영희 눈 → 대상(화면 %) 레이저

// 원근(뒷모습) 뷰: 카메라가 참가자 뒤. 저 멀리(위) 영희, 가까이(아래) 출발선.
//   진행 x(0~100): 0=출발선(아래·크게), 100=영희 앞 결승선(위·작게).
const FAR_Y = 33;        // 결승선(영희 발치) 세로 %
const NEAR_Y = 91;       // 출발선(카메라 앞) 세로 %
const FAR_HALF = 13;     // 먼쪽 필드 반폭 %(원근으로 좁아짐)
const NEAR_HALF = 47;    // 가까운쪽 필드 반폭 %
const CAP_PRE = 94;      // 최종 라운드 전 진행 상한(결승선 코앞까지 갔다가 못 넘음)

// (진행 x, 레인 lane 0~1) → 화면 좌표 + 원근 스케일
function persp(x: number, lane: number) {
  const d = Math.min(1, Math.max(0, x / 100));
  const top = NEAR_Y - d * (NEAR_Y - FAR_Y);
  const half = NEAR_HALF * (1 - d) + FAR_HALF * d;
  const left = 50 + (lane - 0.5) * 2 * half;
  const scale = 1.0 * (1 - d) + 0.4 * d;
  return { left, top, scale, d };
}

function makePlayers(names: string[] | null, n: number, winnerOrder: string[]): Player[] {
  const list: string[] = [];
  if (names && names.length > 0) {
    for (const nm of names) list.push(String(nm || "").trim() || "고객");
  } else {
    const set = new Set<string>();
    let guard = 0;
    while (list.length < n && guard < 5000) {
      guard++;
      const nm = FRONT[Math.floor(Math.random() * FRONT.length)] + BACK[Math.floor(Math.random() * BACK.length)];
      if (set.has(nm)) continue;
      set.add(nm); list.push(nm);
    }
  }
  const winIdx = new Map<string, number>();
  winnerOrder.forEach((nm, i) => winIdx.set(String(nm || "").trim(), i));
  return list.map((name, i) => {
    const wi = winIdx.has(name) ? (winIdx.get(name) as number) : -1;
    return {
      id: i,
      num: (i % 456) + 1,            // 오징어게임식 번호(1~456 순환)
      name,
      color: suitColor(i),
      y: wi >= 0 ? 0.16 + Math.random() * 0.68 : Math.random(), // 가로 레인(0~1)
      x: 0,
      role: wi >= 0 ? "win" : "lose",
      spd: 11 + Math.random() * 7,   // 초록불 전진 속도(제각각 → 흩어짐, 운동장 끝까지 건넘)
      elimRound: wi >= 0 ? Infinity : -1, // 라운드 배정은 beginGame에서
      crossGate: 0,
      state: "frozen",
      caughtT: 0,
      rank: null,
    };
  });
}

// 👧 영희(오리지널) — 양갈래·앞머리·노란셔츠·주황 원피스·흰 무릎양말·검정 구두.
//   facing:'away'(초록불, 등 돌림 — 뒤통수) / 'watch'(빨간불, 정면 노려봄 — 눈 번쩍 + 스캔빔)
function YoungHee({ facing, size }: { facing: "away" | "watch"; size: number }) {
  const watch = facing === "watch";
  const w = size, h = size * 1.5;
  return (
    <div style={{ width: w, height: h, position: "relative", transition: "transform .26s ease", transformOrigin: "center 26%", transform: watch ? "rotateY(0deg)" : "rotateY(180deg)" }}>
      {/* 빨간불 스캔빔(정면일 때 아래로 붉은 부채꼴) */}
      {watch && (
        <div style={{ position: "absolute", left: "50%", top: "26%", width: w * 5.5, height: h * 3.2, transform: "translateX(-50%)", zIndex: -1, pointerEvents: "none",
          background: "conic-gradient(from 158deg at 50% 0, rgba(255,20,20,0) 0deg, rgba(255,30,30,.15) 22deg, rgba(255,30,30,0) 44deg)", animation: "eyeGlow 1s ease-in-out infinite" }} />
      )}
      <svg width={w} height={h} viewBox="0 0 200 300" style={{ overflow: "visible", display: "block" }}>
        {/* 다리/양말/구두 */}
        <rect x="80" y="238" width="15" height="42" rx="6" fill={DOLL_SOCK} />
        <rect x="105" y="238" width="15" height="42" rx="6" fill={DOLL_SOCK} />
        <ellipse cx="87" cy="286" rx="13" ry="8" fill="#1f1f1f" />
        <ellipse cx="113" cy="286" rx="13" ry="8" fill="#1f1f1f" />
        {/* 팔 */}
        <rect x="44" y="150" width="16" height="72" rx="8" fill={DOLL_SKIN} />
        <rect x="140" y="150" width="16" height="72" rx="8" fill={DOLL_SKIN} />
        {/* 노란 반팔 소매 */}
        <rect x="42" y="148" width="20" height="26" rx="8" fill={DOLL_SHIRT} />
        <rect x="138" y="148" width="20" height="26" rx="8" fill={DOLL_SHIRT} />
        {/* 주황 원피스(A라인) + 멜빵 */}
        <path d="M66 150 Q100 140 134 150 L156 244 L44 244 Z" fill={DOLL_DRESS} />
        <rect x="76" y="140" width="10" height="24" fill={DOLL_DRESS} />
        <rect x="114" y="140" width="10" height="24" fill={DOLL_DRESS} />
        {/* 목 */}
        <rect x="88" y="128" width="24" height="20" rx="4" fill={DOLL_SKIN} />
        {watch ? (
          <>
            {/* 노란 셔츠(가슴) */}
            <path d="M74 150 Q100 144 126 150 L124 174 L76 174 Z" fill={DOLL_SHIRT} />
            {/* 머리 */}
            <circle cx="100" cy="74" r="60" fill={DOLL_SKIN} />
            {/* 양갈래 */}
            <path d="M40 70 Q6 66 10 104 Q22 116 40 104 Z" fill={DOLL_HAIR} />
            <path d="M160 70 Q194 66 190 104 Q178 116 160 104 Z" fill={DOLL_HAIR} />
            <circle cx="30" cy="70" r="7" fill={DOLL_TIE} />
            <circle cx="170" cy="70" r="7" fill={DOLL_TIE} />
            {/* 앞머리(둥근 뱅) */}
            <path d="M44 60 Q100 8 156 60 Q150 30 100 26 Q50 30 44 60 Z" fill={DOLL_HAIR} />
            <path d="M44 58 Q100 44 156 58 L152 74 Q100 60 48 74 Z" fill={DOLL_HAIR} />
            {/* 눈(+빨간 번쩍 링) */}
            <circle cx="76" cy="82" r="11" fill="#141414" />
            <circle cx="124" cy="82" r="11" fill="#141414" />
            <circle cx="79" cy="78" r="3.4" fill="#fff" />
            <circle cx="127" cy="78" r="3.4" fill="#fff" />
            <circle cx="76" cy="82" r="15" fill="none" stroke="#ff2222" strokeWidth="3" opacity="0.85" style={{ animation: "eyeGlow .5s ease-in-out infinite" }} />
            <circle cx="124" cy="82" r="15" fill="none" stroke="#ff2222" strokeWidth="3" opacity="0.85" style={{ animation: "eyeGlow .5s ease-in-out infinite" }} />
            {/* 볼터치/입 */}
            <circle cx="58" cy="100" r="9" fill="#f39b9b" opacity="0.75" />
            <circle cx="142" cy="100" r="9" fill="#f39b9b" opacity="0.75" />
            <path d="M90 106 Q100 114 110 106" fill="none" stroke="#b5473f" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* 뒤통수(등 돌림) */}
            <circle cx="100" cy="74" r="60" fill={DOLL_HAIR} />
            <circle cx="100" cy="70" r="48" fill="#2e2116" />
            <path d="M40 70 Q6 66 10 104 Q22 116 40 104 Z" fill={DOLL_HAIR} />
            <path d="M160 70 Q194 66 190 104 Q178 116 160 104 Z" fill={DOLL_HAIR} />
            <circle cx="30" cy="70" r="7" fill={DOLL_TIE} />
            <circle cx="170" cy="70" r="7" fill={DOLL_TIE} />
            {/* 뒷머리 리본 */}
            <path d="M84 40 L100 52 L116 40 L108 64 L92 64 Z" fill={DOLL_TIE} />
          </>
        )}
      </svg>
    </div>
  );
}

// 🔴 진행요원(오리지널) — 빨간 점프수트 + 검은 마스크(심플, 특정 심볼 없음). 영희 양옆 경비.
function RedGuard({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 2.1} viewBox="0 0 40 84" style={{ overflow: "visible", display: "block" }}>
      {/* 다리 */}
      <rect x="13" y="52" width="6.5" height="28" rx="3" fill={GUARD_SUIT} />
      <rect x="20.5" y="52" width="6.5" height="28" rx="3" fill={GUARD_SUIT} />
      <ellipse cx="16" cy="81" rx="5" ry="2.6" fill="#111" />
      <ellipse cx="24" cy="81" rx="5" ry="2.6" fill="#111" />
      {/* 몸통(점프수트) */}
      <rect x="10" y="30" width="20" height="26" rx="6" fill={GUARD_SUIT} />
      {/* 벨트 */}
      <rect x="10" y="44" width="20" height="3" fill="#8a1f30" />
      {/* 팔 */}
      <rect x="4" y="31" width="6.5" height="22" rx="3.2" fill={GUARD_SUIT} />
      <rect x="29.5" y="31" width="6.5" height="22" rx="3.2" fill={GUARD_SUIT} />
      {/* 후드/마스크(검정) */}
      <path d="M8 20 Q20 6 32 20 L32 30 L8 30 Z" fill="#3a1620" />
      <ellipse cx="20" cy="22" rx="11" ry="12" fill={GUARD_MASK} />
      {/* 마스크 광택 */}
      <ellipse cx="16" cy="19" rx="3" ry="4.5" fill="#333" opacity="0.7" />
    </svg>
  );
}

// 🟩 초록 트레이닝복 졸라맨(뒷모습) — 등에 흰 번호패치(오징어게임 느낌).
//   state: run(달림)/frozen(정지)/caught(피격 넘어짐)/done(통과)
function SuitStick({ color, num, size, state, finished }: { color: string; num: number; size: number; state: PState; finished: boolean }) {
  const run = state === "run";
  const caught = state === "caught";
  const body = caught ? "wipeout .5s ease-out forwards" : run ? "runBob .26s ease-in-out infinite" : "none";
  const emph = caught ? 1.25 : 1;
  const c = finished ? GOLD : color;
  const dark = "#1c1710";
  return (
    <svg width={size * emph} height={size * 1.35 * emph} viewBox="0 0 30 38" style={{ overflow: "visible" }}>
      <g style={{ animation: body, transformBox: "fill-box", transformOrigin: "center bottom" }}>
        {/* 뒷머리(까만 머리) */}
        <circle cx="16" cy="6" r="4.6" fill={dark} />
        {/* 팔(뒤로 보이는 트레이닝복 소매) */}
        <line x1="13" y1="13" x2="8" y2="20" stroke={c} strokeWidth="3" strokeLinecap="round"
          style={{ transformBox: "fill-box", transformOrigin: "top", animation: run ? "armB .26s ease-in-out infinite" : "none" }} />
        <line x1="19" y1="13" x2="24" y2="20" stroke={c} strokeWidth="3" strokeLinecap="round"
          style={{ transformBox: "fill-box", transformOrigin: "top", animation: run ? "armF .26s ease-in-out infinite" : "none" }} />
        {/* 등(초록 트레이닝복 — 넓게) */}
        <rect x="11" y="10.5" width="10" height="14" rx="4" fill={c} />
        {/* 등번호 패치(흰 사각 + 번호) */}
        <rect x="12.6" y="14" width="6.8" height="6" rx="1.2" fill="#f4f4f4" />
        <text x="16" y="18.9" textAnchor="middle" fontSize="4.3" fontWeight="900" fill="#222">{num}</text>
        {/* 다리(트레이닝복 바지) */}
        <line x1="14" y1="24" x2="11" y2="35" stroke={c} strokeWidth="3.4" strokeLinecap="round"
          style={{ transformBox: "fill-box", transformOrigin: "top", animation: run ? "legB .26s ease-in-out infinite" : "none" }} />
        <line x1="18" y1="24" x2="21" y2="35" stroke={c} strokeWidth="3.4" strokeLinecap="round"
          style={{ transformBox: "fill-box", transformOrigin: "top", animation: run ? "legF .26s ease-in-out infinite" : "none" }} />
      </g>
      {finished && <text x="16" y="-2" textAnchor="middle" fontSize="13">🎉</text>}
    </svg>
  );
}

export default function RedLightWidget() {
  const [total, setTotal] = useState(20);
  const [winnerCount, setWinnerCount] = useState(1);
  const [title, setTitle] = useState("무궁화 꽃이 피었습니다");
  const [names, setNames] = useState<string[] | null>(null);
  const [winnerOrder, setWinnerOrder] = useState<string[]>([]);

  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState(false);
  const [hasEvent, setHasEvent] = useState(false);
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(null, 20, []));
  const [phase, setPhase] = useState<"ready" | "countdown" | "playing" | "done">("ready");
  const [countText, setCountText] = useState("");
  const [light, setLight] = useState<"green" | "red">("green");
  const [chant, setChant] = useState("");       // "무궁화 꽃이 피었습니다"
  const [aliveN, setAliveN] = useState(0);
  const [finishedRanks, setFinishedRanks] = useState<{ name: string; rank: number }[]>([]);
  const [bloods, setBloods] = useState<Blood[]>([]);
  const [beams, setBeams] = useState<Beam[]>([]);

  const bloodOnRef = useRef(true);
  const soundOnRef = useRef(true);
  const playersRef = useRef<Player[]>(players);
  useEffect(() => { playersRef.current = players; }, [players]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastElRef = useRef(0);
  const winnerSetRef = useRef<Set<string>>(new Set());
  const rankCounterRef = useRef(0);
  const bloodsRef = useRef<Blood[]>([]);
  const beamsRef = useRef<Beam[]>([]);
  const idSeqRef = useRef(0);
  const lastRenderRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addT = (t: ReturnType<typeof setTimeout>) => timers.current.push(t);
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  const lastEventKeyRef = useRef("");
  const firstLoadRef = useRef(true);
  const rosterKeyRef = useRef("");
  // 스케줄: 라운드별 초록/빨강 구간 + 탈락 시각/대상, 최종 초록, 통과 게이트, 종료.
  const schedRef = useRef<{
    rounds: { greenS: number; redS: number; redE: number; elimAt: number; elimIds: number[]; fired: number }[];
    finalGreenS: number; gameEnd: number; lightNow: "green" | "red"; chantNow: string;
  }>({ rounds: [], finalGreenS: 999, gameEnd: 999, lightNow: "green", chantNow: "" });

  const done = phase === "done";
  const nid = () => `b${idSeqRef.current++}`;

  // ── 효과음(합성): 초록불 챈트/빨간불 경보/탕(피격)/결승 팡파레. ?sound=0 끔.
  const audioCtxRef = useRef<AudioContext | null>(null);
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
  const playSfx = useCallback((kind: string, rate = 1) => {
    if (!soundOnRef.current) return;
    const ctx = ensureAudio(); if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
      if (kind === "beat") {
        // 챈트 박자(도돌이 목탁 느낌) — rate 빠를수록 긴박
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 660 * rate;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.14);
      } else if (kind === "turn") {
        // 영희 돌아봄 — 삐- 경보
        const o = ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(300, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + 0.18);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
        o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.42);
      } else if (kind === "shot") {
        // 탕! — 노이즈 버스트 + 저음 쿵
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
        src.connect(lp).connect(g).connect(out); src.start(t0);
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.4, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
        o.connect(g2).connect(out); o.start(t0); o.stop(t0 + 0.2);
      } else if (kind === "finish") {
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
          const g = ctx.createGain(); const ts = t0 + i * 0.1;
          g.gain.setValueAtTime(0.0001, ts); g.gain.linearRampToValueAtTime(0.3, ts + 0.02); g.gain.exponentialRampToValueAtTime(0.001, ts + 0.6);
          o.connect(g).connect(out); o.start(ts); o.stop(ts + 0.65);
        });
      }
    } catch { /* 무시 */ }
  }, []);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const q = new URLSearchParams(window.location.search);
    const isPreview = q.get("preview") === "1";
    setPreview(isPreview);
    soundOnRef.current = q.get("sound") !== "0";
    bloodOnRef.current = q.get("blood") !== "0";
    if (isPreview) {
      const t = Math.max(2, Math.min(60, Number(q.get("total")) || 16));
      const w = Math.max(1, Math.min(t - 1, Number(q.get("winners")) || 3));
      const demo = makePlayers(null, t, []);
      const nm = demo.map((r) => r.name);
      const shuffled = [...nm].sort(() => Math.random() - 0.5).slice(0, w);
      setTotal(t); setWinnerCount(w); setNames(nm); setWinnerOrder(shuffled);
      setPlayers(makePlayers(nm, t, shuffled)); setAliveN(t);
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showRoster = useCallback((participantNames: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makePlayers(participantNames, participantNames.length, []);
    playersRef.current = scene;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || 1)); setTitle(ttl || "무궁화 꽃이 피었습니다");
    setNames(participantNames); setWinnerOrder([]); setPlayers(scene); setAliveN(scene.length);
    setFinishedRanks([]); setPhase("ready"); setHasEvent(true); setCountText("");
    setLight("green"); setChant(""); setBloods([]); bloodsRef.current = []; setBeams([]); beamsRef.current = [];
  }, []);

  // 애니메이션 루프
  const animate = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const dt = Math.min(0.05, Math.max(0, elapsed - lastElRef.current));
    lastElRef.current = elapsed;
    const sc = schedRef.current;

    // 현재 빨강/초록 판정 + 챈트
    let red = false; let curChant = "무궁화 꽃이 피었습니다";
    for (const r of sc.rounds) { if (elapsed >= r.redS && elapsed < r.redE) { red = true; break; } }
    if (elapsed >= sc.finalGreenS) red = false;
    if (red) curChant = "얼음! ❄️";
    if (sc.lightNow !== (red ? "red" : "green")) {
      sc.lightNow = red ? "red" : "green";
      setLight(sc.lightNow);
      if (red) playSfx("turn");
    }
    if (sc.chantNow !== curChant) { sc.chantNow = curChant; setChant(curChant); }

    // 탈락 처리 — 빨간불 동안 영희 눈 레이저가 한 명씩 저격(스태거). 레이저 빔 + 탕 + 피.
    const ELIM_GAP = 0.17;
    for (const r of sc.rounds) {
      while (r.fired < r.elimIds.length && elapsed >= r.elimAt + r.fired * ELIM_GAP) {
        const id = r.elimIds[r.fired];
        r.fired += 1;
        const p = playersRef.current.find((q) => q.id === id);
        if (p && p.state !== "caught" && p.rank === null) {
          p.state = "caught"; p.caughtT = now;
          playSfx("shot");
          const pp = persp(p.x, p.y);
          beamsRef.current.push({ id: nid(), tx: pp.left, ty: pp.top - 3, born: now });
          if (bloodOnRef.current) {
            bloodsRef.current.push({ id: nid(), x: p.x, y: p.y, born: now, big: true });
            bloodsRef.current.push({ id: nid(), x: p.x - 2, y: p.y + 2, born: now, big: false });
          }
        }
      }
    }
    beamsRef.current = beamsRef.current.filter((b) => now - b.born < 240);

    // 러너 갱신
    const greenNow = !red;
    for (const p of playersRef.current) {
      if (p.rank !== null) continue;
      if (p.state === "caught") continue; // 걸린 사람은 그대로 쓰러져 있음
      // 최종 초록: 당첨자 통과
      if (elapsed >= sc.finalGreenS && p.role === "win") {
        p.state = "run";
        const gate = p.crossGate;
        const target = elapsed >= gate ? 100 : Math.min(CAP_PRE + 8, 96);
        p.x = Math.min(target, p.x + (18 + p.spd) * dt); // 결승 대시
        if (p.x >= 100) {
          p.x = 100; p.state = "done";
          rankCounterRef.current += 1; p.rank = rankCounterRef.current;
          if (winnerSetRef.current.has(p.name)) { setFinishedRanks((prev) => [...prev, { name: p.name, rank: p.rank as number }]); playSfx("finish"); }
        }
        continue;
      }
      // 라운드 진행 중: 초록불엔 전진(상한 CAP_PRE), 빨간불엔 정지
      if (greenNow) { p.state = "run"; p.x = Math.min(CAP_PRE, p.x + p.spd * dt); }
      else { p.state = "frozen"; }
    }

    // blood 정리
    bloodsRef.current = bloodsRef.current.filter((b) => now - b.born < 60000);

    // 렌더 스로틀 ≈30fps
    if (now - lastRenderRef.current > 32) {
      lastRenderRef.current = now;
      setPlayers(playersRef.current.map((p) => ({ ...p })));
      setBloods([...bloodsRef.current]);
      setBeams([...beamsRef.current]);
      const alive = playersRef.current.filter((p) => p.state !== "caught" && p.rank === null).length + playersRef.current.filter((p) => p.rank !== null).length;
      setAliveN(playersRef.current.filter((p) => p.state !== "caught").length);
    }

    // 종료 판정
    const crossed = playersRef.current.filter((p) => p.rank !== null && winnerSetRef.current.has(p.name)).length;
    if (crossed >= winnerSetRef.current.size && winnerSetRef.current.size > 0) {
      setPlayers(playersRef.current.map((p) => ({ ...p })));
      if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
      addT(setTimeout(() => setPhase("done"), 500));
      return;
    }
    if (elapsed > sc.gameEnd + 3) { setPhase("done"); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return; }
    rafRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSfx]);

  const beginGame = useCallback((participantNames: string[], winners: string[], k: number, ttl: string) => {
    clearAll();
    const scene = makePlayers(participantNames, participantNames.length, winners);
    if (winners.length <= 0 || winners.length >= scene.length) return;
    const winSet = new Set(winners.map((n) => String(n || "").trim()));
    winnerSetRef.current = winSet;
    rankCounterRef.current = 0;
    // 비당첨자 → 라운드 배정(라운드마다 골고루 탈락). 라운드 수 R.
    const losers = scene.filter((p) => p.role === "lose");
    const K = winners.length;
    const R = Math.min(6, Math.max(4, Math.ceil(losers.length / 8))); // 최소 4라운드(운동장 건너며 서서히 탈락)
    const shuffled = [...losers].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, idx) => { p.elimRound = idx % R; });
    // 당첨자 통과 게이트(순서 보존) — 최종 초록에서 순서대로.
    winners.forEach((nm) => { const p = scene.find((q) => q.name === String(nm || "").trim()); if (p) p.crossGate = 0; });
    // 스케줄 구성 — 빨간불 길이는 그 라운드 저격 인원에 맞춤(레이저가 한 명씩 쏠 시간).
    const rounds: { greenS: number; redS: number; redE: number; elimAt: number; elimIds: number[]; fired: number }[] = [];
    let t = 0;
    for (let r = 0; r < R; r++) {
      const greenDur = Math.max(1.4, 2.2 - r * 0.15); // 초록불(전진) — 갈수록 짧아져 긴박
      const elimIds = shuffled.filter((p) => p.elimRound === r).map((p) => p.id);
      const redDur = Math.max(1.3, 0.7 + elimIds.length * 0.17 + 0.35);
      const greenS = t; const redS = t + greenDur; const redE = redS + redDur;
      rounds.push({ greenS, redS, redE, elimAt: redS + 0.4, elimIds, fired: 0 });
      t = redE;
    }
    const finalGreenS = t + 0.2;
    const gap = Math.min(0.55, Math.max(0.25, 1.6 / Math.max(1, K)));
    winners.forEach((nm, i) => { const p = scene.find((q) => q.name === String(nm || "").trim()); if (p) p.crossGate = finalGreenS + i * gap; });
    const gameEnd = finalGreenS + (K - 1) * gap + 1.5;
    schedRef.current = { rounds, finalGreenS, gameEnd, lightNow: "green", chantNow: "" };

    playersRef.current = scene;
    setTotal(scene.length); setWinnerCount(Math.max(1, k || winners.length)); setTitle(ttl || "무궁화 꽃이 피었습니다");
    setNames(participantNames); setWinnerOrder(winners); setPlayers(scene); setAliveN(scene.length);
    setFinishedRanks([]); setHasEvent(true); setLight("green"); setChant(""); setBloods([]); bloodsRef.current = []; setBeams([]); beamsRef.current = [];
    // 카운트다운
    setPhase("countdown"); setCountText("3");
    addT(setTimeout(() => setCountText("2"), 650));
    addT(setTimeout(() => setCountText("1"), 1300));
    addT(setTimeout(() => setCountText("시작!"), 1950));
    addT(setTimeout(() => {
      setCountText(""); setPhase("playing");
      startTimeRef.current = performance.now(); lastElRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    }, 2600));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  const startPreview = useCallback(() => { ensureAudio(); if (!names) return; beginGame(names, winnerOrder, winnerCount, title); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, winnerOrder, winnerCount, title, beginGame]);
  const resetPreview = useCallback(() => {
    if (!names) return; const w = Math.max(1, winnerCount);
    const order = [...names].sort(() => Math.random() - 0.5).slice(0, w);
    setWinnerOrder(order); setPlayers(makePlayers(names, names.length, [])); setAliveN(names.length); setFinishedRanks([]); setPhase("ready"); setCountText(""); setLight("green"); setChant(""); setBloods([]); bloodsRef.current = []; setBeams([]); beamsRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, winnerCount]);

  // 챈트 박자음(초록불 동안 점점 빨라짐)
  useEffect(() => {
    if (phase !== "playing" || light !== "green") return;
    let alive = true; let gap = 360;
    const tick = () => { if (!alive) return; playSfx("beat", 360 / gap); gap = Math.max(150, gap * 0.9); addT(setTimeout(tick, gap)); };
    tick();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, light]);

  // 서버 폴링(실제 모드)
  useEffect(() => {
    if (!mounted || preview) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/event-redlight/overlay?token=${TOKEN}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive || !data?.ok || !data.event) return;
        const ev = data.event as { title?: string; status?: string; participants?: { nickname?: string }[]; survivors?: string[]; winner_count?: number; result_at?: string | null; updated_at?: string | null };
        const pNames = Array.isArray(ev.participants) ? ev.participants.map((p) => String(p?.nickname || "").trim()).filter(Boolean) : [];
        const wNames = Array.isArray(ev.survivors) ? ev.survivors.map((s) => String(s || "").trim()).filter(Boolean) : [];
        const ttl = String(ev.title || "무궁화 꽃이 피었습니다");
        if (ev.status !== "result") {
          firstLoadRef.current = false;
          if (phase !== "playing" && phase !== "countdown") {
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
        beginGame(pNames, wNames, Number(ev.winner_count || wNames.length), ttl);
      } catch { /* 재시도 */ }
    };
    void load();
    const t = setInterval(() => void load(), 2500);
    return () => { alive = false; clearInterval(t); };
  }, [mounted, preview, phase, showRoster, beginGame]);

  useEffect(() => () => { clearAll(); }, []);

  if (!mounted) return null;
  if (!preview && !hasEvent) return null;

  const figSize = total <= 16 ? 34 : total <= 35 ? 26 : total <= 60 ? 19 : total <= 90 ? 16 : 14;
  const playing = phase === "playing";
  // 이름표: 달리는 중 선두 상위 N명 + 통과 당첨자만(글씨벽 방지).
  const leadSet = playing ? new Set([...players].filter((p) => p.state !== "caught" && p.rank === null).sort((a, b) => b.x - a.x).slice(0, 8).map((p) => p.id)) : new Set<number>();

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-start", justifyContent: "center", background: "transparent", paddingTop: "1.5vh" }}>
      <style>{`
        @keyframes runBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes legF{0%{transform:rotate(38deg)}50%{transform:rotate(-32deg)}100%{transform:rotate(38deg)}}
        @keyframes legB{0%{transform:rotate(-32deg)}50%{transform:rotate(38deg)}100%{transform:rotate(-32deg)}}
        @keyframes armF{0%{transform:rotate(-34deg)}50%{transform:rotate(30deg)}100%{transform:rotate(-34deg)}}
        @keyframes armB{0%{transform:rotate(30deg)}50%{transform:rotate(-34deg)}100%{transform:rotate(30deg)}}
        @keyframes countPop{0%{transform:scale(.3);opacity:0}40%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes medalPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
        @keyframes confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(340px) rotate(540deg);opacity:.9}}
        @keyframes winnerPanelIn{0%{transform:translateY(24px);opacity:0}100%{transform:translateY(0);opacity:1}}
        @keyframes wipeout{0%{transform:rotate(0) translateY(0)}30%{transform:rotate(-55deg) translateY(-4px)}70%{transform:rotate(-98deg) translateY(6px)}100%{transform:rotate(-92deg) translateY(8px);opacity:.55}}
        @keyframes eyeGlow{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes chantPulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
        @keyframes iceFlash{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.92}50%{transform:translate(-50%,-50%) scale(1.12);opacity:1}}
      `}</style>

      <div style={{ position: "relative", width: "min(96vw, 105vh)", height: "63vh", borderRadius: 20, overflow: "hidden",
        background: "linear-gradient(180deg,#cdb890 0%,#c2a97e 55%,#b39a6c 100%)",
        border: "1px solid rgba(0,0,0,.18)", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>

        {/* 하늘/벽(위) */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${FAR_Y - 2}%`, background: "linear-gradient(180deg,#a9c7d6 0%,#c9d6cf 100%)", zIndex: 1 }} />
        {/* 원근 운동장(사다리꼴, 위로 좁아짐) */}
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "linear-gradient(180deg,#c8b48a 0%,#bda67a 60%,#a98f60 100%)",
          clipPath: `polygon(${50 - FAR_HALF - 2}% ${FAR_Y - 2}%, ${50 + FAR_HALF + 2}% ${FAR_Y - 2}%, ${50 + NEAR_HALF + 6}% 100%, ${50 - NEAR_HALF - 6}% 100%)` }} />

        {/* HUD — 제목 하나만(초록불 문구 겸용). 빨간불 "얼음!"은 아래 큰 배너로. */}
        <div style={{ position: "absolute", top: 8, left: 0, right: 0, textAlign: "center", zIndex: 40, pointerEvents: "none", padding: "0 8px" }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: "#3b2a12", textShadow: "0 1px 4px rgba(255,255,255,.45)", display: "inline-block",
            animation: playing && light === "green" ? "chantPulse .5s ease-in-out infinite" : "none" }}>{title}</div>
          <div style={{ minHeight: 20, marginTop: 2 }}>
            {phase === "ready" && <span style={{ fontSize: 13, fontWeight: 800, color: "#5a4324" }}>{winnerCount}명 살아남으면 당첨!</span>}
            {done && <span style={{ fontSize: 15, fontWeight: 900, color: ROSE, textShadow: "0 1px 4px rgba(255,255,255,.5)" }}>🎉 {winnerCount > 1 ? `${winnerCount}명 ` : ""}당첨 확정! 🎉</span>}
          </div>
        </div>

        {/* 🔴 빨간불 "얼음!" — 화면 중앙 크게 번쩍 */}
        {playing && light === "red" && (
          <div style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%,-50%)", zIndex: 42, pointerEvents: "none",
            fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: "2px",
            textShadow: "0 0 18px rgba(214,31,31,.95), 3px 3px 0 #8a0f0f, -3px 3px 0 #8a0f0f, 3px -3px 0 #8a0f0f, -3px -3px 0 #8a0f0f",
            animation: "iceFlash .5s ease-in-out infinite" }}>얼음!</div>
        )}

        {/* 🔴 진행요원 — 영희 양옆 한 명씩(결승선 위) */}
        <div style={{ position: "absolute", left: `${50 - FAR_HALF - 6}%`, top: `${FAR_Y + 1}%`, transform: "translate(-50%,-100%)", zIndex: 6 }}>
          <RedGuard size={total <= 35 ? 22 : 19} />
        </div>
        <div style={{ position: "absolute", left: `${50 + FAR_HALF + 6}%`, top: `${FAR_Y + 1}%`, transform: "translate(-50%,-100%)", zIndex: 6 }}>
          <RedGuard size={total <= 35 ? 22 : 19} />
        </div>

        {/* 👧 영희 인형 — 결승선 위에 서 있음(발이 결승선) */}
        <div style={{ position: "absolute", left: "50%", top: `${FAR_Y}%`, transform: "translate(-50%,-100%)", zIndex: 7 }}>
          <YoungHee facing={playing && light === "red" ? "watch" : "away"} size={total <= 35 ? 52 : 46} />
        </div>

        {/* 🔺 영희 눈 레이저 — 저격당한 대상까지 붉은 빔(짧게 번쩍) */}
        {beams.length > 0 && (
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 33, pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {beams.map((bm) => (
              <g key={bm.id}>
                <line x1={EYE_X} y1={EYE_Y} x2={bm.tx} y2={bm.ty} stroke="rgba(255,40,40,.55)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                <line x1={EYE_X} y1={EYE_Y} x2={bm.tx} y2={bm.ty} stroke="#fff" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        )}
        {beams.map((bm) => (
          <div key={bm.id + "h"} style={{ position: "absolute", left: `${bm.tx}%`, top: `${bm.ty}%`, transform: "translate(-50%,-50%)", zIndex: 34, pointerEvents: "none",
            width: 16, height: 16, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,90,90,.95), rgba(255,0,0,.2) 70%, transparent)" }} />
        ))}

        {/* 결승선(영희 발치, 체커보드 가로선) */}
        <div style={{ position: "absolute", left: `${50 - FAR_HALF - 3}%`, right: `${50 - FAR_HALF - 3}%`, top: `${FAR_Y}%`, height: 5, zIndex: 8,
          backgroundImage: "repeating-conic-gradient(#fff 0% 25%, #333 0% 50%)", backgroundSize: "6px 6px", opacity: 0.9 }} />

        {/* 피 자국(먼저 깔림, 원근 반영) */}
        {bloods.map((b) => {
          const pp = persp(b.x, b.y);
          return <div key={b.id} style={{ position: "absolute", left: `${pp.left}%`, top: `${pp.top + 2}%`, transform: "translate(-50%,-50%)", zIndex: 9, pointerEvents: "none",
            width: (b.big ? 22 : 12) * pp.scale, height: (b.big ? 13 : 7) * pp.scale, borderRadius: "50%", background: "radial-gradient(circle, rgba(155,8,8,.85), rgba(115,0,0,.3) 70%, transparent)", filter: "blur(.5px)" }} />;
        })}

        {/* 참가자(원근 — 아래=가까이·큼, 위=멀리·작음) */}
        {players.map((p) => {
          const finished = p.rank !== null;
          const pp = persp(p.x, p.y);
          const caught = p.state === "caught";
          const z = finished ? 60 : caught ? 8 : Math.round(120 - p.x); // 가까울수록(작은 x) 앞
          const showName = finished || leadSet.has(p.id);
          const nameFs = (finished ? 11 : total <= 30 ? 9 : 8) * (0.7 + pp.scale * 0.3);
          return (
            <div key={p.id} style={{ position: "absolute", left: `${pp.left}%`, top: `${pp.top}%`, transform: "translate(-50%,-100%)", zIndex: z, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 0, transition: "left .1s linear, top .12s linear", opacity: caught ? 0.92 : 1 }}>
              {showName && (
                <span style={{ fontSize: nameFs, fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.2, color: finished ? "#231018" : "#fff", background: finished ? GOLD : "rgba(0,0,0,.55)", padding: finished ? "1px 7px" : "0 5px", borderRadius: 6, marginBottom: 1, boxShadow: finished ? "0 2px 8px rgba(240,196,90,.5)" : "none", animation: finished ? "medalPop .35s ease" : "none" }}>
                  {finished ? `${p.rank}등 ` : ""}{p.name}
                </span>
              )}
              <SuitStick color={p.color} num={p.num} size={figSize * pp.scale} state={p.state} finished={finished} />
            </div>
          );
        })}

        {/* 생존 인원 */}
        {(phase === "ready" || playing) && (
          <div style={{ position: "absolute", right: "3%", bottom: "3%", zIndex: 41, pointerEvents: "none", fontSize: 12, fontWeight: 800, color: "#3b2a12", textShadow: "0 1px 3px rgba(255,255,255,.5)" }}>
            🟩 생존 {aliveN}명
          </div>
        )}

        {/* 카운트다운 */}
        {phase === "countdown" && countText && (
          <div key={countText} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
            <span style={{ fontSize: countText === "시작!" ? 64 : 96, fontWeight: 900, color: countText === "시작!" ? "#1f8a3b" : "#3b2a12", textShadow: "0 4px 20px rgba(255,255,255,.5)", animation: "countPop .5s ease" }}>{countText}</span>
          </div>
        )}

        {/* 완료: 색종이 + 당첨자 패널 */}
        {done && Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${(i * 37) % 100}%`, width: 6, height: 10, background: ["#F0C45A", "#7B2D43", "#6FC3E8", "#FF8A5A", "#fff"][i % 5], borderRadius: 2, zIndex: 35, animation: `confetti ${1.3 + (i % 5) * 0.2}s linear ${(i % 7) * 0.12}s infinite` }} />
        ))}
        {done && finishedRanks.length > 0 && (
          <div style={{ position: "absolute", left: "50%", bottom: preview ? 60 : 16, transform: "translateX(-50%)", zIndex: 45, maxWidth: "94%", padding: "11px 16px 12px", borderRadius: 16, background: "rgba(14,14,22,.9)", border: `2px solid ${GOLD}`, boxShadow: "0 8px 32px rgba(0,0,0,.55), 0 0 24px rgba(240,196,90,.35)", animation: "winnerPanelIn .5s ease", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, marginBottom: 7, textShadow: "0 1px 6px #000" }}>🟩 생존(당첨) {finishedRanks.length}명 🟩</div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
              {finishedRanks.sort((a, b) => a.rank - b.rank).map((w, i) => (
                <span key={w.name} style={{ fontSize: 15, fontWeight: 900, color: "#231018", background: GOLD, padding: "3px 12px", borderRadius: 999, lineHeight: 1.4, boxShadow: "0 3px 10px rgba(240,196,90,.45)", animation: "medalPop .4s ease", animationDelay: `${i * 0.08}s`, animationFillMode: "both" }}>
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
              <button onClick={startPreview} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999, border: "none", cursor: "pointer", color: "#fff", background: ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>▶  시작 (미리보기)</button>
            ) : done ? (
              <button onClick={resetPreview} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999, border: "none", cursor: "pointer", color: "#fff", background: ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>🔄  다시 하기</button>
            ) : (
              <span style={{ padding: "10px 26px", fontSize: 14, fontWeight: 900, borderRadius: 999, color: "#fff", background: "rgba(0,0,0,.5)" }}>게임 진행 중…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
