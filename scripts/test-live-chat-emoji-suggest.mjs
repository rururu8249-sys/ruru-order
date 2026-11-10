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

console.log("test-live-chat-emoji-suggest ok");
