"use client";

// components/admin-v2/today/AdminTodayRankingColumn.tsx
// 목적: 오늘할일 오른쪽 랭킹 패널 묶음
// 주의: 표시용 집계만 수행. DB 저장/정산 저장/금액 재계산 없음.

import { useMemo } from "react";
import type { OrderGroup } from "@/lib/admin-v2/types";
import {
  buildBuyerRanking,
  buildProductRanking,
} from "@/components/admin-v2/today/adminTodayUtils";

const won = (value: number) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

export default function AdminTodayRankingColumn({
  groups,
}: {
  groups: OrderGroup[];
}) {
  const buyerRanking = useMemo(() => buildBuyerRanking(groups).slice(0, 5), [groups]);
  const productRanking = useMemo(() => buildProductRanking(groups).slice(0, 5), [groups]);

  return (
    <div className="grid h-full min-h-[520px] grid-rows-[245px_minmax(0,1fr)] gap-4">
      <RankingPanel
        title="👑 최다구매자 랭킹"
        description="선택 기간 구매 상위 고객"
      >
        {buyerRanking.length === 0 ? (
          <EmptyText />
        ) : (
          buyerRanking.map((item, index) => (
            <RankingRow
              key={`${item.name}-${index}`}
              rank={index + 1}
              title={item.name}
              middle={`${item.count.toLocaleString()}건`}
              right={won(item.amount)}
            />
          ))
        )}
      </RankingPanel>

      <RankingPanel
        title="🔥 최다 판매 상품 랭킹"
        description="선택 기간 판매 수량 기준"
      >
        {productRanking.length === 0 ? (
          <EmptyText />
        ) : (
          productRanking.map((item, index) => (
            <RankingRow
              key={`${item.name}-${index}`}
              rank={index + 1}
              title={item.name}
              middle={`${item.qty.toLocaleString()}개`}
              right={won(item.amount)}
            />
          ))
        )}
      </RankingPanel>
    </div>
  );
}

function RankingPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-black tracking-[-0.04em] text-neutral-950">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">
            {description}
          </p>
        </div>

        <button
          type="button"
          className="shrink-0 rounded-xl border border-neutral-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-neutral-600"
        >
          더보기
        </button>
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
        {children}
      </div>
    </section>
  );
}

function RankingRow({
  rank,
  title,
  middle,
  right,
}: {
  rank: number;
  title: string;
  middle: string;
  right: string;
}) {
  const icon = rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;

  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_52px_86px] items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-2.5 py-2">
      <div className="text-center text-sm font-black text-neutral-900">{icon}</div>

      <div className="min-w-0">
        <div className="truncate text-xs font-black text-neutral-950" title={title}>
          {title}
        </div>
        <div className="text-[10px] font-bold text-neutral-400">랭킹</div>
      </div>

      <div className="text-right text-[11px] font-black text-neutral-700">
        {middle}
      </div>

      <div className="truncate text-right text-[11px] font-black text-neutral-950">
        {right}
      </div>
    </div>
  );
}

function EmptyText() {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4 text-center text-sm font-black text-neutral-400">
      랭킹 데이터가 없습니다.
    </div>
  );
}
