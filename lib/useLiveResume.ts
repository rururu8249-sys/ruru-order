"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createLiveResume } from "./liveResume";
import { youtubeCommand } from "./liveWatch";

export function useLiveResume(iframe: RefObject<HTMLIFrameElement | null>, playerKey: string) {
  const controller = useRef<ReturnType<typeof createLiveResume> | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    setNeedsTap(false);
    const post = (message: string) => { try { iframe.current?.contentWindow?.postMessage(message, "https://www.youtube.com"); } catch { /* wait for player telemetry */ } };
    const c = createLiveResume({ now: Date.now, send: (func, args) => post(youtubeCommand(func, args)),
      listen: () => post(JSON.stringify({ event: "listening", id: 1, channel: "widget" })), onBlocked: setNeedsTap });
    controller.current = c;
    const leave = () => c.leave();
    const enter = () => { if (document.visibilityState === "visible") c.return(); };
    const visibility = () => { if (document.visibilityState === "hidden") leave(); else enter(); };
    const blur = () => { if (document.activeElement !== iframe.current) leave(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur); window.addEventListener("focus", enter);
    window.addEventListener("pagehide", leave); window.addEventListener("pageshow", enter);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") c.tick(); }, 500);
    return () => {
      c.dispose(); controller.current = null; window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur); window.removeEventListener("focus", enter);
      window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", enter);
    };
  }, [iframe, playerKey]);
  const onInfo = useCallback((info: Record<string, unknown>) => controller.current?.info(info), []);
  const onAction = useCallback((func: string, args?: unknown[]) => controller.current?.action(func, args), []);
  return { onInfo, onAction, needsTap };
}
