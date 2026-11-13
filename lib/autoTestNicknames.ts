// lib/autoTestNicknames.ts
// [2026-11-13 사장님 「웃긴·평범·영어 한글발음·진짜 영어·섞은 닉네임 300개, 진짜 랜덤」] 자동 테스트 주문용 가상 닉네임.
//   방송 화면·채팅·위젯에 그대로 보이니 test 같은 글자는 넣지 않는다. 쓸 때마다 회원·지난 주문과 겹치는지 서버가 다시 확인.
const FUNNY = [
  "배고픈하마", "졸린판다", "월요병환자", "퇴근만기다림", "통장텅장", "택배기다리는중", "장바구니요정", "지름신강림", "눈팅전문가", "다이어트내일부터",
  "커피수혈중", "야식왕", "잠꾸러기곰", "귀차니즘대마왕", "고구마백개", "치킨은사랑", "라면한입만", "떡볶이중독", "주말만기다려", "냉장고파먹기",
  "옷장이터진다", "무지출챌린지실패", "카드값무서워", "출근하기싫어", "밥은먹고다니냐", "꿀잠자는중", "엄마손맛", "김치찌개장인", "삼겹살최고", "아이스크림덕후",
  "방구석패셔니스타", "알뜰살뜰주부", "쇼핑은취미", "언니최고", "이거실화냐", "대박사건", "오늘도득템", "득템요정", "핫딜헌터", "막차탄사람",
  "새벽감성", "멍때리기선수", "부지런한나무늘보", "느긋한거북이", "춤추는감자", "노래하는고등어", "웃는호박", "수다쟁이참새", "까치발토끼", "궁금한올빼미",
  "돌돌말이김밥", "참깨라면", "붕어빵장수", "호떡한입", "군고구마", "찹쌀떡", "단팥빵", "꽈배기", "식빵언니", "만두요정",
];
const PLAIN = [
  "행복한하루", "봄날의햇살", "푸른하늘", "맑은바람", "달빛소녀", "별빛가득", "꽃길만걷자", "소소한행복", "따뜻한마음", "작은정원",
  "해바라기", "민들레", "라일락", "벚꽃엔딩", "가을하늘", "첫눈오는날", "바다향기", "숲속산책", "구름한점", "무지개빛",
  "은하수", "새벽별", "단비", "이슬", "노을", "솔바람", "꽃님이", "예쁜이", "복덩이", "보물상자",
  "미소천사", "고운님", "정이네", "수진맘", "민지엄마", "지우맘", "하늘이네", "서연이네", "도윤맘", "하은이네",
  "영희", "순자언니", "미숙이", "정희", "은정", "경희", "현숙", "숙희", "옥자", "말순이",
  "다솜", "가람", "나래", "한빛", "보람", "슬기", "아름", "새롬", "한별", "초롱",
];
const EN_KO = [
  "해피데이", "러블리", "스위티", "허니", "써니", "럭키", "체리", "피치", "레몬", "베리",
  "버터플라이", "스노우", "레인보우", "스타라이트", "문라이트", "샤인", "드림", "엔젤", "프린세스", "퀸",
  "블루밍", "플라워", "로즈", "릴리", "데이지", "튤립", "코코", "모카", "라떼", "쿠키",
  "캔디", "젤리", "마카롱", "푸딩", "와플", "도넛", "머핀", "브라우니", "티라미수", "카푸치노",
  "스마일", "해피", "조이", "글로리", "하모니", "멜로디", "심포니", "로맨스", "판타지", "미라클",
];
const EN = [
  "sunny_day", "lovely_mom", "happy_life", "sweet_honey", "lucky_star", "cherry_blossom", "peach_tea", "lemon_drop", "berry_good", "coco_bean",
  "mocha_latte", "cookie_jar", "candy_pop", "jelly_bean", "moon_light", "star_dust", "blue_sky", "rainbow", "snow_white", "daisy",
  "rosemary", "lily_white", "tulip", "marigold", "violet", "jasmine", "olive", "hazel", "ivy", "maple",
  "angel", "princess", "queenbee", "honeybee", "butterfly", "ladybug", "kitty", "bunny", "puppy", "teddy",
  "smile", "joy", "grace", "hope", "faith", "bliss", "dreamer", "shine", "glow", "sparkle",
];
const MIX = [
  "happy엄마", "lucky언니", "sweet하루", "sunny맘", "cherry공주", "coco언니", "honey님", "love하늘", "star은하", "moon달빛",
  "블링bling", "꿀honey", "봄spring", "여름summer", "가을fall", "겨울winter", "핑크pink", "민트mint", "라벤더lavender", "골드gold",
  "jenny언니", "sophie맘", "emma엄마", "olivia네", "lucy공주", "amy언니", "kate맘", "anna님", "mia네", "zoe언니",
  "언니love", "엄마happy", "하늘blue", "바다ocean", "꽃flower", "별star", "달moon", "해sun", "숲forest", "눈snow",
];

const MORE = [
  "방송보는중", "오늘뭐입지", "신발부자", "가방부자", "옷부자될래", "패션테러리스트", "멋쟁이할매", "꽃중년", "청춘은지금", "인생은한번",
  "룰루랄라", "랄랄라", "얼씨구나", "좋구나", "신났다", "두근두근", "콩닥콩닥", "토닥토닥", "말랑말랑", "보들보들",
  "에스프레소", "아메리카노", "카라멜마끼아또", "녹차라떼", "딸기우유", "바나나우유", "초코우유", "식혜", "수정과", "유자차",
  "pinky", "minty", "lavender", "sky_blue", "coral", "ivory", "beige", "navy", "khaki", "burgundy",
];

/** 기본 목록(300개 안팎) — 겹치지 않게 중복 제거 */
export const AUTO_TEST_NICKNAME_POOL: string[] = [...new Set([...FUNNY, ...PLAIN, ...EN_KO, ...EN, ...MIX, ...MORE])];

/** 쓸 후보 n개 — 목록을 진짜 랜덤으로 섞어 앞에서부터. 목록이 바닥나면 숫자를 붙인 이름. */
export function pickNicknameCandidates(n: number, rand = Math.random): string[] {
  const pool = [...AUTO_TEST_NICKNAME_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
export function numberedNicknameCandidates(n: number, rand = Math.random): string[] {
  const out = new Set<string>();
  while (out.size < n) out.add(`${AUTO_TEST_NICKNAME_POOL[Math.floor(rand() * AUTO_TEST_NICKNAME_POOL.length)]}${10 + Math.floor(rand() * 990)}`);
  return [...out];
}
