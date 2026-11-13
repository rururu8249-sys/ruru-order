import {lastTypedWord, emojiKeywordsOf} from './liveChatEmojiSuggest';
import type {ChatEmoji} from './liveChatEmoji';


/** [2026-11-13 사장님] 추천 이모티콘을 고르면 커서 앞 낱말 끝의 «부르는 말»만 그림으로 바꿈.
 *  «ㅋㅋㅋ» + 부르는 말 «ㅋㅋ» → 끝 «ㅋㅋ» 2글자만 지우고 «ㅋ» 는 남김. 끝이 안 맞으면 0(글은 그대로 두고 뒤에 그림). */
export function emojiTriggerLength(textBeforeCaret: string, emoji: ChatEmoji): number {
  const word = lastTypedWord(textBeforeCaret);
  if (!word || !textBeforeCaret.endsWith(word)) return 0;
  const norm = (v: string) => v.trim().normalize('NFC').toLowerCase();
  const w = norm(word);
  let best = 0;
  for (const k of [emoji.name, ...emojiKeywordsOf(emoji)]) {
    const kk = norm(k);
    if (kk && w.endsWith(kk) && kk.length > best) best = kk.length;
  }
  return best;
}
