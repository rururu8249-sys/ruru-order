'use client';
import type {GiftState} from './useEventCustomGift';
export default function EventCustomGiftStatus({states,retry}:{states:Record<string,GiftState>;retry:(id:string)=>Promise<void>}){
 return <div aria-live="polite">{Object.entries(states).map(([id,state])=><div key={id} style={{padding:'8px',marginTop:4,border:'1px solid #ddd',borderRadius:8,overflowWrap:'anywhere'}}>
  {state.status==='added'&&state.result?.ok?`경품 추가 완료 · ${state.result.productName} · 주문 ${state.result.lookupCode||state.result.orderGroupId||state.result.orderId}${state.result.targetState!=='active'?' (현재 취소/삭제 상태)':''}`:state.status==='adding'?'경품을 주문서에 추가 중…':state.message||'경품 처리 대기'}
  {['failed','unknown','pending'].includes(state.status)&&<button className="btn" onClick={()=>void retry(id)}>등록 재확인·재시도</button>}
 </div>)}</div>;
}
