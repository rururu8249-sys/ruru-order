"use client";

import { useMemo, useState } from 'react';
import type { LiveOrder } from './types';
import type { BroadcastCalendarItem } from './BroadcastCalendarPicker';
import { buildPickRows } from './LivePickingPanel';
import { selectWorkScope, type WorkScopeChoice, type WorkScopeKind } from '@/lib/adminWorkScope';
import {
  summarizeWorkScope, eligibleWorkScopeOrders,
  type PickingPaymentView, type WorkKind,
} from '@/lib/adminWorkScopeSummary';

type Props = {
  work: 'picking' | 'invoice';
  currentLabel?: string;
  allOrders: LiveOrder[];
  currentOrders: LiveOrder[];
  selectedOrders: LiveOrder[];
  broadcasts: BroadcastCalendarItem[];
  shopDates: BroadcastCalendarItem[];
  onConfirm: (selection: WorkScopeChoice) => void;
  onClose: () => void;
};

type ProductCounts = { total: number; paid: number; unpaid: number };

// The picker and the actual packing screen use the SAME item row constructor.
// Canceled/excluded orders, transferred-away items and refund/return-struck
// items must not inflate the number of pieces the seller will handle.
function countPickingItems(orders: readonly LiveOrder[]): ProductCounts {
  const rows = buildPickRows(orders, 'scope').rows.filter((row) => !row.skip);
  const paid = rows.filter((row) => row.paid).reduce((n, row) => n + row.qty, 0);
  const unpaid = rows.filter((row) => !row.paid).reduce((n, row) => n + row.qty, 0);
  return { total: paid + unpaid, paid, unpaid };
}

function availableQty(orders: readonly LiveOrder[], work: WorkKind): number {
  const eligible = eligibleWorkScopeOrders(orders, work);
  return work === 'picking'
    ? countPickingItems(eligible).total
    : summarizeWorkScope(eligible, work).eligible;
}

export default function WorkScopePickerModal({
  work, currentLabel, allOrders, currentOrders, selectedOrders,
  broadcasts, shopDates, onConfirm, onClose,
}: Props) {
  // 처음 고를 범위: 체크한 주문 → 지금 필터 → (지금 필터가 0개면) 가장 최근 방송.
  // 「전체보기」에선 현재 필터가 0개라 빈 범위로 열리던 것을 막는다(고르는 기본값만, 계산 무변경).
  const [initialScope] = useState<{ kind: WorkScopeKind; bc: string[] }>(() => {
    if (selectedOrders.length && availableQty(selectedOrders, work) > 0) return { kind: 'selected', bc: [] };
    if (availableQty(currentOrders, work) > 0) return { kind: 'current', bc: [] };
    const latest = [...broadcasts].filter((b) => b.id).sort((a, b) => b.dateKey.localeCompare(a.dateKey)).find((b) =>
      availableQty(selectWorkScope({kind:'broadcast', allOrders, currentOrders:[], selectedOrders:[], broadcasts:[b], chosenBroadcastIds:[b.id]}), work) > 0);
    return latest ? { kind: 'broadcast', bc: [latest.id] } : { kind: 'current', bc: [] };
  });
  const [kind, setKind] = useState<WorkScopeKind>(initialScope.kind);
  const [bcIds, setBcIds] = useState<Set<string>>(() => new Set(initialScope.bc));
  const [shopDays, setShopDays] = useState<Set<string>>(new Set());
  const [paymentView, setPaymentView] = useState<PickingPaymentView>('all');
  const [error, setError] = useState('');

  const broadcastChoices = useMemo(() => broadcasts.map((b) => {
    const orders = selectWorkScope({kind:'broadcast', allOrders, currentOrders:[], selectedOrders:[], broadcasts:[b], chosenBroadcastIds:[b.id]});
    return { ...b, quantity: availableQty(orders, work) };
  }).filter((b) => b.id && b.quantity > 0).sort((a, b) => b.dateKey.localeCompare(a.dateKey)), [broadcasts, allOrders, work]);

  const shopChoices = useMemo(() => shopDates.map((d) => {
    const orders = selectWorkScope({kind:'shop', allOrders, currentOrders:[], selectedOrders:[], broadcasts:[], chosenShopDays:[d.dateKey]});
    return { ...d, quantity: availableQty(orders, work) };
  }).filter((d) => d.quantity > 0).sort((a, b) => b.dateKey.localeCompare(a.dateKey)), [shopDates, allOrders, work]);

  const picked = useMemo(() => selectWorkScope({
    kind, allOrders, currentOrders, selectedOrders, broadcasts: broadcastChoices,
    chosenBroadcastIds: [...bcIds], chosenShopDays: [...shopDays],
  }), [kind, allOrders, currentOrders, selectedOrders, broadcastChoices, bcIds, shopDays]);

  const summary = useMemo(() => summarizeWorkScope(picked, work), [picked, work]);
  const eligible = useMemo(() => eligibleWorkScopeOrders(picked, work), [picked, work]);
  const quantity = useMemo(() => countPickingItems(eligible), [eligible]);
  const currentQty = useMemo(() => availableQty(currentOrders, work), [currentOrders, work]);
  const selectedQty = useMemo(() => availableQty(selectedOrders, work), [selectedOrders, work]);
  const visibleCount = work === 'picking'
    ? (paymentView === 'paid' ? quantity.paid : quantity.total)
    : summary.eligible;

  const label = kind === 'current' ? '현재 필터 그대로'
    : kind === 'selected' ? `체크한 주문 ${selectedOrders.length}건`
    : kind === 'broadcast' ? broadcastChoices.filter((b) => bcIds.has(b.id)).map((b) => b.label).join(' · ')
    : [...shopDays].sort().map((d) => `${d.replace(/-/g,'.')} 쇼핑몰 주문`).join(' · ');

  const changeKind = (next: WorkScopeKind) => { setKind(next); setError(''); };
  const toggle = (value: string, values: Set<string>, setter: (next:Set<string>)=>void) => {
    const next = new Set(values);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
    setError('');
  };

  const confirm = () => {
    if (visibleCount <= 0) {
      setError(work === 'picking' && paymentView === 'paid' && quantity.unpaid > 0
        ? '결제완료 상품이 없어요. 미결제 포함 보기로 바꾸거나 다른 범위를 선택하세요.'
        : '선택한 범위에 챙길 상품이 없어요. 다른 방송이나 날짜를 골라 주세요.');
      return;
    }
    // Keep unpaid orders available for the picking panel's in-place toggle.
    // Only the initial visibility changes; order/payment records are untouched.
    onConfirm({kind, label:label.trim() || '선택한 범위', orders:eligible,
      includeUnpaid:paymentView === 'all', canceledCount:summary.canceled});
  };

  const choices: { id:WorkScopeKind; name:string; count?:number }[] = [
    {id:'current', name:'현재 필터', count:currentQty},
    ...(selectedOrders.length ? [{id:'selected' as const, name:'체크한 주문', count:selectedQty}] : []),
    {id:'broadcast', name:'방송별 선택'},
    {id:'shop', name:'쇼핑몰 날짜별'},
  ];
  const unit = work === 'picking' ? '개' : '건';

  return <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={`${work==='invoice'?'송장 출력':'물건챙기기'} 범위 선택`}
      className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl"
      onClick={(e:{stopPropagation:()=>void})=>e.stopPropagation()}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[16px] font-black text-ink">{work==='picking'?'물건챙기기':'송장 출력'} <span className="font-semibold text-ink-soft">· 범위 선택</span></h2>
        <button type="button" aria-label="닫기" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl text-ink-soft hover:bg-surface-2">×</button>
      </header>

      <div className="min-h-0 overflow-y-auto px-4 py-3">
        <div role="group" aria-label="작업할 주문 범위" className="grid grid-cols-2 gap-1.5">
          {choices.map((choice) => <label key={choice.id}
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-bold focus-within:ring-2 focus-within:ring-ink ${kind===choice.id?'border-ink bg-surface-2 text-ink':'border-line bg-surface text-ink-soft'}`}>
            <input type="radio" name="work-scope" checked={kind===choice.id} onChange={()=>changeKind(choice.id)} className="h-4 w-4 shrink-0 accent-ink" />
            <span className="min-w-0 flex-1 truncate">{choice.name}</span>
            {typeof choice.count==='number' ? <span className="shrink-0 text-[12px] tabular-nums">{choice.count}{unit}</span> : null}
          </label>)}
        </div>
        {kind === 'current' && currentLabel ? <p className="mt-2 truncate text-[12px] text-ink-mute" title={currentLabel}>선택한 필터 · {currentLabel}</p> : null}
        {kind === 'selected' ? <p className="mt-2 text-[12px] text-ink-mute">체크한 주문서의 상품만 선택합니다.</p> : null}

        {kind === 'broadcast' ? <div className="mt-2 max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5" aria-label="방송 선택 목록">
          {broadcastChoices.length ? broadcastChoices.map((b) => <label key={b.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
            <input type="checkbox" checked={bcIds.has(b.id)} onChange={()=>toggle(b.id,bcIds,setBcIds)} className="h-4 w-4 shrink-0 accent-ink" />
            <span className="min-w-0 flex-1 break-words font-semibold text-ink">{b.label}</span>
            <span className="shrink-0 font-bold text-ink tabular-nums">{b.quantity}{unit}</span>
          </label>) : <p className="px-2 py-3 text-[12px] text-ink-mute">챙길 상품이 있는 방송이 없습니다.</p>}
        </div> : null}

        {kind === 'shop' ? <div className="mt-2 max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5" aria-label="쇼핑몰 날짜 선택 목록">
          {shopChoices.length ? shopChoices.map((d) => <label key={d.dateKey} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
            <input type="checkbox" checked={shopDays.has(d.dateKey)} onChange={()=>toggle(d.dateKey,shopDays,setShopDays)} className="h-4 w-4 shrink-0 accent-ink" />
            <span className="min-w-0 flex-1 break-words font-semibold text-ink">{d.label}</span>
            <span className="shrink-0 font-bold text-ink tabular-nums">{d.quantity}{unit}</span>
          </label>) : <p className="px-2 py-3 text-[12px] text-ink-mute">챙길 상품이 있는 날짜가 없습니다.</p>}
        </div> : null}
      </div>

      <footer className="shrink-0 border-t border-line px-4 pb-4 pt-3">
        {work === 'picking' ? <section aria-label="선택 범위 상품 수량" aria-live="polite" className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <strong className="text-[16px] font-black text-ink tabular-nums">총 챙길 물건 {quantity.total}개</strong>
            <span className="text-[12px] font-semibold text-ink-soft tabular-nums">결제완료 <b className="text-ink">{quantity.paid}개</b> <span className="mx-1">·</span> <span className={quantity.unpaid>0?'text-danger-tx':''}>미결제 {quantity.unpaid}개</span></span>
          </div>
          {(summary.canceled>0 || summary.excluded>0) ? <p className="mt-0.5 text-[11px] text-ink-mute">{summary.canceled>0?`취소 주문서 ${summary.canceled}건 별도 제외`:''}{summary.canceled>0&&summary.excluded>0?' · ':''}{summary.excluded>0?`작업 제외 ${summary.excluded}건`:''}</p> : null}
        </section> : <section aria-label="송장 출력 범위 요약" aria-live="polite" className="rounded-lg bg-surface-2 px-3 py-2">
          <strong className="text-[20px] font-black text-ink">송장 대상 {summary.eligible}건</strong>
          <span className="ml-3 text-[12px] text-ink-soft">결제완료 {summary.paid}건 · 미결제 {summary.unpaid}건</span>
          {(summary.canceled>0||summary.excluded>0)?<p className="mt-0.5 text-[11px] text-ink-mute">취소/제외 주문서는 포함하지 않습니다.</p>:null}
        </section>}

        {work === 'picking' ? <div role="group" aria-label="물건챙기기 결제 상태 표시" className="mt-2 grid grid-cols-2 gap-1.5">
          <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-bold ${paymentView==='paid'?'border-ink bg-surface-2 text-ink':'border-line text-ink-soft'}`}>
            <input type="radio" name="picking-payment-view" checked={paymentView==='paid'} onChange={()=>{setPaymentView('paid');setError('')}} className="h-4 w-4 accent-ink" />결제완료만 보기
          </label>
          <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-bold ${paymentView==='all'?'border-ink bg-surface-2 text-ink':'border-line text-ink-soft'}`}>
            <input type="radio" name="picking-payment-view" checked={paymentView==='all'} onChange={()=>{setPaymentView('all');setError('')}} className="h-4 w-4 accent-ink" />미결제 포함 보기
          </label>
        </div> : null}
        {error ? <p role="alert" className="mt-2 text-[12px] font-semibold text-danger-tx">{error}</p> : null}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-lg border border-line text-[13px] font-bold text-ink">취소</button>
          <button type="button" onClick={confirm} disabled={visibleCount===0}
            className="h-11 flex-[2] rounded-lg bg-ink text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            {work === 'picking' ? `물건 ${visibleCount}개 보기` : `송장 옵션 보기 · ${visibleCount}건`}
          </button>
        </div>
      </footer>
    </div>
  </div>;
}
