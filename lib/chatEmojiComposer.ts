import {lastTypedWord, emojiKeywordsOf} from './liveChatEmojiSuggest';
import type {ChatEmoji} from './liveChatEmoji';

/** Remove only the recommendation trigger immediately before the caret, preserving other text. */
export function removeEmojiTrigger(draft: string, caretEnd: number, emoji: ChatEmoji) {
  const end = Math.max(0, Math.min(caretEnd, draft.length));
  const word = lastTypedWord(draft.slice(0, end));
  const exact = (value: string) => value.trim().normalize('NFC').toLowerCase();
  const matches = [emoji.name, ...emojiKeywordsOf(emoji)].some(value => exact(value) === exact(word));
  if (!word || !matches || (end < draft.length && !/\s/.test(draft[end])) || !draft.slice(0, end).endsWith(word)) return {text: draft, caret: end, word: ''};
  const start = end - word.length;
  return {text: draft.slice(0, start) + draft.slice(end), caret: start, word};
}
export function composeEmojiMessage(text: string, emojiName?: string) {
  const trimmed = text.trim();
  return emojiName ? `${trimmed ? `${trimmed} ` : ''}:${emojiName}:` : trimmed;
}
