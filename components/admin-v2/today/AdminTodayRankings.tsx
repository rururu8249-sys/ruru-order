"use client";

// components/admin-v2/today/AdminTodayRankings.tsx
// 목적: 오늘 구매자/상품 랭킹 표시
// 주의: 조회/표시 전용. 정산 저장 로직 없음.

import { money } from "@/lib/admin-v2/formatters";

type BuyerRank = { name: string; count: number; amount: number };
type ProductRank = { name: string; qty: number; amount: number };

export default function AdminTodayRankings({
  buyers,
  products,
}: {
  buyers: BuyerRank[];
  products: ProductRank[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <RankBox title="오늘 많이 구매한 고객" emptyText="아직 구매자 랭킹이 없습니다.">
        {buyers.map((item, index) => (
          <div key={item.name} className="grid grid-cols-[34px_1fr_110px] items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
            <div className="text-sm font-black text-neutral-400">{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-neutral-950">{item.name}</div>
              <div className="text-xs font-bold text-neutral-500">{item.count}건</div>
            </div>
            <div className="text-right text-sm font-black text-neutral-950">{money(item.amount)}</div>
          </div>
        ))}
      </RankBox>

      <RankBox title="오늘 상품 판매 순위" emptyText="아직 상품 랭킹이 없습니다.">
        {products.map((item, index) => (
          <div key={item.name} className="grid grid-cols-[34px_1fr_110px] items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
            <div className="text-sm font-black text-neutral-400">{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-neutral-950">{item.name}</div>
              <div className="text-xs font-bold text-neutral-500">{item.qty}개 판매</div>
            </div>
            <div className="text-right text-sm font-black text-neutral-950">{money(item.amount)}</div>
          </div>
        ))}
      </RankBox>
    </section>
  );
}

function RankBox({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-black tracking-[-0.04em] text-neutral-950">
        {title}
      </h2>
      <div className="grid max-h-[330px] gap-2 overflow-y-auto">
        {children.length > 0 ? children : (
          <div className="rounded-2xl bg-neutral-50 p-8 text-center text-sm font-black text-neutral-400">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}
