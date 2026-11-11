"use client";
import { useEffect, useState } from "react";
import type { BroadcastVideoHistoryItem } from "@/lib/broadcastVideoHistory";
const dateLabel = (date: string) => new Date(date).toLocaleDateString("sv-SE", {timeZone:"Asia/Seoul"});

export default function BroadcastVideoHistoryPicker({disabled, selectedVideoId, onSelect}: {disabled: boolean; selectedVideoId: string; onSelect: (url: string) => void}) {
  const [open,setOpen] = useState(false);
  const [items,setItems] = useState<BroadcastVideoHistoryItem[] | null>(null);
  const [error,setError] = useState(false);
  const [query,setQuery] = useState("");
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if (!open) return;
    const controller = new AbortController();
    let alive = true;
    setError(false);setItems(null);
    const timer = setTimeout(()=>controller.abort(),10000);
    void fetch("/api/admin-live/video-history",{cache:"no-store",signal:controller.signal}).then(async r=>{
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (!Array.isArray(data.items)) throw new Error();
      if (alive) setItems(data.items);
    }).catch(()=>{if(alive)setError(true);}).finally(()=>clearTimeout(timer));
    return ()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[open,retry]);
  const found = (items ?? []).filter(item=>`${item.title} ${dateLabel(item.date)} ${item.videoId}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="min-w-0">
    <button type="button" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="min-h-10 rounded-lg border border-line px-3 text-[13px] font-bold text-ink disabled:opacity-40">지난 영상 {open ? "접기" : "선택"}</button>
    {open ? <div className="mt-2 rounded-xl border border-line bg-surface p-3">
      <p className="text-[13px] font-bold text-ink">영상을 다시 연결하면 저장한 상품 소개도 돌아와요.</p>
      <p className="mt-1 text-[12px] text-ink-mute">유튜브에서 일부공개로 바꾼 뒤 선택해 주세요. 현재 판매 중인 상품만 연결돼요.</p>
      <input aria-label="지난 영상 날짜·제목 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="날짜·방송명 검색 (예: 11-01)" className="my-3 h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink" />
      {error ? <div role="alert" className="text-[13px] text-danger-tx">영상을 불러오지 못했어요. <button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-10 underline">다시 불러오기</button></div>
        : !items ? <p role="status" className="py-3 text-[13px] text-ink-mute">지난 영상 불러오는 중…</p>
        : !found.length ? <p className="py-3 text-[13px] text-ink-mute">{query ? "검색 결과가 없어요." : "저장된 영상이 없어요. 위에 영상 주소를 직접 넣어 주세요."}</p>
        : <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-contain">
          {found.map(item=><li key={item.videoId} className="flex items-center gap-3 rounded-lg bg-surface-2 p-2">
            {/* YouTube thumbnails are remote; no image proxy or video playback is needed here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${item.videoId}/default.jpg`} alt="" width={80} height={60} loading="lazy" className="h-14 w-20 shrink-0 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-ink-mute">{dateLabel(item.date)} · 저장된 상품 연결 {item.introCount}개</div>
              <div className="line-clamp-2 break-words text-[13px] font-bold text-ink">{item.title}</div>
              <button type="button" disabled={disabled || item.videoId===selectedVideoId} onClick={()=>{onSelect(`https://www.youtube.com/watch?v=${item.videoId}`);setOpen(false);}} className="mt-1 min-h-10 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink disabled:opacity-50">{item.videoId===selectedVideoId ? "선택된 영상" : "이 영상 선택"}</button>
            </div>
          </li>)}
        </ul>}
    </div> : null}
  </div>;
}
