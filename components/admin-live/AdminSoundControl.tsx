"use client";

// 알림음 단독 컨트롤 — 켜기/끄기 + 볼륨 슬라이더 + 테스트 듣기(여성 음성).
//   - localStorage: ruru_admin_sound_on(on/off), ruru_admin_voice_volume(0~1).
//   - 실제 알림은 speakAdmin이 이 값을 읽어 재생. 돈/주문 로직과 무관(소리 설정 전용).
import { useEffect, useRef, useState } from "react";
import { speakAdmin, ADMIN_SOUND_ON_KEY, ADMIN_VOICE_VOLUME_KEY } from "@/lib/adminVoice";

export default function AdminSoundControl() {
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(100); // 0~100 표시용
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSoundOn(window.localStorage.getItem(ADMIN_SOUND_ON_KEY) !== "false");
      const v = window.localStorage.getItem(ADMIN_VOICE_VOLUME_KEY);
      if (v != null && Number.isFinite(Number(v))) {
        setVolume(Math.round(Math.min(1, Math.max(0, Number(v))) * 100));
      }
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleSound = () => {
    setSoundOn((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(ADMIN_SOUND_ON_KEY, String(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  };

  const changeVolume = (pct: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(pct)));
    setVolume(clamped);
    try {
      window.localStorage.setItem(ADMIN_VOICE_VOLUME_KEY, String(clamped / 100));
    } catch {
      /* 무시 */
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="알림음 설정"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 10,
          border: "1.5px solid " + (soundOn ? "#7A1E47" : "#D9C5CC"),
          background: soundOn ? "#7A1E47" : "#fff",
          color: soundOn ? "#fff" : "#999",
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {soundOn ? "🔊" : "🔇"} 알림음
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 80,
            width: 240,
            background: "#fff",
            border: "1px solid #E3CDD5",
            borderRadius: 14,
            padding: 14,
            boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#7A1E47" }}>알림음 (음성)</span>
            <button
              type="button"
              onClick={toggleSound}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: "none",
                background: soundOn ? "#0F6E56" : "#cbd5e1",
                color: "#fff",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {soundOn ? "켜짐 ON" : "꺼짐 OFF"}
            </button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 6 }}>볼륨 {volume}%</div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#7A1E47", cursor: "pointer" }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => speakAdmin("주문!")}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px solid #7A1E47", background: "#fff", color: "#7A1E47", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
            >
              🛒 &quot;주문!&quot; 듣기
            </button>
            <button
              type="button"
              onClick={() => speakAdmin("입금!")}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px solid #0F6E56", background: "#fff", color: "#0F6E56", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
            >
              💰 &quot;입금!&quot; 듣기
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#aaa", marginTop: 10, lineHeight: 1.5 }}>
            새 주문 → &quot;주문!&quot;, 입금확인 → &quot;입금!&quot; 음성이 나와요. 소리가 안 나면 테스트 버튼을 한 번 눌러 주세요(브라우저 소리 권한).
          </div>
        </div>
      ) : null}
    </div>
  );
}
