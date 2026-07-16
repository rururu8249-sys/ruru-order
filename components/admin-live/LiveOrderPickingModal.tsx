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

// [2026-07-13 사장님 지침] amount = 주문에 저장된 상품금액(표시 전용, 재계산 안 함)
type PickItem = { id: string; text: string; qty: number; amount: number };
type Panel = { key: string; nickname: string; name: string; phone: string; search: string; paid: boolean; when: string; items: PickItem[]; totalQty: number };
type BatchRow = { text: string; ids: string[]; totalQty: number; pickedQty: number };

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
  const [unpickedOnly, setUnpickedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"order" | "batch">("order");
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
          ? [{ id: String(o.id), text: clean(o.orderSummary) || "상품", qty: 1, amount: Number(o.productAmount || 0) }]
          : rawItems.map((it) => {
              const opt = [clean(it.color), clean(it.size)].filter(Boolean).join("/");
              return { id: String(it.id), text: (clean(it.productName) || "상품") + (opt ? ` (${opt})` : ""), qty: Number(it.qty || 1), amount: Number(it.amount || 0) };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      const phone = clean(o.phone).replace(/[^0-9]/g, ""); // 같은 고객 판정용(숫자만)
      list.push({ key: String(o.groupId || o.id), nickname, name, phone, search: searchText, paid, when, items, totalQty });
    }
    return list;
  }, [orders]);

  // 범위(결제완료만 토글 + 정렬) — 진행률/초기화 기준
  const scopedPanels = useMemo(() => {
    const arr = panels.filter((p) => (paidOnly ? p.paid : true));
    if (sortMode === "nickname") {
      // 화면 큰 글씨(닉네임) 기준 정렬. 순서: 한글 → 영어 → 숫자 → 기타. 같은 그룹 안은 가나다/알파벳순.
      const rank = (s: string) => {
        const c = (s || "").trim().charAt(0);
        if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)) return 0;
        if (/[a-zA-Z]/.test(c)) return 1;
        if (/[0-9]/.test(c)) return 2;
        return 3;
      };
      arr.sort((a, b) => {
        const ra = rank(a.nickname), rb = rank(b.nickname);
        if (ra !== rb) return ra - rb;
        return a.nickname.localeCompare(b.nickname, "ko") || ts(a.when) - ts(b.when);
      });
    }
    else arr.sort((a, b) => ts(a.when) - ts(b.when));
    return arr;
  }, [panels, paidOnly, sortMode]);

  // 검색(닉네임 또는 상품명) — 화면 표시용. 검색은 진행률/초기화 범위에 영향 없음.
  const visiblePanels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedPanels;
    return scopedPanels.filter((p) => p.search.includes(q) || p.nickname.toLowerCase().includes(q) || p.items.some((it) => it.text.toLowerCase().includes(q)));
  }, [scopedPanels, search]);

  // "안 챙긴 것만" 보기 — 켜면 다 챙긴 주문은 숨기고, 남은 주문은 안 챙긴 상품줄만 표시(막판 마무리용).
  const displayPanels = useMemo(() => {
    if (!unpickedOnly) return visiblePanels;
    return visiblePanels
      .map((p) => ({ ...p, items: p.items.filter((it) => !pickedIds.has(it.id)) }))
      .filter((p) => p.items.length > 0);
  }, [visiblePanels, unpickedOnly, pickedIds]);

  // 같은 고객(전화번호) 묶음 — 여러 주문이 같은 사람이면 합배송 안내(중복배송·누락 방지).
  const phoneCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of scopedPanels) if (p.phone) m.set(p.phone, (m.get(p.phone) || 0) + 1);
    return m;
  }, [scopedPanels]);

  // 상품별 합계(배치 피킹) — 옵션까지 같은 상품을 전 주문에서 합산. 한 종류씩 한 번에 집기.
  const batchRows = useMemo<BatchRow[]>(() => {
    const m = new Map<string, BatchRow>();
    const q = search.trim().toLowerCase();
    for (const p of scopedPanels) {
      for (const it of p.items) {
        if (q && !it.text.toLowerCase().includes(q)) continue;
        const row = m.get(it.text) || { text: it.text, ids: [], totalQty: 0, pickedQty: 0 };
        row.ids.push(it.id);
        row.totalQty += it.qty;
        if (pickedIds.has(it.id)) row.pickedQty += it.qty;
        m.set(it.text, row);
      }
    }
    let rows = Array.from(m.values());
    if (unpickedOnly) rows = rows.filter((r) => r.pickedQty < r.totalQty);
    return rows.sort((a, b) => a.text.localeCompare(b.text, "ko"));
  }, [scopedPanels, pickedIds, search, unpickedOnly]);

  // 여러 항목 일괄 토글(전부 챙김이면 해제, 아니면 전부 챙김) — 상품별 뷰에서 한 줄 = 그 상품 전부.
  const toggleIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const allPicked = ids.every((id) => pickedIds.has(id));
    const makePicked = !allPicked;
    setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => (makePicked ? n.add(id) : n.delete(id))); return n; });
    try {
      await writePicked(ids, makePicked);
    } catch (e: any) {
      showAdminToast("일괄 체크 실패\n\n" + (e?.message || e), "error");
    }
  };

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
      // [2026-07-16] 챙김 여부 컬럼용 — 화면과 동일한 체크 집합(pickedIds) 전달
      await exportLiveOrdersForPicking(exportOrders, { filterLabel }, pickedIds);
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
            {totalQty > 0 && pickedQty < totalQty ? <span className="ml-1 text-[11px] font-black text-rose-deep">· {totalQty - pickedQty}개 남음</span> : null}
            {totalQty > 0 && pickedQty >= totalQty ? <span className="ml-1 text-[11px] font-black text-ok-tx">· 다 챙김 🎉</span> : null}
          </div>
          <div className="flex items-center gap-1.5">
            {/* 주문별 ↔ 상품별(배치 피킹) 전환 */}
            <span className="inline-flex overflow-hidden rounded-lg border border-rose-deep">
              <button type="button" onClick={() => setViewMode("order")} className={`px-2.5 py-1 text-[11px] font-black ${viewMode === "order" ? "bg-rose-deep text-white" : "bg-surface text-rose-deep"}`}>주문별</button>
              <button type="button" onClick={() => setViewMode("batch")} className={`px-2.5 py-1 text-[11px] font-black ${viewMode === "batch" ? "bg-rose-deep text-white" : "bg-surface text-rose-deep"}`}>상품별</button>
            </span>
            <button type="button" onClick={() => setPaidOnly((v) => !v)} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${paidOnly ? "bg-emerald-600 text-white" : "border border-amber-300 bg-warn-bg text-warn-tx"}`}>{paidOnly ? "결제완료만 ✓" : "미결제 포함"}</button>
            <button type="button" onClick={() => setUnpickedOnly((v) => !v)} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${unpickedOnly ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>{unpickedOnly ? "안 챙긴 것만 ✓" : "안 챙긴 것만"}</button>
            {viewMode === "order" ? (
              <>
                <button type="button" onClick={() => setSortMode("nickname")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "nickname" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>ㄱㄴㄷ순</button>
                <button type="button" onClick={() => setSortMode("time")} className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sortMode === "time" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>시간순</button>
              </>
            ) : null}
            <button type="button" onClick={resetAll} disabled={resetting} className="rounded-lg border border-danger-tx bg-danger-bg px-2.5 py-1 text-[11px] font-black text-[var(--color-danger-tx)] hover:bg-danger-bg disabled:opacity-50">{resetting ? "초기화중" : "전체 초기화"}</button>
            <button type="button" onClick={runExcel} disabled={exporting} className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white hover:bg-rose-deep disabled:opacity-50">{exporting ? "내보내는중" : "엑셀"}</button>
          </div>
        </div>

        {/* 진행 바 */}
        <div className="shrink-0 px-4 pt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${totalQty > 0 ? Math.round((pickedQty / totalQty) * 100) : 0}%` }} />
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

        {/* 목록 (이 영역만 스크롤 — 모달 높이는 88vh 고정) */}
        <div className="flex-1 overflow-y-auto bg-surface-2 px-3 py-3">
          {viewMode === "batch" ? (
            batchRows.length === 0 ? (
              <div className="py-10 text-center text-sm font-bold text-ink-mute">{unpickedOnly ? "안 챙긴 상품이 없어요! 🎉" : "챙길 상품이 없습니다."}</div>
            ) : (
              <>
                <div className="mb-2 px-1 text-[11px] font-bold text-ink-mute">상품 한 종류씩 한 번에 모아 집으세요. 한 줄 누르면 그 상품 전부 챙김 처리돼요.</div>
                <div className="space-y-1.5">
                  {batchRows.map((row) => {
                    const done = row.ids.every((id) => pickedIds.has(id));
                    const some = !done && row.ids.some((id) => pickedIds.has(id));
                    return (
                      <button key={row.text} type="button" onClick={() => toggleIds(row.ids)} className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${done ? "border-emerald-300 bg-ok-bg" : "border-line bg-surface hover:bg-surface-2"}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-[12px] font-black ${done ? "border-emerald-500 bg-emerald-500 text-white" : some ? "border-emerald-400 bg-emerald-100 text-emerald-600" : "border-line text-transparent"}`}>{some ? "–" : "✓"}</span>
                        <span className={`min-w-0 flex-1 truncate text-[14px] font-black ${done ? "text-ink-mute line-through" : "text-ink"}`}>{row.text}</span>
                        <span className="shrink-0 whitespace-nowrap text-right">
                          <span className={`text-[16px] font-black ${done ? "text-ink-mute" : "text-rose-deep"}`}>×{row.totalQty}</span>
                          <span className="ml-1 text-[11px] font-bold text-ink-mute">({row.pickedQty}/{row.totalQty})</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )
          ) : displayPanels.length === 0 ? (
            <div className="py-10 text-center text-sm font-bold text-ink-mute">{unpickedOnly ? "안 챙긴 게 없어요! 다 챙겼습니다 🎉" : "챙길 주문이 없습니다."}</div>
          ) : (
            <div className="space-y-2.5">
              {displayPanels.map((panel) => {
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
                      {panel.phone && (phoneCount.get(panel.phone) || 0) > 1 ? (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700" title="같은 고객의 다른 주문도 있어요 — 한 박스로 같이 포장하세요(합배송)">📦 같은고객 {phoneCount.get(panel.phone)}건</span>
                      ) : null}
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
                            {/* [2026-07-13] 상품금액 표시 — 주문에 저장된 값 그대로(표시 전용) */}
                            {it.amount > 0 ? (
                              <span className={`shrink-0 text-[12px] font-black ${picked ? "text-ink-mute" : "text-rose-deep"}`}>{it.amount.toLocaleString("ko-KR")}원</span>
                            ) : null}
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
