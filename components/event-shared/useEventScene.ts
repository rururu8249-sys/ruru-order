"use client";
import {useMemo} from 'react';
import {eventSeed,type Playback,type PlaybackInput} from '@/lib/eventPlayback';
import {useEventPlayback} from './useEventPlayback';

type EventPayload={ok:boolean;server_now:number;playback:Playback|null;event:{id:string;title?:string;status:string;participants:{nickname:string}[];survivors?:string[];winner_nickname?:string;winner_note?:string|null;winner_count?:number;spin_started_at?:string|null;result_at?:string|null}};
// Metadata refreshes must not regenerate the scene or restart its clock.
export function useEventScene<S>({url,kind,build,showInitialResult=false}:{url:string;kind:'survival'|'race';build:(input:PlaybackInput,seed:number)=>S;showInitialResult?:boolean}){
  const playback=useEventPlayback<EventPayload>({url,hideInitialCompleted:!showInitialResult});
  const event=playback.payload?.event;
  const identity=JSON.stringify([event?.id,event?.participants,event?.survivors,event?.winner_nickname,playback.payload?.playback?.seed]);
  const scene=useMemo(()=>{
    if(!event)return null;
    const participants=event.participants.map(p=>p.nickname);
    const winners=event.survivors|| (event.winner_nickname?[event.winner_nickname]:[]);
    return build({id:event.id,kind,status:event.status,startedAt:event.spin_started_at||event.result_at||null,durationMs:playback.payload?.playback?.durationMs||null,participants,winners},playback.payload?.playback?.seed??eventSeed(event.id));
    // The immutable scene inputs above deliberately exclude title and polling object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,kind,build]);
  const elapsed=playback.phase?.phase==='waiting'?-1:playback.phase?.elapsedMs??(event?.status==='result'?Number.MAX_SAFE_INTEGER:-1);
  return {...playback,event,scene,elapsed,key:playback.payload?.playback?.key||event?.id||''};
}
