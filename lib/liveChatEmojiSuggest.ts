// [2026-11-10 15:41 사장님 「카톡처럼 단어 쓰면 이모티콘 뜨게 · 초성도 · 경우의 수 잘 판단해서」]
//   채팅 입력칸에 손님이 «지금 쓰고 있는 마지막 낱말»을 보고 어울리는 이모티콘을 고른다. 순수 계산만(화면·관리 창·테스트 공용).
//   이모티콘마다 «부르는 말»(keywords) — 관리 창에서 고친 값이 있으면 그것, 없으면 아래 기본 단어표(이름으로 찾음).
//   맞추는 규칙(점수 높은 순):
//     ① 낱말 = 부르는 말/이름(같음)                       「감사」 → 감사합니다
//     ② 낱말이 부르는 말로 시작                            「감사해요」「주문할게요」
//     ③ 쓰는 중 — 부르는 말이 낱말로 시작(2글자 이상)       「사랑」 → 사랑해요
//     ④ 낱말 안에 부르는 말(2글자 이상, 붙여 쓴 말)          「너무감사」
//     ⑤ 초성 — 낱말이 자음만 2개 이상이고 부르는 말의 초성이 그걸로 시작   「ㄱㅅ」 → 감사합니다
//   같은 글자 반복은 두 개로 줄여 비교(ㅋㅋㅋㅋ=ㅋㅋ, 하하하=하하), ㅜ는 ㅠ 와 같게.
//   돈·주문 무관.

import type { ChatEmoji } from "@/lib/liveChatEmoji";

/** 부르는 말 한 칸 최대 글자 수 · 이모티콘 하나에 최대 개수 */
export const EMOJI_KEYWORD_MAX_LEN = 12;
export const EMOJI_KEYWORD_MAX = 30;
/** 추천 줄에 보여 줄 최대 개수 */
export const EMOJI_SUGGEST_LIMIT = 8;

/**
 * 기본 단어표 — 이모티콘 «이름» → 부르는 말.
 * 이름은 자동으로 같이 비교하니 여기 다시 안 적어도 됨. 한 글자 말은 낱말 전체가 같을 때만 맞음(「네」「와」).
 * 관리 창에서 이모티콘마다 고쳐 저장하면 그 값이 이 표보다 우선.
 */
export const DEFAULT_EMOJI_KEYWORDS: Record<string, string[]> = {
  "ㅋㅋㅋ": ["ㅋㅋ", "크크", "킥킥", "킼", "웃겨", "웃기", "웃김", "빵터", "개웃", "lol", "😂", "🤣"],
  "동실장": ["실장", "실장님", "동실", "동실이"],
  "루루업": ["루루", "업업", "올려", "올려주", "올라가", "up", "가즈아", "가자"],
  "주문": ["주문", "담았", "담아", "담기", "장바구니", "찜", "구매", "살게", "살께", "사요", "샀어", "샀다", "줍줍", "결제", "입금", "득템", "겟", "get", "살래", "갖고싶", "탐나"],
  "등근육": ["근육", "운동", "헬스", "몸짱", "멋져", "멋있", "섹시", "💪"],
  "좋은아침": ["좋은아침", "굿모닝", "아침", "모닝", "기상", "일어났", "출근", "goodmorning"],
  "사랑해요": ["사랑", "러브", "알러뷰", "사랑스러", "좋아해", "love", "❤", "♥", "💕", "😍"],
  "맛점": ["맛점", "점심", "맛저", "저녁", "식사", "밥먹", "밥", "맛있", "맛나", "배고파"],
  "꾸벅": ["꾸벅", "인사", "안녕하세요", "반가", "감사", "고마", "잘부탁"],
  "하트": ["하트", "사랑", "좋아", "예뻐", "이뻐", "예쁘", "이쁘", "예쁜", "이쁜", "❤", "♥", "💗", "💖"],
  "기도": ["기도", "제발", "부탁", "간절", "플리즈", "please", "빌어", "🙏"],
  "화남": ["화나", "화남", "화가", "화났", "짜증", "열받", "빡쳐", "빡침", "싫어", "😡", "😠"],
  "덜덜": ["덜덜", "ㄷㄷ", "떨려", "떨린", "무서", "추워", "춥다", "긴장", "후덜"],
  "취침": ["취침", "잘자", "ㅈㅈ", "굿밤", "졸려", "졸린", "피곤", "자러", "꿀잠", "주무", "zz", "💤"],
  "으흐흐": ["ㅎㅎ", "히히", "헤헤", "흐흐", "으흐", "하하", "호호", "키키", "웃음", "😁", "😆"],
  "삐짐": ["삐짐", "삐졌", "삐침", "흥", "칫", "치", "서운", "섭섭", "미워", "😤"],
  "OK": ["ㅇㅋ", "ㅇㅇ", "오케이", "오키", "오키도키", "알겠", "알았", "넵", "넹", "네", "네네", "콜", "좋아요", "좋아", "굿", "good", "ok", "👌"],
  "안녕": ["안녕", "ㅎㅇ", "하이", "반가", "방가", "왔어", "왔어요", "왔습", "출석", "인사", "hi", "hello", "👋"],
  "감사합니다": ["감사", "고마", "고맙", "땡큐", "땡스", "감솨", "쌩유", "thx", "thank", "🙇"],
  "최고야": ["최고", "짱", "대박", "굿", "멋져", "멋있", "훌륭", "킹", "인정", "👍", "best"],
  "신나": ["신나", "와", "신난", "신남", "야호", "우와", "와우", "설레", "행복", "기뻐", "좋다", "😆"],
  "사랑해": ["사랑", "러브", "알러뷰", "좋아해", "love", "❤", "♥", "💕", "😍"],
  "속상해": ["속상", "슬퍼", "슬프", "슬픔", "우울", "ㅠㅠ", "힝", "흑흑", "품절", "놓쳤", "아깝", "아쉬", "😢", "😭"],
  "미안해": ["미안", "죄송", "쏘리", "sorry", "ㅈㅅ", "ㅠㅠ"],
  "화이팅": ["화이팅", "파이팅", "홧팅", "힘내", "응원", "아자", "fighting"],
  "열심히하는중": ["열심히", "일하", "일중", "작업", "바빠", "바쁘", "고생", "수고", "열일"],
  "잘자": ["잘자", "ㅈㅈ", "굿밤", "굿나잇", "졸려", "졸린", "자요", "꿀잠", "주무", "내일봐", "zz"],
  "빼꼼": ["빼꼼", "구경", "눈팅", "몰래", "숨어", "들렀", "왔어", "어디"],
  "냠냠": ["냠냠", "먹었", "먹어", "먹고", "먹자", "맛있", "꿀맛", "배고파", "간식", "밥", "배불러", "배부르", "😋"],
  "뭐지": ["뭐지", "뭐야", "뭐예", "뭐에", "뭔가", "응?", "궁금", "왜", "어떻게", "헐", "?", "🤔"],
  "축하해": ["축하", "생일", "생축", "경축", "득템", "당첨", "🎉", "🎂"],
  "글쎄": ["글쎄", "음", "흠", "고민", "모르", "애매", "모르겠"],
  "안녕히가세요": ["잘가", "안녕히", "바이", "빠이", "다음에", "또봐", "들어가", "수고하셨", "ㅂㅂ", "ㅂㅇ", "bye", "👋"],
};

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JAMO_CONSONANT_RE = /^[ㄱ-ㅎ]+$/;

/** 한글 낱말 → 초성(한글 아닌 글자는 그대로) — 「감사」 → 「ㄱㅅ」 */
export function choseongOf(text: string): string {
  let out = "";
  for (const ch of String(text || "")) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

/** 비교용으로 다듬기 — 소문자·띄어쓰기/문장부호 빼기·같은 글자 3번↑는 2번으로·ㅜ→ㅠ·이모지 변형 글자 빼기 */
export function normalizeEmojiWord(raw: string): string {
  let s = String(raw || "").toLowerCase().replace(/[︎️‍]/g, "").replace(/ㅜ/g, "ㅠ");
  const onlyQ = /^[?？]+$/.test(s.trim());
  s = s.replace(/[\s~!.,…·^*"'`()[\]{}<>:;\-_=+/\\|@#$%&，。！？?]+/g, "");
  if (!s && onlyQ) s = "?";
  // 같은 글자(또는 이모지) 3번 이상 → 2번
  const chars = Array.from(s);
  const out: string[] = [];
  for (const ch of chars) {
    const n = out.length;
    if (n >= 2 && out[n - 1] === ch && out[n - 2] === ch) continue;
    out.push(ch);
  }
  // 「응?」 「?」 같은 물음표 낱말은 위에서 지워지니 원래 낱말이 물음표로 끝나면 하나 붙여 둠
  const joined = out.join("");
  if (joined && /[?？]\s*$/.test(String(raw || "")) && !joined.endsWith("?")) return `${joined}?`;
  return joined;
}

/** 손님이 «지금 쓰고 있는» 마지막 낱말 — 커서 앞 글에서 이미 넣은 «:이름:» 은 빼고, 마지막 띄어쓰기 뒤 */
export function lastTypedWord(textBeforeCaret: string): string {
  const s = String(textBeforeCaret || "").replace(/:[0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]{1,10}:/g, " ");
  if (!s || /\s$/.test(s)) return "";
  const parts = s.split(/\s+/);
  return (parts[parts.length - 1] || "").slice(-20);
}

/** 관리 창 입력 «감사, 고마워, ㄱㅅ» → 정리된 목록(빈칸·겹침 빼고, 칸마다 12글자·최대 30개) */
export function parseEmojiKeywords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map((v) => String(v ?? "")) : String(raw ?? "").split(/[,，\n]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    const t = Array.from(v.trim()).slice(0, EMOJI_KEYWORD_MAX_LEN).join("");
    const key = normalizeEmojiWord(t);
    if (!t || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= EMOJI_KEYWORD_MAX) break;
  }
  return out;
}

/** 이 이모티콘의 부르는 말 — 관리 창에서 저장한 값(빈 목록도 «없음»으로 존중), 없으면 기본 단어표 */
export function emojiKeywordsOf(e: Pick<ChatEmoji, "name"> & { keywords?: string[] }): string[] {
  if (Array.isArray(e.keywords)) return e.keywords;
  return DEFAULT_EMOJI_KEYWORDS[e.name] ?? [];
}

type Scored = { emoji: ChatEmoji; score: number; index: number };

function scoreTerm(word: string, term: string, wordIsChoseong: boolean): number {
  if (!term) return 0;
  if (word === term) return 100;
  const len = Array.from(term).length;
  const wlen = Array.from(word).length;
  if (len >= 2 || /^[^\p{L}\p{N}]$/u.test(term)) {
    // 한 글자 말은 낱말이 같을 때만(위) — 단, 이모지 한 글자(❤)는 낱말에 들어 있으면 맞음
    if (len >= 2 && word.startsWith(term)) return 80 + Math.min(len, 10);
    if (wlen >= 2 && term.startsWith(word)) return 60 + Math.min(wlen, 10);
    if (len >= 2 && word.includes(term)) return 50 + Math.min(len, 10);
    if (len === 1 && term !== "?" && word.includes(term)) return 55;
  }
  if (wordIsChoseong && wlen >= 2) {
    const ch = choseongOf(term);
    if (ch !== term && ch === word) return 45; // 초성이 딱 맞음(ㄱㅅ = 감사)
    if (ch !== term && ch.startsWith(word)) return 40;
  }
  return 0;
}

/** 마지막 낱말에 어울리는 이모티콘(켜진 것만, 점수 높은 순 → 관리 창 순서) */
export function suggestEmojis(word: string, items: Array<ChatEmoji & { keywords?: string[] }>, limit = EMOJI_SUGGEST_LIMIT): ChatEmoji[] {
  const w = normalizeEmojiWord(word);
  if (!w) return [];
  // 숫자만(상품번호·금액) 은 추천 안 함
  if (/^[0-9]+$/.test(w)) return [];
  // 자음만 쓴 말은 초성으로도 맞춤 — 단 같은 자음 반복(ㅋㅋ·ㅎㅎ·ㅇㅇ·ㄴㄴ)은 그 자체가 뜻이라 초성으로 안 보고
  //   단어표에 적힌 것만 맞춤(ㅎㅎ 에 「흑흑」, ㅇㅇ 에 「우울」이 뜨지 않게 — ㄷㄷ·ㅈㅈ 는 단어표에 있음)
  const wordIsChoseong = JAMO_CONSONANT_RE.test(w) && new Set(Array.from(w)).size > 1;
  const scored: Scored[] = [];
  items.forEach((e, index) => {
    if (!e.on) return;
    let best = 0;
    // 이름이 똑같이 맞으면 다른 이모티콘의 «부르는 말»보다 앞(「잘자」 → 잘자 먼저, 취침 다음)
    const byName = scoreTerm(w, normalizeEmojiWord(e.name), wordIsChoseong);
    best = byName >= 100 ? 101 : byName;
    // 부르는 말은 앞에 적힌 것일수록 대표 말 — 점수가 같으면 그 말이 앞에 있는 이모티콘이 먼저
    emojiKeywordsOf(e).forEach((raw, pos) => {
      if (best >= 100) return;
      const s = scoreTerm(w, normalizeEmojiWord(raw), wordIsChoseong);
      if (s > 0 && s - pos * 0.01 > best) best = s - pos * 0.01;
    });
    if (best > 0) scored.push({ emoji: e, score: best, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.emoji);
}
