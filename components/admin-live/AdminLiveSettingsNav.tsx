"use client";
import {useState} from "react";
import {SETTINGS_NAV_GROUPS,activeSettingsGroupId,isActiveSettingsItem,searchSettingsNavigation,type SettingsDestination,type SettingsTab,type SettingsNavItem,type SettingsSection} from "./adminLiveSettingsNavigation";
// [2026-11-26 사장님 「설정 메뉴도 아직 그대로」] 왼쪽 메뉴 = 묶음 6개만(입금·결제/배송/혜택/손님 안내/알림/상점·보안).
//   묶음을 누르면 첫 항목이 열리고, 묶음 안 항목은 내용 맨 위 칩(SettingsGroupChips)으로 바꾼다. 탭·저장 화면은 그대로.
export default function AdminLiveSettingsNav({activeTab,section,onSelect}:{activeTab:SettingsTab;section?:SettingsSection;onSelect:(destination:SettingsDestination)=>void}) {
  const [query,setQuery]=useState("");
  const groupId=activeSettingsGroupId(activeTab,section);
  const searchButton=(item:SettingsNavItem)=><button key={item.label} type="button" onClick={()=>{onSelect(item.destination);setQuery("");}} className="min-h-11 w-full rounded-xl px-3 py-1.5 text-left text-xs font-bold text-ink-soft hover:bg-surface md:min-h-9">{item.label}</button>;
  return <nav aria-label="설정 항목" className="shrink-0 space-y-1 border-b border-line bg-surface-2/60 p-2 md:w-44 md:border-b-0 md:border-r">
    <input type="search" name="settings-nav-search" autoComplete="off" data-1p-ignore data-lpignore="true" aria-label="설정 항목 검색" value={query} onChange={event=>setQuery(event.target.value)} placeholder="설정 검색" className="min-h-11 w-full rounded-xl border border-line bg-surface px-2 text-xs text-ink md:min-h-9" />
    {query.trim() ? <div>{searchSettingsNavigation(query).map(searchButton)}{searchSettingsNavigation(query).length===0 ? <p className="p-2 text-xs text-ink-mute">검색 결과 없음</p> : null}</div>
      : <div className="flex gap-1 overflow-x-auto md:block md:space-y-1">{SETTINGS_NAV_GROUPS.map(group=>{
        const on=group.id===groupId;
        return <button key={group.id} type="button" aria-current={on?"page":undefined} onClick={()=>{if(!on) onSelect(group.items[0].destination);}} className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3 text-left text-sm font-bold md:w-full ${on ? "bg-ink text-white" : "text-ink-soft hover:bg-surface"}`}>{group.label}</button>;
      })}</div>}
  </nav>;
}
export function SettingsGroupChips({activeTab,section,onSelect}:{activeTab:SettingsTab;section?:SettingsSection;onSelect:(destination:SettingsDestination)=>void}) {
  const group=SETTINGS_NAV_GROUPS.find(g=>g.id===activeSettingsGroupId(activeTab,section));
  if (!group || group.items.length<2) return null;
  return <div role="tablist" aria-label={`${group.label} 항목`} className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-3 py-2 md:px-5">
    {group.items.map(item=>{const on=isActiveSettingsItem(item,activeTab,section);return <button key={item.label} type="button" role="tab" aria-selected={on} onClick={()=>onSelect(item.destination)} className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-bold ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>{item.label}</button>;})}
  </div>;
}
