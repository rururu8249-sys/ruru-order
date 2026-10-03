"use client";

import { useMemo, useState } from "react";
import type { BroadcastCalendarItem } from "./BroadcastCalendarPicker";
import { kstDateKey, selectBroadcastIdsForDateKeys } from "@/lib/orderPickingWorkspace";

type Props = {
  items: BroadcastCalendarItem[];
  selectedIds: string[];
  loading: boolean;
  onChange: (ids: string[]) => void | Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function PickingBroadcastSelector({ items, selectedIds, loading, onChange }: Props) {
  const [olderOpen, setOlderOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openedAt] = useState(() => new Date());
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const today = kstDateKey(openedAt) || "";
  const yesterdayDate = new Date(openedAt);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = kstDateKey(yesterdayDate) || "";
  const cutoff = openedAt.getTime() - (14 * DAY_MS);
  const recentItems = items.filter((item) => {
    if (selected.has(item.id)) return true;
    const time = Date.parse(`${item.dateKey}T00:00:00+09:00`);
    return Number.isFinite(time) && time >= cutoff;
  });
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = olderOpen
    ? items.filter((item) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery))
    : recentItems;
  const setDates = (keys: string[]) => void onChange(selectBroadcastIdsForDateKeys(
    items.map((item) => ({ id: item.id, startedAt: `${item.dateKey}T12:00:00+09:00` })), keys,
  ));

  return (
    <section aria-label="작업할 방송" className="shrink-0 border-b border-line bg-rose-soft/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13px] text-ink">방송 범위</strong>
        <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-black text-rose-deep">{selectedIds.length ? `${selectedIds.length}개 선택` : "현재 주문 목록"}</span>
        <div className="flex gap-1">
          <button type="button" disabled={loading} onClick={() => setDates([today])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold disabled:opacity-50">오늘 방송</button>
          <button type="button" disabled={loading} onClick={() => setDates([today, yesterday])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold disabled:opacity-50">오늘+어제 방송</button>
          <button type="button" disabled={loading} onClick={() => void onChange([])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold disabled:opacity-50">현재 목록으로</button>
        </div>
        <button type="button" aria-expanded={olderOpen} onClick={() => setOlderOpen((value) => !value)} className="ml-auto min-h-9 rounded-lg border border-line bg-surface px-3 text-[12px] font-bold text-ink-soft">{olderOpen ? "최근 방송만 보기" : "이전 방송 찾기"}</button>
      </div>
      {olderOpen ? <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="이전 방송 검색" placeholder="방송명 검색" className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]" /> : null}
      <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto" aria-busy={loading}>
        {visibleItems.map((item) => (
          <label key={item.id} className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${selected.has(item.id) ? "border-rose-deep bg-surface text-rose-deep" : "border-line bg-surface text-ink-soft"}`}>
            <input type="checkbox" disabled={loading} aria-label={`방송 선택 ${item.label}`} checked={selected.has(item.id)} onChange={() => void onChange(selected.has(item.id) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id])} />
            {item.label}{typeof item.count === "number" ? ` · ${item.count}건` : ""}
          </label>
        ))}
        {visibleItems.length === 0 ? <span className="text-[11px] text-ink-mute">{olderOpen ? "검색 결과가 없습니다." : "최근 14일 방송이 없습니다."}</span> : null}
      </div>
      {loading ? <p className="mt-1 text-[11px] font-bold text-ink-soft">선택한 방송 주문을 불러오는 중…</p> : null}
    </section>
  );
}
