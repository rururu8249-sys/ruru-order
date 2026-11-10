// [2026-11-10 15:41] lib/liveChatEmojiSuggest — 채팅 입력칸 단어 → 이모티콘 추천(부르는 말·초성·반복 글자·쓰는 중)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const S = load("lib/liveChatEmojiSuggest.ts");
const E = load("lib/liveChatEmoji.ts");

const NAMES = ["ㅋㅋㅋ","동실장","루루업","주문","등근육","좋은아침","사랑해요","맛점","꾸벅","하트","기도","화남","덜덜","취침","으흐흐","삐짐","OK","안녕","감사합니다","최고야","신나","사랑해","속상해","미안해","화이팅","열심히하는중","잘자","빼꼼","냠냠","뭐지","축하해","글쎄","안녕히가세요"];
const items = NAMES.map((name, i) => ({ id: `e${String(i).padStart(4, "0")}`, name, url: `https://x/${i}.webp`, on: true }));
const top = (w, n = 8) => S.suggestEmojis(w, items, n).map((e) => e.name);
const has = (w, name) => assert.ok(top(w).includes(name), `「${w}」 → ${name} 이 나와야 함 (실제: ${top(w).join(",") || "없음"})`);
const first = (w, name) => assert.equal(top(w)[0], name, `「${w}」 첫 추천 = ${name} (실제: ${top(w).join(",") || "없음"})`);
const none = (w) => assert.deepEqual(top(w), [], `「${w}」 → 추천 없어야 함 (실제: ${top(w).join(",")})`);

// 모든 이모티콘은 자기 이름으로 1등
for (const n of NAMES) first(n, n);
// 기본 단어표가 모든 이모티콘에 있음
for (const n of NAMES) assert.ok((S.DEFAULT_EMOJI_KEYWORDS[n] || []).length >= 3, `${n} 기본 단어 3개 이상`);

// 반복 글자
for (const w of ["ㅋㅋ", "ㅋㅋㅋ", "ㅋㅋㅋㅋㅋㅋㅋ"]) first(w, "ㅋㅋㅋ");
for (const w of ["ㅎㅎ", "ㅎㅎㅎㅎ", "히히", "헤헤헤", "하하하하"]) first(w, "으흐흐");
for (const w of ["ㅠㅠ", "ㅜㅜ", "ㅠㅠㅠㅠ", "ㅜㅠ"]) { const t = top(w); assert.ok(t.includes("속상해") || w === "ㅜㅠ", `「${w}」 속상해 (실제 ${t})`); }
has("ㅠㅠ", "미안해");
first("ㄷㄷ", "덜덜"); first("ㄷㄷㄷㄷ", "덜덜");

// 초성
first("ㄱㅅ", "감사합니다");
has("ㅎㅇㅌ", "화이팅");
has("ㅅㄹㅎ", "사랑해");
has("ㅈㅈ", "잘자"); has("ㅈㅈ", "취침");
first("ㅇㅋ", "OK");
for (const n of ["안녕", "안녕히가세요", "꾸벅"]) has("ㅇㄴ", n);
first("ㅈㅅ", "미안해");
has("ㅊㅎ", "축하해");
has("ㅁㅈ", "맛점");

// 끝말·붙여 쓰기·쓰는 중
first("감사해요", "감사합니다"); first("감사합니당", "감사합니다"); has("너무감사", "감사합니다");
has("고마워요", "감사합니다"); has("땡큐", "감사합니다");
has("주문할게요", "주문"); has("담았어요", "주문"); has("장바구니", "주문");
has("사랑", "사랑해요"); has("사랑", "사랑해"); has("사랑해용", "사랑해");
has("화이팅", "화이팅"); has("파이팅!!", "화이팅"); has("힘내세요", "화이팅");
has("잘자요~", "잘자"); has("굿밤", "잘자");
has("안녕하세요", "꾸벅"); has("안녕하세요", "안녕");
has("잘가요", "안녕히가세요");
has("최고", "최고야"); has("짱", "최고야"); has("대박", "최고야");
has("축하해요", "축하해"); has("생일", "축하해");
has("배고파", "냠냠"); has("배고파", "맛점");
has("뭐야", "뭐지"); has("??", "뭐지"); has("?", "뭐지");
has("ok", "OK"); has("OK", "OK"); has("오키", "OK"); has("넵", "OK"); has("네", "OK");
has("❤", "하트"); has("❤️", "하트"); has("하트하트", "하트");
has("짜증나", "화남"); has("흥", "삐짐"); has("제발", "기도");
has("글쎄요", "글쎄"); has("음...", "글쎄");
has("떨려요", "덜덜"); has("추워", "덜덜");
has("굿모닝", "좋은아침"); has("실장님", "동실장");

// 같은 자음 반복은 초성으로 안 봄
assert.ok(!top("ㅎㅎ").includes("속상해"), "ㅎㅎ 에 슬픈 이모티콘 안 뜸");
first("ㅇㅇ", "OK"); has("ㅂㅂ", "안녕히가세요"); has("와", "신나"); has("살래요", "주문");

// 안 나와야 하는 것
none(""); none("5"); none("509"); none("010-1234"); none("사"); none("ㄱ"); none("블랙");
none("이거얼마?"); // 물음표가 섞인 질문엔 뭐지 안 띄움
none("M");

// 꺼진 이모티콘·개수 제한·순서
const off = items.map((e) => (e.name === "감사합니다" ? { ...e, on: false } : e));
assert.ok(!S.suggestEmojis("감사", off).some((e) => e.name === "감사합니다"));
assert.ok(S.suggestEmojis("ㅇㄴ", items, 2).length <= 2);

// 관리 창에서 저장한 단어가 기본표보다 우선 · 빈 목록 = 추천 안 함(이름은 그대로)
const custom = items.map((e) => (e.name === "OK" ? { ...e, keywords: ["콜콜"] } : e.name === "하트" ? { ...e, keywords: [] } : e));
assert.ok(S.suggestEmojis("콜콜", custom).some((e) => e.name === "OK"));
assert.ok(!S.suggestEmojis("오키", custom).some((e) => e.name === "OK"));
assert.ok(!S.suggestEmojis("예뻐", custom).some((e) => e.name === "하트"));
assert.equal(S.suggestEmojis("하트", custom)[0].name, "하트");

// 마지막 낱말
assert.equal(S.lastTypedWord("언니 감사"), "감사");
assert.equal(S.lastTypedWord("언니 감사 "), "");
assert.equal(S.lastTypedWord("ㅋㅋㅋ:ㅋㅋㅋ:"), "");
assert.equal(S.lastTypedWord(":하트:좋아"), "좋아");
assert.equal(S.lastTypedWord(""), "");

// 관리 창 입력 정리
assert.deepEqual(S.parseEmojiKeywords("감사, 고마워 ,, ㄱㅅ, 감사"), ["감사", "고마워", "ㄱㅅ"]);
assert.deepEqual(S.parseEmojiKeywords(["a".repeat(20)]), ["a".repeat(12)]);
assert.equal(S.parseEmojiKeywords(Array.from({ length: 50 }, (_, i) => `말${i}`)).length, 30);
assert.equal(S.choseongOf("감사합니다"), "ㄱㅅㅎㄴㄷ");
assert.equal(S.normalizeEmojiWord("ㅋㅋㅋㅋㅋ"), "ㅋㅋ");
assert.equal(S.normalizeEmojiWord("ㅜㅜ"), "ㅠㅠ");

// 설정 저장값 — keywords 는 그대로 살고, 없는 건 없는 채로(기본표)
const st = E.parseChatEmojiSetting({ items: [{ id: "aaaa1111", name: "하트", url: "https://x/a", on: true, keywords: ["예뻐", " 예뻐 ", "", "이뻐"] }, { id: "bbbb2222", name: "OK", url: "https://x/b", on: true }] });
assert.deepEqual(st.items[0].keywords, ["예뻐", "이뻐"]);
assert.equal(st.items[1].keywords, undefined);
assert.deepEqual(S.emojiKeywordsOf(st.items[1]), S.DEFAULT_EMOJI_KEYWORDS.OK);

// [2026-11-10 22:27] 실제 채팅 말투·별명도 그림의 뜻에 맞게 연결한다.
for (const w of ["스트레스", "스트레쓰", "서터레쓰", "서터레스", "스뚜레스", "스뚜레쓰", "스트뤠스", "스트뤠쓰", "아진짜스트레스", "서터레쓰!!!", "ㅅㅌㄹㅅ", "킹받네", "짜증나요", "열받았어"]) {
  has(w, "화남"); has(w, "삐짐");
  assert.ok(!top(w).includes("으흐흐"), `「${w}」에 웃는 그림은 추천하지 않음`);
}
for (const w of ["ㅋㅋ", "ㅋㅋㅋㅋㅋㅋ", "ㅎㅎ", "ㅎㅎㅎㅎ", "낄낄", "깔깔깔", "푸하하하", "웃겨죽겠어", "아웃겨ㅋㅋ", "ㅋㅎㅋㅎ"]) {
  has(w, "ㅋㅋㅋ"); has(w, "으흐흐");
  assert.ok(!top(w).includes("화남"), `「${w}」에 화난 그림은 추천하지 않음`);
}
const everyday = [
  ["질렀어요", "주문"], ["지름신왔어", "주문"], ["내꺼다", "주문"],
  ["등빨대박", "등근육"], ["피지컬좋네", "등근육"], ["루루언니", "루루업"], ["동실짱", "동실장"],
  ["좋은하루되세요", "좋은아침"], ["눈떴어요", "좋은아침"],
  ["하뚜하뚜", "하트"], ["귀욥다", "하트"], ["취향저격", "하트"],
  ["알라뷰", "사랑해요"], ["알라뷰", "사랑해"], ["러뷰", "사랑해"],
  ["맛있게드세요", "맛점"], ["식사하셨어요", "맛점"], ["츄릅", "냠냠"], ["야식먹자", "냠냠"],
  ["감동이에요", "꾸벅"], ["감동이에요", "감사합니다"], ["감샤해요", "감사합니다"], ["덕분이에요", "감사합니다"],
  ["잘되길", "기도"], ["대박나세요", "기도"], ["소원빌어", "기도"],
  ["무셔워", "덜덜"], ["쫄았어", "덜덜"], ["소름돋아", "덜덜"],
  ["잠이와요", "취침"], ["잠이와요", "잘자"], ["코코낸내", "취침"], ["코코낸내", "잘자"], ["잘쟈요", "잘자"],
  ["오켕", "OK"], ["접수완료", "OK"], ["안뇽하세용", "안녕"], ["출첵합니다", "안녕"], ["하이루", "안녕"],
  ["쵝오", "최고야"], ["엄지척", "최고야"], ["레전드", "최고야"], ["앗싸", "신나"], ["씐난다", "신나"], ["기분좋아", "신나"],
  ["엉엉엉", "속상해"], ["외롭다", "속상해"], ["울고싶어", "속상해"],
  ["미아내", "미안해"], ["쏘뤼", "미안해"], ["잘못했어요", "미안해"],
  ["으쌰으쌰", "화이팅"], ["할수있다", "화이팅"], ["팟팅", "화이팅"],
  ["야근중", "열심히하는중"], ["열공중", "열심히하는중"], ["근무해요", "열심히하는중"],
  ["눈팅중이에요", "빼꼼"], ["구경왔어요", "빼꼼"], ["부끄러워", "빼꼼"],
  ["뭥미", "뭐지"], ["뭐징", "뭐지"], ["어리둥절", "뭐지"],
  ["추카추카", "축하해"], ["합격했어요", "축하해"], ["생신축하", "축하해"],
  ["몰겠어요", "글쎄"], ["글쌔요", "글쎄"], ["아리송", "글쎄"],
  ["빠빠이", "안녕히가세요"], ["또뵈어요", "안녕히가세요"], ["담에봐요", "안녕히가세요"],
];
for (const [word, name] of everyday) has(word, name);
// 일반 상품 정보·단자음은 연관어를 늘려도 추천하지 않는다.
for (const word of ["블랙", "베이지", "네이비", "XL", "95", "450000", "배송조회", "가슴둘레", "총장", "어깨단면", "등판사진", "탄탄한원단", "스트레이트핏", "지름30cm", "지름은", "나머지는", "나머지도", "ㄱ", "ㅋ", "ㅎ"]) {
  none(word);
}
for (const name of NAMES) {
  const terms = S.DEFAULT_EMOJI_KEYWORDS[name];
  assert.deepEqual(S.parseEmojiKeywords(terms), terms, `${name}: 관리창 저장 상한/중복 정리에 잘리지 않아야 함`);
}
// 보강된 기본표도 관리자의 명시적 설정/추천 끄기를 덮어쓰지 않는다.
const customStress = items.map(e => ["화남", "삐짐"].includes(e.name) ? { ...e, keywords: [] } : e);
assert.deepEqual(S.suggestEmojis("서터레쓰", customStress), []);
console.log(`test-live-chat-emoji-suggest ok (일상 표현 ${everyday.length}개 + 스트레스/웃음/제외/설정 회귀)`);
