export type ProductIntroCapture = { videoId: string; seconds: number; capturedAt: number };
export type ProductIntro = ProductIntroCapture & { recordedAt: string };
export type IntroReplayRequest = ProductIntro & { key: number; name: string };
export type IntroReplayStatus = "loading" | "playing" | "unavailable";
export type IntroPlayerSample = { videoId: string; t: number; edge: number; start: number; at: number; state: number; live: boolean; atLiveHead: boolean | null };
const videoPattern = /^[\w-]{11}$/;
export function validateIntroCapture(raw: unknown, videoId: string, now = Date.now()): ProductIntroCapture | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ProductIntroCapture;
  if (!videoPattern.test(videoId) || p.videoId !== videoId || typeof p.seconds !== "number" || !Number.isFinite(p.seconds) || p.seconds < 0 || p.seconds > 172800 || typeof p.capturedAt !== "number" || !Number.isFinite(p.capturedAt) || now - p.capturedAt > 15000 || now - p.capturedAt < -5000) return null;
  return { videoId, seconds: Math.floor(p.seconds), capturedAt: p.capturedAt };
}
export function captureProductIntro(p: IntroPlayerSample, videoId: string, now = Date.now()): ProductIntroCapture | null {
  // A paused position stays valid until the player reports a seek/state change.
  // YouTube stops periodic position packets while paused, including on recordings.
  if (p.videoId !== videoId || ![1, 2].includes(p.state) || !Number.isFinite(p.at) || p.at <= 0 || (p.state !== 2 && now - p.at > 5000) || now < p.at || !Number.isFinite(p.t) || p.t < 0 || !Number.isFinite(p.edge) || p.edge <= 0 || !Number.isFinite(p.start) || p.start < 0 || p.t < p.start || p.t > p.edge + 2) return null;
  return validateIntroCapture({ videoId, seconds: Math.max(p.start, Math.floor(p.t) - 5), capturedAt: now }, videoId, now);
}
export function parseProductIntro(raw: unknown, videoId: string): ProductIntro | null {
  try {
    const p = (typeof raw === "string" ? JSON.parse(raw) : raw) as ProductIntro;
    if (!p || !Number.isFinite(Date.parse(p.recordedAt))) return null;
    const capture = validateIntroCapture(p, videoId, p.capturedAt);
    return capture ? { ...capture, recordedAt: p.recordedAt } : null;
  } catch { return null; }
}
/** Bounded seeking. Never report success until this iframe confirms the requested position. */
export function createIntroReplay(io: { now: () => number; seek: (seconds: number) => void; status: (status: IntroReplayStatus) => void }) {
  let target: number | null = null, deadline = 0, sent = false, attempts = 0, lastAttempt = 0;
  const fail = () => { target = null; io.status("unavailable"); };
  return {
    start(seconds: number) { target = seconds; deadline = io.now() + 12000; sent = false; attempts = 0; lastAttempt = 0; io.status("loading"); },
    cancel() { target = null; },
    tick() { if (target !== null && io.now() >= deadline) fail(); },
    info(info: Record<string, unknown>) {
      if (target === null) return;
      if (io.now() >= deadline) { fail(); return; }
      const t = info.currentTime;
      if (sent && typeof t === "number" && Math.abs(t - target) <= 5 && info.playerState === 1) { target = null; io.status("playing"); return; }
      const progress = info.progressState as { seekableStart?: number; seekableEnd?: number } | undefined;
      const end = progress?.seekableEnd ?? info.duration;
      const start = progress?.seekableStart ?? 0;
      if (typeof end !== "number" || !Number.isFinite(end) || end <= 0) return;
      if (target < start || target > end) { fail(); return; }
      if (attempts < 3 && (!sent || io.now() - lastAttempt >= 2000)) {
        sent = true; attempts++; lastAttempt = io.now(); io.seek(target);
      }
    },
  };
}

/** Match the existing option model: legacy combos keep the detail in color; linked sources own their ID. */
export function introTargetForOptions(p: { productId: string; parentId: string; detail: string; color: string; hasAxes: boolean; hasCombo: boolean }) {
  return { productId: p.productId, detailName: p.productId !== p.parentId ? "" : p.hasAxes ? p.detail : p.hasCombo ? p.color : p.detail };
}
