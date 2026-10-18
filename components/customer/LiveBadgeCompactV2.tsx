"use client";
// [㊳ 2026-10-19] 작게 보기(사진 104px) 「라이브 소개중」 배지 — 새 모양(ui=v2) 전용. 표시만.
//   예전: 두 줄로 꺾여 사진·「SOLD OUT」을 가렸다.
//   지금: 한 줄 고정(nowrap)·13px·좌우 여백 6px·사진 왼쪽 위 4px. 그 폰 글꼴로 재서 사진 폭을 넘으면 「LIVE」 로 줄인다.
//   크게 보기 배지는 page.tsx 그대로(이 부품 안 씀).
import { useLayoutEffect, useRef, useState } from "react";

export default function LiveBadgeCompactV2() {
  const ref = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box || short) return;
    // 사진 안쪽 오른쪽 여백 4px 을 남기고 넘치면 짧은 글자로
    if (el.offsetLeft + el.offsetWidth > box.clientWidth - 4) setShort(true);
  }, [short]);

  return (
    <span
      ref={ref}
      aria-label="라이브 소개중"
      style={{
        position: "absolute", top: "4px", left: "4px", zIndex: 2,
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: "#111111", color: "#FFFFFF", fontSize: "13px", fontWeight: 600, lineHeight: 1.2,
        borderRadius: "9999px", padding: "3px 6px", whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#fff", flexShrink: 0, animation: "shimmer 1.2s ease-in-out infinite" }} />
      <span aria-hidden="true">{short ? "LIVE" : "라이브 소개중"}</span>
    </span>
  );
}
