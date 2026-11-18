"use client";
import {useMemo,useState} from 'react';
import type {LiveOrder} from './types';
import type {BroadcastCalendarItem} from './BroadcastCalendarPicker';
import {selectWorkScope,type WorkScopeChoice,type WorkScopeKind} from '@/lib/adminWorkScope';

const PAID=new Set(['paid','auto_paid','manual_paid','card_paid']);
type Props={
  work:'picking'|'invoice'; allOrders:LiveOrder[];currentOrders:LiveOrder[];
  selectedOrders:LiveOrder[];broadcasts:BroadcastCalendarItem[];shopDates:BroadcastCalendarItem[];
  onConfirm:(selection:WorkScopeChoice)=>void;onClose:()=>void;
};
const clean=(s:string)=>s.trim();
export default function WorkScopePickerModal({work,allOrders,currentOrders,selectedOrders,broadcasts,shopDates,onConfirm,onClose}:Props){
  const [kind,setKind]=useState<WorkScopeKind>('current');
  const [bcIds,setBcIds]=useState<Set<string>>(new Set());
  const [shopDays,setShopDays]=useState<Set<string>>(new Set());
  const [error,setError]=useState('');
  const liveBroadcasts=useMemo(()=>broadcasts.filter(b=>b.id && selectWorkScope({kind:'broadcast',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[b],chosenBroadcastIds:[b.id]}).length>0).sort((a,b)=>b.dateKey.localeCompare(a.dateKey)),[broadcasts,allOrders]);
  const liveShopDays=useMemo(()=>shopDates.filter(d=>{
    const day=d.dateKey;return selectWorkScope({kind:'shop',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[],chosenShopDays:[day]}).length>0;
  }).sort((a,b)=>b.dateKey.localeCompare(a.dateKey)),[shopDates,allOrders]);
  const picked=useMemo(()=>selectWorkScope({kind,allOrders,currentOrders,selectedOrders,broadcasts:liveBroadcasts,
    chosenBroadcastIds:[...bcIds],chosenShopDays:[...shopDays]}),[kind,allOrders,currentOrders,selectedOrders,liveBroadcasts,bcIds,shopDays]);
  const live=picked.filter(o=>o.paymentStatus!=='canceled'&&!(work==='invoice'?o.excludeFromShipping:o.excludeFromPicking));
  const paid=live.filter(o=>PAID.has(o.paymentStatus));
  const label=kind==='current'?'현재 필터 그대로':kind==='selected'?`체크한 주문 ${selectedOrders.length}건`:
    kind==='broadcast'?liveBroadcasts.filter(b=>bcIds.has(b.id)).map(b=>b.label).join(' · '):
    [...shopDays].sort().map(d=>`${d.replace(/-/g,'.')} 쇼핑몰 주문`).join(' · ');
  const toggle=(value:string,setter:(x:Set<string>)=>void,current:Set<string>)=>{
    const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);setter(next);
  };
  const select=()=>{if(!live.length){setError('선택한 범위에 작업할 주문이 없습니다. 다른 방송 또는 날짜를 골라 주세요.');return;}
    onConfirm({kind,label:clean(label)||'선택한 범위',orders:live});};
  const labelCls='flex cursor-pointer items-center gap-2 rounded-lg border border-line p-3 text-[13px] font-semibold';
  return <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div className="flex max-h-[94vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={`${work==='invoice'?'송장 출력':'물건챙기기'} 범위 선택`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-line p-4">
        <div><h2 className="text-lg font-black text-ink">{work==='invoice'?'송장 출력':'물건챙기기'} · 범위 선택</h2><p className="mt-1 text-xs text-ink-soft">먼저 어떤 방송·날짜의 주문을 작업할지 선택해 주세요.</p></div>
        <button type="button" className="h-11 w-11 rounded-xl text-2xl text-ink-soft" aria-label="닫기" onClick={onClose}>×</button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">
        <label className={labelCls}><input type="radio" name="work-scope" checked={kind==='current'} onChange={()=>setKind('current')} className="accent-ink"/> 현재 필터 그대로 <span className="ml-auto text-ink-mute">{currentOrders.length}건</span></label>
        {selectedOrders.length>0?<label className={labelCls}><input type="radio" name="work-scope" checked={kind==='selected'} onChange={()=>setKind('selected')} className="accent-ink"/> 체크한 주문만 <span className="ml-auto text-ink-mute">{selectedOrders.length}건</span></label>:null}
        <div className="rounded-xl border border-line">
          <label className="flex cursor-pointer items-center gap-2 p-3 text-[13px] font-bold"><input type="radio" name="work-scope" checked={kind==='broadcast'} onChange={()=>setKind('broadcast')} className="accent-ink"/> 방송별 선택 <span className="ml-auto text-xs font-normal text-ink-mute">여러 방송 체크 가능</span></label>
          {kind==='broadcast'?<div className="max-h-48 space-y-1 overflow-y-auto border-t border-line p-2">{liveBroadcasts.length?liveBroadcasts.map(b=><label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-[13px] hover:bg-surface-2"><input type="checkbox" checked={bcIds.has(b.id)} onChange={()=>toggle(b.id,setBcIds,bcIds)} className="h-4 w-4 accent-ink"/><span className="min-w-0 flex-1">{b.label}</span></label>):<p className="p-3 text-xs text-ink-mute">주문이 있는 방송이 없습니다.</p>}</div>:null}
        </div>
        <div className="rounded-xl border border-line">
          <label className="flex cursor-pointer items-center gap-2 p-3 text-[13px] font-bold"><input type="radio" name="work-scope" checked={kind==='shop'} onChange={()=>setKind('shop')} className="accent-ink"/> 쇼핑몰 날짜별 선택 <span className="ml-auto text-xs font-normal text-ink-mute">여러 날짜 체크 가능</span></label>
          {kind==='shop'?<div className="max-h-48 space-y-1 overflow-y-auto border-t border-line p-2">{liveShopDays.length?liveShopDays.map(d=><label key={d.dateKey} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-[13px] hover:bg-surface-2"><input type="checkbox" checked={shopDays.has(d.dateKey)} onChange={()=>toggle(d.dateKey,setShopDays,shopDays)} className="h-4 w-4 accent-ink"/><span className="min-w-0 flex-1">{d.label}</span></label>):<p className="p-3 text-xs text-ink-mute">쇼핑몰 주문이 있는 날짜가 없습니다.</p>}</div>:null}
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3 text-sm text-ink" aria-live="polite">
          <div className="flex justify-between font-bold"><span>선택한 작업 범위</span><span>{live.length}건</span></div>
          <div className="mt-1 flex justify-between text-xs text-ink-soft"><span>결제완료 {paid.length}건</span><span>미결제·확인대기 {live.length-paid.length}건</span></div>
        </div>
        {error?<p role="alert" className="text-xs font-semibold text-danger-tx">{error}</p>:null}
      </div>
      <div className="flex gap-2 border-t border-line p-4"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-line font-bold text-ink">취소</button><button type="button" onClick={select} disabled={!live.length} className="h-11 flex-[2] rounded-xl bg-ink font-bold text-white disabled:opacity-40">{work==='invoice'?'선택 완료 · 송장 옵션 보기':'선택 완료 · 물건챙기기 열기'}</button></div>
    </div>
  </div>;
}
