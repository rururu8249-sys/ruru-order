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
type Panel = { key: string; nickname: string; name: string; search: string; paid: boolean; when: string; items: PickItem[]; totalQty: number };

const PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];
const clean = (v: unknown) => String(v ?? "").trim();

// 정렬용 raw 타임스탬프(ms). 파싱 실패 시 0.
const ts = (s: string) => {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
};

// 제출시각 → KST "YYYY.MM.DD(요일) 오전/오후 h:mm" 보기 편한 형식. 파싱 실패 시 빈 문자열.
//   오전/오후는 환경(ICU) 안 타게 24시 값에서 직접 계산.
const whenText = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let h = parseInt(get("hour"), 10);
  if (!Number.isFinite(h) || h === 24) h = 0;
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${get("year")}.${get("month")}.${get("day")}(${get("weekday")}) ${ampm} ${h12}:${get("minute")}`;
};

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
      const nickname = clean(o.nickname) || clean(o.name) || "-"; // 주문 닉네임(크게)
      const name = clean((o as any).recipientName) || clean(o.name) || ""; // 받는사람/이름(옆에 함께 표시)
      // 검색용: 닉네임·이름·받는사람 전부 포함(닉네임으로 검색해도, 이름으로 검색해도 잡히게)
      const searchText = [clean(o.nickname), clean(o.name), clean((o as any).recipientName)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const when = clean(o.createdAt) || clean((o as any).submittedAt);
      const rawItems = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
      const items: PickItem[] =
        rawItems.length === 0
          ? [{ id: String(o.id), text: clean(o.orderSummary) || "상품", qty: 1 }]
          : rawItems.map((it) => {
              const opt = [clean(it.color), clean(it.size)].filter(Boolean).join("/");
              return { id: String(it.id), text: (clean(it.productName) || "상품") + (opt ? ` (${opt})` : ""), qty: Number(it.qty || 1) };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      list.push({ key: String(o.groupId || o.id), nickname, name, search: searchText, paid, when, items, totalQty });
    }
    return list;
  }, [orders]);

  // 범위(결제완료만 토글 + 정렬) — 진행률/초기화 기준
  const scopedPanels = useMemo(() => {
    const arr = panels.filter((p) => (paidOnly ? p.paid : true));
    if (sortMode === "nickname") arr.sort((a, b) => (a.name || a.nickname).localeCompare(b.name || b.nickname, "ko") || ts(a.when) - ts(b.when));
    else arr.sort((a, b) => ts(a.when) - ts(b.when));
    return arr;
  }, [panels, paidOnly, sortMode]);

  // 검색(닉네임 또는 상품명) — 화면 표시용. 검색은 진행률/초기화 범위에 영향 없음.
  const visiblePanels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedPanels;
    return scopedPanels.filter((p) => p.search.includes(q) || p.nickname.toLowerCase().includes(q) || p.items.some((it) => it.text.toLowerCase().includes(q)));
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
      <div className="flex h-[88vh] w-[min(560px,96vw)] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div className="text-[15px] font-black text-rose-deep">🛍 물건챙기기</div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[18px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink">✕</button>
        </div>

        {/* 툴바 */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
          <div className="text-[14px] font-black text-ink">
            챙김 <span className="text-ok-tx">{pickedQty}개</span> <span className="text-ink-mute">/</span> 전체 {totalQty}개
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPaidOnly((v) => !v)} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${paidOnly ? "bg-emerald-600 text-white" : "border border-amber-300 bg-warn-bg text-warn-tx"}`}>{paidOnly ? "결제완료만 ✓" : "미결제 포함"}</button>
            <button type="button" onClick={() => setSortMode("nickname")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "nickname" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>ㄱㄴㄷ순</button>
            <button type="button" onClick={() => setSortMode("time")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "time" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>시간순</button>
            <button type="button" onClick={resetAll} disabled={resetting} className="rounded-lg border border-danger-tx bg-danger-bg px-2.5 py-1 text-[11px] font-black text-[var(--color-danger-tx)] hover:bg-danger-bg disabled:opacity-50">{resetting ? "초기화중" : "전체 초기화"}</button>
            <button type="button" onClick={runExcel} disabled={exporting} className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white hover:bg-rose-deep disabled:opacity-50">{exporting ? "내보내는중" : "엑셀"}</button>
          </div>
        </div>

        {/* 검색 (고정 영역) */}
        <div className="shrink-0 border-b border-line px-4 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 닉네임 · 상품명 검색"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] font-bold outline-none focus:border-rose-deep focus:bg-surface"
          />
        </div>

        {/* 패널 목록 (이 영역만 스크롤 — 모달 높이는 88vh 고정) */}
        <div className="flex-1 overflow-y-auto bg-surface-2 px-3 py-3">
          {visiblePanels.length === 0 ? (
            <div className="py-10 text-center text-sm font-bold text-ink-mute">챙길 주문이 없습니다.</div>
          ) : (
            <div className="space-y-2.5">
              {visiblePanels.map((panel) => {
                const pickedInPanel = panel.items.filter((it) => pickedIds.has(it.id)).length;
                const complete = panel.items.length > 0 && pickedInPanel === panel.items.length;
                return (
                  <div key={panel.key} className={`overflow-hidden rounded-2xl border-2 ${complete ? "border-emerald-300 bg-ok-bg/60" : "border-line bg-surface"}`}>
                    {/* 패널 헤더 = 주문서(닉네임) : 아바타(이니셜) + 이름 + 배지 + 진행. 체크박스 없음(상품과 구분). 클릭=그 주문 전체 챙김/해제 */}
                    <button type="button" onClick={() => togglePanel(panel)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${complete ? "bg-ok-bg" : "bg-rose-soft"}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${complete ? "bg-emerald-500" : "bg-rose-deep"}`}>{complete ? "✓" : (panel.nickname.charAt(0) || "?")}</span>
                      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                        <span className="shrink truncate text-[15px] font-black text-ink">{panel.nickname}</span>
                        {panel.name && panel.name !== panel.nickname ? <span className="shrink-0 text-[12px] font-bold text-ink-soft">· {panel.name}</span> : null}
                        {whenText(panel.when) ? <span className="shrink-0 text-[11px] font-semibold text-ink-mute">{whenText(panel.when)}</span> : null}
                      </span>
                      {panel.paid ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-ok-tx">결제완료</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-black text-white">미결제</span>
                      )}
                      <span className={`shrink-0 text-[12px] font-black ${complete ? "text-ok-tx" : "text-rose-deep"}`}>{complete ? "✓ 완료" : `${pickedInPanel}/${panel.items.length}`}</span>
                    </button>

                    {/* 패널 안 상품들 : 들여쓰기 + 네모 체크박스(헤더와 구분) */}
                    <div className="divide-y divide-line">
                      {panel.items.map((it) => {
                        const picked = pickedIds.has(it.id);
                        return (
                          <button key={it.id} type="button" onClick={() => togglePick(it.id)} className={`flex w-full items-center gap-3 py-2.5 pl-6 pr-3 text-left ${picked ? "bg-ok-bg" : "bg-surface hover:bg-surface-2"}`}>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-black ${picked ? "border-emerald-500 bg-emerald-500 text-white" : "border-line text-transparent"}`}>✓</span>
                            <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${picked ? "text-ink-mute line-through" : "text-ink"}`}>{it.text}</span>
                            <span className={`shrink-0 text-[13px] font-black ${picked ? "text-ink-mute" : "text-ink"}`}>{it.qty}개</span>
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

        <div className="shrink-0 border-t border-line px-4 py-2 text-[11px] font-bold leading-5 text-ink-mute">
          상품 줄을 누르면 챙김, 주문서(닉네임) 줄을 누르면 그 주문 전체 챙김/해제. 체크는 서버 저장(다른 기기·새로고침 유지)·주문 취소/수정 자동 반영.
        </div>
      </div>
    </div>
  );
}
