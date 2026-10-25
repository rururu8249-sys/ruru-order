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
import { colorNameSwatch, isLightSwatch } from "@/lib/colorNameSwatch";
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
    const markIds = markKind && markKind !== "기타" && markKind !== "출고" && o.returnReason
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
  // [10-25 20:51 사장님 「응」 — 물건챙기기 한 번에 다시 설계]
  //   보기는 «상품별»(한 장 = 상품 하나 → 옵션 → 누구에게 몇 개) · «손님별»(한 장 = 손님 하나 → 그 손님 물건 전부) 두 개뿐.
  //   ‹ › 버튼·손가락 좌우 밀기·PC ← → 키로 넘김, 끝에서 처음으로 끝없이 돈다.
  //   「이 상품/손님 남은 N개 다 챙김」을 누르면 다음 안 챙긴 장으로. 다 챙긴 장은 그 자리에 「✓ 다 챙김」으로 남는다.
  //   「전체 목록」 = 어디까지 했는지 한눈에 + 검색 → 눌러서 그 장으로(예전 요약·검색 자리).
  //   예전 요약 탭·안 챙긴 것만·접기·결제 칩 3개는 폐지(기본 결제완료만, 미결제는 「미결제 N개 따로 · 보기」 한 줄).
  const [view, setView] = useState<"product" | "customer">("product");
  const [pageIdx, setPageIdx] = useState<{ product: number; customer: number }>({ product: 0, customer: 0 });
  const [listOpen, setListOpen] = useState(false);
  const touchRef = useRef<{ x: number; y: number; horiz: boolean | null } | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 기본 «결제완료»(미결제까지 같이 챙기는 실수 방지) — 미결제는 사장님이 「보기」를 눌렀을 때만 섞어 보여 줌
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [search, setSearch] = useState("");
  const [extraOrders, setExtraOrders] = useState<LiveOrder[]>([]);
  const [extraError, setExtraError] = useState("");
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [photoZoom, setPhotoZoom] = useState("");
  const [exporting, setExporting] = useState(false);

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

  /** 저장이 실제로 됐으면 true */
  const setPickedFor = async (ids: string[], value: boolean): Promise<boolean> => {
    if (busyRef.current || loading || loadError || ids.length === 0) return false;
    const known = new Set(allRows.map((r) => r.id));
    if (ids.some((id) => !known.has(id))) return false;
    busyRef.current = true;
    setSaving(true);
    try {
      await savePicking(supabase, ids, value);
      const next = new Set(pickedRef.current);
      for (const id of ids) { if (value) next.add(id); else next.delete(id); }
      pickedRef.current = next; setPicked(next);
      return true;
    } catch (e) {
      showAdminToast("챙김 저장 실패 — 완료로 처리하지 않았어요.\n" + (e instanceof Error ? e.message : String(e)), "error");
      try { const truth = await readPicked(allRows.map((r) => r.id)); pickedRef.current = truth; setPicked(truth); } catch { setLoadError(true); }
      return false;
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
  const remainPaid = totalPaid - gotPaid;
  const pct = totalPaid > 0 ? Math.round((gotPaid / totalPaid) * 100) : 0;

  const q = search.trim();
  // 장(페이지)은 검색과 무관 — 검색은 「전체 목록」 안에서만(장 번호가 흔들리지 않게)
  const shown = allRows.filter((r) => showUnpaid || r.paid);

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

  // ── 장(페이지) ──
  type Page = { key: string; title: string; sub: string; photo: string; rows: PickRow[]; options?: PickRow[][] };
  const pages: Page[] = useMemo(() => view === "product"
    ? productGroups.map((g) => ({ key: g.name + "|" + g.options[0][0].productId, title: g.name, sub: "", photo: g.photo, rows: g.options.flat(), options: g.options }))
    : customerGroups.map((rows) => ({ key: rows[0].customerKey, title: rows[0].nickname, sub: rows[0].name && rows[0].name !== rows[0].nickname ? rows[0].name : "", photo: "", rows })),
  [view, productGroups, customerGroups]);
  const pageCount = pages.length;
  const curIdx = pageCount ? ((pageIdx[view] % pageCount) + pageCount) % pageCount : 0;
  const setIdx = (i: number) => setPageIdx((prev) => ({ ...prev, [view]: i }));
  // 장이 바뀌면 맨 위부터
  useEffect(() => { bodyRef.current?.scrollTo?.({ top: 0 }); }, [curIdx, view]);
  // 끝없이 돈다 — 마지막 다음은 처음, 처음 이전은 마지막
  const goPage = (step: number) => { if (pageCount) setIdx((curIdx + step + pageCount) % pageCount); };
  // 한꺼번에 챙김 대상 = 결제완료·안 챙긴 줄(미결제·다시 챙기기·환불은 줄마다 직접) — 「모두 챙김」과 같은 규칙
  const bulkTargets = (rows: readonly PickRow[]) => rows.filter((r) => r.paid && !r.skip && r.kind !== "repick" && !picked.has(r.id));
  const pickPage = async (page: Page) => {
    const targets = bulkTargets(page.rows);
    if (!targets.length) return;
    if (!(await setPickedFor(targets.map((r) => r.id), true))) return; // 저장 실패면 그 장에 머묾
    // 다음 «아직 남은» 장으로(앞으로 한 바퀴 돌며 찾음), 없으면 그대로
    for (let step = 1; step < pageCount; step++) {
      const i = (curIdx + step) % pageCount;
      if (bulkTargets(pages[i].rows).length) { setIdx(i); return; }
    }
  };

  // PC: ← → 키로도 넘김(검색칸에 쓰는 중·목록 창이 열려 있을 땐 안 움직임)
  useEffect(() => {
    if (typeof window === "undefined" || listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") goPage(1);
      else if (e.key === "ArrowLeft") goPage(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // [10-25 사장님 「옵션별 수량 몇 개인지 요약」] 상품 머리줄 한 줄: 「블랙/L 1 · 화이트/M 2」 — 표시 전용(숫자는 옵션 줄과 같은 countLine.all)
  const optionSummaryLine = (options: readonly (readonly PickRow[])[], dark = true) => {
    const parts = options.map((rows) => {
      const color = stripNoneOptionParts(rows[0].color);
      const size = stripNoneOptionParts(rows[0].size);
      const label = [color, size].filter(Boolean).join("/") || (rows[0].optionText || "").trim();
      const n = countLine(rows).all;
      return label && n > 0 ? { label, n } : null;
    }).filter((x): x is { label: string; n: number } => Boolean(x));
    if (!parts.length) return null;
    return (
      <div className={`mt-1 text-[13px] font-semibold leading-snug ${dark ? "text-white/85" : "text-ink-soft"}`}>
        {parts.map((p, i) => <span key={i}>{i > 0 ? ", " : ""}<span className="whitespace-nowrap">{p.label} <span className="tabular-nums">{p.n}개</span></span></span>)}
      </div>
    );
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
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-ok-tx bg-ok-tx text-white" : "border-ink-mute bg-surface"}`} aria-hidden>
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
      <div key={r.id} className={`flex items-center gap-2 border-t border-line first:border-t-0 ${on ? "bg-ok-bg" : "bg-surface"}`}>
        {/* 체크는 □ 칸만 눌러야 된다(줄 나머지는 안 눌림) — 누르는 범위는 칸 둘레 44px */}
        <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 py-2 pl-1 pr-3">
          <button type="button" disabled={blocked} onClick={() => void setPickedFor([r.id], !on)} aria-pressed={on} aria-label={on ? "챙김 해제" : "챙김"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg disabled:cursor-wait">
            {checkBox(on)}
          </button>
          <span className={`min-w-0 flex-1 ${on ? "text-ink-mute" : "text-ink"}`}>{children}</span>
          <span className={`shrink-0 text-[16px] font-bold tabular-nums ${on ? "text-ink-mute" : r.qty > 1 ? "text-danger-tx" : "text-ink"}`}>{r.qty}개</span>
        </div>
        {r.pulled ? <button type="button" onClick={() => void unpull(r)} className="mr-2 h-8 shrink-0 rounded-lg border border-line px-2 text-[12px] font-semibold text-ink-soft hover:bg-surface-2">넘기기 취소</button> : null}
      </div>
    );
  };

  const page = pageCount ? pages[curIdx] : null;
  const onPickPage = () => { if (page) void pickPage(page); };
  const unpaidAll = allRows.filter((r) => !r.paid && !r.skip).reduce((sum, r) => sum + r.qty, 0);

  // 색 이름이면 실제 색 점(모르는 이름은 점 없이 글씨만)
  const swatchDot = (name: string) => {
    const hex = colorNameSwatch(name);
    if (!hex) return null;
    return <span aria-hidden className="inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: hex, boxShadow: isLightSwatch(hex) ? "inset 0 0 0 1px rgba(0,0,0,.25)" : undefined }} />;
  };
  // 옵션 머리 줄(상품별 장)
  const optionHead = (rows: PickRow[]) => {
    const oc = countLine(rows);
    const note = includedNote(rows);
    const color = stripNoneOptionParts(rows[0].color);
    const size = stripNoneOptionParts(rows[0].size);
    return (
      // [10-25 21:16 사장님 「색상 넣어서 구분 쉽게」] 옵션 머리 = 파란 띠(챙길 옵션) / 초록 띠(다 챙김), 색상 칸엔 실제 색 점
      <div className={`flex items-center gap-2 border-t px-3 py-2 ${oc.done ? "border-ok-tx/30 bg-ok-bg" : "border-info-tx/30 bg-info-bg"}`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {color ? <span className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-0.5 text-[14px] font-semibold text-ink">{swatchDot(color)}<span className="text-[12px] text-ink-mute">색상</span>{color}</span> : null}
            {size ? <span className="rounded-lg bg-surface px-2 py-0.5 text-[14px] font-bold text-ink"><span className="mr-1 text-[12px] font-semibold text-ink-mute">사이즈</span>{size}</span> : null}
            {!color && !size ? <span className="text-[14px] font-semibold text-ink">{rows[0].optionText || "옵션 없음"}</span> : null}
            <span className={`text-[18px] font-bold tabular-nums ${oc.done ? "text-ok-tx" : "text-info-tx"}`}>{oc.all}개</span>
          </span>
          {note ? <span className="mt-0.5 block text-[12px] font-semibold text-ink-soft">{note}</span> : null}
        </span>
        {oc.done ? <span className="shrink-0 text-[13px] font-bold text-ok-tx">✓ 다 챙김</span> : <span className="shrink-0 text-[13px] font-bold text-info-tx tabular-nums">남은 {oc.total - oc.got}개</span>}
      </div>
    );
  };
  const buyerContent = (r: PickRow) => (<>
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate text-[14px] font-semibold">{r.nickname}</span>
      {r.name && r.name !== r.nickname ? <span className="truncate text-[13px] text-ink-soft">{r.name}</span> : null}
      {!r.paid ? <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-danger-tx ring-1 ring-danger-tx/40">미결제</span> : null}
      {tagOf(r)}
    </span>
    {r.before ? <span className="mt-0.5 block text-[12px] text-warn-tx">변경 전: {r.before}</span> : null}
    {exLine(r)}
  </>);
  const productContent = (r: PickRow) => (<>
    <span className="flex min-w-0 items-center gap-2">
      {photoOf(photos[r.id], 40)}
      <span className="min-w-0">
        <span className="block break-words text-[14px] font-semibold leading-snug">{r.productName}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">{stripNoneOptionParts(r.color) ? swatchDot(stripNoneOptionParts(r.color)) : null}{r.optionText || "옵션 없음"}{!r.paid ? <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-danger-tx ring-1 ring-danger-tx/40">미결제</span> : null}{tagOf(r)}</span>
        {r.before ? <span className="block text-[12px] text-warn-tx">변경 전: {r.before}</span> : null}
        {exLine(r)}
      </span>
    </span>
  </>);

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/30" onClick={onClose}>
      <aside className="relative flex h-full w-full max-w-[600px] flex-col bg-surface" style={{ boxShadow: "-8px 0 24px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="물건챙기기">
        {/* 머리 — 남은 개수 · 보기 두 개 */}
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
              <div className="tabular-nums">{loading ? <span className="text-[16px] font-bold text-ink">확인 중…</span> : remainPaid > 0
                ? <><span className="text-[20px] font-bold text-ink">챙겨야 할 남은 수량 {remainPaid}개</span><span className="ml-2 text-[13px] font-semibold text-ink-soft">챙긴 {gotPaid} / 총 주문수량 {totalPaid}</span></>
                : <span className="text-[20px] font-bold text-ok-tx">{totalPaid > 0 ? `✓ 다 챙겼어요 · ${totalPaid}개` : "챙길 상품 없음"}</span>}</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} /></div>
              {unpaidAll > 0 ? (
                <button type="button" aria-pressed={showUnpaid} onClick={() => setShowUnpaid((v) => !v)} className="mt-1.5 text-[13px] font-semibold text-danger-tx underline-offset-2 hover:underline">
                  {showUnpaid ? `미결제 ${unpaidAll}개 섞여 보여요 — 입금 확인 전엔 챙기지 마세요 · 숨기기` : `미결제 ${unpaidAll}개 따로 · 보기`}
                </button>
              ) : null}
              {movedAway > 0 ? <p className="mt-1.5 text-[12px] text-ink-mute">다른 출고로 넘긴 상품 {movedAway}개는 여기서 뺐어요</p> : null}
              {extraError ? <p className="mt-1.5 text-[12px] text-danger-tx">늦은 입금·다시 챙기기를 못 불러왔어요 — 닫았다 다시 열어 주세요</p> : null}
              {loadError ? <p className="mt-1.5 text-[12px] text-danger-tx">챙김 상태를 확인하지 못했어요 — 닫았다 다시 열어 주세요(그동안 체크 막아 둠)</p> : null}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 rounded-lg border border-line p-0.5" role="tablist">
            {(["product", "customer"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setListOpen(false); }} className={`h-10 rounded-lg text-[16px] font-semibold ${view === v ? "bg-ink text-white" : "text-ink-soft"}`}>{v === "product" ? "상품별" : "손님별"}</button>
            ))}
          </div>
        </div>

        {/* 한 장 */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-3 py-3">
          {scopeTooWide ? <div className="py-16 text-center text-[14px] font-semibold text-ink-soft">주문서에서 방송이나 날짜를 먼저 골라 주세요</div> : null}
          {!scopeTooWide && !loading && !page ? <div className="py-16 text-center text-[14px] font-semibold text-ink-soft">챙길 상품이 없어요<span className="mt-1 block text-[13px] font-normal">주문서에서 다른 방송이나 날짜를 골라 보세요{unpaidAll > 0 ? " · 위 「미결제 보기」로 미결제를 볼 수 있어요" : ""}</span></div> : null}
          {!scopeTooWide && page ? (() => {
            const c = countLine(page.rows);
            const targets = bulkTargets(page.rows);
            const qty = targets.reduce((sum, r) => sum + r.qty, 0);
            return (
              <div
                key={page.key}
                className="mx-auto max-w-[560px] select-none"
                style={{ touchAction: "pan-y", transform: dragDx ? `translateX(${dragDx}px)` : undefined, transition: dragDx ? "none" : "transform .18s ease-out" }}
                onTouchStart={(e) => { const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY, horiz: null }; }}
                onTouchMove={(e) => {
                  const s0 = touchRef.current; if (!s0) return;
                  const t = e.touches[0]; const dx = t.clientX - s0.x; const dy = t.clientY - s0.y;
                  if (s0.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s0.horiz = Math.abs(dx) > Math.abs(dy);
                  if (s0.horiz) setDragDx(dx);
                }}
                onTouchEnd={() => {
                  const s0 = touchRef.current; touchRef.current = null;
                  const dx = dragDx; setDragDx(0);
                  if (s0?.horiz && Math.abs(dx) > 50) goPage(dx < 0 ? 1 : -1);
                }}
                onTouchCancel={() => { touchRef.current = null; setDragDx(0); }}
              >
                <section className="overflow-hidden rounded-xl border border-line bg-surface">
                  {/* 상품명/손님 줄 = 검정 띠 */}
                  <div className="flex items-center gap-3 bg-ink px-3 py-3">
                    {view === "product" ? photoOf(page.photo, 56) : null}
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-[18px] font-bold leading-snug text-white">{page.title}{page.sub ? <span className="ml-1.5 text-[14px] font-semibold text-white/75">{page.sub}</span> : null}</h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums text-white/75">
                        <span>{view === "product" ? `총 ${c.all}개` : `상품 ${c.all}개`}{c.done ? "" : c.total ? ` · 챙긴 ${c.got}/${c.total}` : ""}</span>
                        {c.done ? <span className="rounded bg-white px-1.5 py-0.5 text-[12px] font-bold text-ink">✓ 다 챙김</span> : null}
                      </div>
                      {view === "product" && page.options ? optionSummaryLine(page.options) : null}
                    </div>
                  </div>
                  {view === "product" && page.options
                    ? page.options.map((rows) => (
                      <div key={optionKey(rows[0])}>
                        {optionHead(rows)}
                        <div className="pl-3">{rows.map((r) => lineButton(r, buyerContent(r)))}</div>
                      </div>
                    ))
                    : page.rows.map((r) => lineButton(r, productContent(r)))}
                  <div className="border-t border-line p-3">
                    {qty > 0 ? (
                      <button type="button" disabled={blocked} onClick={onPickPage} className="h-12 w-full rounded-lg bg-ink text-[16px] font-bold text-white disabled:cursor-wait disabled:opacity-60">
                        {view === "product" ? "이 상품" : "이 손님"} 남은 {qty}개 다 챙김
                      </button>
                    ) : c.done ? (
                      <div className="flex h-12 items-center justify-center rounded-lg bg-surface-2 text-[14px] font-semibold text-ink-soft">✓ 다 챙겼어요 — 잘못 체크했으면 그 줄 칸을 다시 누르세요</div>
                    ) : (
                      <div className="text-center text-[13px] font-semibold text-ink-soft">남은 줄은 미결제·다시 챙기기라 줄마다 직접 체크하세요</div>
                    )}
                  </div>
                </section>
                <p className="mt-2 text-center text-[12px] text-ink-mute">좌우로 밀어서 넘겨요 · 끝에서 처음으로 돌아가요</p>
              </div>
            );
          })() : null}
        </div>

        {/* 넘기기 줄 */}
        {!scopeTooWide && pageCount > 0 ? (
          <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-2">
            <button type="button" onClick={() => goPage(-1)} aria-label="이전" className="flex h-12 w-14 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
            </button>
            <button type="button" onClick={() => setListOpen(true)} className="flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-lg hover:bg-surface-2" aria-label="전체 목록">
              <span className="text-[16px] font-bold tabular-nums text-ink">{view === "product" ? "상품" : "손님"} {curIdx + 1} / {pageCount}</span>
              <span className="text-[12px] font-semibold text-ink-soft underline underline-offset-2">전체 목록</span>
            </button>
            <button type="button" onClick={() => goPage(1)} aria-label="다음" className="flex h-12 w-14 items-center justify-center rounded-lg bg-ink text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </div>
        ) : null}

        {/* 아래 */}
        <div className="flex items-center gap-2 border-t border-line px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button type="button" disabled={blocked || exporting || scopeTooWide} onClick={() => void runExcel()} className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-40">{exporting ? "만드는 중…" : "엑셀"}</button>
          <button type="button" disabled={blocked || scopeTooWide} onClick={() => void unpickAll()} className="h-10 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2 disabled:opacity-40">전부 해제</button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink">닫기</button>
          <button type="button" disabled={blocked || scopeTooWide} onClick={() => void pickAll()} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-40">모두 챙김</button>
        </div>

        {/* 전체 목록 — 어디까지 했는지 + 검색, 누르면 그 장으로 */}
        {listOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col bg-surface" role="dialog" aria-label="전체 목록">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h3 className="flex-1 text-[18px] font-bold text-ink">전체 목록 · {view === "product" ? `상품 ${pageCount}개` : `손님 ${pageCount}명`}</h3>
              <button type="button" onClick={() => setListOpen(false)} aria-label="목록 닫기" className="h-10 w-10 rounded-lg text-[22px] text-ink-soft hover:bg-surface-2">×</button>
            </div>
            <div className="px-4 pt-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={view === "product" ? "상품·옵션·닉네임 검색" : "닉네임·이름·상품 검색"} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {pages.map((pg, i) => {
                if (q && !pg.rows.some((r) => productSearchMatches([r.nickname, r.name, r.productName, r.optionText].join(" "), q))) return null;
                const pc = countLine(pg.rows);
                const left = pc.total - pc.got;
                return (
                  <button key={pg.key} type="button" onClick={() => { setIdx(i); setListOpen(false); }} className={`mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${i === curIdx ? "border-ink" : "border-line"} ${pc.done ? "bg-surface-2" : "bg-surface"}`}>
                    <span className="w-7 shrink-0 text-[13px] font-semibold tabular-nums text-ink-mute">{i + 1}</span>
                    {view === "product" ? photoOf(pg.photo, 40) : null}
                    <span className="min-w-0 flex-1">
                      <span className={`block break-words text-[16px] font-bold leading-snug ${pc.done ? "text-ink-mute" : "text-ink"}`}>{pg.title}{pg.sub ? <span className="ml-1.5 text-[13px] font-semibold text-ink-soft">{pg.sub}</span> : null}</span>
                      {view === "product" && pg.options ? optionSummaryLine(pg.options, false) : null}
                    </span>
                    <span className={`shrink-0 text-[13px] font-bold tabular-nums ${pc.done ? "text-ok-tx" : left > 0 ? "text-danger-tx" : "text-ink-mute"}`}>{pc.done ? "✓ 다 챙김" : left > 0 ? `남은 ${left}개` : `${pc.all}개`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
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
