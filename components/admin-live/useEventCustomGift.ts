'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {EventCustomGiftResult} from '@/lib/eventCustomGift';
export type GiftState={status:'pending'|'adding'|'added'|'failed'|'unknown';result?:EventCustomGiftResult;message?:string};
export function useEventCustomGift(winners:readonly {winnerId:string;isTest:boolean;customGiftName:string|null}[]){
 const [states,setStates]=useState<Record<string,GiftState>>({});
 const seen=useRef(new Set<string>()), busy=useRef(new Set<string>()),done=useRef(new Set<string>());
 const eligible=useRef(new Set<string>());
 eligible.current=new Set(winners.filter(w=>!w.isTest&&w.customGiftName).map(w=>w.winnerId));
 const retry=useCallback(async(winnerId:string)=>{
  if(!eligible.current.has(winnerId)||busy.current.has(winnerId)||done.current.has(winnerId))return;
  busy.current.add(winnerId);setStates(s=>({...s,[winnerId]:{status:'adding'}}));
  try{
   const response=await fetch('/api/admin-live/event-custom-gift',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({winnerId}),signal:AbortSignal.timeout(20000)});
   const result=await response.json() as EventCustomGiftResult;
   if(!response.ok||!result.ok){setStates(s=>({...s,[winnerId]:{status:'failed',message:!result.ok?result.message:'경품 등록 실패'}}));return;}
   if(!result.orderId||!['added','already_added'].includes(result.status))throw new Error('Invalid receipt');
   done.current.add(winnerId);setStates(s=>({...s,[winnerId]:{status:'added',result}}));
   window.dispatchEvent?.(new Event('event-custom-gift-added'));
  }catch{setStates(s=>({...s,[winnerId]:{status:'unknown',message:'저장 결과 확인이 필요합니다. 같은 당첨 건으로 재시도해 주세요.'}}));}
  finally{busy.current.delete(winnerId);}
 },[]);
 const key=winners.filter(w=>!w.isTest&&w.customGiftName).map(w=>w.winnerId).join(',');
 useEffect(()=>{for(const id of key.split(',').filter(Boolean)){if(seen.current.has(id))continue;seen.current.add(id);void retry(id);}},[key,retry]);
 return {states,retry};
}
