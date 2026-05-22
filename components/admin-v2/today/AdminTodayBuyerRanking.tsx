"use client";

// components/admin-v2/today/AdminTodayBuyerRanking.tsx
// 목적: 오늘할일 기준 최다구매자 랭킹 표시
// 주의: 표시 전용. DB 저장/금액 재계산/정산 로직 없음.

import { useMemo } from "react";
import type { TodayWorkItem } from "@/components/admin-v2/today/adminTodayUtils";

function parseWon(value: string) {
  const numberText = String(value || "").replace(/[^\d]/g, "");
  const amount = Number(numberText);
  return Number.isFinite(amount) ? amount : 0;
}

export default function AdminTodayBuyerRanking({
  items,
}: {
  items: TodayWorkItem[];
}) {
  const ranking = useMemo(() => {
    const map = new Map<string, { nickname: string; count: number; amount: number }>();

    items.forEach((item) => {
      const nickname = item.nickname || "닉네임 없음";
      const current = map.get(nickname) || {
        nickname,
        count: 0,
        amount: 0,
      };

      current.count += 1;
      current.amount += parseWon(item.amountText);
      map.set(nickname, current);
    });

    return Array.from(map.values())
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 5);
  }, [items]);

  return (
    <section className="flex h-full min-h-[520px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            👑 최다구매자 랭킹
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-500">
            선택 기간 기준 구매 상위 고객
          </p>
        </div>

        <button
          type="button"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] font-black text-neutral-600"
        >
          더보기
        </button>
      </div>

      <div className="grid flex-1 content-start gap-2">
        {ranking.length === 0 ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-center text-sm font-black text-neutral-400">
            랭킹 데이터가 없습니다.
          </div>
        ) : (
          ranking.map((item, index) => {
            const crown = index === 0 ? "👑" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;

            return (
              <div
                key={item.nickname}
                className="grid grid-cols-[38px_minmax(0,1fr)_68px_100px] items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2"
              >
                <div className="text-center text-sm font-black text-neutral-900">
                  {crown}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-neutral-950">
                    {item.nickname}
                  </div>
                  <div className="text-[11px] font-bold text-neutral-400">
                    구매고객
                  </div>
                </div>

                <div className="text-right text-xs font-black text-neutral-700">
                  {item.count.toLocaleString()}건
                </div>

                <div className="text-right text-xs font-black text-neutral-950">
                  {item.amount.toLocaleString()}원
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
