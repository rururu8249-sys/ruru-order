"use client";

// components/admin-live/LiveFloatingMatchPanel.tsx
// 목업 C — 드래그 가능한 플로팅 매칭 패널. 미매칭 입금 목록 + 검색 + 오늘 필터.
// [매칭]=금액100%+이름점수≥80인 주문 자동확정 / [확인필요]=주문목록 검색필터 / 드래그→주문 행 드롭.
// 확정은 기존 /api/admin-v2/manual-payment-match 재사용 (매칭 로직 무변경).

import { useState } from "react";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";
import {
  deriveLiveOrderMatchKeys,
  isLiveDepositToday,
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
};

const won = (value: number) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

export default function LiveFloatingMatchPanel({ deposits, orders, onClose, onMatched, onSearchFilter }: Props) {
  const [search, setSearch] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  // 입금 1건의 금액 100% 일치 + 이름점수 높은 매칭필요 주문 찾기(자동확정 후보)
  const findBestOrder = (dep: LiveMatchDeposit): LiveOrder | null => {
    const amt = Number(dep.amount || 0);
    if (amt <= 0) return null;
    return (
      orders.find((o) => {
        const status = o.paymentStatus;
        if (!["unpaid", "manual_match_needed", "card_unpaid"].includes(status)) return false;
        const orderAmt = Number(o.totalAmount || 0) || Number(o.finalAmount || 0);
        if (orderAmt !== amt) return false;
        return liveDepositNameScore(String(dep.depositor_name || ""), o.nickname || "", o.name || "") >= 80;
      }) || null
    );
  };

  const confirmDepositToOrder = async (order: LiveOrder, dep: LiveMatchDeposit) => {
    if (saving) return;
    const depositId = Number(dep.id);
    if (!Number.isFinite(depositId)) return;
    const { orderIds, orderGroupId } = deriveLiveOrderMatchKeys(order);
    setSaving(true);
    try {
      const res = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderGroupId, orderIds, depositIds: [depositId], depositId }),
      });
      const r = await res.json().catch(() => null);
      if (!res.ok || !r?.ok) {
        showAdminToast("입금 매칭 실패\n\n" + (r?.message || ""), "error");
        return;
      }
      showAdminToast(`${dep.depositor_name || "입금"} → ${order.nickname || "주문"} 매칭 완료.`, "success");
      await onMatched?.();
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/[^0-9]/g, "");
  const unmatched = (deposits || []).filter(isUnmatchedLiveDeposit);
  const visible = unmatched
    .filter((d) => (todayOnly ? isLiveDepositToday(d) : true))
    .filter((d) => {
      if (!q) return true;
      const nameHit = String(d.depositor_name || "").toLowerCase().includes(q);
      const amtHit = qDigits ? String(Number(d.amount || 0)).includes(qDigits) : false;
      return nameHit || amtHit;
    })
    .slice()
    .sort((a, b) => {
      const ta = new Date(String(a.deposited_time || a.created_at || "").replace(" ", "T")).getTime() || 0;
      const tb = new Date(String(b.deposited_time || b.created_at || "").replace(" ", "T")).getTime() || 0;
      return tb - ta;
    })
    .slice(0, 60);

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, width: "100%", flexDirection: "column", background: "#fff", fontFamily: "Pretendard, sans-serif" }}>
      {/* 사이드 패널 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, padding: "12px 14px", borderBottom: "1px solid #E8E2DD" }}>
        <span style={{ flex: 1, fontSize: "15px", fontWeight: 800, color: "#222" }}>입금 매칭 <span style={{ fontSize: "12px", color: "#7B2D43" }}>· 미매칭 {unmatched.length}건</span></span>
        <span onClick={onClose} style={{ cursor: "pointer", color: "#999", fontSize: "20px", lineHeight: 1 }}>×</span>
      </div>

      {/* 검색 + 오늘 */}
      <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderBottom: "1px solid #E8E2DD" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="입금자명 / 금액 검색"
          style={{ flex: 1, fontSize: "12px", padding: "5px 8px", borderRadius: "7px", border: "1px solid #E8E2DD", outline: "none" }}
        />
        <button
          type="button"
          onClick={() => setTodayOnly((v) => !v)}
          style={{ fontSize: "11px", fontWeight: 800, padding: "0 10px", borderRadius: "7px", border: "1px solid " + (todayOnly ? "#7B2D43" : "#E8E2DD"), background: todayOnly ? "#7B2D43" : "#fff", color: todayOnly ? "#fff" : "#555", cursor: "pointer" }}
        >
          오늘
        </button>
      </div>

      {/* 입금 목록 */}
      <div style={{ flex: 1, minHeight: 0, padding: "8px 12px", overflowY: "auto" }}>
        {visible.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#999", textAlign: "center", padding: "16px 0" }}>미매칭 입금이 없습니다.</div>
        ) : (
          visible.map((dep) => {
            const best = findBestOrder(dep);
            return (
              <div
                key={String(dep.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", String(dep.id));
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: best ? "8px" : "8px 0", borderBottom: "1px solid #F0EDEA", background: best ? "#E7F3EE" : "transparent", borderRadius: best ? "8px" : 0, cursor: "grab" }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "12px", fontWeight: 800, color: best ? "#0F6E56" : "#222" }}>{dep.depositor_name || "-"}</span>
                  <span style={{ fontSize: "11px", color: "#999" }}>{liveDepositDateLabel(dep)}</span>
                </span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: best ? "#0F6E56" : "#222" }}>{won(Number(dep.amount || 0))}</span>
                {best ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void confirmDepositToOrder(best, dep)}
                    style={{ fontSize: "11px", fontWeight: 800, padding: "3px 8px", borderRadius: "7px", border: "none", background: "#0F6E56", color: "#fff", cursor: "pointer", opacity: saving ? 0.5 : 1 }}
                  >
                    매칭
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSearchFilter(String(dep.depositor_name || ""))}
                    style={{ fontSize: "11px", fontWeight: 800, padding: "3px 8px", borderRadius: "7px", border: "1px solid #E8E2DD", background: "#fff", color: "#555", cursor: "pointer" }}
                  >
                    확인필요
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{ flexShrink: 0, padding: "8px 12px", borderTop: "1px solid #E8E2DD", fontSize: "11px", color: "#999", textAlign: "center" }}>
        주문 행에 드래그해서 매칭 · 또는 [매칭]/[확인필요] 클릭
      </div>
    </div>
  );
}
