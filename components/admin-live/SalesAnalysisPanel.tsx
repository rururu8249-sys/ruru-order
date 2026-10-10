'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {loadSalesAnalysisSnapshot,type SalesAnalysisSnapshot} from '@/lib/salesAnalysisLoader';
import {aggregateSalesItems,salesProductPhotos,type SalesOptionGroup} from '@/lib/salesHistory';
import {isCanceledStatus} from '@/lib/admin-v2/statusDisplay';
import type {OrderRow} from '@/lib/admin-v2/types';
import {buildAdminLiveOrderGroups,toAdminLiveOrder} from './liveOrderAdapter';
import type {LiveOrder} from './types';
import {showAdminToast} from '@/lib/adminToast';

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

function OptionQuantities({group}:{group:SalesOptionGroup}) {
  const hasSize=group.sizes.some(size=>size.label!=='수량'&&size.label!=='옵션 없음');
  return <div aria-label={hasSize?'사이즈별 수량':'옵션별 수량'} className="w-44 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
    {group.label?<p className="border-b border-line px-3 py-2 font-bold break-words">{group.label}</p>:null}
    {hasSize?<div className="grid grid-cols-2 border-b border-line bg-surface-2 text-xs font-bold text-ink-soft"><span className="px-3 py-1.5">사이즈</span><span className="border-l border-line px-3 py-1.5 text-right">수량</span></div>:null}
    {group.sizes.map(size=>{
      const noSize=size.label==='수량'||size.label==='옵션 없음';
      return <dl key={size.label} aria-label={`${noSize?(group.label||'옵션 없음'):`사이즈 ${size.label}`}, 수량 ${size.qty}개`} className="grid grid-cols-2 border-b border-line last:border-b-0">
        <dt className="break-words px-3 py-1.5 font-bold">{noSize?(hasSize?'미지정':'수량'):size.label}</dt>
        <dd className="border-l border-line bg-[#fff4f2] px-3 py-1.5 text-right"><strong className="text-[#b42318]">{size.qty}개</strong></dd>
      </dl>;
    })}
  </div>;
}

export default function SalesAnalysisPanel({initialBroadcastId}:{initialBroadcastId:string|null}) {
  const [snapshot,setSnapshot]=useState<SalesAnalysisSnapshot|null>(null);
  const [error,setError]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState(initialBroadcastId||'');
  const [channel,setChannel]=useState('all');
  const [year,setYear]=useState('all');
  const [month,setMonth]=useState('all');
  const [search,setSearch]=useState('');
  const [productSearch,setProductSearch]=useState('');
  const [productSort,setProductSort]=useState('sales');
  const [detailView,setDetailView]=useState('products');
  const [buyerSearch,setBuyerSearch]=useState('');
  const [category,setCategory]=useState('all');
  const [photo,setPhoto]=useState<{src:string;name:string}|null>(null);
  const photoDialog=useRef<HTMLDialogElement>(null);
  const closePhoto=()=>{photoDialog.current?.close();setPhoto(null);};
  useEffect(()=>{
    const dialog=photoDialog.current;
    if(photo&&dialog&&!dialog.open)dialog.showModal();
  },[photo]);
  function selectBroadcast(id:string){
    setSelected(id);setProductSearch('');setBuyerSearch('');setCategory('all');setDetailView('products');
  }
  function refreshAnalysis(){setSnapshot(null);setError(false);setRefresh(v=>v+1);}
  useEffect(()=>{
    let current=true;
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
  const paidOrders=useMemo(()=>detail?buildAdminLiveOrderGroups(detail.orders).map(toAdminLiveOrder).filter(o=>paid.has(o.paymentStatus)):[],[detail]);
  const sold=useMemo(()=>paidOrders.flatMap(o=>o.items),[paidOrders]);
  const buyers=useMemo(()=>{
    const groups=new Map<string,{nickname:string;name:string;orders:LiveOrder[];amount:number;qty:number}>();
    for(const order of paidOrders){
      const key=order.phone&&order.phone!=='-'?order.phone:`${order.nickname}|${order.name}`;
      const buyer=groups.get(key)||{nickname:order.nickname,name:order.name,orders:[],amount:0,qty:0};
      buyer.orders.push(order);buyer.amount+=order.totalAmount;buyer.qty+=order.items.reduce((sum,item)=>sum+item.qty,0);groups.set(key,buyer);
    }
    return [...groups].map(([key,buyer])=>({key,...buyer})).sort((a,b)=>b.amount-a.amount);
  },[paidOrders]);
  const products=useMemo(()=>{
    if(!detail)return [];
    const originals=new Map(detail.orders.map(row=>[String(row.id),row]));
    return aggregateSalesItems(sold.map(item=>({...originals.get(item.id),product_name:item.productName,product_id:item.productId,qty:item.qty,adjusted_product_price:null,product_price:item.unitPrice,lineAmount:item.amount})),row=>Number(row.lineAmount),row=>String(row.product_id||'')).map(item=>{
      const product=detail.products.find(p=>String(p.id)===item.productId);
      const photo=product?salesProductPhotos(item.name,product,item.productId||undefined).detail:'';
      let note:Record<string,unknown>={};
      try{note=typeof product?.product_note==='string'?JSON.parse(product.product_note):product?.product_note as Record<string,unknown>||{};}catch{/* Invalid legacy metadata remains unclassified. */}
      return {...item,thumb:photo,category:String(note?.category||'').trim()||'기타'};
    });
  },[detail,sold]);
  const categories=useMemo(()=>{
    const groups=new Map<string,{qty:number;amount:number}>();
    for(const item of products){const group=groups.get(item.category)||{qty:0,amount:0};group.qty+=item.qty;group.amount+=item.sales;groups.set(item.category,group);}
    return [...groups].map(([name,group])=>({name,...group})).sort((a,b)=>b.qty-a.qty);
  },[products]);
  const shownProducts=useMemo(()=>products.filter(p=>(category==='all'||category===p.category)&&`${p.name} ${p.option}`.toLowerCase().includes(productSearch.toLowerCase())).sort((a,b)=>productSort==='name'?a.name.localeCompare(b.name,'ko',{numeric:true}):productSort==='qty'?b.qty-a.qty||b.sales-a.sales:b.sales-a.sales),[products,productSearch,productSort,category]);
  async function copyAnalysis(){
    if(!selectedEntry)return;
    const lines=[`${selectedEntry.title} 판매분석`,'결제완료 기준 · 취소·삭제·테스트·선물 제외',`결제금액 ${won(paidOrders.reduce((sum,o)=>sum+o.totalAmount,0))}`,`상품금액 ${won(products.reduce((sum,p)=>sum+p.sales,0))}`,`구매자 ${buyers.length}명 · 주문 ${paidOrders.length}건 · 판매수량 ${sold.reduce((sum,p)=>sum+p.qty,0)}개`,'','상품·옵션별 판매 현황',...products.flatMap(p=>[`${p.name} · ${p.qty}개 · 단가 ${won(p.price)} · 상품금액 ${won(p.sales)}`,p.option])];
    try{await navigator.clipboard.writeText(lines.join('\n'));showAdminToast('판매분석을 복사했습니다.','success');}catch{showAdminToast('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.','error');}
  }
  const years=useMemo(()=>snapshot?[...new Set([...snapshot.broadcasts.map(b=>b.started_at),...snapshot.orders.filter(r=>r.broadcast_id==null).map(r=>String(r.created_at||''))].filter(Boolean).map(date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul',year:'numeric'})))].filter(y=>/^\d{4}$/.test(y)).sort().reverse():[],[snapshot]);
  const control='rounded-lg border border-line bg-surface px-3 py-2 text-sm';
  return <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-label="판매분석">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold">판매분석</h2><button className={control} onClick={refreshAnalysis}>새로고침</button></div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="판매 경로" className={control} value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">전체</option><option value="broadcast">방송</option><option value="shop">쇼핑몰</option></select>
      <select aria-label="판매 연도" className={control} value={year} onChange={e=>setYear(e.target.value)}><option value="all">전체 연도</option>{years.map(y=><option key={y}>{y}</option>)}</select>
      <select aria-label="판매 월" className={control} value={month} onChange={e=>setMonth(e.target.value)}><option value="all">전체 월</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}</select>
      <input aria-label="방송명 검색" placeholder="방송명 검색" className={`${control} min-w-0 basis-full sm:basis-auto flex-1`} value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>
    <p className="text-xs text-ink-soft">결제완료 기준 · 취소·삭제·테스트·선물 제외. 방송은 시작일, 쇼핑몰은 주문일 기준입니다. 주문건수는 주문서 수, 품목 수는 주문서 안의 상품 줄 수입니다.</p>
    {error?<div role="alert" className="rounded-xl border border-line p-8 text-center"><p>판매분석을 불러오지 못했습니다.</p><p className="mt-2 text-sm">일부 주문만 합산하지 않습니다. 다시 불러오기를 눌러 주세요.</p><button className={`${control} mt-4`} onClick={refreshAnalysis}>다시 불러오기</button></div>:!model||!snapshot?<p role="status" className="p-8 text-center">판매분석을 불러오는 중…</p>:<>
      <p className="text-sm font-bold">조회 조건 전체 합계 · {model.list.length}개 판매 경로</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{[['결제금액',won(model.total.amount)],['상품금액',won(model.total.productAmount)],['주문건수',`${model.total.count.toLocaleString()}건`],['품목 수',`${model.total.items.toLocaleString()}줄`],['판매수량',`${model.total.qty.toLocaleString()}개`]].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-surface-2 p-3"><p className="text-xs text-ink-soft">{label}</p><p className="mt-1 text-lg font-extrabold text-rose-deep">{value}</p></div>)}</div>
      <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="lg:hidden"><label className="mb-2 block text-sm font-bold" htmlFor="sales-broadcast-select">분석할 방송·판매 경로</label><select id="sales-broadcast-select" aria-label="분석할 방송 선택" className={`${control} w-full`} value={selectedEntry?.id||''} onChange={e=>selectBroadcast(e.target.value)}><option value="">방송·판매 경로 선택</option>{model.list.map(b=><option key={b.id} value={b.id}>{b.title}{b.started_at?` · ${new Date(b.started_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}`:''}</option>)}</select>{model.list.length===0?<p className="mt-2 text-sm">선택한 조건에 결제완료 판매가 없습니다.</p>:null}</div>
        <nav aria-label="분석할 방송" className="hidden max-h-[65vh] flex-col gap-2 overflow-y-auto lg:flex">{model.list.map(b=><button key={b.id} aria-label={`${b.title} 분석`} aria-pressed={selected===b.id} className={`rounded-xl border p-3 text-left ${selected===b.id?'border-rose-line bg-rose-soft':'border-line bg-surface'}`} onClick={()=>selectBroadcast(b.id)}><p className="font-bold">{b.title}</p><p className="mt-1 text-sm">{won(model.stats.get(b.id)?.amount||0)}</p><p className="text-xs text-ink-soft">{b.started_at?new Date(b.started_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'기간 내 주문'} · 주문 {model.stats.get(b.id)?.count}건 · 품목 {model.stats.get(b.id)?.items}줄</p></button>)}{model.list.length===0?<p className="p-4 text-sm">선택한 조건에 결제완료 판매가 없습니다.</p>:null}</nav>
        <div className="min-w-0">{detail?<>
          <section className="rounded-xl border border-line bg-surface p-4" aria-label="선택 방송 판매 품목">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">{selectedEntry!.title}</h3><p className="mt-1 text-sm text-ink-soft">상품별 판매 현황 · 색상과 사이즈별 수량을 함께 확인하세요.</p><button className={`${control} mt-2`} onClick={copyAnalysis}>분석 복사</button></div><div className="text-right"><p className="text-xs text-ink-soft">상품금액 합계</p><p className="text-xl font-extrabold text-rose-deep">{won(products.reduce((sum,item)=>sum+item.sales,0))}</p><p className="text-xs text-ink-soft">판매수량 {sold.reduce((sum,item)=>sum+item.qty,0)}개 · 배송비·결제 부가금액 제외</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['결제금액',won(paidOrders.reduce((sum,order)=>sum+order.totalAmount,0))],['구매자',`${buyers.length}명`],['주문건수',`${paidOrders.length}건`],['판매수량',`${sold.reduce((sum,item)=>sum+item.qty,0)}개`]].map(([label,value])=><div key={label} className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-ink-soft">{label}</p><p className="mt-1 font-extrabold">{value}</p></div>)}</div>
            <div className="mt-4 flex gap-2 border-b border-line pb-3" aria-label="상세 분석 보기">{[['products','상품·옵션별'],['buyers','구매자별']].map(([key,label])=><button key={key} aria-pressed={detailView===key} onClick={()=>setDetailView(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${detailView===key?'bg-rose-deep text-white':'bg-surface-2 text-ink-soft'}`}>{label}</button>)}</div>
            {detailView==='products'?<>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="상품 분류 필터"><button className={control} aria-pressed={category==='all'} onClick={()=>setCategory('all')}>전체 분류</button>{categories.map(c=><button key={c.name} className={`${control} ${category===c.name?'border-rose-line bg-rose-soft':''}`} aria-pressed={category===c.name} onClick={()=>setCategory(c.name)}>{c.name} · {c.qty}개 · {won(c.amount)}</button>)}</div>
            <div className="my-4 flex flex-wrap gap-2"><input className={`${control} min-w-0 basis-full sm:basis-auto flex-1`} aria-label="판매 상품·옵션 검색" placeholder="상품명·색상·사이즈 검색" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/><select className={control} aria-label="상품 정렬" value={productSort} onChange={e=>setProductSort(e.target.value)}><option value="sales">상품금액순</option><option value="qty">판매수량순</option><option value="name">상품명순</option></select></div>
            <div className="overflow-x-auto rounded-lg border border-line" role="region" aria-label="상품별 판매 현황 표" tabIndex={0}>
              <table className="block w-full border-collapse text-sm md:table md:min-w-[640px]"><caption className="sr-only">{selectedEntry!.title} 상품·옵션별 판매 현황</caption><thead className="hidden bg-surface-2 text-ink-soft md:table-header-group"><tr>{['상품','구매 옵션별 수량','판매수량','단가','상품금액'].map(label=><th key={label} scope="col" className="px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody className="block md:table-row-group">{shownProducts.map(item=><tr key={item.key} className="block border-t border-line even:bg-surface-2 md:table-row"><th scope="row" className="block px-3 py-3 text-left md:table-cell md:w-[180px]"><div className="flex items-center gap-3">{item.thumb?<button type="button" onClick={()=>setPhoto({src:item.thumb,name:item.name})} className="shrink-0 cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-rose-deep" aria-label={`${item.name} 상품 사진 확대`}><img src={item.thumb} alt={item.name} loading="lazy" className="h-20 w-16 rounded-lg object-contain"/></button>:<span className="w-16 shrink-0 text-xs font-normal text-ink-soft">세부 사진<br/>미등록</span>}<span className="min-w-0 break-words [overflow-wrap:anywhere] font-bold">{item.name}</span></div></th><td className="block px-3 py-3 md:table-cell md:min-w-[200px]"><div className="flex flex-wrap items-start gap-2">{item.optionGroups.map(group=><OptionQuantities key={group.label} group={group}/>)}</div></td><td className="flex justify-between gap-2 px-3 py-2 font-extrabold text-[#b42318] md:table-cell md:whitespace-nowrap md:py-3"><span className="font-normal text-ink-soft md:hidden">판매수량</span>{item.qty}개</td><td className="flex justify-between gap-2 px-3 py-2 text-ink-soft md:table-cell md:whitespace-nowrap md:py-3"><span className="md:hidden">단가</span>{won(item.price)}</td><td className="flex justify-between gap-2 px-3 py-2 font-extrabold text-rose-deep md:table-cell md:whitespace-nowrap md:py-3"><span className="font-normal text-ink-soft md:hidden">상품금액</span>{won(item.sales)}</td></tr>)}</tbody></table>
            </div>{shownProducts.length===0?<p className="py-6 text-center text-ink-soft">검색 조건에 맞는 판매 상품이 없습니다.</p>:null}
            <p className="mt-3 text-xs text-ink-soft">표시 {shownProducts.length}개 상품·단가 묶음 / 전체 {products.length}개 · 같은 상품도 단가가 다르면 구분합니다.</p>
            </>:<>
              <input className={`${control} my-4 w-full`} aria-label="구매자 검색" placeholder="닉네임·이름 검색" value={buyerSearch} onChange={e=>setBuyerSearch(e.target.value)}/>
              <div className="flex flex-col gap-2">{buyers.filter(b=>`${b.nickname} ${b.name}`.toLowerCase().includes(buyerSearch.toLowerCase())).map(b=><details key={`${selectedEntry!.id}:${b.key}`} className="rounded-lg border border-line"><summary className="cursor-pointer p-3"><span className="font-bold">{b.nickname}{b.name&&b.name!==b.nickname&&b.name!=='-'?` (${b.name})`:''}</span><span className="ml-3 text-sm text-ink-soft">주문 {b.orders.length}건 · {b.qty}개</span><strong className="float-right text-rose-deep">{won(b.amount)}</strong></summary><div className="border-t border-line bg-surface-2 px-3 py-2">{b.orders.flatMap(o=>o.items).map(item=><div key={item.id} className="flex gap-3 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{item.productName} · {item.optionText}</span><span className="shrink-0">{item.qty}개</span><strong className="shrink-0">{won(item.amount)}</strong></div>)}</div></details>)}</div>
              {buyers.filter(b=>`${b.nickname} ${b.name}`.toLowerCase().includes(buyerSearch.toLowerCase())).length===0?<p className="py-6 text-center text-ink-soft">검색 조건에 맞는 구매자가 없습니다.</p>:null}
            </>}
          </section>
        </>:<div className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">방송을 선택하면 상세 분석이 표시됩니다.</div>}</div>
      </div>
    </>}
    {photo?<dialog ref={photoDialog} aria-label={`${photo.name} 상품 사진 확대`} onCancel={event=>{event.preventDefault();closePhoto();}} onClick={event=>{if(event.target===event.currentTarget)closePhoto();}} className="m-auto max-h-[95dvh] w-[min(92vw,900px)] max-w-none overflow-auto rounded-xl border-0 bg-surface p-3 shadow-xl backdrop:bg-black/75">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="font-bold">{photo.name}</p><button type="button" autoFocus aria-label="사진 확대 닫기" onClick={closePhoto} className="rounded-lg border border-line px-4 py-2 font-bold">✕ 닫기</button></div>
      <img src={photo.src} alt={`${photo.name} 확대 사진`} className="mx-auto max-h-[78dvh] max-w-full object-contain"/>
    </dialog>:null}
  </section>;
}
