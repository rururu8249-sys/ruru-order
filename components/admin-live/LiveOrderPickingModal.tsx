"use client";

// 물건챙기기 체크리스트 팝업 (주문서 단위 패널).
//   - 주문서 1건(같은 order_group_id) = 패널 1개. 같은 닉네임이라도 주문서 다르면 다른 패널.
//   - 상품별/고객별은 같은 주문 행의 챙김 상태를 보여주는 두 가지 보기.
//   - 체크는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 유지.
//   - 결제완료 기본, 미결제는 조회만. 일괄 챙김은 현재 조회된 결제완료 항목만 확인 후 저장.
//   - 상단 "챙김 N개 / 전체 M개"는 수량 합계. picked_at 한 칸만 update(돈/주문 로직 무관).

import { useEffect, useMemo, useRef, useState } from "react";
import { formatOrderOptionText, stripNoneOptionParts } from "@/lib/orderOptionText";
import { isPickingComplete, pickingProgress, savePicking } from "@/lib/orderPicking";
import { productSearchMatches } from "@/lib/productSearch";
import { compareOrderOptions } from "@/lib/orderOptionSort";
import { supabase } from "@/lib/supabase";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";
import { classifyPickingAttention, type PickingAttentionKind } from "@/lib/orderPickingWorkspace";

// [㉚] 범위 = 주문서(LiveOrderTable)에서 지금 고른 필터(방송·기간·범위)의 주문 그대로(orders). 창 안 방송 선택은 없다.
//   scopeTooWide = 주문서 필터가 전체 방송·전체 기간처럼 너무 넓을 때(목록 대신 안내만).
type Props = { orders: LiveOrder[]; filterLabel: string; scopeTooWide?: boolean; onClose: () => void };

// [2026-07-13 사장님 지침] amount = 주문에 저장된 상품금액(표시 전용, 재계산 안 함)
type PickItem = { id: string; productId: string; text: string; productName: string; optionText: string; color: string; size: string; qty: number; amount: number; unitPrice?: number; attentionKind: PickingAttentionKind; latePaid?: boolean; repickBefore?: LiveOrderItem["repickBefore"]; attentionAt?: string | null };
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

function buildPanels(orderList: readonly LiveOrder[], attentionSource: boolean): Panel[] {
  const list: Panel[] = [];
  for (const o of orderList) {
    const status = clean(o.paymentStatus);
    if (status === "canceled" || o.excludeFromPicking === true) continue;
    const paid = PAID_STATUSES.includes(status);
    const nickname = clean(o.nickname) || clean(o.name) || "-";
    const name = clean(o.recipientName) || clean(o.name) || "";
    const searchText = [clean(o.nickname), clean(o.name), clean(o.recipientName)].filter(Boolean).join(" ").toLowerCase();
    const when = clean(o.createdAt) || clean(o.submittedAt);
    const rawItems = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
    const items: PickItem[] = rawItems.length === 0
      ? [{ id: String(o.id), productId: "", text: clean(o.orderSummary) || "상품", productName: clean(o.orderSummary) || "상품", optionText: "", color: "", size: "", qty: 1, amount: Number(o.productAmount || 0), unitPrice: Number(o.productAmount || 0), attentionKind: null }]
      : rawItems.map((it) => {
          const opt = formatOrderOptionText(it.color, it.size) || stripNoneOptionParts(it.optionText);
          const productName = clean(it.productName) || "상품";
          return {
            id: String(it.id), productId: clean(it.productId), text: productName + (opt ? ` (${opt})` : ""), productName,
            optionText: opt, color: clean(it.color), size: clean(it.size), qty: Number(it.qty || 1), amount: Number(it.amount || 0),
            unitPrice: Number(it.unitPrice || 0), // [㉙-2] 표시 전용 단가(어댑터 값 그대로, 재계산 없음)
            attentionKind: attentionSource ? classifyPickingAttention(o, { ...it, pickedAt: null }) : null,
            // [㉙-0] 표시 전용 「늦은 입금」 배지 — 주문일보다 늦은 날 입금확인(자정 넘긴 방송 포함). 분류·목록 이동엔 안 쓴다.
            latePaid: classifyPickingAttention(o, { ...it, pickedAt: null }) === "late_paid",
            repickBefore: it.repickBefore, attentionAt: it.repickRequiredAt || o.paidAtFull,
          };
        });
    const totalQty = items.reduce((sum, item) => sum + (Number.isFinite(item.qty) ? item.qty : 1), 0);
    const phone = clean(o.phone).replace(/[^0-9]/g, "");
    list.push({ key: String(o.groupId || o.id), nickname, name, phone, search: searchText, paid, when, items, totalQty });
  }
  return list;
}

export default function LiveOrderPickingModal({ orders, filterLabel, scopeTooWide = false, onClose }: Props) {
  // [㉚] 「오늘 추가 작업」(범위 밖 늦은 입금·다시 챙기기)만 서버에서 한 번 받는다. 범위 안 주문은 orders 그대로.
  const [additionalWorkspaceOrders, setAdditionalWorkspaceOrders] = useState<LiveOrder[]>([]);
  const [additionalError, setAdditionalError] = useState("");
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [workArea, setWorkArea] = useState<"selected" | "additional">("selected");
  const [workspaceTab, setWorkspaceTab] = useState<"standard" | "late_paid" | "repick" | "picked">("standard");
  const [viewMode, setViewMode] = useState<"batch" | "order">("batch");
  const [sortModes, setSortModes] = useState<{ batch: "name" | "remaining"; order: "name" | "remaining" | "oldest" | "newest" }>({ batch: "name", order: "name" });
  const [sortPickedIds, setSortPickedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // [㉘] 결제 상태 보기 — 목록(allRows/matches)·엑셀만 바뀐다. 숫자·챙김 진행은 결제완료 기준 그대로. 미결제 줄은 조회만(버튼 disabled).
  const [payView, setPayView] = useState<"paid" | "unpaid" | "all">("paid");
  const inPayView = (panel: { paid: boolean }) => payView === "all" || (payView === "paid" ? panel.paid : !panel.paid);
  const [exporting, setExporting] = useState(false);
  // [㉙-2] 사진 크게 보기(회원목록 photoZoom 패턴) · 누락 대조 줄의 취소/제외 목록 펼침
  const [photoZoom, setPhotoZoom] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const [sessionCompletedIds, setSessionCompletedIds] = useState<Set<string>>(new Set());

  const activeSelectedOrders = orders;
  const activeAdditionalOrders = additionalWorkspaceOrders;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin-live/picking-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ broadcastIds: [] }) });
        const payload = await response.json() as { ok?: boolean; additionalOrders?: LiveOrder[]; message?: string };
        if (!response.ok || !payload.ok || !Array.isArray(payload.additionalOrders)) throw new Error(payload.message || "오늘 추가 작업을 불러오지 못했습니다.");
        if (alive) { setAdditionalWorkspaceOrders(payload.additionalOrders); setAdditionalError(""); }
      } catch (error) {
        if (alive) setAdditionalError(error instanceof Error ? error.message : "오늘 추가 작업을 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  const selectedPanels = useMemo(() => buildPanels(activeSelectedOrders, false), [activeSelectedOrders]);
  const additionalPanels = useMemo(() => buildPanels(activeAdditionalOrders, true), [activeAdditionalOrders]);
  // [㉙-0] 자정 넘긴 방송 — 선택 방송에 속한 주문(서버가 broadcast_id 일치 또는 방송 시간 안으로 준 목록)은
  //   입금 시각과 무관하게 「선택 방송 작업」에 남긴다. 「오늘 추가 작업」은 선택 방송에 없는 줄 + 다시 챙기기(repick)만.
  //   repick 은 기존대로 추가 작업에만(선택 방송에서 뺀다). 같은 줄이 두 곳에 동시에 나오지 않는다.
  const selectedItemIds = useMemo(() => new Set(selectedPanels.flatMap((panel) => panel.items.map((item) => item.id))), [selectedPanels]);
  const repickItemIds = useMemo(() => new Set(additionalPanels.flatMap((panel) => panel.items.filter((item) => item.attentionKind === "repick").map((item) => item.id))), [additionalPanels]);
  const selectedOnlyPanels = useMemo(() => selectedPanels.flatMap((panel) => {
    const items = panel.items.filter((item) => !repickItemIds.has(item.id));
    return items.length ? [{ ...panel, items, totalQty: items.reduce((sum, item) => sum + item.qty, 0) }] : [];
  }), [selectedPanels, repickItemIds]);
  const additionalOnlyPanels = useMemo(() => additionalPanels.flatMap((panel) => {
    const items = panel.items.filter((item) => item.attentionKind === "repick" || !selectedItemIds.has(item.id));
    return items.length ? [{ ...panel, items, totalQty: items.reduce((sum, item) => sum + item.qty, 0) }] : [];
  }), [additionalPanels, selectedItemIds]);
  const allPanels = useMemo(() => [...selectedOnlyPanels, ...additionalOnlyPanels], [selectedOnlyPanels, additionalOnlyPanels]);
  const panels = workArea === "selected" ? selectedOnlyPanels : additionalOnlyPanels;

  // [㉒] 상품 사진(읽기 전용·보조 표시). 공용 규칙(resolveOrderItemPhoto)만 쓴다 — 주문상세와 동일 패턴.
  //   productId 있는 줄만 products 조회(200개씩), item.id → 사진 URL. 실패해도 조용히 무시.
  const [itemPhoto, setItemPhoto] = useState<Record<string, string>>({});
  const photoIdKey = useMemo(
    () => Array.from(new Set(allPanels.flatMap((p) => p.items.map((it) => it.productId).filter(Boolean)))).sort().join(","),
    [allPanels],
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
        for (const panel of allPanels) {
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
  const scopedPanels = useMemo(() => panels.filter((panel) => panel.paid), [panels]);
  const allPaidPanels = useMemo(() => allPanels.filter((panel) => panel.paid), [allPanels]);
  const scopedIds = useMemo(() => allPanels.flatMap(p => p.items.map(it => it.id)), [allPanels]);
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
  }, [idKey, allPanels, saving]);

  const updatePicked = async (ids: string[], picked: boolean) => {
    if (busyRef.current || readingRef.current || loading || loadError || ids.length === 0) return;
    const paidIds = new Set(allPaidPanels.flatMap(p => p.items.map(it => it.id)));
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
      setSessionCompletedIds((current) => {
        const updated = new Set(current);
        for (const id of ids) {
          if (picked) updated.add(id);
          else updated.delete(id);
        }
        return updated;
      });
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
    if (saving || loading || loadError || exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/admin-live/picking-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ broadcastIds: [], includeExceptions: true, orderIds: activeSelectedOrders.flatMap(order => order.items?.length ? order.items.map(item => String(item.id)) : [String(order.id)]) }) });
      const payload = await response.json() as { ok?: boolean; orders?: LiveOrder[]; additionalOrders?: LiveOrder[]; exceptions?: import("@/lib/orderPickingExceptions").PickingExceptionRow[]; cancellations?: import("@/lib/orderPickingExceptions").PickingCancellationRow[]; message?: string };
      if (!response.ok || !payload.ok || !Array.isArray(payload.exceptions) || !Array.isArray(payload.orders) || !Array.isArray(payload.additionalOrders)) throw new Error(payload.message || "주문과 고객이슈를 모두 확인하지 못했습니다. 다시 시도해주세요.");
      const freshOrders = [...payload.orders, ...payload.additionalOrders];
      const currentPickedIds = new Set(freshOrders.flatMap(order => (order.items || []).filter(item => item.pickedAt && classifyPickingAttention(order, item) !== "repick").map(item => String(item.id))));
      // [㉖] 챙김 여부와 관계없이 범위 안 결제완료 줄 전부 — 챙긴 줄은 엑셀 「챙김」 칸에 ✓.
      // [㉘] 결제 상태 칩을 따른다. 미결제 줄은 엑셀 기존 처리(결제 칸 「미입금」·분홍 배경). 출력 기록은 결제완료 줄에만.
      const freshPanels = buildPanels(freshOrders, false).filter(inPayView);
      const visibleIds = new Set(freshPanels.flatMap(panel => panel.items).map(item => item.id));
      const printedIds = freshPanels.filter(panel => panel.paid).flatMap(panel => panel.items).map(item => item.id);
      const payScopeLabel = payView === "paid" ? "결제완료 전체" : payView === "unpaid" ? "미결제만" : "미결제 포함 전체";
      if (!visibleIds.size && !payload.exceptions.length && !payload.cancellations?.length) { showAdminToast(`내보낼 ${payView === "paid" ? "결제완료 " : payView === "unpaid" ? "미결제 " : ""}상품이나 미처리 고객이슈가 없습니다.`, "warning"); return; }
      const seenItemIds = new Set<string>();
      const exportOrders = freshOrders.flatMap(order => {
        const items = (order.items || []).filter(item => {
          const id = String(item.id);
          if (!visibleIds.has(id) || seenItemIds.has(id)) return false;
          seenItemIds.add(id);
          return true;
        });
        if (order.items?.length) return items.length ? [{...order, items}] : [];
        const id = String(order.id);
        if (!visibleIds.has(id) || seenItemIds.has(id)) return [];
        seenItemIds.add(id);
        return [order];
      });
      await exportLiveOrdersForPicking(exportOrders, { filterLabel: `${title} · ${payScopeLabel}`, rowOrder: viewMode === 'batch' ? 'product' : sortMode === 'oldest' ? 'time' : 'nickname', visibleItemIds: [...visibleIds], attentionItemIds: (() => { const selectedExportIds = new Set(payload.orders.flatMap(order => (order.items || []).map(item => String(item.id)))); return payload.additionalOrders.flatMap(order => (order.items || []).filter(item => classifyPickingAttention(order, item) === "repick" || !selectedExportIds.has(String(item.id))).map(item => String(item.id))); })(), exceptions: payload.exceptions, cancellations: payload.cancellations }, currentPickedIds);
      const ids = printedIds.map(Number);
      const now = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from("orders").update({ picking_list_printed_at: now }).is("picking_list_printed_at", null).in("id", ids.slice(i, i + 500));
        if (error) throw error;
      }
    } catch (error: unknown) {
      showAdminToast("엑셀 내보내기 또는 출력 기록 저장 실패\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally { setExporting(false); }
  };

  const scopedRows = scopedPanels.flatMap(panel => panel.items.map(item => ({ panel, item })));
  const progress = pickingProgress(scopedRows.map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
  const tabCounts = scopedRows.reduce((counts, { item }) => {
    if (pickedIds.has(item.id)) counts.picked += item.qty;
    else if (item.attentionKind === "repick") counts.repick += item.qty;
    else if (item.attentionKind === "late_paid" || item.attentionKind === "payment_time_missing") counts.late_paid += item.qty;
    else counts.standard += item.qty;
    return counts;
  }, { standard: 0, late_paid: 0, repick: 0, picked: 0 });
  const selectedOpenQty = selectedOnlyPanels.flatMap((panel) => panel.paid ? panel.items : []).reduce((sum, item) => sum + (pickedIds.has(item.id) ? 0 : item.qty), 0);
  const additionalOpenRows = additionalOnlyPanels.flatMap((panel) => panel.paid ? panel.items : []).filter((item) => !pickedIds.has(item.id));
  const additionalOpenQty = additionalOpenRows.reduce((sum, item) => sum + item.qty, 0);
  const additionalLateQty = additionalOpenRows.filter((item) => item.attentionKind === "late_paid" || item.attentionKind === "payment_time_missing").reduce((sum, item) => sum + item.qty, 0);
  const visibleTabs: ReadonlyArray<["standard" | "late_paid" | "repick" | "picked", string, number]> = workArea === "selected"
    ? [["standard", "일반 챙김", tabCounts.standard], ["picked", "챙김 완료", tabCounts.picked]]
    : [["late_paid", "결제 후 추가 챙기기", tabCounts.late_paid], ["repick", "상품 변경 · 다시 챙기기", tabCounts.repick], ["picked", "챙김 완료", tabCounts.picked]];
  // [㉘] 화면 목록 = 결제 상태 칩 범위(미결제 포함 가능). scopedRows(결제완료)는 숫자 계산 전용으로 그대로.
  const viewRows = panels.filter(inPayView).flatMap(panel => panel.items.map(item => ({ panel, item })));
  const inTab = ({ item }: { item: PickItem }) => {
    const done = pickedIds.has(item.id);
    if (workspaceTab === "picked") return done;
    // [㉖] 「일반 챙김」은 이전에 챙긴 줄도 ✓(초록 배경·버튼)로 계속 보인다 — 다시 열어도 확인 가능.
    //   추가 작업 탭(결제 후 추가·다시 챙기기)은 기존대로 이번에 체크한 줄만 남긴다.
    if (done && workspaceTab !== "standard" && !sessionCompletedIds.has(item.id)) return false;
    if (workspaceTab === "repick") return item.attentionKind === "repick";
    if (workspaceTab === "late_paid") return item.attentionKind === "late_paid" || item.attentionKind === "payment_time_missing";
    return item.attentionKind === null;
  };
  const allRows = viewRows.filter(inTab);
  const total = progress.total;
  const got = progress.got;
  const q = search.trim();
  const matches = allRows.filter(({ panel, item }) =>
    !q || productSearchMatches([panel.search, item.text].join(" "), q));
  // [㉙-2] 이 탭에서 검색어·결제 칩 때문에 숨겨진 수량(경고 줄용, 표시 전용).
  const sumQty = (rows: readonly { item: PickItem }[]) => rows.reduce((sum, { item }) => sum + item.qty, 0);
  const hiddenQty = sumQty(panels.flatMap(panel => panel.items.map(item => ({ panel, item }))).filter(inTab)) - sumQty(matches);
  // [㉙-2] 누락 대조(선택 방송 작업) — 주문서 기준 N = 결제완료 a + 미결제 b + 추가 작업(다시 챙기기) c + 취소/제외 d.
  const droppedRows = activeSelectedOrders.filter(o => clean(o.paymentStatus) === "canceled" || o.excludeFromPicking === true)
    .flatMap(o => (o.items?.length ? o.items : [{ id: String(o.id), productName: clean(o.orderSummary) || "상품", optionText: "", qty: 1 } as LiveOrderItem]).map(it => ({ o, it })));
  const recon = {
    paid: selectedOnlyPanels.filter(panel => panel.paid).reduce((sum, panel) => sum + panel.totalQty, 0),
    unpaid: selectedOnlyPanels.filter(panel => !panel.paid).reduce((sum, panel) => sum + panel.totalQty, 0),
    moved: selectedPanels.flatMap(panel => panel.items).filter(item => repickItemIds.has(item.id)).reduce((sum, item) => sum + item.qty, 0),
    dropped: droppedRows.reduce((sum, { it }) => sum + Math.max(1, Number(it.qty) || 1), 0),
  };
  const reconTotal = recon.paid + recon.unpaid + recon.moved + recon.dropped;
  const priceText = (rows: readonly { item: PickItem }[]) => {
    const prices = [...new Set(rows.map(({ item }) => item.unitPrice || 0).filter(price => price > 0))].sort((a, b) => a - b);
    if (!prices.length) return "";
    return prices.length === 1 ? `${prices[0].toLocaleString("ko-KR")}원` : `${prices[0].toLocaleString("ko-KR")}~${prices[prices.length - 1].toLocaleString("ko-KR")}원`;
  };
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
  for (const row of scopedRows) {
    const key = viewMode === 'batch' ? (row.item.productId || row.item.productName) + '|' + row.item.productName : row.panel.key;
    remainingByGroup.set(key, (remainingByGroup.get(key) || 0) + (sortPickedIds.has(row.item.id) ? 0 : row.item.qty));
  }
  const sortedGroups = [...grouped].sort(([ak, a], [bk, b]) => {
    const oldest = (group: typeof a) => Math.min(...group.rows.map(row => ts(row.panel.when)));
    const newest = (group: typeof a) => Math.max(...group.rows.map(row => ts(row.panel.when)));
    const primary = sortMode === "remaining" ? (remainingByGroup.get(bk) || 0) - (remainingByGroup.get(ak) || 0) : sortMode === "oldest" ? oldest(a) - oldest(b) : sortMode === "newest" ? newest(b) - newest(a) : 0;
    return primary || a.title.localeCompare(b.title, "ko", {numeric:true}) || ak.localeCompare(bk, "ko", {numeric:true});
  });
  const blocked = loading || saving || loadError || exporting;
  const title = String(filterLabel || "").replace(/^방송:\s*/, "");
  // [㉙-2] 머리 숫자 — 결제완료 기준 「남은 n / 전체 N개」 + 얇은 진행바, 다 챙기면 「✓ 다 챙김」. 미결제는 빨간 「미결제 N」 따로.
  const progressBlock = (p: { total: number; got: number }, unpaid: number, size: "lg" | "md", mobilePrice = "") => {
    const done = isPickingComplete(p);
    return (
      <div className={`shrink-0 text-right max-sm:w-auto ${size === "lg" ? "w-[136px]" : "w-[120px]"}`}>
        {done
          ? <div className="whitespace-nowrap leading-tight"><span className="inline-block rounded-full bg-[var(--color-ok-tx)] px-2 py-0.5 text-[12px] font-black text-white">✓ 다 챙김</span>{/* [2026-10-21] 다 챙긴 뒤에도 총 수량이 보이게 */}<span className="ml-1.5 text-[12px] font-bold text-ink-soft tabular-nums">전체 {p.total}개</span></div>
          : <div className={`whitespace-nowrap font-black leading-tight text-ink tabular-nums ${size === "lg" ? "text-[16px] max-sm:text-[14px]" : "text-[14px]"}`}>남은 {p.total - p.got} <span className="text-[12px] font-bold text-ink-soft">/ 전체 {p.total}개</span></div>}
        {!done && p.total > 0 ? <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line max-sm:hidden"><div className="h-full rounded-full bg-[var(--color-ok-tx)]" style={{ width: `${Math.round((p.got / p.total) * 100)}%` }} /></div> : null}
        {unpaid > 0 ? <div className="text-[12px] font-bold text-[var(--color-danger-tx)] tabular-nums">미결제 {unpaid}</div> : null}
        {mobilePrice ? <div className="text-[12px] font-bold text-ink-soft tabular-nums sm:hidden">{mobilePrice}</div> : null}
      </div>
    );
  };
  const renderRow = ({ panel, item }: PickingRow) => {
    const done = pickedIds.has(item.id);
    // [㉗] 상품별 = 옵션 아래 «손님 줄» — 사진·옵션명은 옵션 머리줄에 있으므로 줄에선 뺀다. 고객별은 기존 그대로.
    const batch = viewMode === "batch";
    return (
      <div key={item.id} className={`grid items-center gap-2 px-3 py-2 max-sm:py-1 ${batch ? "grid-cols-[48px_minmax(0,1fr)_92px] max-sm:grid-cols-[40px_minmax(0,1fr)_80px] max-[360px]:grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[56px_minmax(0,1fr)_92px] max-[360px]:grid-cols-[56px_minmax(0,1fr)]"} ${done ? "bg-ok-bg/60" : "bg-surface"}`}>
        {batch ? (
          // [㉙-2] 수량을 맨 앞 큰 배지로 — 2개 이상이면 빨강(놓치기 쉬운 수량 강조).
          <span aria-label={`수량 ${item.qty}개`} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px] font-black tabular-nums max-sm:h-10 max-sm:w-10 max-sm:text-[18px] ${item.qty >= 2 ? "bg-danger-bg text-[var(--color-danger-tx)]" : "bg-surface-2 text-ink"}`}>{item.qty}</span>
        ) : itemPhoto[item.id] ? (
          <button type="button" onClick={() => setPhotoZoom(itemPhoto[item.id])} aria-label="사진 크게 보기" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={itemPhoto[item.id]} alt={item.productName} className="h-14 w-14 rounded-lg border border-line object-cover" />
          </button>
        ) : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] text-ink-mute">사진 없음</span>}
        <div className="min-w-0 flex-1">
          {viewMode === "order" ? <div className="break-words text-sm font-black text-ink">{item.productName}</div> : null}
          {batch ? null : <div className="break-words text-sm font-black text-rose-deep">{item.optionText || "기본 옵션"}</div>}
          <div className={batch ? "break-words text-[14px] font-bold text-ink max-sm:text-[13px] max-sm:leading-snug" : "mt-1 text-[12px] font-bold text-ink-soft"}>{panel.nickname}{panel.name && panel.name !== panel.nickname ? ` · ${panel.name}` : ""} · 주문 #{item.id}{batch && item.attentionKind === null && item.latePaid ? <span className="ml-1.5 inline-block sm:hidden rounded bg-info-bg px-1.5 align-middle text-[11px] font-black leading-[18px] text-[var(--color-info-tx)]">늦은 입금</span> : null}</div>
          {item.attentionKind === null && item.latePaid ? <span className={`mt-1 inline-block ${batch ? "max-sm:hidden" : ""} rounded bg-info-bg px-1.5 py-0.5 text-[11px] font-black text-[var(--color-info-tx)]`}>늦은 입금</span> : null}
          {!done && item.attentionKind === "repick" ? (
            <div className="mt-1 rounded-lg bg-warn-bg px-2 py-1 text-[11px] font-black text-[var(--color-danger-tx)]">
              상품 변경 · 다시 챙기기 · {[
                item.repickBefore?.product_name,
                [item.repickBefore?.color, item.repickBefore?.size].filter(Boolean).join(" / "),
                item.repickBefore?.qty ? `${item.repickBefore.qty}개` : "",
              ].filter(Boolean).join(" · ")} → {item.productName} · {item.optionText || "기본 옵션"} · {item.qty}개
            </div>
          ) : !done && item.attentionKind === "late_paid" ? (
            <div className="mt-1 inline-block rounded-lg bg-info-bg px-2 py-1 text-[11px] font-black text-[var(--color-info-tx)]">결제 후 추가로 챙겨야 합니다</div>
          ) : !done && item.attentionKind === "payment_time_missing" ? (
            <div className="mt-1 inline-block rounded-lg bg-info-bg px-2 py-1 text-[11px] font-black text-[var(--color-info-tx)]">카드결제 완료 · 추가로 챙겨야 합니다</div>
          ) : null}
          {!panel.paid ? <span className="mt-1 inline-block rounded bg-warn-bg px-2 py-1 text-[12px] font-black text-[var(--color-danger-tx)]">미결제 · 조회만 가능</span> : null}
        </div>
        <div className="text-right max-[360px]:col-span-2 max-[360px]:flex max-[360px]:items-center max-[360px]:justify-between max-[360px]:border-t max-[360px]:border-line max-[360px]:pt-1">
          {batch ? null : <div className="text-[20px] font-black text-ink">{item.qty}<span className="text-[12px]">개</span></div>}
          <button type="button" role="checkbox" aria-checked={done} aria-label={`${panel.nickname} ${item.productName} ${item.optionText} ${item.qty}개 ${done ? "챙김 해제" : "챙김"}`}
            disabled={blocked || !panel.paid} onClick={() => updatePicked([item.id], !pickedRef.current.has(item.id))}
            className={`mt-1 flex min-h-[44px] min-w-[92px] items-center justify-center gap-2 rounded-lg border-2 px-2 text-[13px] font-black max-sm:mt-0 max-sm:min-h-10 max-sm:min-w-[80px] max-sm:gap-1 max-sm:px-1 max-sm:text-[12px] disabled:opacity-50 ${done ? "border-ok-tx bg-[var(--color-ok-tx)] text-white" : "border-line bg-surface text-ink-soft"}`}>
            <span aria-hidden="true">{done ? "✓" : "□"}</span>{done ? "챙김 완료" : item.attentionKind === "repick" ? "다시 챙김 완료" : "챙김 완료"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      {photoZoom ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-6" onClick={() => setPhotoZoom("")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoZoom} alt="상품 사진" className="max-h-[80vh] max-w-[80vw] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setPhotoZoom("")} className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1 text-sm font-black text-ink shadow" aria-label="사진 닫기">✕</button>
        </div>
      ) : null}
      <div role="dialog" aria-modal="true" aria-label="물건챙기기" className="flex h-[94dvh] w-[min(820px,96vw)] max-sm:w-[98vw] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="relative flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 max-sm:py-1">
          <h2 className="shrink-0 text-[16px] font-black text-rose-deep">물건챙기기</h2>
          <details className="shrink-0 text-[12px] text-ink-soft">
            <summary aria-label="작업 안내" className="flex min-h-9 sm:min-h-11 cursor-pointer items-center whitespace-nowrap font-bold md:min-h-8">안내</summary>
            <div className="absolute left-3 top-full z-10 w-[min(300px,calc(100%-24px))] rounded-lg border border-line bg-surface p-3 shadow-lg">
              <p className="mt-2">상품·옵션·수량 확인 후 체크 · 두 화면 연동 · 저장 후 목록 유지</p>
              {sortMode === 'remaining' ? <p className="mt-2">체크 후 순서 유지 · 다시 정렬로 갱신</p> : null}
            </div>
          </details>
          <div className="ml-auto text-right text-[12px] font-bold tabular-nums" aria-live="polite"><span className="text-rose-deep">안 챙김 {countersUnknown ? "—" : total - got}</span><span className="ml-2 text-ok-tx">챙김 {countersUnknown ? "—" : got}/{total}개</span></div>
          <button type="button" disabled={saving || exporting} onClick={onClose} aria-label="닫기" className="h-9 w-9 shrink-0 rounded-full bg-surface-2 text-[22px] disabled:opacity-40">×</button>
        </div>
        <p aria-label="작업 범위" className={`shrink-0 break-words border-b border-line px-3 py-1 text-[11px] font-bold leading-4 text-ink-soft`}>작업 범위: {workArea === "selected" ? title : "오늘 추가 작업 · 주문서 범위 밖 결제 후 추가 및 상품 변경"} · 취소·챙기기 제외 주문 제외</p>
        {workArea === "selected" && !scopeTooWide && !countersUnknown ? (
          <div aria-label="누락 대조" className="shrink-0 border-b border-line px-3 py-1 max-sm:py-0.5 text-[12px] font-bold text-ink-soft tabular-nums">
            {/* [㉚-1] 좁은 화면에선 항목 단위로만 줄바꿈(항목 안은 안 끊김) — 가로 넘침 0. 넓은 화면은 한 줄 그대로. */}
            <span className="whitespace-nowrap">주문서 기준 {reconTotal}개 =</span>{" "}
            <span className="whitespace-nowrap">결제완료{" "}
            <button type="button" onClick={() => { setWorkspaceTab("standard"); setPayView("paid"); }} className="font-black text-ink underline underline-offset-2">{recon.paid}</button></span>
            {" "}<span className="whitespace-nowrap">+ 미결제{" "}
            <button type="button" onClick={() => { setWorkspaceTab("standard"); setPayView("unpaid"); }} className="font-black text-[var(--color-danger-tx)] underline underline-offset-2">{recon.unpaid}</button></span>
            {" "}<span className="whitespace-nowrap">· 추가 작업{" "}
            <button type="button" onClick={() => { setWorkArea("additional"); setWorkspaceTab("repick"); setSearch(""); }} className="font-black text-ink underline underline-offset-2">{recon.moved}</button></span>
            {" "}<span className="whitespace-nowrap">· 취소/제외{" "}
            <button type="button" aria-expanded={showDropped} onClick={() => setShowDropped(open => !open)} className="font-black text-ink underline underline-offset-2">{recon.dropped}</button></span>
            {showDropped ? (
              <ul aria-label="취소·챙기기 제외 목록" className="mt-1 space-y-0.5 rounded-lg bg-surface-2 px-2 py-1 font-semibold">
                {droppedRows.length === 0 ? <li>없음</li> : droppedRows.map(({ o, it }) => (
                  <li key={String(it.id)}>{clean(o.paymentStatus) === "canceled" ? "취소" : "챙기기 제외"} · {clean(o.nickname) || clean(o.name) || "-"} · {clean(it.productName)}{it.optionText ? ` (${stripNoneOptionParts(it.optionText)})` : ""} × {Math.max(1, Number(it.qty) || 1)} · 주문 #{String(it.id)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {hiddenQty > 0 ? (
          <div aria-label="숨김 경고" className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-warn-bg px-3 py-1 text-[12px] font-black text-warn-tx">
            <span className="min-w-0 max-sm:truncate">검색어·결제 칩 때문에 이 목록에서 {hiddenQty}개가 숨겨져 있어요</span>
            <button type="button" onClick={() => { setSearch(""); setPayView("all"); }} className="shrink-0 rounded-lg border border-warn-tx/35 bg-surface px-2 py-0.5 text-[12px] font-black">지우기</button>
          </div>
        ) : null}
        <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-line bg-surface px-3 py-2 max-sm:py-1">
          <button type="button" aria-label="선택 방송 작업" aria-pressed={workArea === "selected"} onClick={() => { setWorkArea("selected"); setWorkspaceTab("standard"); setSearch(""); }} className={`min-h-8 sm:min-h-11 rounded-xl px-3 text-[13px] font-black ${workArea === "selected" ? "bg-rose-deep text-white" : "bg-surface-2 text-ink-soft"}`}>선택 방송 작업 <span className="tabular-nums">{countersUnknown ? "—" : selectedOpenQty}</span></button>
          <button type="button" aria-label="오늘 추가 작업" aria-pressed={workArea === "additional"} onClick={() => { setWorkArea("additional"); setWorkspaceTab(additionalLateQty > 0 ? "late_paid" : "repick"); setSearch(""); }} className={`min-h-8 sm:min-h-11 rounded-xl px-3 text-[13px] font-black ${workArea === "additional" ? "bg-rose-deep text-white" : "bg-warn-bg text-[var(--color-danger-tx)]"}`}>오늘 추가 작업 <span className="tabular-nums">{countersUnknown ? "—" : additionalOpenQty}</span></button>
        </div>
        {workArea === "selected" ? null : <p className="shrink-0 border-b border-line bg-info-bg px-3 py-2 text-[12px] font-bold text-[var(--color-info-tx)]">주문서 범위와 섞이지 않는 별도 작업함입니다. 주문서 범위에 속하지 않는 종료 방송 주문 중 주문일보다 늦게(오늘) 입금확인된 미챙김 상품과, 챙김 완료 후 변경된 상품만 표시합니다. 범위 안의 늦은 입금은 「선택 방송 작업」에 「늦은 입금」 배지로 있습니다.</p>}
        {workArea === "additional" && additionalError ? <p role="alert" className="shrink-0 bg-warn-bg px-3 py-2 text-[12px] font-black text-[var(--color-danger-tx)]">오늘 추가 작업을 불러오지 못했습니다 · {additionalError}</p> : null}
        <div className="shrink-0 space-y-2 border-b border-line px-3 py-2 max-sm:space-y-1 max-sm:py-1">
          <div aria-label="물건챙기기 목록 도구" className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 max-sm:pb-0">
            <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-surface p-1 max-sm:p-0.5">
              {visibleTabs.map(([value, label, count]) => (
                <button key={value} type="button" aria-label={`${label} 탭`} aria-pressed={workspaceTab === value} onClick={() => setWorkspaceTab(value)} className={`min-h-9 rounded-lg px-3 text-[12px] font-black sm:min-h-11 md:min-h-9 ${workspaceTab === value ? "bg-rose-deep text-white" : value === "late_paid" || value === "repick" ? "text-[var(--color-danger-tx)]" : "text-ink-soft"}`}>
                  {label} <span className="tabular-nums">{countersUnknown ? "—" : count}</span>
                </button>
              ))}
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg bg-surface-2 p-0.5">
              {(["batch", "order"] as const).map(mode => <button key={mode} type="button" onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode} className={`min-h-9 rounded-xl px-3 text-[13px] font-black sm:min-h-11 md:min-h-8 ${viewMode === mode ? "bg-rose-deep text-white" : "text-ink-soft"}`}>{mode === "batch" ? "상품별" : "고객별"}</button>)}
            </div>
            <div role="group" aria-label="결제 상태 보기" className="flex shrink-0 gap-1 rounded-lg bg-surface-2 p-0.5">
              {([["paid", "결제완료만"], ["unpaid", "미결제만"], ["all", "전체"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setPayView(value)} aria-pressed={payView === value} className={`min-h-9 rounded-xl px-3 text-[13px] font-black sm:min-h-11 md:min-h-8 ${payView === value ? "bg-rose-deep text-white" : "text-ink-soft"}`}>{label}</button>)}
            </div>
            <label className="flex w-[180px] shrink-0 items-center text-[11px] font-bold text-ink-soft max-sm:w-[132px]">
              <span className="sr-only">정렬</span>
              <select aria-label="정렬 방식" value={sortMode} onChange={event => {setSortModes(previous => ({...previous,[viewMode]:event.target.value})); setSortPickedIds(new Set(pickedIds));}} className="block h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"><option value="name">{viewMode === 'batch' ? '상품명 ㄱㄴㄷ순' : '닉네임 ㄱㄴㄷ순'}</option>{viewMode === 'order' ? <><option value="oldest">주문 오래된순</option><option value="newest">주문 최신순</option></> : null}<option value="remaining">남은 수량 많은순</option></select>
            </label>
            {sortMode === 'remaining' ? <button type="button" disabled={blocked} onClick={() => setSortPickedIds(new Set(pickedIds))} className="shrink-0 text-[12px] font-bold text-rose-deep">다시 정렬</button> : null}
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="상품번호 · 고객 검색" aria-label="상품번호 또는 고객 이름 검색" className="h-9 min-w-[180px] max-w-[320px] flex-1 rounded-lg border border-line px-3 text-[13px]" />
          </div>
          {workspaceTab === "late_paid" ? <p className="rounded-lg bg-info-bg px-3 py-2 text-[12px] font-bold text-[var(--color-info-tx)]">주문서 범위에 속하지 않는 종료 방송 주문 중, 주문일보다 늦게(오늘) 입금확인된 미챙김 상품입니다. 지금 추가로 챙겨 주세요.</p> : null}
          {workspaceTab === "repick" ? <p className="rounded-lg bg-warn-bg px-3 py-2 text-[12px] font-bold text-[var(--color-danger-tx)]">챙김 완료 후 상품·색상·사이즈·수량이 변경됐습니다. 변경 전후를 확인하고 다시 챙겨 주세요.</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2 p-2 max-sm:pt-1 sm:p-3">
          {/* [㉚] 주문서 필터가 너무 넓으면(전체 방송·전체 기간) 목록 대신 안내만 */}
          {workArea === "selected" && scopeTooWide ? <div aria-label="범위 안내" className="py-12 text-center text-[14px] font-bold text-ink-soft">주문서에서 방송이나 날짜를 먼저 골라 주세요</div> : null}
          {!(workArea === "selected" && scopeTooWide) && !loading && !loadError && matches.length === 0 ? <div className="py-12 text-center font-bold text-ink-soft">현재 조회 조건에 맞는 상품이 없습니다.</div> : null}
          <div className="mx-auto max-w-[760px] space-y-2 max-sm:space-y-1.5">
            {sortedGroups.map(([key, group]) => {
              // [㉘] 챙김 진행은 결제완료 줄 기준, 미결제 수량은 「미결제 N」으로 따로.
              const progress = pickingProgress(group.rows.filter(({ panel }) => panel.paid).map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
              const unpaidQty = group.rows.filter(({ panel }) => !panel.paid).reduce((sum, { item }) => sum + item.qty, 0);
              if (viewMode === "batch") {
                // [㉗] 상품 → 옵션별 합계 → 그 옵션을 산 손님. 옵션 순서 = 행 정렬(compareOrderOptions) 첫 등장 순.
                const productPhoto = group.rows.map(({ item }) => itemPhoto[item.id]).find(Boolean) || "";
                const options = new Map<string, PickingRow[]>();
                for (const row of group.rows) {
                  const optKey = row.item.optionText || "기본 옵션";
                  options.set(optKey, [...(options.get(optKey) || []), row]);
                }
                // [㉙-2] 단가: 상품 머리엔 항상, 옵션별 단가가 다르면 옵션 머리에도.
                const productPrice = priceText(group.rows);
                // [2026-10-21 사장님 요청] 상품 머리줄에 옵션별 수량 요약 — 「베이지 / 사이즈 L 3 · 블랙 / 사이즈 M 2(남은 1)」. 결제완료 줄 기준(옵션 머리 숫자와 같은 식).
                const optionSummary = [...options].map(([optKey, optRows]) => {
                  const op = pickingProgress(optRows.filter(({ panel }) => panel.paid).map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
                  if (op.total <= 0) return "";
                  const left = op.total - op.got;
                  return `${stripNoneOptionParts(optKey) || optKey} ${op.total}${left > 0 && left < op.total ? `(남은 ${left})` : ""}`;
                }).filter(Boolean).join(" · ");
                const optionPricesDiffer = new Set(group.rows.map(({ item }) => item.unitPrice || 0).filter(price => price > 0)).size > 1;
                // sticky 가 동작하도록 section 은 overflow-clip(overflow-hidden 은 sticky 를 막는다). 머리 높이 고정: 상품 72px · 옵션 48px.
                return <section key={key} className="overflow-clip rounded-xl border border-line bg-surface">
                  <div className="sticky top-0 z-[2] flex h-[72px] items-center gap-3 bg-rose-soft px-3 py-1.5 max-sm:h-auto max-sm:min-h-12 max-sm:gap-2 max-sm:py-1">
                    {productPhoto ? (
                      <button type="button" onClick={() => setPhotoZoom(productPhoto)} aria-label="사진 크게 보기" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={productPhoto} alt={group.title} className="h-14 w-14 rounded-lg border border-line object-cover max-sm:h-10 max-sm:w-10" />
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <h3 title={group.title} className={`${options.size > 1 ? "truncate" : "line-clamp-2"} break-words text-[18px] font-black leading-tight text-ink max-sm:text-[16px]`}>{group.title}</h3>
                      {productPrice ? <div className="text-[12px] font-bold text-ink-soft tabular-nums max-sm:hidden">{productPrice}</div> : null}
                      {options.size > 1 && optionSummary ? <div title={optionSummary} aria-label="옵션별 수량" className="truncate text-[12px] font-bold text-ink-soft tabular-nums">{optionSummary}</div> : null}
                    </div>
                    {progressBlock(progress, unpaidQty, "lg", productPrice)}
                  </div>
                  {[...options].map(([optKey, optRows]) => {
                    const optProgress = pickingProgress(optRows.filter(({ panel }) => panel.paid).map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
                    const optUnpaidQty = optRows.filter(({ panel }) => !panel.paid).reduce((sum, { item }) => sum + item.qty, 0);
                    const optPhoto = optRows.map(({ item }) => itemPhoto[item.id]).find(Boolean) || "";
                    const optPrice = optionPricesDiffer ? priceText(optRows) : "";
                    return <div key={optKey} className="border-t border-line">
                      <div className="sticky top-[72px] z-[1] max-sm:static flex h-12 max-sm:h-8 items-center gap-2 border-b border-line bg-surface-2 px-3">
                        {optPhoto && optPhoto !== productPhoto ? (
                          <button type="button" onClick={() => setPhotoZoom(optPhoto)} aria-label="사진 크게 보기" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={optPhoto} alt={optKey} className="h-10 w-10 rounded-lg border border-line object-cover" />
                          </button>
                        ) : null}
                        <h4 title={optKey} className="min-w-0 flex-1 truncate text-[16px] font-black text-rose-deep">{optKey}{optPrice ? <span className="ml-2 text-[12px] font-bold text-ink-soft tabular-nums">{optPrice}</span> : null}</h4>
                        {progressBlock(optProgress, optUnpaidQty, "md")}
                      </div>
                      <div className="divide-y divide-line">{optRows.map(renderRow)}</div>
                    </div>;
                  })}
                </section>;
              }
              return <section key={key} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex items-start justify-between gap-2 bg-rose-soft px-3 py-1.5">
                  <div className="min-w-0"><h3 className="break-words text-[16px] font-black text-ink">{group.title}</h3>{group.subtitle ? <div className="mt-1 text-[12px] font-bold text-ink-soft">{group.subtitle}</div> : null}</div>
                  {progressBlock(progress, unpaidQty, "md")}
                </div>
                <div className="divide-y divide-line">{group.rows.map(renderRow)}</div>
              </section>;
            })}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5 max-sm:py-1">
          <div role="status" aria-live="polite" className={`text-[12px] font-bold ${loadError ? 'w-full text-[var(--color-danger-tx)]' : 'text-ink-soft'}`}>{loading ? "상태 확인 중…" : loadError ? "상태 확인 실패 · 창을 다시 열어 주세요. 체크는 잠시 막았습니다." : saving ? "저장 중…" : "저장 완료"}</div>
          <div className="text-[11px] font-bold text-ink-mute max-sm:hidden">잘못 완료한 한 건은 해당 상품의 [챙김 완료] 버튼을 다시 눌러 되돌릴 수 있습니다.</div>
          <div className="flex gap-2">
            {workArea === "selected" && workspaceTab === "standard" ? <button type="button" disabled={blocked || exporting || !matches.length} onClick={completeAll} aria-label="현재 목록 모두 챙김 완료" className="min-h-9 sm:min-h-[44px] rounded-lg border border-ok-tx bg-ok-bg px-3 max-sm:px-2 text-[13px] font-black text-ok-tx disabled:opacity-40"><span className="max-sm:hidden">현재 목록 모두 챙김 완료</span><span className="sm:hidden">모두 챙김</span></button> : null}
            <button type="button" disabled={blocked || exporting} onClick={runExcel} aria-label="물건챙기기 엑셀" className="min-h-9 sm:min-h-[44px] rounded-lg border border-line px-3 max-sm:px-2 text-[13px] font-bold disabled:opacity-40">{exporting ? "내보내는 중…" : <><span className="max-sm:hidden">물건챙기기 엑셀</span><span className="sm:hidden">엑셀</span></>}</button>
            <button type="button" disabled={saving || exporting} onClick={onClose} className="min-h-9 sm:min-h-[44px] rounded-lg bg-rose-deep px-4 text-[13px] font-black text-white disabled:opacity-40">닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
