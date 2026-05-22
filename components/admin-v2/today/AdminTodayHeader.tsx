"use client";

// components/admin-v2/today/AdminTodayHeader.tsx
// 목적: 루루동이LIVE Control Center 상단 날짜/요일/LIVE 기준 표시
// 주의: UI 표시 전용. 방송 시작/종료 저장 로직 없음.

import type { BroadcastRow } from "@/lib/admin-v2/types";
import { formatDateLabel } from "@/lib/admin-v2/formatters";
import { getKstTodayInfo, getLatestBroadcast } from "@/components/admin-v2/today/adminTodayUtils";
import type { ReactNode } from "react";

export default function AdminTodayHeader({
  broadcasts,
  periodControls,
}: {
  broadcasts: BroadcastRow[];
  periodControls?: ReactNode;
}) {
  const today = getKstTodayInfo();
  const latestBroadcast = getLatestBroadcast(broadcasts);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-[-0.06em] text-neutral-950">
              루루동이LIVE Control Center
            </h1>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
              {today.label}
            </span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
              🔴 방송 LIVE 기준 준비
            </span>
            {periodControls ? <div className="min-w-0 flex-1">{periodControls}</div> : null}
          </div>

          <p className="mt-2 text-sm font-bold text-neutral-500">
            방송·채팅·주문·입금·배송·고객이슈를 한 화면에서 처리합니다.
          </p>
        </div>

        <div className="grid gap-1 text-right text-xs font-bold text-neutral-500">
          <div>현재시간 {today.time}</div>
          <div>
            최근 방송:{" "}
            <span className="font-black text-neutral-900">
              {latestBroadcast?.public_title || latestBroadcast?.admin_subtitle || "등록된 방송 없음"}
            </span>
          </div>
          <div>
            기준시간:{" "}
            <span className="font-black text-neutral-900">
              {latestBroadcast?.started_at ? formatDateLabel(latestBroadcast.started_at) : "오늘 날짜 기준"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
