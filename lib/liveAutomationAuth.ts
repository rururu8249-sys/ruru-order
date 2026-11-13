import {createHmac,timingSafeEqual} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AUTOMATION_HEADER,AUTOMATION_OWNER,AUTOMATION_PHONE} from './liveAutomation';
import type {Persona} from './liveAutomationPersona';

export type AutomationScope='presence'|'cart'|'order'|'chat';
export type Capability={session:string;action?:string;lease?:string;revision:number;scope:AutomationScope;expires?:number};
export type AutomationContext={
  campaign:{id:string;broadcast_id:string;revision:number;orders_enabled:boolean;chat_enabled:boolean;viewers_enabled:boolean;next_order_at:string|null;last_submitted_at:string|null;run_id:string;max_active:number;next_join_at:string|null;updated_at:string};
  actor:{id:string;customer_id:number;nickname:string;profile:Persona;order_target:number;order_count:number;greeting_count:number;last_chat_at:string|null};
  session:{id:string;actor_id:string;campaign_id:string;cart_key:string;visitor_key:string;leave_at:string;joined_at:string;stopped_at:string|null;last_ack_at:string|null;watching:boolean;driver:'server'|'browser'};
};
export class AutomationError extends Error { constructor(message:string,public status=403){super(message);} }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function secretKey():string {
  return process.env.LIVE_AUTOMATION_SIGNING_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}
const signature=(text:string,secret:string)=>createHmac('sha256',secret).update('live-automation-v1:'+text).digest('base64url');
export function signAutomationCapability(input:Capability,secret=secretKey(),now=Date.now()):string {
  if(secret.length<32) throw new AutomationError('AUTOMATION_SIGNING_NOT_READY',503);
  const data=Buffer.from(JSON.stringify({...input,expires:now+60_000})).toString('base64url');
  return data+'.'+signature(data,secret);
}
export function verifyAutomationCapability(token:string,scope:AutomationScope,secret=secretKey(),now=Date.now()):Capability|null {
  try {
    if(secret.length<32 || token.length>2048) return null;
    const [data,sig,...rest]=token.split('.');
    if(!data || !sig || rest.length) return null;
    const expected=signature(data,secret);
    if(sig.length!==expected.length || !timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const value=JSON.parse(Buffer.from(data,'base64url').toString('utf8')) as Capability;
    if(!UUID.test(value.session) || value.scope!==scope || !Number.isSafeInteger(value.revision) || value.revision<0 ||
      !Number.isFinite(value.expires) || value.expires!<=now || value.expires!>now+60_000) return null;
    if(scope!=='presence' && (!UUID.test(value.action||'') || !UUID.test(value.lease||''))) return null;
    return value;
  } catch {return null;}
}
type Identity={owner?:unknown;phone?:unknown;sessionKey?:unknown};
export function reservedAutomationIdentity(value:Identity):boolean {
  return String(value.owner??'')===AUTOMATION_OWNER || String(value.phone??'').replace(/\D/g,'')===AUTOMATION_PHONE || String(value.sessionKey??'').startsWith('live-auto:');
}
export async function readAutomationRequest(request:Request,identity:Identity,scope:AutomationScope,db:SupabaseClient):Promise<(AutomationContext & {capability:Capability})|null> {
  const token=request.headers.get(AUTOMATION_HEADER)||'';
  if(!token && !reservedAutomationIdentity(identity)) return null;
  const capability=verifyAutomationCapability(token,scope);
  if(!capability) throw new AutomationError('AUTOMATION_AUTH_REQUIRED');
  if(identity.owner && String(identity.owner)!==AUTOMATION_OWNER) throw new AutomationError('AUTOMATION_OWNER_MISMATCH');
  if(identity.phone && String(identity.phone).replace(/\D/g,'')!==AUTOMATION_PHONE) throw new AutomationError('AUTOMATION_OWNER_MISMATCH');
  const {data,error}=await db.rpc('live_automation_context',{p_session:capability.session,p_revision:capability.revision,p_scope:scope});
  if(error || !data) throw new AutomationError(error?.message||'SESSION_ENDED');
  const ctx=data as AutomationContext;
  if(identity.sessionKey && String(identity.sessionKey)!==ctx.session.cart_key && String(identity.sessionKey)!==ctx.session.visitor_key) throw new AutomationError('AUTOMATION_SESSION_MISMATCH');
  return {...ctx,capability};
}
