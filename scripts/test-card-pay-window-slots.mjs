import assert from "node:assert/strict";
import { cardPayWindowSlots, popupFeatures, CARD_PAY_PANE_W } from "../lib/cardPayWindowSlots.ts";

// 사장님 맥북(논리 해상도 2000 정도) — 두 창이 490씩, 가운데 정렬, 겹치지 않음
{
  const { copy, payster } = cardPayWindowSlots({ availWidth: 2000, availHeight: 1250, availLeft: 0, availTop: 25 });
  assert.equal(copy.width, CARD_PAY_PANE_W);
  assert.equal(payster.width, CARD_PAY_PANE_W);
  assert.equal(payster.left, copy.left + copy.width, "페이스터는 복사창 바로 오른쪽");
  assert.equal(copy.top, payster.top, "같은 높이");
  assert.equal(copy.height, payster.height);
  assert.equal(copy.left, Math.round((2000 - 980) / 2));
  assert.equal(copy.top, 25 + 20);
  assert.ok(copy.height <= 1250 - 110 && copy.height >= 400);
}
// 좁은 모니터(1280) — 절반씩 줄되 320 아래로는 안 감
{
  const { copy, payster } = cardPayWindowSlots({ availWidth: 1280, availHeight: 700 });
  assert.equal(copy.width, 490); // 1280/2 = 640 > 490 → 490 유지
  assert.equal(payster.left, copy.left + copy.width);
  const s = cardPayWindowSlots({ availWidth: 600, availHeight: 700 });
  assert.equal(s.copy.width, 320);
}
// 문자열은 popup=yes 로 시작(탭이 아니라 창)
{
  const f = popupFeatures({ left: 10, top: 20, width: 490, height: 900 });
  assert.equal(f, "popup=yes,left=10,top=20,width=490,height=900");
}
console.log("✅ card-pay window slots OK");
