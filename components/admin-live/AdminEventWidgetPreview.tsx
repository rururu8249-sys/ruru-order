"use client";

import { useEffect, useState } from "react";
import type { EventKind } from "@/lib/eventPlayback";

export default function AdminEventWidgetPreview({ kind }: { kind: EventKind | "mission"; eventId?: string }) {
  const [origin, setOrigin] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { setStatus("loading"); }, [kind, revision]);
  const path = kind === "claw" ? "/event-claw/overlay" : `/event-${kind}/live`;
  const src = origin ? `${origin}${path}?token=${kind}_luludongi_live&sound=0` : "";
  return (
    <section aria-label="방송 위젯 미리보기" style={{ width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12 }}>
        <span>{status === "error" ? "미리보기 연결 실패" : status === "loading" ? "미리보기 연결 중…" : "방송 화면 · 소리 꺼짐"}</span>
        <button type="button" className="btn" style={{ height: "auto", padding: "4px 8px" }} onClick={() => setRevision(v => v + 1)}>미리보기 재연결</button>
      </div>
      {src ? <iframe key={`${kind}:${revision}`} src={src} title={`${kind} 방송 위젯 미리보기`} tabIndex={-1}
        onLoad={() => setStatus("ready")} onError={() => setStatus("error")}
        style={{ display: "block", width: "100%", height: kind === "mission" ? 180 : 360, border: 0, background: "var(--color-surface-2)", pointerEvents: "none" }} /> : null}
    </section>
  );
}
