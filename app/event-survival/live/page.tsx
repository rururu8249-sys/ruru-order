"use client";

// Read-only OBS/customer widget. Real and preview scenes use the same renderer.
// Server-selected winners and payouts are never decided here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {EventClockStyles} from "@/components/event-shared/EventClockStyles";
import {useEventScene} from "@/components/event-shared/useEventScene";
import {buildSurvivalScene,sampleSurvivalScene} from "@/lib/eventSurvivalScene";
import {eventSeed,seededRandom} from "@/lib/eventPlayback";
import EventRoster from '@/components/event-shared/EventRoster';
import SurvivalCharacter from '@/components/event-shared/SurvivalCharacter';
import SurvivalDisaster, {SurvivalArtStyles} from '@/components/event-shared/SurvivalDisaster';
import SurvivalReaction, {SurvivalReactionStyles} from '@/components/event-shared/SurvivalReaction';

const ROSE = "#7B2D43";
const GOLD = "#F0C45A";
const NAME_SHOW_AT = 12; // 남은 인원이 이 값 이하면 이름 표시
const TOKEN = "survival_luludongi_live"; // 공개 오버레이 API 고정 토큰

const FRONT = ["꽃님", "봄날", "행복", "예쁜", "루루", "하늘", "달콤", "사랑", "미소", "햇살",
  "바다", "노을", "향기", "구름", "달빛", "새록", "포근", "설렘", "단비", "온유",
  "고운", "초록", "은하", "다온", "여울", "가온", "라온", "하율", "소담", "윤슬"];
const BACK = ["맘", "님", "언니", "여사", "공주", "이", "네", "댁", "홀릭", "러버", "데이", "가든"];

const CONFETTI = ["#F0C45A", "#7B2D43", "#F5E6EB", "#6FC3E8", "#FF8A5A", "#fff"];

type Player = {
  id: number;
  name: string;
  x: number;
  y: number;
  dead: boolean;
  hit: boolean;
  dtype: string | null;
  pose?: 'look'|'run'|'duck'|'rest';
  facing?: number;
};

// 참가자 명단(이름 배열)을 받아 격자 좌표로 배치. 명단 없으면 가짜로 n명 생성(데모).
function makeScene(names: string[] | null, n: number): Player[] {
  const list: string[] = [];
  if (names && names.length > 0) {
    for (const nm of names) list.push(String(nm || "").trim() || "고객");
  } else {
    const set = new Set<string>();
    let guard = 0;
    while (list.length < n && guard < 5000) {
      guard++;
      const name = FRONT[Math.floor(Math.random() * FRONT.length)] + BACK[Math.floor(Math.random() * BACK.length)];
      if (set.has(name)) continue;
      set.add(name);
      list.push(name);
    }
  }
  const total = list.length;
  // [2026-07-26 사장님] 위젯을 가로로 키우면서 격자도 12열로 넓게 사용
  const cols = Math.max(1,Math.min(total,8));
  const rows = Math.max(1, Math.ceil(total / cols));
  return list.map((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 4.5 + (col + 0.5) * (91 / cols) + (Math.random() * .8 - .4);
    const y = 27 + (row + 0.5) * (58 / rows) + (Math.random() * .8 - .4);
    return { id: i, name, x, y, dead: false, hit: false, dtype: null };
  });
}


function deathTransform(t: string | null) {
  switch (t) {
    case "wave": return "translate(-50%,-50%) translate(60px,70px) rotate(120deg)";
    case "wind": return "translate(-50%,-50%) translate(220px,-40px) rotate(560deg)";
    case "hail": return "translate(-50%,-50%) translateY(35px) rotate(90deg) scaleY(.4)";
    case "meteor": return "translate(-50%,-50%) translate(-50px,25px) rotate(-100deg)";
    default: return "translate(-50%,-50%) translateY(45px) rotate(95deg)";
  }
}

export default function SurvivalLiveWidget() {
  // 설정: preview 모드에서는 쿼리로 총원/생존자 수 조절 (기본 100명 중 1명 생존).
  const [demoTotal, setTotal] = useState(100);
  const [demoWinnerCount, setWinnerCount] = useState(1);
  const [names, setNames] = useState<string[] | null>(null);
  const [survivorIds, setSurvivorIds] = useState<Set<number>>(new Set());

  const [mounted, setMounted] = useState(false); // SSR 후 클라 마운트 전까지 렌더 보류(hydration 불일치 방지)
  const [preview, setPreview] = useState(false);  // ?preview=1 이면 가짜 명단 데모(관리자 확인용)
  const [previewControls,setPreviewControls]=useState(false);
  const [demoElapsed,setDemoElapsed]=useState(-1);
  const [showInitialResult, setShowInitialResult] = useState(false);
  const [requestedEventId, setRequestedEventId] = useState('');
  const [demoPlayers, setPlayers] = useState<Player[]>([]);

  const shared=useEventScene({url:mounted&&!preview?`/api/event-survival/overlay?token=${TOKEN}${requestedEventId ? `&eventId=${encodeURIComponent(requestedEventId)}` : ''}`:"",kind:"survival",build:buildSurvivalScene,showInitialResult});
  const demoScene=useMemo(()=>names?buildSurvivalScene({id:'preview',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:0,participants:names,winners:names.filter((_,i)=>survivorIds.has(i))},42):null,[names,survivorIds]);
  const frame=preview&&demoScene?sampleSurvivalScene(demoScene,demoElapsed):shared.scene?sampleSurvivalScene(shared.scene,shared.elapsed):null;
  const players=frame?.players||demoPlayers;
  const phase=frame?.phase||"ready";
  const message=frame?.message||null;
  const winners=frame?.winners||[];
  const fx=frame?.fx||null;
  const bursts=frame?.bursts||[];
  const total=preview?demoTotal:(shared.event?.participants.length||0);
  const winnerCount=preview?demoWinnerCount:(shared.event?.winner_count||shared.event?.survivors?.length||1);

  const running = useRef(false);

  const aliveCount = players.filter((p) => !p.dead).length;
  const showNames = phase === 'ready' || aliveCount <= NAME_SHOW_AT || phase === "done";
  const done = phase === "done";
  const winnerIdSet = new Set(winners.map((w) => w.id));

  // 투명 배경(OBS) + 쿼리 파싱. preview=1이면 가짜 명단 데모, 아니면 서버 이벤트를 기다린다.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    // Defer the browser URL snapshot until after hydration; cancel on unmount.
    let active=true;
    queueMicrotask(()=>{
    if(!active)return;
    const q = new URLSearchParams(window.location.search);
    const isPreview = q.get("preview") === "1";
    setPreview(isPreview);
    setPreviewControls(q.get('controls')==='1');
    setShowInitialResult(q.get('showResult') === '1');
    setRequestedEventId(q.get('eventId') || '');
    soundOnRef.current = q.get("sound") !== "0"; // [2026-07-26] ?sound=0 이면 효과음 끔

    if (isPreview) {
      const t = Math.max(2, Math.min(200, Number(q.get("total")) || 100));
      const w = Math.max(1, Math.min(t - 1, Number(q.get("winners")) || 1));
      setTotal(t);
      setWinnerCount(w);
      const scene = makeScene(null, t);
      setPlayers(scene);
      setNames(scene.map((p) => p.name));
      const ids = scene.map((p) => p.id);
      const surv = new Set<number>();
      while (surv.size < w && surv.size < ids.length) {
        surv.add(ids[Math.floor(Math.random() * ids.length)]);
      }
      setSurvivorIds(surv);
    }

    setMounted(true);
    });
    return()=>{active=false;};
  }, []);

  const reset = useCallback(() => {
    running.current = false;
    setDemoElapsed(-1);
    const scene = makeScene(names, total);
    setPlayers(scene);
    // 새 판: 생존자 재선정(데모)
    const ids = scene.map((p) => p.id);
    const surv = new Set<number>();
    while (surv.size < winnerCount && surv.size < ids.length) {
      surv.add(ids[Math.floor(Math.random() * ids.length)]);
    }
    setSurvivorIds(surv);
  }, [names, total, winnerCount]);


  // ── [2026-07-26 사장님] 효과음 v2 — ①/sfx/survival-*.mp3 파일이 있으면 그걸 사용(진짜 음원)
  //   ②없으면 리버브·왜곡·저음 노이즈를 겹친 합성음(v1 "뿅뿅" 소리 개선). ?sound=0 으로 끔.
  //   OBS 브라우저 소스 "오디오를 통해 재생"을 켜면 방송 송출. 실패해도 연출은 정상 진행.
  const soundOnRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const reverbRef = useRef<ConvolverNode | null>(null);
  const sfxFilesRef = useRef<Record<string, string>>({}); // kind → 재생 가능한 파일 URL

  // 실제 음원 파일 자동 인식: public/sfx/survival-번개.mp3 식으로 넣어두면 합성음 대신 사용
  useEffect(() => {
    if (!mounted || !soundOnRef.current) return;
    const kinds = ["lightning", "wave", "wind", "hail", "meteor", "win"];
    kinds.forEach((k) => {
      const url = `/sfx/survival-${k}.mp3`;
      const a = new Audio();
      a.preload = "auto";
      a.oncanplaythrough = () => { sfxFilesRef.current[k] = url; };
      a.onerror = () => { /* 파일 없음 → 합성음 사용 */ };
      a.src = url;
    });
  }, [mounted]);

  const ensureAudio = () => {
    if (!soundOnRef.current) return null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      // 공용 리버브(잔향): 1.8초 감쇠 노이즈 임펄스 — 소리에 공간감·울림을 준다
      if (!reverbRef.current) {
        const len = Math.ceil(ctx.sampleRate * 1.8);
        const ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        reverbRef.current = conv;
      }
      return ctx;
    } catch { return null; }
  };

  const playSfx = useCallback((kind: string) => {
    if (!soundOnRef.current) return;
    // ① 실제 음원 파일이 있으면 우선 사용
    const fileUrl = sfxFilesRef.current[kind];
    if (fileUrl) {
      try { const a = new Audio(fileUrl); a.volume = 0.85; void a.play(); return; } catch { /* 합성음으로 진행 */ }
    }
    // ② 합성음 v2: 노이즈 층 + 왜곡 + 리버브
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0.55; out.connect(ctx.destination);
      const rev = reverbRef.current;
      const revSend = ctx.createGain(); revSend.gain.value = 0.5;
      if (rev) { revSend.connect(rev); rev.connect(out); } else { revSend.connect(out); }
      const toOut = (n: AudioNode, wet = 0.5) => { n.connect(out); const g = ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(revSend); };
      // 브라운 노이즈(우르릉·물소리용 — 흰 노이즈보다 훨씬 묵직)
      const brown = (dur: number) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        const s = ctx.createBufferSource(); s.buffer = buf; return s;
      };
      const white = (dur: number) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = ctx.createBufferSource(); s.buffer = buf; return s;
      };
      const dist = () => { // 크랙용 왜곡
        const ws = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(3.5 * x); }
        ws.curve = curve; return ws;
      };
      if (kind === "lightning") {
        // ①쩌억 크랙(왜곡 화이트노이즈) ②콰르릉 본체(브라운노이즈 5초, 필터 스윕+맥동) ③초저음 쿵
        const crack = white(0.14); const cf = ctx.createBiquadFilter(); cf.type = "highpass"; cf.frequency.value = 900;
        const cg = ctx.createGain(); cg.gain.setValueAtTime(1.0, t0); cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
        crack.connect(cf).connect(dist()).connect(cg); toOut(cg, 0.7); crack.start(t0);
        const body = brown(5); const bf = ctx.createBiquadFilter(); bf.type = "lowpass";
        bf.frequency.setValueAtTime(420, t0 + 0.06); bf.frequency.exponentialRampToValueAtTime(70, t0 + 4.5);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.001, t0 + 0.05); bg.gain.linearRampToValueAtTime(1.15, t0 + 0.16);
        bg.gain.setValueAtTime(1.15, t0 + 0.5); bg.gain.linearRampToValueAtTime(0.55, t0 + 1.1);
        bg.gain.linearRampToValueAtTime(0.85, t0 + 1.7); bg.gain.exponentialRampToValueAtTime(0.001, t0 + 4.8); // 우르릉 맥동
        body.connect(bf).connect(bg); toOut(bg, 0.6); body.start(t0 + 0.05);
        const sub = ctx.createOscillator(); sub.type = "sine";
        sub.frequency.setValueAtTime(52, t0); sub.frequency.exponentialRampToValueAtTime(30, t0 + 1.2);
        const sg = ctx.createGain(); sg.gain.setValueAtTime(0.9, t0); sg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);
        sub.connect(sg); toOut(sg, 0.2); sub.start(t0); sub.stop(t0 + 1.4);
      } else if (kind === "wave") {
        // 멀리서 밀려와 덮치는 파도: 브라운노이즈 스웰 + 부서질 때 화이트 스플래시
        const swell = brown(2.6); const sf = ctx.createBiquadFilter(); sf.type = "lowpass";
        sf.frequency.setValueAtTime(220, t0); sf.frequency.linearRampToValueAtTime(950, t0 + 0.8);
        sf.frequency.linearRampToValueAtTime(160, t0 + 2.5);
        const sg = ctx.createGain(); sg.gain.setValueAtTime(0.001, t0);
        sg.gain.linearRampToValueAtTime(1.1, t0 + 0.75); sg.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);
        swell.connect(sf).connect(sg); toOut(sg, 0.55); swell.start(t0);
        const splash = white(1.1); const pf = ctx.createBiquadFilter(); pf.type = "bandpass"; pf.frequency.value = 2400; pf.Q.value = 0.6;
        const pg = ctx.createGain(); pg.gain.setValueAtTime(0.001, t0 + 0.6);
        pg.gain.linearRampToValueAtTime(0.5, t0 + 0.8); pg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7);
        splash.connect(pf).connect(pg); toOut(pg, 0.6); splash.start(t0 + 0.6);
      } else if (kind === "wind") {
        const w = brown(1.6); const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.Q.value = 0.9;
        wf.frequency.setValueAtTime(300, t0); wf.frequency.linearRampToValueAtTime(1500, t0 + 0.7);
        wf.frequency.linearRampToValueAtTime(400, t0 + 1.5);
        const wg = ctx.createGain(); wg.gain.setValueAtTime(0.001, t0);
        wg.gain.linearRampToValueAtTime(0.9, t0 + 0.35); wg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
        w.connect(wf).connect(wg); toOut(wg, 0.45); w.start(t0);
      } else if (kind === "hail") {
        // 얼음 알갱이: 노이즈 틱(발진음 대신) — 유리알 떨어지는 느낌
        for (let i = 0; i < 9; i++) {
          const tk = white(0.045); const tf = ctx.createBiquadFilter(); tf.type = "bandpass";
          tf.frequency.value = 2600 + Math.random() * 2200; tf.Q.value = 7;
          const tg = ctx.createGain(); const ts = t0 + i * 0.05 + Math.random() * 0.02;
          tg.gain.setValueAtTime(0.65, ts); tg.gain.exponentialRampToValueAtTime(0.001, ts + 0.06);
          tk.connect(tf).connect(tg); toOut(tg, 0.5); tk.start(ts);
        }
      } else if (kind === "meteor") {
        const fall = brown(0.8); const ff = ctx.createBiquadFilter(); ff.type = "bandpass"; ff.Q.value = 1.5;
        ff.frequency.setValueAtTime(1800, t0); ff.frequency.exponentialRampToValueAtTime(120, t0 + 0.55);
        const fg = ctx.createGain(); fg.gain.setValueAtTime(0.001, t0);
        fg.gain.linearRampToValueAtTime(0.7, t0 + 0.3); fg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
        fall.connect(ff).connect(fg); toOut(fg, 0.4); fall.start(t0);
        const boom = brown(2.2); const bf2 = ctx.createBiquadFilter(); bf2.type = "lowpass"; bf2.frequency.value = 140;
        const bg2 = ctx.createGain(); bg2.gain.setValueAtTime(1.2, t0 + 0.5); bg2.gain.exponentialRampToValueAtTime(0.001, t0 + 2.4);
        boom.connect(bf2).connect(bg2); toOut(bg2, 0.6); boom.start(t0 + 0.5);
        const sub2 = ctx.createOscillator(); sub2.type = "sine"; sub2.frequency.setValueAtTime(48, t0 + 0.5);
        sub2.frequency.exponentialRampToValueAtTime(28, t0 + 1.4);
        const sg2 = ctx.createGain(); sg2.gain.setValueAtTime(0.8, t0 + 0.5); sg2.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5);
        sub2.connect(sg2); toOut(sg2, 0.2); sub2.start(t0 + 0.5); sub2.stop(t0 + 1.6);
      } else if (kind === "win") {
        // 팡파레: 디튠 2겹 + 리버브 → 게임기 소리 대신 풍성한 차임
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          const ts = t0 + i * 0.14;
          [0, 4].forEach((cents) => {
            const o = ctx.createOscillator(); o.type = "triangle";
            o.frequency.value = f * Math.pow(2, cents / 1200);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ts);
            g.gain.linearRampToValueAtTime(0.28, ts + 0.02); g.gain.exponentialRampToValueAtTime(0.001, ts + 0.9);
            o.connect(g); toOut(g, 0.75); o.start(ts); o.stop(ts + 1.0);
          });
        });
      }
    } catch { /* 소리 실패는 무시 — 연출은 계속 */ }
  }, []);


  const start = useCallback(() => {
    if (running.current) return;
    ensureAudio(); // [2026-07-26] 클릭(사용자 제스처) 시점에 오디오 활성화 — 미리보기 브라우저 자동재생 정책 대응
    running.current = true;
    setDemoElapsed(0);
  }, []);

  const demoWaiting=demoElapsed<0;
  useEffect(()=>{
    if(!preview||!demoScene)return;
    if(!previewControls&&demoWaiting){const t=setTimeout(()=>setDemoElapsed(0),3500);return()=>clearTimeout(t);}
    if(demoWaiting)return;
    const began=performance.now();let raf=0;
    const animate=()=>{const elapsed=Math.min(demoScene.durationMs,performance.now()-began);setDemoElapsed(elapsed);if(elapsed<demoScene.durationMs)raf=requestAnimationFrame(animate);else running.current=false;};
    raf=requestAnimationFrame(animate);return()=>cancelAnimationFrame(raf);
    // This clock starts once per preview scene, not once per rendered frame.
  },[preview,previewControls,demoScene,demoWaiting]);


  const soundCursor=useRef<{key:string;elapsed:number}|null>(null);
  useEffect(()=>{
    if(preview||!mounted)return;
    if(!shared.event||!shared.scene)return;
    const previous=soundCursor.current;
    // No historical audio on late join, reconnect, or a new event.
    if(previous?.key===shared.key&&shared.elapsed>=previous.elapsed&&shared.elapsed-previous.elapsed<=500){
      for(const round of shared.scene.rounds)if(round.at>previous.elapsed&&round.at<=shared.elapsed)playSfx(round.dis.id);if(previous.elapsed<shared.scene.durationMs&&shared.elapsed>=shared.scene.durationMs)playSfx("win");
    }
    soundCursor.current={key:shared.key,elapsed:shared.elapsed};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[preview,mounted,shared.scene,shared.event,shared.elapsed,shared.key]);

  useEffect(() => () => { running.current = false; }, []);

  const multi = winners.length > 1;

  // 클라 마운트 전(SSR 시점)에는 아무것도 안 그림 → Math.random 기반 렌더의 hydration 불일치 방지.
  if (!mounted) return null;
  // 실제 모드(OBS): 서버에 확정된 이벤트가 없으면 완전 투명(방송 화면에 빈 박스 안 뜨게).
  if(!preview&&!shared.event)return <EventClockStyles elapsedMs={0} sync={shared.sync}/>;
  const decorRandom=seededRandom(eventSeed(shared.key||"demo"));

  return (
    <div data-event-clock={preview?undefined:"shared"} data-event-key={preview?"demo":shared.key} data-elapsed-ms={Math.round(preview?demoElapsed:shared.elapsed)} data-event-phase={phase} data-survival-beat={frame?.beat} style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
      minHeight: "100vh", position: "relative", overflow: "hidden",
      display: "flex", alignItems: "flex-start", justifyContent: "center", background: "transparent",
      paddingTop: "1.5vh" }}>
      <EventClockStyles elapsedMs={shared.elapsed} localAgeMs={fx?shared.elapsed-fx.key:undefined} sync={shared.sync}/>
      <SurvivalArtStyles/>
      <SurvivalReactionStyles/>
      <style>{`
        @keyframes survivalEscape{0%,100%{transform:translateY(0) rotate(-12deg)}50%{transform:translateY(-5px) rotate(9deg)}}
        @keyframes survivalDuck{0%,100%{transform:scaleY(.78) rotate(-7deg)}50%{transform:scaleY(.86) rotate(7deg)}}
        @keyframes survivalLook{0%,40%,100%{transform:rotate(-8deg)}50%,80%{transform:rotate(8deg)}}
        @media(prefers-reduced-motion:reduce){[data-survival-art]{animation:none!important}.survival-stage *{transition:none!important}}
        .survival-stage{width:min(96vw,64.5vh);aspect-ratio:3/4;height:auto;container-type:inline-size}
        @supports(height:100dvh){.survival-stage{width:min(96vw,64.5dvh)}}
        @keyframes rainfall{to{transform:translateY(120vh)}}
        @keyframes flick{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes rise{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1)}}
        @keyframes spot{0%,100%{opacity:.45}50%{opacity:.85}}
        @keyframes waveSweep{0%{transform:translateX(-110%) skewX(-8deg)}100%{transform:translateX(110%) skewX(-8deg)}}
        @keyframes windSweep{0%{transform:translateX(-130%) rotate(-9deg);opacity:0}25%{opacity:.9}100%{transform:translateX(130%) rotate(-9deg);opacity:0}}
        @keyframes hailFall{0%{transform:translateY(-15%);opacity:0}20%{opacity:1}100%{transform:translateY(130%);opacity:.2}}
        @keyframes flashOut{0%{opacity:1}100%{opacity:0}}
        @keyframes stormFlash{0%{opacity:1}12%{opacity:.15}25%{opacity:.95}40%{opacity:.05}55%{opacity:.6}75%{opacity:.1}100%{opacity:0}}
        @keyframes stormDark{0%{opacity:0}20%{opacity:.55}100%{opacity:0}}
        @keyframes boltFade{0%{opacity:0}8%{opacity:1}55%{opacity:1}75%{opacity:.3}85%{opacity:.9}100%{opacity:0}}
        @keyframes tsunamiSweep{0%{transform:translateX(-118%) skewX(-6deg)}100%{transform:translateX(130%) skewX(-6deg)}}
        @keyframes tsunamiSweep2{0%{transform:translateX(-135%) skewX(-10deg) scaleY(.92)}100%{transform:translateX(125%) skewX(-10deg) scaleY(1)}}
        @keyframes foamBob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-9px) scale(1.25)}}
        @keyframes winnerPanelIn{0%{transform:translateY(24px);opacity:0}100%{transform:translateY(0);opacity:1}}
        @keyframes ringExpand{0%{width:8px;height:8px;opacity:.9}100%{width:64px;height:64px;opacity:0}}
        @keyframes burstPop{0%{transform:scale(.3);opacity:0}35%{transform:scale(1.5);opacity:1}100%{transform:scale(1);opacity:0}}
        @keyframes confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(420px) rotate(540deg);opacity:.9}}
        @keyframes crownBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes electroFlick{0%,100%{filter:none}20%{filter:brightness(4) drop-shadow(0 0 6px #FFE08A)}40%{filter:brightness(1.5)}60%{filter:brightness(4) drop-shadow(0 0 8px #FFF)}80%{filter:brightness(1.5)}}
        @keyframes zapShake{0%,100%{transform:translate(-50%,-50%)}15%{transform:translate(-54%,-52%) rotate(-7deg)}30%{transform:translate(-46%,-48%) rotate(6deg)}45%{transform:translate(-53%,-51%) rotate(-5deg)}60%{transform:translate(-47%,-50%) rotate(4deg)}80%{transform:translate(-51%,-50%) rotate(-2deg)}}
        @keyframes skullZap{0%{transform:scale(.2);opacity:0}22%{transform:scale(1.6);opacity:1}55%{transform:scale(1.2);opacity:1}100%{transform:scale(1.1);opacity:0}}
        @keyframes sparkFlick{0%,100%{opacity:1}33%{opacity:.15}66%{opacity:.9}}
      `}</style>

      {/* 명단과 진행 장면을 읽기 쉽게 세로 공간을 확대한다. 바깥 여백은 투명 유지. */}
      <div className="survival-stage" style={{ position: "relative",
        borderRadius: 20, overflow: "clip",
        background: "radial-gradient(ellipse at 50% 110%,#345d55 0%,transparent 65%),linear-gradient(180deg,#171d32,#273749 65%,#223a37)",
        border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>

        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: "-10%", left: `${decorRandom() * 100}%`,
            width: 1.5, height: 18, background: "linear-gradient(transparent,rgba(210,220,255,.5))",
            animation: `rainfall ${0.5 + decorRandom() * 0.5}s linear ${decorRandom()}s infinite`,
            opacity: phase === "running" ? 0.5 : 0.2 }} />
        ))}

        {/* HUD */}
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center",
          pointerEvents: "none", zIndex: 40, padding: "0 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.75)", letterSpacing: 2 }}>남은 사람</div>
          <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1,
            textShadow: "0 2px 12px rgba(0,0,0,.85)", fontVariantNumeric: "tabular-nums",
            animation: phase === "running" ? "flick .6s infinite" : "none" }}>
            {done ? winners.length : aliveCount}<span style={{ fontSize: 18, color: "rgba(255,255,255,.55)" }}> / {total}</span>
          </div>
          <div style={{ minHeight: 40, marginTop: 3 }}>
            {phase === "ready" && <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,.9)" }}>시작하면 재난이 몰아쳐요 ⚡ (생존 {winnerCount}명)</span>}
            {phase === "running" && message && (
              <div key={message.dead.join() + message.label} style={{ animation: "rise .3s ease" }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", textShadow: "0 1px 8px #000" }}>{message.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: GOLD, textShadow: "0 1px 8px #000" }}>
                  {message.dead.length>0?`💥 ${message.dead.length > 4 ? `${message.dead.length}명` : message.dead.join(", ")} 탈락!`: '어서 피하세요!'}
                </div>
              </div>
            )}
            {done && winners.length > 0 && (
              <div style={{ animation: "pop .5s ease" }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: GOLD, textShadow: "0 2px 12px #000" }}>
                  🎉 최종 생존자 {winners.length > 1 ? `${winners.length}명` : ""} 🎉
                </span>
              </div>
            )}
          </div>
        </div>

        {phase === 'ready' ? <div style={{position:'absolute',inset:'110px 10px 62px',zIndex:30}}><EventRoster names={players.map(p=>p.name)} characters/></div> : null}
        <div data-survival-camera data-camera-scale={frame?.camera.scale||1} style={{position:'absolute',inset:0,pointerEvents:'none',transformOrigin:'50% 50%',transform:`scale(${frame?.camera.scale||1}) translate(${50-(frame?.camera.x||50)}%,${50-(frame?.camera.y||50)}%)`}}>
        {frame?.warning?<div aria-hidden style={{position:'absolute',top:'12%',left:'-10%',right:'-10%',fontSize:'clamp(30px,16cqw,85px)',opacity:.65,pointerEvents:'none',display:'flex',justifyContent:'space-between',zIndex:20}}><span>{frame.warning.type==='wave'?'🌊':'☁️'}</span><span>{frame.warning.type==='meteor'?'☄️':'☁️'}</span></div>:null}
        {fx && <div data-event-local-age style={{position:"absolute",inset:0,pointerEvents:"none"}}><SurvivalDisaster fx={fx} /></div>}
        {(phase === 'ready' ? [] : players).map((p) => {
          const isW = winnerIdSet.has(p.id);
          const scale = isW ? (done ? (multi ? 1.7 : 2.6) : 1.7) : aliveCount <= 6 ? 1.4 : aliveCount <= NAME_SHOW_AT ? 1.15 : 1;
          // 단독 우승이면 가운데로 모음. 다중이면 제자리 강조.
          const cx = isW && done && !multi ? 50 : p.x;
          const cy = isW && done && !multi ? 52 : p.y;
          return (
            <div key={p.id} style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`,
              transform: p.dead ? deathTransform(p.dtype) : `translate(-50%,-50%) scale(${scale})`,
              transition: "opacity .3s ease",
              opacity: p.dead ? 0 : 1, visibility:p.hit?'hidden':undefined, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              zIndex: isW ? 30 : 10 }}>
              {isW && done && <div style={{ fontSize: multi ? 15 : 18, animation: "crownBounce 1s ease-in-out infinite" }}>👑</div>}
              {!p.dead && (showNames || isW) && (
                <span style={{ fontSize: isW && done ? (multi ? 12 : 14) : isW ? 12 : 10, fontWeight: 900,
                  color: isW ? "#231018" : "#fff", whiteSpace: "normal",maxWidth:'24cqw',overflowWrap:'anywhere',textAlign:'center',
                  background: isW ? GOLD : "rgba(0,0,0,.55)", padding: isW && done ? "2px 9px" : "1px 5px",
                  borderRadius: 7, lineHeight: 1.3,
                  boxShadow: isW && done ? "0 4px 14px rgba(240,196,90,.6)" : "none" }}>{p.name}</span>
              )}
              <div style={{ animation: isW ? "flick .6s ease-in-out infinite" : "none" }}>
                <SurvivalCharacter index={p.id} total={Math.max(8,aliveCount)} hit={p.hit} zap={p.hit && p.dtype === "lightning"} winner={isW} moving={phase === 'running' && !p.dead} pose={p.pose} facing={p.facing}/>
              </div>
              {isW && <div style={{ position: "absolute", inset: done && !multi ? -50 : -28, borderRadius: "50%",
                background: "radial-gradient(circle,rgba(240,196,90,.55),transparent 70%)",
                animation: "spot 1.1s infinite", zIndex: -1 }} />}
            </div>
          );
        })}

        {done && Array.from({ length: 32 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${decorRandom() * 100}%`,
            width: 6, height: 10, background: CONFETTI[i % CONFETTI.length], borderRadius: 2, zIndex: 35,
            animation: `confetti ${1.4 + decorRandom() * 1.2}s linear ${decorRandom() * 1.1}s infinite` }} />
        ))}

        {bursts.map(b=><SurvivalReaction key={b.id} type={b.dtype} index={Number(b.id.split("-")[0])} total={Math.max(8,aliveCount)} x={b.x} y={b.y}/>)}
        </div>

        {/* [2026-07-26 사장님] 다중 당첨자 명단 패널 — 여러 명일 때 하단에 크게, 잘 보이게 */}
        {done && multi && (
          <div style={{ position: "absolute", left: "50%", bottom: preview ? 66 : 18, transform: "translateX(-50%)",
            zIndex: 45, maxWidth: "92%", padding: "12px 18px 13px", borderRadius: 16,
            background: "rgba(18,10,16,.88)", border: `2px solid ${GOLD}`,
            boxShadow: "0 8px 32px rgba(0,0,0,.55), 0 0 24px rgba(240,196,90,.35)",
            animation: "winnerPanelIn .5s ease", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 8, textShadow: "0 1px 6px #000" }}>
              🏆 당첨자 {winners.length}명 🏆
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7 }}>
              {winners.map((w) => (
                <span key={w.id} style={{ fontSize: 16, fontWeight: 900, color: "#231018",
                  background: GOLD, padding: "4px 13px", borderRadius: 999, lineHeight: 1.4,
                  boxShadow: "0 3px 10px rgba(240,196,90,.45)" }}>{w.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* 진행자 컨트롤 — 미리보기(?preview=1)에서만. 실제 방송은 관리자 ▶돌리기가 서버로 트리거한다. */}
        {preview && previewControls ? (
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex",
          justifyContent: "center", gap: 8, zIndex: 70 }}>
          {!done ? (
            <button onClick={start} disabled={phase === "running"} style={{
              padding: "10px 26px", fontSize: 15, fontWeight: 900, borderRadius: 999, border: "none",
              cursor: phase === "running" ? "default" : "pointer", color: "#fff",
              background: phase === "running" ? "rgba(0,0,0,.5)" : ROSE, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
              {phase === "running" ? "폭풍 진행 중…" : "▶  시작 (미리보기)"}
            </button>
          ) : (
            <button onClick={reset} style={{ padding: "10px 26px", fontSize: 15, fontWeight: 900,
              borderRadius: 999, border: "none", cursor: "pointer", color: "#fff", background: ROSE,
              boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>🔄  다시 하기</button>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
