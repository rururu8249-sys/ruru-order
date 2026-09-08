"use client";

// 알림음 컨트롤 — 설정 › 알림음 탭. 켜기/끄기 + 볼륨 + 테스트 듣기(여성 음성).
//   - localStorage: ruru_admin_sound_on(on/off), ruru_admin_voice_volume(0~1).
//   - 실제 알림은 speakAdmin이 이 값을 읽어 재생. 돈/주문 로직과 무관(소리 설정 전용).
//   - [2026-09-08 사장님 요청] 사이드바 인라인 → 설정 탭으로 이동.
//     좁은 폭 전용 인라인 style(#E3CDD5, #7A1E47, #cbd5e1)을 관리자 공통 토큰으로 교체 → 다크모드 정상.
import { useEffect, useState } from "react";
import { playOrderAlert, playDepositAlert, ADMIN_SOUND_ON_KEY, ADMIN_VOICE_VOLUME_KEY } from "@/lib/adminVoice";

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
    <div className="grid gap-3">
      {/* 켜기/끄기 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-ink">{soundOn ? "🔊" : "🔇"} 알림음 {soundOn ? "켜짐" : "꺼짐"}</div>
          <div className="mt-0.5 text-xs font-bold text-ink-mute">
            {soundOn ? "새 주문·입금이 들어오면 소리로 알려줍니다." : "소리 없이 화면으로만 표시됩니다."}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          role="switch"
          aria-checked={soundOn}
          className={[
            "relative h-8 w-[68px] shrink-0 rounded-full border transition",
            soundOn ? "border-ok-tx bg-ok-tx" : "border-line bg-surface",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-all",
              soundOn ? "left-[38px]" : "left-1",
            ].join(" ")}
          />
          <span className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-black ${soundOn ? "left-2.5 text-white" : "right-2.5 text-ink-mute"}`}>
            {soundOn ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* 볼륨 */}
      <div className={`rounded-2xl border border-line px-4 py-3 transition ${soundOn ? "bg-surface" : "bg-surface-2 opacity-55"}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-black text-ink">볼륨</span>
          <span className="rounded-full bg-rose-soft px-2.5 py-0.5 text-xs font-black tabular-nums text-rose-deep">{volume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          disabled={!soundOn}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className="w-full cursor-pointer disabled:cursor-not-allowed"
          style={{ accentColor: "var(--color-rose-deep)" }}
        />
        <div className="mt-1 flex justify-between text-[11px] font-bold text-ink-mute">
          <span>작게</span>
          <span>크게</span>
        </div>
      </div>

      {/* 테스트 듣기 */}
      <div className="rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="mb-2 text-sm font-black text-ink">소리 들어보기</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => playOrderAlert()}
            className="h-10 min-w-[132px] flex-1 rounded-xl border-[1.5px] border-rose-deep bg-surface px-4 text-sm font-black text-rose-deep transition hover:bg-rose-soft"
          >
            🛒 주문 알림 듣기
          </button>
          <button
            type="button"
            onClick={() => playDepositAlert()}
            className="h-10 min-w-[132px] flex-1 rounded-xl border-[1.5px] border-ok-tx bg-surface px-4 text-sm font-black text-ok-tx transition hover:bg-ok-bg"
          >
            💰 입금 알림 듣기
          </button>
        </div>
        <p className="mt-2 text-xs font-bold text-ink-mute">
          소리가 안 들리면 컴퓨터 볼륨과 브라우저 탭 음소거를 확인해 주세요.
        </p>
      </div>
    </div>
  );
}
