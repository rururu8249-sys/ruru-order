// lib/liveAutomationVoice.ts
// [2026-11-15 07:40 사장님] AI 손님 말투 다듬기 — 코드가 마지막에 손봄(Gemini 답 그대로 두지 않음).
//   ① 상품번호는 손님처럼 줄여 부름: PD-222 → 프222, BB-58 → 버58, MC-319 → 몽319 (가끔 프라222·버버58·몽클319)
//   ② ㅋㅋ·ㅎㅎ 끝맺음이 매번 같으면 바꿈: 개수 다르게(ㅋ·ㅋㅋㅋㅋ·ㅎ·ㅎㅎㅎ), 이모지, 아예 없음 — 최근 AI 글에 쓴 끝맺음은 안 씀
//   표시 글자만, 돈·주문 무접촉.

import {BRAND_SPEECH_ALIASES} from './liveAutomationSpeech';
const CODE_RE = /\b(MIU|MX|BB|MC|PD|CL|LOE|BC|CH|GC|DR)\s*-?\s*(\d{1,4})\b/gi;

// [2026-11-15 08:05 사장님] AI 손님이 «쓰는» 상품번호 이름 — 이 안에서만 랜덤(알아듣는 이름표 BRAND_SPEECH_ALIASES 와 따로)
export const SPOKEN_CODE_NAMES: Record<string, readonly string[]> = {
  PD: ['프라', '프라다', '푸라닭', '프', '프라땡', 'pd'],
  MX: ['막스', '막땡', '막지마라', 'mx'],
  MC: ['몽', '몽클', '몽ㅋ', 'mc'],
  BB: ['버', '버버', '버땡', 'bb'],
};
/** 상품번호를 손님이 부르는 말로 — 위 표 안에서 랜덤, 표에 없는 브랜드는 예전 별칭표의 한글 이름 */
export function shortProductCodes(text: string, seed = 0): string {
  let i = 0;
  return text.replace(CODE_RE, (whole, code: string, num: string) => {
    const k = Math.abs(Math.trunc(seed)) + 7 * i++;
    const C = code.toUpperCase();
    const list = SPOKEN_CODE_NAMES[C] || (BRAND_SPEECH_ALIASES[C] || []).filter((x) => /[가-힣]/.test(x));
    return list.length ? list[k % list.length] + num : whole;
  });
}

/** 상품 카드 이름을 Gemini 에게 보여 줄 때 «손님이 부르는 이름»도 같이 */
export function spokenCardName(name: string): string {
  const s = shortProductCodes(name, 0);
  return s === name ? name : `${name} (손님들은 «${s.split(' ')[0]}»처럼 줄여 부름)`;
}

const TAIL_RE = /(\s*)((?:[ㅋㅎㅠㅜ]{1,8}|[~!]{1,3}|\^\^|[\u{1F300}-\u{1FAFF}☀-➿]️?){1,3})\s*$/u;

/** 글 끝 웃음·이모지 꼬리 */
export function laughTail(text: string): string {
  const m = text.match(TAIL_RE);
  return m ? m[2] : '';
}
const kindOf = (tail: string) => (/ㅋ/.test(tail) ? 'k' : /ㅎ/.test(tail) ? 'h' : /[ㅠㅜ]/.test(tail) ? 'u' : tail ? 'e' : '');

const VARIANTS = ['', 'ㅋ', 'ㅋㅋㅋㅋ', 'ㅎ', 'ㅎㅎㅎ', '😊', '🥰', '~', '!!', 'ㅋㅋㅋㅋㅋ', '😆', '^^', ''];

/**
 * 최근 AI 글 끝맺음과 같으면(같은 웃음 같은 개수) 다른 꼬리로, 최근 4개 중 2개 이상 웃음이었으면 이번엔 웃음 빼기.
 * 슬픈·사과·질문 글엔 웃음 안 붙임.
 */
export function varyLaughTail(text: string, recentAi: string[], seed = 0): string {
  const tail = laughTail(text);
  if (!tail) return text;
  const body = text.slice(0, text.length - tail.length).replace(/\s+$/, '');
  if (!body) return text; // 「ㅋㅋㅋ」만 있는 글은 그대로
  const recentTails = recentAi.slice(0, 8).map(laughTail);
  const laughs = recentAi.slice(0, 4).map(laughTail).filter((t) => /[ㅋㅎ]/.test(t)).length;
  const serious = /죄송|미안|ㅠ|ㅜ|\?$|까요|나요|인가요|될까/.test(body);
  const sameRecent = recentTails.includes(tail) || (kindOf(tail) && recentTails.slice(0, 3).some((t) => kindOf(t) === kindOf(tail)));
  // [2026-11-15 08:28 사장님] Gemini 는 거의 늘 «ㅋㅋ/ㅎㅎ» 두 개로 끝냄 → 그 두 모양은 겹치지 않아도 늘 다른 꼬리로(웃음 빼기 포함)
  const stock = tail === 'ㅋㅋ' || tail === 'ㅎㅎ';
  if (!stock && !sameRecent && !(laughs >= 2 && /[ㅋㅎ]/.test(tail))) return text;
  const pool = VARIANTS.filter((v) => v !== tail && (!recentTails.includes(v) || v === '')).filter((v) => !(serious && /[ㅋㅎ😆🥰]/u.test(v)));
  const pick = laughs >= 2 ? '' : pool[Math.abs(Math.trunc(seed)) % pool.length] ?? '';
  if (!pick) return body;
  return /^[~!]/.test(pick) ? body + pick : body + ' ' + pick;
}

// [2026-11-15 08:18 사장님] 같은 말이라도 사람마다 미세하게 다르게 — 띄어쓰기 잘함/못함, 마침표, ^^, ~당·~여·~용 어미.
//   Gemini 글을 마지막에 «가끔»만 손봄(뜻·상품번호·숫자는 그대로).
const END_SWAP: [RegExp, string[]][] = [
  [/요$/, ['요', '여', '용', '욤']],
  [/다$/, ['다', '당']],
  [/네$/, ['네', '넹', '네용']],
  [/죠$/, ['죠', '쥬', '지요']],
];
export function varySurface(text: string, seed = 0): string {
  let s = text;
  let r = Math.abs(Math.trunc(seed)) || 1;
  const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
  // ① 띄어쓰기: 가끔 다 붙여 씀, 가끔 한 군데만 붙임(숫자·영어 사이는 안 건드림)
  const sp = rnd();
  if (sp < 0.18) s = s.replace(/([가-힣])\s+([가-힣])/g, '$1$2');
  else if (sp < 0.4) { let done = false; s = s.replace(/([가-힣])\s+([가-힣])/g, (m, a, b) => (done ? m : ((done = true), a + b))); }
  // ② 어미: 끝 글자만 가끔 바꿈(문장부호·이모지 앞)
  const m = s.match(/^(.*?)([.!?~^ㅋㅎㅠㅜ\s\u{1F300}-\u{1FAFF}☀-➿]*)$/u);
  if (m && rnd() < 0.35) {
    const [, body, tail] = m;
    for (const [re, opts] of END_SWAP) if (re.test(body)) { s = body.replace(re, opts[Math.floor(rnd() * opts.length)]) + tail; break; }
  }
  // ③ 끝 부호: 아무것도 없을 때만 가끔 . / .. / ^^ / ~ / !
  if (!/[.!?~^ㅋㅎㅠㅜ\u{1F300}-\u{1FAFF}☀-➿]$/u.test(s)) {
    const e = rnd();
    s += e < 0.12 ? '.' : e < 0.18 ? '..' : e < 0.28 ? '^^' : e < 0.38 ? '~' : e < 0.44 ? '!' : '';
  }
  return s;
}
