// scripts/test-notice-bar.mjs
// 공지 띠 한 줄 뽑기 검증 — lib/noticeBar.ts 의 실제 함수를 불러서 확인한다.
//
// 막으려는 사고: 띠가 두 줄로 늘어나 상품을 가리는 것 / 📢 가 두 번 나오는 것 / 빈 띠가 뜨는 것
import { noticeBarLine, NOTICE_BAR_MAX } from "../lib/noticeBar.ts";

let fail = 0;
const eq = (g, w, l) => { if (g === w) console.log(`✅ ${l} → ${JSON.stringify(g)}`); else { console.log(`❌ ${l}\n   나온값: ${JSON.stringify(g)}\n   기대값: ${JSON.stringify(w)}`); fail = 1; } };
const ok = (c, l) => { if (c) console.log(`✅ ${l}`); else { console.log(`❌ ${l}`); fail = 1; } };

console.log("── 제목이 있을 때 ──");
eq(noticeBarLine("해외방송 배송 안내", "아무 본문"), "해외방송 배송 안내", "제목을 그대로 쓴다");
eq(noticeBarLine("📢 중요 공지", "본문"), "중요 공지", "앞머리 이모지 제거 (띠에 이미 📢 가 있다)");
eq(noticeBarLine("  ⚠️  마감 임박  ", "본문"), "마감 임박", "이모지+공백 정리");

console.log("\n── 제목이 없을 때 ──");
eq(noticeBarLine("", "해외배송은 9/2 이후 발송돼요\n두번째줄"), "해외배송은 9/2 이후 발송돼요", "본문 첫 줄을 쓴다");
eq(noticeBarLine("", "\n\n   \n실제 첫 줄"), "실제 첫 줄", "빈 줄은 건너뛴다");
eq(noticeBarLine("", "---\n구분선 다음 줄"), "구분선 다음 줄", "구분선(---)은 건너뛴다");
eq(noticeBarLine("", "───\n긴 구분선 다음"), "긴 구분선 다음", "다른 모양 구분선도 건너뛴다");
eq(noticeBarLine("", "✅ 해외방송 주문건은"), "해외방송 주문건은", "본문 앞 이모지도 제거");

console.log("\n── 빈 값 방어 ──");
eq(noticeBarLine("", ""), "새 공지가 있어요", "제목·본문 다 비면 기본 문구 (빈 띠 방지)");
eq(noticeBarLine(null, null), "새 공지가 있어요", "값이 없어도 안 깨진다");
eq(noticeBarLine("", "---\n---"), "새 공지가 있어요", "구분선만 있으면 기본 문구");
eq(noticeBarLine("", "   \n  "), "새 공지가 있어요", "공백만 있으면 기본 문구");

console.log("\n── 길이 제한 (띠가 두 줄 되면 안 됨) ──");
{
  const long = "가".repeat(60);
  const got = noticeBarLine(long, "");
  eq(got.length, NOTICE_BAR_MAX + 1, `${NOTICE_BAR_MAX}자로 자르고 「…」 을 붙인다`);
  ok(got.endsWith("…"), "잘린 표시가 붙는다");
}
{
  const exact = "가".repeat(NOTICE_BAR_MAX);
  eq(noticeBarLine(exact, ""), exact, "딱 맞으면 자르지 않는다");
}
{
  const over = "가".repeat(NOTICE_BAR_MAX + 1);
  ok(noticeBarLine(over, "").endsWith("…"), "한 글자만 넘어도 자른다");
}

console.log(fail ? "\n공지 띠 테스트 실패" : "\n공지 띠 테스트 통과");
process.exit(fail);
