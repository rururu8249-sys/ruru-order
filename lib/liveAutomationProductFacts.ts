import {colorNameSwatch} from './colorNameSwatch';
import {BRAND_SPEECH_ALIASES} from './liveAutomationSpeech';

/** Catalog evidence only. product_type is a sales channel, not a garment category. */
export type ChatProductFacts = {
  name:string; parentName?:string; detailName?:string;
  colors:readonly string[]; sizes:readonly string[];
};
const clean=(s:unknown,n=90)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
/** Only catalog identifiers/established spoken aliases count, never a bare color
 * or a guessed product appended after generation. */
export function identifiesChatProduct(text:string,p:ChatProductFacts):boolean{
 const name=p.detailName||p.name;
 const code=name.match(/\b([a-z]{2,5})\s*-?\s*(\d+)\b/i);
 if(!code)return name.length>=3&&text.replace(/\s/g,'').includes(name.replace(/\s/g,''));
 const aliases=[code[1],...(BRAND_SPEECH_ALIASES[code[1].toUpperCase()]||[])];
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return aliases.some(alias=>new RegExp(`(?:^|[^a-z가-힣])${escape(alias)}\\s*-?\\s*${code[2]}(?![0-9a-z])`,'i').test(text));
}
export function productSemanticFacts(p:ChatProductFacts) {
  const name=clean(p.name),parentName=clean(p.parentName),detailName=clean(p.detailName);
  const colors=[...new Set(p.colors.map(c=>clean(c,24)).filter(c=>c&&c!=='없음'))].slice(0,8);
  // Only recognized standalone color tokens, never arbitrary words or a new selectable option.
  const namedColors=detailName.split(/[\s()]+/).filter(c=>c&&colorNameSwatch(c)).slice(0,4);
  const sizes=p.sizes.map(s=>clean(s,18)).filter(Boolean).slice(0,12);
  const names=`${parentName} ${name}`;
  const food=/음료|주스|포도주|레드와인|화이트와인|식용|올리브오일|초콜릿|식품/.test(names);
  const clothing=/코트|패딩|셔츠|니트|바지|팬츠|원피스|가디건|자켓|재킷|스커트|의류/.test(names);
  const clothingSizes=sizes.some(s=>/^(?:XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(s))||
    sizes.filter(s=>/^(?:34|36|38|40|42|44|46|48|50|52|54|55|66|77|88)$/.test(s)).length>=2;
  const wearable=!food&&(clothing||clothingSizes);
  return {name,parentName,detailName,colors,namedColors,sizes,wearable,food,
    kind:food?'식품·음료 명칭 있음':clothing?'의류 명칭 있음':clothingSizes?'의류형 사이즈 표기 있음(세부 종류 미확인)':'종류 미확인'};
}
export function productFactsPrompt(p:ChatProductFacts):string {
  const f=productSemanticFacts(p);
  return [
    `부모 상품/브랜드: ${f.parentName||'미확인'}; 세부상품: ${f.detailName||f.name}; 종류 근거: ${f.kind}.`,
    `선택 색상: ${f.colors.join(', ')||'별도 선택 없음'}; 세부상품명 속 색상: ${f.namedColors.join(', ')||'미확인'}; 사이즈: ${f.sizes.join(', ')||'미확인'}.`,
    '색상 이름은 음식·음료·재료가 아니다. 와인·초코·올리브 등 색상을 마시는 술, 먹는 음식, 병·잔·안주로 해석하지 마라. 종류·소재·착용 모습은 확인되지 않으면 추측하지 않는다.',
    '이미 표시된 색상·사이즈의 유무를 다시 묻지 마라. 색감·코디·핏에 관한 자연스러운 질문은 가능하다.',
    '색상·외형 감상을 독립적으로 꺼낼 때는 검증된 품번이나 기존 한글 약칭+번호를 직접 밝혀 어느 상품인지 알 수 있게 한다. 색상만 단독으로 말하지 않는다. 실제 답장에서는 상대 글에 대상이 확인되면 이름을 매번 반복하지 않아도 된다. 서버는 상품명을 자동으로 덧붙이지 않는다.',
  ].join('\n');
}
/** Reject concrete edible/drink properties of a wearable, not the color word itself.
 * A genuine human food conversation remains possible without calling the garment food.
 */
export function productMeaningMismatch(text:string,p:ChatProductFacts,source=''):boolean {
  const f=productSemanticFacts(p);
  if(!f.wearable)return false;
  const foodUse=/(?:잔에.{0,12}(?:따라|따르|담|마시)|따라\s*마|마시면|마셔|마시기|안주|페어링|(?:와인|음료|술)\s*병|알코올|도수|안주로|먹으면|먹기|맛있|식감|당도|달콤한\s*맛|볶아|튀겨)/;
  if(!foodUse.test(text))return false;
  // A shared color/food word alone does not identify the displayed garment.
  const identifiesProduct=/[a-z가-힣]+\s*-?\s*\d{2,4}/i.test(text)||
    /상품|제품|이\s*옷|코트|패딩|셔츠|니트|바지|팬츠|원피스|가디건|자켓|재킷|스커트/.test(text);
  const foodSource=foodUse.test(source)||/치킨|피자|맥주|커피|주스|식사|저녁\s*먹|점심\s*먹/.test(source);
  if(foodSource&&!identifiesProduct)return false;
  return true;
}
