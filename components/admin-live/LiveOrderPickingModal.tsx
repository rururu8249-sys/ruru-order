"use client";

// 물건챙기기 체크리스트 팝업 (주문서 단위 패널).
//   - 주문서 1건(같은 order_group_id) = 패널 1개. 같은 닉네임이라도 주문서 다르면 다른 패널.
//   - 패널 안 상품별 "챙김" 체크 + 전부 체크되면 패널 자동 "완료". 패널 헤더로 일괄 체크/해제도 가능.
//   - 체크는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 유지.
//   - "결제완료만" 토글(기본 ON, 끄면 미결제 포함·취소건 항상 제외), ㄱㄴㄷ/시간 정렬, 전체 초기화, 엑셀.
//   - 상단 "챙김 N개 / 전체 M개"는 수량 합계. picked_at 한 칸만 update(돈/주문 로직 무관).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";

type Props = { orders: LiveOrder[]; filterLabel: string; onClose: () => void };

type PickItem = { id: string; text: string; qty: number };
type Panel = { key: string; nickname: string; paid: boolean; when: string; items: PickItem[]; totalQty: number };

const PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];
const clean = (v: unknown) => String(v ?? "").trim();

export default function LiveOrderPickingModal({ orders, filterLabel, onClose }: Props) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"nickname" | "time">("nickname");
  const [paidOnly, setPaidOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 주문서 단위 패널 (취소건 제외)
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    for (const o of orders) {
      const status = clean(o.paymentStatus);
      if (status === "canceled") continue;
      const paid = PAID_STATUSES.includes(status);
      const nickname = clean((o as any).recipientName) || clean(o.nickname) || clean(o.name) || "-";
      const when = clean((o as any).submittedAt) || clean(o.createdAt);
      const rawItems = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
      const items: PickItem[] =
        rawItems.length === 0
          ? [{ id: String(o.id), text: clean(o.orderSummary) || "상품", qty: 1 }]
          : rawItems.map((it) => {
              const opt = [clean(it.color), clean(it.size)].filter(Boolean).join("/");
              return { id: String(it.id), text: (clean(it.productName) || "상품") + (opt ? ` (${opt})` : ""), qty: Number(it.qty || 1) };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      list.push({ key: String(o.groupId || o.id), nickname, paid, when, items, totalQty });
    }
    return list;
  }, [orders]);

  // 범위(결제완료만 토글 + 정렬) — 진행률/초기화 기준
  const scopedPanels = useMemo(() => {
    const arr = panels.filter((p) => (paidOnly ? p.paid : true));
    if (sortMode === "nickname") arr.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko") || a.when.localeCompare(b.when));
    else arr.sort((a, b) => a.when.localeCompare(b.when));
    return arr;
  }, [panels, paidOnly, sortMode]);

  // 검색(닉네임 또는 상품명) — 화면 표시용. 검색은 진행률/초기화 범위에 영향 없음.
  const visiblePanels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedPanels;
    return scopedPanels.filter((p) => p.nickname.toLowerCase().includes(q) || p.items.some((it) => it.text.toLowerCase().includes(q)));
  }, [scopedPanels, search]);

  // 열 때 서버에서 picked_at 조회
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = panels.flatMap((p) => p.items.map((it) => Number(it.id))).filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) { setPickedIds(new Set()); return; }
      const picked = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await supabase.from("orders").select("id, picked_at").in("id", ids.slice(i, i + 500));
        (data || []).forEach((r: any) => { if (r.picked_at) picked.add(String(r.id)); });
      }
      if (alive) setPickedIds(picked);
    })();
    return () => { alive = false; };
  }, [panels]);

  const writePicked = async (ids: string[], makePicked: boolean) => {
    const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const value = makePicked ? new Date().toISOString() : null;
    for (let i = 0; i < nums.length; i += 500) {
      const { error } = await supabase.from("orders").update({ picked_at: value }).in("id", nums.slice(i, i + 500));
      if (error) throw error;
    }
  };

  const togglePick = async (id: string) => {
    const was = pickedIds.has(id);
    setPickedIds((prev) => { const n = new Set(prev); if (was) n.delete(id); else n.add(id); return n; });
    try {
      await writePicked([id], !was);
    } catch (e: any) {
      setPickedIds((prev) => { const n = new Set(prev); if (was) n.add(id); else n.delete(id); return n; });
      showAdminToast("챙김 저장 실패\n\n" + (e?.message || e), "error");
    }
  };

  // 패널 전체 토글(전부 체크돼 있으면 해제, 아니면 전부 체크)
  const togglePanel = async (panel: Panel) => {
    const ids = panel.items.map((it) => it.id);
    const allPicked = ids.every((id) => pickedIds.has(id));
    const makePicked = !allPicked;
    setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => (makePicked ? n.add(id) : n.delete(id))); return n; });
    try {
      await writePicked(ids, makePicked);
    } catch (e: any) {
      // 롤백 위해 재조회
      showAdminToast("패널 일괄 체크 실패\n\n" + (e?.message || e), "error");
    }
  };

  const resetAll = async () => {
    if (!(await showAdminConfirm("챙김 표시를 모두 초기화할까요?\n\n지금 보이는 목록의 모든 체크가 해제됩니다. (주문·금액엔 영향 없음)"))) return;
    setResetting(true);
    try {
      const ids = scopedPanels.flatMap((p) => p.items.map((it) => it.id));
      await writePicked(ids, false);
      setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
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

  // 수량 합계
  const { pickedQty, totalQty } = useMemo(() => {
    let p = 0, t = 0;
    for (const panel of scopedPanels) for (const it of panel.items) { t += it.qty; if (pickedIds.has(it.id)) p += it.qty; }
    return { pickedQty: p, totalQty: t };
  }, [scopedPanels, pickedIds]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[88vh] w-[min(560px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-black text-rose-deep">🛍 물건챙기기</div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[18px] font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        {/* 툴바 */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <div className="text-[14px] font-black text-slate-800">
            챙김 <span className="text-emerald-600">{pickedQty}개</span> <span className="text-slate-300">/</span> 전체 {totalQty}개
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPaidOnly((v) => !v)} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${paidOnly ? "bg-emerald-600 text-white" : "border border-amber-300 bg-amber-50 text-amber-700"}`}>{paidOnly ? "결제완료만 ✓" : "미결제 포함"}</button>
            <button type="button" onClick={() => setSortMode("nickname")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "nickname" ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}>ㄱㄴㄷ순</button>
            <button type="button" onClick={() => setSortMode("time")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "time" ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}>시간순</button>
            <button type="button" onClick={resetAll} disabled={resetting} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-black text-[#C0392B] hover:bg-red-100 disabled:opacity-50">{resetting ? "초기화중" : "전체 초기화"}</button>
            <button type="button" onClick={runExcel} disabled={exporting} className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white hover:bg-rose-deep disabled:opacity-50">{exporting ? "내보내는중" : "엑셀"}</button>
          </div>
        </div>

        {/* 검색 (고정 영역) */}
        <div className="shrink-0 border-b border-slate-100 px-4 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 닉네임 · 상품명 검색"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-bold outline-none focus:border-rose-deep focus:bg-white"
          />
        </div>

        {/* 패널 목록 (이 영역만 스크롤 — 모달 높이는 88vh 고정) */}
        <div className="flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
          {visiblePanels.length === 0 ? (
            <div className="py-10 text-center text-sm font-bold text-slate-400">챙길 주문이 없습니다.</div>
          ) : (
            <div className="space-y-2.5">
              {visiblePanels.map((panel) => {
                const pickedInPanel = panel.items.filter((it) => pickedIds.has(it.id)).length;
                const complete = panel.items.length > 0 && pickedInPanel === panel.items.length;
                return (
                  <div key={panel.key} className={`overflow-hidden rounded-2xl border-2 ${complete ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                    {/* 패널 헤더 = 주문서(닉네임) : 아바타(이니셜) + 이름 + 배지 + 진행. 체크박스 없음(상품과 구분). 클릭=그 주문 전체 챙김/해제 */}
                    <button type="button" onClick={() => togglePanel(panel)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${complete ? "bg-emerald-50" : "bg-rose-soft"}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${complete ? "bg-emerald-500" : "bg-rose-deep"}`}>{complete ? "✓" : (panel.nickname.charAt(0) || "?")}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-black text-slate-900">{panel.nickname}</span>
                        {panel.when && panel.when !== "-" ? <span className="text-[11px] font-semibold text-slate-400">제출 {panel.when}</span> : null}
                      </span>
                      {panel.paid ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">결제완료</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-black text-white">미결제</span>
                      )}
                      <span className={`shrink-0 text-[12px] font-black ${complete ? "text-emerald-600" : "text-rose-deep"}`}>{complete ? "✓ 완료" : `${pickedInPanel}/${panel.items.length}`}</span>
                    </button>

                    {/* 패널 안 상품들 : 들여쓰기 + 네모 체크박스(헤더와 구분) */}
                    <div className="divide-y divide-slate-100">
                      {panel.items.map((it) => {
                        const picked = pickedIds.has(it.id);
                        return (
                          <button key={it.id} type="button" onClick={() => togglePick(it.id)} className={`flex w-full items-center gap-3 py-2.5 pl-6 pr-3 text-left ${picked ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}`}>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-black ${picked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                            <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${picked ? "text-slate-400 line-through" : "text-slate-800"}`}>{it.text}</span>
                            <span className={`shrink-0 text-[13px] font-black ${picked ? "text-slate-400" : "text-slate-900"}`}>{it.qty}개</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] font-bold leading-5 text-slate-400">
          상품 줄을 누르면 챙김, 주문서(닉네임) 줄을 누르면 그 주문 전체 챙김/해제. 체크는 서버 저장(다른 기기·새로고침 유지)·주문 취소/수정 자동 반영.
        </div>
      </div>
    </div>
  );
}
