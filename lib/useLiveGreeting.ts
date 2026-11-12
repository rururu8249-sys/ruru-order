'use client';
import {useCallback, useEffect, useRef, useState} from 'react';

// Product defaults, kept together so timing can be adjusted without changing the lifecycle.
// [2026-11-12 23:23 사장님] 「보내기」를 안 누른 채 나갔다 오면 다시 띄움 — 안 보낸 손님은 3분, 보낸 손님은 30분 지나야.
//   다른 앱·탭으로 갔다 온 것도 «나갔다 옴»으로 셈(화면 숨김 → 다시 보임).
export const LIVE_GREETING_TIMING = {delayMs: 1500, returnAfterMs: 30 * 60_000, unsentReturnAfterMs: 3 * 60_000} as const;
type Visit = {shownAt: number; leftAt?: number; sent?: boolean};
function readVisit(key: string): Visit | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!value || !Number.isFinite(value.shownAt) || value.shownAt <= 0) return null;
    return {shownAt: value.shownAt, leftAt: Number.isFinite(value.leftAt) ? value.leftAt : undefined, sent: value.sent === true};
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
    writeVisit(key, {shownAt: Date.now(), sent: true});
  }, [key, clearTimers]);

  useEffect(() => {
    const token = lifecycle.current.token + 1;
    lifecycle.current = {key, token};
    setVisibleKey(null);
    if (!enabled) return;
    const showForVisit = () => {
      const visit = readVisit(key);
      const lastVisit = visit?.leftAt ?? visit?.shownAt;
      const wait = visit?.sent ? LIVE_GREETING_TIMING.returnAfterMs : LIVE_GREETING_TIMING.unsentReturnAfterMs;
      if (lastVisit === undefined || Date.now() - lastVisit >= wait) {
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
    // 다른 앱·탭에 갔다 오면 나갔다 온 것과 같게 — 숨는 순간 «나간 시각», 다시 보이면 다시 판단(지금 떠 있으면 내렸다 맨 아래로 다시)
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') { clearTimers(); markLeft(Date.now()); return; }
      const visit = readVisit(key);
      const lastVisit = visit?.leftAt ?? visit?.shownAt;
      const wait = visit?.sent ? LIVE_GREETING_TIMING.returnAfterMs : LIVE_GREETING_TIMING.unsentReturnAfterMs;
      if (lastVisit !== undefined && Date.now() - lastVisit < wait) return;
      setVisibleKey(null);
      showForVisit();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimers();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
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
