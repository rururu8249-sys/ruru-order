/** Original candidates; checked against current customers on 2026-11-13.
 * This snapshot never replaces the atomic database collision check at assignment.
 * Trend inspiration: https://hsad.tistory.com/3798 and https://letter.wepick.kr/post/23942
 * Names are fictional handles; fan handles never confer celebrity identity or privileges.
 */
export type NicknameCategory='korean'|'humor'|'celebrity'|'english'|'hangul_number'|'english_number'|'real_name';
export type NicknameCandidate={nickname:string;category:NicknameCategory};
export const NICKNAME_CANDIDATES:readonly NicknameCandidate[]=[
  {
    "category": "korean",
    "nickname": "노을한잔"
  },
  {
    "category": "korean",
    "nickname": "달빛산책"
  },
  {
    "category": "korean",
    "nickname": "봄날라떼"
  },
  {
    "category": "korean",
    "nickname": "소담한하루"
  },
  {
    "category": "korean",
    "nickname": "구름정원"
  },
  {
    "category": "korean",
    "nickname": "보리한줌"
  },
  {
    "category": "korean",
    "nickname": "자두빛하늘"
  },
  {
    "category": "korean",
    "nickname": "고운물결"
  },
  {
    "category": "korean",
    "nickname": "느린오후"
  },
  {
    "category": "korean",
    "nickname": "작은동백"
  },
  {
    "category": "korean",
    "nickname": "포근한밤"
  },
  {
    "category": "korean",
    "nickname": "햇살마중"
  },
  {
    "category": "korean",
    "nickname": "담백한오늘"
  },
  {
    "category": "korean",
    "nickname": "새벽풀잎"
  },
  {
    "category": "korean",
    "nickname": "바람소풍"
  },
  {
    "category": "korean",
    "nickname": "은빛여울"
  },
  {
    "category": "korean",
    "nickname": "온기한스푼"
  },
  {
    "category": "korean",
    "nickname": "수풀사이"
  },
  {
    "category": "korean",
    "nickname": "여름찻집"
  },
  {
    "category": "korean",
    "nickname": "가을서랍"
  },
  {
    "category": "korean",
    "nickname": "겨울모퉁이"
  },
  {
    "category": "korean",
    "nickname": "봄빛편지"
  },
  {
    "category": "korean",
    "nickname": "고요한숲"
  },
  {
    "category": "korean",
    "nickname": "파란수첩"
  },
  {
    "category": "korean",
    "nickname": "살구정원"
  },
  {
    "category": "korean",
    "nickname": "다정한별"
  },
  {
    "category": "korean",
    "nickname": "오솔길커피"
  },
  {
    "category": "korean",
    "nickname": "미소한아름"
  },
  {
    "category": "korean",
    "nickname": "둥근달빛"
  },
  {
    "category": "korean",
    "nickname": "꽃잎우체통"
  },
  {
    "category": "korean",
    "nickname": "낮잠구름"
  },
  {
    "category": "korean",
    "nickname": "반달주머니"
  },
  {
    "category": "korean",
    "nickname": "산들다락방"
  },
  {
    "category": "korean",
    "nickname": "느티나무길"
  },
  {
    "category": "korean",
    "nickname": "연두주전자"
  },
  {
    "category": "korean",
    "nickname": "오후의레몬"
  },
  {
    "category": "korean",
    "nickname": "귤빛마당"
  },
  {
    "category": "korean",
    "nickname": "별빛찻잔"
  },
  {
    "category": "korean",
    "nickname": "라일락바람"
  },
  {
    "category": "korean",
    "nickname": "고운보자기"
  },
  {
    "category": "korean",
    "nickname": "햇살책방"
  },
  {
    "category": "korean",
    "nickname": "소소한정원"
  },
  {
    "category": "korean",
    "nickname": "밤하늘수다"
  },
  {
    "category": "korean",
    "nickname": "도란찻집"
  },
  {
    "category": "korean",
    "nickname": "푸른소쿠리"
  },
  {
    "category": "korean",
    "nickname": "나무그늘집"
  },
  {
    "category": "korean",
    "nickname": "수줍은살구"
  },
  {
    "category": "korean",
    "nickname": "모란한송이"
  },
  {
    "category": "korean",
    "nickname": "복숭아편지"
  },
  {
    "category": "korean",
    "nickname": "은방울산책"
  },
  {
    "category": "korean",
    "nickname": "여유로운별"
  },
  {
    "category": "korean",
    "nickname": "자작나무향"
  },
  {
    "category": "korean",
    "nickname": "하늘빛바느질"
  },
  {
    "category": "korean",
    "nickname": "도토리쉼터"
  },
  {
    "category": "korean",
    "nickname": "다람쥐식탁"
  },
  {
    "category": "korean",
    "nickname": "소금꽃향기"
  },
  {
    "category": "korean",
    "nickname": "물망초소풍"
  },
  {
    "category": "korean",
    "nickname": "동백빛오후"
  },
  {
    "category": "korean",
    "nickname": "달맞이산책"
  },
  {
    "category": "korean",
    "nickname": "담쟁이찻집"
  },
  {
    "category": "humor",
    "nickname": "찹쌀떡출근중"
  },
  {
    "category": "humor",
    "nickname": "과일모찌산책"
  },
  {
    "category": "humor",
    "nickname": "두쫀쿠는내편"
  },
  {
    "category": "humor",
    "nickname": "버터떡대기조"
  },
  {
    "category": "humor",
    "nickname": "모찌가웃었다"
  },
  {
    "category": "humor",
    "nickname": "도파민찻잔"
  },
  {
    "category": "humor",
    "nickname": "추구미는낮잠"
  },
  {
    "category": "humor",
    "nickname": "오늘도쫀득함"
  },
  {
    "category": "humor",
    "nickname": "과몰입한식빵"
  },
  {
    "category": "humor",
    "nickname": "감자도퇴근해"
  },
  {
    "category": "humor",
    "nickname": "귤까는회장님"
  },
  {
    "category": "humor",
    "nickname": "오이는억울해"
  },
  {
    "category": "humor",
    "nickname": "배추의휴가"
  },
  {
    "category": "humor",
    "nickname": "출근한고구마"
  },
  {
    "category": "humor",
    "nickname": "양말한짝수배"
  },
  {
    "category": "humor",
    "nickname": "냉장고수호대"
  },
  {
    "category": "humor",
    "nickname": "이불밖잠복근무"
  },
  {
    "category": "humor",
    "nickname": "만보걷고한입"
  },
  {
    "category": "humor",
    "nickname": "커피는내짝꿍"
  },
  {
    "category": "humor",
    "nickname": "떡볶이외교관"
  },
  {
    "category": "humor",
    "nickname": "김밥꼬다리부장"
  },
  {
    "category": "humor",
    "nickname": "반찬통탐정"
  },
  {
    "category": "humor",
    "nickname": "양파는눈물뿐"
  },
  {
    "category": "humor",
    "nickname": "미역국잠수부"
  },
  {
    "category": "humor",
    "nickname": "호떡의품격"
  },
  {
    "category": "humor",
    "nickname": "퇴근은예술이다"
  },
  {
    "category": "humor",
    "nickname": "리모컨어디갔지"
  },
  {
    "category": "humor",
    "nickname": "만두도고민중"
  },
  {
    "category": "humor",
    "nickname": "식빵굽는구름"
  },
  {
    "category": "humor",
    "nickname": "산책하는국자"
  },
  {
    "category": "humor",
    "nickname": "밥솥의자존심"
  },
  {
    "category": "humor",
    "nickname": "누룽지연구소"
  },
  {
    "category": "humor",
    "nickname": "고등어도휴무"
  },
  {
    "category": "humor",
    "nickname": "귤껍질작가님"
  },
  {
    "category": "humor",
    "nickname": "과자봉지명상중"
  },
  {
    "category": "humor",
    "nickname": "일단차부터한잔"
  },
  {
    "category": "humor",
    "nickname": "찹쌀떡마음씨"
  },
  {
    "category": "humor",
    "nickname": "직관보다간식"
  },
  {
    "category": "humor",
    "nickname": "구경하다차식음"
  },
  {
    "category": "humor",
    "nickname": "말차도쉬는날"
  },
  {
    "category": "humor",
    "nickname": "바삭한결심"
  },
  {
    "category": "humor",
    "nickname": "쫀득한월요일"
  },
  {
    "category": "humor",
    "nickname": "양배추의반격"
  },
  {
    "category": "humor",
    "nickname": "수박씨발굴단"
  },
  {
    "category": "humor",
    "nickname": "콩나물면접관"
  },
  {
    "category": "humor",
    "nickname": "밤톨대리출근"
  },
  {
    "category": "humor",
    "nickname": "햇반이랑친구"
  },
  {
    "category": "humor",
    "nickname": "붕어빵순찰대"
  },
  {
    "category": "humor",
    "nickname": "졸음참는주전자"
  },
  {
    "category": "humor",
    "nickname": "마감은내일부터"
  },
  {
    "category": "celebrity",
    "nickname": "영웅이노래친구"
  },
  {
    "category": "celebrity",
    "nickname": "송가인응원중"
  },
  {
    "category": "celebrity",
    "nickname": "장윤정노래한잔"
  },
  {
    "category": "celebrity",
    "nickname": "이찬원팬소풍"
  },
  {
    "category": "celebrity",
    "nickname": "영탁노래산책"
  },
  {
    "category": "celebrity",
    "nickname": "정동원응원별"
  },
  {
    "category": "celebrity",
    "nickname": "진성노래마실"
  },
  {
    "category": "celebrity",
    "nickname": "김연자팬찻집"
  },
  {
    "category": "celebrity",
    "nickname": "이문세듣는오후"
  },
  {
    "category": "celebrity",
    "nickname": "성시경노래숲"
  },
  {
    "category": "celebrity",
    "nickname": "아이유팬다락방"
  },
  {
    "category": "celebrity",
    "nickname": "효리바라기"
  },
  {
    "category": "celebrity",
    "nickname": "보검이응원단"
  },
  {
    "category": "celebrity",
    "nickname": "공유팬찻잔"
  },
  {
    "category": "celebrity",
    "nickname": "현빈팬마실"
  },
  {
    "category": "celebrity",
    "nickname": "손예진응원꽃"
  },
  {
    "category": "celebrity",
    "nickname": "김혜수팬산책"
  },
  {
    "category": "celebrity",
    "nickname": "전지현팬노을"
  },
  {
    "category": "celebrity",
    "nickname": "나훈아노래방석"
  },
  {
    "category": "celebrity",
    "nickname": "조용필노래수첩"
  },
  {
    "category": "english",
    "nickname": "Momo"
  },
  {
    "category": "english",
    "nickname": "Coco"
  },
  {
    "category": "english",
    "nickname": "Lily"
  },
  {
    "category": "english",
    "nickname": "Rose"
  },
  {
    "category": "english",
    "nickname": "Nina"
  },
  {
    "category": "english",
    "nickname": "Dora"
  },
  {
    "category": "english",
    "nickname": "Joy"
  },
  {
    "category": "english",
    "nickname": "Anne"
  },
  {
    "category": "hangul_number",
    "nickname": "달빛27"
  },
  {
    "category": "hangul_number",
    "nickname": "소담52"
  },
  {
    "category": "hangul_number",
    "nickname": "노을86"
  },
  {
    "category": "hangul_number",
    "nickname": "보리19"
  },
  {
    "category": "hangul_number",
    "nickname": "꽃길73"
  },
  {
    "category": "hangul_number",
    "nickname": "은별24"
  },
  {
    "category": "hangul_number",
    "nickname": "미소58"
  },
  {
    "category": "hangul_number",
    "nickname": "여울31"
  },
  {
    "category": "hangul_number",
    "nickname": "동백67"
  },
  {
    "category": "hangul_number",
    "nickname": "햇살42"
  },
  {
    "category": "hangul_number",
    "nickname": "라떼09"
  },
  {
    "category": "hangul_number",
    "nickname": "수풀64"
  },
  {
    "category": "hangul_number",
    "nickname": "살구38"
  },
  {
    "category": "hangul_number",
    "nickname": "연두15"
  },
  {
    "category": "hangul_number",
    "nickname": "다정82"
  },
  {
    "category": "hangul_number",
    "nickname": "하늘46"
  },
  {
    "category": "hangul_number",
    "nickname": "별빛93"
  },
  {
    "category": "hangul_number",
    "nickname": "봄날26"
  },
  {
    "category": "hangul_number",
    "nickname": "모란71"
  },
  {
    "category": "hangul_number",
    "nickname": "산들35"
  },
  {
    "category": "hangul_number",
    "nickname": "찻잔48"
  },
  {
    "category": "hangul_number",
    "nickname": "나무62"
  },
  {
    "category": "hangul_number",
    "nickname": "도란17"
  },
  {
    "category": "hangul_number",
    "nickname": "반달83"
  },
  {
    "category": "hangul_number",
    "nickname": "담쟁이29"
  },
  {
    "category": "hangul_number",
    "nickname": "느티57"
  },
  {
    "category": "hangul_number",
    "nickname": "물결34"
  },
  {
    "category": "hangul_number",
    "nickname": "동글68"
  },
  {
    "category": "hangul_number",
    "nickname": "소풍12"
  },
  {
    "category": "hangul_number",
    "nickname": "바람95"
  },
  {
    "category": "english_number",
    "nickname": "Mia27"
  },
  {
    "category": "english_number",
    "nickname": "Luna17"
  },
  {
    "category": "english_number",
    "nickname": "Bella63"
  },
  {
    "category": "english_number",
    "nickname": "Hana28"
  },
  {
    "category": "real_name",
    "nickname": "설은정"
  },
  {
    "category": "real_name",
    "nickname": "이정숙"
  },
  {
    "category": "real_name",
    "nickname": "남미경"
  },
  {
    "category": "real_name",
    "nickname": "최영희"
  },
  {
    "category": "real_name",
    "nickname": "정선희"
  },
  {
    "category": "real_name",
    "nickname": "강미영"
  },
  {
    "category": "real_name",
    "nickname": "윤정희"
  },
  {
    "category": "real_name",
    "nickname": "장혜숙"
  },
  {
    "category": "real_name",
    "nickname": "임은숙"
  },
  {
    "category": "real_name",
    "nickname": "한경희"
  },
  {
    "category": "real_name",
    "nickname": "오선영"
  },
  {
    "category": "real_name",
    "nickname": "서미숙"
  },
  {
    "category": "real_name",
    "nickname": "신영숙"
  },
  {
    "category": "real_name",
    "nickname": "권정애"
  },
  {
    "category": "real_name",
    "nickname": "황혜진"
  },
  {
    "category": "real_name",
    "nickname": "안수정"
  },
  {
    "category": "real_name",
    "nickname": "송은희"
  },
  {
    "category": "real_name",
    "nickname": "유미정"
  },
  {
    "category": "real_name",
    "nickname": "전선미"
  },
  {
    "category": "real_name",
    "nickname": "홍지숙"
  },
  {
    "category": "real_name",
    "nickname": "고명숙"
  },
  {
    "category": "real_name",
    "nickname": "문정희"
  },
  {
    "category": "real_name",
    "nickname": "양은경"
  },
  {
    "category": "real_name",
    "nickname": "손경숙"
  },
  {
    "category": "real_name",
    "nickname": "배정미"
  },
  {
    "category": "real_name",
    "nickname": "백선화"
  },
  {
    "category": "real_name",
    "nickname": "조미선"
  },
  {
    "category": "real_name",
    "nickname": "남수진"
  }
];
export function nicknameCollisionKey(value:string):string {
  return value.normalize('NFC').replace(/\s+/gu,'').toLowerCase();
}
export function availableNicknameCandidates(memberNames:readonly string[],reserved:ReadonlySet<string>):NicknameCandidate[] {
  const denied=new Set([...memberNames.map(nicknameCollisionKey),...reserved]);
  return NICKNAME_CANDIDATES.filter(x=>!denied.has(nicknameCollisionKey(x.nickname))).map(x=>({...x}));
}

// [2026-11-13 21:54 사장님 «53 같은 규칙적인 숫자 닉네임 금지»] 닉네임은 한 번 쓰면 다시 못 써서(시청자 한 명 들어올 때마다 1개) 후보 200개로는 금방 바닥난다.
//   숫자를 붙이는 대신 낱말 두 개를 이어 새 이름을 만든다(노을한잔·달빛산책과 같은 모양, 숫자 없음). 한 묶음 안에서는 앞말·뒷말이 서로 안 겹친다.
const NICK_HEAD=['노을','달빛','봄날','구름','보리','햇살','새벽','바람','은빛','여름','가을','겨울','봄빛','살구','꽃잎','반달','연두','귤빛','별빛','모란','자두','이슬','솔잎','단풍','유자','매실','앵두','호두','밤톨','도토리','민들레','수국','목련','동백','라일락','백합','튤립','솔방울','조약돌','모래','파도','물결','바다','호수','강변','언덕','들판','숲속','오솔길','골목','다락','창가','마루','초록','연분홍','보라','쪽빛','감빛','우유','아침','오후','저녁','한낮','주말','휴일','소풍','콧노래','휘파람','무지개','소나기','첫눈','봄비','햇님','달님','별님','꽃비','안개','서리','샘물','시냇물','옹달샘','대나무','버들','느티','은행잎','감나무','포도','복숭아','체리','레몬'];
const NICK_TAIL=['한잔','산책','라떼','정원','한줌','마중','풀잎','여울','찻집','서랍','편지','수첩','커피','한아름','우체통','주머니','다락방','주전자','마당','찻잔','보자기','책방','수다','소쿠리','그늘','한송이','쉼터','향기','바느질','일기','노트','엽서','담요','베개','의자','창문','계단','우산','장화','모자','목도리','단추','리본','구슬','풍선','연필','물감','악보','멜로디','자장가','이야기','속삭임','발자국','나침반','지도','여행','기차','정류장','꽃집','빵집','방앗간','텃밭','화분','씨앗','새싹','꽃씨','나비','참새','고양이','강아지','다람쥐','토끼','별사탕','솜사탕','젤리','쿠키','식빵','호빵','경단','꿀떡','카페','식탁','오두막','나들이','한스푼','바구니','손수건','앞치마','털실','뜨개질'];
export function generatedNicknameCandidates(count:number,random:()=>number=Math.random):NicknameCandidate[] {
  const shuffle=<T,>(list:readonly T[]):T[]=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const heads=shuffle(NICK_HEAD),tails=shuffle(NICK_TAIL),fixed=new Set(NICKNAME_CANDIDATES.map(x=>nicknameCollisionKey(x.nickname)));
  const out:NicknameCandidate[]=[];
  for(let i=0;i<Math.min(heads.length,tails.length)&&out.length<count;i++){
    const nickname=heads[i]+tails[i];
    if(fixed.has(nicknameCollisionKey(nickname)))continue;
    out.push({nickname,category:'korean'});
  }
  return out;
}
