// lib/liveAutomationVoice.ts
// [2026-11-15 07:40 사장님] AI 손님 말투 다듬기 — 코드가 마지막에 손봄(Gemini 답 그대로 두지 않음).
//   ① 상품번호는 손님처럼 줄여 부름: PD-222 → 프222, BB-58 → 버58, MC-319 → 몽319 (가끔 프라222·버버58·몽클319)
//   ② ㅋㅋ·ㅎㅎ 끝맺음이 매번 같으면 바꿈: 개수 다르게(ㅋ·ㅋㅋㅋㅋ·ㅎ·ㅎㅎㅎ), 이모지, 아예 없음 — 최근 AI 글에 쓴 끝맺음은 안 씀
//   표시 글자만, 돈·주문 무접촉.

import {BRAND_SPEECH_ALIASES} from './liveAutomationSpeech';
const CODE_RE = /\b(MIU|MX|BB|MC|PD|CL|LOE|BC|CH|GC|DR)\s*-?\s*(\d{1,4})\b/gi;

/** 상품번호를 손님이 부르는 말로 — 사장님이 정한 별칭(BRAND_SPEECH_ALIASES) 전체를 돌려 쓰되 한글을 더 자주,
 *  가끔(약 6번에 1번)은 영어 코드 그대로(PD-222·pd222) — 영어로 쓰는 손님도 있음 */
export function shortProductCodes(text: string, seed = 0): string {
  let i = 0;
  return text.replace(CODE_RE, (whole, code: string, num: string) => {
    const k = Math.abs(Math.trunc(seed)) + 7 * i++;
    if (k % 6 === 5) return k % 12 === 5 ? whole : code.toLowerCase() + num;
    const aliases = BRAND_SPEECH_ALIASES[code.toUpperCase()] || [code];
    const korean = aliases.filter((x) => /[가-힣]/.test(x));
    const choices = korean.length ? korean : aliases;
    return choices[k % choices.length] + num;
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
  if (!sameRecent && !(laughs >= 2 && /[ㅋㅎ]/.test(tail))) return text;
  const pool = VARIANTS.filter((v) => !recentTails.includes(v) || v === '').filter((v) => !(serious && /[ㅋㅎ😆🥰]/u.test(v)));
  const pick = laughs >= 2 ? '' : pool[Math.abs(Math.trunc(seed)) % pool.length] ?? '';
  if (!pick) return body;
  return /^[~!]/.test(pick) ? body + pick : body + ' ' + pick;
}
