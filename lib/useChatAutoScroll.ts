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
    let gestureActive = false;
    let gestureMoved = false;
    let gestureOrigin: { x: number; y: number } | null = null;
    const pointOf = (event?: Event) => {
      if (!event) return null;
      const touch = (event as TouchEvent).touches?.[0] ?? (event as TouchEvent).changedTouches?.[0];
      const point = touch ?? event as PointerEvent;
      return Number.isFinite(point.clientX) && Number.isFinite(point.clientY) ? { x: point.clientX, y: point.clientY } : null;
    };
    const onGestureMove = (event: Event) => {
      const point = pointOf(event);
      if (gestureActive && gestureOrigin && point && Math.hypot(point.x - gestureOrigin.x, point.y - gestureOrigin.y) > 3) gestureMoved = true;
    };
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
      if (!manual.current || gestureActive) return;
      const at = gap() < 1 || (gap() < 40 && box.scrollTop >= manualStartTop);
      following.current = at;
      if (at) { manual.current = false; follow(true); }
      setAtBottom(at);
    };
    const onManual = (event: Event) => {
      if (box.scrollHeight <= box.clientHeight || (event instanceof WheelEvent && (event.deltaY === 0 || (event.deltaY > 0 && gap() < 1)))) return;
      if (event.type === "pointerdown" || event.type === "touchstart") {
        resumeOnRelease ||= following.current;
        gestureActive = true;
        gestureOrigin = pointOf(event);
        gestureMoved = false;
      }
      manualStartTop = box.scrollTop;
      cancel();
      manual.current = true;
      following.current = false;
      setAtBottom(false);
    };
    const onRelease = (event?: Event) => {
      if (!gestureActive) return;
      if (event) onGestureMove(event);
      gestureActive = false;
      // A stationary tap is still a tap if image reflow/history trimming moved
      // scrollTop underneath it. Only actual finger/mouse movement pauses reading.
      if (resumeOnRelease && ((gestureOrigin && !gestureMoved) || box.scrollTop === manualStartTop)) {
        manual.current = false; following.current = true; setAtBottom(true); follow(true);
      } else onScroll();
      resumeOnRelease = false;
      gestureOrigin = null;
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
    // Release can occur outside the scroll box (e.g. dragging its scrollbar).
    window.addEventListener("pointermove", onGestureMove, { passive: true });
    window.addEventListener("touchmove", onGestureMove, { passive: true });
    window.addEventListener("pointerup", onRelease, { passive: true });
    window.addEventListener("touchend", onRelease, { passive: true });
    window.addEventListener("touchcancel", onRelease, { passive: true });
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
      window.removeEventListener("pointermove", onGestureMove);
      window.removeEventListener("touchmove", onGestureMove);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("touchend", onRelease);
      window.removeEventListener("touchcancel", onRelease);
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
