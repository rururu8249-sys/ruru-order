"use client";

import {useEffect,useRef,useState} from 'react';
import {type ProductLike,parseProductNote} from '@/lib/productDetailModel';
import {linkedSourceInfo,resolveDetailInfo} from '@/lib/productDetailInfo';

type Snapshot={source:ProductLike;parent:ProductLike;sourceVersion:string;parentVersion:string;history?:Array<{action:string;original_name:string;detail_name:string;created_at:string}>};
type Props={source:ProductLike;brands:ProductLike[];onClose:()=>void;onMoved:()=>void;undoParentId?:string};

export default function ProductBrandMoveDialog({source,brands,onClose,onMoved,undoParentId}:Props) {
  const [query,setQuery]=useState('');
  const [parentId,setParentId]=useState(undoParentId ?? '');
  const [name,setName]=useState('');
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const requestId=useRef<string|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{
    let current=true;
    setSnapshot(null);requestId.current=null;
    if(!parentId){setLoading(false);return;}
    setLoading(true);setError('');
    fetch(`/api/admin-live/product-brand-move?sourceId=${encodeURIComponent(String(source.id))}&parentId=${encodeURIComponent(parentId)}`,{cache:'no-store'})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error || '최신 상태를 확인하지 못했습니다.');if(!data.source || !data.parent || !/^[a-f0-9]{32}$/.test(data.sourceVersion) || !/^[a-f0-9]{32}$/.test(data.parentVersion))throw new Error('상품 상태를 다시 확인해주세요.');if(current)setSnapshot(data);})
      .catch(reason=>{if(current)setError(reason instanceof Error?reason.message:'조회에 실패했습니다.');})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[source.id,parentId,revision]);
  async function save(){
    if(inFlight.current || !snapshot || (!undoParentId&&!name.trim()))return;
    inFlight.current=true;setBusy(true);setError('');
    requestId.current ??= crypto.randomUUID();
    try {
      const response=await fetch('/api/admin-live/product-brand-move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:undoParentId?'undo':'move',sourceId:String(source.id),parentId,detailName:name.trim(),requestId:requestId.current,expectedSourceVersion:snapshot.sourceVersion,expectedParentVersion:snapshot.parentVersion})});
      const data=await response.json();
      if(!response.ok){if(response.status===409){setSnapshot(null);requestId.current=null;}throw new Error(data.error || '저장하지 못했습니다.');}
      onMoved();
    }catch(reason){setError(reason instanceof Error?reason.message:'저장하지 못했습니다.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  const preview=snapshot?.source ?? source;
  const note=parseProductNote(preview);
  const variants=Array.isArray(note.stock_variants)?note.stock_variants:[];
  const filtered=brands.filter(brand=>String(brand.id)===parentId || String(brand.product_name ?? '').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const info=resolveDetailInfo(snapshot?.parent ?? preview,linkedSourceInfo(preview));
  const label=undoParentId?'독립 상품으로 되돌리기':'이 브랜드로 이동';
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <section role="dialog" aria-modal="true" aria-label="브랜드 하위 상품 이동" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
      <header className="border-b border-line p-5"><h2 className="text-lg font-extrabold text-ink">{undoParentId?'브랜드 연결 되돌리기':'브랜드 하위로 이동'}</h2><p className="mt-1 text-sm text-ink-soft">기존 주문·판매기록과 원본 상품 ID, 가격, 재고는 그대로 유지됩니다.</p></header>
      <div className="space-y-4 overflow-y-auto p-5">
        {!undoParentId?<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">브랜드 검색<input aria-label="브랜드 검색" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)} className="mt-1 w-full rounded-xl border border-line p-3" /></label><label className="text-sm font-bold">이동할 브랜드<select aria-label="이동할 브랜드" value={parentId} disabled={busy} onChange={event=>setParentId(event.target.value)} className="mt-1 w-full rounded-xl border border-line p-3"><option value="">직접 선택해주세요</option>{filtered.map(brand=><option key={String(brand.id)} value={String(brand.id)}>{String(brand.product_name)}</option>)}</select></label></div>:null}
        {!undoParentId?<label className="block text-sm font-bold">이동 후 상품명·품번<input aria-label="이동 후 상품명" value={name} maxLength={200} disabled={busy} onChange={event=>{setName(event.target.value);requestId.current=null;}} placeholder="확정된 상품명을 직접 입력해주세요" className="mt-1 w-full rounded-xl border border-line p-3" /></label>:null}
        <div className="grid gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-[100px_1fr]">
          {preview.image_url?<img src={String(preview.image_url)} alt="원본 상품" className="h-28 w-24 rounded-lg object-contain" />:<div className="text-sm text-ink-soft">원본 사진 없음</div>}
          <div className="space-y-2 text-sm"><p className="font-extrabold">{String(preview.product_name)}</p><p className="font-bold text-rose-deep">{Number(preview.price).toLocaleString('ko-KR')}원 · 재고 {Number(preview.stock ?? 0)}개</p><p>이동 후: {undoParentId?'독립 상품':`${String(snapshot?.parent.product_name ?? '브랜드 선택 필요')} → ${name.trim() || '상품명 입력 필요'}`}</p><p>색상: {Array.isArray(preview.color_options)?preview.color_options.join(', '):'없음'} · 사이즈: {Array.isArray(preview.size_options)?preview.size_options.join(', '):'없음'}</p>{variants.map((value,index)=>{const variant=value as Record<string,unknown>;return <span key={index} className="mr-2 inline-block rounded-lg border border-line px-2 py-1">{String(variant.color ?? '')} {String(variant.size ?? '')} <strong className="text-danger-tx">{Number(variant.stock ?? 0)}개</strong></span>;})}<p className="whitespace-pre-wrap text-ink-soft">{String(preview.product_description ?? '')}</p></div>
        </div>
        {info.chips.length || info.description?<div className="rounded-xl border border-line p-3"><p className="mb-2 text-sm font-bold">한눈에 정보·상세설명</p>{info.chips.map(chip=><span key={chip} className="mr-2 inline-block rounded-lg bg-surface-2 px-2 py-1 text-sm">{chip}</span>)}<p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{info.description}</p></div>:null}
        {snapshot?.history?.length?<div className="rounded-xl border border-line p-3"><h3 className="mb-2 text-sm font-bold">최근 이동 이력</h3>{snapshot.history.map((entry,index)=><p key={index} className="border-t border-line py-2 text-sm">{new Date(entry.created_at).toLocaleString('ko-KR')} · {entry.action==='undo'?'연결 되돌림':'브랜드로 이동'} · {entry.original_name} → {entry.detail_name}</p>)}</div>:null}
        {loading?<p role="status">최신 상품 상태 확인 중…</p>:null}
        {error?<div role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger-tx">{error}<button type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)} className="ml-2 underline">최신 상태 다시 확인</button></div>:null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line p-4"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-line px-4 py-2 font-bold">취소</button><button type="button" disabled={busy||loading||!snapshot||(!undoParentId&&!name.trim())} onClick={save} className="rounded-xl bg-rose-deep px-4 py-2 font-bold text-white disabled:opacity-40">{busy?'저장 중…':label}</button></footer>
    </section>
  </div>;
}
