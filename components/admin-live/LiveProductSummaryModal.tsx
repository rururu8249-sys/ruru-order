"use client";

// components/admin-live/LiveProductSummaryModal.tsx
// [2026-08-23 사장님 요청] 상품·옵션별 주문 집계 팝업 — "연그레이/240 몇 개, 누가 주문했나"를 한 번에.
//   현재 조회범위의 주문을 상품 → 옵션(색상/사이즈)으로 묶어 수량·결제/대기·주문자 칩을 보여준다.
//   화면 표시 전용 — 주문/입금/재고/정산 데이터를 일절 변경하지 않는다. 취소 주문은 자동 제외.

import { useMemo, useState } from "react";
import type { LiveOrder } from "./types";

type Props = { orders: LiveOrder[]; filterLabel: string; onClose: () => void };

const PAID_STATUSES = new Set(["paid", "auto_paid", "manual_paid", "card_paid"]);
const clean = (v: unknown) => String(v ?? "").trim();

type BuyerChip = { nickname: string; qty: number; paid: boolean };
type OptionRow = { label: string; totalQty: number; paidQty: number; buyers: BuyerChip[] };
type ProductGroup = { name: string; totalQty: number; paidQty: number; options: OptionRow[] };

export default function LiveProductSummaryModal({ orders, filterLabel, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [paidOnly, setPaidOnly] = useState(false);

  const groups = useMemo<ProductGroup[]>(() => {
    // 상품명 → (옵션 라벨 → 집계행)
    const byProduct = new Map<string, Map<string, { totalQty: number; paidQty: number; buyers: Map<string, BuyerChip> }>>();

    const addRow = (productName: string, optionLabel: string, qty: number, nickname: string, paid: boolean) => {
      if (!byProduct.has(productName)) byProduct.set(productName, new Map());
      const opts = byProduct.get(productName)!;
      if (!opts.has(optionLabel)) opts.set(optionLabel, { totalQty: 0, paidQty: 0, buyers: new Map() });
      const row = opts.get(optionLabel)!;
      row.totalQty += qty;
      if (paid) row.paidQty += qty;
      // 같은 닉네임이라도 결제/대기 상태가 다르면 칩을 분리해 보여준다 (대기분이 묻히지 않게)
      const buyerKey = `${nickname}|${paid ? "1" : "0"}`;
      const chip = row.buyers.get(buyerKey) || { nickname, qty: 0, paid };
      chip.qty += qty;
      row.buyers.set(buyerKey, chip);
    };

    for (const o of orders) {
      if (o.paymentStatus === "canceled") continue;
      const paid = PAID_STATUSES.has(o.paymentStatus);
      if (paidOnly && !paid) continue;
      const nickname = clean(o.nickname) || clean(o.name) || "-";
      const items = o.items || [];
      if (items.length === 0) {
        addRow(clean(o.orderSummary) || "상품", "", 1, nickname, paid);
        continue;
      }
      for (const it of items) {
        const opt = [clean(it.color), clean(it.size)].filter((v) => v && v !== "없음").join("/");
        addRow(clean(it.productName) || "상품", opt, Number(it.qty) || 1, nickname, paid);
      }
    }

    const out: ProductGroup[] = [];
    for (const [name, opts] of byProduct) {
      const options: OptionRow[] = [...opts.entries()]
        .map(([label, r]) => ({
          label,
          totalQty: r.totalQty,
          paidQty: r.paidQty,
          buyers: [...r.buyers.values()].sort((a, b) => b.qty - a.qty || a.nickname.localeCompare(b.nickname, "ko-KR")),
        }))
        .sort((a, b) => b.totalQty - a.totalQty || a.label.localeCompare(b.label, "ko-KR"));
      const totalQty = options.reduce((s, r) => s + r.totalQty, 0);
      const paidQty = options.reduce((s, r) => s + r.paidQty, 0);
      out.push({ name, totalQty, paidQty, options });
    }
    return out.sort((a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name, "ko-KR"));
  }, [orders, paidOnly]);

  // 검색: 상품명·옵션·닉네임 아무거나 — 옵션/닉네임이 걸리면 그 상품의 해당 줄만 남긴다
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => {
        if (g.name.toLowerCase().includes(q)) return g;
        const options = g.options.filter(
          (r) => r.label.toLowerCase().includes(q) || r.buyers.some((b) => b.nickname.toLowerCase().includes(q))
        );
        if (options.length === 0) return null;
        const totalQty = options.reduce((s, r) => s + r.totalQty, 0);
        const paidQty = options.reduce((s, r) => s + r.paidQty, 0);
        return { ...g, options, totalQty, paidQty };
      })
      .filter((g): g is ProductGroup => g !== null);
  }, [groups, search]);

  const grandTotal = visibleGroups.reduce((s, g) => s + g.totalQty, 0);
  const grandPaid = visibleGroups.reduce((s, g) => s + g.paidQty, 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-[680px] max-h-[calc(100vh-32px)] w-[640px] max-w-full flex-col overflow-hidden rounded-2xl bg-surface">
        {/* 헤더 */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-[15px] font-black text-rose-deep">📊 상품별 주문</span>
          <span className="truncate text-[11px] font-bold text-ink-mute">{filterLabel}</span>
          <button type="button" onClick={onClose} className="ml-auto border-none bg-transparent text-xl leading-none text-ink-mute">✕</button>
        </div>

        {/* 검색 + 토글 + 합계 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상품·옵션·닉네임 검색"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setPaidOnly((v) => !v)}
            className={[
              "h-9 shrink-0 rounded-lg px-3 text-[12px] font-black",
              paidOnly ? "bg-rose-deep text-white" : "border border-rose-line bg-rose-soft text-rose-deep",
            ].join(" ")}
          >
            {paidOnly ? "✅ 결제완료만 보는 중" : "결제완료만"}
          </button>
          <span className="shrink-0 text-[12px] font-black text-ink-soft">
            총 <b className="text-rose-deep">{grandTotal}</b>개
            {!paidOnly ? <span className="text-ink-mute"> (결제 {grandPaid} · 대기 {grandTotal - grandPaid})</span> : null}
          </span>
        </div>

        {/* 목록 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {visibleGroups.length === 0 ? (
            <div className="py-14 text-center text-[13px] font-black text-ink-mute">표시할 주문이 없습니다.</div>
          ) : (
            visibleGroups.map((g) => (
              <section key={g.name} className="mb-3 overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-2 bg-surface-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-black text-ink">{g.name}</span>
                  <span className="shrink-0 text-[12px] font-black text-rose-deep">총 {g.totalQty}개</span>
                  {!paidOnly ? (
                    <span className="shrink-0 text-[11px] font-bold text-ink-mute">결제 {g.paidQty} · 대기 {g.totalQty - g.paidQty}</span>
                  ) : null}
                </div>
                {g.options.map((r) => (
                  <div key={r.label || "(옵션없음)"} className="flex flex-wrap items-start gap-2 border-t border-line px-3 py-2">
                    <span className="w-[130px] shrink-0 text-[12.5px] font-black text-ink-soft">{r.label || "옵션 없음"}</span>
                    <span className="w-[46px] shrink-0 text-[12.5px] font-black text-ink">{r.totalQty}개</span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {r.buyers.map((b, i) => (
                        <span
                          key={`${b.nickname}-${b.paid}-${i}`}
                          title={b.paid ? "결제완료" : "입금대기"}
                          className={[
                            "rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                            b.paid ? "bg-ok-bg text-ok-tx" : "bg-warn-bg text-warn-tx",
                          ].join(" ")}
                        >
                          {b.nickname}{b.qty > 1 ? `×${b.qty}` : ""}{b.paid ? "" : "⏳"}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>

        <div className="border-t border-line px-4 py-2 text-[10.5px] font-bold text-ink-mute">
          보기 전용 집계입니다 — 재고·주문·입금 숫자는 바뀌지 않아요. 취소 주문은 제외됩니다.
        </div>
      </div>
    </div>
  );
}
