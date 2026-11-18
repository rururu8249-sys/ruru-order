/** Read-only statistics from actual site customer chat and actual orders.
 * No customer identities, amounts, or raw customer messages are sent to the LLM.
 * TEST/automation orders are explicitly excluded.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type RawRow = Record<string, unknown>;
type HumanLine = {body?:unknown; created_at?:unknown; kakao_id?:unknown; avatar_url?:unknown};
const cleaned = (v:unknown) => String(v ?? '').replace(/\s+/g,' ').trim();
const cache = new Map<string,{until:number;result:RoomSignals}>();
export type RoomSignals = { style:string; realOrderProducts:string[] };

export function summarizeRealChatStyle(rows:HumanLine[]): string {
  const filtered=rows.filter(r=>cleaned(r.body) && cleaned(r.avatar_url)!=='autotest')
    .sort((a,b)=>Date.parse(String(a.created_at||''))-Date.parse(String(b.created_at||'')));
  if (filtered.length<8) return '실제 고객 채팅 표본 부족: 문장 개수나 발언 간격을 강제하지 않는다.';
  const lengths=filtered.map(r=>cleaned(r.body).length).sort((a,b)=>a-b);
  const median=lengths[Math.floor(lengths.length/2)];
  const questions=filtered.filter(r=>/[?？]|나요|까요|어때요|인가요|되나요/.test(cleaned(r.body))).length;
  let followups=0, opportunities=0;
  for(let i=1;i<filtered.length;i++){
    const prev=filtered[i-1],curr=filtered[i];
    const diff=Date.parse(String(curr.created_at||''))-Date.parse(String(prev.created_at||''));
    if(!Number.isFinite(diff)||diff<0||diff>90_000)continue;
    opportunities++;
    if(cleaned(prev.kakao_id)&&cleaned(curr.kakao_id)===cleaned(prev.kakao_id))followups++;
  }
  return `실제 채팅 ${filtered.length}줄 분석: 글자수 중앙값 ${median}자, 질문 약 ${Math.round(questions/filtered.length*100)}%, 90초 안에 연속으로 나타난 글 중 같은 작성자 비율 약 ${opportunities?Math.round(followups/opportunities*100):0}%. 이는 참고 통계일 뿐, 같은 길이·문장 수·간격을 따라 하거나 특정 패턴을 강제하지 않는다.`;
}

export function summarizeRealOrderProducts(rows:{product_name?:unknown}[]):string[]{
  const counts=new Map<string,number>();
  for(const row of rows){
    const name=cleaned(row.product_name).slice(0,70);
    if(name.length<2)continue;
    counts.set(name,(counts.get(name)||0)+1);
  }
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name])=>name);
}

export async function readRoomSignals(db:SupabaseClient,broadcastId:string,now=Date.now()):Promise<RoomSignals>{
  const prior=cache.get(broadcastId);
  if(prior&&now<prior.until)return prior.result;
  const [chat,orders]=await Promise.all([
    db.from('live_chat_messages').select('body,created_at,kakao_id,avatar_url')
      .is('automation_actor_id',null).is('hidden_at',null).or('badge.is.null,badge.neq.bot')
      .gte('created_at',new Date(now-21*86400000).toISOString())
      .order('id',{ascending:false}).limit(240),
    db.from('orders').select('product_name,created_at')
      .eq('broadcast_id',broadcastId).eq('is_test_order',false).is('automation_actor_id',null)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at',{ascending:false}).limit(150)
  ]);
  const result:RoomSignals={
    style:chat.error?'실제 고객 채팅 통계를 읽지 못함. 추정하거나 강제하지 않는다.':summarizeRealChatStyle((chat.data||[]) as HumanLine[]),
    realOrderProducts:orders.error?[]:summarizeRealOrderProducts((orders.data||[]) as RawRow[])
  };
  cache.set(broadcastId,{until:now+10*60_000,result});
  if(cache.size>16)cache.clear();
  return result;
}
