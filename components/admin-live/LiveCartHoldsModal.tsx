"use client";

import { useEffect, useMemo, useState } from "react";
import { kakaoResultNote } from "@/lib/kakaoNotify";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { cartHoldPresentation, cartHoldTimeline } from "@/lib/cartHoldDetail";
import { supabase } from "@/lib/supabase";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { formatKoreanPhone } from "@/lib/order/phone";
import ProductPagination from "./ProductPagination";

type Props = { onClose: () => void };
type Hold = {
  sessionKey: string; kakaoId: string; phone: string; nickname: string; name: string; productId: string; productName: string; fallbackProductName: string;
  detailName: string; unitPrice: number | null; legacySnapshot: boolean; color: string; size: string; qty: number; expiresAt: string; createdAt: string; lastSyncedAt: string;
};
type BankAccount = { id: "primary" | "secondary"; label: string; bankName: string; bankAccount: string; bankHolder: string };
type GroupMeta = {
  cartStartedAt: string;
  isRegistered: boolean;
  validOrderCount: number;
  lastOrderAt: string;
  overrideAccount: null | (BankAccount & { assignedAt?: string });
};
type Group = { sessionKey: string; phone: string; nickname: string; name: string; items: Hold[]; totalQty: number; minExpires: number; minCreated: number; maxCreated: number; maxSynced: number };
type SortKey = "added" | "expires" | "recent" | "qty" | "name";
type CustomerFilter = "all" | "first" | "existing" | "unknown";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "added", label: "최근 상품 담은순" }, { value: "expires", label: "남은 시간 짧은순" }, { value: "recent", label: "최근 접속순" }, { value: "qty", label: "담긴 수량 많은순" }, { value: "name", label: "닉네임순" },
];
const phoneFmt = (p: string) => formatKoreanPhone(p);   // [2026-08-30] 표기 통일
const createdText = (ms: number) => !Number.isFinite(ms) || ms <= 0 ? "" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
// [2026-09-28] 항목 만료 시각 짧게(HH:MM) — 그룹 최소 만료보다 늦은 항목만 표기.
const hhmm = (ms: number) => !Number.isFinite(ms) || ms <= 0 ? "" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
const won = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString("ko-KR")}원`;

export default function LiveCartHoldsModal({ onClose }: Props) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState("");
  const [reminding, setReminding] = useState("");
  const [assigningAccount, setAssigningAccount] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [scopeAll, setScopeAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");
  const [scopeInfo, setScopeInfo] = useState<{scope:string;broadcastTitle:string}>({scope:"all",broadcastTitle:""});
  const [groupMeta, setGroupMeta] = useState<Record<string, GroupMeta>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  // [2026-08-30] 장바구니별 마지막 알림 상태(보냄/봄) — 사장님이 결과를 눈으로 확인할 수 있게
  const [alerts, setAlerts] = useState<Record<string, { sentAt: string; seenAt: string }>>({});
  // [2026-08-31 사장님 요청] 사진 등록된 상품은 작은 사진 표시 + 클릭 확대 — 주문상세와 같은 방식(표시 전용)
  const [holdImages, setHoldImages] = useState<Record<string, string>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  // [2026-10-29 사장님 「페이지 네이션으로 구분·UI/UX 개선」] 손님 장바구니 N명씩 페이지 + 검색(닉네임·이름·전화·상품명). 표시만.
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-live/cart-holds${scopeAll ? "?scope=all" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("장바구니 불러오기 실패\n\n" + (json?.error?.message || `요청 실패(${res.status})`), "error"); return; }
      setHolds(Array.isArray(json.holds) ? json.holds : []);
      setGroupMeta(json.groupMeta && typeof json.groupMeta === "object" ? json.groupMeta : {});
      setBankAccounts(Array.isArray(json.bankAccounts) ? json.bankAccounts : []);
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
          // [2026-08-31] 사진 매칭은 공용 규칙(lib/orderItemPhoto) 하나만 쓴다 —
          //   세부상품 이름이 수정돼도 코드·괄호 규칙으로 찾고, 못 찾으면 엉뚱한 사진 대신 표시 안 함.
          const dn = String(h.detailName || "").trim();
          const r = resolveOrderItemPhoto(prow as Record<string, unknown>, { productName: dn, color: "" });
          if (r.url) next[key] = r.url;
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
      const g = map.get(h.sessionKey) || { sessionKey:h.sessionKey, phone:h.phone, nickname:h.nickname, name:h.name, items:[], totalQty:0, minExpires:Infinity, minCreated:Infinity, maxCreated:0, maxSynced:0 };
      g.items.push(h); g.totalQty += h.qty; g.minExpires = Math.min(g.minExpires, exp);
      const created = new Date(h.createdAt).getTime(); if (Number.isFinite(created) && created > 0) { g.minCreated = Math.min(g.minCreated, created); g.maxCreated = Math.max(g.maxCreated, created); }
      const synced = new Date(h.lastSyncedAt).getTime(); if (Number.isFinite(synced) && synced > 0) g.maxSynced = Math.max(g.maxSynced, synced);
      if (!g.phone && h.phone) g.phone=h.phone; if (!g.nickname && h.nickname) g.nickname=h.nickname; if (!g.name && h.name) g.name=h.name; map.set(h.sessionKey,g);
    }
    const matchesCustomer=(g:Group)=>{ const meta=groupMeta[g.sessionKey]; if(customerFilter==="all")return true; if(!meta)return customerFilter==="unknown"; if(customerFilter==="existing")return meta.validOrderCount>0; if(customerFilter==="first")return meta.validOrderCount===0; return false; };
    const q=search.trim().toLowerCase().replace(/[\s-]/g,"");
    const matchesSearch=(g:Group)=>{ if(!q)return true; const hay=[g.nickname,g.name,g.phone,...g.items.flatMap(it=>[it.productName,it.fallbackProductName,it.detailName])].map(v=>String(v||"").toLowerCase().replace(/[\s-]/g,"")).join("|"); return hay.includes(q); };
    const list=Array.from(map.values()).filter(matchesCustomer).filter(matchesSearch); const nameOf=(g:Group)=>(g.nickname||g.name||g.phone||"").toString();
    return list.sort((a,b)=> sortKey==="added"?b.maxCreated-a.maxCreated:sortKey==="recent"?b.maxSynced-a.maxSynced:sortKey==="qty"?b.totalQty-a.totalQty||a.minExpires-b.minExpires:sortKey==="name"?nameOf(a).localeCompare(nameOf(b),"ko"):a.minExpires-b.minExpires);
  },[holds,now,sortKey,customerFilter,groupMeta,search]);
  const pageCount=Math.max(1,Math.ceil(groups.length/pageSize));
  const safePage=Math.min(page,pageCount);
  const pageStart=(safePage-1)*pageSize;
  const pageGroups=groups.slice(pageStart,pageStart+pageSize);
  useEffect(()=>{ setPage(1); },[search,customerFilter,sortKey,scopeAll,pageSize]);
  const totalQty=groups.reduce((s,g)=>s+g.totalQty,0);
  // [2026-09-28] 요약용 — 담긴 금액 합계·30분 내 만료 그룹 수(30분 이하=danger).
  const grandKnown=groups.reduce((s,g)=>s+g.items.reduce((ss,it)=>ss+(it.unitPrice!==null?it.unitPrice*it.qty:0),0),0);
  const soonCount=groups.filter(g=>cartHoldTimeline({createdAtMs:g.minCreated,expiresAtMs:g.minExpires,nowMs:now}).remainMin<=30).length;
  const groupLabel=(g:Group)=>{ const nick=[g.nickname,g.name&&g.nickname!==g.name?`(${g.name})`:""].filter(Boolean).join(" "); return nick||(g.phone?phoneFmt(g.phone):"번호 미입력 고객"); };
  const customerStatus=(g:Group)=>{ const meta=groupMeta[g.sessionKey]; if(!meta)return {label:"고객 확인 중",cls:"bg-surface-2 text-ink-mute"}; if(meta.validOrderCount>0)return {label:`기존회원 · 유효 주문 ${meta.validOrderCount}건`,cls:"bg-ok-bg text-ok-tx"}; if(meta.isRegistered)return {label:"신규회원 · 주문 없음",cls:"bg-warn-bg text-warn-tx"}; if(g.phone||g.items.some((item)=>Boolean(item.kakaoId)))return {label:"첫 주문 고객 · 주문 없음",cls:"bg-warn-bg text-warn-tx"}; return {label:"회원 확인 불가",cls:"bg-surface-2 text-ink-mute"}; };

  const setBankOverride=async(g:Group,accountId:string)=>{
    if(accountId.startsWith("active:"))return;
    setAssigningAccount(g.sessionKey);
    try{
      const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"set-bank-override",sessionKey:g.sessionKey,accountId})});
      const json=await res.json().catch(()=>null);
      if(!res.ok||!json?.ok){showAdminToast("장바구니 계좌 지정 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;}
      showAdminToast(accountId==="default"?"이 장바구니는 기본 계좌 규칙을 사용합니다.":"이 장바구니 주문에만 표시할 계좌를 지정했습니다.");
      await load();
    }finally{setAssigningAccount("");}
  };

  const clearSession=async(g:Group)=>{
    if (!(await showAdminConfirm(`${groupLabel(g)}님의 장바구니(${g.totalQty}개)를 비울까요?\n\n손님 화면의 담긴 상품도 함께 사라지고, 다른 고객 화면의 남은 수량이 즉시 복구됩니다. (실제 재고·주문에는 영향 없음)`))) return;
    setClearing(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"clear",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("장바구니 비우기 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast("장바구니를 비웠습니다."); await load(); } finally { setClearing(""); }
  };
  const remind=async(g:Group)=>{
    setReminding(g.sessionKey); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind",sessionKey:g.sessionKey})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("주문 확인 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(json.sent>0?`${groupLabel(g)}님께 주문 확인 알림을 보냈습니다.${kakaoResultNote(json.kakao)}`:"최근에 이미 알림을 보냈어요. 잠시 후 다시 보낼 수 있습니다."); await load(); } finally { setReminding(""); }
  };
  const remindAll=async()=>{
    if(groups.length===0)return;
    if(!(await showAdminConfirm(`현재 목록의 미제출 고객 ${groups.length}명에게 주문 확인 알림을 보낼까요?`,{title:"주문 확인 알림 보내기",confirmText:"알림 보내기"})))return;
    setReminding("__all__"); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"remind-all",sessionKeys:groups.map(g=>g.sessionKey)})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("전체 알림 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(`주문 확인 알림 ${Number(json.sent)||0}명 전송${Number(json.skipped)>0?` · 최근 발송/만료 제외 ${Number(json.skipped)}명`:""}${kakaoResultNote(json.kakao)}`); await load(); } finally { setReminding(""); }
  };

  // [2026-08-31 사장님 요청] 일괄 비우기 — 표시용 선점만 지운다(재고·주문·돈 무접촉). 손님 화면 담긴 상품도 회수.
  const clearAll=async()=>{
    if(groups.length===0)return;
    if(!(await showAdminConfirm(`목록의 장바구니 ${groups.length}개(담긴 수량 ${totalQty}개)를 전부 비울까요?\n\n손님 화면의 담긴 상품도 함께 사라집니다. (실제 재고·주문에는 영향 없음)`,{title:"장바구니 전체 비우기",confirmText:"전부 비우기"})))return;
    setClearing("__all__"); try { const res=await fetch("/api/admin-live/cart-holds",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"clear-all",sessionKeys:groups.map(g=>g.sessionKey)})}); const json=await res.json().catch(()=>null); if(!res.ok||!json?.ok){showAdminToast("전체 비우기 실패\n\n"+(json?.error?.message||`요청 실패(${res.status})`),"error");return;} showAdminToast(`장바구니 ${Number(json.cleared)||0}개를 비웠습니다.`); await load(); } finally { setClearing(""); }
  };

  const btnSub="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink hover:bg-surface-2 disabled:opacity-50 max-sm:h-11";
  const btnDanger="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-danger-tx hover:bg-surface-2 disabled:opacity-50 max-sm:h-11";
  const selectCls="h-9 min-w-0 rounded-lg border border-line bg-surface px-2 text-[13px] font-bold text-ink max-sm:h-11 max-sm:flex-1";

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 max-sm:p-0" onClick={onClose}>
    {imagePreviewUrl?<div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onClick={(e)=>{e.stopPropagation();setImagePreviewUrl("");}}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imagePreviewUrl} alt="상품 사진 크게 보기" className="max-h-[85vh] max-w-full rounded-xl object-contain"/><button type="button" onClick={(e)=>{e.stopPropagation();setImagePreviewUrl("");}} className="absolute right-4 top-4 inline-flex h-9 items-center rounded-lg bg-surface px-3 text-[13px] font-bold text-ink">닫기</button></div>:null}
    <div className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_8px_24px_rgba(0,0,0,.08)] max-sm:h-full max-sm:max-h-none max-sm:rounded-none" onClick={(e)=>e.stopPropagation()}>
      {/* 머리: 제목 + 보조 버튼 */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4 max-sm:px-4">
        <div className="min-w-0">
          <div className="text-[20px] font-bold text-ink">장바구니</div>
          <div className="mt-0.5 text-[13px] text-ink-mute">담기만 하고 주문서를 아직 안 낸 손님</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>void load()} disabled={loading} className={btnSub}>{loading?"불러오는 중":"새로고침"}</button>
          <button type="button" onClick={onClose} className={btnSub}>닫기</button>
        </div>
      </div>

      {/* 숫자 한 줄 + 범위 */}
      <div className="border-b border-line px-5 py-3 max-sm:px-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-ink-soft tabular-nums">
          <span>손님 <b className="text-[14px] font-bold text-ink">{groups.length}명</b></span>
          <span>수량 <b className="text-[14px] font-bold text-ink">{totalQty}개</b></span>
          <span>담긴 금액 <b className="text-[14px] font-bold text-ink">{won(grandKnown)}</b></span>
          {soonCount>0?<span className="font-bold text-danger-tx">30분 안에 만료 {soonCount}명</span>:null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-mute">
          {scopeAll
            ?<><span>지난 장바구니까지 전부 보는 중</span><button type="button" onClick={()=>setScopeAll(false)} className="font-bold text-ink underline underline-offset-2">지금 방송만 보기</button></>
            :scopeInfo.scope==="broadcast"
              ?<><span>지금 방송{scopeInfo.broadcastTitle?` 「${scopeInfo.broadcastTitle}」`:""} 상품만 보는 중</span><button type="button" onClick={()=>setScopeAll(true)} className="font-bold text-ink underline underline-offset-2">지난 것까지 보기</button></>
              :<span>전체 장바구니</span>}
        </div>
      </div>

      {/* 필터 한 줄 + 전체 작업(주버튼 1개) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-5 py-2.5 max-sm:px-4">
        <input type="search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="닉네임·이름·전화·상품 검색" aria-label="장바구니 검색" className="h-9 min-w-0 flex-1 basis-[200px] rounded-lg border border-line bg-surface px-3 text-[13px] text-ink max-sm:h-11 max-sm:basis-full"/>
        <select value={customerFilter} onChange={(e)=>setCustomerFilter(e.target.value as CustomerFilter)} className={selectCls} aria-label="고객 구분 필터"><option value="all">회원 전체</option><option value="first">첫 주문·주문 없음</option><option value="existing">기존회원</option><option value="unknown">확인 불가</option></select>
        <select value={sortKey} onChange={(e)=>setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="담김 목록 정렬">{SORT_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
        {groups.length>0?<div className="ml-auto flex items-center gap-2 max-sm:ml-0 max-sm:w-full">
          <button type="button" disabled={Boolean(clearing)} onClick={()=>void clearAll()} className={`${btnDanger} max-sm:flex-1`}>{clearing==="__all__"?"비우는 중":`${groups.length}명 전부 비우기`}</button>
          <button type="button" disabled={Boolean(reminding)} onClick={()=>void remindAll()} className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-ink px-3 text-[13px] font-bold text-white disabled:opacity-50 max-sm:h-11 max-sm:flex-1">{reminding==="__all__"?"보내는 중":`${groups.length}명에게 주문 확인 알림`}</button>
        </div>:null}
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-sm:px-3">
        {loading&&holds.length===0?<div className="py-12 text-center text-[13px] text-ink-mute">불러오는 중…</div>
        :groups.length===0?<div className="py-12 text-center text-[13px] text-ink-mute">{search.trim()?"검색에 맞는 장바구니가 없어요. 검색어를 지우거나 다른 이름으로 찾아 보세요.":"담기만 하고 주문서를 안 낸 손님이 없어요. 손님이 상품을 담으면 여기에 바로 나와요."}</div>
        :<div className="space-y-3">{pageGroups.map(g=>{
          const presentations=g.items.map(it=>cartHoldPresentation({productName:it.productName,fallbackProductName:it.fallbackProductName,color:it.color,size:it.size,qty:it.qty,unitPrice:it.unitPrice,legacySnapshot:it.legacySnapshot}));
          const knownTotal=presentations.reduce((s,p)=>s+(p.rowTotal??0),0); const unknown=presentations.some(p=>p.rowTotal===null);
          const tl=cartHoldTimeline({createdAtMs:g.minCreated,expiresAtMs:g.minExpires,nowMs:now});
          const remainCls=tl.level==="danger"?"text-danger-tx":tl.level==="warn"?"text-warn-tx":"text-ink-soft";
          const barCls=tl.level==="danger"?"bg-danger-tx":tl.level==="warn"?"bg-warn-tx":"bg-ink-mute";
          const meta2:string[]=[`담음 ${createdText(g.minCreated)}`,`만료 ${createdText(g.minExpires)}`];
          if(g.maxSynced>0) meta2.push(`마지막 접속 ${createdText(g.maxSynced)}`);
          const a=alerts[g.sessionKey]; if(a?.sentAt){const sent=new Date(a.sentAt).getTime(); meta2.push(`알림 ${createdText(sent)} ${a.seenAt?"봄":"안 봄"}`);}
          const member=customerStatus(g); const meta=groupMeta[g.sessionKey];
          return <section key={g.sessionKey} className="overflow-hidden rounded-xl border border-line bg-surface">
            {/* 손님 줄 */}
            <div className="border-b border-line px-4 py-3 max-sm:px-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-bold text-ink">{groupLabel(g)}</span>
                    {g.phone?<span className="text-[13px] text-ink-mute tabular-nums">{phoneFmt(g.phone)}</span>:null}
                    <span className={`rounded-full px-2 py-0.5 text-[13px] font-bold ${member.cls}`}>{member.label}</span>
                  </div>
                  <div className="mt-1 text-[13px] text-ink-mute">{meta2.join(" · ")}</div>
                </div>
                <div className="w-[96px] shrink-0 text-right">
                  <div className={`text-[13px] font-bold ${remainCls}`}>{tl.remainText}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${barCls}`} style={{width:`${Math.round(tl.progress*100)}%`}}/></div>
                </div>
              </div>
            </div>
            {/* 담은 상품 */}
            <div className="divide-y divide-line">{g.items.map((it,i)=>{const p=presentations[i]; const img=holdImages[`${String(it.productId||"").trim()}|${String(it.detailName||"").trim()}`]||""; const itExp=new Date(it.expiresAt).getTime(); const showExp=Number.isFinite(itExp)&&itExp-g.minExpires>=5*60000; return <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 max-sm:px-3">
              {img?<button type="button" title="사진 크게 보기" onClick={()=>setImagePreviewUrl(img)} className="h-12 w-12 overflow-hidden rounded-lg border border-line bg-surface-2">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt="" loading="lazy" className="h-full w-full object-cover"/></button>:<span className="h-12 w-12 rounded-lg border border-line bg-surface-2" aria-hidden="true"/>}
              <div className="min-w-0">
                <div className="break-words text-[14px] font-bold leading-5 text-ink">{p.title}</div>
                <div className="mt-0.5 text-[13px] text-ink-mute">{p.optionText||"옵션 없음"}{showExp?` · 만료 ${hhmm(itExp)}`:""}</div>
                {p.legacySnapshot?<div className="mt-0.5 text-[13px] text-warn-tx">예전 담김 기록 · 세부상품/당시 금액 없음</div>:null}
              </div>
              <div className="text-right tabular-nums">
                <div className="text-[14px] font-bold text-ink">{p.qty}개</div>
                {p.unitPrice!==null?<div className="mt-0.5 text-[13px] text-ink-soft">{p.qty>1?`${won(p.unitPrice)} × ${p.qty} = ${won(p.rowTotal||0)}`:won(p.unitPrice)}</div>:<div className="mt-0.5 text-[13px] text-ink-mute">금액 기록 없음</div>}
              </div>
            </div>})}</div>
            {/* 아래 줄: 금액 · 계좌 · 작업 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5 max-sm:px-3">
              <span className="text-[13px] text-ink-soft tabular-nums">담긴 금액 <b className="text-[14px] font-bold text-ink">{won(knownTotal)}{unknown?" + 기록 없음":""}</b></span>
              <label className="flex min-w-[220px] flex-1 items-center gap-2 text-[13px] text-ink-soft max-sm:basis-full"><span className="shrink-0">계좌</span><select aria-label={`${groupLabel(g)} 장바구니 계좌`} value={meta?.overrideAccount?`active:${meta.overrideAccount.id}`:"default"} disabled={assigningAccount===g.sessionKey} onChange={(e)=>void setBankOverride(g,e.target.value)} className={`${selectCls} flex-1`}><option value="default">기본 계좌 설정 사용</option>{meta?.overrideAccount?<option value={`active:${meta.overrideAccount.id}`}>지금 지정 · {meta.overrideAccount.bankName} {meta.overrideAccount.bankAccount} · 예금주 {meta.overrideAccount.bankHolder}</option>:null}{bankAccounts.map(account=><option key={account.id} value={account.id}>{account.label} · {account.bankName} {account.bankAccount} · 예금주 {account.bankHolder}</option>)}</select></label>
              <div className="flex items-center gap-2 max-sm:w-full">
                <button type="button" disabled={Boolean(reminding)} onClick={()=>void remind(g)} className={`${btnSub} max-sm:flex-1`}>{reminding===g.sessionKey?"보내는 중":"주문 확인 알림"}</button>
                <button type="button" disabled={clearing===g.sessionKey} onClick={()=>void clearSession(g)} className={`${btnDanger} max-sm:flex-1`}>{clearing===g.sessionKey?"비우는 중":"비우기"}</button>
              </div>
            </div>
          </section>;})}</div>}
      </div>

      {/* 페이지 넘김(주문서·상품 목록과 같은 부품) */}
      {groups.length>0?<div className="border-t border-line px-5 max-sm:px-4">
        <ProductPagination page={safePage} pageCount={pageCount} total={groups.length} start={pageStart+1} end={Math.min(groups.length,pageStart+pageSize)} size={pageSize} label="장바구니 페이지 이동" unit="명" sizes={[10,20,50]} onPage={(n)=>setPage(n)} onSize={setPageSize}/>
      </div>:null}
    </div>
  </div>;
}
