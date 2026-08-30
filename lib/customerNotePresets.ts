// lib/customerNotePresets.ts
// [2026-08-30] 자주 쓰는 쪽지 문구. 고객 카드와 「공지·쪽지」 화면이 같은 목록을 쓴다.
//   한 곳에서 고치면 두 화면에 같이 반영된다(문구가 갈라지면 손님이 헷갈린다).

export type NotePreset = { label: string; text: string };

export const NOTE_PRESETS: NotePreset[] = [
  { label: "제출 요청", text: "담아두신 상품이 아직 주문서 제출 전이에요! 🛒\n시간이 지나면 자동으로 풀리니 지금 제출 부탁드려요 🙏" },
  { label: "입금 요청", text: "주문서 확인했습니다! 😊\n입금까지 완료해 주시면 바로 준비해 드릴게요 🙏" },
  { label: "연락 부탁", text: "확인이 필요한 내용이 있어요 📩\n카카오톡 채널로 연락 주시면 빠르게 도와드릴게요!" },
  { label: "품절 안내", text: "죄송합니다 🥲 담아두신 상품이 품절되었어요.\n다른 상품으로 도와드릴게요, 편하게 문의 주세요!" },
  { label: "마감 임박", text: "오늘 방송 마감이 얼마 안 남았어요! ⏰\n주문 예정이시면 서둘러 주세요 🙏" },
  { label: "배송 안내", text: "주문하신 상품 준비 중이에요 📦\n출고되면 다시 안내드릴게요, 조금만 기다려 주세요!" },
];

/**
 * 검색어를 PostgREST or() 에 넣어도 안전하게 다듬는다.
 * 쉼표·괄호·별표·퍼센트가 들어가면 조건식이 통째로 깨져서 엉뚱한 결과가 나온다.
 */
export function safeSearchTerm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/[,()*%\\"']/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 40)
    .trim();
}
