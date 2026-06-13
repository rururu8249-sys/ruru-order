"use client";
// 확정은 기존 API 2종 재사용 (매칭 로직 무변경)
// /api/admin-v2/manual-payment-match
// /api/admin-v2/manual-payment-confirm-without-deposit

import { useMemo, useState } from "react";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";
import {
  deriveLiveOrderMatchKeys,
  isUnmatchedLiveDeposit,
  liveDepositDateLabel,
  liveDepositNameScore,
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
};

type Period = "today" | "7days" | "30days" | "all" | "custom";

const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;

function depDate(dep: any): Date | null {
  const raw = dep.deposited_time ?? dep.created_at ?? "";
  if (!raw) return null;
  if (/^\d{2}:\d{2}/.test(raw)) {
    const base = dep.created_at ? dep.created_at.slice(0, 10) : "";
    return base ? new Date(`${base}T${raw}:00`) : null;
  }
  return new Date(raw);
}

function inPeriod(dep: any, period: Period, calFrom: string, calTo: string): boolean {
  const d = depDate(dep);
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
  deposits, orders, onClose, onMatched, onSearchFilter,
  selectedOrderForMatch, onClearSelectedOrder,
}: Props) {
  const [period, setPeriod] = useState<Period>("all");
  const [calOpen, setCalOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [calFrom, setCalFrom] = useState(today.slice(0, 7) + "-01");
  const [calTo,   setCalTo]   = useState(today);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch]   = useState("");
  const [selectedDepIds, setSelectedDepIds] = useState<Set<number>>(new Set());
  const [matchSaving, setMatchSaving] = useState(false);

  const matchMode = !!selectedOrderForMatch;

  // 선택된 주문 기대 금액
  const { expectedAmount } = useMemo(() => {
    if (!selectedOrderForMatch) return { expectedAmount: 0 };
    return deriveLiveOrderMatchKeys(selectedOrderForMatch);
  }, [selectedOrderForMatch]);

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
      const da = depDate(a)?.getTime() ?? 0;
      const db = depDate(b)?.getTime() ?? 0;
      return db - da;
    });

    return list;
  }, [deposits, period, calFrom, calTo, showAll, search]);

  // 날짜 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const dep of filtered) {
      const label = liveDepositDateLabel(dep) ?? "날짜 미상";
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(dep);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // 미매칭 건수
  const unmatchedCount = useMemo(
    () => (deposits as any[]).filter(d => isUnmatchedLiveDeposit(d)).length,
    [deposits]
  );

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
      const { orderGroupId, orderIds } = deriveLiveOrderMatchKeys(selectedOrderForMatch);
      const depositIds = selDeps.map(d => Number(d.id));
      const clientSelectedTotalAmount = selTotal;
      const res = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, depositIds, clientSelectedTotalAmount }),
      });
      if (!res.ok) throw new Error(await res.text());
      showAdminToast("입금 확인 완료 ✅", "success");
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
    if (!selectedOrderForMatch || matchSaving) return;
    setMatchSaving(true);
    try {
      const { orderGroupId, orderIds, expectedAmount: ea } = deriveLiveOrderMatchKeys(selectedOrderForMatch);
      const res = await fetch("/api/admin-v2/manual-payment-confirm-without-deposit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, expectedAmount: ea }),
      });
      if (!res.ok) throw new Error(await res.text());
      showAdminToast("수동 입금확인 완료 ✅", "success");
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
      showAdminToast("입금 확인 완료 ✅", "success");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>

      {/* 헤더 */}
      <div style={{ padding: "12px 14px 0", flexShrink: 0, borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>입금 내역</span>
          <span style={{ background: "#7B2D43", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
            미매칭 {unmatchedCount}건
          </span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#bbb", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* 기간 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          {PERIOD_TABS.map(t => (
            <button key={t.key} onClick={() => { setPeriod(t.key); setCalOpen(false); }}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${period === t.key && !calOpen ? "#7B2D43" : "#e5e5e5"}`,
                background: period === t.key && !calOpen ? "#7B2D43" : "#fff",
                color: period === t.key && !calOpen ? "#fff" : "#666",
              }}>{t.label}</button>
          ))}
          <div style={{ position: "relative" }}>
            <button onClick={() => setCalOpen(v => !v)}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid #7B2D43`,
                background: calOpen ? "#7B2D43" : "#fff",
                color: calOpen ? "#fff" : "#7B2D43",
              }}>📅 직접선택</button>
            {calOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 300,
                background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.13)", padding: 12, width: 240,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 6 }}>기간 선택</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)}
                    style={{ flex: 1, border: "1px solid #e5e5e5", borderRadius: 6, padding: "5px 6px", fontSize: 12, outline: "none" }} />
                  <span style={{ color: "#ccc", fontSize: 12 }}>~</span>
                  <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)}
                    style={{ flex: 1, border: "1px solid #e5e5e5", borderRadius: 6, padding: "5px 6px", fontSize: 12, outline: "none" }} />
                </div>
                <button onClick={() => { setPeriod("custom"); setCalOpen(false); }}
                  style={{ marginTop: 8, width: "100%", background: "#7B2D43", color: "#fff", border: "none", borderRadius: 7, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  적용
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 미매칭만/전체 토글 + 검색 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <button onClick={() => setShowAll(v => !v)}
            style={{
              padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${showAll ? "#e5e5e5" : "#7B2D43"}`,
              background: showAll ? "#f5f5f5" : "#fdf0f3",
              color: showAll ? "#888" : "#7B2D43",
              flexShrink: 0,
            }}>{showAll ? "전체보기" : "미매칭만"}</button>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 입금자명 · 금액"
            style={{ flex: 1, border: "1px solid #e5e5e5", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", background: "#fafafa" }} />
        </div>
      </div>

      {/* 매칭 모드 안내 */}
      {matchMode && selectedOrderForMatch && (
        <div style={{ padding: "8px 14px", background: "#fdf0f3", borderBottom: "1px solid #fbcfe8", fontSize: 11, color: "#7B2D43", fontWeight: 700, flexShrink: 0 }}>
          🔗 <strong>{selectedOrderForMatch.nickname ?? selectedOrderForMatch.name}</strong>
          {" · "}{won(expectedAmount)} 주문에 연결할 입금 선택
          <button onClick={() => { onClearSelectedOrder?.(); setSelectedDepIds(new Set()); }}
            style={{ marginLeft: 8, background: "none", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* 입금 리스트 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {grouped.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#ccc", fontSize: 12 }}>
            {showAll ? "입금 내역 없음" : "미매칭 입금 없음"}
          </div>
        )}
        {grouped.map(([dateLabel, deps]) => (
          <div key={dateLabel}>
            <div style={{ padding: "7px 14px", fontSize: 11, fontWeight: 800, color: "#bbb", background: "#fafafa", borderBottom: "1px solid #f5f5f5", position: "sticky", top: 0, zIndex: 1 }}>
              {dateLabel}
            </div>
            {deps.map((dep: any) => {
              const isMatched = !isUnmatchedLiveDeposit(dep);
              const depId = Number(dep.id);
              const checked = selectedDepIds.has(depId);
              const rec = matchMode ? isRecommended(dep) : !!findBestOrder(dep);
              const bestOrder = !matchMode ? findBestOrder(dep) : null;
              const diff = matchMode ? Number(dep.amount ?? 0) - expectedAmount : 0;

              return (
                <div key={depId}
                  onClick={() => { if (matchMode && !isMatched) toggleDep(depId); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderBottom: "1px solid #f7f7f7",
                    cursor: matchMode && !isMatched ? "pointer" : "default",
                    background: checked ? "#fdf0f3" : rec && !isMatched ? "#f0fdf4" : "transparent",
                    opacity: isMatched ? 0.45 : 1,
                    transition: "background 0.08s",
                  }}>

                  {/* 체크박스 (매칭 모드 + 미매칭만) */}
                  {matchMode && !isMatched && (
                    <div style={{
                      width: 17, height: 17, border: `2px solid ${checked ? "#7B2D43" : "#ddd"}`,
                      borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: checked ? "#7B2D43" : "#fff", fontSize: 11, color: "#fff", fontWeight: 800,
                    }}>{checked ? "✓" : ""}</div>
                  )}

                  {/* 입금 정보 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{dep.depositor_name ?? "—"}</span>
                      {isMatched && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 4, padding: "1px 5px" }}>
                          ✅ 매칭완료
                        </span>
                      )}
                      {!isMatched && rec && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#15803d", borderRadius: 4, padding: "1px 5px" }}>
                          ✅ 추천
                        </span>
                      )}
                      {!isMatched && rec && matchMode && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#7B2D43", borderRadius: 4, padding: "1px 5px" }}>
                          금액일치
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#ccc" }}>
                      {dep.deposited_time ?? ""}
                    </div>
                  </div>

                  {/* 금액 */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{won(Number(dep.amount ?? 0))}</div>
                    {matchMode && !isMatched && diff !== 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
                        {diff > 0 ? "+" : ""}{Number(diff).toLocaleString("ko-KR")}
                      </div>
                    )}
                    {matchMode && !isMatched && diff === 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>±0</div>
                    )}
                    {/* 브라우징 모드: 즉시 매칭 버튼 */}
                    {!matchMode && !isMatched && bestOrder && (
                      <button onClick={e => { e.stopPropagation(); confirmDepositToOrder(dep, bestOrder); }}
                        disabled={matchSaving}
                        style={{
                          marginTop: 4, background: "#15803d", color: "#fff", border: "none",
                          borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700,
                          cursor: "pointer",
                        }}>매칭</button>
                    )}
                    {!matchMode && !isMatched && !bestOrder && (
                      <button onClick={e => { e.stopPropagation(); onSearchFilter(dep.depositor_name ?? ""); }}
                        style={{
                          marginTop: 4, background: "#f5f5f5", color: "#888", border: "1px solid #e5e5e5",
                          borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700,
                          cursor: "pointer",
                        }}>확인필요</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 매칭 모드 하단 확정 버튼 */}
      {matchMode && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          {selDeps.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: selTotal === expectedAmount ? "#15803d" : "#ef4444", textAlign: "center", marginBottom: 2 }}>
              선택 합계 {won(selTotal)} {selTotal === expectedAmount ? "✓ 일치" : `✗ 불일치 (주문 ${won(expectedAmount)})`}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleConfirmWithDeposit} disabled={!canConfirm || matchSaving}
              style={{
                flex: 1, background: canConfirm ? "#3d7a57" : "#ccc", color: "#fff", border: "none",
                borderRadius: 10, padding: "11px 6px", fontSize: 12, fontWeight: 800,
                cursor: canConfirm ? "pointer" : "not-allowed",
              }}>
              {matchSaving ? "처리중…" : "선택 후 입금확인"}
            </button>
            <button onClick={handleConfirmWithoutDeposit} disabled={matchSaving}
              style={{
                flex: 1, background: "#7B2D43", color: "#fff", border: "none",
                borderRadius: 10, padding: "11px 6px", fontSize: 12, fontWeight: 800,
                cursor: matchSaving ? "not-allowed" : "pointer",
              }}>
              금액 무시하고 수동확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
