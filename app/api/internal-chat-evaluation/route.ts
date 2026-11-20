// Temporary authenticated model evaluation; remove after this investigation.
import {createHash} from 'node:crypto';
import {callGeminiJson} from '@/lib/geminiJson';
export const maxDuration=30;
const TOKEN_HASH='e3193b3fcc2b9cb74e689b6974ef227685ae0446b3e3caf940dfd82428638ea6';
export async function POST(request:Request){
 if(Date.now()>Date.parse('2026-11-21T01:00:00Z'))return new Response(null,{status:404});
 const token=request.headers.get('authorization')||'';
 if(createHash('sha256').update(token).digest('hex')!==TOKEN_HASH)return new Response(null,{status:401});
 const input=await request.json().catch(()=>null);
 if(typeof input?.prompt!=='string'||!input.prompt.trim()||input.prompt.length>16000)return new Response(null,{status:400});
 const result=await callGeminiJson(input.prompt,{models:['gemini-3.5-flash-lite'],maxAttempts:1,timeoutMs:12000,maxTokens:500,temperature:.8,priority:'background'});
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
