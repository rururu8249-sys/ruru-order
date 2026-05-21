"use client";

// components/admin-v2/today/useAutoTodayWorkPageSize.ts
// 목적: 오른쪽 패널 높이가 늘어나면 왼쪽 오늘 입금 빠른처리 표시 개수를 실제 화면 높이에 맞춰 자동 계산
// 주의: UI 표시 전용. 주문/입금/배송/정산 로직 없음.

import { useEffect, useRef, useState } from "react";

export default function useAutoTodayWorkPageSize({
  triggerKey,
  fallback = 4,
  min = 3,
  max = 12,
}: {
  triggerKey: string;
  fallback?: number;
  min?: number;
  max?: number;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const firstRowRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState(fallback);

  useEffect(() => {
    let frameId = 0;

    const recalc = () => {
      window.cancelAnimationFrame(frameId);

      frameId = window.requestAnimationFrame(() => {
        const listEl = listRef.current;
        const rowEl = firstRowRef.current;

        if (!listEl || !rowEl) {
          setPageSize(fallback);
          return;
        }

        const listHeight = listEl.clientHeight;
        const rowHeight = rowEl.getBoundingClientRect().height;

        if (listHeight <= 0 || rowHeight <= 0) return;

        const calculated = Math.floor(listHeight / rowHeight);
        const nextPageSize = Math.max(min, Math.min(max, calculated));

        setPageSize((prev) => (prev === nextPageSize ? prev : nextPageSize));
      });
    };

    const observer = new ResizeObserver(recalc);

    if (listRef.current) observer.observe(listRef.current);
    if (firstRowRef.current) observer.observe(firstRowRef.current);

    window.addEventListener("resize", recalc);
    recalc();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", recalc);
      observer.disconnect();
    };
  }, [fallback, max, min, triggerKey]);

  return {
    listRef,
    firstRowRef,
    pageSize,
  };
}
