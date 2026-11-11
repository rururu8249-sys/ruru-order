"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { captureProductIntro, createIntroReplay, type ProductIntroCapture, type IntroPlayerSample, type IntroReplayRequest, type IntroReplayStatus } from "./productIntro";
import { youtubeCommand } from "./liveWatch";

export function useProductIntroPlayer(iframe: RefObject<HTMLIFrameElement | null>, videoId: string, playerKey: number, request: IntroReplayRequest | null | undefined, onAction: (func: string, args?: unknown[]) => void) {
  const sample = useRef<IntroPlayerSample | null>(null);
  const pendingCapture = useRef<((value: ProductIntroCapture | null) => void) | null>(null);
  const [status, setStatus] = useState<IntroReplayStatus>("loading");
  const controller = useRef<ReturnType<typeof createIntroReplay> | null>(null);
  const action = useRef(onAction); action.current = onAction;
  useEffect(() => {
    sample.current = null;
    const send = (func: "seekTo" | "playVideo", args: unknown[] = []) => iframe.current?.contentWindow?.postMessage(youtubeCommand(func, args), "https://www.youtube.com");
    const replay = createIntroReplay({ now: Date.now, status: setStatus, seek: seconds => {
      action.current("seekTo", [seconds, true]); send("seekTo", [seconds, true]); send("playVideo");
    } });
    controller.current = replay;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.youtube.com" || event.source !== iframe.current?.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!["infoDelivery", "initialDelivery"].includes(data?.event) || !data.info) return;
        const info = data.info;
        const reportedId = info.videoData?.video_id;
        if (reportedId && reportedId !== videoId) return;
        const p = sample.current ?? { videoId, t: 0, edge: 0, start: 0, at: 0, state: -1, live: false, atLiveHead: null };
        if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) { p.t = info.currentTime; p.at = Date.now(); }
        if (typeof info.playerState === "number") p.state = info.playerState;
        if (typeof info.videoData?.isLive === "boolean") p.live = info.videoData.isLive;
        const progress = info.progressState;
        if (typeof progress?.seekableEnd === "number" && progress.seekableEnd > 0) p.edge = progress.seekableEnd;
        else if (typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration > 0) p.edge = info.duration;
        if (typeof progress?.seekableStart === "number") p.start = progress.seekableStart;
        if (typeof progress?.isAtLiveHead === "boolean") p.atLiveHead = progress.isAtLiveHead;
        sample.current = p;
        if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) {
          const captured = captureProductIntro(p, videoId);
          if (captured) pendingCapture.current?.(captured);
        }
        replay.info(info);
      } catch { /* Unrelated or incomplete player packets. */ }
    };
    window.addEventListener("message", onMessage);
    const timer = window.setInterval(() => replay.tick(), 300);
    return () => { pendingCapture.current?.(null); replay.cancel(); controller.current = null; sample.current = null; window.clearInterval(timer); window.removeEventListener("message", onMessage); };
  }, [iframe, videoId, playerKey]);
  useEffect(() => {
    if (!request || request.videoId !== videoId) { controller.current?.cancel(); return; }
    action.current("seekTo", [request.seconds, true]);
    controller.current?.start(request.seconds);
    const p = sample.current;
    // A paused iframe may not answer another listening packet. Its known range
    // can start the seek; fresh playing telemetry must still confirm arrival.
    if (p && p.videoId === videoId && request.seconds >= p.start && request.seconds <= p.edge) {
      controller.current?.info({ currentTime: p.t, playerState: p.state, progressState: { seekableStart: p.start, seekableEnd: p.edge } });
    }
    iframe.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube.com");
  }, [request?.key, request?.videoId, request?.seconds, videoId, playerKey, iframe]);
  const capture = useCallback((): Promise<ProductIntroCapture | null> => {
    pendingCapture.current?.(null);
    if (!iframe.current?.contentWindow) return Promise.resolve(null);
    const current = sample.current ? captureProductIntro(sample.current, videoId) : null;
    if (current) return Promise.resolve(current);
    return new Promise(resolve => {
      // A playing sample may have expired while the tab was in the background.
      const timer = window.setTimeout(() => finish(null), 1500);
      const finish = (value: ProductIntroCapture | null) => {
        window.clearTimeout(timer);
        if (pendingCapture.current === finish) pendingCapture.current = null;
        resolve(value);
      };
      pendingCapture.current = finish;
      iframe.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube.com");
    });
  }, [iframe, videoId]);
  const cancel = useCallback(() => controller.current?.cancel(), []);
  return { capture, status, cancel };
}
