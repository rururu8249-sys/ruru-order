'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import ShopContactLink from '@/components/customer/ShopContactLink';
import type {PublicBlockDetails} from '@/lib/customerBlockPublic';

/** Customers are always checked through the existing server block decision.
 * Details are rendered ONLY if the server has attached a sanitized, verified
 * Kakao-owner projection. No customer-side notes or order lookup is performed.
 */
type BlockState={checking:boolean;blocked:boolean;phone:string;details:PublicBlockDetails|null};
const INITIAL:BlockState={checking:false,blocked:false,phone:'',details:null};
const ROUTES=new Set(['/','/home','/order','/myorder','/group-buy','/notice']);
const digits=(s:unknown)=>String(s||'').replace(/\D/g,'');
const won=(n:number)=>`${n.toLocaleString('ko-KR')}원`;

function storedPhone(){
  if(typeof window==='undefined')return '';
  const direct=digits(window.localStorage.getItem('ruru_customer_phone'));
  if(direct)return direct;
  try{
    const session=JSON.parse(window.localStorage.getItem('ruru_customer_session')||'null');
    return digits(session?.customer_phone);
  }catch{return '';}
}
function clearLogin(){
  void fetch('/api/live-chat/session',{method:'DELETE',keepalive:true}).catch(()=>{});
  window.dispatchEvent(new Event('ruru-chat-logout'));
  [
    'ruru_customer_session','ruru_customer_phone','ruru_youtube_nickname',
    'ruru_customer_name','ruru_customer_zipcode','ruru_customer_address',
    'ruru_customer_detail_address','ruru_kakao_id','ruru_chat_identity',
    'ruru_kakao_nickname','ruru_customer_session_version',
    'ruru_youtube_nickname_confirm_version',
  ].forEach(key=>window.localStorage.removeItem(key));
}
function guarded(pathname:string|null){
  const path=pathname||'/';
  if(path.startsWith('/admin')||path.startsWith('/api')||path.startsWith('/auth/kakao'))return false;
  return ROUTES.has(path);
}

export default function CustomerAccessBlockGuard(){
  const pathname=usePathname();
  const shouldGuard=useMemo(()=>guarded(pathname),[pathname]);
  const [state,setState]=useState<BlockState>(INITIAL);
  const panelRef=useRef<HTMLElement>(null);

  useEffect(()=>{
    if(!shouldGuard){setState(INITIAL);return;}
    const phone=storedPhone();
    if(phone.length<9||phone.length>11){setState(INITIAL);return;}
    let live=true;
    setState({checking:true,blocked:false,phone,details:null});
    (async()=>{
      try{
        const response=await fetch(`/api/customer-block-check?phone=${encodeURIComponent(phone)}`,{
          cache:'no-store',credentials:'same-origin',
        });
        const payload=await response.json().catch(()=>null);
        if(!live)return;
        if(!response.ok||!payload?.ok){setState(INITIAL);return;}
        const blocked=payload.blocked===true;
        setState({checking:false,blocked,phone,details:blocked&&payload.details?payload.details as PublicBlockDetails:null});
      }catch{if(live)setState(INITIAL);}
    })();
    return ()=>{live=false;};
  },[shouldGuard,pathname]);

  useEffect(()=>{
    if(!state.blocked)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    panelRef.current?.focus();
    return ()=>{document.body.style.overflow=previous;};
  },[state.blocked]);

  if(!shouldGuard||!state.blocked)return null;
  const d=state.details;
  const isDeal=d?.kind==='deal_break';
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#F5F5F7] px-4 py-7 text-[#1D1D1F] sm:px-6" role="presentation">
      <div className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-[470px] items-center justify-center">
        <section ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="customer-block-title" aria-describedby="customer-block-description" className="w-full rounded-[26px] border border-[#E5E5EA] bg-white px-5 py-7 shadow-[0_16px_64px_rgba(0,0,0,0.07)] outline-none sm:px-8 sm:py-9">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#F5F5F7] text-[#3A3A3C]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>
            </svg>
          </div>
          <p className="mt-5 text-center text-[12px] font-semibold tracking-[0.09em] text-[#86868B]">루루동이 · 이용 안내</p>
          <h1 id="customer-block-title" className="mt-2 break-keep text-center text-[23px] font-bold leading-[1.35] tracking-[-0.045em] text-[#1D1D1F] sm:text-[25px]">
            현재 사이트 이용이 제한되어 있습니다
          </h1>
          <p id="customer-block-description" className="mt-3 break-keep text-center text-[14px] leading-[1.7] text-[#6E6E73]">
            이용과 관련해 확인이 필요한 내역이 있습니다.<br/>아래 내용을 확인하시고 카카오톡 채널로 문의해 주세요.
          </p>

          <div className="mt-6 rounded-[18px] border border-[#E8E8ED] bg-[#FAFAFC] px-4 py-4 sm:px-5">
            <p className="text-[12px] font-medium text-[#86868B]">이용 제한 사유</p>
            <p className="mt-1 break-keep text-[16px] font-semibold leading-6 text-[#1D1D1F]">{d?.category||'운영 확인 필요'}</p>
            {isDeal && d ? (
              <div className="mt-4 border-t border-[#E5E5EA] pt-4">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-[#6E6E73]">거파 발생일</span>
                  <span className="font-semibold tabular-nums text-[#1D1D1F]">{d.dealDate||'기록 없음 · 문의 필요'}</span>
                </div>
                {d.items.length>0 ? (
                  <div className="mt-4">
                    <p className="text-[12px] font-medium text-[#86868B]">확인된 거래 상품</p>
                    <div className="mt-2 divide-y divide-[#ECECF0] rounded-[12px] bg-white px-3">
                      {d.items.map((it,i)=>(
                        <div key={`${i}-${it.product}`} className="flex items-start justify-between gap-3 py-3 text-[13px] leading-[1.5]">
                          <span className="min-w-0 flex-1 break-words text-[#3A3A3C]">{it.product}</span>
                          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-[#1D1D1F]">{it.amount===null?'금액 미기록':won(it.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {d.moreItems>0?<p className="mt-2 text-[12px] text-[#6E6E73]">외 {d.moreItems}개 상품은 채널로 문의해 주세요.</p>:null}
                    {d.totalAmount!==null?<div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E5E5EA] pt-3 text-[14px]"><span className="font-medium text-[#6E6E73]">기록된 상품 금액 합계</span><strong className="tabular-nums text-[#1D1D1F]">{won(d.totalAmount)}</strong></div>:null}
                  </div>
                ) : <p className="mt-3 text-[12px] leading-5 text-[#6E6E73]">상품과 금액의 상세 내역은 카카오톡 채널에서 확인해 드리겠습니다.</p>}
              </div>
            ):null}
            {d?.registeredDate ? (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E5E5EA] pt-3 text-[12px]">
                <span className="text-[#86868B]">차단 등록일</span>
                <span className="font-medium tabular-nums text-[#6E6E73]">{d.registeredDate}</span>
              </div>
            ):null}
            {!d?<p className="mt-3 text-[12px] leading-5 text-[#86868B]">상세 사유는 본인 확인 후 채널에서 안내드립니다.</p>:null}
          </div>

          <p className="mt-5 break-keep text-center text-[13px] leading-[1.7] text-[#6E6E73]">
            확인이 필요하거나 이의가 있으신 경우<br/>카카오톡 채널로 연락 주시면 안내드리겠습니다.
          </p>
          <ShopContactLink labelForm="long" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-[#1D1D1F] px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#343437] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1D1F]">
            {({label})=><><span>{label}</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></>}
          </ShopContactLink>
          <button type="button" onClick={()=>{clearLogin();window.location.href='/';}} className="mt-2 flex min-h-12 w-full items-center justify-center rounded-[13px] border border-[#D2D2D7] bg-white px-4 text-[14px] font-semibold text-[#3A3A3C] transition-colors hover:bg-[#F5F5F7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1D1F]">
            다른 계정으로 로그인
          </button>
          <p className="mt-5 text-center text-[11px] leading-4 text-[#86868B]">차단 해제 여부는 고객센터 확인 후 안내됩니다.</p>
        </section>
      </div>
    </div>
  );
}
