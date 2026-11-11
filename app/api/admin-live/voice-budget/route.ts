import {NextRequest,NextResponse} from "next/server";
import {verifyAdminSessionFromRequest} from "@/lib/admin-auth";
import {getServiceClient} from "@/lib/youtube";
import {DEFAULT_CAPTURE_PHRASE,voiceDisplayState} from "@/lib/voiceAutomation";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const validId=(value:unknown)=>typeof value==="string"&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const ready=()=>process.env.VOICE_AUTOMATION_READY==="1";
export async function GET(request:NextRequest) {
  if(!await verifyAdminSessionFromRequest(request)) return reply({error:"관리자 로그인이 필요합니다."},401);
  const id=request.nextUrl.searchParams.get("broadcastId");
  if(!validId(id)) return reply({error:"방송을 선택해 주세요."},400);
  try {
    const sb=getServiceClient();
    const [{data:budget,error},{data:events,error:eventError}]=await Promise.all([
      sb.from("voice_budgets").select("broadcast_id,cap_krw,committed_krw,enabled,stop_reason,stopped_at,warning_at,worker_seen_at,rate_version,capture_phrase").eq("broadcast_id",id).maybeSingle(),
      sb.from("voice_budget_events").select("id,kind,cap_krw,committed_krw,created_at").eq("broadcast_id",id).order("created_at",{ascending:false}).limit(5),
    ]);
    if(error||eventError) throw new Error("read_failed");
    return reply({budget,events,ready:ready(),state:voiceDisplayState(budget,ready()),captureReady:false});
  } catch {return reply({error:"음성 자동화 상태를 확인하지 못했어요. 작동 여부를 확인해 주세요."},503);}
}
export async function POST(request:NextRequest) {
  if(!await verifyAdminSessionFromRequest(request)) return reply({error:"관리자 로그인이 필요합니다."},401);
  const origin=request.headers.get("origin");
  if(origin && origin!==request.nextUrl.origin) return reply({error:"잘못된 요청입니다."},403);
  const body=await request.json().catch(()=>null);
  if(!body||!validId(body.broadcastId)||!["save","stop","resume"].includes(body.action)||!Number.isSafeInteger(body.capKrw)||body.capKrw<1000||body.capKrw>1000000)
    return reply({error:"한도는 1,000원~1,000,000원 사이로 입력해 주세요."},400);
  if(body.action==="resume"&&!ready()) return reply({error:"음성 서버와 API 연결 확인이 먼저 필요합니다. 아직 자동화는 켜지지 않았어요."},409);
  try {
    const sb=getServiceClient();
    // Preserve the separately configured capture command when only budget changes.
    const current=await sb.from("voice_budgets").select("capture_phrase").eq("broadcast_id",body.broadcastId).maybeSingle();
    if(current.error) throw new Error("read_failed");
    const {data,error}=await sb.rpc("voice_configure",{p_broadcast:body.broadcastId,p_action:body.action,p_cap:body.capKrw,p_phrase:current.data?.capture_phrase??DEFAULT_CAPTURE_PHRASE});
    if(error) {
      const message=error.message.includes("worker_not_ready")?"음성 서버 연결이 끊겼어요. 연결 확인 후 다시 켜 주세요.":error.message.includes("below_committed")?"이미 계산된 금액보다 낮은 한도는 저장할 수 없어요.":error.message.includes("budget_exhausted")?"현재 한도에 도달했어요. 금액을 확인하고 한도를 높여 주세요.":error.message.includes("broadcast_not_active")?"진행 중인 방송에서만 음성 자동화를 켤 수 있어요.":"설정을 저장하지 못했어요. 다시 시도해 주세요.";
      return reply({error:message},409);
    }
    return reply({budget:data,ready:ready(),state:voiceDisplayState(data,ready())});
  } catch {return reply({error:"설정을 저장하지 못했어요. 기존 한도는 유지됩니다."},503);}
}
