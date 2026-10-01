"use client";

// 물건챙기기 체크리스트 팝업 (주문서 단위 패널).
//   - 주문서 1건(같은 order_group_id) = 패널 1개. 같은 닉네임이라도 주문서 다르면 다른 패널.
//   - 상품별/고객별은 같은 주문 행의 챙김 상태를 보여주는 두 가지 보기.
//   - 체크는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 유지.
//   - 결제완료 주문만 표시. 자동 접기와 일괄 완료 없이 개별 수량을 확인해 체크.
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

type Props = { orders: LiveOrder[]; filterLabel: string; onClose: () => void };

// [2026-07-13 사장님 지침] amount = 주문에 저장된 상품금액(표시 전용, 재계산 안 함)
type PickItem = { id: string; productId: string; text: string; productName: string; optionText: string; color: string; size: string; qty: number; amount: number };
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

export default function LiveOrderPickingModal({ orders, filterLabel, onClose }: Props) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"batch" | "order">("batch");
  const [unpickedOnly, setUnpickedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // 주문서 단위 패널 (취소건 제외)
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    for (const o of orders) {
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
          ? [{ id: String(o.id), productId: "", text: clean(o.orderSummary) || "상품", productName: clean(o.orderSummary) || "상품", optionText: "", color: "", size: "", qty: 1, amount: Number(o.productAmount || 0) }]
          : rawItems.map((it) => {
              const opt = formatOrderOptionText(it.color, it.size) || stripNoneOptionParts(it.optionText);
              const productName = clean(it.productName) || "상품";
              return { id: String(it.id), productId: clean(it.productId), text: productName + (opt ? ` (${opt})` : ""), productName, optionText: opt, color: clean(it.color), size: clean(it.size), qty: Number(it.qty || 1), amount: Number(it.amount || 0) };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      const phone = clean(o.phone).replace(/[^0-9]/g, ""); // 같은 고객 판정용(숫자만)
      list.push({ key: String(o.groupId || o.id), nickname, name, phone, search: searchText, paid, when, items, totalQty });
    }
    return list;
  }, [orders]);

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


  // Only paid, non-canceled orders participate. Both views use these same rows.
  const scopedPanels = useMemo(() => panels.filter(p => p.paid).sort((a, b) =>
    a.nickname.localeCompare(b.nickname, "ko") || ts(a.when) - ts(b.when)), [panels]);
  const scopedIds = useMemo(() => scopedPanels.flatMap(p => p.items.map(it => it.id)), [scopedPanels]);
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
    if (!(await showAdminConfirm("이 목록의 챙김 표시를 모두 해제할까요?\n주문·입금·금액·출고 상태는 바뀌지 않습니다."))) return;
    await updatePicked(scopedIds, false);
  };

  const runExcel = async () => {
    if (saving || loading || loadError) return;
    setExporting(true);
    try {
      await exportLiveOrdersForPicking(orders.filter(o => PAID_STATUSES.includes(clean(o.paymentStatus))), { filterLabel }, pickedIds);
      const ids = scopedIds.map(Number);
      const now = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from("orders").update({ picking_list_printed_at: now }).is("picking_list_printed_at", null).in("id", ids.slice(i, i + 500));
        if (error) throw error;
      }
    } catch (error: unknown) {
      showAdminToast("엑셀 내보내기 또는 출력 기록 저장 실패\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally { setExporting(false); }
  };

  const allRows = scopedPanels.flatMap(panel => panel.items.map(item => ({ panel, item })));
  const { total, got } = pickingProgress(allRows.map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
  const q = search.trim();
  const matches = allRows.filter(({ panel, item }) =>
    (!q || productSearchMatches([panel.nickname, panel.name, item.text].join(" "), q)) &&
    (!unpickedOnly || !pickedIds.has(item.id)));
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
    if (viewMode === "batch") group.rows.sort((a, b) => compareOrderOptions(a.item, b.item) || a.panel.nickname.localeCompare(b.panel.nickname, "ko"));
  }
  const blocked = loading || saving || loadError;
  const title = String(filterLabel || "").split(" · ")[0].replace(/^방송:\s*/, "");
  const renderRow = ({ panel, item }: PickingRow) => {
    const done = pickedIds.has(item.id);
    return (
      <div key={item.id} className={`grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[64px_minmax(0,1fr)_104px] ${done ? "bg-ok-bg/60" : "bg-surface"}`}>
        {itemPhoto[item.id] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={itemPhoto[item.id]} alt={item.productName} className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
        ) : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] text-ink-mute">사진 없음</span>}
        <div className="min-w-0 flex-1">
          <div className="break-words text-[16px] font-black text-ink">{item.productName}</div>
          <div className="mt-1 break-words text-[16px] font-black text-rose-deep">{item.optionText || "기본 옵션"}</div>
          <div className="mt-1 text-[12px] font-bold text-ink-soft">{panel.nickname}{panel.name && panel.name !== panel.nickname ? ` · ${panel.name}` : ""} · 주문 #{item.id}</div>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-right sm:col-span-1 sm:block sm:border-t-0 sm:pt-0">
          <div className="text-[22px] font-black text-ink"><span className="mr-2 text-[12px] font-bold text-ink-soft sm:hidden">확인할 수량</span>{item.qty}<span className="text-[12px]">개</span></div>
          <button type="button" role="checkbox" aria-checked={done} aria-label={`${panel.nickname} ${item.productName} ${item.optionText} ${item.qty}개 ${done ? "챙김 해제" : "챙김"}`}
            disabled={blocked} onClick={() => updatePicked([item.id], !pickedRef.current.has(item.id))}
            className={`mt-1 flex min-h-[44px] min-w-[92px] items-center justify-center gap-2 rounded-lg border-2 px-2 text-[13px] font-black disabled:opacity-50 ${done ? "border-ok-tx bg-[var(--color-ok-tx)] text-white" : "border-line bg-surface text-ink-soft"}`}>
            <span aria-hidden="true">{done ? "✓" : "□"}</span>{done ? "챙김" : "안 챙김"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="물건챙기기" className="flex h-[92vh] w-[min(840px,98vw)] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="text-[18px] font-black text-rose-deep">물건챙기기</h2><div className="text-[12px] font-bold text-ink-soft">{title} · 결제완료 주문만</div></div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="닫기" className="h-11 w-11 rounded-full bg-surface-2 text-[22px] disabled:opacity-40">×</button>
        </div>
        <div className="shrink-0 space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between gap-2" aria-live="polite">
            <span className="text-[18px] font-black text-rose-deep">안 챙김 {loading || loadError ? "—" : total - got}개</span>
            <span className="text-[14px] font-bold text-ok-tx">챙김 {loading || loadError ? "—" : got} / {total}개</span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["batch", "order"] as const).map(mode => <button key={mode} type="button" onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode} className={`min-h-[44px] rounded-lg text-[16px] font-black ${viewMode === mode ? "bg-rose-deep text-white" : "text-ink-soft"}`}>{mode === "batch" ? "상품별" : "고객별"}</button>)}
          </div>
          <div className="flex gap-2">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="상품번호 · 고객 이름 검색" aria-label="상품번호 또는 고객 이름 검색" className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-[14px]" />
            <button type="button" aria-pressed={unpickedOnly} onClick={() => setUnpickedOnly(value => !value)} className={`shrink-0 rounded-lg border border-line px-3 text-[12px] font-bold ${unpickedOnly ? "bg-rose-deep text-white" : "bg-surface text-ink-soft"}`}>안 챙김만</button>
          </div>
          <p className="text-[12px] font-bold text-ink-soft">상품·색상·사이즈·수량을 확인한 뒤 체크하세요. 두 화면의 체크는 같습니다.</p>
          <div role="status" aria-live="polite" className="text-[12px] font-bold text-ink-soft">{loading ? "챙김 상태 확인 중…" : loadError ? "상태 확인 실패 · 창을 다시 열어 주세요. 체크는 잠시 막았습니다." : saving ? "저장 중… 잠시 기다려 주세요." : "저장 완료 · 체크해도 목록에 그대로 남습니다."}</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface-2 p-3">
          {!loading && !loadError && matches.length === 0 ? <div className="py-12 text-center font-bold text-ink-soft">{q ? "검색 결과가 없습니다." : unpickedOnly ? "모두 챙겼습니다." : "챙길 결제완료 주문이 없습니다."}</div> : null}
          <div className="space-y-3">
            {[...grouped].sort(([, a], [, b]) => a.title.localeCompare(b.title, "ko")).map(([key, group]) => {
              const progress = pickingProgress(group.rows.map(({ item }) => ({ qty: item.qty, pickedAt: pickedIds.has(item.id) })));
              return <section key={key} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex items-start justify-between gap-2 bg-rose-soft p-3">
                  <div className="min-w-0"><h3 className="break-words text-[16px] font-black text-ink">{group.title}</h3>{group.subtitle ? <div className="mt-1 text-[12px] font-bold text-ink-soft">{group.subtitle}</div> : null}</div>
                  <span className="shrink-0 text-[12px] font-black text-ink-soft">{progress.got}/{progress.total}개</span>
                </div>
                <div className="divide-y divide-line">{group.rows.map(renderRow)}</div>
              </section>;
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line p-3">
          <button type="button" disabled={blocked || exporting} onClick={resetAll} className="min-h-[44px] px-2 text-[12px] font-bold text-[var(--color-danger-tx)] disabled:opacity-40">챙김 전체 해제</button>
          <div className="flex gap-2">
            <button type="button" disabled={blocked || exporting} onClick={runExcel} className="min-h-[44px] rounded-lg border border-line px-3 text-[13px] font-bold disabled:opacity-40">{exporting ? "내보내는 중…" : "엑셀"}</button>
            <button type="button" disabled={saving || exporting} onClick={onClose} className="min-h-[44px] rounded-lg bg-rose-deep px-4 text-[13px] font-black text-white disabled:opacity-40">닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
