"use client";

export type EventTab = "survival" | "race" | "roulette" | "claw" | "mission";
const TABS: readonly [EventTab, string][] = [
  ["survival", "서바이벌"], ["race", "달리기"], ["roulette", "룰렛"],
  ["claw", "인형뽑기"], ["mission", "미션"],
];

export default function AdminLiveEventTabs({active, onSelect,disabled=false}: {active: EventTab; onSelect: (tab: EventTab) => void;disabled?:boolean}) {
  return <div aria-label="이벤트 종류" className="flex flex-wrap gap-2">
    {TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={active === key}
      onClick={() => onSelect(key)} disabled={disabled}
      className={`h-10 rounded-full px-4 text-sm font-bold disabled:opacity-45 ${active === key ? "bg-[#111111] text-white" : "border border-[#CACACB] bg-white text-[#111111] hover:bg-[#F5F5F5]"}`}>{label}</button>)}
  </div>;
}
