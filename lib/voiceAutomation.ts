/** Internal budget allocations, NOT settled provider/card charges. Deployment must
 * validate the FX/tax/server policy before setting VOICE_AUTOMATION_READY=1. */
export const VOICE_RATE_VERSION = "2026-11-11-usd1600-tax10-card3-reserve25";
export const DEFAULT_VOICE_CAP_KRW = 40000;
export const DEFAULT_CAPTURE_PHRASE = "상품 사진 저장";
export type VoiceBudget = {
  broadcast_id: string; cap_krw: number; committed_krw: number; enabled: boolean;
  stop_reason: string | null; stopped_at: string | null; warning_at: string | null;
  worker_seen_at: string | null; rate_version: string | null; capture_phrase: string;
};
export type VoiceCost = {kind:"transcription"; seconds:number} | {kind:"context"; inputTokenBound:number; outputTokenBound:number};
export function voiceCostBound(cost: VoiceCost): number {
  const valid=(n:number,max:number)=>Number.isFinite(n)&&n>0&&n<=max;
  let usd:number;
  if(cost.kind==="transcription") {
    if(!valid(cost.seconds,360)) throw new Error("Invalid audio chunk duration");
    usd=Math.ceil(cost.seconds)/60*0.017;
  } else {
    if(!Number.isSafeInteger(cost.inputTokenBound)||!valid(cost.inputTokenBound,200000)
      ||!Number.isSafeInteger(cost.outputTokenBound)||!valid(cost.outputTokenBound,4000)) throw new Error("Invalid token bounds");
    usd=(cost.inputTokenBound*0.75+cost.outputTokenBound*4.5)/1000000;
  }
  return Math.max(1,Math.ceil(usd*1600*1.10*1.03*1.25));
}
export type VoiceReservation = {allowed:boolean; reason?:string};
/** Never retry a provider request automatically. A new attempt needs its own
 * reservation. A timeout leaves its reserved amount consumed conservatively. */
export async function withVoiceBudget<T>(reserve:()=>Promise<VoiceReservation>,invoke:()=>Promise<T>) {
  const authorization=await reserve();
  if(!authorization.allowed) return {executed:false as const,reason:authorization.reason??"denied"};
  return {executed:true as const,value:await invoke()};
}
export function voiceDisplayState(row:VoiceBudget|null,ready:boolean,now=Date.now()) {
  if(row?.stop_reason==="budget") return "budget_stopped";
  if(row?.stop_reason==="error") return "error";
  if(row?.stop_reason==="worker") return "offline";
  if(row?.enabled && (!ready || !row.worker_seen_at || !Number.isFinite(Date.parse(row.worker_seen_at)) || now-Date.parse(row.worker_seen_at)>30000)) return "offline";
  if(!ready || !row?.worker_seen_at || now-Date.parse(row.worker_seen_at)>30000) return "not_ready";
  if(!row.enabled) return "paused";
  return row.committed_krw>=row.cap_krw*0.8 ? "warning":"running";
}
export type CaptureTarget={productId:string;detailName:string};
const normalizePhrase=(s:string)=>s.normalize("NFKC").trim().replace(/[.!。！]+$/u,"").replace(/\s+/gu,"");
/** Only a complete, finalized utterance equal to the configured command counts.
 * Caller binds this target to the audio segment's timestamp, not callback time. */
export function resolveCaptureCommand(transcript:string,phrase:string,target:CaptureTarget|null) {
  if(phrase.trim().length<4 || normalizePhrase(transcript)!==normalizePhrase(phrase)) return {action:"ignore" as const};
  if(!target?.productId || !/^\d+$/.test(target.productId)) return {action:"hold" as const,reason:"상품을 먼저 소개해 주세요."};
  return {action:"capture" as const,target:{...target}};
}
