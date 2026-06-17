"use client";

// 물건챙기기 체크리스트 팝업.
//   - 주문 상품별 한 줄(닉네임 · 주문내역 · 수량) + "챙김" 체크.
//   - 체크 상태는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 동일하게 유지.
//   - "결제완료만" 토글(기본 ON): 끄면 미결제 포함 전체(취소건은 항상 제외).
//   - 주문 취소/수정은 부모가 넘기는 orders(실시간)에 자동 반영.
//   - 전체 초기화 / ㄱㄴㄷ·시간 정렬 / 엑셀 내보내기.
//   - picked_at "한 칸만" update. 돈/입금/정산/주문상태 로직 무관.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";

type Props = {
  orders: LiveOrder[];
  filterLabel: string;
  onClose: () => void;
};

type PickRow = {
  id: string; // orders 행 id (= 상품 1줄)
  nickname: string;
  itemText: string;
  qty: number;
  submittedAt: string;
  paid: boolean;
};

const PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function LiveOrderPickingModal({ orders, filterLabel, onClose }: Props) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"nickname" | "time">("nickname");
  const [paidOnly, setPaidOnly] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 주문 → 상품별 행 (취소건 제외)
  const rows = useMemo<PickRow[]>(() => {
    const list: PickRow[] = [];
    for (const o of orders) {
      const status = clean(o.paymentStatus);
      if (status === "canceled") continue; // 취소건은 항상 제외
      const paid = PAID_STATUSES.includes(status);
      const nick = clean((o as any).recipientName) || clean(o.nickname) || clean(o.name) || "-";
      const when = clean((o as any).submittedAt) || clean(o.createdAt);
      const items = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
      if (items.length === 0) {
        list.push({ id: String(o.id), nickname: nick, itemText: clean(o.orderSummary) || "상품", qty: 1, submittedAt: when, paid });
      } else {
        for (const it of items) {
          const opt = [clean(it.color), clean(it.size)].filter(Boolean).join("/");
          const name = (clean(it.productName) || "상품") + (opt ? ` (${opt})` : "");
          list.push({ id: String(it.id), nickname: nick, itemText: name, qty: Number(it.qty || 1), submittedAt: when, paid });
        }
      }
    }
    return list;
  }, [orders]);

  const visibleRows = useMemo(() => {
    const arr = rows.filter((r) => (paidOnly ? r.paid : true));
    if (sortMode === "nickname") arr.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
    else arr.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return arr;
  }, [rows, paidOnly, sortMode]);

  // 열 때 서버에서 picked_at 조회(여러 기기 동일 표시)
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) { setPickedIds(new Set()); return; }
      const picked = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data } = await supabase.from("orders").select("id, picked_at").in("id", chunk);
        (data || []).forEach((r: any) => { if (r.picked_at) picked.add(String(r.id)); });
      }
      if (alive) setPickedIds(picked);
    })();
    return () => { alive = false; };
  }, [rows]);

  const togglePick = async (id: string) => {
    const wasPicked = pickedIds.has(id);
    setPickedIds((prev) => { const n = new Set(prev); if (wasPicked) n.delete(id); else n.add(id); return n; });
    const { error } = await supabase
      .from("orders")
      .update({ picked_at: wasPicked ? null : new Date().toISOString() })
      .eq("id", Number(id));
    if (error) {
      setPickedIds((prev) => { const n = new Set(prev); if (wasPicked) n.add(id); else n.delete(id); return n; });
      showAdminToast("챙김 저장 실패\n\n" + error.message, "error");
    }
  };

  const resetAll = async () => {
    const ok = await showAdminConfirm("챙김 표시를 모두 초기화할까요?\n\n지금 보이는 목록의 모든 체크가 해제됩니다. (주문·금액엔 영향 없음)");
    if (!ok) return;
    setResetting(true);
    try {
      const ids = visibleRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error } = await supabase.from("orders").update({ picked_at: null }).in("id", chunk);
        if (error) throw error;
      }
      setPickedIds((prev) => { const n = new Set(prev); ids.forEach((x) => n.delete(String(x))); return n; });
      showAdminToast("챙김 표시를 초기화했습니다.", "success");
    } catch (e: any) {
      showAdminToast("초기화 실패\n\n" + (e?.message || e), "error");
    } finally {
      setResetting(false);
    }
  };

  const runExcel = async () => {
    setExporting(true);
    try {
      const exportOrders = paidOnly ? orders.filter((o) => PAID_STATUSES.includes(clean(o.paymentStatus))) : orders;
      await exportLiveOrdersForPicking(exportOrders, { filterLabel });
    } finally {
      setExporting(false);
    }
  };

  const pickedCount = visibleRows.filter((r) => pickedIds.has(r.id)).length;
  const total = visibleRows.length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[88vh] w-[min(560px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-black text-rose-deep">🛍 물건챙기기 <span className="ml-1 text-[12px] font-bold text-slate-500">({filterLabel})</span></div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[18px] font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        {/* 툴바 */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <div className="text-[13px] font-black text-slate-700">
            챙김 <span className="text-emerald-600">{pickedCount}</span> / {total}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPaidOnly((v) => !v)} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${paidOnly ? "bg-emerald-600 text-white" : "border border-amber-300 bg-amber-50 text-amber-700"}`}>{paidOnly ? "결제완료만 ✓" : "미결제 포함"}</button>
            <button type="button" onClick={() => setSortMode("nickname")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "nickname" ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}>ㄱㄴㄷ순</button>
            <button type="button" onClick={() => setSortMode("time")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "time" ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}>시간순</button>
            <button type="button" onClick={resetAll} disabled={resetting} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-black text-[#C0392B] hover:bg-red-100 disabled:opacity-50">{resetting ? "초기화중" : "전체 초기화"}</button>
            <button type="button" onClick={runExcel} disabled={exporting} className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white hover:bg-rose-deep disabled:opacity-50">{exporting ? "내보내는중" : "엑셀"}</button>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {total === 0 ? (
            <div className="py-10 text-center text-sm font-bold text-slate-400">챙길 주문이 없습니다.</div>
          ) : (
            <div className="space-y-1">
              {visibleRows.map((r) => {
                const picked = pickedIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => togglePick(r.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${picked ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-[13px] font-black ${picked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-black ${picked ? "text-slate-400 line-through" : "text-slate-900"}`}>{r.itemText}</span>
                      <span className="block truncate text-[11px] font-bold text-slate-400">{r.nickname}{!r.paid ? " · 미결제" : ""}</span>
                    </span>
                    <span className={`shrink-0 text-[14px] font-black ${picked ? "text-slate-400" : "text-slate-900"}`}>{r.qty}개</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] font-bold leading-5 text-slate-400">
          체크는 서버에 저장돼 다른 기기·새로고침에도 그대로 유지됩니다. 주문 취소·수정은 자동 반영돼요.
        </div>
      </div>
    </div>
  );
}
