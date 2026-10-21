"use client";
// 확정은 기존 API 2종 재사용 (매칭 로직 무변경)
// /api/admin-v2/manual-payment-match
// /api/admin-v2/manual-payment-confirm-without-deposit

import { useEffect, useMemo, useState } from "react";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";
import {
  deriveLiveOrderMatchKeys,
  isUnmatchedLiveDeposit,
  liveDepositDateLabel,
  liveDepositNameScore,
  resolveLiveDepositDate,
  type LiveMatchDeposit,
} from "./LiveOrderTable";

type Props = {
  deposits: readonly any[];
  orders: LiveOrder[];
  onClose: () => void;
  onMatched: () => void | Promise<void>;
  onSearchFilter: (keyword: string) => void;
  selectedOrderForMatch?: LiveOrder | null;
  onClearSelectedOrder?: () => void;
  /** [2026-10-21 a4-3] 입금내역 상세에서 열 때 — 그 입금을 미리 체크하고 입금자명으로 검색(창 열릴 때 1번만) */
  initialDepositId?: number | null;
  initialSearch?: string;
  /** [2026-10-21 여러 주문 합친 입금] 같은 손님의 다른 미결제 주문을 찾을 전체 주문 목록(필터 무관) */
  allOrders?: LiveOrder[];
};

type Period = "today" | "7days" | "30days" | "all" | "custom";

const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;


function inPeriod(dep: any, period: Period, calFrom: string, calTo: string): boolean {
  const d = resolveLiveDepositDate(dep).date;
  if (!d) return true;
  if (period === "today") {
    const t = new Date(); t.setHours(0,0,0,0);
    return d >= t;
  }
  if (period === "7days") {
    const t = new Date(); t.setDate(t.getDate() - 7); t.setHours(0,0,0,0);
    return d >= t;
  }
  if (period === "30days") {
    const t = new Date(); t.setDate(t.getDate() - 30); t.setHours(0,0,0,0);
    return d >= t;
  }
  if (period === "custom" && calFrom && calTo) {
    const from = new Date(calFrom + "T00:00:00");
    const to   = new Date(calTo   + "T23:59:59");
    return d >= from && d <= to;
  }
  return true; // all
}

// 입금 1건의 닉네임/이름 점수 (기존 3인자 시그니처 사용)
function depNameScore(dep: any, order: LiveOrder): number {
  return liveDepositNameScore(
    String(dep?.depositor_name || ""),
    order?.nickname || "",
    order?.name || "",
  );
}

export default function LiveFloatingMatchPanel({
  deposits, orders, onMatched, onSearchFilter,
  selectedOrderForMatch, onClearSelectedOrder,
  initialDepositId = null, initialSearch = "",
  allOrders,
}: Props) {
  const [period, setPeriod] = useState<Period>("all");
  const [calOpen, setCalOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [calFrom, setCalFrom] = useState(today.slice(0, 7) + "-01");
  const [calTo,   setCalTo]   = useState(today);
  // [2026-10-21 입금 통합] 「미매칭만/전체보기」 토글은 창 위 「입금매칭 / 입금내역」 칩이 대신한다 → 여기선 항상 미매칭만
  const [showAll] = useState(false);
  const [search, setSearch]   = useState(initialSearch);
  const [selectedDepIds, setSelectedDepIds] = useState<Set<number>>(() => new Set(initialDepositId != null && Number.isFinite(Number(initialDepositId)) ? [Number(initialDepositId)] : []));
  const [matchSaving, setMatchSaving] = useState(false);

  const matchMode = !!selectedOrderForMatch;

  // 선택된 주문 기대 금액
  const { expectedAmount: baseExpectedAmount } = useMemo(() => {
    if (!selectedOrderForMatch) return { expectedAmount: 0 };
    return deriveLiveOrderMatchKeys(selectedOrderForMatch);
  }, [selectedOrderForMatch]);

  // [2026-10-21 여러 주문 합친 입금 — 수동 전용] 같은 손님(전화번호 또는 닉네임)의 다른 미결제 주문을 «사장님이 골라» 함께 확인.
  //   고른 주문이 없으면 아래 금액·확정 흐름은 예전과 똑같다.
  const [extraOrderIds, setExtraOrderIds] = useState<Set<string>>(new Set());
  useEffect(() => { setExtraOrderIds(new Set()); }, [selectedOrderForMatch?.id]);
  const sameCustomerOrders = useMemo(() => {
    const sel = selectedOrderForMatch;
    if (!sel) return [] as LiveOrder[];
    const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
    const phone = digits(sel.phone);
    const nick = String(sel.youtubeNickname || "").trim();
    return (allOrders || orders)
      .filter(o => o.id !== sel.id && (o.groupId || o.id) !== (sel.groupId || sel.id))
      .filter(o => ["unpaid", "manual_match_needed"].includes(String(o.paymentStatus)))
      .filter(o => !String(o.paymentMethod || "").includes("카드"))
      .filter(o => (phone.length >= 8 && digits(o.phone) === phone) || (nick !== "" && String(o.youtubeNickname || "").trim() === nick))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 10);
  }, [selectedOrderForMatch, allOrders, orders]);
  const extraOrders = sameCustomerOrders.filter(o => extraOrderIds.has(o.id));
  const expectedAmount = baseExpectedAmount + extraOrders.reduce((sum, o) => sum + deriveLiveOrderMatchKeys(o).expectedAmount, 0);
  function toggleExtraOrder(id: string) {
    setExtraOrderIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  // 필터링된 입금 목록
  const filtered = useMemo(() => {
    let list = [...deposits] as any[];

    // 기간
    list = list.filter(d => inPeriod(d, period, calFrom, calTo));

    // 미매칭/전체
    if (!showAll) list = list.filter(d => isUnmatchedLiveDeposit(d));

    // 검색
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(d => {
        const name = (d.depositor_name ?? "").toLowerCase();
        const amt  = String(d.amount ?? "");
        return name.includes(q) || amt.includes(q);
      });
    }

    // 최신순
    list.sort((a, b) => {
      const da = resolveLiveDepositDate(a).date?.getTime() ?? 0;
      const db = resolveLiveDepositDate(b).date?.getTime() ?? 0;
      return db - da;
    });

    return list;
  }, [deposits, period, calFrom, calTo, showAll, search]);

  // 날짜 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const dep of filtered) {
      // [2026-10-21 입금 통합] 날짜(요일)까지만 묶음 머리로 — 시각은 줄마다 이미 보인다(표시만)
      const label = (liveDepositDateLabel(dep) ?? "날짜 미상").replace(/^(\d{4}\.\d{2}\.\d{2}\([^)]+\)).*$/, "$1");
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(dep);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // (미매칭 건수는 창 위 「입금매칭 N」 칩이 보여준다 — 대시보드에서 같은 판정 isUnmatchedLiveDeposit 으로 센다)

  // 브라우징 모드: 전체 orders 기준 추천 (금액 정확일치 + 이름점수≥80)
  function findBestOrder(dep: any): LiveOrder | null {
    const amt = Number(dep.amount ?? 0);
    if (amt <= 0) return null;
    let best: LiveOrder | null = null;
    let bestScore = -1;
    for (const o of orders) {
      const status = o.paymentStatus;
      if (!["unpaid","manual_match_needed","card_unpaid"].includes(status)) continue;
      const { expectedAmount: oAmt } = deriveLiveOrderMatchKeys(o);
      if (oAmt !== amt) continue;
      const score = depNameScore(dep, o);
      if (score >= 80 && score > bestScore) { best = o; bestScore = score; }
    }
    return best;
  }

  // 매칭 모드: 선택된 주문 기준 추천 여부 (금액 정확일치 + 이름점수≥75)
  function isRecommended(dep: any): boolean {
    if (!selectedOrderForMatch) return false;
    const score = depNameScore(dep, selectedOrderForMatch);
    return score >= 75 && Number(dep.amount ?? 0) === expectedAmount;
  }

  // 체크박스 토글
  function toggleDep(id: number) {
    setSelectedDepIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 선택 합계
  const selDeps = filtered.filter(d => selectedDepIds.has(Number(d.id)));
  const selTotal = selDeps.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const canConfirm = matchMode && selDeps.length > 0 && selTotal === expectedAmount;

  // 확정: 입금 연결 (선택 합계 === 주문금액일 때만)
  async function handleConfirmWithDeposit() {
    if (!selectedOrderForMatch || matchSaving || !canConfirm) return;
    setMatchSaving(true);
    try {
      const { orderGroupId, orderIds: baseOrderIds } = deriveLiveOrderMatchKeys(selectedOrderForMatch);
      // 함께 고른 주문이 있으면 그 주문 줄 id 도 보낸다(서버가 주문 그룹 2개 이상이면 금액 정확일치·미결제만 다시 검사)
      const orderIds = extraOrders.length > 0
        ? [...baseOrderIds, ...extraOrders.flatMap(o => deriveLiveOrderMatchKeys(o).orderIds)]
        : baseOrderIds;
      const depositIds = selDeps.map(d => Number(d.id));
      const clientSelectedTotalAmount = selTotal;
      const res = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, depositIds, clientSelectedTotalAmount }),
      });
      if (!res.ok) throw new Error(await res.text());
      showAdminToast("입금 확인 완료 ", "success");
      onClearSelectedOrder?.();
      setSelectedDepIds(new Set());
      await onMatched();
    } catch (e: any) {
      showAdminToast(`오류: ${e?.message ?? e}`, "error");
    } finally {
      setMatchSaving(false);
    }
  }

  // 확정: 금액 무시 수동확인
  async function handleConfirmWithoutDeposit() {
    if (!selectedOrderForMatch || matchSaving || extraOrders.length > 0) return;
    setMatchSaving(true);
    try {
      const { orderGroupId, orderIds, expectedAmount: ea } = deriveLiveOrderMatchKeys(selectedOrderForMatch);
      const res = await fetch("/api/admin-v2/manual-payment-confirm-without-deposit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, expectedAmount: ea }),
      });
      if (!res.ok) throw new Error(await res.text());
      showAdminToast("수동 입금확인 완료 ", "success");
      onClearSelectedOrder?.();
      setSelectedDepIds(new Set());
      await onMatched();
    } catch (e: any) {
      showAdminToast(`오류: ${e?.message ?? e}`, "error");
    } finally {
      setMatchSaving(false);
    }
  }

  // 브라우징 모드: 입금 1건 즉시 확정 (findBestOrder가 금액 정확일치만 후보로 줌)
  async function confirmDepositToOrder(dep: any, order: LiveOrder) {
    if (matchSaving) return;
    setMatchSaving(true);
    try {
      const { orderGroupId, orderIds } = deriveLiveOrderMatchKeys(order);
      const clientSelectedTotalAmount = Number(dep.amount ?? 0);
      const res = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGroupId, orderIds,
          depositIds: [Number(dep.id)],
          clientSelectedTotalAmount,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showAdminToast("입금 확인 완료 ", "success");
      await onMatched();
    } catch (e: any) {
      showAdminToast(`오류: ${e?.message ?? e}`, "error");
    } finally {
      setMatchSaving(false);
    }
  }

  const PERIOD_TABS: { key: Period; label: string }[] = [
    { key: "today",   label: "오늘" },
    { key: "7days",   label: "1주일" },
    { key: "30days",  label: "1개월" },
    { key: "all",     label: "전체" },
  ];

  // [2026-10-21 입금 통합] 모양만 DESIGN-ADMIN 기준(칩 36·검정 선택·주버튼 1개). 위 판정·API 호출 줄은 그대로.
  const chip = (on: boolean) =>
    `h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface">

      {/* 기간 · 검색 */}
      <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_TABS.map(t => (
            <button key={t.key} type="button" aria-pressed={period === t.key && !calOpen}
              onClick={() => { setPeriod(t.key); setCalOpen(false); }}
              className={chip(period === t.key && !calOpen)}>{t.label}</button>
          ))}
          <div className="relative">
            <button type="button" aria-pressed={calOpen || period === "custom"} onClick={() => setCalOpen(v => !v)}
              className={chip(calOpen || period === "custom")}>기간 선택</button>
            {calOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-64 rounded-xl border border-line bg-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,.08)]">
                <div className="flex items-center gap-1.5">
                  <input type="date" aria-label="시작일" value={calFrom} onChange={e => setCalFrom(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]" />
                  <span className="text-[13px] text-ink-mute">~</span>
                  <input type="date" aria-label="종료일" value={calTo} onChange={e => setCalTo(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]" />
                </div>
                <button type="button" onClick={() => { setPeriod("custom"); setCalOpen(false); }}
                  className="mt-2 h-9 w-full rounded-lg bg-ink text-[13px] font-bold text-white">적용</button>
              </div>
            )}
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} aria-label="입금자명 또는 금액 검색"
          placeholder="입금자명 · 금액 검색"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
      </div>

      {/* 주문을 골라서 열었을 때: 연결할 주문 + 확정 버튼(스크롤해도 항상 보임) */}
      {matchMode && selectedOrderForMatch && (
        <div className="shrink-0 space-y-2 border-b border-line bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ink-mute">연결할 주문{extraOrders.length > 0 ? ` ${extraOrders.length + 1}건 합계` : ""}</div>
              <div className="truncate text-[14px] font-bold text-ink">
                {selectedOrderForMatch.nickname ?? selectedOrderForMatch.name} · <span className="tabular-nums">{won(expectedAmount)}</span>
              </div>
            </div>
            <button type="button" onClick={() => { onClearSelectedOrder?.(); setSelectedDepIds(new Set()); }}
              className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">주문 빼기</button>
          </div>
          {sameCustomerOrders.length > 0 && (
            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <div className="text-[12px] font-semibold text-ink-mute">같은 손님 다른 미결제 주문 · 한 번에 입금했으면 체크</div>
              {sameCustomerOrders.map(o => {
                const on = extraOrderIds.has(o.id);
                const amt = deriveLiveOrderMatchKeys(o).expectedAmount;
                return (
                  <label key={o.id} className="mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                    <input type="checkbox" checked={on} onChange={() => toggleExtraOrder(o.id)} className="h-4 w-4 accent-[var(--color-ink)]" />
                    <span className="min-w-0 flex-1 truncate">{String(o.createdAt || "").slice(5, 16).replace("T", " ")} · {o.orderNo || "주문"}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{won(amt)}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className={`text-[13px] font-semibold ${selDeps.length === 0 ? "text-ink-mute" : selTotal === expectedAmount ? "text-ok-tx" : "text-danger-tx"}`}>
            {selDeps.length === 0
              ? "아래에서 이 주문의 입금을 고르세요"
              : selTotal === expectedAmount
                ? `고른 입금 ${won(selTotal)} · 주문 금액과 같아요`
                : `고른 입금 ${won(selTotal)} · 주문 금액과 달라요`}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleConfirmWithDeposit} disabled={!canConfirm || matchSaving}
              className="h-10 flex-1 rounded-lg bg-ink text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-mute">
              {matchSaving ? "처리 중…" : "입금확인"}
            </button>
            <button type="button" onClick={handleConfirmWithoutDeposit} disabled={matchSaving || extraOrders.length > 0}
              title="입금 기록 없이 이 주문을 입금확인으로 바꿔요(금액 확인 안 함)"
              className="h-10 shrink-0 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50">
              입금 없이 확인
            </button>
          </div>
        </div>
      )}

      {/* 입금 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div className="p-6 text-center text-[13px] text-ink-mute">
            {showAll ? "입금 없음" : "연결 안 된 입금이 없어요"}
          </div>
        )}
        {grouped.map(([dateLabel, deps]) => (
          <div key={dateLabel}>
            <div className="sticky top-0 z-[1] border-b border-line bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink-mute">
              {dateLabel}
            </div>
            {deps.map((dep: any) => {
              const isMatched = !isUnmatchedLiveDeposit(dep);
              const depId = Number(dep.id);
              const checked = selectedDepIds.has(depId);
              const rec = matchMode ? isRecommended(dep) : !!findBestOrder(dep);
              const bestOrder = !matchMode ? findBestOrder(dep) : null;
              const diff = matchMode ? Number(dep.amount ?? 0) - expectedAmount : 0;
              const selectable = matchMode && !isMatched;

              return (
                <div key={depId}
                  onClick={() => { if (selectable) toggleDep(depId); }}
                  role={selectable ? "checkbox" : undefined}
                  aria-checked={selectable ? checked : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onKeyDown={selectable ? (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleDep(depId); } } : undefined}
                  className={`flex items-center gap-2.5 border-b border-line px-3 py-2 ${selectable ? "cursor-pointer" : ""} ${checked ? "bg-surface-2" : ""} ${isMatched ? "opacity-50" : ""}`}>

                  {/* 체크 (주문을 골라 열었을 때 + 미매칭만) */}
                  {selectable && (
                    <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 text-[11px] font-bold text-white ${checked ? "border-ink bg-ink" : "border-line bg-surface"}`}>{checked ? "✓" : ""}</div>
                  )}

                  {/* 입금 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-ink">{dep.depositor_name ?? "-"}</span>
                      {isMatched && (
                        <span className="shrink-0 rounded px-1.5 text-[11px] font-semibold text-ok-tx bg-ok-bg">매칭완료</span>
                      )}
                      {!isMatched && rec && (
                        <span className="shrink-0 rounded px-1.5 text-[11px] font-semibold text-ok-tx bg-ok-bg">추천</span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-mute">{dep.deposited_time ?? ""}</div>
                    {/* 추천 연결 대상 — 누르기 전에 어느 주문에 붙는지 보이게(표시만) */}
                    {bestOrder && !isMatched && (
                      <div className="mt-0.5 truncate text-[12px] font-semibold text-ink-soft">
                        → {bestOrder.nickname || bestOrder.name || "-"}{bestOrder.name && bestOrder.nickname && bestOrder.name !== bestOrder.nickname ? ` (${bestOrder.name})` : ""} 주문
                      </div>
                    )}
                  </div>

                  {/* 금액 · 버튼 */}
                  <div className="shrink-0 text-right">
                    <div className="text-[14px] font-bold tabular-nums text-ink">{won(Number(dep.amount ?? 0))}</div>
                    {matchMode && !isMatched && diff !== 0 && (
                      <div className="text-[12px] font-semibold tabular-nums text-danger-tx">
                        {diff > 0 ? "+" : ""}{Number(diff).toLocaleString("ko-KR")}
                      </div>
                    )}
                    {matchMode && !isMatched && diff === 0 && (
                      <div className="text-[12px] font-semibold text-ok-tx">금액 같음</div>
                    )}
                    {!matchMode && !isMatched && bestOrder && (
                      <button type="button" onClick={e => { e.stopPropagation(); confirmDepositToOrder(dep, bestOrder); }}
                        disabled={matchSaving}
                        className="mt-1 h-8 rounded-lg bg-ink px-3 text-[13px] font-bold text-white disabled:opacity-50">연결</button>
                    )}
                    {!matchMode && !isMatched && !bestOrder && (
                      <button type="button" onClick={e => { e.stopPropagation(); onSearchFilter(dep.depositor_name ?? ""); }}
                        title="뒤 주문표를 이 입금자명으로 검색해요"
                        className="mt-1 h-8 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">주문 찾기</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}
