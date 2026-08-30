"use client";

import { useEffect, useMemo, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { cartHoldPresentation } from "@/lib/cartHoldDetail";
import { supabase } from "@/lib/supabase";
import { detailProducts } from "@/lib/productDetailModel";
import { formatKoreanPhone } from "@/lib/order/phone";

type Props = { onClose: () => void };
type Hold = {
  sessionKey: string; phone: string; nickname: string; name: string; productId: string; productName: string; fallbackProductName: string;
  detailName: string; unitPrice: number | null; legacySnapshot: boolean; color: string; size: string; qty: number; expiresAt: string; createdAt: string;
};
type Group = { sessionKey: string; phone: string; nickname: string; name: string; items: Hold[]; totalQty: number; minExpires: number; maxCreated: number };
type SortKey = "expires" | "recent" | "qty" | "name";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "expires", label: "남은 시간 짧은순" }, { value: "recent", label: "최신 담김순" }, { value: "qty", label: "담긴 수량 많은순" }, { value: "name", label: "닉네임순" },
];
const phoneFmt = (p: string) => formatKoreanPhone(p);   // [2026-08-30] 표기 통일
// [2026-08-30] "담음"이 아니라 "마지막 확인"이다.
//   claim_cart_hold 은 동기화마다 delete 후 insert 라 created_at 이 매번 새로 찍힌다.
//   그래서 이 값은 손님 화면이 마지막으로 신호를 보낸 시각이지, 처음 담은 시각이 아니다.
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
  // [2026-08-30] 장바구니별 마지막 알림 상태(보냄/봄) — 사장님이 결과를 눈으로 확인할 수 있게
  const [alerts, setAlerts] = useState<Record<string, { sentAt: string; seenAt: string }>>({});
  // [2026-08-31 사장님 요청] 사진 등록된 상품은 작은 사진 표시 + 클릭 확대 — 주문상세와 같은 방식(표시 전용)
  const [holdImages, setHoldImages] = useState<Record<string, string>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-live/cart-holds${scopeAll ? "?scope=all" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("장바구니 불러오기 실패\n\n" + (json?.error?.message || `요청 실패(${res.status})`), "error"); return; }
      setHolds(Array.isArray(json.holds) ? json.holds : []);
      setAlerts(json.alerts && typeof json.alerts === "object" ? json.alerts : {});
      setScopeInfo({ scope: String(json.scope || "all"), broadcastTitle: String(json.broadcastTitle || "") });
      setNow(Date.now());
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopeAll]);

  // 사진 조회 — 실패해도 목록은 정상 표시. 세부상품이면 그 사진, 아니면 대표사진.
  useEffect(() => {
    let stopped = false;
    const ids = Array.from(new Set(holds.map((h) => String(h.productId || "").trim()).filter(Boolean)));
    if (ids.length === 0) { setHoldImages({}); return; }
    (async () => {
      try {
        const { data } = await supabase.from("products").select("*").in("id", ids);
        if (stopped || !Array.isArray(data)) return;
        const byId = new Map<string, Record<string, unknown>>();
        for (const row of data as Record<string, unknown>[]) byId.set(String((row as { id?: unknown }).id ?? ""), row);
        const next: Record<string, string> = {};
        for (const h of holds) {
          const pid = String(h.productId || "").trim();
          if (!pid) continue;
          const key = `${pid}|${String(h.detailName || "").trim()}`;
          if (next[key]) continue;
          const prow = byId.get(pid);
          if (!prow) continue;
          let url = "";
          const dn = String(h.detailName || "").trim();
          try {
            if (dn) {
              const d = detailProducts(prow as never, { includeHidden: true }).find((x) => x.detailName === dn);
              if (d?.image) url = d.image;
            }
          } catch { /* 세부상품 해석 실패 → 대표사진 폴백 */ }
          if (!url) {
            const row = prow as Record<string, unknown>;
            const arr0 = (v: unknown) => (Array.isArray(v) && v.length > 0 ? String(v[0] ?? "") : "");
            url = String(row.image_url || row.cover_image_url || row.main_image_url || row.thumbnail_url || "").trim()
              || arr0(row.detail_image_urls) || arr0(row.image_urls) || arr0(row.images);
            url = String(url || "").trim();
          }
          if (url) next[key] = url;
        }
        setHoldImages(next);
      } catch { /* 사진은 보조 표시 */ }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holds]);
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
    if (!(await showAdminConfirm(`${groupLabel(g)}님의 장바구니(${g.totalQty}개)를 비울까요?\n\n손님 화면의 담긴 상품도 함께 사라지고, 다른 고객 화면의 남은 수량이 즉시 복구됩니다. (실제 재고·주문에는 영향 없음)`))) return;
    setClearing(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"clear",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("장바구니 비우기 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast("장바구니를 비웠습니다."); await load(); } finally { setClearing(""); }
  };
  const remind=async(g:Group)=>{
    setReminding(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("결제 요청 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(json.sent>0?`${groupLabel(g)}님께 주문 확인 알림을 보냈습니다.`:"최근에 이미 알림을 보냈어요. 잠시 후 다시 보낼 수 있습니다."); await load(); } finally { setReminding(""); }
  };
  const remindAll=async()=>{
    if(groups.length===0)return;
    if(!(await showAdminConfirm(`현재 목록의 미제출 고객 ${groups.length}명에게 주문 확인 알림을 보낼까요?`,{title:"전체 결제 요청",confirmText:"알림 보내기"})))return;
    setReminding("__all__"); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind-all",sessionKeys:groups.map(g=>g.sessionKey)})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("전체 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(`주문 확인 알림 ${Number(json.sent)||0}명 전송${Number(json.skipped)>0?` · 최근 발송/만료 제외 ${Number(json.skipped)}명`:""}`); await load(); } finally { setReminding(""); }
  };

  // [2026-08-31 사장님 요청] 일괄 비우기 — 표시용 선점만 지운다(재고·주문·돈 무접촉). 손님 화면 담긴 상품도 회수.
  const clearAll=async()=>{
    if(groups.length===0)return;
    if(!(await showAdminConfirm(`목록의 장바구니 ${groups.length}개(담긴 수량 ${totalQty}개)를 전부 비울까요?\n\n손님 화면의 담긴 상품도 함께 사라집니다. (실제 재고·주문에는 영향 없음)`,{title:"장바구니 전체 비우기",confirmText:"전부 비우기"})))return;
    setClearing("__all__"); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"clear-all",sessionKeys:groups.map(g=>g.sessionKey)})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("전체 비우기 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(`장바구니 ${Number(json.cleared)||0}개를 비웠습니다.`); await load(); } finally { setClearing(""); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    {imagePreviewUrl?<div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onClick={(e)=>{e.stopPropagation();setImagePreviewUrl("");}}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imagePreviewUrl} alt="상품 사진 크게 보기" className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"/><button type="button" onClick={(e)=>{e.stopPropagation();setImagePreviewUrl("");}} className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-sm font-black text-slate-700">✕ 닫기</button></div>:null}
    <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl" onClick={(e)=>e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="text-[15px] font-black text-ink">🛒 장바구니 <span className="text-ink-mute">(주문서 제출 전)</span></div>
        <div className="flex items-center gap-2"><button type="button" onClick={()=>void load()} disabled={loading} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">{loading?"불러오는중":"새로고침"}</button><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[15px] font-black text-ink-mute hover:text-ink">✕</button></div>
      </div>
      <div className="border-b border-line bg-surface-2 px-5 py-2 text-xs font-black text-ink-soft">
        <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1">장바구니 {groups.length}개 · 담긴 수량 {totalQty}개 — 시간이 지나면 자동으로 비워집니다.</div>
          {groups.length>0?<button type="button" disabled={Boolean(reminding)} onClick={()=>void remindAll()} className="shrink-0 rounded-lg bg-[#7B2D43] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">{reminding==="__all__"?"알림 전송중":"🔔 전체 미제출 고객 알림"}</button>:null}
          {groups.length>0?<button type="button" disabled={Boolean(clearing)} onClick={()=>void clearAll()} className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-black text-ink-soft hover:bg-danger-bg hover:text-danger-tx disabled:opacity-50">{clearing==="__all__"?"비우는중":"🧹 전체 비우기"}</button>:null}
          <select value={sortKey} onChange={(e)=>setSortKey(e.target.value as SortKey)} className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft" aria-label="담김 목록 정렬">{SORT_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
        </div>
        {scopeAll?<div className="mt-1 flex items-center gap-2 text-ink-mute"><span>지난 장바구니까지 전체 표시 중</span><button type="button" onClick={()=>setScopeAll(false)} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-black">현재 방송만 보기</button></div>:scopeInfo.scope==="broadcast"?<div className="mt-1 flex items-center gap-2 text-ink-mute"><span>📺 현재 방송{scopeInfo.broadcastTitle?`(${scopeInfo.broadcastTitle})`:""} 상품 장바구니만 표시 중</span><button type="button" onClick={()=>setScopeAll(true)} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-black">지난 것까지 보기</button></div>:null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{loading&&holds.length===0?<div className="py-10 text-center text-xs font-black text-ink-mute">불러오는 중...</div>:groups.length===0?<div className="py-10 text-center text-xs font-black text-ink-mute">지금 담기만 하고 제출 안 한 고객이 없습니다.</div>:<div className="space-y-3">{groups.map(g=>{
        const presentations=g.items.map(it=>cartHoldPresentation({productName:it.productName,fallbackProductName:it.fallbackProductName,color:it.color,size:it.size,qty:it.qty,unitPrice:it.unitPrice,legacySnapshot:it.legacySnapshot}));
        const knownTotal=presentations.reduce((s,p)=>s+(p.rowTotal??0),0); const unknown=presentations.some(p=>p.rowTotal===null);
        return <div key={g.sessionKey} className="overflow-hidden rounded-2xl border border-line">
          <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-3 py-2"><span className="min-w-0 flex-1 text-[13px] font-black text-ink">👤 {groupLabel(g)}{g.phone?<span className="ml-1.5 text-[11px] font-bold text-ink-mute">📱 {phoneFmt(g.phone)}</span>:null}</span>{g.maxCreated>0?<span className="text-[11px] font-bold text-ink-mute" title="손님 화면이 45초마다 보내는 신호의 마지막 시각입니다. 처음 담은 시각이 아닙니다.">🕒 {createdText(g.maxCreated)} 확인</span>:null}{(()=>{const a=alerts[g.sessionKey];if(!a?.sentAt)return null;const sent=new Date(a.sentAt).getTime();return a.seenAt?<span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700" title={`보냄 ${createdText(sent)} · 손님이 확인함`}>✅ 알림 봄</span>:<span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700" title={`보냄 ${createdText(sent)} · 아직 손님 화면에 안 뜸(사이트에 들어와야 보입니다)`}>📨 보냄 {createdText(sent)}</span>;})()}<span className="text-[11px] font-black text-rose-deep">{remainText(g.minExpires,now)}</span>
            <button type="button" disabled={Boolean(reminding)} onClick={()=>void remind(g)} className="rounded-lg border border-[#7B2D43]/20 bg-white px-2 py-1 text-[11px] font-black text-[#7B2D43] disabled:opacity-50">{reminding===g.sessionKey?"전송중":"🔔 결제 요청"}</button>
            <button type="button" disabled={clearing===g.sessionKey} onClick={()=>void clearSession(g)} className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft hover:bg-danger-bg hover:text-danger-tx disabled:opacity-50">{clearing===g.sessionKey?"비우는중":"🧹 비우기"}</button>
          </div>
          <div className="divide-y divide-line">{g.items.map((it,i)=>{const p=presentations[i]; const img=holdImages[`${String(it.productId||"").trim()}|${String(it.detailName||"").trim()}`]||""; return <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-3 py-2.5">{img?<button type="button" title="사진 크게 보기" onClick={()=>setImagePreviewUrl(img)} className="h-11 w-11 shrink-0 self-center overflow-hidden rounded-lg border border-line bg-surface-2">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt="" loading="lazy" className="h-full w-full object-cover"/></button>:<span className="h-11 w-11 shrink-0 self-center rounded-lg border border-line bg-surface-2 text-center text-[18px] leading-[44px]">🛍</span>}<div className="min-w-0"><div className="break-words text-[13px] font-black leading-5 text-ink">{p.title}</div>{p.optionText?<div className="mt-0.5 text-[11px] font-bold text-ink-mute">옵션 · {p.optionText}</div>:null}{p.legacySnapshot?<div className="mt-0.5 text-[10px] font-bold text-amber-700">예전 담김 기록 · 세부상품/당시금액 기록 없음</div>:null}</div><div className="text-right"><div className="text-[13px] font-black text-ink">{p.qty}개</div>{p.unitPrice!==null?<><div className="mt-0.5 text-[11px] font-bold text-ink-soft">개당 {won(p.unitPrice)}</div>{p.qty>1?<div className="text-[11px] font-black text-[#7B2D43]">합계 {won(p.rowTotal||0)}</div>:null}</>:<div className="mt-0.5 text-[10px] font-bold text-ink-mute">금액 미기록</div>}</div></div>})}</div>
          <div className="flex items-center justify-end gap-2 border-t border-line bg-white px-3 py-2 text-[11px] font-black"><span className="text-ink-mute">담긴 금액</span><span className="text-[#7B2D43]">{won(knownTotal)}{unknown?" + 미기록":""}</span></div>
        </div>})}</div>}</div>
    </div>
  </div>;
}
