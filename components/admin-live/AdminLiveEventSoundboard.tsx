"use client";

// [2026-08-12] 이벤트 효과음 사운드보드 (서바이벌/달리기 탭 전용)
//   - 인터넷에서 구한 "실제 녹음" 효과음(public/sfx/*.mp3)을 관리자 컴퓨터에서 재생하는 버튼 모음.
//   - 재생 전용(new Audio) — 추첨/지급/주문/돈 로직과 완전 무관. DB 접근 0.
//   - 방송 송출 경로 안내:
//       ① 이 버튼 = 관리자 컴퓨터 스피커로 재생 → OBS에 "오디오 캡처(macOS)" 소스를 추가해 두면 방송에 실림.
//       ② 위젯(OBS 브라우저 소스)도 같은 /sfx/ 파일을 이벤트 진행에 맞춰 자동 재생
//          → OBS 브라우저 소스 설정 "OBS를 통해 오디오 제어"를 켜면 버튼 없이도 방송에 실림.
//   - 음원 출처(무료 라이선스): Moodist(자연음) · wheel-spinner 동봉 freesound CC0(팡파레·틱) ·
//     react-play(함성) · beep 예제(총성) · vueuse/sound(따단 팡파레) — 실제 녹음, 합성음 아님.

import { useEffect, useRef, useState } from "react";

type SoundDef = { key: string; label: string; file: string; dur: string; main?: boolean };

// [2026-08-12] 사장님 요청: 버튼 여러 개 대신 이벤트 전체를 따라가는 "파일 1개"로.
//   - 메인 버튼 1개 = 돌리기 누를 때 같이 누르면 이벤트 흐름 전체를 커버하는 통짜 음원.
//     · 서바이벌 45초: 폭우+돌풍 베이스에 실제 천둥클랩 5회(2/12/22/31/39초), 41초부터 페이드아웃.
//       (이벤트가 먼저 끝나면 버튼 다시 눌러 정지)
//     · 달리기 14초: 틱3번(0/0.7/1.4초)+출발 총성(2.1초)+관중 함성(2.2~13.6초)+1등 결승 통과 팡파레(10.8초)
//       — 위젯 카운트다운·경주 타이밍(출발 2.8초, 1등 통과 10.8초, 마지막 최대 13.5초)에 맞춰 제작.
//   - 보조 버튼 1개 = 우승 팡파레만 따로(서바이벌은 끝나는 시점이 인원수마다 달라 통짜에 못 넣음).
const SOUNDS: Record<"survival" | "race", SoundDef[]> = {
  survival: [
    { key: "event", label: "⛈️ 서바이벌 효과음 (폭풍우+천둥 전체)", file: "/sfx/survival-event.mp3", dur: "45초", main: true },
    { key: "win", label: "🏆 우승 팡파레+함성", file: "/sfx/survival-win.mp3", dur: "6.5초" },
  ],
  race: [
    { key: "event", label: "🏁 달리기 효과음 (카운트다운→총성→함성→팡파레)", file: "/sfx/race-event.mp3", dur: "14초", main: true },
    { key: "finish", label: "🎺 결승 팡파레만", file: "/sfx/race-finish.mp3", dur: "3.2초" },
  ],
};

export default function AdminLiveEventSoundboard({ kind }: { kind: "survival" | "race" }) {
  const [playingKey, setPlayingKey] = useState("");
  const [volume, setVolume] = useState(100);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(100);
  volumeRef.current = volume;

  // 언마운트(팝업 닫기) 시 재생 정지 — 소리만 남는 사고 방지
  useEffect(() => () => { const a = audioRef.current; if (a) { a.pause(); } }, []);
  // 재생 중 볼륨 슬라이더 즉시 반영
  useEffect(() => { const a = audioRef.current; if (a) a.volume = volume / 100; }, [volume]);

  const stopAll = () => {
    const a = audioRef.current;
    if (a) { try { a.pause(); a.currentTime = 0; } catch { /* 무시 */ } }
    audioRef.current = null;
    setPlayingKey("");
  };

  const play = (s: SoundDef) => {
    stopAll(); // 항상 1개만 재생(겹침 방지) — 겹쳐 틀고 싶으면 위젯 자동재생이 담당
    try {
      const a = new Audio(s.file);
      a.volume = volumeRef.current / 100;
      a.onended = () => setPlayingKey((k) => (k === s.key ? "" : k));
      a.onerror = () => setPlayingKey((k) => (k === s.key ? "" : k));
      audioRef.current = a;
      void a.play();
      setPlayingKey(s.key);
    } catch { setPlayingKey(""); }
  };

  const list = SOUNDS[kind];

  return (
    <div style={{ border: "1px solid var(--bd)", borderRadius: "10px", padding: "10px 12px", marginBottom: "11px", background: "var(--color-surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--rose)" }}>🔊 효과음 재생 (실제 녹음)</span>
        <span className="note" style={{ fontSize: "11px" }}>이 컴퓨터 스피커로 재생 — 방송 송출은 OBS 데스크탑 오디오 캡처</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px" }}>
          <span className="note" style={{ fontSize: "11px" }}>볼륨 {volume}%</span>
          <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ width: "90px" }} />
          <button className="btn" style={{ height: "auto", padding: "4px 10px", fontSize: "12px" }} onClick={stopAll} disabled={!playingKey}>⏹ 정지</button>
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {list.map((s) => {
          const on = playingKey === s.key;
          return (
            <button
              key={s.key}
              className="btn"
              style={{
                height: "auto", padding: s.main ? "10px 16px" : "7px 12px", fontSize: s.main ? "13.5px" : "12.5px", fontWeight: s.main ? 800 : 600,
                border: `${s.main ? 2 : 1}px solid ${on || s.main ? "var(--rose)" : "var(--bd)"}`,
                background: on ? "var(--rose)" : "var(--color-surface)",
                color: on ? "#fff" : s.main ? "var(--rose)" : "var(--ink, #333)",
                borderRadius: "8px", cursor: "pointer",
              }}
              onClick={() => (on ? stopAll() : play(s))}
              title={`${s.dur} · 다시 누르면 정지`}
            >
              {on ? "▶ " : ""}{s.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>({s.dur})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
