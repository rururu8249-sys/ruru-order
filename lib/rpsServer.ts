import type { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/youtube';
import { verifyAdminSessionFromRequest } from '@/lib/admin-auth';
import { chatIdentityFromRequest, verifiedChatRole } from '@/lib/liveChatSession';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function rpsAccess(req: NextRequest) {
 const identity=chatIdentityFromRequest(req);
 const admin=!!await verifyAdminSessionFromRequest(req) || (identity ? (await verifiedChatRole(getServiceClient(),identity)).isOwner : false);
 return {identity,admin};
}
export async function rpsState() {
 const {data,error}=await getServiceClient().from('rps_public').select('payload').eq('id',1).single();
 if(error)throw error;
 return data.payload;
}
