"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { BotCandidate } from "@/lib/liveChatBot";
import type { ProductIntro, ProductIntroCapture } from "@/lib/productIntro";
import { searchChatProductGroups, CHAT_PRODUCT_LIMIT } from "@/lib/liveChatProductCommand";
import { widgetTargetKey } from "@/lib/widgetProductLibrary";
import { chatIdentityHeaders, verifyChatAccount } from "@/lib/useLiveChatPrivate";
import { invalidateProductIntroCatalog } from "@/lib/productIntroCatalogClient";
import { ChatProductThumb } from "./ChatProductThumb";

type Item = BotCandidate & { intro: ProductIntro | null };
type Catalog = { videoId: string; widgetAvailable: boolean; items: Item[] };
const timeText = (seconds: number) => `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분 ${seconds % 60}초`;
const button: CSSProperties = { minHeight: 44, border: "1px solid #d5d5d5", borderRadius: 10, padding: "9px 12px", font: "inherit", fontSize: 14, fontWeight: 700, color: "#111", background: "#fff", cursor: "pointer" };
export function ProductIntroManager({ broadcastId, initialQuery = "", capture, onClose }: {
  broadcastId: string; initialQuery?: string; capture?: () => Promise<ProductIntroCapture | null>; onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [chosen, setChosen] = useState<string[]>([]);
  const [mode, setMode] = useState<"player" | "manual">(capture ? "player" : "manual");
  const [time, setTime] = useState(["", "", ""]);
  const [status, setStatus] = useState("상품을 불러오는 중…");
  const [error, setError] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true), saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setChosen([]); setStatus("상품을 불러오는 중…"); setError(false);
    void fetch(`/api/live-chat/product-intro/manage?${new URLSearchParams({ bc: broadcastId })}`, { headers: chatIdentityHeaders(), cache: "no-store", signal: controller.signal })
      .then(async response => { const j = await response.json(); if (!controller.signal.aborted) setNeedsAuth(response.status === 403); if (!j.ok) throw Error(j.message); return j as Catalog; })
      .then(j => { if (!controller.signal.aborted) { setCatalog(j); setStatus(""); } })
      .catch(e => { if (!controller.signal.aborted) { setStatus(e.message || "상품을 불러오지 못했어요."); setError(true); } });
    return () => controller.abort();
  }, [broadcastId, attempt]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving.current) { e.preventDefault(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  useEffect(() => {
    const message = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "ruru-chat-verified") setAttempt(v => v + 1); };
    const storage = (e: StorageEvent) => { if (e.key === "ruru_chat_identity") setAttempt(v => v + 1); };
    window.addEventListener("message", message); window.addEventListener("storage", storage);
    return () => { window.removeEventListener("message", message); window.removeEventListener("storage", storage); };
  }, []);
  const selected = catalog?.items.filter(p => chosen.includes(widgetTargetKey(p))) ?? [];
  const filtered = searchChatProductGroups(query, catalog?.items ?? []).flatMap(g => g.items);
  const items = [...new Map(filtered.map(p => [widgetTargetKey(p), p as Item])).values()];
  const existing = selected.filter(p => p.intro).length;
  const seconds = Number(time[0] || 0) * 3600 + Number(time[1] || 0) * 60 + Number(time[2] || 0);
  const validTime = time.some(v => v !== "") && time.every(v => /^\d{0,3}$/.test(v)) && Number(time[1]) < 60 && Number(time[2]) < 60 && seconds <= 172800;
  const canSave = !!catalog?.videoId && selected.length > 0 && !busy && (mode === "player" || validTime);
  const canRotate = !!catalog?.widgetAvailable && selected.length > 0 && !busy && !selected.some(p => p.soldOut);
  function toggle(p: Item) {
    const key = widgetTargetKey(p);
    setChosen(prev => prev.includes(key) ? prev.filter(k => k !== key) : prev.length < CHAT_PRODUCT_LIMIT ? [...prev, key] : prev);
  }
  async function apply(action: "register" | "change" | "rotate" | "append") {
    if (!catalog || saving.current || !selected.length) return;
    if (action === "change" && !window.confirm(`선택한 상품 ${selected.length}개의 소개영상 위치를 변경할까요? 기존 연결 위치가 바뀝니다.`)) return;
    saving.current = true; setBusy(true); setStatus(""); setError(false);
    try {
      const introAction = action === "register" || action === "change";
      // Event handler only: timestamp records the explicit save click, never render time.
      // eslint-disable-next-line react-hooks/purity
      const point = introAction ? mode === "player" ? await capture?.() : { videoId: catalog.videoId, seconds, capturedAt: Date.now() } : null;
      if (!alive.current) return;
      if (introAction && (!point || (mode === "manual" && !validTime))) throw Error("영상 위치를 확인하지 못했어요. 시·분·초를 직접 입력해 주세요.");
      const r = await fetch("/api/live-chat/product-intro/manage", { method: "POST", headers: { "Content-Type": "application/json", ...chatIdentityHeaders() }, body: JSON.stringify({ bc: broadcastId, videoId: catalog.videoId, targets: selected.map(({productId, detailName}) => ({productId, detailName})), action, capture: point }) });
      const j = await r.json();
      if (alive.current && r.status === 403) setNeedsAuth(true);
      if (!j.ok) throw Error(j.message || "저장하지 못했어요.");
      if (!alive.current) return;
      setStatus(j.message);
      if (introAction) {
        invalidateProductIntroCatalog(broadcastId, catalog.videoId);
        // Refresh actual stored records; a different admin may have registered first.
        const fresh = await fetch(`/api/live-chat/product-intro/manage?${new URLSearchParams({bc: broadcastId})}`, {headers: chatIdentityHeaders(), cache: "no-store"}).then(r => r.json());
        if (alive.current && fresh.ok) setCatalog(fresh);
      }
    } catch (e) { if (alive.current) { setError(true); setStatus(e instanceof Error ? e.message : "저장하지 못했어요."); } }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  return createPortal(<div onClick={() => { if (!busy) onClose(); }} style={{position:"fixed",inset:0,zIndex:2147483646,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:10}}>
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="상품 소개영상 · 위젯 관리" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"calc(100dvh - 20px)",display:"flex",flexDirection:"column",background:"#fff",color:"#111",borderRadius:16,fontFamily:"inherit",overflow:"hidden",outline:"none"}}>
      <header style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px 10px 16px",flexShrink:0,borderBottom:"1px solid #eee"}}><strong style={{flex:1,fontSize:17}}>상품 소개영상 · 위젯</strong><button style={button} disabled={busy} onClick={onClose} aria-label="상품 관리 닫기">✕</button></header>
      <div data-live-scroll="1" style={{overflowY:"auto",overscrollBehavior:"contain",minHeight:0,padding:14,paddingBottom:"calc(14px + env(safe-area-inset-bottom))"}}>
        <input aria-label="소개할 상품 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="상품명·번호 검색" style={{width:"100%",boxSizing:"border-box",minHeight:44,padding:"8px 12px",border:"1px solid #ccc",borderRadius:10,fontSize:16,color:"#111",background:"#fff"}} />
        <p style={{fontSize:12,color:"#666",margin:"8px 0"}}>상품 선택 {selected.length}/{CHAT_PRODUCT_LIMIT} · 여러 개 선택 가능</p>
        {selected.length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{selected.map(p=><button key={widgetTargetKey(p)} disabled={busy} onClick={()=>toggle(p)} style={{...button,fontSize:12,padding:"4px 8px"}}>{p.texts[0]} ×</button>)}</div>}
        <div data-live-scroll="1" style={{maxHeight:"26dvh",minHeight:70,overflowY:"auto",overscrollBehavior:"contain",border:"1px solid #ddd",borderRadius:10}}>
          {items.map(p=><button key={widgetTargetKey(p)} type="button" aria-pressed={chosen.includes(widgetTargetKey(p))} disabled={busy || (!chosen.includes(widgetTargetKey(p)) && chosen.length >= CHAT_PRODUCT_LIMIT)} onClick={()=>toggle(p)} style={{width:"100%",minHeight:64,display:"flex",alignItems:"center",gap:9,textAlign:"left",padding:8,border:0,borderBottom:"1px solid #eee",background:chosen.includes(widgetTargetKey(p))?"#fff1f6":"#fff",color:"#111",font:"inherit"}}>
            <span aria-hidden="true" style={{fontSize:20}}>{chosen.includes(widgetTargetKey(p))?"☑":"☐"}</span><ChatProductThumb src={p.imageUrl} name={p.texts[0]} size={42} placeholder /><span style={{minWidth:0,overflowWrap:"anywhere",fontSize:14}}><strong>{p.texts[0]}</strong>{p.soldOut && " · 품절"}<small style={{display:"block",fontSize:12,color:"#666",marginTop:3}}>{p.intro ? `소개영상 ${timeText(p.intro.seconds)}` : "소개영상 미등록"}</small></span>
          </button>)}
          {catalog && !items.length && <p style={{padding:12}}>찾는 상품이 없어요.</p>}
        </div>
        <section style={{marginTop:14}} aria-label="소개영상 위치">
          <strong style={{fontSize:14}}>소개영상 위치</strong>
          {catalog && !catalog.videoId && <p style={{fontSize:12,color:"#b42318"}}>이 방송에 유튜브 영상을 먼저 연결해 주세요.</p>}
          {capture && <div style={{display:"flex",gap:6,marginTop:8}}>{([['player','현재 재생 위치'],['manual','시간 직접 입력']] as const).map(([key,label])=><button key={key} disabled={busy} aria-pressed={mode===key} onClick={()=>setMode(key)} style={{...button,flex:1,background:mode===key?"#111":"#fff",color:mode===key?"#fff":"#111"}}>{label}</button>)}</div>}
          {mode === "manual" ? <div style={{display:"flex",gap:8,marginTop:8}}>{["시","분","초"].map((label,i)=><label key={label} style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:0}}><input aria-label={`소개영상 ${label}`} inputMode="numeric" disabled={busy} value={time[i]} placeholder="0" onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v))setTime(prev=>prev.map((s,n)=>n===i?v:s));}} style={{width:"100%",minWidth:0,minHeight:44,boxSizing:"border-box",border:"1px solid #ccc",borderRadius:8,padding:8,fontSize:16,color:"#111",background:"#fff"}}/>{label}</label>)}</div> : <p style={{fontSize:12,color:"#666",margin:"8px 0"}}>등록을 누르는 순간의 영상 위치보다 5초 앞부터 연결해요.</p>}
          <p style={{fontSize:12,color:"#666",margin:"8px 0"}}>등록된 소개 위치는 유지돼요. 바꿀 때만 ‘위치 변경’을 누르세요.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <button disabled={!canSave} onClick={()=>void apply("register")} style={{...button,flex:"1 1 150px",background:canSave?"#111":"#eee",color:canSave?"#fff":"#888"}}>소개영상 등록</button>
            {existing > 0 && <button disabled={!canSave} onClick={()=>void apply("change")} style={{...button,flex:"1 1 150px",color:canSave?"#111":"#888",background:canSave?"#fff":"#eee"}}>소개영상 위치 변경</button>}
          </div>
        </section>
        <section style={{marginTop:16,paddingTop:12,borderTop:"1px solid #ddd"}} aria-label="위젯 고정과 순환">
          <strong style={{fontSize:14}}>상품 위젯</strong>
          <p style={{fontSize:12,color:"#666",margin:"6px 0 8px"}}>1개는 고정 · 여러 개는 순환해요. 소개영상 위치는 바뀌지 않아요.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}><button disabled={!canRotate} onClick={()=>void apply("rotate")} style={{...button,flex:"1 1 150px",color:canRotate?"#111":"#888",background:canRotate?"#fff":"#eee"}}>{selected.length <= 1 ? "선택 상품 고정" : `선택 ${selected.length}개 순환`}</button><button disabled={!canRotate} onClick={()=>void apply("append")} style={{...button,flex:"1 1 150px",color:canRotate?"#111":"#888",background:canRotate?"#fff":"#eee"}}>기존 순환에 추가</button></div>
          {catalog && !catalog.widgetAvailable && <p style={{fontSize:12,color:"#666"}}>방송과 상품 위젯을 켜면 사용할 수 있어요.</p>}
        </section>
        {(status || busy) && <p role="status" style={{padding:10,borderRadius:8,background:error?"#fff0f0":"#f2f6f3",color:error?"#b42318":"#18572d",fontSize:13,overflowWrap:"anywhere"}}>{busy?"저장 중…":status}</p>}
        {needsAuth && <button style={{...button,width:"100%"}} onClick={() => { verifyChatAccount(); setStatus("카카오 확인을 마치면 상품목록을 다시 불러와요."); }}>카카오로 관리자 확인</button>}
        {error && !catalog && <button style={button} onClick={()=>setAttempt(v=>v+1)}>다시 불러오기</button>}
      </div>
    </div>
  </div>, document.body);
}
