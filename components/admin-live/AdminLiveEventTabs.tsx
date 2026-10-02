"use client";

export type EventTab = "survival" | "race" | "roulette" | "claw" | "mission";
const TABS: readonly [EventTab, string][] = [
  ["survival", "⛈️ 서바이벌"], ["race", "🏁 달리기"], ["roulette", "🎡 룰렛"],
  ["claw", "🪆 인형뽑기"], ["mission", "🎯 미션"],
];

export default function AdminLiveEventTabs({active, onSelect,disabled=false}: {active: EventTab; onSelect: (tab: EventTab) => void;disabled?:boolean}) {
  return <div aria-label="이벤트 종류" className="flex flex-wrap gap-1">
    {TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={active === key}
      onClick={() => onSelect(key)} disabled={disabled}
      className={`min-h-11 rounded-xl border px-2.5 text-xs font-bold md:min-h-9 ${active === key ? "border-rose-deep bg-rose-deep text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>{label}</button>)}
  </div>;
}
