import {calculateEventDurationMs,raceWinnerGapMs,seededRandom,winnerIndices,type PlaybackInput} from "./eventPlayback";
function runnerColor(i: number): string {
  const hue = (i * 137.508) % 360;
  const sat = 68 + (i % 3) * 8;   // 68/76/84
  const light = 56 + (i % 4) * 5; // 56~71
  return `hsl(${hue.toFixed(0)}, ${sat}%, ${light}%)`;
}

export type Runner = {
  id: number;
  name: string;
  y: number;          // 세로 위치(%) — 무리(crowd) 흩뿌림. 레인 없음(마라톤 방식).
  color: string;
  role: "win" | "lose"; // 당첨자(결승 통과)/일반(통과 못 함)
  crossTime: number;  // 초 — 당첨자가 결승선을 '끊는' 시각(순서대로 → 통과 순서 보존). 일반=Infinity.
  lungeDur: number;   // 결승 런지 길이(초) — 러너마다 달라 통과 방식 제각각(멀리서 길게/코앞서 툭).
  lungePow: number;   // 런지 가속 지수(러너마다 달라)
  sprintB: number;    // 마지막 스퍼트 가속 배율(러너마다 달라 — 어떤 당첨자는 확 치고 나옴)
  spd: number;        // 기본 전진 속도(%/s)
  amp: number;        // 속도 진동 진폭(0~1) — 러너끼리 앞서거니 뒤서거니(엎치락뒤치락). 속도만 흔들어 절대 뒤로 안 감.
  w: number;          // 속도 진동 각속도
  phase: number;      // 속도 진동 위상(러너마다 달라 leapfrog)
  bx: number;         // 적분된 기본 위치(아이템 전) — 매 프레임 전진 누적.
  x: number;          // 화면 표시 위치 0~100 (아이템 반영, 100=결승선).
  lunge: { x0: number; t0: number; dur: number; pow: number } | null; // 결승 런지 상태(당첨자만)
  rank: number | null;
  hit: boolean;       // 아이템 맞아 뱅글뱅글(카트라이더) 상태
  fallen: boolean;    // 넘어짐 상태
};

// 렌더용 이펙트 조각(매 프레임 refs에서 재구성). kind에 따라 표현 다름.
//   fly=날아가는 발사체(미사일), ground=바닥 아이템(바나나), puff=충돌/부스터 순간 이펙트
type ItemFx = { id: string; emoji: string; x: number; y: number; kind: "fly" | "ground" | "puff" | "boom" };
// 소스 오브젝트(refs 보관)
type Shot = { id: string; emoji: string; fromX: number; fromY: number; toX: number; toY: number; targetId: number; born: number; dur: number; resolved: boolean; clutch?: boolean };
type Banana = { id: string; x: number; y: number; born: number; consumed: boolean };
type Puff = { id: string; emoji: string; x: number; y: number; born: number; big?: boolean };

const TRACK_TOP = 24;    // % — HUD 아래
const TRACK_BOTTOM = 94; // %
const FINISH_PCT = 88;   // 결승선 화면 위치(%). x=100이 여기에 매핑됨.
const START_PCT = 4;
const RACE_LEAD = 8.0;   // 첫 당첨자 결승선 통과 시각(초) — 게임 길이 기준(카운트다운 별도)
const SPRINT = 5.8;      // 마지막 스퍼트 시작(초) — 선두 무리가 결승선 코앞까지 몰려가 난투극
const LOSE_CAP = 95;     // 일반 러너 진행 상한(%) — 결승선(100) 코앞까지 갔다가 못 넘음(덴탈 대상).
const WIN_CAP = 92;      // 당첨자 런지 전 상한(%) — 결승선 바로 앞에 붙음 → 런지 짧아져 '후다닥' 안 됨
const MAXBACK = 3.0;     // 한 프레임 최대 뒤로 이동(%) — 아이템 넉백이 순간이동식으로 튀지 않게(부드러운 스텀블)


export type RaceFrame={phase:"ready"|"countdown"|"running"|"done";runners:Runner[];items:ItemFx[];shaking:boolean;winners:Runner[];leader:string;finalSprint:boolean;countText:string};
export type RaceScene={frames:RaceFrame[];winnerIds:number[];durationMs:number};
export function buildRaceScene(input:PlaybackInput,seed:number):RaceScene {
const rand=seededRandom(seed);
function makeRunners(names: string[] | null, n: number, winnerOrder: string[]): Runner[] {
  const list = names || []; const total = list.length;
  // 당첨자 닉네임 → 결승 순서 인덱스(0=1등). 없으면 -1(일반 러너).
  const winIdx = new Map<number,number>(); winnerIndices(list,winnerOrder).forEach((id,i)=>winIdx.set(id,i));

  // [2026-07-26 재설계] 엎치락뒤치락 + 결승선 역전 연출.
  //   ▸ 위치는 매 프레임 "속도"를 적분해 전진(animate). 속도만 진동(amp/w/phase)시켜 서로 앞서거니 뒤서거니 →
  //     leapfrog(엎치락뒤치락). 속도는 항상 ≥0이라 절대 뒤로 안 감(옛 출렁임 버그 원인=위치에 sine 더한 것과 다름).
  //   ▸ 일반 러너: 빨리 치고 나가 선두 무리 형성(트랙 전체로 펼침), 상한 LOSE_CAP(<100)에서 결승선 못 넘음.
  //   ▸ 당첨자: 중상위권에 섞여 달리다, 지정 순서(crossTime) 되면 결승 런지로 앞 무리 제치고 통과 → 역전.
  //     crossTime이 gap 간격으로 순서대로라 통과 순서=서버 지정 순서 보존(런지 시간 동일 → 추월 불가).
  const K = winnerOrder.length;
  const WIN_WINDOW = Math.min(2.6, Math.max(0.9, K * 0.45)); // 당첨자 통과 총폭(포토피니시)
  const gap = Math.min(0.6, WIN_WINDOW / Math.max(1, K));    // 당첨자 간 통과 간격
  const spread = TRACK_BOTTOM - TRACK_TOP;
  return list.map((name, i) => {
    const wi = winIdx.has(i) ? (winIdx.get(i) as number) : -1;
    const amp = 0.5 + rand() * 0.35;      // 속도 진동 진폭 — 클수록 확확 치고 나감(<1이라 항상 전진)
    const w = 2.0 + rand() * 2.2;         // 진동 각속도
    const phase = rand() * Math.PI * 2;   // 위상(러너마다 달라 leapfrog)
    if (wi >= 0) {
      return {
        id: i, name, role: "win" as const,
        crossTime: RACE_LEAD + wi * gap + rand() * Math.min(.12,gap*.8), // 결승선 끊는 시각(순서 보존 + 약간 랜덤)
        lungeDur: 0.45 + rand() * 0.5,     // 통과 방식 제각각: 멀리서 길게(큰값)/코앞서 툭(작은값)
        lungePow: 1.2 + rand() * 0.7,      // 가속 지수도 제각각
        sprintB: 1.8 + rand() * 1.6,       // 스퍼트 가속 제각각(어떤 당첨자는 확 치고 나옴)
        spd: 8.0 + rand() * 2.0,           // 당첨자: 중상위권 속도
        amp, w, phase, color: runnerColor(i),
        y: TRACK_TOP + spread * (0.16 + rand() * 0.68),
        bx: 0, x: 0, lunge: null, rank: null, hit: false, fallen: false,
      };
    }
    return {
      id: i, name, role: "lose" as const,
      crossTime: Infinity, lungeDur: 0, lungePow: 1,
      sprintB: 1.4 + rand() * 0.7,         // 일반도 스퍼트엔 결승선으로 몰림(선두 무리 형성)
      spd: 6.5 + rand() * 5.0,             // 빠른 러너는 선두, 느린 러너는 후미(펼침)
      amp, w, phase, color: runnerColor(i),
      y: TRACK_TOP + spread * rand(),
      bx: 0, x: 0, lunge: null, rank: null, hit: false, fallen: false,
    };
  });
}


const runnersRef={current:makeRunners(input.participants,input.participants.length,input.winners)};
const bumpRef={current:{} as Record<number,number>},offRef={current:{} as Record<number,number>},hitUntilRef={current:{} as Record<number,number>},fallUntilRef={current:{} as Record<number,number>};
const shotsRef={current:[] as Shot[]},bananasRef={current:[] as Banana[]},puffsRef={current:[] as Puff[]};
const nextShotRef={current:0},nextBananaRef={current:0},nextBoostRef={current:0},nextClutchRef={current:0},lastElapsedRef={current:0},idSeqRef={current:0};
const lastCrossRef={current:8+(input.winners.length-1)*raceWinnerGapMs(input.winners.length)/1000+.12};
let shakeUntil=0,clock=0;

  const nid = () => `fx${idSeqRef.current++}`;
  // 큰 충돌 시 화면 흔들림(중복 방지). 결승 clutch·선두 와이프아웃에만.
  const triggerShake = () => {shakeUntil = clock+320;};
  const BOOMS = ["꽝!", "펑!", "쿵!", "퍽!"];

  // 🚀 미사일 발사 — 뒷사람이 앞사람(선두권)에게 발사. 날아가서 맞으면 뱅글/넘어짐 + 감속.
  const spawnShot = (now: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null && !r.lunge);
    if (alive.length < 5) return;
    // 표적은 '선두 무리'(상위 6명) — 시청자 눈이 보는 곳에서 사고가 나야 극적임.
    const leaders = [...alive].sort((a, b) => b.x - a.x).slice(0, Math.min(6, alive.length));
    const target = leaders[Math.floor(rand() * leaders.length)];
    const behind = alive.filter((r) => r.x < target.x - 3 && r.id !== target.id);
    const attacker = behind.length ? behind[Math.floor(rand() * behind.length)] : alive[Math.floor(rand() * alive.length)];
    if (!attacker || attacker.id === target.id) return;
    shotsRef.current.push({ id: nid(), emoji: "☄️", fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, targetId: target.id, born: now, dur: 340, resolved: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  // 🎯 지정 대상 미사일(결승 clutch용) — 대상 뒤 러너가 발사. 선두(비당첨)에게 꽂아 1등 뺏김 연출.
  const spawnShotAt = (now: number, target: Runner, dur: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null && !r.lunge && r.id !== target.id);
    const behind = alive.filter((r) => r.x < target.x);
    const attacker = behind.length ? behind[Math.floor(rand() * behind.length)] : (alive.length ? alive[Math.floor(rand() * alive.length)] : null);
    const fromX = attacker ? attacker.x : Math.max(2, target.x - 18);
    const fromY = attacker ? attacker.y : target.y;
    shotsRef.current.push({ id: nid(), emoji: "☄️", fromX, fromY, toX: target.x, toY: target.y, targetId: target.id, born: now, dur, resolved: false, clutch: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  // 🍌 바닥 바나나 — 앞쪽 트랙 임의 위치에 깔림. 러너가 밟으면 미끄러짐.
  const spawnBanana = (now: number) => {
    const x = 20 + rand() * 55; // 트랙 중앙대
    const y = TRACK_TOP + 4 + rand() * (TRACK_BOTTOM - TRACK_TOP - 8);
    bananasRef.current.push({ id: nid(), x, y, born: now, consumed: false });
  };

  // 💨 부스터 — 러너 하나가 가속.
  const spawnBoost = (now: number) => {
    const alive = runnersRef.current.filter((r) => r.rank === null);
    if (alive.length < 3) return;
    const b = alive[Math.floor(rand() * alive.length)];
    bumpRef.current[b.id] = (bumpRef.current[b.id] || 0) + (6 + rand() * 7);
    puffsRef.current.push({ id: nid(), emoji: "💨", x: Math.max(2, b.x - 5), y: b.y, born: now });
  };


const durationMs=calculateEventDurationMs("race",input.participants,input.winners,seed),frames:RaceFrame[]=[];
const winnerIds=winnerIndices(input.participants,input.winners);
for(let ms=0;ms<=Math.ceil(Math.max(0,durationMs-2800)/50)*50;ms+=50){
    const now = ms;clock=now;
    const elapsed = ms / 1000;
    const dt = Math.min(0.05, Math.max(0, elapsed - lastElapsedRef.current)); // 탭 비활성 등 큰 점프 방지
    lastElapsedRef.current = elapsed;

    // 아이템 스케줄(마지막 스퍼트 전까지 — 스퍼트 구간은 결승선 덴탈이 담당). 자주 터져 시끌시끌.
    const itemWindow = elapsed > 0.8 && elapsed < SPRINT;
    if (itemWindow) {
      if (elapsed > nextShotRef.current) { spawnShot(now); nextShotRef.current = elapsed + 0.45 + rand() * 0.5; }
      if (elapsed > nextBananaRef.current) { spawnBanana(now); nextBananaRef.current = elapsed + 0.8 + rand() * 0.8; }
      if (elapsed > nextBoostRef.current) { spawnBoost(now); nextBoostRef.current = elapsed + 1.0 + rand() * 1.0; }
    }

    // 🎯 결승선 덴탈: 스퍼트 동안 결승선 코앞(x>78) 선두 비당첨자에게 미사일 반복 발사 →
    //    "1등 눈앞에서 자빠지고 뒤에서 당첨자가 통과"가 결승선에서 계속 벌어짐(반전의 반전).
    if (elapsed > SPRINT + 0.3 && elapsed < lastCrossRef.current + 0.1 && elapsed > nextClutchRef.current) {
      const lead = runnersRef.current
        .filter((r) => r.role === "lose" && r.rank === null && !r.lunge && r.x > 78)
        .sort((a, b) => b.x - a.x)[0];
      if (lead) spawnShotAt(now, lead, 200);
      nextClutchRef.current = elapsed + 0.34 + rand() * 0.15;
    }

    // 미사일 도착 처리: 명중 → 대상 뱅글/넘어짐 + 감속 + 💥 (clutch는 더 세게)
    for (const s of shotsRef.current) {
      if (!s.resolved && now >= s.born + s.dur) {
        s.resolved = true;
        const tgt = runnersRef.current.find((r) => r.id === s.targetId && r.rank === null && !r.lunge);
        if (tgt) {
          const mag = s.clutch ? (10 + rand() * 6) : (5 + rand() * 5);
          bumpRef.current[tgt.id] = (bumpRef.current[tgt.id] || 0) - mag;
          const fall = s.clutch ? true : rand() < 0.55; // clutch는 무조건 자빠짐(1등 뺏김)
          if (fall) {
            fallUntilRef.current[tgt.id] = now + 850;         // 넘어져 드러눕고 그동안 정지 → 제쳐짐
            puffsRef.current.push({ id: nid(), emoji: "💥", x: s.toX, y: s.toY, born: now });
            puffsRef.current.push({ id: nid(), emoji: BOOMS[Math.floor(rand() * BOOMS.length)], x: s.toX, y: s.toY, born: now, big: true });
            triggerShake();
          } else {
            hitUntilRef.current[tgt.id] = now + 620;
            puffsRef.current.push({ id: nid(), emoji: "💥", x: s.toX, y: s.toY, born: now });
          }
        }
      }
    }
    // 오래된 것 정리
    shotsRef.current = shotsRef.current.filter((s) => now - s.born < s.dur + 120);
    bananasRef.current = bananasRef.current.filter((b) => !b.consumed && now - b.born < 6000);
    puffsRef.current = puffsRef.current.filter((p) => now - p.born < 750);

    // ── 러너 갱신(refs 직접 갱신 — 속도 적분 상태 유지). React 렌더는 아래 스로틀에서 복제 반영.
    for (const r of runnersRef.current) {
      if (r.rank !== null) continue;
      // (1) 결승 런지: crossTime-lungeDur에 돌입해 crossTime에 결승선(100) 통과. 통과 '시각'이 순서대로라
      //     런지 길이/가속이 러너마다 달라도(멀리서 길게/코앞서 툭) 통과 순서=서버 지정 순서 100% 보존.
      if (r.role === "win" && !r.lunge && elapsed >= r.crossTime - r.lungeDur) {
        r.lunge = { x0: r.x, t0: elapsed, dur: Math.max(0.15, r.crossTime - elapsed), pow: r.lungePow };
      }
      if (r.lunge) {
        const p = Math.min(1, (elapsed - r.lunge.t0) / r.lunge.dur);
        r.x = r.lunge.x0 + (100 - r.lunge.x0) * Math.pow(p, r.lunge.pow); // 러너별 제각각 대시
        r.hit = false; r.fallen = false;
        if (p >= 1) {
          r.x = 100;
          const rank = winnerIds.indexOf(r.id)+1;
          r.rank = rank;
 
        }
        continue;
      }
      // (2) 속도 적분(항상 전진). 속도만 진동 → 서로 앞서거니 뒤서거니(엎치락뒤치락). 절대 뒤로 안 감.
      //     ★맞으면 실제로 멈춤/느려짐 → 제쳐짐(손해가 눈에 보임). 당첨자는 crossTime 런지로 통과라 순서 무관.
      let v = r.spd * (1 + r.amp * Math.sin(r.w * elapsed + r.phase));
      if (v < 0) v = 0;
      if (elapsed > SPRINT) v *= r.sprintB; // 마지막 스퍼트: 선두 무리가 결승선 코앞까지 몰림(런지 짧아짐)
      const isDown = now < (fallUntilRef.current[r.id] || 0);
      const isHit = !isDown && now < (hitUntilRef.current[r.id] || 0);
      if (isDown) v = 0;          // 쓰러진 동안 완전 정지(드러누움)
      else if (isHit) v *= 0.3;   // 맞고 비틀 — 크게 느려짐
      r.bx += v * dt;
      const cap = r.role === "win" ? WIN_CAP : LOSE_CAP;
      if (r.bx > cap) r.bx = cap;
      // (3) 아이템 오프셋(부드럽게 추격 → 순간이동 방지) + 한 프레임 최대 뒤로 제한
      let bump = bumpRef.current[r.id] || 0;
      bump *= 0.93;
      if (Math.abs(bump) < 0.15) bump = 0;
      bumpRef.current[r.id] = bump;
      let off = offRef.current[r.id] || 0;
      off += (bump - off) * 0.25;
      if (Math.abs(off) < 0.05) off = 0;
      offRef.current[r.id] = off;
      let vis = r.bx + off;
      if (vis > cap) vis = cap;
      if (vis < 0) vis = 0;
      if (vis < r.x - MAXBACK) vis = r.x - MAXBACK; // 넉백은 스텀블로(순간이동 금지)
      // (4) 바나나 스윕 충돌: 두 프레임 사이에 지나쳤으면 반드시 밟힘(빠르게 지나가도 안 놓침)
      for (const b of bananasRef.current) {
        if (b.consumed) continue;
        const crossed = (r.x <= b.x && vis >= b.x) || Math.abs(vis - b.x) < 2.6;
        if (crossed && Math.abs(r.y - b.y) < 7) {
          b.consumed = true;
          bumpRef.current[r.id] = (bumpRef.current[r.id] || 0) - (4 + rand() * 4);
          hitUntilRef.current[r.id] = now + 550;
          puffsRef.current.push({ id: nid(), emoji: "💫", x: b.x, y: b.y, born: now });
        }
      }
      r.x = vis;
      r.fallen = now < (fallUntilRef.current[r.id] || 0);
      r.hit = !r.fallen && now < (hitUntilRef.current[r.id] || 0);
    }

      const fx: ItemFx[] = [];
      for (const s of shotsRef.current) {
        const p = Math.min(1, (now - s.born) / s.dur);
        fx.push({ id: s.id, emoji: s.emoji, x: s.fromX + (s.toX - s.fromX) * p, y: s.fromY + (s.toY - s.fromY) * p, kind: "fly" });
      }
      for (const b of bananasRef.current) if (!b.consumed) fx.push({ id: b.id, emoji: "🍌", x: b.x, y: b.y, kind: "ground" });
      for (const p of puffsRef.current) fx.push({ id: p.id, emoji: p.emoji, x: p.x, y: p.y, kind: p.big ? "boom" : "puff" });

const runners=runnersRef.current.map(r=>({...r,lunge:r.lunge?{...r.lunge}:null}));
frames.push({phase:"running",runners,items:fx,shaking:ms<shakeUntil,winners:winnerIds.map(id=>runners[id]).filter(r=>r.rank!==null),leader:[...runners].filter(r=>r.rank===null).sort((a,b)=>b.x-a.x)[0]?.name||"",finalSprint:ms/1000>SPRINT,countText:""});
}
return {frames,winnerIds,durationMs};
}
export function sampleRaceScene(scene:RaceScene,elapsedMs:number):RaceFrame {
const done=elapsedMs>=scene.durationMs,t=Math.max(0,elapsedMs-2800),index=Math.min(scene.frames.length-1,Math.floor(t/50)),a=scene.frames[index],b=scene.frames[Math.min(index+1,scene.frames.length-1)],p=t/50-Math.floor(t/50);
const runners=a.runners.map((r,i)=>({...r,x:r.x+(b.runners[i].x-r.x)*p,y:r.y+(b.runners[i].y-r.y)*p}));
if(done){for(const [rank,id] of scene.winnerIds.entries()){runners[id]={...runners[id],x:100,rank:rank+1,hit:false,fallen:false};}}
return {...a,runners,phase:done?"done":elapsedMs<0?"ready":elapsedMs<2800?"countdown":"running",winners:done?scene.winnerIds.map(id=>runners[id]):scene.winnerIds.map(id=>runners[id]).filter(r=>r.rank!==null),countText:elapsedMs<0||elapsedMs>=2800?"":elapsedMs<700?"3":elapsedMs<1400?"2":elapsedMs<2100?"1":"출발!",items:done||elapsedMs<2800?[]:a.items};
}
