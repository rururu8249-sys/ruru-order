"use client";

import { useEffect, useRef, useState } from "react";

type Player = {
  mute: () => void;
  unMute: () => void;
  setVolume: (value: number) => void;
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
};
type YoutubeWindow = Window & {
  YT?: { Player: new (element: HTMLElement, options: {
    videoId: string;
    playerVars: Record<string, string | number>;
    events: { onReady: (event: { target: Player }) => void; onStateChange: (event: { target: Player; data: number }) => void; onError: () => void };
  }) => Player };
  onYouTubeIframeAPIReady?: () => void;
};

/** Own the player lifecycle and apply audio before exposing the playable frame. */
export function useAdminYoutubePlayer(videoId: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const desired = useRef({ muted: true, volume: 100 });
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !videoId) return;
    let alive = true;
    let player: Player | null = null;
    desired.current = { muted: true, volume: 100 };
    setMuted(true); setVolume(100); setReady(false); setError(false);
    const apiWindow = window as YoutubeWindow;
    const previous = apiWindow.onYouTubeIframeAPIReady;
    const mount = () => {
      if (!alive || player || !apiWindow.YT?.Player) return;
      // YouTube replaces this owned child, never the React-managed host element.
      const slot = document.createElement("div");
      host.replaceChildren(slot);
      player = new apiWindow.YT.Player(slot, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, enablejsapi: 1, origin: window.location.origin, autoplay: 0 },
        events: {
          onReady: ({ target }) => {
            if (!alive) return;
            playerRef.current = target;
            target.setVolume(desired.current.volume);
            target.mute();
            // Controls are disabled during initialization, so first ready stays muted.
            setReady(true);
            target.getIframe().setAttribute("title", "YouTube live video");
          },
          onStateChange: ({ target, data }) => {
            if (!alive || data !== 1) return;
            // YouTube's first-play gesture may enable sound internally. Our
            // explicit site preference wins on start/resume, not just onReady.
            if (desired.current.muted) target.mute();
            else { target.setVolume(desired.current.volume); target.unMute(); }
          },
          onError: () => { if (alive) { setError(true); setReady(false); } },
        },
      });
    };
    const onApiReady = () => { previous?.(); mount(); };
    apiWindow.onYouTubeIframeAPIReady = onApiReady;
    mount(); // The SDK may already be cached when the panel remounts.
    return () => {
      alive = false;
      if (apiWindow.onYouTubeIframeAPIReady === onApiReady) apiWindow.onYouTubeIframeAPIReady = previous;
      playerRef.current = null;
      player?.destroy();
      host.replaceChildren();
    };
  }, [videoId, retry]);

  const toggleMute = () => {
    const player = playerRef.current;
    if (!ready || !player) return;
    const next = !desired.current.muted;
    // Unmuting at zero volume should actually restore audible volume.
    if (!next && desired.current.volume === 0) {
      desired.current.volume = 100; setVolume(100);
    }
    desired.current.muted = next;
    if (next) player.mute();
    else { player.setVolume(desired.current.volume); player.unMute(); }
    setMuted(next);
  };
  const changeVolume = (value: number) => {
    const player = playerRef.current;
    if (!ready || !player || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, value));
    desired.current = { muted: next === 0, volume: next };
    player.setVolume(next);
    if (next === 0) player.mute(); else player.unMute();
    setVolume(next); setMuted(next === 0);
  };
  return { hostRef, muted, volume, ready, error, toggleMute, changeVolume, scriptVersion: retry,
    retry: () => setRetry(value => value + 1), failScript: () => setError(true) };
}
