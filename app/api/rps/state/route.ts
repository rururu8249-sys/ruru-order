import {NextResponse} from 'next/server';
import {rpsState} from '@/lib/rpsServer';
export const dynamic='force-dynamic';
export async function GET() {
 try {return NextResponse.json({ok:true,state:await rpsState(),serverTime:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=0','CDN-Cache-Control':'max-age=1','Vercel-CDN-Cache-Control':'max-age=1'}});}
 catch{return NextResponse.json({ok:false,message:'게임 연결을 확인하고 있어요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
