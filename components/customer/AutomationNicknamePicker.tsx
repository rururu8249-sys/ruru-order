'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {PersonaOrderRecord} from '@/lib/liveAutomationOrderHistory';
import type {ManualAutomationChat} from '@/lib/useManualAutomationChat';
export function AutomationNicknamePicker({state,dark=false,disabled=false,onPicked}:{state:ManualAutomationChat;dark?:boolean;disabled?:boolean;onPicked?:()=>void}) {
 const [detail,setDetail]=useState<string|null>(null),[orders,setOrders]=useState<PersonaOrderRecord[]>([]),[orderError,setOrderError]=useState(''),[orderLoading,setOrderLoading]=useState(false);
 const orderRequest=useRef(0);
 useEffect(()=>{if(!state.open){orderRequest.current++;setDetail(null);setOrders([])}},[state.open]);
 const showOrders=async(id:string)=>{if(detail===id){setDetail(null);++orderRequest.current;return;}const request=++orderRequest.current;setDetail(id);setOrders([]);setOrderError('');setOrderLoading(true);try{const list=await state.readOrders(id);if(request===orderRequest.current)setOrders(list)}catch{if(request===orderRequest.current)setOrderError('주문 기록을 불러오지 못했어요. 다시 눌러 주세요.')}finally{if(request===orderRequest.current)setOrderLoading(false)}};
 const [query,setQuery]=useState('');const trigger=useRef<HTMLButtonElement>(null);
 if(!state.available)return null;
 const foreground=dark?'#FFFFFF':'#111111',background=dark?'#1C1C1E':'#FFFFFF',muted=dark?'#CCCCCC':'#707072';
 const button:CSSProperties={minHeight:44,border:'none',borderRadius:12,padding:'8px 12px',fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer',color:foreground,background:dark?'#39393B':'#F5F5F5'};
 const close=()=>{state.setOpen(false);trigger.current?.focus()};
 const choose=async(id:string)=>{await state.choose(id);onPicked?.()};
 const normalized=query.normalize('NFC').replace(/\s/g,'').toLowerCase();
 const rows=state.actors.filter(a=>a.nickname.replace(/\s/g,'').toLowerCase().includes(normalized));
 return <div data-automation-nickname-picker style={{position:'relative',width:'100%',minWidth:0,boxSizing:'border-box',pointerEvents:'auto',color:foreground}}
   onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&state.open){e.preventDefault();e.stopPropagation();close()}}}>
   <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
     <button ref={trigger} type="button" disabled={disabled||state.busy} aria-haspopup="dialog" aria-expanded={state.open}
       aria-label={'보내는 이름: '+(state.selected?.nickname||'내 닉네임')+', 닉네임 선택'}
       onMouseDown={e=>e.preventDefault()} onClick={()=>{state.setOpen(!state.open);if(!state.open){setQuery('');void state.refresh()}}}
       style={{...button,display:'flex',alignItems:'center',gap:6,minWidth:0,maxWidth:'100%',textAlign:'left'}}>
       <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>보내는 이름: {state.selected?.nickname||'내 닉네임'}</span><span aria-hidden="true">▾</span>
     </button>
     {state.selected?<button type="button" onMouseDown={e=>e.preventDefault()} disabled={disabled||state.busy} onClick={()=>void state.reset()} style={{...button,flexShrink:0}}>내 닉네임</button>:null}
   </div>
   {state.message?<div role="status" style={{fontSize:12,lineHeight:1.4,color:muted,padding:'4px 2px'}}>{state.message}</div>:null}
   {state.open?<div role="dialog" aria-label="보내는 닉네임 선택" aria-modal="false" style={{position:'absolute',left:0,right:0,bottom:'calc(100% + 8px)',zIndex:5,background,color:foreground,border:dark?'1px solid #707072':'1px solid #CACACB',borderRadius:16,boxShadow:'0 4px 20px rgba(0,0,0,0.2)',padding:12,maxHeight:'min(42dvh, 340px)',display:'flex',flexDirection:'column',boxSizing:'border-box'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
       <strong style={{fontSize:15}}>보내는 닉네임</strong><button type="button" onClick={close} style={button} aria-label="닉네임 선택 닫기">닫기</button>
     </div>
     {state.actors.length>8?<input aria-label="닉네임 검색" placeholder="닉네임 검색" value={query} onChange={e=>setQuery(e.target.value)} style={{boxSizing:'border-box',width:'100%',minHeight:44,margin:'8px 0',border:'1px solid #CACACB',borderRadius:12,padding:'8px 12px',fontSize:16,background,color:foreground}}/>:null}
     {!query&&state.recent.length?<div aria-label="최근 선택 3개" style={{display:'flex',gap:8,overflowX:'auto',flexShrink:0,padding:'6px 0'}}>
       {state.recent.map(id=>state.actors.find(a=>a.id===id)).filter(a=>!!a).map(a=><button type="button" key={a.id} disabled={disabled||state.busy||(a.inUse&&!a.mine)} style={{...button,flexShrink:0}} onMouseDown={e=>e.preventDefault()} onClick={()=>void choose(a.id)}>{a.nickname}</button>)}
       <button type="button" style={{...button,flexShrink:0,color:muted}} onClick={state.clearRecent}>최근 목록 비우기</button>
     </div>:null}
     <div data-live-scroll="1" style={{overflowY:'auto',overscrollBehavior:'contain',minHeight:0}}>
       {rows.map(a=><div key={a.id}><div style={{display:"flex",alignItems:"center"}}><button data-actor-option type="button" key={a.id} disabled={disabled||state.busy||(a.inUse&&!a.mine)}
         aria-label={a.nickname+(a.inUse&&!a.mine?', 다른 관리자 사용 중':'')} aria-pressed={state.selected?.id===a.id}
         onMouseDown={e=>e.preventDefault()} onClick={()=>choose(a.id)}
         style={{...button,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,textAlign:'left',marginTop:4,background:state.selected?.id===a.id?(dark?'#39393B':'#F5F5F5'):'transparent',color:a.inUse&&!a.mine?muted:foreground}}>
         <span style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.nickname}{a.used?<small style={{display:"block",fontSize:11,color:dark?"#8CE8CA":"#12664F"}}>● 사용함</small>:null}</span>
         <span style={{flexShrink:0,fontSize:12,color:muted}}>{a.inUse&&!a.mine?'사용 중':a.activity.orders?'주문서 '+a.activity.orders+'건':a.activity.cart?'장바구니 있음':'접속 중'}</span>
       </button>{a.activity.orders>0?<button type="button" style={{...button,flexShrink:0,fontSize:12}} aria-expanded={detail===a.id} aria-label={a.nickname+' 주문 내역 보기'} onClick={()=>void showOrders(a.id)}>내역 보기</button>:null}</div>
       {detail===a.id?<div role="region" aria-label={a.nickname+' 제출 당시 주문 기록'} style={{padding:'8px 12px',fontSize:12,lineHeight:1.6,background:dark?'#29292B':'#F5F5F5',borderRadius:10}}>
        <strong>제출 당시 기록</strong>{orderLoading?<p>불러오는 중…</p>:orderError?<p role="status">{orderError}</p>:orders.length?orders.map(o=><div key={o.id} style={{padding:'8px 0',borderTop:'1px solid '+muted}}><div>{new Date(o.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}{o.deleted?' · 삭제된 주문':''}</div>{o.lines.map((line,i)=><div key={i}>{line.name} {[line.color,line.size].filter(Boolean).join(' / ')} · {line.qty}개</div>)}</div>):<p>남아 있는 제출 기록이 없어요.</p>}
       </div>:null}</div>)}
       {!rows.length?<p style={{margin:'12px 4px',fontSize:13,color:muted}}>{query?'일치하는 닉네임이 없어요.':'이 방송에서 활동 중인 닉네임이 아직 없어요.'}</p>:null}
     </div>
   </div>:null}
 </div>;
}
