import type {SupabaseClient} from '@supabase/supabase-js';
type Activity={sessions:{id:string;actorId:string;visitorKey:string}[];holds:Record<string,unknown>[]};
export async function readAutomationAdminActivity(db:SupabaseClient):Promise<Activity>{
 const {data,error}=await db.rpc('live_automation_admin_activity');
 if(error)throw Error(error.message);
 return {sessions:data?.sessions||[],holds:data?.holds||[]};
}
