// lib/noticeBar.ts
// [2026-08-30] 손님 화면 맨 위 「공지 띠」에 넣을 한 줄을 뽑는다.
//
// 왜 한 줄인가
//   띠는 상품을 가리지 않는 게 목적이다. 두 줄로 늘어나면 팝업과 다를 게 없어진다.
//   그래서 제목(또는 본문 첫 줄)만 뽑고, 길면 자른다. 전문은 「자세히」를 누르면 나온다.
//
// 규칙
//   · 제목이 있으면 제목. 없으면 본문에서 뜻이 있는 첫 줄.
//   · 구분선(---)·빈 줄은 건너뛴다.
//   · 앞머리 이모지는 띠에 이미 📢 가 있으므로 뺀다(📢📢 이 되는 걸 막는다).
//   · 34자를 넘으면 잘라서 「…」을 붙인다.

const LEAD_ICONS = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍\s·・-]+/u;
const DIVIDER = /^[-─—]{3,}$/;

export const NOTICE_BAR_MAX = 34;

export function noticeBarLine(title: unknown, text: unknown, max: number = NOTICE_BAR_MAX): string {
  const cut = (v: string) => (v.length > max ? v.slice(0, max) + "…" : v);

  const t = String(title ?? "").replace(LEAD_ICONS, "").trim();
  if (t) return cut(t);

  const first = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !DIVIDER.test(l));

  const line = String(first ?? "").replace(LEAD_ICONS, "").trim();
  return cut(line || "새 공지가 있어요");
}
