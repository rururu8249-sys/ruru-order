"use client";

// 라이브 현황(KPI)+TOP상품 — 방송 중 "얼마 팔렸나 + 뭘 밀까"를 한눈에.
//   이미 대시보드에 로딩된 orders(LiveOrder[])만 재활용(읽기 전용). 새 쿼리·돈 로직·DB 접근 없음.
//   결제/취소 판정은 대시보드 매출바와 동일 기준(paymentStatus)으로 맞춤.

import { useMemo } from "react";
import type { LiveOrder } from "./types";

const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;
const PAID = new Set(["paid", "auto_paid", "manual_paid", "card_paid"]);

type Props = {
  orders: LiveOrder[];
  activeBroadcastId: string | null;
  /** [2026-07-24] 방송 판매 리포트 팝업 열기(더보기 버튼) — 표시 전용 */
  onOpenReport?: () => void;
};

export default function LiveStatsPanel({ orders, activeBroadcastId, onOpenReport }: Props) {
  const stats = useMemo(() => {
    // 이번 방송 주문(취소 제외). 방송 없으면 빈 상태.
    const rows = (orders || []).filter(
      (o) => activeBroadcastId && o.broadcastId === activeBroadcastId && o.paymentStatus !== "canceled",
    );
    const paid = rows.filter((o) => PAID.has(o.paymentStatus));
    const paidSales = paid.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const bankCount = paid.filter((o) => String(o.paymentMethod || "").includes("무통장") || o.paymentStatus === "paid" || o.paymentStatus === "auto_paid" || o.paymentStatus === "manual_paid").length;
    const cardCount = paid.filter((o) => String(o.paymentMethod || "").includes("카드") || o.paymentStatus === "card_paid").length;
    const avg = paid.length > 0 ? Math.round(paidSales / paid.length) : 0;

    // TOP 상품: 취소 제외 전체 주문 기준(대기 포함 = 수요 반영). 상품명별 수량 합.
    const qtyByName = new Map<string, number>();
    for (const o of rows) {
      for (const it of o.items || []) {
        const name = String(it.productName || "").trim();
        if (!name || name === "상품명 없음") continue;
        qtyByName.set(name, (qtyByName.get(name) || 0) + Number(it.qty || 0));
      }
    }
    const top = Array.from(qtyByName.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { orderCount: rows.length, paidCount: paid.length, paidSales, avg, bankCount, cardCount, top };
  }, [orders, activeBroadcastId]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black text-ink">📊 라이브 현황</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ink-mute">이번 방송 · 실시간</span>
          {onOpenReport ? (
            <button
              type="button"
              onClick={onOpenReport}
              className="rounded-full border border-rose-line bg-rose-soft px-2 py-0.5 text-[10px] font-black text-rose-deep"
            >
              더보기 →
            </button>
          ) : null}
        </span>
      </div>

      {!activeBroadcastId ? (
        <div className="py-4 text-center text-[11px] font-bold text-ink-mute">방송 시작하면 이번 방송 판매 현황이 표시됩니다.</div>
      ) : (
        <>
          {/* 매출 크게 */}
          <div className="mb-2 rounded-xl bg-rose-soft/40 px-3 py-2">
            <div className="text-[10px] font-black text-ink-mute">결제완료 매출</div>
            <div className="text-[19px] font-black text-rose-deep">{won(stats.paidSales)}</div>
          </div>

          {/* 지표 그리드 */}
          <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-surface-2 px-1 py-1.5">
              <div className="text-[9px] font-bold text-ink-mute">주문</div>
              <div className="text-[13px] font-black text-ink">{stats.orderCount}건</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-1 py-1.5">
              <div className="text-[9px] font-bold text-ink-mute">결제완료</div>
              <div className="text-[13px] font-black text-emerald-600">{stats.paidCount}건</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-1 py-1.5">
              <div className="text-[9px] font-bold text-ink-mute">객단가</div>
              <div className="text-[13px] font-black text-ink">{won(stats.avg)}</div>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-bold text-ink-soft">
            <span>무통장 <b className="text-ink">{stats.bankCount}</b></span>
            <span className="text-ink-mute">·</span>
            <span>카드 <b className="text-ink">{stats.cardCount}</b></span>
          </div>

          {/* TOP 상품 */}
          <div className="border-t border-line pt-2">
            <div className="mb-1 text-[10px] font-black text-ink-mute">🔥 잘 나가는 상품 TOP</div>
            {stats.top.length === 0 ? (
              <div className="py-1 text-[11px] font-bold text-ink-mute">아직 주문 없음</div>
            ) : (
              <ul className="space-y-1">
                {stats.top.map((t, i) => (
                  <li key={t.name} className="flex items-center gap-2 text-[11px] font-bold text-ink">
                    <span className={["w-4 shrink-0 text-center font-black", i === 0 ? "text-rose-deep" : "text-ink-mute"].join(" ")}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="shrink-0 rounded-full bg-rose-soft/50 px-1.5 py-0.5 text-[10px] font-black text-rose-deep">{t.qty}개</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
