"use client";
// [2026-11-25] 방송 종료 카운트다운 — 1초마다 줄어듦, 0이 되면 안 보임. 표시만.
import { useEffect, useState } from "react";
import { remainText } from "@/lib/liveEndPlan";

export default function BroadcastEndCountdown({ endAt, dark = true }: { endAt: number; dark?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const text = remainText(endAt, now);
  if (!text) return null;
  return (
    <div role="timer" aria-live="off" style={{ marginTop: "-2px", marginBottom: "10px", fontSize: "14px", lineHeight: 1.5, wordBreak: "keep-all", color: dark ? "#FFFFFF" : "#111111" }}>
      방송 종료까지 <b style={{ fontVariantNumeric: "tabular-nums", color: dark ? "#FFD60A" : "#D30005" }}>{text}</b>
      <span style={{ opacity: 0.85 }}> · 입금은 방송 종료 전에 부탁드려요</span>
    </div>
  );
}
