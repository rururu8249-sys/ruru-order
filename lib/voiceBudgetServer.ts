import type {SupabaseClient} from "@supabase/supabase-js";
import {VOICE_RATE_VERSION,voiceCostBound,withVoiceBudget,type VoiceCost} from "./voiceAutomation";

/** Worker entry point. Every paid chunk/context request must pass through here.
 * The relay itself must run separately so AI stopping never stops YouTube. */
export function runBudgetedVoiceRequest<T>(sb:SupabaseClient,scope:{broadcastId:string;workerId:string;requestId:string},cost:VoiceCost,invoke:()=>Promise<T>) {
  return withVoiceBudget(async()=>{
    const {data,error}=await sb.rpc("voice_reserve",{
      p_broadcast:scope.broadcastId,p_worker:scope.workerId,p_request:scope.requestId,
      p_kind:cost.kind,p_amount:voiceCostBound(cost),p_rate_version:VOICE_RATE_VERSION,
    });
    if(error || typeof data?.allowed!=="boolean") throw new Error("음성 예산 확인 실패: 유료 요청을 차단했습니다.");
    return data;
  },invoke);
}
