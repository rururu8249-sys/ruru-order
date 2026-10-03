"use client";

import type { BroadcastCalendarItem } from "./BroadcastCalendarPicker";
import { kstDateKey, selectBroadcastIdsForDateKeys } from "@/lib/orderPickingWorkspace";

type Props = {
  items: BroadcastCalendarItem[];
  selectedIds: string[];
  appliedIds: string[];
  loading: boolean;
  onChange: (ids: string[]) => void;
  onApply: () => void;
};

export default function PickingBroadcastSelector({ items, selectedIds, appliedIds, loading, onChange, onApply }: Props) {
  const selected = new Set(selectedIds);
  const today = kstDateKey(new Date()) || "";
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = kstDateKey(yesterdayDate) || "";
  const setDates = (keys: string[]) => onChange(selectBroadcastIdsForDateKeys(
    items.map((item) => ({ id: item.id, startedAt: `${item.dateKey}T12:00:00+09:00` })), keys,
  ));

  return (
    <section aria-label="작업할 방송" className="shrink-0 border-b border-line bg-rose-soft/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13px] text-ink">작업할 방송</strong>
        <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-black text-rose-deep">적용 {appliedIds.length || "현재 목록"}</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => setDates([today])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold">오늘</button>
          <button type="button" onClick={() => setDates([today, yesterday])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold">오늘+어제</button>
          <button type="button" onClick={() => onChange([])} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold">선택 해제</button>
        </div>
        <button type="button" disabled={loading} onClick={onApply} className="ml-auto min-h-9 rounded-lg bg-rose-deep px-3 text-[12px] font-black text-white disabled:opacity-50">{loading ? "불러오는 중…" : "선택 적용"}</button>
      </div>
      <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
        {items.map((item) => (
          <label key={item.id} className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${selected.has(item.id) ? "border-rose-deep bg-surface text-rose-deep" : "border-line bg-surface text-ink-soft"}`}>
            <input type="checkbox" aria-label={`방송 선택 ${item.label}`} checked={selected.has(item.id)} onChange={() => onChange(selected.has(item.id) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id])} />
            {item.label}{typeof item.count === "number" ? ` · ${item.count}건` : ""}
          </label>
        ))}
        {items.length === 0 ? <span className="text-[11px] text-ink-mute">선택 가능한 방송 기록이 없습니다.</span> : null}
      </div>
    </section>
  );
}
