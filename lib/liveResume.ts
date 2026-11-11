/** Lifecycle recovery only. Playback positions always come from fresh player telemetry. */
export function createLiveResume(io: {
  now: () => number;
  send: (func: "seekTo" | "playVideo", args: unknown[]) => void;
  listen: () => void;
  onBlocked: (blocked: boolean) => void;
}) {
  let live = false, state = -1, t = 0, edge = 0, head: boolean | null = null;
  let follow = false, manualPaused = false, manualReview = false, ignoreHeadUntil = 0;
  let away = false, eligible = false, leftAt = 0, leftEdge = 0;
  let deadline = 0, attempts = 0, lastSeek = 0, lastListen = 0, freshEdge = false, disposed = false;
  const cancel = () => { deadline = 0; attempts = 0; freshEdge = false; };
  const listen = () => { lastListen = io.now(); io.listen(); };
  const nearEdge = () => edge > 0 && t >= 0 && Math.abs(edge - t) < 5;
  const isHead = () => head !== false && nearEdge();
  return {
    info(info: Record<string, unknown>) {
      if (disposed) return;
      const now = io.now();
      const vd = info.videoData as { isLive?: unknown } | undefined;
      if (typeof vd?.isLive === "boolean") live = vd.isLive;
      if (typeof info.playerState === "number") state = info.playerState;
      const newTime = typeof info.currentTime === "number" && Number.isFinite(info.currentTime);
      if (newTime) t = info.currentTime as number;
      const progress = info.progressState as { seekableEnd?: unknown; isAtLiveHead?: unknown } | undefined;
      const newEdge = typeof progress?.seekableEnd === "number" && Number.isFinite(progress.seekableEnd) && progress.seekableEnd > 0;
      if (newEdge) edge = progress!.seekableEnd as number;
      if (newEdge) head = null;
      if (typeof progress?.isAtLiveHead === "boolean") head = progress.isAtLiveHead;
      if (away) return; // Background pause/old packets must not erase the pre-leave intent.
      if (!live || state === 0) { follow = false; cancel(); io.onBlocked(false); return; }
      if (deadline) {
        if (now >= deadline) { cancel(); io.onBlocked(true); return; }
        // Long absence: do not mistake a buffered pre-hide packet for the new live edge.
        if (newEdge && (now - leftAt < 2000 || edge > leftEdge)) freshEdge = true;
        if (!freshEdge) return;
        if (newTime && isHead() && state === 1) { cancel(); follow = true; io.onBlocked(false); return; }
        if (newEdge && attempts < 3 && (!lastSeek || now - lastSeek >= 1000)) {
          attempts++; lastSeek = now;
          io.send("seekTo", [edge, true]); io.send("playVideo", []);
        }
      } else if (!manualPaused && state !== 2 && now >= ignoreHeadUntil) {
        if (manualReview) {
          // Only fresh, explicit live-head confirmation can end deliberate replay.
          if (!(newTime && newEdge && progress?.isAtLiveHead === true && nearEdge())) return;
          manualReview = false;
        }
        follow = [1, 3].includes(state) && isHead();
        if (follow) io.onBlocked(false);
      }
    },
    leave() {
      if (disposed || away) return;
      eligible = Boolean(deadline) || (follow && !manualPaused);
      away = true; leftAt = io.now(); leftEdge = edge; cancel();
    },
    return() {
      if (disposed || !away) return;
      away = false;
      if (!eligible || !live || state === 0) { follow = false; return; }
      head = null;
      deadline = io.now() + 15000; attempts = 0; lastSeek = 0; freshEdge = false;
      listen();
      // Paused YouTube stops refreshing its DVR edge; resume before awaiting it.
      io.send("playVideo", []);
    },
    action(func: string, args: unknown[] = []) {
      if (disposed) return;
      if (!["seekTo", "pauseVideo", "playVideo", "live"].includes(func)) return;
      cancel(); eligible = false; io.onBlocked(false);
      if (func === "pauseVideo") { manualPaused = true; follow = false; }
      else if (func === "seekTo") {
        manualPaused = false; manualReview = true; follow = false; head = null;
        // A delayed pre-seek live-head packet must not undo explicit rewind intent.
        ignoreHeadUntil = io.now() + 2000;
        if (typeof args[0] === "number") t = args[0];
      } else {
        manualPaused = false;
        if (func === "live") { manualReview = false; head = null; follow = true; ignoreHeadUntil = 0; }
      }
    },
    tick() {
      if (disposed || away || !deadline) return;
      if (io.now() >= deadline) { cancel(); io.onBlocked(true); }
      else if (io.now() - lastListen >= 2000) listen();
    },
    dispose() { disposed = true; cancel(); },
  };
}
