"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Follow incoming rows and late image/layout changes; only user scrolling pauses it. */
export function useChatAutoScroll(items: unknown, layoutKey: string, visible: boolean) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const manual = useRef(false);
  const move = useRef<(smooth: boolean) => void>(() => {});
  const first = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    let frame = 0;
    let manualStartTop = 0;
    let resumeOnRelease = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const gap = () => Math.max(0, box.scrollHeight - box.clientHeight - box.scrollTop);
    const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
    const tick = () => {
      if (!following.current) { frame = 0; return; }
      const distance = gap();
      if (distance <= 1) { box.scrollTop = box.scrollHeight; frame = 0; return; }
      box.scrollTop += Math.max(1, distance * 0.25);
      frame = requestAnimationFrame(tick);
    };
    const follow = (smooth: boolean) => {
      if (!following.current) return;
      if (!smooth || reduced.matches) { cancel(); box.scrollTop = box.scrollHeight; }
      else if (!frame && gap() > 1) frame = requestAnimationFrame(tick);
    };
    move.current = follow;
    const onScroll = () => {
      // Programmatic animation/scroll anchoring is not a request to stop following.
      if (!manual.current) return;
      const at = gap() < 40 && box.scrollTop >= manualStartTop;
      following.current = at;
      if (at) { manual.current = false; follow(true); }
      setAtBottom(at);
    };
    const onManual = (event: Event) => {
      if (box.scrollHeight <= box.clientHeight || (event instanceof WheelEvent && event.deltaY >= 0 && gap() < 1)) return;
      if (event.type === "pointerdown" || event.type === "touchstart") resumeOnRelease ||= following.current;
      manualStartTop = box.scrollTop;
      cancel();
      manual.current = true;
      following.current = false;
      setAtBottom(false);
    };
    const onRelease = () => {
      if (resumeOnRelease && box.scrollTop === manualStartTop) {
        manual.current = false; following.current = true; setAtBottom(true); follow(true);
      } else onScroll();
      resumeOnRelease = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const forward = ["ArrowDown", "PageDown", "End"].includes(e.key) || (e.key === " " && !e.shiftKey);
      if (forward && gap() < 1) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) onManual(e);
    };
    const onResize = () => follow(true);
    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("wheel", onManual, { passive: true });
    box.addEventListener("touchstart", onManual, { passive: true });
    box.addEventListener("pointerdown", onManual, { passive: true });
    box.addEventListener("pointerup", onRelease, { passive: true });
    box.addEventListener("touchend", onRelease, { passive: true });
    box.addEventListener("touchcancel", onRelease, { passive: true });
    box.addEventListener("keydown", onKey);
    box.addEventListener("load", onResize, true);
    const observer = new ResizeObserver(onResize);
    observer.observe(box);
    observer.observe(content);
    follow(false);
    return () => {
      cancel(); observer.disconnect(); move.current = () => {};
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("wheel", onManual);
      box.removeEventListener("touchstart", onManual);
      box.removeEventListener("pointerdown", onManual);
      box.removeEventListener("pointerup", onRelease);
      box.removeEventListener("touchend", onRelease);
      box.removeEventListener("touchcancel", onRelease);
      box.removeEventListener("keydown", onKey);
      box.removeEventListener("load", onResize, true);
    };
  }, [visible]);

  useLayoutEffect(() => {
    move.current(!first.current);
    if (Array.isArray(items) && items.length > 0) first.current = false;
  }, [items, layoutKey]);

  const followLatest = () => {
    manual.current = false;
    following.current = true;
    setAtBottom(true);
    move.current(true);
  };
  return { boxRef, contentRef, atBottom, followLatest };
}
