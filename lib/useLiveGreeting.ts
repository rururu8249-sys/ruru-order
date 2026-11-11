'use client';
import {useCallback, useEffect, useRef, useState} from 'react';

// Product defaults, kept together so timing can be adjusted without changing the lifecycle.
export const LIVE_GREETING_TIMING = {delayMs: 1500, returnAfterMs: 30 * 60_000} as const;
type Visit = {shownAt: number; leftAt?: number};
function readVisit(key: string): Visit | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!value || !Number.isFinite(value.shownAt) || value.shownAt <= 0) return null;
    return {shownAt: value.shownAt, leftAt: Number.isFinite(value.leftAt) ? value.leftAt : undefined};
  } catch { return null; }
}
function writeVisit(key: string, value: Visit) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

/** One greeting per eligible visit; its row scrolls with chat instead of expiring. */
export function useLiveGreeting(broadcastKey: string, enabled: boolean) {
  const key = `ruru_live_greeting_v2_${broadcastKey}`;
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const lifecycle = useRef({key, token: 0});
  const clearTimers = useCallback(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  }, []);
  const dismiss = useCallback(() => {
    clearTimers();
    setVisibleKey(null);
    writeVisit(key, {shownAt: Date.now()});
  }, [key, clearTimers]);

  useEffect(() => {
    const token = lifecycle.current.token + 1;
    lifecycle.current = {key, token};
    setVisibleKey(null);
    if (!enabled) return;
    const showForVisit = () => {
      const visit = readVisit(key);
      const lastVisit = visit?.leftAt ?? visit?.shownAt;
      if (lastVisit === undefined || Date.now() - lastVisit >= LIVE_GREETING_TIMING.returnAfterMs) {
        timers.current.push(window.setTimeout(() => {
          writeVisit(key, {shownAt: Date.now()});
          setVisibleKey(key);
        }, LIVE_GREETING_TIMING.delayMs));
      }
    };
    showForVisit();
    const markLeft = (leftAt: number) => {
      const latest = readVisit(key);
      if (latest) writeVisit(key, {...latest, leftAt});
    };
    const onPageHide = () => { clearTimers(); setVisibleKey(null); markLeft(Date.now()); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) showForVisit(); };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearTimers();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      const leftAt = Date.now();
      // React StrictMode re-runs effects without the user leaving. Only a real unmount
      // (or another broadcast) records an exit, after the synchronous re-setup settles.
      queueMicrotask(() => {
        if (lifecycle.current.token === token || lifecycle.current.key !== key) markLeft(leftAt);
      });
    };
  }, [key, enabled, clearTimers]);
  return {open: enabled && visibleKey === key, dismiss};
}
