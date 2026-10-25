"use client";

// [2026-10-25 사장님 「PC로 들어오면 PC 모양, 폰이면 폰 모양 — 자동으로」]
//   기기 이름(userAgent)이 아니라 «화면 폭»으로 가른다(반응형 표준). 폭 1024px 이상 = PC 모양.
//   창 크기를 바꾸면 바로 따라간다. 서버 렌더·첫 화면은 폰 모양(false)으로 시작 → 뜬 뒤 PC면 바꿈.
import { useEffect, useState } from "react";

export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(minWidth: number = DESKTOP_MIN_WIDTH): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    try { mq.addEventListener("change", apply); } catch { mq.addListener(apply); }
    return () => { try { mq.removeEventListener("change", apply); } catch { mq.removeListener(apply); } };
  }, [minWidth]);
  return isDesktop;
}
