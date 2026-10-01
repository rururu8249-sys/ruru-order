"use client";
import {useState} from "react";
import {SETTINGS_NAV_GROUPS,searchSettingsNavigation,type SettingsDestination,type SettingsTab,type SettingsNavItem} from "./adminLiveSettingsNavigation";
export default function AdminLiveSettingsNav({activeTab,section,onSelect}:{activeTab:SettingsTab;section?:"bank"|"payster";onSelect:(destination:SettingsDestination)=>void}) {
  const [query,setQuery]=useState("");
  const itemButton=(item:SettingsNavItem)=><button key={item.label} type="button" onClick={()=>onSelect(item.destination)} aria-current={"tab" in item.destination && item.destination.tab===activeTab && item.destination.section===section ? "page" : undefined} className={`min-h-11 w-full rounded-xl px-3 py-1.5 text-left text-xs font-bold md:min-h-9 ${"tab" in item.destination && item.destination.tab===activeTab && item.destination.section===section ? "bg-rose-soft text-rose-deep" : "text-ink-soft hover:bg-surface"}`}>{item.label}</button>;
  return <nav aria-label="설정 항목" className="max-h-64 shrink-0 space-y-1 overflow-y-auto border-b border-line bg-surface-2/60 p-2 md:max-h-none md:w-44 md:border-b-0 md:border-r">
    <input aria-label="설정 항목 검색" value={query} onChange={event=>setQuery(event.target.value)} placeholder="설정 검색" className="min-h-11 w-full rounded-xl border border-line bg-surface px-2 text-xs text-ink md:min-h-9" />
    {query.trim() ? <div>{searchSettingsNavigation(query).map(itemButton)}{searchSettingsNavigation(query).length===0 ? <p className="p-2 text-xs text-ink-mute">검색 결과 없음</p> : null}</div> : SETTINGS_NAV_GROUPS.map(group=><details key={group.id} open={!group.collapsedByDefault} className="group">
      <summary className="cursor-pointer px-2 py-1 text-[11px] font-black text-ink-mute">{group.label}</summary>
      <div>{group.items.map(itemButton)}</div>
    </details>)}
  </nav>;
}
