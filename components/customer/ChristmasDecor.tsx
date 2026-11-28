"use client";
// [2026-11-26] 손님 주문서 «겨울 시안(?preview=tc)» 장식 — 눈 내림 + 크리스마스 띠(트리·사슴·산타 썰매·선물·별).
// 그림은 전부 직접 그린 간단한 SVG. 장식만(누르는 기능 없음·손가락 통과). 동작 줄이기 설정이면 눈 멈춤.
import { useMemo } from "react";

export function ChristmasSnow() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2);
        return { left: r(1) * 100, size: 4 + r(2) * 7, dur: 7 + r(3) * 9, delay: -r(4) * 16, drift: (r(5) - 0.5) * 60, op: 0.55 + r(6) * 0.4 };
      }),
    []
  );
  return (
    <div aria-hidden="true" data-xmas-snow="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 25, overflow: "hidden" }}>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="ruru-xmas-flake"
          style={{ left: `${f.left}%`, width: f.size, height: f.size, opacity: f.op, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, ["--drift" as string]: `${f.drift}px` }}
        />
      ))}
    </div>
  );
}

function Tree({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${78 - 70 * s}) scale(${s})`}>
      <rect x="21" y="60" width="8" height="10" fill="#7a4a24" />
      <polygon points="25,4 4,34 46,34" fill="#1f6b3a" />
      <polygon points="25,16 0,50 50,50" fill="#1a5c32" />
      <polygon points="25,30 -4,64 54,64" fill="#164f2b" />
      <polygon points="25,-4 27.6,2 34,2 29,6 31,12 25,8.5 19,12 21,6 16,2 22.4,2" fill="#ffd34d" />
      <circle cx="18" cy="28" r="2.6" fill="#e23b3b" className="ruru-xmas-twinkle" />
      <circle cx="32" cy="40" r="2.6" fill="#ffd34d" className="ruru-xmas-twinkle" style={{ animationDelay: "0.6s" }} />
      <circle cx="14" cy="52" r="2.6" fill="#4aa3ff" className="ruru-xmas-twinkle" style={{ animationDelay: "1.1s" }} />
      <circle cx="36" cy="56" r="2.6" fill="#e23b3b" className="ruru-xmas-twinkle" style={{ animationDelay: "0.3s" }} />
      <circle cx="25" cy="44" r="2.6" fill="#ffffff" className="ruru-xmas-twinkle" style={{ animationDelay: "0.9s" }} />
    </g>
  );
}

function Gift({ x, color, ribbon }: { x: number; color: string; ribbon: string }) {
  return (
    <g transform={`translate(${x} 62)`}>
      <rect x="0" y="0" width="16" height="14" rx="1.5" fill={color} />
      <rect x="6.5" y="0" width="3" height="14" fill={ribbon} />
      <rect x="0" y="5" width="16" height="3" fill={ribbon} />
      <path d="M8 0 C3 -6 1 -1 8 0 C15 -1 13 -6 8 0" fill={ribbon} />
    </g>
  );
}

function Reindeer({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 34)`}>
      <path d="M6 4 L3 -6 M3 -2 L-1 -6 M8 4 L11 -6 M11 -2 L15 -6" stroke="#8a5a32" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <ellipse cx="22" cy="20" rx="14" ry="8" fill="#a8703f" />
      <ellipse cx="7" cy="9" rx="6" ry="5" fill="#a8703f" />
      <rect x="10" y="10" width="5" height="9" fill="#a8703f" />
      <circle cx="2" cy="10" r="2" fill="#5a3a20" />
      <circle cx="7" cy="7" r="1" fill="#2b1b10" />
      <rect x="11" y="26" width="3" height="12" fill="#8a5a32" />
      <rect x="17" y="26" width="3" height="12" fill="#8a5a32" />
      <rect x="27" y="26" width="3" height="12" fill="#8a5a32" />
      <rect x="32" y="26" width="3" height="12" fill="#8a5a32" />
      <path d="M10 15 Q22 22 34 15" stroke="#c0262d" strokeWidth="2.2" fill="none" />
      <circle cx="22" cy="19" r="1.8" fill="#ffd34d" />
    </g>
  );
}

function Santa({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 30)`}>
      {/* 썰매 */}
      <path d="M0 34 Q4 44 14 44 L46 44" stroke="#ffd34d" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M4 22 L40 22 Q44 22 44 26 L44 36 L8 36 Q4 36 4 32 Z" fill="#c0262d" />
      <path d="M4 26 L44 26" stroke="#ffd34d" strokeWidth="1.6" />
      {/* 산타 */}
      <rect x="16" y="6" width="16" height="18" rx="6" fill="#d8312f" />
      <rect x="16" y="15" width="16" height="3" fill="#2b2b2b" />
      <circle cx="24" cy="2" r="7" fill="#f3c8a8" />
      <path d="M17 4 Q24 16 31 4 Q28 10 24 10 Q20 10 17 4" fill="#ffffff" />
      <path d="M16 -1 Q24 -14 33 -2 Z" fill="#d8312f" />
      <rect x="15" y="-2" width="19" height="3.5" rx="1.7" fill="#ffffff" />
      <circle cx="34" cy="-7" r="2.6" fill="#ffffff" />
      <circle cx="21.5" cy="1" r="0.9" fill="#2b1b10" />
      <circle cx="26.5" cy="1" r="0.9" fill="#2b1b10" />
      {/* 선물 자루 */}
      <path d="M32 10 Q44 6 42 22 L32 22 Z" fill="#7a4a24" />
    </g>
  );
}

/** 방송 상자 위 크리스마스 띠(높이 96). */
export function ChristmasBanner() {
  return (
    <div data-xmas-banner="true" aria-hidden="true" style={{ position: "relative", height: 112, borderRadius: 14, overflow: "hidden", marginBottom: 10, background: "linear-gradient(180deg,#0f2f22 0%,#173f2c 70%,#1d4a34 100%)" }}>
      {/* [2026-11-28] 넓은 화면(PC)에서 위가 잘려 산타·선물이 안 보이던 것 → 그림을 양옆으로 넓게(가운데 0~360은 폰 그대로) */}
      <svg viewBox="-360 -18 1080 114" width="100%" height="112" preserveAspectRatio="xMidYMax slice" style={{ display: "block" }}>
        {/* 별·달 */}
        <circle cx="268" cy="20" r="9" fill="#fff6cf" />
        <circle cx="272" cy="17" r="8" fill="#173f2c" />
        {[[40, 14], [96, 8], [150, 20], [210, 10], [236, 26], [344, 12], [-300, 12], [-210, 22], [-120, 8], [-40, 18], [400, 16], [470, 8], [560, 22], [650, 10]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.3" fill="#ffffff" className="ruru-xmas-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
        {/* 눈 언덕 */}
        <path d="M-360 76 Q-300 66 -240 78 T-120 76 T0 80 Q60 66 120 78 T240 76 T360 74 T480 78 T600 74 T720 78 L720 96 L-360 96 Z" fill="#ffffff" />
        <Tree x={-340} s={0.8} />
        <Tree x={-280} s={1} />
        <Gift x={-220} color="#2f7d4f" ribbon="#ffd34d" />
        <Gift x={-202} color="#c0262d" ribbon="#ffffff" />
        <Tree x={-150} s={0.75} />
        <Tree x={-90} s={0.95} />
        <Gift x={-40} color="#ffd34d" ribbon="#c0262d" />
        <Tree x={380} s={0.9} />
        <Gift x={440} color="#c0262d" ribbon="#ffd34d" />
        <Gift x={458} color="#2f7d4f" ribbon="#ffffff" />
        <Tree x={500} s={0.7} />
        <Tree x={560} s={1} />
        <Gift x={620} color="#ffd34d" ribbon="#2f7d4f" />
        <Tree x={660} s={0.8} />
        <Tree x={10} s={0.95} />
        <Tree x={52} s={0.7} />
        <Gift x={96} color="#c0262d" ribbon="#ffd34d" />
        <Gift x={114} color="#2f7d4f" ribbon="#ffffff" />
        <g className="ruru-xmas-sleigh">
          <Reindeer x={150} />
          <path d="M184 52 L200 56" stroke="#ffd34d" strokeWidth="1.2" />
          <Santa x={200} />
        </g>
        <Tree x={300} s={0.85} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 8, textAlign: "center", color: "#ffffff", fontSize: 15, fontWeight: 800, letterSpacing: "0.04em", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
        🎄 Merry Christmas 🎅
      </div>
    </div>
  );
}
