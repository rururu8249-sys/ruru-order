"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {estimateServerAnchor,readServerTime,samplePlayback,type Playback,type ServerAnchor} from '@/lib/eventPlayback';

type Envelope = {ok?:boolean;server_now?:number;playback?:Playback|null;event?:{id?:string|null;status?:string|null}|null};
type Sync = 'loading'|'ready'|'checking'|'error';
export function useEventPlayback<T extends Envelope=Envelope>({url,hideInitialCompleted=false}:{url:string;hideInitialCompleted?:boolean}) {
  const [payload,setPayload]=useState<T|null>(null);
  const [sync,setSync]=useState<Sync>('loading');
  const [serverNowMs,setServerNowMs]=useState(0);
  const retryRef=useRef<()=>void>(()=>{});
  const retry=useCallback(()=>retryRef.current(),[]);
  useEffect(()=>{
    if(!url){setPayload(null);setSync('loading');setServerNowMs(0);return;}
    let disposed=false,sequence=0,controller:AbortController|null=null;
    let poll:number|undefined,deadline:number|undefined,raf=0;
    let anchor:ServerAnchor|null=null,lastSuccess=0,current:T|null=null,lastPaint=0;
    let firstSuccess=true,hiddenEventId:string|null=null;
    setPayload(null);setSync('loading');setServerNowMs(0);
    const clearTimers=()=>{window.clearTimeout(poll);window.clearTimeout(deadline);};
    const schedule=()=>{
      if(disposed||document.visibilityState==='hidden')return;
      const phase=current?.playback&&anchor?samplePlayback(current.playback,readServerTime(anchor,performance.now())):null;
      poll=window.setTimeout(()=>void load(),phase?.phase==='running'||phase?.phase==='waiting'?250:2500);
    };
    async function load(){
      if(disposed||controller)return;
      window.clearTimeout(poll);
      const id=++sequence,ctrl=new AbortController();controller=ctrl;
      const sent=performance.now();
      deadline=window.setTimeout(()=>{if(disposed||id!==sequence)return;sequence++;ctrl.abort();controller=null;current=null;setPayload(null);setSync('error');schedule();},5000);
      try {
        const response=await fetch(url,{method:'GET',cache:'no-store',signal:ctrl.signal});
        const data=await response.json() as T;
        if(disposed||id!==sequence||ctrl.signal.aborted)return;
        const received=performance.now();
        if(response.status===404){current=null;setPayload(null);setSync('ready');return;}
        if(!response.ok||!data.ok||!Number.isFinite(data.server_now))throw new Error('Invalid overlay clock response');
        const next=data.playback;
        if(next&&current?.playback&&next.startedAtMs<current.playback.startedAtMs){setSync('checking');return;}
        anchor=estimateServerAnchor(data.server_now!,sent,received);lastSuccess=received;
        if(firstSuccess){
          firstSuccess=false;
          const finished=next ? samplePlayback(next,data.server_now!).phase==='done' : data.event?.status==='result';
          if(hideInitialCompleted&&finished)hiddenEventId=data.event?.id||next?.key||null;
        }
        const identity=data.event?.id||next?.key||null;
        current=data;setPayload(hiddenEventId&&identity===hiddenEventId?null:data);setServerNowMs(readServerTime(anchor,received));
        setSync(anchor.uncertaintyMs>500?'checking':'ready');
      }catch{
        if(disposed||id!==sequence||ctrl.signal.aborted)return;
        current=null;setPayload(null);setSync('error');
      }finally{
        if(!disposed&&id===sequence){window.clearTimeout(deadline);controller=null;schedule();}
      }
    }
    const restart=()=>{
      if(disposed)return;
      sequence++;controller?.abort();controller=null;clearTimers();setSync('checking');void load();
    };
    retryRef.current=restart;
    const visibility=()=>{
      if(document.visibilityState==='visible')restart();
      else {sequence++;controller?.abort();controller=null;clearTimers();}
    };
    document.addEventListener('visibilitychange',visibility);
    const paint=(now:number)=>{
      if(disposed)return;
      if(anchor&&now-lastPaint>=32){
        lastPaint=now;setServerNowMs(readServerTime(anchor,now));
        if(current&&(now-lastSuccess>5000||anchor.uncertaintyMs>500))setSync('checking');
      }
      raf=requestAnimationFrame(paint);
    };
    raf=requestAnimationFrame(paint);void load();
    return()=>{disposed=true;sequence++;controller?.abort();clearTimers();cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);retryRef.current=()=>{};};
  },[url,hideInitialCompleted]);
  return {payload,phase:payload?.playback?samplePlayback(payload.playback,serverNowMs):null,sync,serverNowMs,retry};
}
