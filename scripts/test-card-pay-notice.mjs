import assert from "node:assert/strict";
import { buildCardPayNoticeText } from "../lib/cardPayNoticeText.ts";
import { feedPinFitsOneLine, feedPinFontSize, feedPinLayout, estimateTextWidth, FEED_PIN_SIZE } from "../lib/feedText.ts";

// 흔한 닉네임(9자 이하)은 «한 줄» + 글자도 방송에서 읽힐 만큼 남아야 한다
for (const nick of ["이찌", "임언냐", "봄여름1234", "코코노랑-0413"]) {
  const t = buildCardPayNoticeText(nick);
  assert.ok(feedPinFitsOneLine(t), `한 줄에 안 들어감: ${t}`);
  // 26px = 더 못 줄이고 2줄로 떨어지는 바닥값(FEED_PIN_MIN_SIZE). 그보다 여유가 있어야 한다.
  assert.ok(feedPinFontSize(t) >= 29, `글자가 너무 작아짐(${feedPinFontSize(t)}px): ${t}`);
}

// [2026-09-20 2차] 10자 닉네임은 «2줄»이 된다 — 이게 더 낫다.
//   예전엔 26px 까지 줄여 한 줄을 지켰는데, 사장님 「좌우 여백 살려서 폰트도 키우라」 지침 이후
//   그렇게까지 작아질 바엔 원래 크기(34px)로 2줄을 쓴다(lib/feedText.ts feedPinLayout).
//   중요한 건 «잘리지 않고 글자가 크다»는 것이다.
{
  const t = buildCardPayNoticeText("열자짜리닉네임이야");
  const L = feedPinLayout(t);
  assert.equal(L.lines, 2, `10자 닉네임은 2줄로 그린다: ${t}`);
  assert.equal(L.fontSize, FEED_PIN_SIZE, "2줄로 가는 대신 글자는 제일 큰 크기");
  assert.ok(
    Math.ceil(estimateTextWidth(t, L.fontSize) / L.maxWidth) <= 2,
    `2줄을 넘어 잘린다: ${t}`,
  );
}

// 뜻이 두 토막 다 들어 있어야 한다 — «카톡에 카드결제 링크가 있다» + «확인해달라»
{
  const t = buildCardPayNoticeText("봄여름1234");
  for (const must of ["카톡", "카드결제", "확인"]) {
    assert.ok(t.includes(must), `문구에서 「${must}」가 빠졌다: ${t}`);
  }
}

// 예전 문구는 «짧은 닉네임에도» 2줄이었다 — 되돌아가지 않게 못 박아 둔다
{
  const old = "💳 임언냐님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인 부탁드려요 🙏";
  assert.equal(feedPinFitsOneLine(old), false, "예전 문구가 한 줄이면 이 테스트의 전제가 틀린 것");
}

// 공개 채팅에 뜨는 글 — 금액·전화번호가 섞이면 안 된다
{
  const t = buildCardPayNoticeText("봄여름1234");
  assert.equal(/원|[0-9]{3}-[0-9]{3,4}-[0-9]{4}|01[0-9]{8,9}/.test(t), false, `금액·전화번호가 들어감: ${t}`);
  assert.ok(t.includes("봄여름1234님"), "닉네임은 그대로 들어가야 한다");
  assert.equal(FEED_PIN_SIZE, 34, "기준 글자크기가 바뀌면 위 실측값도 다시 봐야 한다");
}

console.log("✅ card-pay-notice 문구 — 한 줄 유지 · 금액/번호 없음");
