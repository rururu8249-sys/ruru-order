// [2026-11-15 14:15~14:30 사장님 「모든 글들 테스트 해야함」] 코드가 정한 가상 손님 말 전부 검사
import {FAREWELL_LINES,VISIT_LINES,ORDER_FIRST_LINES,ORDER_AFTER_LINES,GREETINGS,farewellPlan,orderNoticePlan,orderAfterDelay,koreanSizeBand,parseHeightWeight,isSizeQuestion,sizeAnswerText,personaVoice,voiceOf,greetingPool,greetChance,isEndNotice,parseNextShow,nextShowLines,SIZE_ASK_LUNA_LINES,askLunaText,combineLines} from '../lib/liveAutomationLines';
import {safeConversationLine} from '../lib/liveAutomationPersona';
import {advisesOthers,orderedAskBlocked} from '../lib/liveAutomationDirector';
import {falseExperience} from '../lib/liveAutomationDialogue';
import {fixLaughCount,EMOJIS,EMOJI_ONLY_LINES,EMOJI_CUTE_LINES,topBrands,brandAskText,BRAND_ASK_TEMPLATES,SMALL_TALKS,smallTalkPool,smallTalkAnswer} from '../lib/liveAutomationLines';
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
checkPool('소개·인스타·밴드·유튜브',VISIT_LINES,40);
if(VISIT_LINES.filter(t=>/유튜브/.test(t)).length<12)fail('유튜브 말 부족');
if(GREETINGS.filter(g=>g.kind==='site').length<15)fail('사이트 칭찬 부족');
checkPool('주문서 먼저',ORDER_FIRST_LINES,300);
checkPool('주문 알림 뒤',ORDER_AFTER_LINES,300);
checkPool('사이즈는 루루언니한테',SIZE_ASK_LUNA_LINES.map(t=>t.split('{n}').join('루루언니')),150,70);
for(const t of [...ORDER_FIRST_LINES,...ORDER_AFTER_LINES])if(/\s[.!~,]|[.!~,]{2,}\S|^[.!~, ]|요[가-힣]/.test(t))fail('조합 모양 이상: '+t);
if(!ORDER_FIRST_LINES.includes('주문서 넣었어요. 확인 부탁드려요')&&!ORDER_FIRST_LINES.some(t=>/주문서 넣었어요[.!~] 확인/.test(t)))fail('부호 섞인 모양 없음');
for(let i=0;i<400;i++){const t=askLunaText(i);if(/\d/.test(t)||/언니이 |\{n\}/.test(t)||!/(루루언니|루언니|루사장님|루루사장님)/.test(t))fail('루루언니 답 '+t);}
console.log('예시',ORDER_FIRST_LINES.slice(0,40).filter((_,i)=>i%7===0).join(' / '),'|',askLunaText(3),'|',askLunaText(8));
checkPool('들어온 인사',GREETINGS.map(g=>g.text),95);

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
for(let i=0;i<300;i++){for(const t of ['다시보기 보면서 주문할 수 있어서 좋네요~ㅎㅎ','이뻐요 ㅋㅋ','ㅎㅎ 안녕하세요','ㅋㅋ 너무 웃겨요 ㅎㅎ']){const v=fixLaughCount(t,i);if(TWO.test(v))fail('두 개 남음 '+v);}}
const laughOuts=new Set<string>();for(let i=0;i<300;i++)laughOuts.add(fixLaughCount('좋네요~ㅎㅎ',i));
if(![...laughOuts].some(v=>/[^ㅎ]ㅎ$/.test(v))||![...laughOuts].some(v=>/ㅎㅎㅎ$/.test(v))||![...laughOuts].some(v=>EMOJIS.some(e=>v.endsWith(e)))||![...laughOuts].some(v=>/요~$/.test(v)))fail('웃음 바꾸기 종류 '+[...laughOuts].join('|'));
for(const t of ['ㅋㅋㅋ 좋아요','ㅎ 네'])if(fixLaughCount(t,1)!==t)fail('세 개·한 개는 그대로 '+t);
for(let a=0;a<300;a++){const v=personaVoice('예쁘네요 ㅎㅎ',a,a);if(TWO.test(v))fail('말투 뒤 두 개 '+v);}
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
console.log('ALL OK');
