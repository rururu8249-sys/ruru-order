"use client";

import { useEffect, useRef, useState } from "react";
import type { EventKind } from "@/lib/eventPlayback";

export default function AdminEventWidgetPreview({ kind }: { kind: EventKind | "mission"; eventId?: string }) {
  const [origin, setOrigin] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const viewportRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(360);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0]?.contentRect.width || 360));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { setStatus("loading"); }, [kind, revision]);
  const path = kind === "claw" ? "/event-claw/overlay" : `/event-${kind}/live`;
  const src = origin ? `${origin}${path}?token=${kind}_luludongi_live&sound=0` : "";
  const width = kind === "claw" || kind === "roulette" ? 720 : 1280;
  const height = kind === "claw" ? 1000 : kind === "roulette" ? 900 : kind === "mission" ? 240 : 720;
  const viewportHeight = kind === "mission" ? 140 : 360;
  const scale = Math.min(availableWidth / width, viewportHeight / height);
  return (
    <section aria-label="방송 위젯 미리보기" style={{ width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12 }}>
        <span>{status === "error" ? "미리보기 연결 실패" : status === "loading" ? "미리보기 연결 중…" : "방송 화면 · 소리 꺼짐"}</span>
        <button type="button" className="btn" style={{ height: "auto", padding: "4px 8px" }} onClick={() => setRevision(v => v + 1)}>미리보기 재연결</button>
      </div>
      <div ref={viewportRef} style={{ width: "100%", height: viewportHeight, position: "relative", overflow: "hidden" }}>
      {src ? <iframe key={`${kind}:${revision}`} src={src} title={`${kind} 방송 위젯 미리보기`} tabIndex={-1}
        onLoad={() => setStatus("ready")} onError={() => setStatus("error")}
        style={{ display: "block", position: "absolute", left: Math.max(0, (availableWidth - width * scale) / 2), top: 0, width, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, background: "var(--color-surface-2)", pointerEvents: "none" }} /> : null}
      </div>
    </section>
  );
}
