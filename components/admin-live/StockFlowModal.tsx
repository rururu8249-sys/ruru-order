"use client";

// [2026-10-26 사장님 「해당 방송일(쇼핑몰 포함) 방송 시작 재고 > 추가·수정 재고 표시」 — A안: 상품 › 방송 상품/쇼핑몰 탭에서 열기]
//   옵션마다 한 줄: 시작 → +추가 / −수정 → −판매 → 지금. 앞뒤가 안 맞으면 「차이 N」.
//   보기 전용 — 재고·주문·돈 무접촉. 숫자는 /api/admin-live/stock-flow 가 계산.
import { useCallback, useEffect, useMemo, useState } from "react";
import { optionLabel } from "@/lib/stockFlow";

export type StockFlowProduct = { id: string; name: string; image?: string };

type Line = { key: string; color: string; size: string; base: number | null; added: number; removed: number; sold: number; now: number | null; diff: number; end?: number };
type Item = { at: string; managed: boolean; soldBefore: number; lines: Line[]; edits: { color: string; size: string; delta: number; at: string }[] };

const timeText = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};

export default function StockFlowModal({ scope, title, products, focusId, onClose }: { scope: string; title: string; products: StockFlowProduct[]; focusId?: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ live: boolean; note?: string; windowStart?: string; products: Record<string, Item> } | null>(null);
  const [search, setSearch] = useState("");
  const [movedOnly, setMovedOnly] = useState(false);
  const [onlyFocus, setOnlyFocus] = useState(Boolean(focusId));

  const ids = useMemo(() => products.map((p) => p.id).filter(Boolean).join(","), [products]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin-live/stock-flow?scope=${encodeURIComponent(scope)}&ids=${encodeURIComponent(ids)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError(json?.message || `불러오기 실패(${res.status})`); return; }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [scope, ids]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const live = Boolean(data?.live);
  const rows = useMemo(() => {
    const q = search.replace(/\s+/g, "").toLowerCase();
    return products.filter((p) => {
      if (onlyFocus && focusId && p.id !== focusId) return false;
      if (q && !p.name.replace(/\s+/g, "").toLowerCase().includes(q)) return false;
      const it = data?.products?.[p.id];
      if (movedOnly) {
        if (!it) return false;
        return it.soldBefore > 0 || it.lines.some((l) => l.added || l.removed || l.sold || l.diff);
      }
      return true;
    });
  }, [products, search, movedOnly, onlyFocus, focusId, data]);

  const totals = useMemo(() => {
    let added = 0, removed = 0, sold = 0, diffCount = 0;
    for (const p of products) {
      const it = data?.products?.[p.id];
      if (!it) continue;
      for (const l of it.lines) { added += l.added; removed += l.removed; sold += l.sold; if (live && l.diff) diffCount++; }
    }
    return { added, removed, sold, diffCount };
  }, [products, data, live]);

  const firstAt = useMemo(() => {
    const list = Object.values(data?.products || {}).map((it) => it.at).filter(Boolean).sort();
    return list[0] || "";
  }, [data]);

  return (
    <div role="dialog" aria-modal="true" aria-label="재고 흐름" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-surface sm:h-[min(92vh,880px)] sm:rounded-xl">
        <div className="flex items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-ink">재고 흐름</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-mute">{title}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink disabled:opacity-50">{loading ? "불러오는 중…" : "새로고침"}</button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink">닫기</button>
        </div>

        <div className="border-b border-line px-4 py-2 text-[13px] leading-5 text-ink-soft">
          {firstAt ? <div>시작 재고 = <b className="text-ink">{timeText(firstAt)}</b>에 찍어 둔 숫자{live ? " · 지금 재고와 맞춰 봐요" : " · 끝난 범위라 끝 재고는 계산값"}</div> : null}
          <div className="text-ink-mute">판매 = 이 상품의 모든 주문(방송·쇼핑몰 함께, 취소·재고 되돌린 주문 제외)</div>
          {data ? (
            <div className="mt-1 flex flex-wrap gap-x-3 font-semibold text-ink">
              <span>추가 +{totals.added}</span><span>수정 −{totals.removed}</span><span>판매 −{totals.sold}</span>
              {live ? (totals.diffCount ? <span className="text-warn-tx">차이 {totals.diffCount}줄</span> : <span className="text-ok-tx">숫자 다 맞음</span>) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품 이름 검색" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
          <button type="button" aria-pressed={movedOnly} onClick={() => setMovedOnly((v) => !v)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${movedOnly ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"}`}>움직인 것만</button>
          {focusId ? <button type="button" aria-pressed={onlyFocus} onClick={() => setOnlyFocus((v) => !v)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${onlyFocus ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"}`}>{onlyFocus ? "전체 상품 보기" : "이 상품만"}</button> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <p className="text-[13px] font-semibold text-danger-tx">{error}</p> : null}
          {data?.note ? <p className="text-[13px] text-ink-mute">{data.note}</p> : null}
          {!loading && data && rows.length === 0 ? <p className="py-8 text-center text-[13px] text-ink-mute">보여줄 상품이 없어요. 검색어를 지우거나 「움직인 것만」을 꺼 보세요.</p> : null}
          <div className="flex flex-col gap-3">
            {rows.map((p) => {
              const it = data?.products?.[p.id];
              return (
                <section key={p.id} className="rounded-lg border border-line">
                  <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-bold text-ink">{p.name}</div>
                      {it ? <div className="text-[12px] text-ink-mute">시작 {timeText(it.at)}{it.soldBefore > 0 ? ` · 기록 시작 전 이 방송 판매 ${it.soldBefore}개` : ""}</div> : null}
                    </div>
                  </div>
                  {!it ? (
                    <p className="px-3 py-2 text-[13px] text-ink-mute">{loading ? "불러오는 중…" : "기록 없음"}</p>
                  ) : !it.managed ? (
                    <p className="px-3 py-2 text-[13px] text-ink-mute">재고 관리 안 하는 상품</p>
                  ) : (
                    <table className="w-full table-fixed text-[13px] tabular-nums">
                      <thead>
                        <tr className="text-[12px] text-ink-mute">
                          <th className="px-3 py-1.5 text-left font-semibold">옵션</th>
                          <th className="w-12 py-1.5 text-right font-semibold">시작</th>
                          <th className="w-12 py-1.5 text-right font-semibold">추가</th>
                          <th className="w-12 py-1.5 text-right font-semibold">수정</th>
                          <th className="w-12 py-1.5 text-right font-semibold">판매</th>
                          <th className="w-14 py-1.5 pr-3 text-right font-semibold">{live ? "지금" : "끝"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {it.lines.map((l) => {
                          const last = live ? l.now : (l.end ?? null);
                          return (
                            <tr key={l.key} className="border-t border-line">
                              <td className="break-words px-3 py-1.5 text-ink">
                                {optionLabel(l.color, l.size)}
                                {live && l.diff ? <span className="ml-1 rounded-full bg-warn-bg px-1.5 text-[12px] font-semibold text-warn-tx">차이 {l.diff > 0 ? "+" : ""}{l.diff}</span> : null}
                              </td>
                              <td className="py-1.5 text-right text-ink">{l.base ?? "–"}</td>
                              <td className={`py-1.5 text-right ${l.added ? "font-semibold text-ok-tx" : "text-ink-mute"}`}>{l.added ? `+${l.added}` : "0"}</td>
                              <td className={`py-1.5 text-right ${l.removed ? "font-semibold text-warn-tx" : "text-ink-mute"}`}>{l.removed ? `−${l.removed}` : "0"}</td>
                              <td className={`py-1.5 text-right ${l.sold ? "font-semibold text-ink" : "text-ink-mute"}`}>{l.sold ? `−${l.sold}` : "0"}</td>
                              <td className="py-1.5 pr-3 text-right font-bold text-ink">{last ?? "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {it && it.edits.length ? (
                    <div className="border-t border-line px-3 py-1.5 text-[12px] text-ink-mute">
                      직접 고친 기록: {it.edits.map((e) => `${timeText(e.at).slice(-5)} ${optionLabel(e.color, e.size)} ${e.delta > 0 ? "+" : "−"}${Math.abs(e.delta)}`).join(" · ")}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
