"use client";
import {useMemo,useState} from 'react';
import type {LiveOrder} from './types';
import type {BroadcastCalendarItem} from './BroadcastCalendarPicker';
import {selectWorkScope,type WorkScopeChoice,type WorkScopeKind} from '@/lib/adminWorkScope';
import {
  summarizeWorkScope,eligibleWorkScopeOrders,scopeCountLabel,chosenPickingVisibleCount,
  type PickingPaymentView,type WorkScopeSummary
} from '@/lib/adminWorkScopeSummary';

type Props={
  work:'picking'|'invoice';currentLabel?:string;allOrders:LiveOrder[];currentOrders:LiveOrder[];
  selectedOrders:LiveOrder[];broadcasts:BroadcastCalendarItem[];shopDates:BroadcastCalendarItem[];
  onConfirm:(selection:WorkScopeChoice)=>void;onClose:()=>void;
};
export default function WorkScopePickerModal({work,currentLabel,allOrders,currentOrders,selectedOrders,broadcasts,shopDates,onConfirm,onClose}:Props){
  const [kind,setKind]=useState<WorkScopeKind>('current');
  const [bcIds,setBcIds]=useState<Set<string>>(new Set());
  const [shopDays,setShopDays]=useState<Set<string>>(new Set());
  const [paymentView,setPaymentView]=useState<PickingPaymentView>('all');
  const [error,setError]=useState('');
  const liveBroadcasts=useMemo(()=>broadcasts.filter(b=>b.id && selectWorkScope({
    kind:'broadcast',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[b],chosenBroadcastIds:[b.id]
  }).length>0).sort((a,b)=>b.dateKey.localeCompare(a.dateKey)),[broadcasts,allOrders]);
  const liveShopDays=useMemo(()=>shopDates.filter(d=>selectWorkScope({
    kind:'shop',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[],chosenShopDays:[d.dateKey]
  }).length>0).sort((a,b)=>b.dateKey.localeCompare(a.dateKey)),[shopDates,allOrders]);
  const picked=useMemo(()=>selectWorkScope({kind,allOrders,currentOrders,selectedOrders,broadcasts:liveBroadcasts,
    chosenBroadcastIds:[...bcIds],chosenShopDays:[...shopDays]
  }),[kind,allOrders,currentOrders,selectedOrders,liveBroadcasts,bcIds,shopDays]);
  const summary=useMemo(()=>summarizeWorkScope(picked,work),[picked,work]);
  const eligible=useMemo(()=>eligibleWorkScopeOrders(picked,work),[picked,work]);
  const currentSummary=useMemo(()=>summarizeWorkScope(currentOrders,work),[currentOrders,work]);
  const checkedSummary=useMemo(()=>summarizeWorkScope(selectedOrders,work),[selectedOrders,work]);
  const broadcastSummary=useMemo(()=>liveBroadcasts.map(b=>({id:b.id,...summarizeWorkScope(selectWorkScope({
    kind:'broadcast',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[b],chosenBroadcastIds:[b.id]
  }),work)})),[liveBroadcasts,allOrders,work]);
  const broadcastStats=new Map(broadcastSummary.map(s=>[s.id,s]));
  const shopSummary=useMemo(()=>liveShopDays.map(d=>({dateKey:d.dateKey,...summarizeWorkScope(selectWorkScope({
    kind:'shop',allOrders,currentOrders:[],selectedOrders:[],broadcasts:[],chosenShopDays:[d.dateKey]
  }),work)})),[liveShopDays,allOrders,work]);
  const shopStats=new Map(shopSummary.map(s=>[s.dateKey,s]));
  const label=kind==='current'?'현재 필터 그대로':kind==='selected'?`체크한 주문 ${selectedOrders.length}건`:
    kind==='broadcast'?liveBroadcasts.filter(b=>bcIds.has(b.id)).map(b=>b.label).join(' · '):
    [...shopDays].sort().map(d=>`${d.replace(/-/g,'.')} 쇼핑몰 주문`).join(' · ');
  const setScope=(next:WorkScopeKind)=>{setKind(next);setError('');};
  const toggle=(value:string,setter:(x:Set<string>)=>void,current:Set<string>)=>{
    const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);setter(next);setError('');
  };
  const visibleCount=work==='picking'?chosenPickingVisibleCount(summary,paymentView):summary.eligible;
  const select=()=>{
    if(!visibleCount){setError(work==='picking'&&paymentView==='paid'&&summary.unpaid>0
      ?'결제완료 주문이 없어요. 미결제 포함으로 변경하면 확인할 수 있어요.'
      :'선택한 범위에 작업할 주문이 없습니다. 방송이나 날짜를 다시 선택해 주세요.');return;}
    // Keep both paid and unpaid in the data, even in paid-only display mode:
    // the existing picker must still allow "미결제 보기" without reloading.
    onConfirm({kind,label:label.trim()||'선택한 범위',orders:eligible,includeUnpaid:paymentView==='all'});
  };
  const labelCls='flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-[13px] font-semibold';
  const stat=(s:WorkScopeSummary)=>scopeCountLabel(s);
  return <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div className="flex max-h-[94vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl"
      role="dialog" aria-modal="true" aria-label={`${work==='invoice'?'송장 출력':'물건챙기기'} 범위 선택`}
      onClick={(e:{stopPropagation:()=>void})=>e.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <div><h2 className="text-lg font-black text-ink">{work==='invoice'?'송장 출력':'물건챙기기'} · 범위 선택</h2>
          <p className="mt-1 text-xs text-ink-soft">방송·날짜를 고른 뒤, 취소를 제외한 주문서 수를 확인하세요.</p></div>
        <button type="button" className="h-11 w-11 shrink-0 rounded-xl text-2xl text-ink-soft" aria-label="닫기" onClick={onClose}>×</button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">
        <label className={labelCls}><input type="radio" name="work-scope" checked={kind==='current'} onChange={()=>setScope('current')} className="h-4 w-4 accent-ink"/>
          <span className="min-w-0 flex-1">현재 필터 그대로{currentLabel?<span className="mt-1 block break-words text-[11px] font-normal text-ink-mute">{currentLabel}</span>:null}</span><span className="shrink-0 text-right text-[12px] text-ink-soft">{stat(currentSummary)}</span></label>
        {selectedOrders.length>0?<label className={labelCls}><input type="radio" name="work-scope" checked={kind==='selected'} onChange={()=>setScope('selected')} className="h-4 w-4 accent-ink"/>
          <span className="min-w-0 flex-1">체크한 주문만</span><span className="shrink-0 text-right text-[12px] text-ink-soft">{stat(checkedSummary)}</span></label>:null}
        <div className="rounded-xl border border-line">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-3 text-[13px] font-bold"><input type="radio" name="work-scope" checked={kind==='broadcast'} onChange={()=>setScope('broadcast')} className="h-4 w-4 accent-ink"/>
            <span>방송별 선택</span><span className="ml-auto text-xs font-normal text-ink-mute">여러 방송 체크 가능</span></label>
          {kind==='broadcast'?<div className="max-h-48 space-y-1 overflow-y-auto border-t border-line p-2">{liveBroadcasts.length?liveBroadcasts.map(b=>
            <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] hover:bg-surface-2">
              <input type="checkbox" checked={bcIds.has(b.id)} onChange={()=>toggle(b.id,setBcIds,bcIds)} className="h-4 w-4 shrink-0 accent-ink"/>
              <span className="min-w-0 flex-1 break-words font-semibold">{b.label}</span>
              <span className="shrink-0 text-[11px] text-ink-soft">{stat(broadcastStats.get(b.id)!)}</span>
            </label>):<p className="p-3 text-xs text-ink-mute">주문이 있는 방송이 없습니다.</p>}</div>:null}
        </div>
        <div className="rounded-xl border border-line">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-3 text-[13px] font-bold"><input type="radio" name="work-scope" checked={kind==='shop'} onChange={()=>setScope('shop')} className="h-4 w-4 accent-ink"/>
            <span>쇼핑몰 날짜별 선택</span><span className="ml-auto text-xs font-normal text-ink-mute">여러 날짜 체크 가능</span></label>
          {kind==='shop'?<div className="max-h-48 space-y-1 overflow-y-auto border-t border-line p-2">{liveShopDays.length?liveShopDays.map(d=>
            <label key={d.dateKey} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] hover:bg-surface-2">
              <input type="checkbox" checked={shopDays.has(d.dateKey)} onChange={()=>toggle(d.dateKey,setShopDays,shopDays)} className="h-4 w-4 shrink-0 accent-ink"/>
              <span className="min-w-0 flex-1 break-words font-semibold">{d.label}</span>
              <span className="shrink-0 text-[11px] text-ink-soft">{stat(shopStats.get(d.dateKey)!)}</span>
            </label>):<p className="p-3 text-xs text-ink-mute">쇼핑몰 주문이 있는 날짜가 없습니다.</p>}</div>:null}
        </div>
        <section className="rounded-xl border border-line bg-surface-2/40 p-3" aria-label="실제 작업할 주문서 수" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-sm font-black text-ink">
            <span>{work==='picking'?'챙길 주문서':'송장 출력할 주문서'}</span>
            <strong className="text-[23px] tabular-nums">{summary.eligible}건</strong>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
            <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-ink-soft">결제완료</span><strong className="text-base text-ink tabular-nums">{summary.paid}건</strong></div>
            <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-ink-soft">미결제·확인대기</span><strong className="text-base text-ink tabular-nums">{summary.unpaid}건</strong></div>
          </div>
          {(summary.canceled>0||summary.excluded>0)?<p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
            제외: {summary.canceled>0?`주문취소 ${summary.canceled}건`:''}{summary.canceled>0&&summary.excluded>0?' · ':''}{summary.excluded>0?`기타 제외 ${summary.excluded}건`:''} — 위 주문서 수에는 포함하지 않습니다.
          </p>:null}
        </section>
        {work==='picking'?<section className="rounded-xl border border-line p-3" aria-label="물건챙기기 결제 상태 표시">
          <p className="mb-2 text-[13px] font-bold text-ink">물건챙기기 표시 방식</p>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 text-[12px] ${paymentView==='paid'?'border-ink bg-surface-2':'border-line'}`}>
              <span className="flex items-center gap-2 font-bold"><input type="radio" name="picking-payment-view" checked={paymentView==='paid'} onChange={()=>{setPaymentView('paid');setError('')}} className="accent-ink"/> 결제완료만 보기</span>
              <span className="pl-6 text-ink-soft">{summary.paid}건</span>
            </label>
            <label className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 text-[12px] ${paymentView==='all'?'border-ink bg-surface-2':'border-line'}`}>
              <span className="flex items-center gap-2 font-bold"><input type="radio" name="picking-payment-view" checked={paymentView==='all'} onChange={()=>{setPaymentView('all');setError('')}} className="accent-ink"/> 미결제 포함 보기</span>
              <span className="pl-6 text-ink-soft">{summary.eligible}건 (완료 {summary.paid} + 미결제 {summary.unpaid})</span>
            </label>
          </div>
          <p className="mt-2 text-[11px] text-ink-mute">물건챙기기 화면 안에서도 미결제를 다시 보거나 숨길 수 있어요. 미결제 주문도 데이터에서 빼지 않습니다.</p>
        </section>:<p className="text-[12px] text-ink-soft">다음 단계에서 ‘결제완료만 출력’ 또는 ‘미결제 포함 전체’를 선택할 수 있어요.</p>}
        {error?<p role="alert" className="text-xs font-semibold text-danger-tx">{error}</p>:null}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line p-4">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-line font-bold text-ink">취소</button>
        <button type="button" onClick={select} disabled={!visibleCount} className="h-11 flex-[2] rounded-xl bg-ink font-bold text-white disabled:opacity-40">
          {work==='invoice'?'선택 완료 · 송장 옵션 보기':`선택 완료 · ${visibleCount}건 보기`}
        </button>
      </div>
    </div>
  </div>;
}
