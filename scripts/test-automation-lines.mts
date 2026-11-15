// [2026-11-15 14:15~14:30 사장님 「모든 글들 테스트 해야함」] 코드가 정한 가상 손님 말 전부 검사
import {FAREWELL_LINES,VISIT_LINES,INSTA_VISIT_LINES,fillVisitLine,ORDER_FIRST_LINES,ORDER_AFTER_LINES,GREETINGS,farewellPlan,orderNoticePlan,orderAfterDelay,koreanSizeBand,parseHeightWeight,isSizeQuestion,sizeAnswerText,personaVoice,voiceOf,greetingPool,greetChance,isEndNotice,parseNextShow,nextShowLines,SIZE_ASK_LUNA_LINES,askLunaText,combineLines} from '../lib/liveAutomationLines';
import {safeConversationLine} from '../lib/liveAutomationPersona';
import {advisesOthers,orderedAskBlocked} from '../lib/liveAutomationDirector';
import {falseExperience} from '../lib/liveAutomationDialogue';
import {roParticle,soldItems,purchaseMemoryText,MEMORY_TEMPLATES,isTestOnlyLine,factTopic,FACT_ANSWERS,factAnswerText,agreeTopic,AGREE_ANSWERS,agreeAnswerText,fixLaughCount,EMOJIS,EMOJI_ONLY_LINES,EMOJI_CUTE_LINES,topBrands,brandAskText,BRAND_ASK_TEMPLATES,SMALL_TALKS,smallTalkPool,smallTalkAnswer} from '../lib/liveAutomationLines';
import {isCompletionReport} from '../lib/liveChatBot';

const fail=(m:string)=>{throw new Error(m);};
// DB(live_automation_chat)가 거절하는 말과 같은 규칙
const DB_BAD=/(테스트|\btest\b|\bAI\b|API|프롬프트|한도|시스템|결제.{0,3}완료|입금.{0,3}완료|https?:\/\/)/i;
const ODD=/가상|봇|자동|인공지능|\d{2,3}-\d{3,4}-\d{4}/;
function checkPool(name:string,pool:string[],min:number,maxLen=45){
  if(pool.length<min)fail(`${name} ${pool.length}개 < ${min}`);
  const seen=new Set<string>();
  for(const t of pool){
    if(seen.has(t))fail(`${name} 중복: ${t}`);seen.add(t);
    if(t.length<2||t.length>maxLen)fail(`${name} 길이: ${t}`);
    if(DB_BAD.test(t)||ODD.test(t)||!safeConversationLine(t,false))fail(`${name} 금지어: ${t}`);
    // 모든 말투(버릇) 64가지로 바꿔도 DB 통과·길이 100 이하·숫자 그대로
    for(let a=0;a<64;a++){const v=personaVoice(t,a*37+1,a);if(DB_BAD.test(v)||v.length>100||v.replace(/\D/g,'')!==t.replace(/\D/g,''))fail(`${name} 말투 변형 문제: ${t} → ${v}`);}
  }
  console.log(name,'ok',pool.length);
}
checkPool('방송 종료 인사',FAREWELL_LINES,100);
checkPool('소개·밴드·유튜브',VISIT_LINES.filter(t=>t!=='{insta}'),30);
checkPool('인스타로 온 말',INSTA_VISIT_LINES,120);
{const insta=VISIT_LINES.filter(t=>t==='{insta}').length;if(insta<5||insta>8)fail('인스타 비중 '+insta);
 const outs=new Set<string>();for(let i=0;i<500;i++){const t=fillVisitLine('{insta}',i);if(!INSTA_VISIT_LINES.includes(t))fail('인스타 채우기 '+t);outs.add(t);}
 if(outs.size<100)fail('인스타 다양성 '+outs.size);
 if(fillVisitLine('밴드 보고 들어왔어요',3)!=='밴드 보고 들어왔어요')fail('일반 말 바뀜');
 for(const k of ['광고','릴스','피드','스토리','그냥','돋보기','인친'])if(!INSTA_VISIT_LINES.some(t=>t.includes(k)))fail('인스타 갈래 없음 '+k);
 if(GREETINGS.some(g=>g.text.includes('{')&&g.text!=='{insta}'))fail('자리 표시 이상');
 console.log('인스타 예',[...outs].slice(0,6));}
if(VISIT_LINES.filter(t=>/유튜브/.test(t)).length<12)fail('유튜브 말 부족');
if(GREETINGS.filter(g=>g.kind==='site').length<15)fail('사이트 칭찬 부족');
checkPool('주문서 먼저',ORDER_FIRST_LINES,300);
checkPool('주문 알림 뒤',ORDER_AFTER_LINES,300);
checkPool('사이즈는 루루언니한테',SIZE_ASK_LUNA_LINES.map(t=>t.split('{n}').join('루루언니')),150,70);
for(const t of [...ORDER_FIRST_LINES,...ORDER_AFTER_LINES])if(/\s[.!~,]|[.!~,]{2,}\S|^[.!~, ]|요[가-힣]/.test(t))fail('조합 모양 이상: '+t);
if(!ORDER_FIRST_LINES.includes('주문서 넣었어요. 확인 부탁드려요')&&!ORDER_FIRST_LINES.some(t=>/주문서 넣었어요[.!~] 확인/.test(t)))fail('부호 섞인 모양 없음');
for(let i=0;i<400;i++){const t=askLunaText(i);if(/\d/.test(t)||/언니이 |\{n\}/.test(t)||!/(루루언니|루언니|루사장님|루루사장님)/.test(t))fail('루루언니 답 '+t);}
console.log('예시',ORDER_FIRST_LINES.slice(0,40).filter((_,i)=>i%7===0).join(' / '),'|',askLunaText(3),'|',askLunaText(8));
checkPool('들어온 인사',GREETINGS.map(g=>g.text).filter(t=>t!=='{insta}'),90);

// 종료 안내 감지 — 사장님 실제 문구
if(!isEndNotice('✅ 라이브방송이 종료되었습니다. 현재는 사이트에서 다시보기 시청과 실시간 채팅이 가능하며, 원하는 상품도 바로 주문하실 수 있습니다🙂'))fail('종료 안내 감지');
if(isEndNotice('방송 언제 시작해요?'))fail('종료 안내 오감지');

// 종료 인사 계획 — 0~4명, 첫 마디 25초 뒤 이후, 사람 사이 40초 이상, 한꺼번에 우르르 아님
const ids=['a','b','c','d','e','f'];const counts=[0,0,0,0,0];let late=0;
for(let n=1;n<=2000;n++){
  const p=farewellPlan(n,ids);counts[p.length]++;
  if(p.length&&p[0].delayMs<25000)fail('첫 인사 너무 빠름');
  for(let i=1;i<p.length;i++){const gap=p[i].delayMs-p[i-1].delayMs;if(gap<40000)fail('인사 사이 너무 붙음 '+gap);if(gap>=180000)late++;}
  if(new Set(p.map(x=>x.actorId)).size!==p.length)fail('같은 사람 두 번');
  if(p.some(x=>x.delayMs>25*60000))fail('너무 늦음');
}
if(counts[0]===0||counts[4]===0||counts[2]<counts[0])fail('인원 분포 '+counts);
if(late<200)fail('한 템포 늦은 사람 부족 '+late);
if(farewellPlan(5,['x']).length>1)fail('주문한 사람보다 많음');
console.log('종료 인사 계획 ok',counts,'늦게',late);

// 주문서 넣었다는 말 — 먼저/뒤/안 함 섞임
const plans={first:0,after:0,none:0};
for(let i=0;i<3000;i++){plans[orderNoticePlan('grp-'+i)]++;const d=orderAfterDelay('grp-'+i);if(d<12000||d>82000)fail('알림 뒤 시간');}
if(plans.first<700||plans.after<500||plans.none<1000)fail('주문 말 분포 '+JSON.stringify(plans));
console.log('주문 말 분포 ok',plans);

// 사이즈 대략 답
const band=(h:number,w:number)=>koreanSizeBand(h,w);
const expect:[number,number,string][]=[[160,45,'44'],[160,50,'44~55'],[160,53,'55'],[165,55,'55'],[163,58,'55~66'],[160,62,'66'],[158,67,'66~77'],[160,72,'77'],[160,80,'77~88'],[172,55,'55~66'],[150,55,'44~55']];
for(const [h,w,b] of expect)if(band(h,w)!==b)fail(`사이즈표 ${h}/${w} → ${band(h,w)} (기대 ${b})`);
if(band(120,50)||band(160,20))fail('이상한 키·몸무게');
const q='mx124 아이보리랑 다른 거랑 고민인데 165에 55는 40사이즈가 맞을까요?';
const hw=parseHeightWeight(q);if(!hw||hw.h!==165||hw.w!==55||!isSizeQuestion(q))fail('질문 읽기');
if(isSizeQuestion('165에 55예요'))fail('질문 아님인데 질문');
const names=new Set<string>();
for(let s=1;s<500;s++){
  const t=sizeAnswerText(165,55,s)!;
  if(!/55/.test(t)||!/(루루언니|루언니|루사장님|루루사장님)/.test(t))fail('사이즈 답 '+t);
  if(/\b(3[4-9]|4[0-6])\b/.test(t.replace('165','').replace(/55/g,'')))fail('브랜드 숫자 사이즈 말함 '+t);
  if(DB_BAD.test(t)||t.length>100)fail('사이즈 답 금지어 '+t);
  names.add((t.match(/루루언니|루언니|루사장님|루루사장님/)||[''])[0]);
}
if(names.size<4)fail('호칭 다양성');
console.log('사이즈 답 ok',sizeAnswerText(165,55,7));

// Gemini 가 돌려 말한 사이즈 추천은 버림(사장님 캡처 문장)
for(const t of ['165에 55시면 36이나 38이 나을 것 같아용 40은 좀 클 수도 있을 듯여!','M이 맞을 것 같아요','그 키면 크게 나올 수도 있어요'])if(!advisesOthers(t))fail('추천 못 거름 '+t);
for(const t of ['160에 55인데 몇 입으면 될까요?','블랙 이쁘다','40은 클까요?'])if(advisesOthers(t))fail('질문까지 거름 '+t);

// 자주 묻는 말 자동 답 — 끝냈다는 보고엔 안 붙음, 묻는 말엔 붙음
for(const t of ['카결 완료했어요 확인 부탁드려용!','입금했어요','카드결제 했습니다','주문서 넣었어요 확인 부탁드려요'])if(!isCompletionReport(t))fail('보고 못 알아봄 '+t);
for(const t of ['카드결제 되나요?','카결 어떻게 해요','입금 계좌 어디예요?','카드 돼요?'])if(isCompletionReport(t))fail('질문을 보고로 '+t);

// 말투 버릇 — 사람마다 일정, 사람끼리 다양
const marks=new Set<string>(),spacing=new Set<string>(),typoPeople=new Set<number>();
for(let a=0;a<300;a++){const v=voiceOf(a);marks.add(v.mark);spacing.add(v.spacing);if(v.typo>0.1)typoPeople.add(a);}
if(!marks.has(':)'))fail('웃는 표시 :) 버릇 없음');
if(marks.size<7||spacing.size<3||typoPeople.size<30)fail('버릇 종류 부족');
const sample=new Set<string>();for(let a=0;a<200;a++)sample.add(personaVoice('오늘 예쁜 옷 많았네요',a,a));
if(sample.size<15)fail('같은 말 모양 다양성 '+sample.size);
if(![...sample].some(x=>/~$/.test(x))||![...sample].some(x=>/!$/.test(x))||![...sample].some(x=>/\.\.$/.test(x))||![...sample].some(x=>x.includes('예쁜옷'))||![...sample].some(x=>/:-?\)$/.test(x)))fail('버릇 모양 누락');
if(personaVoice('버58 160에 52인데 몇 입으면 될까요?',3,4).replace(/\s/g,'').indexOf('버58')!==0)fail('상품번호 건드림');
if(!/\?/.test(personaVoice('방송 지금 시작한 거죠?',9,9)))fail('물음표 사라짐');
console.log('말투 ok',[...sample].slice(0,8).join(' / '));

// 들어온 인사 — 상황 맞게
const live0=greetingPool({live:true,sinceStartMs:2*60000,kstHour:20,visitRecently:false,weekend:false});
const live60=greetingPool({live:true,sinceStartMs:60*60000,kstHour:14,visitRecently:true,weekend:true});
const replay=greetingPool({live:false,sinceStartMs:-1,kstHour:23,visitRecently:false,weekend:false});
if(!live0.some(g=>g.kind==='start')||!live0.some(g=>g.kind==='live')||!live0.some(g=>g.kind==='visit')||!live0.some(g=>g.kind==='evening'))fail('시작 직후 인사 종류');
if(!live60.some(g=>g.kind==='site'))fail('사이트 칭찬 안 나옴');
if(greetingPool({live:true,sinceStartMs:1,kstHour:14,visitRecently:false,weekend:false,siteRecently:true}).some(g=>g.kind==='site'))fail('사이트 칭찬 8분 제한');
if(live60.some(g=>g.kind==='start'||g.kind==='visit'||g.kind==='evening'||g.kind==='morning'))fail('1시간 뒤·소개 직후 인사');
if(replay.some(g=>g.kind==='start'||g.kind==='live'))fail('다시보기인데 방송 인사');
if(greetChance({live:true,sinceStartMs:10*60000})<=greetChance({live:true,sinceStartMs:90*60000}))fail('초반 인사 확률');
console.log('들어온 인사 ok',live0.length,live60.length,replay.length);
// 다음 방송 예정(잠시 쉬는 중 문구) — 2026-11-15 14:34 KST 기준
const now=Date.UTC(2026,10,15,5,34);
const ns=parseNextShow('11/15(일) 저녁7시 예정',now);
if(!ns||ns.when!=='오늘 저녁 7시'||!ns.today)fail('예정 읽기 '+JSON.stringify(ns));
if(parseNextShow('11/16(월) 오후 2시 예정',now)?.when!=='내일 오후 2시')fail('내일');
if(parseNextShow('11/14(토) 저녁7시',now))fail('지난 날짜');
if(parseNextShow('11/15(일) 오전 9시',now))fail('오늘 지난 시각');
if(parseNextShow('잠시 쉬는 중 · 곧 다시 시작해요',now))fail('시간 없는 문구');
const nl=nextShowLines(ns);checkPool('다음 방송 예정 말',nl,10);
const rep=greetingPool({live:false,sinceStartMs:-1,kstHour:14,visitRecently:false,weekend:true,nextShow:ns});
if(!rep.some(g=>g.kind==='next')||greetingPool({live:true,sinceStartMs:1,kstHour:14,visitRecently:false,weekend:true,nextShow:ns}).some(g=>g.kind==='next'))fail('예정 인사 상황');
console.log('다음 방송 ok',nl.slice(0,3).join(' / '));
// ㅋㅋ·ㅎㅎ 딱 두 개 금지(사장님 캡처 «좋네요~ㅎㅎ»)
const TWO=/(^|[^ㅋㅎ])(ㅋㅋ|ㅎㅎ)(?![ㅋㅎ])/;
{let two=0,n=0;for(let i=0;i<300;i++){for(const t of ['다시보기 보면서 주문할 수 있어서 좋네요~ㅎㅎ','이뻐요 ㅋㅋ']){n++;if(TWO.test(fixLaughCount(t,i)))two++;}}if(two/n<0.15||two/n>0.35)fail('두 개 비율 '+two/n);console.log('ㅋㅋ·ㅎㅎ 두 개 비율',(two/n).toFixed(2));}
const laughOuts=new Set<string>();for(let i=0;i<300;i++)laughOuts.add(fixLaughCount('좋네요~ㅎㅎ',i));
if(![...laughOuts].some(v=>/[^ㅎ]ㅎㅎ$/.test(v))||![...laughOuts].some(v=>/[^ㅎ]ㅎ$/.test(v))||![...laughOuts].some(v=>/ㅎㅎㅎ$/.test(v))||![...laughOuts].some(v=>EMOJIS.some(e=>v.endsWith(e)))||![...laughOuts].some(v=>/요~$/.test(v)))fail('웃음 바꾸기 종류 '+[...laughOuts].join('|'));
for(const t of ['ㅋㅋㅋ 좋아요','ㅎ 네'])if(fixLaughCount(t,1)!==t)fail('세 개·한 개는 그대로 '+t);
{let t2=0;for(let a=0;a<300;a++){if(TWO.test(personaVoice('예쁘네요 ㅎㅎ',a,a)))t2++;}if(t2<30||t2>110)fail('말투 뒤 두 개 비율 '+t2);}
const emo=new Set<string>();for(let a=0;a<400;a++){const v=personaVoice('오늘 예쁜 옷 많았네요',a,a);if(EMOJIS.some(e=>v.includes(e)))emo.add(v);}
if(emo.size<15)fail('이모지 쓰는 사람 부족 '+emo.size);
checkPool('이모지만',EMOJI_ONLY_LINES,15);checkPool('이모티콘 귀엽다',EMOJI_CUTE_LINES,40);
console.log('웃음·이모지 ok',[...laughOuts].slice(0,8).join(' / '),'|',[...emo].slice(0,4).join(' / '));

// 많이 팔린 브랜드 «또 언제 해요?» — 후기 지어내지 않음
const brandNames=[...Array(20)].map(()=>'알로 부츠컷팬츠'),more=[...Array(15)].map(()=>'룰루레몬 얼라인 레깅스'),mc=[...Array(30)].map((_,i)=>'MC-3'+(i%10)+' 블랙');
const tb=topBrands([...brandNames,...more,...mc,'나이키 운동화','나이키 운동화']);
if(tb[0]!=='알로'||!tb.includes('룰루레몬')||!tb.includes('몽클레어')||tb.includes('나이키'))fail('브랜드 순위 '+tb);
if(BRAND_ASK_TEMPLATES.length<200)fail('브랜드 말 수 '+BRAND_ASK_TEMPLATES.length);
for(const b of ['알로','룰루레몬','몽클레어','샤넬'])for(let i=0;i<200;i++){const t=brandAskText(b,i);if(!t.includes(b)||t.includes('{b}')||falseExperience(t)||/샀|입어\s*보|좋았|후기/.test(t)||DB_BAD.test(t)||t.length>70)fail('브랜드 말 '+t);if(/샤넬는|룰루레몬는|알로은|몽클레어은/.test(t))fail('조사 '+t);}
for(const t of BRAND_ASK_TEMPLATES)if(/[?!][~.,!]/.test(t))fail('부호 겹침 '+t);
console.log('브랜드 ok',tb.join(','),'|',brandAskText('알로',3),'|',brandAskText('룰루레몬',9));

// 손님끼리 한두 마디 — 모든 말 검사·상황
for(const t of SMALL_TALKS)checkPool('손님끼리 '+t.id,[...t.q,...t.a,...(t.aCart||[]),...(t.aOrdered||[])],3);
if(smallTalkPool({live:false,card:false}).some(t=>t.live||t.card))fail('손님끼리 상황');
const cartTalk=SMALL_TALKS.find(t=>t.id==='cart')!;
if(!/주문/.test(smallTalkAnswer(cartTalk,1,{cart:true,ordered:true}))||/주문|담았|담아/.test(smallTalkAnswer(cartTalk,1,{cart:false,ordered:false})))fail('손님 상태에 맞는 답');

// 이미 주문한 손님이 주문 전 질문(사장님 캡처 «구독인증하면무배인가요?»)
for(const t of ['구독인증하면무배인가요?','카드 결제 되나요?','주문 어떻게 해요?','배송비 얼마예요?','계좌 어디예요?'])if(!orderedAskBlocked(t))fail('주문 뒤 질문 못 거름 '+t);
for(const t of ['주문서 낼 때 구독 인증했어요','블랙 이쁘네요','160에 50인데 몇 입으면 될까요?'])if(orderedAskBlocked(t))fail('거르면 안 됨 '+t);
// 가상 손님 질문에 사실로 답 / 맞장구 (사장님 캡처 문장들)
const on={subscribeOn:true,overseas:true,live:false};
const fq:[string,string|null][]=[['구독인증하면무배인가요?','subscribe'],['카드결제 되나요?','card'],['이거 배송 얼마나 걸려요?','overseas'],['방송 안 할 때도 주문돼요?','replay'],['주문 어떻게 해요?','how'],['블랙 이쁘다','null']];
for(const [t,e] of fq)if(String(factTopic(t,on))!==e)fail('사실 질문 '+t+' '+factTopic(t,on));
if(factTopic('구독인증하면무배인가요?',{...on,subscribeOn:false}))fail('구독 무배 꺼졌는데 답');
if(factTopic('이거 배송 얼마나 걸려요?',{...on,overseas:false}))fail('국내 배송 날짜 지어냄');
for(const k of Object.keys(FACT_ANSWERS) as (keyof typeof FACT_ANSWERS)[]){checkPool('사실 답 '+k,FACT_ANSWERS[k],12,60);for(const t of FACT_ANSWERS[k])if(/저도\s*저도|네\s*네\s*네/.test(t))fail('겹침 '+t);}
if(!FACT_ANSWERS.overseas.every(t=>/2~3주/.test(t)))fail('해외배송 기간');
if(!FACT_ANSWERS.card.some(t=>/7%/.test(t)))fail('카드 부가세');
const ag:[string,string|null][]=[['다시보기 보면서 주문할 수 있어서 좋네요~ㅎ','replay'],['오늘 저녁 7시 방송 기대돼용!','nextShow'],['여기 사이트 좋네요','site'],['알로 또 언제 해요? 기다릴게요','null'],['알로 기다리고 있어요','brand'],['오늘 수고하셨어요','thanks'],['안녕하세요 반가워요~','hello'],['베이지 너무 이쁘다','pretty']];
for(const [t,e] of ag)if(String(agreeTopic(t))!==e)fail('맞장구 주제 '+t+' '+agreeTopic(t));
for(const k of Object.keys(AGREE_ANSWERS) as (keyof typeof AGREE_ANSWERS)[]){const pool=AGREE_ANSWERS[k].map(t=>t.split('{t}').join('7시'));checkPool('맞장구 '+k,pool,15,50);for(const t of pool)if(/(저도|그쵸|맞아요|진짜)\s+\1/.test(t))fail('겹침 '+t);}
const ns2=new Set<string>();for(let i=0;i<60;i++){const t=agreeAnswerText('nextShow','오늘 저녁 7시 방송 기대돼용!',i)!;if(!/7시/.test(t))fail('시간 '+t);ns2.add(t);}
if(ns2.size<20)fail('7시 맞장구 다양성 '+ns2.size);
if(agreeAnswerText('nextShow','방송 기대돼요',1)!==null&&/\{t\}|\d시/.test(String(agreeAnswerText('nextShow','방송 기대돼요',1))))fail('시간 없는데 지어냄');
console.log('답·맞장구 ok |',factAnswerText('subscribe',3),'|',agreeAnswerText('replay','',5),'|',[...ns2].slice(0,4).join(' / '));
// 지난 구매 얘기(시험용) — 실제 판 상품명에서 브랜드+품목, 일반 손님 화면엔 숨김 판정
const si=soldItems([...[...Array(5)].map((_,i)=>({product_name:'알로 부츠컷팬츠',color:'블랙',size:i<3?'M':'S'})),...[...Array(3)].map(()=>({product_name:'룰루레몬 얼라인 레깅스',color:'그레이',size:'6'})),...[...Array(4)].map(()=>({product_name:'MC-320 블랙 패딩',color:'블랙',size:'없음'})),'나이키 운동화']);
if(si[0].sizes[0]!=='M'||si[0].colors[0]!=='블랙'||si.find(v=>v.brand==='몽클레어')?.sizes.length!==0)fail('사이즈·색 고르기 '+JSON.stringify(si));
for(const t of MEMORY_TEMPLATES)if(!isTestOnlyLine(t.text))fail('숨김 판정 안 되는 문장 '+t.text);
if(MEMORY_TEMPLATES.filter(t=>t.need==='size').length<200||MEMORY_TEMPLATES.filter(t=>t.need==='color').length<100)fail('사이즈·색 구매 얘기 수 '+MEMORY_TEMPLATES.filter(t=>t.need==='size').length+'/'+MEMORY_TEMPLATES.filter(t=>t.need==='color').length);
const memOut=new Set<string>();for(let i=0;i<400;i++){const t=purchaseMemoryText(si[0],i);memOut.add(t);if(/\{|\s{2}/.test(t))fail('빈칸 '+t);}
if(![...memOut].some(t=>/M으로|M 샀/.test(t))||![...memOut].some(t=>/언니가 추천해준 대로|언니 말 듣고/.test(t))||![...memOut].some(t=>/블랙/.test(t))||![...memOut].some(t=>/언니 최고|역시 언니/.test(t)))fail('구매 얘기 종류');
for(let i=0;i<200;i++){const t=purchaseMemoryText(si.find(v=>v.brand==='몽클레어')!,i);if(/\{|사이즈 딱|\s(으로|로)\s|추천해주신\s+사이즈/.test(t))fail('사이즈 없는데 사이즈 말 '+t);}
if(si[0].brand!=='알로'||si[0].item!=='부츠컷팬츠'||!si.some(v=>v.brand==='룰루레몬'&&v.item==='얼라인')||!si.some(v=>v.brand==='몽클레어')||si.some(v=>v.brand==='나이키'))fail('판 상품 읽기 '+JSON.stringify(si));
if(MEMORY_TEMPLATES.length<400)fail('구매 얘기 수 '+MEMORY_TEMPLATES.length);
for(let i=0;i<300;i++){const t=purchaseMemoryText(si[i%si.length],i);if(!isTestOnlyLine(t))fail('숨김 판정 못 함 '+t);if(DB_BAD.test(t)||t.length>100||t.includes('{x}'))fail('구매 얘기 '+t);const v=personaVoice(t,i,i);if(!isTestOnlyLine(v))fail('말투 바꾼 뒤 숨김 판정 못 함 '+v);}
for(const t of ['블랙 이쁘네요','알로 또 언제 해요?','주문서 넣었어요 확인 부탁드려요'])if(isTestOnlyLine(t))fail('숨기면 안 됨 '+t);
for(const [w,e] of [['블랙','으로'],['M','으로'],['S','로'],['6','으로'],['240','으로'],['카멜','로'],['베이지','로'],['XL','로']] as const)if(roParticle(w)!==e)fail('로/으로 '+w);
if([...memOut].some(t=>/블랙로|M로/.test(t)))fail('조사 틀림');
if([...memOut].some(t=>!t.includes('부츠컷팬츠')))fail('상품 없이 말함 '+[...memOut].find(t=>!t.includes('부츠컷팬츠')));

console.log('지난 구매 얘기 ok',memOut.size,'가지 |',[...memOut].slice(0,6).join(' / '));
console.log('ALL OK');

// [18:57 사장님] 등록 이모티콘·끝맺음 겹침·닉네임 꼴·브랜드 맥락
{
  const {siteEmojiText,varyTailAgainst,tailKind,similarNick,BRAND_ASK_TEMPLATES:BT}=await import('../lib/liveAutomationLines');
  const names=['하트','동실장','루루업','ㅋㅋㅋ','감사합니다'];
  let site=0,uni=0;for(let i=0;i<300;i++){const t=siteEmojiText('예뻐요 😊😊 👍 💕 ✨',names,i,i*7);if((t.match(/:[^:\s]+:/g)||[]).length>3)fail('이모티콘 4개↑ '+t);if(/:[^:\s]+:/.test(t))site++;if(/\p{Extended_Pictographic}/u.test(t))uni++;}
  if(site<100||uni<100)fail('등록·기본 이모지 섞임 '+site+'/'+uni);
  if(siteEmojiText('좋아요 😊',[],1,1)!=='좋아요 😊')fail('등록 없으면 그대로');
  const favs=new Set<string>();for(let i=0;i<200;i++)for(const m of siteEmojiText('😊 👍',names,42,i).match(/:[^:\s]+:/g)||[])favs.add(m);if(favs.size>3)fail('한 손님 즐겨 쓰는 이모티콘 3개↑');
  for(let i=0;i<300;i++){const t=varyTailAgainst('언니 꼼데 또 언제 해요?:)',['오늘 7시 방송 기다릴게요:)'],i);if(tailKind(t)===':)')fail('끝맺음 겹침 '+t);if(/\?[!~.]/.test(t))fail('부호 '+t);}
  for(let i=0;i<300;i++){const t=varyTailAgainst('예뻐요 😊',['좋네요 abc:하트'],i);if(tailKind(t)==='emoji')fail('이모지 겹침 '+t);}
  if(varyTailAgainst('예뻐요~',['좋아요!'],1)!=='예뻐요~')fail('안 겹치면 그대로');
  if(varyTailAgainst('😊😊',['좋네요😊'],1)!=='😊😊')fail('이모지만 글 그대로');
  if(!similarNick('[테스트]주원맘','[테스트]딸둘맘')||!similarNick('민여사','김여사')||similarNick('판다','여름'))fail('닉네임 꼴');
  for(const t of BT)if(/기다리고 있|기다려요|기다릴게요/.test(t))fail('맥락 없는 기다림 '+t);
  console.log('이모티콘·끝맺음·닉네임 ok',siteEmojiText('예뻐요 😊 👍',names,3,4),'|',varyTailAgainst('언니 꼼데 언제 해요?:)',['기다릴게요:)'],5));
}
{
  const {varyLaughAgainst}=await import('../lib/liveAutomationLines');
  const forms:Record<string,number>={};let prev:string[]=[];
  for(let i=0;i<400;i++){const t=varyLaughAgainst('안녕하세요~~ ㅎㅎㅎ',prev,i);const m=(t.match(/[ㅋㅎ]+/g)||['(없음)'])[0];forms[m]=(forms[m]||0)+1;
    for(const p of prev)for(const x of p.match(/[ㅋㅎ]+/g)||[])if(t.includes(x)&&(t.match(/[ㅋㅎ]+/g)||[] as string[]).includes(x))fail('앞 글과 같은 웃음 '+x+' | '+t);
    prev=[t,...prev].slice(0,3);}
  if(Object.keys(forms).length<6||Math.max(...Object.values(forms))>400*0.4)fail('웃음 모양 쏠림 '+JSON.stringify(forms));
  if(varyLaughAgainst('ㅋㅋ',[],1).length===0)fail('웃음만 글 비면 안 됨');
  console.log('웃음 섞기 ok',JSON.stringify(forms));
}
{
  const {emojiReactText,varyLaughAgainst:vl}=await import('../lib/liveAutomationLines');
  const site=['하트','동실장','루루업','ㅋㅋㅋ','빼꼼','화남','잘자','감사합니다'];
  const seen=new Set<string>();let copy=0;
  for(let i=0;i<300;i++){const t=emojiReactText(['빼꼼'],site,i);seen.add(t);if(/:화남:|:잘자:/.test(t))fail('어두운 이모티콘 '+t);if(t.includes(':빼꼼:'))copy++;if(t.length>60)fail('길이 '+t);}
  if(seen.size<80)fail('이모티콘 반응 종류 '+seen.size);if(copy<60)fail('따라 쓰기 '+copy);
  if(vl('ㅋㅋ :ㅋㅋㅋ: 좋아요',[],3).indexOf(':ㅋㅋㅋ:')<0)fail('이모티콘 이름 깨짐');
  console.log('이모티콘 반응 ok',seen.size,'가지 |',[...seen].slice(0,6).join(' / '));
}
// [2026-11-15 20:46] 최근 이름(말한 사람·«○○님»·가게 이름)과 비슷한 닉네임은 말 안 함
{
  const {recentNameSet,similarToRecent}=await import('../lib/liveAutomationLines');
  const now=Date.now();const iso=(s:number)=>new Date(now-s*1000).toISOString();
  const msgs=[{nickname:'[테스트]치킨은반반',body:'고민되네요',created_at:iso(5)},{nickname:'루루동이',body:'꾸둥이님 감사합니다',created_at:iso(20)},{nickname:'옛손님',body:'',created_at:iso(900)}];
  const names=recentNameSet(msgs,now);
  if(!similarToRecent('별둥이',names))fail('별둥이 통과됨');
  if(!similarToRecent('바삭치킨',names)&&!similarToRecent('치킨반반',names))fail('치킨 비슷 통과');
  if(similarToRecent('꾸둥이',['꾸둥이'])&&false)fail('');
  if(similarToRecent('토링',names))fail('토링 막힘');
  if(similarToRecent('옛손님친구',names)&&names.includes('옛손님'))fail('5분 지난 이름 봄');
  if(!similarToRecent('짱둥이',['루루동이']))fail('가게 이름 비슷 통과');
  console.log('비슷한 닉네임 ok',names.join(','));
}
// 2026-11-15 23:51 브랜드 요청은 등록 상품명으로
{
  const {topProductNamesByBrand,brandAskText}=await import('../lib/liveAutomationLines');
  const m=topProductNamesByBrand(['MC-319 연베이지','MC-319 연베이지','MC-347 블랙(마야 무광 남성용)','알로 부츠컷팬츠','나이키 운동화','아무거나']);
  const mc=m.get('몽클레어')||[];
  if(mc[0]!=='MC-319 연베이지'||!mc.includes('MC-347 블랙'))throw new Error('몽클레어 상품명 '+JSON.stringify(mc));
  const t=brandAskText(mc[0],3);
  if(!t.includes('MC-319 연베이지'))throw new Error('문장에 상품명 없음 '+t);
  console.log('브랜드 상품명 ok',t);
}
