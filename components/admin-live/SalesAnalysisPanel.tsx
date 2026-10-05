'use client';

import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {loadSalesAnalysisSnapshot,type SalesAnalysisSnapshot} from '@/lib/salesAnalysisLoader';
import {salesProductPhotos} from '@/lib/salesHistory';
import {isCanceledStatus} from '@/lib/admin-v2/statusDisplay';
import type {OrderRow} from '@/lib/admin-v2/types';
import {buildAdminLiveOrderGroups,toAdminLiveOrder} from './liveOrderAdapter';
import BroadcastReportPopup from './BroadcastReportPopup';

const paid=new Set(['paid','auto_paid','manual_paid','card_paid']);
const won=(value:number)=>`${value.toLocaleString('ko-KR')}원`;
const shop='__shop__';
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'});
function visibleRow(row:OrderRow) {
  const raw=row as Record<string,unknown>;
  const flag=(value:unknown)=>[true,'true','t',1,'1'].includes(value as never);
  return !['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement'].some(key=>flag(raw[key])) && raw.event_gift_winner_id==null &&
    ![row.admin_order_status_v2,row.order_manage_status,raw.order_status].some(status=>isCanceledStatus(String(status||'')));
}
const channelOf=(row:OrderRow)=>row.broadcast_id==null?shop:String(row.broadcast_id);

export default function SalesAnalysisPanel({initialBroadcastId}:{initialBroadcastId:string|null}) {
  const [snapshot,setSnapshot]=useState<SalesAnalysisSnapshot|null>(null);
  const [error,setError]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState(initialBroadcastId||'');
  const [channel,setChannel]=useState('all');
  const [year,setYear]=useState('all');
  const [month,setMonth]=useState('all');
  const [search,setSearch]=useState('');
  useEffect(()=>{
    let current=true;
    setSnapshot(null);setError(false);
    void loadSalesAnalysisSnapshot(supabase,()=>current).then(value=>{if(current)setSnapshot(value);}).catch(()=>{if(current)setError(true);});
    return ()=>{current=false;};
  },[refresh]);
  const model=useMemo(()=>{
    if(!snapshot)return null;
    const valid=snapshot.orders.filter(visibleRow);
    const dateMatches=(value:string)=>{
      const date=new Date(value);if(Number.isNaN(date.getTime()))return year==='all'&&month==='all';
      const parts=dateFormatter.formatToParts(date);
      const y=parts.find(p=>p.type==='year')?.value;const m=parts.find(p=>p.type==='month')?.value;
      return (year==='all'||year===y)&&(month==='all'||Number(month)===Number(m));
    };
    const entries=snapshot.broadcasts.filter(b=>dateMatches(b.started_at)&&b.title.toLowerCase().includes(search.toLowerCase()));
    const ids=new Set(entries.map(b=>b.id));
    const scoped=valid.filter(row=>{
      const id=channelOf(row);
      return id===shop?channel!=='broadcast'&&!search&&dateMatches(String(row.created_at||'')):channel!=='shop'&&ids.has(id);
    });
    // Group within each broadcast: one reused legacy group key must not merge different broadcasts.
    const byChannel=new Map<string,OrderRow[]>();
    for(const row of scoped){const id=channelOf(row);const list=byChannel.get(id)||[];list.push(row);byChannel.set(id,list);}
    const stats=new Map<string,{amount:number;productAmount:number;count:number;items:number;qty:number}>();
    for(const [id,rows] of byChannel){
      const groups=buildAdminLiveOrderGroups(rows).map(toAdminLiveOrder).filter(order=>paid.has(order.paymentStatus));
      stats.set(id,{amount:groups.reduce((n,o)=>n+o.totalAmount,0),productAmount:groups.reduce((n,o)=>n+o.items.reduce((v,item)=>v+item.amount,0),0),count:groups.length,items:groups.reduce((n,o)=>n+o.items.length,0),qty:groups.reduce((n,o)=>n+o.items.reduce((v,item)=>v+item.qty,0),0)});
    }
    const list=entries.filter(b=>channel!=='shop'&&(stats.get(b.id)?.count||0)>0);
    if((stats.get(shop)?.count||0)>0)list.push({id:shop,title:'쇼핑몰 주문',started_at:''});
    const total=[...stats.values()].reduce((a,b)=>({amount:a.amount+b.amount,productAmount:a.productAmount+b.productAmount,count:a.count+b.count,items:a.items+b.items,qty:a.qty+b.qty}),{amount:0,productAmount:0,count:0,items:0,qty:0});
    return {scoped,list,stats,total};
  },[snapshot,channel,year,month,search]);
  const selectedEntry=model?.list.find(b=>b.id===selected);
  const detail=useMemo(()=>snapshot&&model&&selectedEntry?{...snapshot,broadcasts:[selectedEntry],orders:model.scoped.filter(row=>channelOf(row)===selectedEntry.id)}:null,[snapshot,model,selectedEntry]);
  const sold=useMemo(()=>detail?buildAdminLiveOrderGroups(detail.orders).map(toAdminLiveOrder).filter(o=>paid.has(o.paymentStatus)).flatMap(o=>o.items):[],[detail]);
  const years=useMemo(()=>snapshot?[...new Set([...snapshot.broadcasts.map(b=>b.started_at),...snapshot.orders.filter(r=>r.broadcast_id==null).map(r=>String(r.created_at||''))].filter(Boolean).map(date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul',year:'numeric'})))].filter(y=>/^\d{4}$/.test(y)).sort().reverse():[],[snapshot]);
  const control='rounded-lg border border-line bg-surface px-3 py-2 text-sm';
  return <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-label="판매분석">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold">판매분석</h2><button className={control} onClick={()=>setRefresh(v=>v+1)}>새로고침</button></div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="판매 경로" className={control} value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">전체</option><option value="broadcast">방송</option><option value="shop">쇼핑몰</option></select>
      <select aria-label="판매 연도" className={control} value={year} onChange={e=>setYear(e.target.value)}><option value="all">전체 연도</option>{years.map(y=><option key={y}>{y}</option>)}</select>
      <select aria-label="판매 월" className={control} value={month} onChange={e=>setMonth(e.target.value)}><option value="all">전체 월</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}</select>
      <input aria-label="방송명 검색" placeholder="방송명 검색" className={`${control} min-w-0 flex-1`} value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>
    <p className="text-xs text-ink-soft">결제완료 기준 · 취소·삭제·테스트·선물 제외. 방송은 시작일, 쇼핑몰은 주문일 기준입니다. 주문건수는 주문서 수, 품목 수는 주문서 안의 상품 줄 수입니다.</p>
    {error?<div role="alert" className="rounded-xl border border-line p-8 text-center"><p>판매분석을 불러오지 못했습니다.</p><p className="mt-2 text-sm">일부 주문만 합산하지 않습니다. 새로고침으로 다시 시도해 주세요.</p></div>:!model||!snapshot?<p role="status" className="p-8 text-center">판매분석을 불러오는 중…</p>:<>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{[['결제금액',won(model.total.amount)],['상품금액',won(model.total.productAmount)],['주문건수',`${model.total.count.toLocaleString()}건`],['품목 수',`${model.total.items.toLocaleString()}줄`],['판매수량',`${model.total.qty.toLocaleString()}개`]].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-surface-2 p-3"><p className="text-xs text-ink-soft">{label}</p><p className="mt-1 text-lg font-extrabold text-rose-deep">{value}</p></div>)}</div>
      <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="분석할 방송" className="flex max-h-72 flex-col gap-2 overflow-y-auto lg:max-h-[65vh]">{model.list.map(b=><button key={b.id} aria-label={`${b.title} 분석`} aria-pressed={selected===b.id} className={`rounded-xl border p-3 text-left ${selected===b.id?'border-rose-line bg-rose-soft':'border-line bg-surface'}`} onClick={()=>setSelected(b.id)}><p className="font-bold">{b.title}</p><p className="mt-1 text-sm">{won(model.stats.get(b.id)?.amount||0)}</p><p className="text-xs text-ink-soft">{b.started_at?new Date(b.started_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'기간 내 주문'} · 주문 {model.stats.get(b.id)?.count}건 · 품목 {model.stats.get(b.id)?.items}줄</p></button>)}{model.list.length===0?<p className="p-4 text-sm">선택한 조건에 결제완료 판매가 없습니다.</p>:null}</nav>
        <div className="min-w-0">{detail?<>
          <BroadcastReportPopup key={selectedEntry!.id} embedded open onClose={()=>{}} initialBroadcastId={selectedEntry!.id} suppliedSnapshot={detail}/>
          <details className="mt-4 rounded-xl border border-line p-4"><summary className="cursor-pointer font-bold">상품·옵션별 판매내역 ({sold.length}줄)</summary><div className="mt-3 flex flex-col gap-2">{sold.map(item=>{
            const product=detail.products.find(p=>String(p.id)===item.productId);const photo=product?salesProductPhotos(item.productName,product,item.productId||undefined).detail:'';
            return <div key={item.id} className="flex items-center gap-3 border-b border-line py-2">{photo?<img src={photo} alt={item.productName} loading="lazy" className="h-14 w-14 rounded-lg object-cover"/>:null}<div className="min-w-0 flex-1"><p className="font-bold">{item.productName}</p><p className="break-words text-sm text-ink-soft">{item.optionText} · {item.qty}개</p></div><span className="shrink-0 font-bold">{won(item.amount)}</span></div>;
          })}</div></details>
        </>:<div className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">방송을 선택하면 상세 분석이 표시됩니다.</div>}</div>
      </div>
    </>}
  </section>;
}
