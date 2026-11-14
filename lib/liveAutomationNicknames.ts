/** [2026-11-14 19:28 사장님 «테스트 닉네임이 전부 이상해 — 회원 닉네임과 대조해 진짜 그럴듯한 500개, 이상한 건 삭제»]
 * 사이트 회원 닉네임 3,988개(2026-11-14 실측)의 모양을 따라 만든 500개: 사람 이름 3글자·○○맘/○○언니/○○네/○여사·짧은 귀여운 말·
 * 일상 말(아아한잔·집콕중)·영어 이름(한글/영문)·간식 이름. 사장님 첨부 엑셀(500개)에서 고른 것 포함.
 * 실제 회원 닉네임과 똑같은 것(96개)은 뺐다(실제 배정 때 DB 가 한 번 더 막음). 숫자·test 글자·흔한 채팅 말(감사합니다 등) 없음.
 * 낱말 두 개를 이어 만들던 이름(매실다락방·서리정류장 등)은 폐기 — 이름은 이 500개만, 다 쓰면 나갔던 가상 손님을 «다시 온 손님»으로 다시 쓴다(DB).
 */
export type NicknameCategory='korean'|'humor'|'celebrity'|'english'|'hangul_number'|'english_number'|'real_name';
export type NicknameCandidate={nickname:string;category:NicknameCategory};
export const NICKNAME_CANDIDATES:readonly NicknameCandidate[]=[
  {
    "nickname": "김미경",
    "category": "real_name"
  },
  {
    "nickname": "박미숙",
    "category": "real_name"
  },
  {
    "nickname": "이정숙",
    "category": "real_name"
  },
  {
    "nickname": "최영희",
    "category": "real_name"
  },
  {
    "nickname": "정은숙",
    "category": "real_name"
  },
  {
    "nickname": "김정희",
    "category": "real_name"
  },
  {
    "nickname": "이영숙",
    "category": "real_name"
  },
  {
    "nickname": "조미정",
    "category": "real_name"
  },
  {
    "nickname": "오현숙",
    "category": "real_name"
  },
  {
    "nickname": "김현정",
    "category": "real_name"
  },
  {
    "nickname": "박지영",
    "category": "real_name"
  },
  {
    "nickname": "최미영",
    "category": "real_name"
  },
  {
    "nickname": "정미애",
    "category": "real_name"
  },
  {
    "nickname": "이혜경",
    "category": "real_name"
  },
  {
    "nickname": "한미숙",
    "category": "real_name"
  },
  {
    "nickname": "윤경숙",
    "category": "real_name"
  },
  {
    "nickname": "신은영",
    "category": "real_name"
  },
  {
    "nickname": "김수진",
    "category": "real_name"
  },
  {
    "nickname": "이지영",
    "category": "real_name"
  },
  {
    "nickname": "박은영",
    "category": "real_name"
  },
  {
    "nickname": "최정아",
    "category": "real_name"
  },
  {
    "nickname": "정혜진",
    "category": "real_name"
  },
  {
    "nickname": "이수연",
    "category": "real_name"
  },
  {
    "nickname": "박수경",
    "category": "real_name"
  },
  {
    "nickname": "김선희",
    "category": "real_name"
  },
  {
    "nickname": "임미정",
    "category": "real_name"
  },
  {
    "nickname": "장미란",
    "category": "real_name"
  },
  {
    "nickname": "김지은",
    "category": "real_name"
  },
  {
    "nickname": "이소영",
    "category": "real_name"
  },
  {
    "nickname": "박현주",
    "category": "real_name"
  },
  {
    "nickname": "최유진",
    "category": "real_name"
  },
  {
    "nickname": "정수영",
    "category": "real_name"
  },
  {
    "nickname": "김미정",
    "category": "real_name"
  },
  {
    "nickname": "이경아",
    "category": "real_name"
  },
  {
    "nickname": "송지현",
    "category": "real_name"
  },
  {
    "nickname": "유미란",
    "category": "real_name"
  },
  {
    "nickname": "박선영",
    "category": "real_name"
  },
  {
    "nickname": "최지현",
    "category": "real_name"
  },
  {
    "nickname": "정민정",
    "category": "real_name"
  },
  {
    "nickname": "김경미",
    "category": "real_name"
  },
  {
    "nickname": "박소영",
    "category": "real_name"
  },
  {
    "nickname": "김나영",
    "category": "real_name"
  },
  {
    "nickname": "이수진",
    "category": "real_name"
  },
  {
    "nickname": "박은정",
    "category": "real_name"
  },
  {
    "nickname": "최정윤",
    "category": "real_name"
  },
  {
    "nickname": "정선아",
    "category": "real_name"
  },
  {
    "nickname": "이민정",
    "category": "real_name"
  },
  {
    "nickname": "박희정",
    "category": "real_name"
  },
  {
    "nickname": "권미영",
    "category": "real_name"
  },
  {
    "nickname": "양지은",
    "category": "real_name"
  },
  {
    "nickname": "강순자",
    "category": "real_name"
  },
  {
    "nickname": "고미라",
    "category": "real_name"
  },
  {
    "nickname": "구정란",
    "category": "real_name"
  },
  {
    "nickname": "권혜숙",
    "category": "real_name"
  },
  {
    "nickname": "남정희",
    "category": "real_name"
  },
  {
    "nickname": "노미선",
    "category": "real_name"
  },
  {
    "nickname": "도경자",
    "category": "real_name"
  },
  {
    "nickname": "류현숙",
    "category": "real_name"
  },
  {
    "nickname": "마선영",
    "category": "real_name"
  },
  {
    "nickname": "문정임",
    "category": "real_name"
  },
  {
    "nickname": "민혜란",
    "category": "real_name"
  },
  {
    "nickname": "반은희",
    "category": "real_name"
  },
  {
    "nickname": "방미옥",
    "category": "real_name"
  },
  {
    "nickname": "백정숙",
    "category": "real_name"
  },
  {
    "nickname": "서명희",
    "category": "real_name"
  },
  {
    "nickname": "석은주",
    "category": "real_name"
  },
  {
    "nickname": "성미란",
    "category": "real_name"
  },
  {
    "nickname": "손정애",
    "category": "real_name"
  },
  {
    "nickname": "송현미",
    "category": "real_name"
  },
  {
    "nickname": "신미자",
    "category": "real_name"
  },
  {
    "nickname": "안경옥",
    "category": "real_name"
  },
  {
    "nickname": "양순희",
    "category": "real_name"
  },
  {
    "nickname": "엄미경",
    "category": "real_name"
  },
  {
    "nickname": "여혜정",
    "category": "real_name"
  },
  {
    "nickname": "오순덕",
    "category": "real_name"
  },
  {
    "nickname": "우정미",
    "category": "real_name"
  },
  {
    "nickname": "원미숙",
    "category": "real_name"
  },
  {
    "nickname": "위경란",
    "category": "real_name"
  },
  {
    "nickname": "유선자",
    "category": "real_name"
  },
  {
    "nickname": "윤희정",
    "category": "real_name"
  },
  {
    "nickname": "이춘희",
    "category": "real_name"
  },
  {
    "nickname": "인미영",
    "category": "real_name"
  },
  {
    "nickname": "임경애",
    "category": "real_name"
  },
  {
    "nickname": "장순옥",
    "category": "real_name"
  },
  {
    "nickname": "전미혜",
    "category": "real_name"
  },
  {
    "nickname": "정옥순",
    "category": "real_name"
  },
  {
    "nickname": "조경란",
    "category": "real_name"
  },
  {
    "nickname": "주미숙",
    "category": "real_name"
  },
  {
    "nickname": "지은희",
    "category": "real_name"
  },
  {
    "nickname": "진숙자",
    "category": "real_name"
  },
  {
    "nickname": "차혜련",
    "category": "real_name"
  },
  {
    "nickname": "채미정",
    "category": "real_name"
  },
  {
    "nickname": "천경숙",
    "category": "real_name"
  },
  {
    "nickname": "최순애",
    "category": "real_name"
  },
  {
    "nickname": "추정희",
    "category": "real_name"
  },
  {
    "nickname": "탁미경",
    "category": "real_name"
  },
  {
    "nickname": "하정숙",
    "category": "real_name"
  },
  {
    "nickname": "한경애",
    "category": "real_name"
  },
  {
    "nickname": "함은숙",
    "category": "real_name"
  },
  {
    "nickname": "허미란",
    "category": "real_name"
  },
  {
    "nickname": "현정옥",
    "category": "real_name"
  },
  {
    "nickname": "홍순미",
    "category": "real_name"
  },
  {
    "nickname": "황미경",
    "category": "real_name"
  },
  {
    "nickname": "김말순",
    "category": "real_name"
  },
  {
    "nickname": "이복희",
    "category": "real_name"
  },
  {
    "nickname": "박영란",
    "category": "real_name"
  },
  {
    "nickname": "최숙희",
    "category": "real_name"
  },
  {
    "nickname": "정금옥",
    "category": "real_name"
  },
  {
    "nickname": "김연희",
    "category": "real_name"
  },
  {
    "nickname": "김서영",
    "category": "real_name"
  },
  {
    "nickname": "이하나",
    "category": "real_name"
  },
  {
    "nickname": "박지혜",
    "category": "real_name"
  },
  {
    "nickname": "최수아",
    "category": "real_name"
  },
  {
    "nickname": "정다솜",
    "category": "real_name"
  },
  {
    "nickname": "강보라",
    "category": "real_name"
  },
  {
    "nickname": "조아라",
    "category": "real_name"
  },
  {
    "nickname": "윤소희",
    "category": "real_name"
  },
  {
    "nickname": "장혜원",
    "category": "real_name"
  },
  {
    "nickname": "임채원",
    "category": "real_name"
  },
  {
    "nickname": "한지수",
    "category": "real_name"
  },
  {
    "nickname": "오다은",
    "category": "real_name"
  },
  {
    "nickname": "서유리",
    "category": "real_name"
  },
  {
    "nickname": "신혜린",
    "category": "real_name"
  },
  {
    "nickname": "권나연",
    "category": "real_name"
  },
  {
    "nickname": "황보은",
    "category": "real_name"
  },
  {
    "nickname": "안수민",
    "category": "real_name"
  },
  {
    "nickname": "송예린",
    "category": "real_name"
  },
  {
    "nickname": "전소연",
    "category": "real_name"
  },
  {
    "nickname": "홍지아",
    "category": "real_name"
  },
  {
    "nickname": "민서맘",
    "category": "korean"
  },
  {
    "nickname": "하윤맘",
    "category": "korean"
  },
  {
    "nickname": "지우맘",
    "category": "korean"
  },
  {
    "nickname": "서준맘",
    "category": "korean"
  },
  {
    "nickname": "도윤맘",
    "category": "korean"
  },
  {
    "nickname": "예은맘",
    "category": "korean"
  },
  {
    "nickname": "수아맘",
    "category": "korean"
  },
  {
    "nickname": "채원이맘",
    "category": "korean"
  },
  {
    "nickname": "다둥이맘",
    "category": "korean"
  },
  {
    "nickname": "딸둘맘",
    "category": "korean"
  },
  {
    "nickname": "아들둘맘",
    "category": "korean"
  },
  {
    "nickname": "지호맘",
    "category": "korean"
  },
  {
    "nickname": "현이맘",
    "category": "korean"
  },
  {
    "nickname": "은우엄마",
    "category": "korean"
  },
  {
    "nickname": "서아엄마",
    "category": "korean"
  },
  {
    "nickname": "다은엄마",
    "category": "korean"
  },
  {
    "nickname": "쌍둥이엄마",
    "category": "korean"
  },
  {
    "nickname": "토리맘",
    "category": "korean"
  },
  {
    "nickname": "초코맘",
    "category": "korean"
  },
  {
    "nickname": "콩이엄마",
    "category": "korean"
  },
  {
    "nickname": "사랑이엄마",
    "category": "korean"
  },
  {
    "nickname": "루나엄마",
    "category": "korean"
  },
  {
    "nickname": "몽이누나",
    "category": "korean"
  },
  {
    "nickname": "구름이맘",
    "category": "korean"
  },
  {
    "nickname": "윤아맘",
    "category": "korean"
  },
  {
    "nickname": "지민맘",
    "category": "korean"
  },
  {
    "nickname": "서윤맘",
    "category": "korean"
  },
  {
    "nickname": "하린맘",
    "category": "korean"
  },
  {
    "nickname": "준우맘",
    "category": "korean"
  },
  {
    "nickname": "시윤맘",
    "category": "korean"
  },
  {
    "nickname": "유나맘",
    "category": "korean"
  },
  {
    "nickname": "예준맘",
    "category": "korean"
  },
  {
    "nickname": "건우맘",
    "category": "korean"
  },
  {
    "nickname": "소율맘",
    "category": "korean"
  },
  {
    "nickname": "태리맘",
    "category": "korean"
  },
  {
    "nickname": "단비맘",
    "category": "korean"
  },
  {
    "nickname": "보리맘",
    "category": "korean"
  },
  {
    "nickname": "두부맘",
    "category": "korean"
  },
  {
    "nickname": "호두맘",
    "category": "korean"
  },
  {
    "nickname": "별이맘",
    "category": "korean"
  },
  {
    "nickname": "꼬미맘",
    "category": "korean"
  },
  {
    "nickname": "해피맘",
    "category": "korean"
  },
  {
    "nickname": "은찬맘",
    "category": "korean"
  },
  {
    "nickname": "리아맘",
    "category": "korean"
  },
  {
    "nickname": "준이네",
    "category": "korean"
  },
  {
    "nickname": "율이네",
    "category": "korean"
  },
  {
    "nickname": "다온이네",
    "category": "korean"
  },
  {
    "nickname": "하랑이네",
    "category": "korean"
  },
  {
    "nickname": "민이네",
    "category": "korean"
  },
  {
    "nickname": "쭈쭈네",
    "category": "korean"
  },
  {
    "nickname": "수아네",
    "category": "korean"
  },
  {
    "nickname": "지아네",
    "category": "korean"
  },
  {
    "nickname": "예솔이네",
    "category": "korean"
  },
  {
    "nickname": "은솔맘",
    "category": "korean"
  },
  {
    "nickname": "미자언니",
    "category": "korean"
  },
  {
    "nickname": "영희언니",
    "category": "korean"
  },
  {
    "nickname": "순자언니",
    "category": "korean"
  },
  {
    "nickname": "혜숙언니",
    "category": "korean"
  },
  {
    "nickname": "정숙이모",
    "category": "korean"
  },
  {
    "nickname": "수진언니",
    "category": "korean"
  },
  {
    "nickname": "소영언니",
    "category": "korean"
  },
  {
    "nickname": "은정언니",
    "category": "korean"
  },
  {
    "nickname": "지영언니",
    "category": "korean"
  },
  {
    "nickname": "동네언니",
    "category": "korean"
  },
  {
    "nickname": "옆집언니",
    "category": "korean"
  },
  {
    "nickname": "미선언니",
    "category": "korean"
  },
  {
    "nickname": "경아언니",
    "category": "korean"
  },
  {
    "nickname": "현주언니",
    "category": "korean"
  },
  {
    "nickname": "명희언니",
    "category": "korean"
  },
  {
    "nickname": "숙이언니",
    "category": "korean"
  },
  {
    "nickname": "쏭언니",
    "category": "korean"
  },
  {
    "nickname": "진주언니",
    "category": "korean"
  },
  {
    "nickname": "홍여사",
    "category": "korean"
  },
  {
    "nickname": "김여사",
    "category": "korean"
  },
  {
    "nickname": "박여사",
    "category": "korean"
  },
  {
    "nickname": "이여사",
    "category": "korean"
  },
  {
    "nickname": "장여사",
    "category": "korean"
  },
  {
    "nickname": "최여사",
    "category": "korean"
  },
  {
    "nickname": "오여사",
    "category": "korean"
  },
  {
    "nickname": "한여사",
    "category": "korean"
  },
  {
    "nickname": "강여사",
    "category": "korean"
  },
  {
    "nickname": "송여사",
    "category": "korean"
  },
  {
    "nickname": "신여사",
    "category": "korean"
  },
  {
    "nickname": "은이네",
    "category": "korean"
  },
  {
    "nickname": "미영이네",
    "category": "korean"
  },
  {
    "nickname": "정희네",
    "category": "korean"
  },
  {
    "nickname": "소희네",
    "category": "korean"
  },
  {
    "nickname": "영희네",
    "category": "korean"
  },
  {
    "nickname": "혜진이네",
    "category": "korean"
  },
  {
    "nickname": "지연이네",
    "category": "korean"
  },
  {
    "nickname": "민정이네",
    "category": "korean"
  },
  {
    "nickname": "영미네",
    "category": "korean"
  },
  {
    "nickname": "수경이네",
    "category": "korean"
  },
  {
    "nickname": "경숙이네",
    "category": "korean"
  },
  {
    "nickname": "순이네",
    "category": "korean"
  },
  {
    "nickname": "쏭쏭이",
    "category": "korean"
  },
  {
    "nickname": "쭈쭈",
    "category": "korean"
  },
  {
    "nickname": "찌니찌니",
    "category": "korean"
  },
  {
    "nickname": "순둥이",
    "category": "korean"
  },
  {
    "nickname": "뽀짝이",
    "category": "korean"
  },
  {
    "nickname": "콩순이",
    "category": "korean"
  },
  {
    "nickname": "몽글이",
    "category": "korean"
  },
  {
    "nickname": "꼬물이",
    "category": "korean"
  },
  {
    "nickname": "찹쌀떡",
    "category": "korean"
  },
  {
    "nickname": "밤톨이",
    "category": "korean"
  },
  {
    "nickname": "땅콩이",
    "category": "korean"
  },
  {
    "nickname": "왕밤빵",
    "category": "korean"
  },
  {
    "nickname": "방긋이",
    "category": "korean"
  },
  {
    "nickname": "햇살이",
    "category": "korean"
  },
  {
    "nickname": "초롱이",
    "category": "korean"
  },
  {
    "nickname": "토순이",
    "category": "korean"
  },
  {
    "nickname": "뽀송이",
    "category": "korean"
  },
  {
    "nickname": "봉봉이",
    "category": "korean"
  },
  {
    "nickname": "까꿍이",
    "category": "korean"
  },
  {
    "nickname": "뿌꾸",
    "category": "korean"
  },
  {
    "nickname": "미미짱",
    "category": "korean"
  },
  {
    "nickname": "나나짱",
    "category": "korean"
  },
  {
    "nickname": "쪼꼬미",
    "category": "korean"
  },
  {
    "nickname": "별콩이",
    "category": "korean"
  },
  {
    "nickname": "달콩이",
    "category": "korean"
  },
  {
    "nickname": "알콩이",
    "category": "korean"
  },
  {
    "nickname": "삐약이",
    "category": "korean"
  },
  {
    "nickname": "꼬마곰",
    "category": "korean"
  },
  {
    "nickname": "웃음꽃",
    "category": "korean"
  },
  {
    "nickname": "맑음이",
    "category": "korean"
  },
  {
    "nickname": "콩콩이",
    "category": "korean"
  },
  {
    "nickname": "뚜비뚜비",
    "category": "korean"
  },
  {
    "nickname": "쏘블리",
    "category": "korean"
  },
  {
    "nickname": "밍블리",
    "category": "korean"
  },
  {
    "nickname": "수블리",
    "category": "korean"
  },
  {
    "nickname": "쩡블리",
    "category": "korean"
  },
  {
    "nickname": "꽁꽁이",
    "category": "korean"
  },
  {
    "nickname": "콩떡",
    "category": "korean"
  },
  {
    "nickname": "쑥떡",
    "category": "korean"
  },
  {
    "nickname": "꿀떡이",
    "category": "korean"
  },
  {
    "nickname": "찐빵",
    "category": "korean"
  },
  {
    "nickname": "호빵이",
    "category": "korean"
  },
  {
    "nickname": "만두",
    "category": "korean"
  },
  {
    "nickname": "군만두",
    "category": "korean"
  },
  {
    "nickname": "꼬마김밥",
    "category": "korean"
  },
  {
    "nickname": "깨순이",
    "category": "korean"
  },
  {
    "nickname": "단호박",
    "category": "korean"
  },
  {
    "nickname": "옥수수",
    "category": "korean"
  },
  {
    "nickname": "땅콩버터",
    "category": "korean"
  },
  {
    "nickname": "순두부",
    "category": "korean"
  },
  {
    "nickname": "몽몽",
    "category": "korean"
  },
  {
    "nickname": "뭉치",
    "category": "korean"
  },
  {
    "nickname": "뭉게",
    "category": "korean"
  },
  {
    "nickname": "별이",
    "category": "korean"
  },
  {
    "nickname": "해님",
    "category": "korean"
  },
  {
    "nickname": "봄이",
    "category": "korean"
  },
  {
    "nickname": "여름이",
    "category": "korean"
  },
  {
    "nickname": "가을이",
    "category": "korean"
  },
  {
    "nickname": "겨울이",
    "category": "korean"
  },
  {
    "nickname": "단비",
    "category": "korean"
  },
  {
    "nickname": "이슬이",
    "category": "korean"
  },
  {
    "nickname": "아롱이",
    "category": "korean"
  },
  {
    "nickname": "다롱이",
    "category": "korean"
  },
  {
    "nickname": "꼬미",
    "category": "korean"
  },
  {
    "nickname": "쪼미",
    "category": "korean"
  },
  {
    "nickname": "꼬꼬",
    "category": "korean"
  },
  {
    "nickname": "삐삐",
    "category": "korean"
  },
  {
    "nickname": "뽀뽀",
    "category": "korean"
  },
  {
    "nickname": "뽀미",
    "category": "korean"
  },
  {
    "nickname": "미루",
    "category": "korean"
  },
  {
    "nickname": "나루",
    "category": "korean"
  },
  {
    "nickname": "가람",
    "category": "korean"
  },
  {
    "nickname": "새롬",
    "category": "korean"
  },
  {
    "nickname": "다솜",
    "category": "korean"
  },
  {
    "nickname": "은솔",
    "category": "korean"
  },
  {
    "nickname": "예솔",
    "category": "korean"
  },
  {
    "nickname": "해솔",
    "category": "korean"
  },
  {
    "nickname": "초롱",
    "category": "korean"
  },
  {
    "nickname": "방울이",
    "category": "korean"
  },
  {
    "nickname": "구슬이",
    "category": "korean"
  },
  {
    "nickname": "단추",
    "category": "korean"
  },
  {
    "nickname": "리본이",
    "category": "korean"
  },
  {
    "nickname": "깨비",
    "category": "korean"
  },
  {
    "nickname": "꼬마요정",
    "category": "korean"
  },
  {
    "nickname": "꽃공주",
    "category": "korean"
  },
  {
    "nickname": "딸기",
    "category": "korean"
  },
  {
    "nickname": "자두",
    "category": "korean"
  },
  {
    "nickname": "복숭아",
    "category": "korean"
  },
  {
    "nickname": "홍시",
    "category": "korean"
  },
  {
    "nickname": "곶감",
    "category": "korean"
  },
  {
    "nickname": "한라봉",
    "category": "korean"
  },
  {
    "nickname": "귤이",
    "category": "korean"
  },
  {
    "nickname": "유자",
    "category": "korean"
  },
  {
    "nickname": "메론",
    "category": "korean"
  },
  {
    "nickname": "수박",
    "category": "korean"
  },
  {
    "nickname": "참외",
    "category": "korean"
  },
  {
    "nickname": "머루",
    "category": "korean"
  },
  {
    "nickname": "다래",
    "category": "korean"
  },
  {
    "nickname": "오디",
    "category": "korean"
  },
  {
    "nickname": "산딸기",
    "category": "korean"
  },
  {
    "nickname": "쑤니",
    "category": "korean"
  },
  {
    "nickname": "꾸니",
    "category": "korean"
  },
  {
    "nickname": "뚜니",
    "category": "korean"
  },
  {
    "nickname": "순이",
    "category": "korean"
  },
  {
    "nickname": "미야",
    "category": "korean"
  },
  {
    "nickname": "똘순이",
    "category": "korean"
  },
  {
    "nickname": "꼼지",
    "category": "korean"
  },
  {
    "nickname": "아띠",
    "category": "korean"
  },
  {
    "nickname": "아기곰",
    "category": "korean"
  },
  {
    "nickname": "곰순이",
    "category": "korean"
  },
  {
    "nickname": "토끼",
    "category": "korean"
  },
  {
    "nickname": "바니",
    "category": "korean"
  },
  {
    "nickname": "냥이",
    "category": "korean"
  },
  {
    "nickname": "야옹이",
    "category": "korean"
  },
  {
    "nickname": "멍이",
    "category": "korean"
  },
  {
    "nickname": "댕이",
    "category": "korean"
  },
  {
    "nickname": "마카롱",
    "category": "korean"
  },
  {
    "nickname": "푸딩",
    "category": "korean"
  },
  {
    "nickname": "솜사탕",
    "category": "korean"
  },
  {
    "nickname": "츄러스",
    "category": "korean"
  },
  {
    "nickname": "와플",
    "category": "korean"
  },
  {
    "nickname": "붕어빵",
    "category": "korean"
  },
  {
    "nickname": "호떡",
    "category": "korean"
  },
  {
    "nickname": "계란빵",
    "category": "korean"
  },
  {
    "nickname": "언제나봄",
    "category": "humor"
  },
  {
    "nickname": "행복한하루",
    "category": "humor"
  },
  {
    "nickname": "꽃길만걷자",
    "category": "humor"
  },
  {
    "nickname": "웃으며살자",
    "category": "humor"
  },
  {
    "nickname": "나답게",
    "category": "humor"
  },
  {
    "nickname": "하루하루",
    "category": "humor"
  },
  {
    "nickname": "천천히",
    "category": "humor"
  },
  {
    "nickname": "느리게살기",
    "category": "humor"
  },
  {
    "nickname": "쉬엄쉬엄",
    "category": "humor"
  },
  {
    "nickname": "여유롭게",
    "category": "humor"
  },
  {
    "nickname": "두근두근",
    "category": "humor"
  },
  {
    "nickname": "설레임",
    "category": "humor"
  },
  {
    "nickname": "봄날의햇살",
    "category": "humor"
  },
  {
    "nickname": "가을하늘",
    "category": "humor"
  },
  {
    "nickname": "겨울바다",
    "category": "humor"
  },
  {
    "nickname": "바다좋아",
    "category": "humor"
  },
  {
    "nickname": "꽃좋아",
    "category": "humor"
  },
  {
    "nickname": "커피좋아",
    "category": "humor"
  },
  {
    "nickname": "빵좋아",
    "category": "humor"
  },
  {
    "nickname": "떡좋아",
    "category": "humor"
  },
  {
    "nickname": "산이좋아",
    "category": "humor"
  },
  {
    "nickname": "걷는게좋아",
    "category": "humor"
  },
  {
    "nickname": "옷이좋아",
    "category": "humor"
  },
  {
    "nickname": "쇼핑좋아",
    "category": "humor"
  },
  {
    "nickname": "지름신",
    "category": "humor"
  },
  {
    "nickname": "오늘도화이팅",
    "category": "humor"
  },
  {
    "nickname": "예쁘게살자",
    "category": "humor"
  },
  {
    "nickname": "멋지게살자",
    "category": "humor"
  },
  {
    "nickname": "착하게살자",
    "category": "humor"
  },
  {
    "nickname": "아아한잔",
    "category": "humor"
  },
  {
    "nickname": "얼죽아",
    "category": "humor"
  },
  {
    "nickname": "따아파",
    "category": "humor"
  },
  {
    "nickname": "커피한잔",
    "category": "humor"
  },
  {
    "nickname": "라떼좋아",
    "category": "humor"
  },
  {
    "nickname": "빵순이",
    "category": "humor"
  },
  {
    "nickname": "집콕중",
    "category": "humor"
  },
  {
    "nickname": "낮잠최고",
    "category": "humor"
  },
  {
    "nickname": "산책중",
    "category": "humor"
  },
  {
    "nickname": "동네한바퀴",
    "category": "humor"
  },
  {
    "nickname": "꽃구경",
    "category": "humor"
  },
  {
    "nickname": "오운완",
    "category": "humor"
  },
  {
    "nickname": "홈트중",
    "category": "humor"
  },
  {
    "nickname": "등산좋아",
    "category": "humor"
  },
  {
    "nickname": "캠핑좋아",
    "category": "humor"
  },
  {
    "nickname": "여행가고파",
    "category": "humor"
  },
  {
    "nickname": "제주살이",
    "category": "humor"
  },
  {
    "nickname": "바다보러가자",
    "category": "humor"
  },
  {
    "nickname": "맛집탐방",
    "category": "humor"
  },
  {
    "nickname": "혼밥중",
    "category": "humor"
  },
  {
    "nickname": "소확행",
    "category": "humor"
  },
  {
    "nickname": "엄마는멋쟁이",
    "category": "humor"
  },
  {
    "nickname": "우리집공주",
    "category": "humor"
  },
  {
    "nickname": "우리딸최고",
    "category": "humor"
  },
  {
    "nickname": "아들바보",
    "category": "humor"
  },
  {
    "nickname": "딸바보",
    "category": "humor"
  },
  {
    "nickname": "손주바보",
    "category": "humor"
  },
  {
    "nickname": "강아지엄마",
    "category": "humor"
  },
  {
    "nickname": "고양이엄마",
    "category": "humor"
  },
  {
    "nickname": "냥집사",
    "category": "humor"
  },
  {
    "nickname": "멍집사",
    "category": "humor"
  },
  {
    "nickname": "식물집사",
    "category": "humor"
  },
  {
    "nickname": "화분부자",
    "category": "humor"
  },
  {
    "nickname": "텃밭농부",
    "category": "humor"
  },
  {
    "nickname": "주말농부",
    "category": "humor"
  },
  {
    "nickname": "시골아낙",
    "category": "humor"
  },
  {
    "nickname": "서울언니",
    "category": "humor"
  },
  {
    "nickname": "부산언니",
    "category": "humor"
  },
  {
    "nickname": "광주언니",
    "category": "humor"
  },
  {
    "nickname": "제주댁",
    "category": "humor"
  },
  {
    "nickname": "강원도감자",
    "category": "humor"
  },
  {
    "nickname": "레이첼",
    "category": "english"
  },
  {
    "nickname": "올리비아",
    "category": "english"
  },
  {
    "nickname": "소피아",
    "category": "english"
  },
  {
    "nickname": "엠마",
    "category": "english"
  },
  {
    "nickname": "클레어",
    "category": "english"
  },
  {
    "nickname": "스텔라",
    "category": "english"
  },
  {
    "nickname": "루시",
    "category": "english"
  },
  {
    "nickname": "로즈",
    "category": "english"
  },
  {
    "nickname": "릴리",
    "category": "english"
  },
  {
    "nickname": "헬렌",
    "category": "english"
  },
  {
    "nickname": "러브",
    "category": "english"
  },
  {
    "nickname": "엔젤",
    "category": "english"
  },
  {
    "nickname": "비비",
    "category": "english"
  },
  {
    "nickname": "쥬쥬",
    "category": "english"
  },
  {
    "nickname": "애니",
    "category": "english"
  },
  {
    "nickname": "줄리",
    "category": "english"
  },
  {
    "nickname": "제인",
    "category": "english"
  },
  {
    "nickname": "미아",
    "category": "english"
  },
  {
    "nickname": "에이미",
    "category": "english"
  },
  {
    "nickname": "수지",
    "category": "english"
  },
  {
    "nickname": "캐시",
    "category": "english"
  },
  {
    "nickname": "낸시",
    "category": "english"
  },
  {
    "nickname": "메리",
    "category": "english"
  },
  {
    "nickname": "샐리",
    "category": "english"
  },
  {
    "nickname": "티나",
    "category": "english"
  },
  {
    "nickname": "니나",
    "category": "english"
  },
  {
    "nickname": "레나",
    "category": "english"
  },
  {
    "nickname": "엘사",
    "category": "english"
  },
  {
    "nickname": "안나",
    "category": "english"
  },
  {
    "nickname": "베키",
    "category": "english"
  },
  {
    "nickname": "마리",
    "category": "english"
  },
  {
    "nickname": "수잔",
    "category": "english"
  },
  {
    "nickname": "다이애나",
    "category": "english"
  },
  {
    "nickname": "비비안",
    "category": "english"
  },
  {
    "nickname": "엘리스",
    "category": "english"
  },
  {
    "nickname": "nana",
    "category": "english"
  },
  {
    "nickname": "momo",
    "category": "english"
  },
  {
    "nickname": "coco",
    "category": "english"
  },
  {
    "nickname": "kiki",
    "category": "english"
  },
  {
    "nickname": "lucky",
    "category": "english"
  },
  {
    "nickname": "lovely",
    "category": "english"
  },
  {
    "nickname": "rosy",
    "category": "english"
  },
  {
    "nickname": "lily",
    "category": "english"
  },
  {
    "nickname": "daisy",
    "category": "english"
  },
  {
    "nickname": "grace",
    "category": "english"
  },
  {
    "nickname": "joy",
    "category": "english"
  },
  {
    "nickname": "honey",
    "category": "english"
  },
  {
    "nickname": "berry",
    "category": "english"
  },
  {
    "nickname": "cherry",
    "category": "english"
  },
  {
    "nickname": "bunny",
    "category": "english"
  },
  {
    "nickname": "Emma",
    "category": "english"
  },
  {
    "nickname": "Olivia",
    "category": "english"
  },
  {
    "nickname": "Chloe",
    "category": "english"
  },
  {
    "nickname": "Nina",
    "category": "english"
  },
  {
    "nickname": "Hana",
    "category": "english"
  },
  {
    "nickname": "Mina",
    "category": "english"
  },
  {
    "nickname": "Yuna",
    "category": "english"
  },
  {
    "nickname": "Sora",
    "category": "english"
  },
  {
    "nickname": "Eunji",
    "category": "english"
  },
  {
    "nickname": "Hyejin",
    "category": "english"
  },
  {
    "nickname": "Minji",
    "category": "english"
  },
  {
    "nickname": "Jiyeon",
    "category": "english"
  },
  {
    "nickname": "비비빅",
    "category": "korean"
  },
  {
    "nickname": "붕어싸만코",
    "category": "korean"
  },
  {
    "nickname": "쌍쌍바",
    "category": "korean"
  },
  {
    "nickname": "바밤바",
    "category": "korean"
  },
  {
    "nickname": "누가바",
    "category": "korean"
  },
  {
    "nickname": "월드콘",
    "category": "korean"
  },
  {
    "nickname": "청포도에이드",
    "category": "korean"
  },
  {
    "nickname": "콜드브루",
    "category": "korean"
  },
  {
    "nickname": "녹차라떼",
    "category": "korean"
  },
  {
    "nickname": "고구마라떼",
    "category": "korean"
  },
  {
    "nickname": "흑당밀크티",
    "category": "korean"
  },
  {
    "nickname": "딸기우유",
    "category": "korean"
  },
  {
    "nickname": "바나나우유",
    "category": "korean"
  },
  {
    "nickname": "유자차",
    "category": "korean"
  },
  {
    "nickname": "떡볶이",
    "category": "korean"
  },
  {
    "nickname": "순대",
    "category": "korean"
  },
  {
    "nickname": "김밥",
    "category": "korean"
  },
  {
    "nickname": "냉면",
    "category": "korean"
  },
  {
    "nickname": "잔치국수",
    "category": "korean"
  },
  {
    "nickname": "미역국",
    "category": "korean"
  }
];
export function nicknameCollisionKey(value:string):string {
  return value.normalize('NFC').replace(/\s+/gu,'').toLowerCase();
}
export function availableNicknameCandidates(memberNames:readonly string[],reserved:ReadonlySet<string>):NicknameCandidate[] {
  const denied=new Set([...memberNames.map(nicknameCollisionKey),...reserved]);
  return NICKNAME_CANDIDATES.filter(x=>!denied.has(nicknameCollisionKey(x.nickname))).map(x=>({...x}));
}
