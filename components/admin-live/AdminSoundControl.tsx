"use client";

// 알림음 단독 컨트롤(사이드바 인라인) — 켜기/끄기 + 볼륨 + 테스트 듣기(여성 음성).
//   - localStorage: ruru_admin_sound_on(on/off), ruru_admin_voice_volume(0~1).
//   - 실제 알림은 speakAdmin이 이 값을 읽어 재생. 돈/주문 로직과 무관(소리 설정 전용).
import { useEffect, useState } from "react";
import { speakAdmin, ADMIN_SOUND_ON_KEY, ADMIN_VOICE_VOLUME_KEY } from "@/lib/adminVoice";

export default function AdminSoundControl() {
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(100); // 0~100 표시용

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
    <div style={{ marginTop: 8, border: "1px solid #E3CDD5", borderRadius: 12, padding: "10px 11px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#7A1E47" }}>{soundOn ? "🔊" : "🔇"} 알림음</span>
        <button
          type="button"
          onClick={toggleSound}
          style={{
            padding: "4px 11px",
            borderRadius: 999,
            border: "none",
            background: soundOn ? "#0F6E56" : "#cbd5e1",
            color: "#fff",
            fontWeight: 800,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {soundOn ? "켜짐" : "꺼짐"}
        </button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginTop: 8, marginBottom: 4 }}>볼륨 {volume}%</div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={volume}
        onChange={(e) => changeVolume(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#7A1E47", cursor: "pointer" }}
      />

      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button
          type="button"
          onClick={() => speakAdmin("주문!")}
          style={{ flex: 1, padding: "7px 4px", borderRadius: 9, border: "1.5px solid #7A1E47", background: "#fff", color: "#7A1E47", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
        >
          🛒 주문!
        </button>
        <button
          type="button"
          onClick={() => speakAdmin("입금!")}
          style={{ flex: 1, padding: "7px 4px", borderRadius: 9, border: "1.5px solid #0F6E56", background: "#fff", color: "#0F6E56", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
        >
          💰 입금!
        </button>
      </div>
    </div>
  );
}
