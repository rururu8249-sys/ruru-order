import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {getServiceClient} from '@/lib/youtube';
import {runAutomationTick} from '@/lib/liveAutomationWorker';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){return NextResponse.json({ok:false,message:'Retired dispatcher'},{status:410})}
export async function POST(request:NextRequest){
 const token=request.headers.get('authorization')?.match(/^Bearer (\S{1,256})$/)?.[1];
 if(!token)return NextResponse.json({ok:false},{status:401});
 try{
   const db=getServiceClient();
   const auth=await db.rpc('live_automation_authorize_tick',{p_hash:createHash('sha256').update(token).digest('hex')});
   if(auth.error||auth.data!==true)return NextResponse.json({ok:false},{status:401});
   const body=await request.json().catch(()=>null);
   if(!['presence','actions'].includes(body?.kind))return NextResponse.json({ok:false},{status:400});
   const result=await runAutomationTick(db,request.nextUrl.origin,body.kind);
   return NextResponse.json({ok:true,...result});
 }catch{return NextResponse.json({ok:false,message:'Dispatch failed'},{status:503})}
}
