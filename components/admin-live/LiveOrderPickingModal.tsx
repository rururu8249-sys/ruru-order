"use client";

// 물건챙기기 체크리스트 팝업 (주문서 단위 패널).
//   - 주문서 1건(같은 order_group_id) = 패널 1개. 같은 닉네임이라도 주문서 다르면 다른 패널.
//   - 상품별/고객별은 같은 주문 행의 챙김 상태를 보여주는 두 가지 보기.
//   - 체크는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 유지.
//   - 결제완료 기본, 미결제는 조회만. 일괄 챙김은 현재 조회된 결제완료 항목만 확인 후 저장.
//   - 상단 "챙김 N개 / 전체 M개"는 수량 합계. picked_at 한 칸만 update(돈/주문 로직 무관).

import { useEffect, useMemo, useRef, useState } from "react";
import { formatOrderOptionText, stripNoneOptionParts } from "@/lib/orderOptionText";
import { pickingProgress, savePicking } from "@/lib/orderPicking";
import { productSearchMatches } from "@/lib/productSearch";
import { compareOrderOptions } from "@/lib/orderOptionSort";
import { supabase } from "@/lib/supabase";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";
import PickingBroadcastSelector from "./PickingBroadcastSelector";
import type { BroadcastCalendarItem } from "./BroadcastCalendarPicker";
import { classifyPickingAttention, filterPickingWorkspaceOrders, type PickingAttentionKind, type PickingPaymentDateFilter } from "@/lib/orderPickingWorkspace";

type Props = { orders: LiveOrder[]; filterLabel: string; broadcastCalendar?: BroadcastCalendarItem[]; onClose: () => void };

// [2026-07-13 사장님 지침] amount = 주문에 저장된 상품금액(표시 전용, 재계산 안 함)
type PickItem = { id: string; productId: string; text: string; productName: string; optionText: string; color: string; size: string; qty: number; amount: number; attentionKind: PickingAttentionKind; repickBefore?: LiveOrderItem["repickBefore"]; attentionAt?: string | null };
type Panel = { key: string; nickname: string; name: string; phone: string; search: string; paid: boolean; when: string; items: PickItem[]; totalQty: number };
// [2026-09-20 사장님 요청] 상품별 = 상품(총 N개) → 그 밑에 옵션(색상/사이즈)별 N개. 옵션은 색상 가나다 → 사이즈 순.

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

export default function LiveOrderPickingModal({ orders, filterLabel, broadcastCalendar = [], onClose }: Props) {
  const initialBroadcastIds = useMemo(() => Array.from(new Set(orders.map((order) => order.broadcastId).filter((id): id is string => Boolean(id)))), [orders]);
  const [workspaceOrders, setWorkspaceOrders] = useState<LiveOrder[]>(orders);
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState<string[]>(initialBroadcastIds);
  const [appliedBroadcastIds, setAppliedBroadcastIds] = useState<string[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState("");
  const [remoteScopeApplied, setRemoteScopeApplied] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [workspaceTab, setWorkspaceTab] = useState<"all" | "attention">("all");
  const [paymentDateFilter, setPaymentDateFilter] = useState<PickingPaymentDateFilter>("all_paid");
  const [viewMode, setViewMode] = useState<"batch" | "order">("batch");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpicked" | "picked">("all");
  const [paymentFilter, setPaymentFilter] = useState<"paid" | "all" | "unpaid">("paid");
  const [sortModes, setSortModes] = useState<{ batch: "name" | "remaining"; order: "name" | "remaining" | "oldest" | "newest" }>({ batch: "name", order: "name" });
  const [sortPickedIds, setSortPickedIds] = useState<Set<string>>(new Set());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const activeWorkspaceOrders = remoteScopeApplied ? workspaceOrders : orders;

  const applyBroadcastScope = async () => {
    setScopeError("");
    if (selectedBroadcastIds.length === 0) {
      setWorkspaceOrders(orders);
      setAppliedBroadcastIds([]);
      setRemoteScopeApplied(false);
      return;
    }
    setScopeLoading(true);
    try {
      const response = await fetch("/api/admin-live/picking-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broadcastIds: selectedBroadcastIds }),
      });
      const payload = await response.json() as { ok?: boolean; orders?: LiveOrder[]; message?: string };
      if (!response.ok || !payload.ok || !Array.isArray(payload.orders)) throw new Error(payload.message || "방송 주문을 불러오지 못했습니다.");
      setWorkspaceOrders(payload.orders);
      setAppliedBroadcastIds([...selectedBroadcastIds]);
      setRemoteScopeApplied(true);
    } catch (error) {
      setScopeError(error instanceof Error ? error.message : "방송 주문을 불러오지 못했습니다.");
    } finally {
      setScopeLoading(false);
    }
  };

  const dateFilteredOrders = useMemo(() => paymentDateFilter === "all_paid"
    ? activeWorkspaceOrders
    : filterPickingWorkspaceOrders(activeWorkspaceOrders, { paymentDateFilter }), [activeWorkspaceOrders, paymentDateFilter]);

  // 주문서 단위 패널 (취소건 제외)
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    for (const o of dateFilteredOrders) {
      const status = clean(o.paymentStatus);
      if (status === "canceled") continue;
      // [㉕-B] 테스트 주문 등 챙기기 제외 대상은 뺀다(엑셀 isPickingExportExcluded 와 같은 기준).
      if (o.excludeFromPicking === true) continue;
      const paid = PAID_STATUSES.includes(status);
      const nickname = clean(o.nickname) || clean(o.name) || "-"; // 주문 닉네임(크게)
      const name = clean(o.recipientName) || clean(o.name) || "";
      // 검색용: 닉네임·이름·받는사람 전부 포함(닉네임으로 검색해도, 이름으로 검색해도 잡히게)
      const searchText = [clean(o.nickname), clean(o.name), clean(o.recipientName)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const when = clean(o.createdAt) || clean(o.submittedAt);
      const rawItems = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
      const items: PickItem[] =
        rawItems.length === 0
          ? [{ id: String(o.id), productId: "", text: clean(o.orderSummary) || "상품", productName: clean(o.orderSummary) || "상품", optionText: "", color: "", size: "", qty: 1, amount: Number(o.productAmount || 0), attentionKind: null }]
          : rawItems.map((it) => {
              const opt = formatOrderOptionText(it.color, it.size) || stripNoneOptionParts(it.optionText);
              const productName = clean(it.productName) || "상품";
              return { id: String(it.id), productId: clean(it.productId), text: productName + (opt ? ` (${opt})` : ""), productName, optionText: opt, color: clean(it.color), size: clean(it.size), qty: Number(it.qty || 1), amount: Number(it.amount || 0), attentionKind: classifyPickingAttention(o, it), repickBefore: it.repickBefore, attentionAt: it.repickRequiredAt || o.paidAtFull };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      const phone = clean(o.phone).replace(/[^0-9]/g, ""); // 같은 고객 판정용(숫자만)
      list.push({ key: String(o.groupId || o.id), nickname, name, phone, search: searchText, paid, when, items, totalQty });
    }
    return list;
  }, [dateFilteredOrders]);

  // [㉒] 상품 사진(읽기 전용·보조 표시). 공용 규칙(resolveOrderItemPhoto)만 쓴다 — 주문상세와 동일 패턴.
  //   productId 있는 줄만 products 조회(200개씩), item.id → 사진 URL. 실패해도 조용히 무시.
  const [itemPhoto, setItemPhoto] = useState<Record<string, string>>({});
  const photoIdKey = useMemo(
    () => Array.from(new Set(panels.flatMap((p) => p.items.map((it) => it.productId).filter(Boolean)))).sort().join(","),
    [panels],
  );
  useEffect(() => {
    let stopped = false;
    const ids = photoIdKey ? photoIdKey.split(",") : [];
    if (ids.length === 0) return;
    (async () => {
      try {
        const byId = new Map<string, Record<string, unknown>>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await supabase.from("products").select("*").in("id", ids.slice(i, i + 200));
          if (stopped) return;
          for (const p of (data || []) as Record<string, unknown>[]) byId.set(String((p as { id?: unknown }).id ?? ""), p);
        }
        const next: Record<string, string> = {};
        for (const panel of panels) {
          for (const it of panel.items) {
            if (!it.productId) continue;
            const prow = byId.get(it.productId);
            if (!prow) continue;
            const r = resolveOrderItemPhoto(prow, { productName: it.productName, color: it.color });
            if (r.url) next[it.id] = r.url;
          }
        }
        if (!stopped) setItemPhoto(next);
      } catch { /* 사진은 보조 — 실패해도 목록은 정상 */ }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIdKey]);


  // Read all eligible rows so switching filters never hides persisted completion.
  const scopedPanels = useMemo(() => panels.filter(p => paymentFilter === "all" || (paymentFilter === "paid" ? p.paid : !p.paid)), [panels, paymentFilter]);
  const scopedIds = useMemo(() => panels.flatMap(p => p.items.map(it => it.id)), [panels]);
  const idKey = scopedIds.slice().sort().join(",");
  const pickedRef = useRef(pickedIds);
  const busyRef = useRef(false);
  const readingRef = useRef(true);
  const readGeneration = useRef(0);
  const [reading, setReading] = useState(true);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = reading || loadedKey !== idKey;
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Rechecking the same scope must not blank already-confirmed counters.
  // New scopes and failed reads still hide uncertain values and block writes.
  const countersUnknown = loadedKey !== idKey || loadError;

  const readPicked = async (ids: string[]) => {
    const found = new Map<string, boolean>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase.from("orders").select("id, picked_at").in("id", ids.slice(i, i + 500).map(Number));
      if (error) throw error;
      for (const row of data || []) found.set(String(row.id), Boolean(row.picked_at));
    }
    if (ids.some(id => !found.has(id))) throw new Error("일부 주문의 챙김 상태를 확인하지 못했습니다.");
    return new Set([...found].filter(([, picked]) => picked).map(([id]) => id));
  };

  useEffect(() => {
    let alive = true;
    const generation = ++readGeneration.current;
    // A live refresh cannot race a save. The saving=false effect re-reads afterward.
    if (busyRef.current) return;
    readingRef.current = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      setReading(true);
      try {
        const next = await readPicked(idKey ? idKey.split(",") : []);
        if (alive && generation === readGeneration.current) {
          pickedRef.current = next;
          setPickedIds(next);
          setLoadError(false);
        }
      } catch {
        if (alive && generation === readGeneration.current) setLoadError(true);
      } finally {
        if (alive && generation === readGeneration.current) {
          readingRef.current = false;
          setReading(false);
          setLoadedKey(idKey);
        }
      }
    })();
    return () => { alive = false; };
  }, [idKey, panels, saving]);

  const updatePicked = async (ids: string[], picked: boolean) => {
    if (busyRef.current || readingRef.current || loading || loadError || ids.length === 0) return;
    const paidIds = new Set(panels.filter(p => p.paid).flatMap(p => p.items.map(it => it.id)));
    if (ids.some(id => !paidIds.has(id))) return;
    busyRef.current = true;
    ++readGeneration.current;
    setSaving(true);
    try {
      // Show completion only after the server confirms every affected row.
      await savePicking(supabase, ids, picked);
      const next = new Set(pickedRef.current);
      for (const id of ids) { if (picked) next.add(id); else next.delete(id); }
      pickedRef.current = next;
      setPickedIds(next);
    } catch (error: unknown) {
      showAdminToast("챙김 저장 실패 — 완료로 처리하지 않았습니다.\n" + (error instanceof Error ? error.message : String(error)), "error");
      try {
        const truth = await readPicked(scopedIds);
        pickedRef.current = truth;
        setPickedIds(truth);
      } catch { setLoadError(true); }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (busyRef.current || loading || loadError) return;
    const ids = matches.filter(row => row.panel.paid && pickedIds.has(row.item.id)).map(row => row.item.id);
    if (!ids.length) { showAdminToast("현재 조회 목록에 해제할 챙김 표시가 없습니다.", "warning"); return; }
    if (!(await showAdminConfirm(`현재 조회 목록 ${ids.length}개 항목의 챙김 표시를 해제할까요?\n주문·입금·금액·출고 상태는 바뀌지 않습니다.`))) return;
    await updatePicked(ids, false);
  };

  const completeAll = async () => {
    if (busyRef.current || readingRef.current || loading || loadError) return;
    const targets = matches.filter(row => row.panel.paid && row.item.attentionKind === null && !pickedRef.current.has(row.item.id));
    if (!targets.length) return;
    const ids = [...new Set(targets.map(row => row.item.id))];
    const qty = targets.reduce((sum, row) => sum + row.item.qty, 0);
    if (!(await showAdminConfirm(`현재 조회된 결제완료 상품 ${ids.length}개 항목 · 수량 ${qty}개를 모두 챙김으로 표시할까요?\n미결제·취소 주문은 제외하며, 주문금액·입금·출고 상태는 바뀌지 않습니다.`))) return;
    await updatePicked(ids, true);
  };

  const runExcel = async () => {
    if (saving || loading || loadError) return;
    if (!matches.length) { showAdminToast("내보낼 조회 목록이 없습니다.", "warning"); return; }
    setExporting(true);
    try {
      const visibleIds = new Set(matches.map(row => row.item.id));
      const exportOrders = activeWorkspaceOrders.flatMap(order => {
        const items = (order.items || []).filter(item => visibleIds.has(String(item.id)));
        if (order.items?.length) return items.length ? [{...order, items}] : [];
        return visibleIds.has(String(order.id)) ? [order] : [];
      });
      const paymentLabel = paymentFilter === 'paid' ? '결제완료만' : paymentFilter === 'unpaid' ? '미결제만' : '미결제 포함';
      const stateLabel = statusFilter === 'all' ? '전체보기' : statusFilter === 'picked' ? '챙김만' : '안 챙김만';
      await exportLiveOrdersForPicking(exportOrders, { filterLabel: `${filterLabel} · ${paymentLabel} · ${stateLabel}${q ? ` · 검색: ${q}` : ''}`, rowOrder: viewMode === 'batch' ? 'product' : sortMode === 'oldest' ? 'time' : 'nickname', visibleItemIds: [...visibleIds] }, pickedIds);
      const ids = [...visibleIds].map(Number);
      const now = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from("orders").update({ picking_list_printed_at: now }).is("picking_list_printed_at", null).in("id", ids.slice(i, i + 500));
        if (error) throw error;
      }
    } catch (error: unknown) {
      showAdminToast("엑셀 내보내기 또는 출력 기록 저장 실패\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally { setExporting(false); }
  };

  const allRows = scopedPanels
    .flatMap(panel => panel.items.map(item => ({ panel, item })))
    .filter(({ item }) => workspaceTab === "all" || item.attentionKind !== null);
  const { total, got } = pickingProgress(allRows.map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
  const q = search.trim();
  const matches = allRows.filter(({ panel, item }) =>
    (!q || productSearchMatches([panel.search, item.text].join(" "), q)) &&
    (statusFilter === "all" || (statusFilter === "unpicked" ? !pickedIds.has(item.id) : pickedIds.has(item.id))));
  type PickingRow = typeof allRows[number];
  const grouped = new Map<string, { title: string; subtitle: string; rows: PickingRow[] }>();
  for (const row of matches) {
    const key = viewMode === "batch" ? (row.item.productId || row.item.productName) + "|" + row.item.productName : row.panel.key;
    const group = grouped.get(key) || {
      title: viewMode === "batch" ? row.item.productName : row.panel.nickname,
      subtitle: viewMode === "batch" ? "" : [row.panel.name, whenText(row.panel.when)].filter(Boolean).join(" · "),
      rows: [],
    };
    group.rows.push(row);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    group.rows.sort((a, b) => viewMode === "batch"
      ? compareOrderOptions(a.item, b.item) || a.panel.nickname.localeCompare(b.panel.nickname, "ko") || ts(a.panel.when) - ts(b.panel.when)
      : a.item.productName.localeCompare(b.item.productName, "ko", {numeric:true}) || compareOrderOptions(a.item,b.item));
  }
  const sortMode = sortModes[viewMode];
  const remainingByGroup = new Map<string, number>();
  for (const row of allRows) {
    const key = viewMode === 'batch' ? (row.item.productId || row.item.productName) + '|' + row.item.productName : row.panel.key;
    remainingByGroup.set(key, (remainingByGroup.get(key) || 0) + (sortPickedIds.has(row.item.id) ? 0 : row.item.qty));
  }
  const sortedGroups = [...grouped].sort(([ak, a], [bk, b]) => {
    const oldest = (group: typeof a) => Math.min(...group.rows.map(row => ts(row.panel.when)));
    const newest = (group: typeof a) => Math.max(...group.rows.map(row => ts(row.panel.when)));
    const primary = sortMode === "remaining" ? (remainingByGroup.get(bk) || 0) - (remainingByGroup.get(ak) || 0) : sortMode === "oldest" ? oldest(a) - oldest(b) : sortMode === "newest" ? newest(b) - newest(a) : 0;
    return primary || a.title.localeCompare(b.title, "ko", {numeric:true}) || ak.localeCompare(bk, "ko", {numeric:true});
  });
  const blocked = loading || saving || loadError;
  const title = String(filterLabel || "").replace(/^방송:\s*/, "");
  const renderRow = ({ panel, item }: PickingRow) => {
    const done = pickedIds.has(item.id);
    return (
      <div key={item.id} className={`grid grid-cols-[56px_minmax(0,1fr)_92px] items-center gap-2 px-3 py-2 max-[360px]:grid-cols-[56px_minmax(0,1fr)] ${done ? "bg-ok-bg/60" : "bg-surface"}`}>
        {itemPhoto[item.id] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={itemPhoto[item.id]} alt={item.productName} className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover" />
        ) : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] text-ink-mute">사진 없음</span>}
        <div className="min-w-0 flex-1">
          {viewMode === "order" ? <div className="break-words text-sm font-black text-ink">{item.productName}</div> : null}
          <div className="break-words text-sm font-black text-rose-deep">{item.optionText || "기본 옵션"}</div>
          <div className="mt-1 text-[12px] font-bold text-ink-soft">{panel.nickname}{panel.name && panel.name !== panel.nickname ? ` · ${panel.name}` : ""} · 주문 #{item.id}</div>
          {item.attentionKind === "repick" ? (
            <div className="mt-1 rounded-lg bg-warn-bg px-2 py-1 text-[11px] font-black text-[var(--color-danger-tx)]">
              변경 후 재챙김 · {[
                item.repickBefore?.product_name,
                [item.repickBefore?.color, item.repickBefore?.size].filter(Boolean).join(" / "),
                item.repickBefore?.qty ? `${item.repickBefore.qty}개` : "",
              ].filter(Boolean).join(" · ")} → {item.productName} · {item.optionText || "기본 옵션"} · {item.qty}개
            </div>
          ) : item.attentionKind === "late_paid" ? (
            <div className="mt-1 inline-block rounded-lg bg-info-bg px-2 py-1 text-[11px] font-black text-[var(--color-info-tx)]">결제 후 챙김 · 뒤늦게 결제 확인</div>
          ) : null}
          {!panel.paid ? <span className="mt-1 inline-block rounded bg-warn-bg px-2 py-1 text-[12px] font-black text-[var(--color-danger-tx)]">미결제 · 조회만 가능</span> : null}
        </div>
        <div className="text-right max-[360px]:col-span-2 max-[360px]:flex max-[360px]:items-center max-[360px]:justify-between max-[360px]:border-t max-[360px]:border-line max-[360px]:pt-1">
          <div className="text-[20px] font-black text-ink">{item.qty}<span className="text-[12px]">개</span></div>
          <button type="button" role="checkbox" aria-checked={done} aria-label={`${panel.nickname} ${item.productName} ${item.optionText} ${item.qty}개 ${done ? "챙김 해제" : "챙김"}`}
            disabled={blocked || !panel.paid} onClick={() => updatePicked([item.id], !pickedRef.current.has(item.id))}
            className={`mt-1 flex min-h-[44px] min-w-[92px] items-center justify-center gap-2 rounded-lg border-2 px-2 text-[13px] font-black disabled:opacity-50 ${done ? "border-ok-tx bg-[var(--color-ok-tx)] text-white" : "border-line bg-surface text-ink-soft"}`}>
            <span aria-hidden="true">{done ? "✓" : "□"}</span>{done ? "챙김" : "안 챙김"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="물건챙기기" className="flex h-[94dvh] w-[min(1120px,98vw)] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="relative flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <h2 className="shrink-0 text-[16px] font-black text-rose-deep">물건챙기기</h2>
          <details className="shrink-0 text-[12px] text-ink-soft">
            <summary aria-label="작업 안내" className="flex min-h-11 cursor-pointer items-center whitespace-nowrap font-bold md:min-h-8">안내</summary>
            <div className="absolute left-3 top-full z-10 w-[min(300px,calc(100%-24px))] rounded-lg border border-line bg-surface p-3 shadow-lg">
              <p className="mt-2">상품·옵션·수량 확인 후 체크 · 두 화면 연동 · 저장 후 목록 유지</p>
              {sortMode === 'remaining' ? <p className="mt-2">체크 후 순서 유지 · 다시 정렬로 갱신</p> : null}
            </div>
          </details>
          <div className="ml-auto text-right text-[12px] font-bold tabular-nums" aria-live="polite"><span className="text-rose-deep">안 챙김 {countersUnknown ? "—" : total - got}</span><span className="ml-2 text-ok-tx">챙김 {countersUnknown ? "—" : got}/{total}개</span></div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="닫기" className="h-9 w-9 shrink-0 rounded-full bg-surface-2 text-[22px] disabled:opacity-40">×</button>
        </div>
        <p aria-label="작업 범위" className="shrink-0 break-words border-b border-line px-3 py-1 text-[11px] font-bold leading-4 text-ink-soft">작업 범위: {title} · 취소·챙기기 제외 주문 제외</p>
        <PickingBroadcastSelector items={broadcastCalendar} selectedIds={selectedBroadcastIds} appliedIds={appliedBroadcastIds} loading={scopeLoading} onChange={setSelectedBroadcastIds} onApply={() => void applyBroadcastScope()} />
        {scopeError ? <p role="alert" className="shrink-0 bg-warn-bg px-3 py-2 text-[12px] font-black text-[var(--color-danger-tx)]">범위를 바꾸지 않았습니다 · {scopeError}</p> : null}
        <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-0.5">
              <button type="button" aria-label="전체 챙김 탭" aria-pressed={workspaceTab === "all"} onClick={() => setWorkspaceTab("all")} className={`min-h-11 rounded-lg px-3 text-[13px] font-black md:min-h-8 ${workspaceTab === "all" ? "bg-rose-deep text-white" : "text-ink-soft"}`}><span>전체 챙김</span></button>
              <button type="button" aria-label="추가 챙김" aria-pressed={workspaceTab === "attention"} onClick={() => setWorkspaceTab("attention")} className={`min-h-11 rounded-lg px-3 text-[13px] font-black md:min-h-8 ${workspaceTab === "attention" ? "bg-[var(--color-danger-tx)] text-white" : "text-[var(--color-danger-tx)]"}`}><span>추가 챙김</span></button>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg bg-surface-2 p-0.5">
              {(["batch", "order"] as const).map(mode => <button key={mode} type="button" onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode} className={`min-h-11 rounded-xl px-3 text-[13px] font-black md:min-h-8 ${viewMode === mode ? "bg-rose-deep text-white" : "text-ink-soft"}`}>{mode === "batch" ? "상품별" : "고객별"}</button>)}
            </div>
            <div className="flex gap-1">
              {([['all','전체보기',total],['unpicked','안 챙김만',total-got],['picked','챙김만',got]] as const).map(([value,label,count]) => <button key={value} type="button" aria-label={label} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`min-h-11 rounded-xl border border-line px-2 text-[12px] font-bold tabular-nums md:min-h-8 ${statusFilter === value ? 'bg-rose-deep text-white' : 'bg-surface text-ink-soft'}`}>{value === 'all' ? '전체' : value === 'unpicked' ? '안 챙김' : '챙김'} {countersUnknown ? '—' : count}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center [&_label]:flex [&_label]:items-center [&_label]:gap-1 [&_select]:!mt-0 [&_select]:!h-9">
            <label className="min-w-0 text-[11px] font-bold text-ink-soft"><span className="sr-only sm:not-sr-only sm:whitespace-nowrap">결제 범위</span><select aria-label="결제 범위" value={paymentFilter} onChange={event => {setPaymentFilter(event.target.value as typeof paymentFilter); setSortPickedIds(new Set(pickedIds));}} className="block h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"><option value="paid">결제완료만</option><option value="all">미결제 포함</option><option value="unpaid">미결제만</option></select></label>
            <label className="min-w-0 text-[11px] font-bold text-ink-soft"><span className="sr-only sm:not-sr-only sm:whitespace-nowrap">결제일</span><select aria-label="결제일 기준" value={paymentDateFilter} onChange={event => setPaymentDateFilter(event.target.value as PickingPaymentDateFilter)} className="block h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"><option value="all_paid">결제일 전체</option><option value="today_paid">오늘 결제</option><option value="late_paid">뒤늦게 결제</option></select></label>
            <label className="min-w-0 text-[11px] font-bold text-ink-soft"><span className="sr-only sm:not-sr-only sm:whitespace-nowrap">정렬</span><select aria-label="정렬 방식" value={sortMode} onChange={event => {setSortModes(previous => ({...previous,[viewMode]:event.target.value})); setSortPickedIds(new Set(pickedIds));}} className="block h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"><option value="name">{viewMode === 'batch' ? '상품명 ㄱㄴㄷ순' : '닉네임 ㄱㄴㄷ순'}</option>{viewMode === 'order' ? <><option value="oldest">주문 오래된순</option><option value="newest">주문 최신순</option></> : null}<option value="remaining">남은 수량 많은순</option></select></label>
            {sortMode === 'remaining' ? <button type="button" disabled={blocked} onClick={() => setSortPickedIds(new Set(pickedIds))} className="text-[12px] font-bold text-rose-deep">다시 정렬</button> : null}
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="상품번호 · 고객 검색" aria-label="상품번호 또는 고객 이름 검색" className="col-span-2 h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-[13px]" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2 p-2 sm:p-3">
          {!loading && !loadError && matches.length === 0 ? <div className="py-12 text-center font-bold text-ink-soft">현재 조회 조건에 맞는 상품이 없습니다.</div> : null}
          <div className="space-y-2">
            {sortedGroups.map(([key, group]) => {
              const progress = pickingProgress(group.rows.map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
              return <section key={key} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex items-start justify-between gap-2 bg-rose-soft px-3 py-1.5">
                  <div className="min-w-0"><h3 className="break-words text-[16px] font-black text-ink">{group.title}</h3>{group.subtitle ? <div className="mt-1 text-[12px] font-bold text-ink-soft">{group.subtitle}</div> : null}</div>
                  <span className="shrink-0 text-[12px] font-black text-ink-soft">{progress.got}/{progress.total}개</span>
                </div>
                <div className="divide-y divide-line">{group.rows.map(renderRow)}</div>
              </section>;
            })}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5">
          <div role="status" aria-live="polite" className={`text-[12px] font-bold ${loadError ? 'w-full text-[var(--color-danger-tx)]' : 'text-ink-soft'}`}>{loading ? "상태 확인 중…" : loadError ? "상태 확인 실패 · 창을 다시 열어 주세요. 체크는 잠시 막았습니다." : saving ? "저장 중…" : "저장 완료"}</div>
          <div className="relative"><button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(value => !value)} className="min-h-[44px] px-2 text-[13px] font-bold text-ink-soft">더보기</button>{toolsOpen ? <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-line bg-surface p-2 shadow-lg"><button type="button" disabled={blocked || exporting} onClick={resetAll} className="min-h-[44px] text-[12px] font-bold text-[var(--color-danger-tx)] disabled:opacity-40">조회 목록 챙김 해제</button></div> : null}</div>
          <div className="flex gap-2">
            <button type="button" disabled={blocked || exporting || !matches.some(row => row.panel.paid && row.item.attentionKind === null && !pickedIds.has(row.item.id))} onClick={completeAll} className="min-h-[44px] rounded-lg border border-ok-tx bg-ok-bg px-3 text-[13px] font-black text-ok-tx disabled:opacity-40">전체 챙김</button>
            <button type="button" disabled={blocked || exporting || !matches.length} onClick={runExcel} className="min-h-[44px] rounded-lg border border-line px-3 text-[13px] font-bold disabled:opacity-40">{exporting ? "내보내는 중…" : "조회 목록 엑셀"}</button>
            <button type="button" disabled={saving || exporting} onClick={onClose} className="min-h-[44px] rounded-lg bg-rose-deep px-4 text-[13px] font-black text-white disabled:opacity-40">닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
