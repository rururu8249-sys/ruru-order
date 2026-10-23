"use client";

// [2026-10-23 사장님 「지금 설계 다 버리고 새로 — 뭐 팔았고 뭐 챙기면 되는지만」] 물건챙기기 = 오른쪽 옆 창.
//   보기는 «상품별»·«고객별» 두 개뿐. 탭(챙길/챙긴/추가 작업)·작업 영역 나누기·결제 칩·요약 보기 폐지.
//   한 목록에 다 들어간다:
//     ① 주문서 범위(지금 고른 방송·날짜)의 주문
//     ② 이 출고로 넘긴 «지난 주문» 상품(가상 묶음) — 같은 상품·옵션 줄 안에서 「지난 주문 1개 포함」으로
//     ③ 오늘 서버가 알려 준 추가 작업(범위 밖 늦은 입금 · 상품 변경 뒤 다시 챙기기) — 같은 줄 안에 「늦은 입금 1개 포함」 등
//   다른 출고로 넘긴 상품은 여기서 빼고(중복 포장 방지) 맨 위에 개수만 알린다.
//   챙김 저장 = orders.picked_at 한 칸(savePicking) — 예전 창과 같은 함수·같은 확인 절차. 돈·입금·주문상태 무접촉.
//   숫자: 챙길 개수 = 결제완료 기준(챙긴 n / 챙길 N). 미결제는 「미결제 N」으로 따로 보이고, 사장님 판단으로 챙길 수는 있다.

import { useEffect, useMemo, useRef, useState } from "react";
import { formatOrderOptionText, stripNoneOptionParts } from "@/lib/orderOptionText";
import { savePicking } from "@/lib/orderPicking";
import { productSearchMatches } from "@/lib/productSearch";
import { compareOrderOptions } from "@/lib/orderOptionSort";
import { supabase } from "@/lib/supabase";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";
import { classifyPickingAttention } from "@/lib/orderPickingWorkspace";
import { pulledForOf, shortDateWithWeekday } from "@/lib/orderPickPull";
import { fetchExchangeMarks } from "@/lib/exchangeMarks";
import { issueMarkKind, issueTargetItemIds, isStrikeKind, targetTextFromReturnReason } from "@/lib/orderIssueMarks";

type Props = { orders: LiveOrder[]; filterLabel: string; scopeTooWide?: boolean; onClose: () => void };

/** 줄 종류 — normal(이 출고 주문) · past(지난 주문을 이 출고로 넘김) · late(범위 밖 늦은 입금) · repick(상품 변경 뒤 다시 챙기기) */
export type PickKind = "normal" | "past" | "late" | "repick";
export type PickRow = {
  id: string;
  /** 주문번호(교환 표식 조회용) */
  orderNo?: string;
  customerKey: string;
  nickname: string;
  name: string;
  when: string;
  paid: boolean;
  productId: string;
  productName: string;
  color: string;
  size: string;
  optionText: string;
  qty: number;
  unitPrice: number;
  kind: PickKind;
  /** 「지난 주문 10.11(일)」·「늦은 입금」·「다시 챙기기」 */
  tag: string;
  /** 다시 챙기기 — 변경 전 상품 */
  before?: string;
  /** 지난 주문 줄은 「넘기기 취소」 가능 */
  pulled?: boolean;
  /** [10-23 14:47] 고객이슈가 걸린 줄 — 환불·반품이면 skip(챙기지 않음·숫자에서 빠짐), 교환은 표시만 */
  issue?: "환불" | "반품" | "교환";
  skip?: boolean;
};

const PAID = ["paid", "auto_paid", "manual_paid", "card_paid"];
const clean = (v: unknown) => String(v ?? "").trim();
export const KIND_LABEL: Record<Exclude<PickKind, "normal">, string> = { past: "지난 주문", late: "늦은 입금", repick: "다시 챙기기" };

/** 주문 → 챙길 줄. 취소·챙기기 제외 주문은 뺀다. 다른 출고로 넘긴 줄(원래 주문 쪽)은 movedAway 로 따로 센다. */
export function buildPickRows(orders: readonly LiveOrder[], source: "scope" | "extra"): { rows: PickRow[]; movedAway: number } {
  const rows: PickRow[] = [];
  let movedAway = 0;
  for (const o of orders) {
    const status = clean(o.paymentStatus);
    if (status === "canceled" || o.excludeFromPicking === true) continue;
    const paid = PAID.includes(status);
    const nickname = clean(o.nickname) || clean(o.name) || "-";
    const name = clean(o.recipientName) || clean(o.name);
    const when = clean(o.createdAt) || clean(o.submittedAt);
    const customerKey = String(o.groupId || o.id);
    const items: LiveOrderItem[] = Array.isArray(o.items) && o.items.length ? o.items : [{ id: String(o.id), productName: clean(o.orderSummary) || "상품", optionText: "", qty: 1 } as LiveOrderItem];
    // 고객이슈(주문상세에서 등록한 환불·반품·교환) 대상 줄 — 대상 글자로 엄격 매칭, 못 고르면 표시 안 함(엉뚱한 줄 금지)
    const markKind = issueMarkKind({ returnStatus: o.returnStatus });
    const markIds = markKind && markKind !== "기타" && o.returnReason
      ? new Set(issueTargetItemIds(items.map((x) => ({ id: String(x.id), productId: clean(x.productId), productName: clean(x.productName), color: clean(x.color), size: clean(x.size), qty: Number(x.qty) || 1 })), { targetText: targetTextFromReturnReason(o.returnReason) }))
      : new Set<string>();
    for (const it of items) {
      // 원래 주문에서 다른 출고로 넘긴 줄 — 그 출고에서 챙긴다(여기선 빼야 두 번 안 싼다)
      if (!o.pickPull && pulledForOf({ pick_pulled_for: it.pickPulledFor ?? null, pick_pulled_at: it.pickPulledAt ?? null })) { movedAway += Math.max(1, Number(it.qty) || 1); continue; }
      let kind: PickKind = "normal";
      let tag = "";
      if (o.pickPull) { kind = "past"; tag = `지난 주문 ${shortDateWithWeekday(o.createdAt)}`.trim(); }
      else if (source === "extra") {
        const a = classifyPickingAttention(o, { ...it, pickedAt: null });
        if (a === "repick") { kind = "repick"; tag = KIND_LABEL.repick; }
        else { kind = "late"; tag = KIND_LABEL.late; }
      }
      const before = it.repickBefore ? [clean(it.repickBefore.product_name), formatOrderOptionText(it.repickBefore.color, it.repickBefore.size)].filter(Boolean).join(" ") : "";
      rows.push({
        id: String(it.id), orderNo: clean(o.orderNo || o.groupId), customerKey, nickname, name, when, paid,
        productId: clean(it.productId), productName: clean(it.productName) || "상품",
        color: clean(it.color), size: clean(it.size),
        optionText: formatOrderOptionText(it.color, it.size) || stripNoneOptionParts(it.optionText),
        qty: Math.max(1, Number(it.qty) || 1), unitPrice: Number(it.unitPrice || 0),
        kind, tag, before: before || undefined, pulled: Boolean(o.pickPull),
        ...(markIds.has(String(it.id)) ? { issue: markKind as "환불" | "반품" | "교환", skip: isStrikeKind(markKind) } : {}),
      });
    }
  }
  return { rows, movedAway };
}

/** 범위 줄 + 추가 작업 줄 합치기 — 같은 줄은 한 번만. 다시 챙기기는 추가 작업 쪽(변경 표시)만 남긴다. */
export function mergePickRows(scope: PickRow[], extra: PickRow[]): PickRow[] {
  const repickIds = new Set(extra.filter((r) => r.kind === "repick").map((r) => r.id));
  const scopeIds = new Set(scope.map((r) => r.id));
  return [...scope.filter((r) => !repickIds.has(r.id)), ...extra.filter((r) => r.kind === "repick" || !scopeIds.has(r.id))];
}

/** 「10개 (미결제 2 · 지난 주문 1개 포함)」 괄호 안 — 표시 전용 */
export function includedNote(rows: readonly PickRow[]): string {
  const sum = (f: (r: PickRow) => boolean) => rows.filter(f).reduce((s, r) => s + r.qty, 0);
  const parts: string[] = [];
  const unpaid = sum((r) => !r.paid && !r.skip);
  if (unpaid) parts.push(`미결제 ${unpaid}`);
  for (const k of ["past", "late", "repick"] as const) { const n = sum((r) => r.kind === k && !r.skip); if (n) parts.push(`${KIND_LABEL[k]} ${n}개 포함`); }
  const skipped = sum((r) => Boolean(r.skip));
  if (skipped) parts.push(`환불 ${skipped}개 빼고`);
  return parts.join(" · ");
}

const productKey = (r: PickRow) => `${r.productId || ""}|${r.productName}`;
const optionKey = (r: PickRow) => `${r.color}|${r.size}|${r.optionText}`;

export default function LivePickingPanel({ orders, filterLabel, scopeTooWide = false, onClose }: Props) {
  const [view, setView] = useState<"summary" | "product" | "customer">("product");
  // [15:11 사장님] 결제 분류 — 기본 «결제완료»(미결제까지 같이 챙기는 실수 방지). 숫자는 수량.
  const [payView, setPayView] = useState<"paid" | "unpaid" | "all">("paid");
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [extraOrders, setExtraOrders] = useState<LiveOrder[]>([]);
  const [extraError, setExtraError] = useState("");
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [photoZoom, setPhotoZoom] = useState("");
  const [exporting, setExporting] = useState(false);
  // 다 챙긴 상품은 한 줄로 접는다(남은 것만 눈에 띄게) — 눌러서 펼친 상품만 열어 둠
  const [openDone, setOpenDone] = useState<Set<string>>(new Set());

  // 오늘 추가 작업(범위 밖 늦은 입금·다시 챙기기) — 서버에서 한 번
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin-live/picking-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ broadcastIds: [] }) });
        const p = await res.json() as { ok?: boolean; additionalOrders?: LiveOrder[]; message?: string };
        if (!res.ok || !p.ok || !Array.isArray(p.additionalOrders)) throw new Error(p.message || "추가 작업을 불러오지 못했어요.");
        if (alive) { setExtraOrders(p.additionalOrders); setExtraError(""); }
      } catch (e) { if (alive) setExtraError(e instanceof Error ? e.message : "추가 작업을 불러오지 못했어요."); }
    })();
    return () => { alive = false; };
  }, []);

  const scopeBuilt = useMemo(() => buildPickRows(scopeTooWide ? [] : orders, "scope"), [orders, scopeTooWide]);
  const extraBuilt = useMemo(() => buildPickRows(scopeTooWide ? [] : extraOrders, "extra"), [extraOrders, scopeTooWide]);
  const allRows = useMemo(() => mergePickRows(scopeBuilt.rows, extraBuilt.rows).filter((r) => !removedIds.has(r.id)), [scopeBuilt, extraBuilt, removedIds]);
  const movedAway = scopeBuilt.movedAway;
  // [14:57 사장님] 진행 중 교환 — 바꿀 상품을 줄에 크게(챙길 때 바뀐 걸로 챙기게)
  const [exchange, setExchange] = useState<Map<string, string>>(new Map());
  const codeKey = useMemo(() => Array.from(new Set(allRows.map((r) => r.orderNo || "").filter(Boolean))).sort().join(","), [allRows]);
  useEffect(() => {
    let alive = true;
    if (!codeKey) return;
    void fetchExchangeMarks(codeKey.split(",")).then((m) => { if (alive) setExchange(m); });
    return () => { alive = false; };
  }, [codeKey]);
  const exLine = (r: PickRow) => exchange.get(r.id) ? <span className="mt-0.5 block text-[13px] font-bold text-warn-tx">{exchange.get(r.id)} — 바뀐 걸로 챙기세요</span> : null;

  // ── 챙김 상태(서버 picked_at) 읽기·쓰기 — 예전 창과 같은 규칙: 읽기 끝나기 전·저장 중엔 못 누름, 실패하면 서버 값으로 되돌림 ──
  const idKey = useMemo(() => allRows.map((r) => r.id).sort().join(","), [allRows]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedRef = useRef(picked);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const readPicked = async (ids: string[]) => {
    const found = new Map<string, boolean>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase.from("orders").select("id, picked_at").in("id", ids.slice(i, i + 500).map(Number));
      if (error) throw error;
      for (const row of data || []) found.set(String(row.id), Boolean(row.picked_at));
    }
    if (ids.some((id) => !found.has(id))) throw new Error("일부 주문의 챙김 상태를 확인하지 못했어요.");
    return new Set([...found].filter(([, v]) => v).map(([id]) => id));
  };
  useEffect(() => {
    let alive = true;
    if (busyRef.current) return;
    void (async () => {
      try {
        const next = await readPicked(idKey ? idKey.split(",") : []);
        if (alive) { pickedRef.current = next; setPicked(next); setLoadError(false); }
      } catch { if (alive) setLoadError(true); }
      finally { if (alive) setLoadedKey(idKey); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, saving]);
  const loading = loadedKey !== idKey;
  const blocked = loading || loadError || saving;

  const setPickedFor = async (ids: string[], value: boolean) => {
    if (busyRef.current || loading || loadError || ids.length === 0) return;
    const known = new Set(allRows.map((r) => r.id));
    if (ids.some((id) => !known.has(id))) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await savePicking(supabase, ids, value);
      const next = new Set(pickedRef.current);
      for (const id of ids) { if (value) next.add(id); else next.delete(id); }
      pickedRef.current = next; setPicked(next);
    } catch (e) {
      showAdminToast("챙김 저장 실패 — 완료로 처리하지 않았어요.\n" + (e instanceof Error ? e.message : String(e)), "error");
      try { const truth = await readPicked(allRows.map((r) => r.id)); pickedRef.current = truth; setPicked(truth); } catch { setLoadError(true); }
    } finally { busyRef.current = false; setSaving(false); }
  };

  // ── 사진(보조) ──
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const photoIds = useMemo(() => Array.from(new Set(allRows.map((r) => r.productId).filter(Boolean))).sort().join(","), [allRows]);
  useEffect(() => {
    let stop = false;
    const ids = photoIds ? photoIds.split(",") : [];
    if (!ids.length) return;
    void (async () => {
      try {
        const byId = new Map<string, Record<string, unknown>>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await supabase.from("products").select("*").in("id", ids.slice(i, i + 200));
          if (stop) return;
          for (const p of (data || []) as Record<string, unknown>[]) byId.set(String(p.id ?? ""), p);
        }
        const next: Record<string, string> = {};
        for (const r of allRows) {
          const prow = r.productId ? byId.get(r.productId) : null;
          if (!prow) continue;
          const got = resolveOrderItemPhoto(prow, { productName: r.productName, color: r.color });
          if (got.url) next[r.id] = got.url;
        }
        if (!stop) setPhotos(next);
      } catch { /* 사진은 보조 */ }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIds]);

  // ── 숫자 ──
  const paidRows = allRows.filter((r) => r.paid && !r.skip);
  const totalPaid = paidRows.reduce((s, r) => s + r.qty, 0);
  const gotPaid = paidRows.filter((r) => picked.has(r.id)).reduce((s, r) => s + r.qty, 0);
  const unpaidQty = allRows.filter((r) => !r.paid && !r.skip).reduce((s, r) => s + r.qty, 0);
  const remainPaid = totalPaid - gotPaid;
  const pct = totalPaid > 0 ? Math.round((gotPaid / totalPaid) * 100) : 0;

  const q = search.trim();
  const payQty = (f: (r: PickRow) => boolean) => allRows.filter((r) => !r.skip && f(r)).reduce((sum, r) => sum + r.qty, 0);
  const payCounts = { paid: payQty((r) => r.paid), unpaid: payQty((r) => !r.paid), all: payQty(() => true) };
  const shown = allRows.filter((r) => (payView === "all" || (payView === "paid" ? r.paid : !r.paid)) && (!q || productSearchMatches([r.nickname, r.name, r.productName, r.optionText].join(" "), q)) && (!openOnly || !picked.has(r.id)));

  // 상품별: 상품 → 옵션 → 손님 줄
  const productGroups = useMemo(() => {
    const map = new Map<string, { name: string; photo: string; options: Map<string, PickRow[]> }>();
    for (const r of shown) {
      const g = map.get(productKey(r)) || { name: r.productName, photo: "", options: new Map() };
      if (!g.photo && photos[r.id]) g.photo = photos[r.id];
      const list = g.options.get(optionKey(r)) || [];
      list.push(r);
      g.options.set(optionKey(r), list);
      map.set(productKey(r), g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true })).map((g) => ({
      ...g,
      options: [...g.options.values()].map((rows) => rows.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"))).sort((a, b) => compareOrderOptions(a[0], b[0])),
    }));
  }, [shown, photos]);

  // 고객별: 손님(주문서) → 상품 줄
  const customerGroups = useMemo(() => {
    const map = new Map<string, PickRow[]>();
    for (const r of shown) { const list = map.get(r.customerKey) || []; list.push(r); map.set(r.customerKey, list); }
    return [...map.values()].map((rows) => rows.sort((a, b) => a.productName.localeCompare(b.productName, "ko", { numeric: true }) || compareOrderOptions(a, b))).sort((a, b) => a[0].nickname.localeCompare(b[0].nickname, "ko"));
  }, [shown]);

  const countLine = (rows: readonly PickRow[]) => {
    const paid = rows.filter((r) => r.paid && !r.skip);
    const total = paid.reduce((s, r) => s + r.qty, 0);
    const got = paid.filter((r) => picked.has(r.id)).reduce((s, r) => s + r.qty, 0);
    return { all: rows.filter((r) => !r.skip).reduce((s, r) => s + r.qty, 0), total, got, done: total > 0 && got >= total, open: paid.filter((r) => !picked.has(r.id)) };
  };

  const unpull = async (r: PickRow) => {
    if (!(await showAdminConfirm("이 상품의 출고 넘기기를 취소할까요?\n이 출고에서 빠지고 원래 주문으로만 남아요. 주문·금액·입금은 바뀌지 않아요.", { title: "넘기기 취소", confirmText: "넘기기 취소", cancelText: "그만두기" }))) return;
    try {
      const res = await fetch("/api/admin-live/picking-pull", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unpull", rowIds: [Number(r.id)] }) });
      const p = await res.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !p?.ok) throw new Error(p?.message || "넘기기 취소에 실패했어요.");
      setRemovedIds((prev) => new Set(prev).add(r.id));
      showAdminToast("출고 넘기기를 취소했어요.", "success");
    } catch (e) { showAdminToast(e instanceof Error ? e.message : "넘기기 취소에 실패했어요.", "error"); }
  };

  const pickAll = async () => {
    const targets = shown.filter((r) => r.paid && !r.skip && r.kind !== "repick" && !picked.has(r.id));
    if (!targets.length) { showAdminToast("모두 챙겼어요.", "success"); return; }
    const qty = targets.reduce((s, r) => s + r.qty, 0);
    if (!(await showAdminConfirm(`지금 보이는 결제완료 상품 ${qty}개를 모두 챙김으로 표시할까요?\n미결제·다시 챙기기 상품은 빼요. 주문·입금·출고 상태는 바뀌지 않아요.`, { title: "모두 챙김", confirmText: "모두 챙김", cancelText: "그만두기" }))) return;
    await setPickedFor(targets.map((r) => r.id), true);
  };

  // [15:11 사장님] 챙김 전부 해제 — 실수하면 챙긴 기록이 다 지워지므로 개수 확인창 + 작은 글자 버튼
  const unpickAll = async () => {
    const targets = shown.filter((r) => picked.has(r.id));
    if (!targets.length) { showAdminToast("해제할 챙김이 없어요.", "warning"); return; }
    const qty = targets.reduce((sum, r) => sum + r.qty, 0);
    if (!(await showAdminConfirm(`지금 보이는 챙긴 상품 ${qty}개를 모두 «안 챙김»으로 되돌릴까요?\n그동안 체크한 기록이 지워져요. 주문·입금은 바뀌지 않아요.`, { title: "챙김 전부 해제", confirmText: "전부 해제", cancelText: "그만두기", tone: "warning" }))) return;
    await setPickedFor(targets.map((r) => r.id), false);
  };

  const runExcel = async () => {
    if (blocked || exporting) return;
    setExporting(true);
    try {
      const ids = orders.flatMap((o) => (o.items?.length ? o.items.map((it) => String(it.id)) : [String(o.id)]));
      const res = await fetch("/api/admin-live/picking-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ broadcastIds: [], includeExceptions: true, orderIds: ids }) });
      const p = await res.json() as { ok?: boolean; orders?: LiveOrder[]; additionalOrders?: LiveOrder[]; exceptions?: import("@/lib/orderPickingExceptions").PickingExceptionRow[]; cancellations?: import("@/lib/orderPickingExceptions").PickingCancellationRow[]; message?: string };
      if (!res.ok || !p.ok || !Array.isArray(p.orders) || !Array.isArray(p.additionalOrders) || !Array.isArray(p.exceptions)) throw new Error(p.message || "주문과 고객이슈를 확인하지 못했어요. 다시 눌러 주세요.");
      // 엑셀 = 이 창에 보이는 줄(지난 주문·추가 작업 포함). 가상 묶음(지난 주문)은 화면 주문에만 있으므로 화면 주문을 함께 쓴다.
      const visible = new Set(allRows.map((r) => r.id));
      const seen = new Set<string>();
      const source = [...orders.filter((o) => o.pickPull), ...p.orders, ...p.additionalOrders];
      const exportOrders = source.flatMap((o) => {
        const items = (o.items || []).filter((it) => { const id = String(it.id); if (!visible.has(id) || seen.has(id)) return false; seen.add(id); return true; });
        return items.length ? [{ ...o, items }] : [];
      });
      const extraIds = new Set(allRows.filter((r) => r.kind === "late" || r.kind === "repick").map((r) => r.id));
      await exportLiveOrdersForPicking(exportOrders, { filterLabel: `${String(filterLabel || "").replace(/^방송:\s*/, "")} · 물건챙기기`, rowOrder: view === "product" ? "product" : "nickname", visibleItemIds: [...visible], attentionItemIds: [...extraIds], exceptions: p.exceptions, cancellations: p.cancellations }, new Set(picked));
      const printed = paidRows.map((r) => Number(r.id));
      const now = new Date().toISOString();
      for (let i = 0; i < printed.length; i += 500) {
        const { error } = await supabase.from("orders").update({ picking_list_printed_at: now }).is("picking_list_printed_at", null).in("id", printed.slice(i, i + 500));
        if (error) throw error;
      }
    } catch (e) {
      showAdminToast("엑셀 내보내기 실패\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally { setExporting(false); }
  };

  // ── 그리기 ──
  const tagOf = (r: PickRow) => (<>{r.issue === "교환" ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold text-warn-tx ring-1 ring-warn-tx/40">교환 이슈</span> : null}{kindTag(r)}</>);
  const kindTag = (r: PickRow) => r.kind === "normal" ? null : (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${r.kind === "repick" ? "bg-warn-bg text-warn-tx" : "bg-ink text-white"}`}>{r.tag}</span>
  );
  const checkBox = (on: boolean) => (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-ink bg-ink text-white" : "border-line bg-surface"}`} aria-hidden>
      {on ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg> : null}
    </span>
  );
  const photoOf = (url: string | undefined, size = 48) => url ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoZoom(url); }} className="shrink-0 overflow-hidden rounded-lg border border-line" style={{ width: size, height: size }} aria-label="사진 크게 보기">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
    </button>
  ) : <span className="shrink-0 rounded-lg bg-surface-2" style={{ width: size, height: size }} />;

  // 한 줄(손님 줄 또는 상품 줄) — 줄 전체가 챙김 버튼(44px+)
  const lineButton = (r: PickRow, children: React.ReactNode) => {
    const on = picked.has(r.id);
    if (r.skip) {
      // 환불·반품 이슈가 걸린 줄 — 누를 수 없고 숫자에서 빠진다
      return (
        <div key={r.id} className="flex min-h-[52px] items-center gap-3 border-t border-line bg-surface px-3 py-2 first:border-t-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-danger-tx text-[13px] font-bold text-danger-tx" aria-hidden>×</span>
          <span className="min-w-0 flex-1 text-ink-mute line-through">{children}</span>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold text-danger-tx ring-1 ring-danger-tx/40">{r.issue} · 챙기지 마세요</span>
        </div>
      );
    }
    return (
      <div key={r.id} className={`flex items-center gap-2 border-t border-line first:border-t-0 ${on ? "bg-surface-2" : "bg-surface"}`}>
        <button type="button" disabled={blocked} onClick={() => void setPickedFor([r.id], !on)} aria-pressed={on} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:cursor-wait">
          {checkBox(on)}
          <span className={`min-w-0 flex-1 ${on ? "text-ink-mute" : "text-ink"}`}>{children}</span>
          <span className={`shrink-0 text-[16px] font-bold tabular-nums ${on ? "text-ink-mute" : r.qty > 1 ? "text-danger-tx" : "text-ink"}`}>{r.qty}개</span>
        </button>
        {r.pulled ? <button type="button" onClick={() => void unpull(r)} className="mr-2 h-8 shrink-0 rounded-lg border border-line px-2 text-[12px] font-semibold text-ink-soft hover:bg-surface-2">넘기기 취소</button> : null}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-[600px] flex-col bg-surface" style={{ boxShadow: "-8px 0 24px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="물건챙기기">
        {/* 머리 */}
        <div className="border-b border-line px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold text-ink">물건챙기기</h2>
              <p className="mt-0.5 truncate text-[13px] text-ink-soft">{String(filterLabel || "").replace(/^방송:\s*/, "") || "주문서 범위"}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className="h-10 w-10 shrink-0 rounded-lg text-[22px] text-ink-soft hover:bg-surface-2">×</button>
          </div>
          {!scopeTooWide ? (
            <div className="mt-3">
              <div className="flex items-end justify-between gap-2">
                <div className="tabular-nums">{loading ? <span className="text-[16px] font-bold text-ink">확인 중…</span> : remainPaid > 0
                  ? <><span className="text-[20px] font-bold text-ink">남은 {remainPaid}개</span><span className="ml-2 text-[13px] font-semibold text-ink-soft">챙긴 {gotPaid} / 전체 {totalPaid}</span></>
                  : <span className="text-[20px] font-bold text-ok-tx">{totalPaid > 0 ? `✓ 다 챙겼어요 · ${totalPaid}개` : "챙길 상품 없음"}</span>}</div>
                <div className="text-[13px] text-ink-soft tabular-nums">{unpaidQty ? <span className="font-semibold text-danger-tx">미결제 {unpaidQty}개 따로</span> : null}</div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} /></div>
              {movedAway > 0 ? <p className="mt-1.5 text-[12px] text-ink-mute">다른 출고로 넘긴 상품 {movedAway}개는 여기서 뺐어요</p> : null}
              {extraError ? <p className="mt-1.5 text-[12px] text-danger-tx">늦은 입금·다시 챙기기를 못 불러왔어요 — 닫았다 다시 열어 주세요</p> : null}
              {loadError ? <p className="mt-1.5 text-[12px] text-danger-tx">챙김 상태를 확인하지 못했어요 — 닫았다 다시 열어 주세요(그동안 체크 막아 둠)</p> : null}
            </div>
          ) : null}
          {/* 보기 · 검색 · 안 챙긴 것만 */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex shrink-0 rounded-lg border border-line p-0.5" role="tablist">
              {(["summary", "product", "customer"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-9 rounded-lg px-3 text-[14px] font-semibold ${view === v ? "bg-ink text-white" : "text-ink-soft"}`}>{v === "summary" ? "요약" : v === "product" ? "상품별" : "고객별"}</button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품·닉네임 검색" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(["paid", "unpaid", "all"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={payView === k} onClick={() => setPayView(k)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold tabular-nums ${payView === k ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft"}`}>
                {k === "paid" ? "결제완료" : k === "unpaid" ? "미결제" : "전체"} {payCounts[k]}
              </button>
            ))}
          </div>
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-soft">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="h-4 w-4 accent-[var(--color-ink)]" />안 챙긴 것만
          </label>
          {q ? <p className="mt-1.5 text-[12px] font-semibold text-warn-tx">검색 중이라 일부만 보여요 — 다 챙겼는지는 검색어를 지우고 확인하세요</p> : null}
          {payView !== "paid" ? <p className="mt-1.5 text-[12px] font-semibold text-danger-tx">미결제 상품이 섞여 보여요 — 입금 확인 전엔 챙기지 마세요</p> : null}
        </div>

        {/* 목록 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-3 py-3">
          {scopeTooWide ? <div className="py-16 text-center text-[14px] font-semibold text-ink-soft">주문서에서 방송이나 날짜를 먼저 골라 주세요</div> : null}
          {!scopeTooWide && !loading && shown.length === 0 ? <div className="py-16 text-center text-[14px] font-semibold text-ink-soft">{allRows.length ? "다 챙겼어요" : "챙길 상품이 없어요"}</div> : null}

          {/* [15:11 사장님] 요약 = 업체에서 한 번에 집어 오는 피킹표 — 손님 이름 없이 상품 총개수·옵션별 개수·포함 내역·남은 개수만 */}
          {!scopeTooWide && view === "summary" ? (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {[...productGroups].sort((a, b) => Number(countLine(a.options.flat()).done) - Number(countLine(b.options.flat()).done)).map((g) => {
                const c = countLine(g.options.flat());
                return (
                  <div key={g.name + "|" + g.options[0][0].productId} className={`flex gap-3 border-t border-line px-3 py-2.5 first:border-t-0 ${c.done ? "bg-surface-2" : ""}`}>
                    {photoOf(g.photo, 44)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`min-w-0 break-words text-[14px] font-bold ${c.done ? "text-ink-mute" : "text-ink"}`}>{g.name}</span>
                        <span className="shrink-0 text-[16px] font-bold text-ink tabular-nums">{c.all}개</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.options.map((rows) => {
                          const oc = countLine(rows);
                          const note = includedNote(rows);
                          const left = oc.total - oc.got;
                          return (
                            <span key={optionKey(rows[0])} className={`rounded-lg border px-2 py-1 text-[13px] tabular-nums ${oc.done ? "border-line text-ink-mute line-through" : "border-ink text-ink"}`}>
                              <b>{rows[0].optionText || "옵션 없음"} {oc.all}</b>
                              {note ? <span className="ml-1 text-ink-soft">({note})</span> : null}
                              {!oc.done && left > 0 && left < oc.total ? <span className="ml-1 font-semibold text-danger-tx">남은 {left}</span> : null}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* 남은 게 있는 상품이 위, 다 챙긴 상품(한 줄로 접힘)은 아래 — 할 일만 위에 보이게 */}
          {!scopeTooWide && view === "product" ? [...productGroups].sort((a, b) => Number(countLine(a.options.flat()).done) - Number(countLine(b.options.flat()).done)).map((g) => {
            const all = g.options.flat();
            const c = countLine(all);
            const gKey = g.name + "|" + g.options[0][0].productId;
            if (c.done && !openDone.has(gKey)) {
              return (
                <button key={gKey} type="button" onClick={() => setOpenDone((prev) => new Set(prev).add(gKey))} className="mb-2 flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink text-white" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg></span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-mute">{g.name}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-ink-mute tabular-nums">{c.total}개 다 챙김</span>
                </button>
              );
            }
            return (
              <section key={gKey} className="mb-3 overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex items-center gap-3 px-3 py-3">
                  {photoOf(g.photo, 56)}
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-[16px] font-bold leading-snug text-ink">{g.name}</h3>
                    <div className="mt-0.5 text-[13px] text-ink-soft tabular-nums">총 {c.all}개{c.done ? " · 다 챙김" : c.total ? ` · 챙긴 ${c.got}/${c.total}` : ""}</div>
                  </div>
                </div>
                {g.options.map((rows) => {
                  const oc = countLine(rows);
                  const note = includedNote(rows);
                  const opt = rows[0].optionText || "옵션 없음";
                  return (
                    <div key={optionKey(rows[0])} className="border-t border-line">
                      <div className={`flex items-center gap-2 px-3 py-2 ${oc.done ? "bg-surface-2" : "bg-surface"}`}>
                        <span className="min-w-0 flex-1">
                          <span className={`text-[16px] font-bold ${oc.done ? "text-ink-mute line-through" : "text-ink"}`}>{opt}</span>
                          <span className="ml-2 text-[16px] font-bold text-ink tabular-nums">{oc.all}개</span>
                          {note ? <span className="ml-1.5 text-[13px] font-semibold text-ink-soft">({note})</span> : null}
                        </span>
                        {oc.done ? <span className="shrink-0 text-[13px] font-semibold text-ink-mute">다 챙김</span>
                          : oc.open.length > 0 ? <button type="button" disabled={blocked} onClick={() => void setPickedFor(oc.open.map((r) => r.id), true)} className="h-9 shrink-0 rounded-lg border border-ink bg-surface px-3 text-[13px] font-bold text-ink disabled:opacity-40">남은 {oc.open.reduce((sum, r) => sum + r.qty, 0)}개 챙김</button>
                          : <span className="shrink-0 text-[13px] text-ink-mute">{oc.got}/{oc.total}</span>}
                      </div>
                      <div className="pl-3">
                        {rows.map((r) => lineButton(r, <>
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate text-[14px] font-semibold">{r.nickname}</span>
                              {r.name && r.name !== r.nickname ? <span className="truncate text-[13px] text-ink-soft">{r.name}</span> : null}
                              {!r.paid ? <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-danger-tx ring-1 ring-danger-tx/40">미결제</span> : null}
                              {tagOf(r)}
                            </span>
                            {r.before ? <span className="mt-0.5 block text-[12px] text-warn-tx">변경 전: {r.before}</span> : null}
                            {exLine(r)}
                          </>))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          }) : null}

          {!scopeTooWide && view === "customer" ? [...customerGroups].sort((a, b) => Number(countLine(a).done) - Number(countLine(b).done)).map((rows) => {
            const c = countLine(rows);
            const head = rows[0];
            if (c.done && !openDone.has(head.customerKey)) {
              return (
                <button key={head.customerKey} type="button" onClick={() => setOpenDone((prev) => new Set(prev).add(head.customerKey))} className="mb-2 flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink text-white" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg></span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-mute">{head.nickname}{head.name && head.name !== head.nickname ? ` ${head.name}` : ""}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-ink-mute tabular-nums">{c.total}개 다 챙김</span>
                </button>
              );
            }
            return (
              <section key={head.customerKey} className="mb-3 overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex items-center gap-2 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-bold text-ink">{head.nickname}{head.name && head.name !== head.nickname ? <span className="ml-1.5 text-[14px] font-semibold text-ink-soft">{head.name}</span> : null}</h3>
                    <div className="mt-0.5 text-[13px] text-ink-soft tabular-nums">상품 {c.all}개{c.done ? " · 다 챙김" : c.total ? ` · 챙긴 ${c.got}/${c.total}` : ""}{!head.paid ? " · 미결제" : ""}</div>
                  </div>
                </div>
                {rows.map((r) => lineButton(r, <>
                    <span className="flex min-w-0 items-center gap-2">
                      {photoOf(photos[r.id], 40)}
                      <span className="min-w-0">
                        <span className="block break-words text-[14px] font-semibold leading-snug">{r.productName}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">{r.optionText || "옵션 없음"}{tagOf(r)}</span>
                        {r.before ? <span className="block text-[12px] text-warn-tx">변경 전: {r.before}</span> : null}
                        {exLine(r)}
                      </span>
                    </span>
                  </>))}
              </section>
            );
          }) : null}
        </div>

        {/* 아래 */}
        <div className="flex items-center gap-2 border-t border-line px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button type="button" disabled={blocked || exporting || scopeTooWide} onClick={() => void runExcel()} className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-40">{exporting ? "만드는 중…" : "엑셀"}</button>
          <button type="button" disabled={blocked || scopeTooWide} onClick={() => void unpickAll()} className="h-10 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2 disabled:opacity-40">전부 해제</button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink">닫기</button>
          <button type="button" disabled={blocked || scopeTooWide} onClick={() => void pickAll()} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-40">모두 챙김</button>
        </div>
      </aside>

      {photoZoom ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onClick={(e) => { e.stopPropagation(); setPhotoZoom(""); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoZoom} alt="상품 사진 크게 보기" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </div>
  );
}
