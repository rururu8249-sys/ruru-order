// lib/liveAutomationLearning.ts
// [2026-11-14 사장님 「학습노트 진행」] 가상 손님 AI 채팅의 «학습 노트» — 순수 함수만(서버·화면 공용).
//   Gemini 는 스스로 배우지 못하므로, 채팅에서 배운 것을 settings 한 줄에 저장해 두고 매번 AI 에게 같이 보여 준다.
//   rules = 지킬 규칙(짧게), good = 실제 손님·사장님이 쓴 자연스러운 말(그대로 있는 글만), bad = 사장님이 지운 AI 글.
//   돈·주문·입금 무접촉. 전화번호 같은 개인정보는 담지 않는다(번호 모양은 걸러냄).
export const LEARNING_KEY='live_automation_learning_v1';
export const LEARNING_LIMITS={rules:12,good:15,bad:20,dismissed:100,len:60} as const;
export type LearningList='rules'|'good'|'bad';
export type LearningNotes={updatedAt:string;lastMessageId:number;rules:string[];good:string[];bad:string[];dismissed:string[]};
export const emptyLearning=():LearningNotes=>({updatedAt:'',lastMessageId:0,rules:[],good:[],bad:[],dismissed:[]});
const one=(s:unknown)=>String(s??'').replace(/[^]*/g,'').replace(/\s+/g,' ').trim();
const list=(v:unknown)=>Array.isArray(v)?v.map(one).filter(Boolean):[];
/** 저장값 읽기 — 이상한 값이면 빈 노트 */
export function parseLearning(v:unknown):LearningNotes{
 let o:unknown=v;
 if(typeof v==='string'){try{o=JSON.parse(v)}catch{return emptyLearning()}}
 if(!o||typeof o!=='object')return emptyLearning();
 const r=o as Record<string,unknown>;
 return {updatedAt:typeof r.updatedAt==='string'?r.updatedAt:'',lastMessageId:Number(r.lastMessageId)||0,
  rules:list(r.rules).slice(0,LEARNING_LIMITS.rules),good:list(r.good).slice(0,LEARNING_LIMITS.good),
  bad:list(r.bad).slice(0,LEARNING_LIMITS.bad),dismissed:list(r.dismissed).slice(0,LEARNING_LIMITS.dismissed)};
}
const PHONE=/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/;
// 규칙에 «지시를 바꾸라»는 말이 섞이면 버림(손님 채팅이 규칙으로 둔갑하는 것 방지)
const INJECT=/프롬프트|지시|무시해|무시하고|시스템|ignore|system|규칙을\s*(바꾸|없애)|욕/i;
const uniq=(a:string[])=>{const s=new Set<string>();return a.filter(x=>{const k=x.replace(/\s/g,'');if(s.has(k))return false;s.add(k);return true;});};
/** Gemini 정리 결과 → 새 노트. good 은 실제 사람 글에 «그대로» 있는 것만, 지운 줄(dismissed)은 다시 안 넣음 */
export function mergeLearning(prev:LearningNotes,ai:{rules?:unknown;good?:unknown},humanLines:string[],badLines:string[],lastMessageId:number,nowIso:string):LearningNotes{
 const gone=new Set(prev.dismissed.map(x=>x.replace(/\s/g,'')));
 const keep=(x:string)=>x.length<=LEARNING_LIMITS.len&&!PHONE.test(x)&&!gone.has(x.replace(/\s/g,''));
 const human=new Set(humanLines.map(one));
 const rules=uniq([...list(ai.rules).filter(x=>!INJECT.test(x)),...prev.rules]).filter(keep).slice(0,LEARNING_LIMITS.rules);
 const good=uniq([...list(ai.good).filter(x=>human.has(x)),...prev.good]).filter(keep).slice(0,LEARNING_LIMITS.good);
 const bad=uniq([...badLines.map(one),...prev.bad]).filter(keep).slice(0,LEARNING_LIMITS.bad);
 return {updatedAt:nowIso,lastMessageId:Math.max(prev.lastMessageId,lastMessageId),rules,good,bad,dismissed:prev.dismissed};
}
/** 관리자가 한 줄 지우기 — 다시 안 들어오게 dismissed 에 남김 */
export function removeLearningLine(n:LearningNotes,which:LearningList,text:string):LearningNotes{
 const t=one(text);
 const next={...n,[which]:n[which].filter(x=>x!==t)} as LearningNotes;
 next.dismissed=uniq([t,...n.dismissed]).slice(0,LEARNING_LIMITS.dismissed);
 return next;
}
/** AI 에게 같이 보여 줄 글 — 비어 있으면 빈 문자열 */
export function learningPromptText(n:LearningNotes):string{
 const out:string[]=[];
 if(n.rules.length)out.push(`[학습 노트 — 지난 채팅에서 배운 규칙]\n${n.rules.map(x=>`- ${x}`).join('\n')}`);
 if(n.good.length)out.push(`[학습 노트 — 실제 손님 말투 예(그대로 베끼지 말고 느낌만)]\n${n.good.map(x=>`- ${x}`).join('\n')}`);
 if(n.bad.length)out.push(`[학습 노트 — 사장님이 지운 AI 글, 이런 말은 하지 않는다]\n${n.bad.map(x=>`- ${x}`).join('\n')}`);
 return out.join('\n');
}
/** 다시 모을 때인지 — [2026-11-14 01:04] Gemini 안 쓰고 지운 AI 글만 모으므로 10분마다(채팅 수 무관) */
export function learningDue(n:LearningNotes,nowMs:number,_newCount:number,force=false):boolean{
 if(force)return true;
 const last=Date.parse(n.updatedAt);
 return !Number.isFinite(last)||nowMs-last>=10*60000;
}
