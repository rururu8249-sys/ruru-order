"use client";

import { useEffect, useMemo, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { cartHoldPresentation } from "@/lib/cartHoldDetail";

type Props = { onClose: () => void };
type Hold = {
  sessionKey: string; phone: string; nickname: string; name: string; productName: string; fallbackProductName: string;
  detailName: string; unitPrice: number | null; legacySnapshot: boolean; color: string; size: string; qty: number; expiresAt: string; createdAt: string;
};
type Group = { sessionKey: string; phone: string; nickname: string; name: string; items: Hold[]; totalQty: number; minExpires: number; maxCreated: number };
type SortKey = "expires" | "recent" | "qty" | "name";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "expires", label: "남은 시간 짧은순" }, { value: "recent", label: "최신 담김순" }, { value: "qty", label: "담긴 수량 많은순" }, { value: "name", label: "닉네임순" },
];
const phoneFmt = (p: string) => { const d = String(p || "").replace(/[^0-9]/g, ""); return d.length === 11 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}` : d; };
const createdText = (ms: number) => !Number.isFinite(ms) || ms <= 0 ? "" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
const remainText = (expiresMs: number, nowMs: number) => { const m = Math.max(0, Math.round((expiresMs-nowMs)/60000)); if (m >= 1440) return `${Math.floor(m/1440)}일 ${Math.floor((m%1440)/60)}시간 남음`; if (m >= 60) return `${Math.floor(m/60)}시간 ${m%60}분 남음`; return `${m}분 남음`; };
const won = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString("ko-KR")}원`;

export default function LiveCartHoldsModal({ onClose }: Props) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState("");
  const [reminding, setReminding] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [scopeAll, setScopeAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("expires");
  const [scopeInfo, setScopeInfo] = useState<{scope:string;broadcastTitle:string}>({scope:"all",broadcastTitle:""});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-live/cart-holds${scopeAll ? "?scope=all" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("담김 현황 불러오기 실패\n\n" + (json?.error?.message || `요청 실패(${res.status})`), "error"); return; }
      setHolds(Array.isArray(json.holds) ? json.holds : []);
      setScopeInfo({ scope: String(json.scope || "all"), broadcastTitle: String(json.broadcastTitle || "") });
      setNow(Date.now());
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopeAll]);
  useEffect(() => { const t=window.setInterval(()=>setNow(Date.now()),30000); return()=>window.clearInterval(t); },[]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const h of holds) {
      const exp = new Date(h.expiresAt).getTime(); if (!Number.isFinite(exp) || exp <= now) continue;
      const g = map.get(h.sessionKey) || { sessionKey:h.sessionKey, phone:h.phone, nickname:h.nickname, name:h.name, items:[], totalQty:0, minExpires:Infinity, maxCreated:0 };
      g.items.push(h); g.totalQty += h.qty; g.minExpires = Math.min(g.minExpires, exp);
      const created = new Date(h.createdAt).getTime(); if (Number.isFinite(created)) g.maxCreated = Math.max(g.maxCreated, created);
      if (!g.phone && h.phone) g.phone=h.phone; if (!g.nickname && h.nickname) g.nickname=h.nickname; if (!g.name && h.name) g.name=h.name; map.set(h.sessionKey,g);
    }
    const list=Array.from(map.values()); const nameOf=(g:Group)=>(g.nickname||g.name||g.phone||"").toString();
    return list.sort((a,b)=> sortKey==="recent"?b.maxCreated-a.maxCreated:sortKey==="qty"?b.totalQty-a.totalQty||a.minExpires-b.minExpires:sortKey==="name"?nameOf(a).localeCompare(nameOf(b),"ko"):a.minExpires-b.minExpires);
  },[holds,now,sortKey]);
  const totalQty=groups.reduce((s,g)=>s+g.totalQty,0);
  const groupLabel=(g:Group)=>{ const nick=[g.nickname,g.name&&g.nickname!==g.name?`(${g.name})`:""].filter(Boolean).join(" "); return nick||(g.phone?phoneFmt(g.phone):"번호 미입력 고객"); };

  const clearSession=async(g:Group)=>{
    if (!(await showAdminConfirm(`${groupLabel(g)}의 담김 ${g.totalQty}개 선점을 해제할까요?\n\n다른 고객 화면의 남은 수량이 즉시 복구됩니다. (실제 재고·주문에는 영향 없음)`))) return;
    setClearing(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"clear",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("선점 해제 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast("선점을 해제했습니다."); await load(); } finally { setClearing(""); }
  };
  const remind=async(g:Group)=>{
    setReminding(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("결제 요청 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(json.sent>0?`${groupLabel(g)}님께 주문 확인 알림을 보냈습니다.`:"최근에 이미 알림을 보냈어요. 잠시 후 다시 보낼 수 있습니다."); } finally { setReminding(""); }
  };
  const remindAll=async()=>{
    if(groups.length===0)return;
    if(!(await showAdminConfirm(`현재 목록의 미제출 고객 ${groups.length}명에게 주문 확인 알림을 보낼까요?`,{title:"전체 결제 요청",confirmText:"알림 보내기"})))return;
    setReminding("__all__"); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind-all",sessionKeys:groups.map(g=>g.sessionKey)})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("전체 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(`주문 확인 알림 ${Number(json.sent)||0}명 전송${Number(json.skipped)>0?` · 최근 발송/만료 제외 ${Number(json.skipped)}명`:""}`); } finally { setReminding(""); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl" onClick={(e)=>e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="text-[15px] font-black text-ink">🛒 담김 현황 <span className="text-ink-mute">(주문서 제출 전 선점)</span></div>
        <div className="flex items-center gap-2"><button type="button" onClick={()=>void load()} disabled={loading} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">{loading?"불러오는중":"새로고침"}</button><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[15px] font-black text-ink-mute hover:text-ink">✕</button></div>
      </div>
      <div className="border-b border-line bg-surface-2 px-5 py-2 text-xs font-black text-ink-soft">
        <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1">장바구니 {groups.length}개 · 담긴 수량 {totalQty}개 — 시간이 지나면 자동 해제됩니다.</div>
          {groups.length>0?<button type="button" disabled={Boolean(reminding)} onClick={()=>void remindAll()} className="shrink-0 rounded-lg bg-[#7B2D43] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">{reminding==="__all__"?"알림 전송중":"🔔 전체 미제출 고객 알림"}</button>:null}
          <select value={sortKey} onChange={(e)=>setSortKey(e.target.value as SortKey)} className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft" aria-label="담김 목록 정렬">{SORT_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
        </div>
        {scopeAll?<div className="mt-1 flex items-center gap-2 text-ink-mute"><span>지난 담김까지 전체 표시 중</span><button type="button" onClick={()=>setScopeAll(false)} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-black">현재 방송만 보기</button></div>:scopeInfo.scope==="broadcast"?<div className="mt-1 flex items-center gap-2 text-ink-mute"><span>📺 현재 방송{scopeInfo.broadcastTitle?`(${scopeInfo.broadcastTitle})`:""} 상품 담김만 표시 중</span><button type="button" onClick={()=>setScopeAll(true)} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-black">지난 것까지 보기</button></div>:null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{loading&&holds.length===0?<div className="py-10 text-center text-xs font-black text-ink-mute">불러오는 중...</div>:groups.length===0?<div className="py-10 text-center text-xs font-black text-ink-mute">지금 담기만 하고 제출 안 한 고객이 없습니다.</div>:<div className="space-y-3">{groups.map(g=>{
        const presentations=g.items.map(it=>cartHoldPresentation({productName:it.productName,fallbackProductName:it.fallbackProductName,color:it.color,size:it.size,qty:it.qty,unitPrice:it.unitPrice,legacySnapshot:it.legacySnapshot}));
        const knownTotal=presentations.reduce((s,p)=>s+(p.rowTotal??0),0); const unknown=presentations.some(p=>p.rowTotal===null);
        return <div key={g.sessionKey} className="overflow-hidden rounded-2xl border border-line">
          <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-3 py-2"><span className="min-w-0 flex-1 text-[13px] font-black text-ink">👤 {groupLabel(g)}{g.phone?<span className="ml-1.5 text-[11px] font-bold text-ink-mute">📱 {phoneFmt(g.phone)}</span>:null}</span>{g.maxCreated>0?<span className="text-[11px] font-bold text-ink-mute">🕒 {createdText(g.maxCreated)} 담음</span>:null}<span className="text-[11px] font-black text-rose-deep">{remainText(g.minExpires,now)}</span>
            <button type="button" disabled={Boolean(reminding)} onClick={()=>void remind(g)} className="rounded-lg border border-[#7B2D43]/20 bg-white px-2 py-1 text-[11px] font-black text-[#7B2D43] disabled:opacity-50">{reminding===g.sessionKey?"전송중":"🔔 결제 요청"}</button>
            <button type="button" disabled={clearing===g.sessionKey} onClick={()=>void clearSession(g)} className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft hover:bg-danger-bg hover:text-danger-tx disabled:opacity-50">{clearing===g.sessionKey?"해제중":"선점 해제"}</button>
          </div>
          <div className="divide-y divide-line">{g.items.map((it,i)=>{const p=presentations[i]; return <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5"><div className="min-w-0"><div className="break-words text-[13px] font-black leading-5 text-ink">{p.title}</div>{p.optionText?<div className="mt-0.5 text-[11px] font-bold text-ink-mute">옵션 · {p.optionText}</div>:null}{p.legacySnapshot?<div className="mt-0.5 text-[10px] font-bold text-amber-700">기존 선점 기록 · 세부상품/당시금액 기록 없음</div>:null}</div><div className="text-right"><div className="text-[13px] font-black text-ink">{p.qty}개</div>{p.unitPrice!==null?<><div className="mt-0.5 text-[11px] font-bold text-ink-soft">개당 {won(p.unitPrice)}</div>{p.qty>1?<div className="text-[11px] font-black text-[#7B2D43]">합계 {won(p.rowTotal||0)}</div>:null}</>:<div className="mt-0.5 text-[10px] font-bold text-ink-mute">금액 미기록</div>}</div></div>})}</div>
          <div className="flex items-center justify-end gap-2 border-t border-line bg-white px-3 py-2 text-[11px] font-black"><span className="text-ink-mute">담긴 금액</span><span className="text-[#7B2D43]">{won(knownTotal)}{unknown?" + 미기록":""}</span></div>
        </div>})}</div>}</div>
    </div>
  </div>;
}
