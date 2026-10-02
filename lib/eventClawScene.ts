export type MotionState = {
  phase:
    | "idle"
    | "move-miss"
    | "drop-miss"
    | "grab-miss"
    | "lift-miss"
    | "fall-miss"
    | "move-catch"
    | "drop-catch"
    | "grab-catch"
    | "lift-catch"
    | "result";
  x: number;
  cable: number;
  clawClosed: boolean;
  showPrize: boolean;
  prizeX: number;
  prizeY: number;
  showResult: boolean;
  isMiss: boolean;
};

function easeInOut(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * easeInOut(t);
}

export function clawDurationMs(seed: number): number {
  const missCount = seed % 3;
  const moveMissMs = 2300, dropMissMs = 2200, grabMissMs = 700, liftMissMs = 1500, fallMissMs = 1100;
  const moveCatchMs = 2100, dropCatchMs = 2200, grabCatchMs = 700, liftCatchMs = 2200;
  const missTotal = missCount * (moveMissMs + dropMissMs + grabMissMs + liftMissMs + fallMissMs);
  const catchTotal = moveCatchMs + dropCatchMs + grabCatchMs + liftCatchMs;
  return missTotal + catchTotal;
}

export function sampleClawMotion(elapsedMs: number, seed: number, hasResult: boolean, now: number): MotionState {
  const topCable = 54;
  const deepCable = 292;
  const midCable = 178;

  const idleX = Math.sin(now / 1500) * 86;

  if (!hasResult) {
    return {
      phase: "idle",
      x: idleX,
      cable: topCable,
      clawClosed: false,
      showPrize: false,
      prizeX: idleX,
      prizeY: 0,
      showResult: false,
      isMiss: false,
    };
  }

  const missCount = seed % 3;

  const missXOptions = [-58, -22, 42];
  const catchXOptions = [-26, 6, 30];
  const catchX = catchXOptions[seed % catchXOptions.length];

  const moveMissMs = 2300;
  const dropMissMs = 2200;
  const grabMissMs = 700;
  const liftMissMs = 1500;
  const fallMissMs = 1100;
  const moveCatchMs = 2100;
  const dropCatchMs = 2200;
  const grabCatchMs = 700;
  const liftCatchMs = 2200;

  let t = elapsedMs;
  let prevX = idleX;

  for (let i = 0; i < missCount; i++) {
    const missX = missXOptions[(seed + i * 7) % missXOptions.length];

    if (t <= moveMissMs) {
      return { phase: "move-miss", x: lerp(prevX, missX, t / moveMissMs), cable: topCable, clawClosed: false, showPrize: false, prizeX: missX, prizeY: deepCable, showResult: false , isMiss: true};
    }
    t -= moveMissMs;

    if (t <= dropMissMs) {
      return { phase: "drop-miss", x: missX, cable: lerp(topCable, deepCable, t / dropMissMs), clawClosed: false, showPrize: false, prizeX: missX, prizeY: deepCable, showResult: false , isMiss: true};
    }
    t -= dropMissMs;

    if (t <= grabMissMs) {
      return { phase: "grab-miss", x: missX, cable: deepCable, clawClosed: t > grabMissMs * 0.65, showPrize: true, prizeX: missX, prizeY: deepCable + 6, showResult: false , isMiss: true};
    }
    t -= grabMissMs;

    if (t <= liftMissMs) {
      // 인형을 집게로 잡고 위로 끌어올리는 중 (집게 닫힘, 인형 같이 상승)
      return { phase: "lift-miss", x: missX, cable: lerp(deepCable, midCable, t / liftMissMs), clawClosed: true, showPrize: true, prizeX: missX, prizeY: lerp(deepCable + 6, midCable + 4, t / liftMissMs), showResult: false , isMiss: true};
    }
    t -= liftMissMs;

    if (t <= fallMissMs) {
      // 올라오던 도중 아슬아슬하게 놓침: 집게는 그 높이에 머물고(살짝 흔들), 인형만 아래로 떨어진다
      const fp = t / fallMissMs;
      const clawShake = Math.sin(fp * Math.PI * 3) * 4;
      return { phase: "fall-miss", x: missX + clawShake, cable: midCable, clawClosed: fp < 0.18, showPrize: true, prizeX: missX, prizeY: lerp(midCable + 4, deepCable + 16, fp), showResult: false , isMiss: true};
    }
    t -= fallMissMs;

    prevX = missX + 10;
  }

  if (t <= moveCatchMs) {
    return { phase: "move-catch", x: lerp(prevX, catchX, t / moveCatchMs), cable: topCable, clawClosed: false, showPrize: false, prizeX: catchX, prizeY: deepCable, showResult: false , isMiss: false};
  }
  t -= moveCatchMs;

  if (t <= dropCatchMs) {
    return { phase: "drop-catch", x: catchX, cable: lerp(topCable, deepCable + 8, t / dropCatchMs), clawClosed: false, showPrize: false, prizeX: catchX, prizeY: deepCable + 8, showResult: false , isMiss: false};
  }
  t -= dropCatchMs;

  if (t <= grabCatchMs) {
    return { phase: "grab-catch", x: catchX, cable: deepCable + 8, clawClosed: t > grabCatchMs * 0.65, showPrize: true, prizeX: catchX, prizeY: deepCable + 12, showResult: false , isMiss: false};
  }
  t -= grabCatchMs;

  if (t <= liftCatchMs) {
    return { phase: "lift-catch", x: catchX, cable: lerp(deepCable + 8, 126, t / liftCatchMs), clawClosed: true, showPrize: true, prizeX: catchX, prizeY: lerp(deepCable + 12, 160, t / liftCatchMs), showResult: false , isMiss: false};
  }

  return { phase: "result", x: catchX, cable: 108, clawClosed: true, showPrize: true, prizeX: catchX, prizeY: 142, showResult: true , isMiss: false};
}
