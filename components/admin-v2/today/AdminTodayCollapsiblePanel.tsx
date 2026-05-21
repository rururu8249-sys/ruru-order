"use client";

// components/admin-v2/today/AdminTodayCollapsiblePanel.tsx
// 목적: 오늘할일 관제탑에서 기능별 박스를 접힘/펼침으로 정리
// 주의: UI 전용. 주문/입금/배송/정산/API 로직 없음.

import { useState, type ReactNode } from "react";

export default function AdminTodayCollapsiblePanel({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:scale-[0.998]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
              {title}
            </h2>

            {badge ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-black text-neutral-600">
                {badge}
              </span>
            ) : null}
          </div>

          {description ? (
            <p className="mt-1 text-xs font-bold text-neutral-500">
              {description}
            </p>
          ) : null}
        </div>

        <div
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${
            open
              ? "bg-neutral-950 text-white"
              : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {open ? "접기" : "펼치기"}
        </div>
      </button>

      {open ? (
        <div className="border-t border-neutral-100 p-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
