import type {NextRequest} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {chatIdentityFromRequest,verifiedChatRole,verifyChatIdentity,CHAT_SESSION_COOKIE} from '@/lib/liveChatSession';
import {isAutoTestViewerIdentity} from '@/lib/autoTestOrder';
export const MANUAL_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ManualChatSelection={token:string;clientId:string;requestId:string;nickname?:string};
export type ManualActor={used?:boolean;id:string;nickname:string;activity:{used?:boolean;present:boolean;cart:boolean;orders:number};inUse:boolean;mine:boolean;expiresAt:string|null};
export async function manualChatOperator(request:NextRequest,db:SupabaseClient):Promise<string|null> {
  const admin=await verifyAdminSessionFromRequest(request);
  if(admin) return 'admin:'+admin.sub;
  const identity=chatIdentityFromRequest(request);
  if(!identity) {
    // [2026-11-14 23:50 사장님 「이 사람만 강제로」] 부관리자 김현아(문성)만: 화면 쪽 계정 표시가 어긋나도
    // 서버가 서명한 카카오 로그인 쿠키만으로 확인되면 허용. 다른 계정은 예전 그대로.
    try {
      const cookieOnly=verifyChatIdentity(request.cookies?.get?.(CHAT_SESSION_COOKIE)?.value);
      return cookieOnly&&isAutoTestViewerIdentity(cookieOnly) ? 'kakao:'+cookieOnly.sub : null;
    } catch { return null; }
  }
  const role=await verifiedChatRole(db,identity);
  // Only provider-signed phone/identity and current owner configuration grant access.
  // Generic moderators and editable request/profile phone numbers do not.
  return role.isOwner || isAutoTestViewerIdentity(identity) ? 'kakao:'+identity.sub : null;
}
export function validManualSelection(value:unknown):value is ManualChatSelection {
  if(!value || typeof value!=='object') return false;
  const v=value as Record<string,unknown>;
  return ['token','clientId','requestId'].every(k=>typeof v[k]==='string' && MANUAL_UUID.test(v[k] as string));
}
export function manualChatFailure(error:unknown):{message:string;status:number} {
  const value=error instanceof Error?error.message:String(error);
  if(/IN_USE/.test(value)) return {message:'다른 관리자가 사용 중인 이름이에요.',status:409};
  if(/LEASE_LOST|NOT_ELIGIBLE/.test(value)) return {message:'사용 상태가 바뀌었어요. 닉네임을 다시 선택해 주세요.',status:409};
  if(/TOO_FAST/.test(value)) return {message:'조금 천천히 보내 주세요.',status:429};
  if(/IDEMPOTENCY/.test(value)) return {message:'이전 전송 결과를 확인한 뒤 다시 보내 주세요.',status:409};
  return {message:'사용 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',status:503};
}
