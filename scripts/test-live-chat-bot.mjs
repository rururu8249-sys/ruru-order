// [2026-11-10] 루루동이AI — 상품 안내 고르기·자주 묻는 말
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader({});
const B = load("lib/liveChatBot.ts");

const c = (productId, detailName, texts, sizes = []) => ({ productId, detailName, texts, line: `${texts[0]} / 100,000원`, soldOut: false, sizes });
const cands = [
  c("677", "PD-509 블랙 원피스", ["PD-509 블랙 원피스", "PD-509"], ["S", "M"]),
  c("677", "PD-202 니트", ["PD-202 니트", "PD-202"], ["S", "M"]),
  c("818", "MX-101 코트", ["MX-101 코트", "MX-101"], ["S"]),
  c("900", "", ["나이키 후드티 블랙"], ["M", "L"]),
  c("901", "", ["아디다스 운동화"], ["230", "240", "250"]),
  c("902", "", ["나이키 반팔 티셔츠"], ["M"]),
];
const pick = (s) => { const r = B.pickProductForChat(s, cands); return r ? r.cand.detailName || r.cand.texts[0] : null; };

// 상품번호 — 무조건
assert.equal(pick("509"), "PD-509 블랙 원피스");
assert.equal(pick("509 예뻐요"), "PD-509 블랙 원피스");
assert.equal(pick("pd509 주문이요"), "PD-509 블랙 원피스");
assert.equal(pick("프라다509"), "PD-509 블랙 원피스");
assert.equal(pick("막101 보여주세요"), "MX-101 코트");
// 숫자지만 상품번호 아님
assert.equal(pick("2개요"), null);
assert.equal(pick("509원이요?"), null);
assert.equal(pick("010 1234 5678"), null);
assert.equal(pick("240 있어요?"), null); // 사이즈
assert.equal(pick("38"), null);
assert.equal(pick("1509"), null); // 다른 번호 안 걸림
// 상품 이름 — 묻는 말 있을 때만, 두 낱말
assert.equal(pick("나이키 후드티 얼마예요"), "나이키 후드티 블랙");
assert.equal(pick("나이키 후드티 예쁘다"), null);
assert.equal(pick("나이키 얼마예요?"), null); // 한 낱말
// 여러 개 맞으면 안 올림
const two = [...cands, c("903", "", ["XX-509 가방", "XX-509"])];
assert.equal(B.pickProductForChat("509", two), null);

// 자주 묻는 말
const s = B.parseLiveChatBotSetting("");
assert.equal(s.enabled, true);
assert.ok(B.pickFaq("계좌 알려주세요", s.faqs).faq.answer.includes("주문서를 제출하면"));
assert.ok(B.pickFaq("언제 와요?", s.faqs).faq.answer.includes("출고"));
assert.equal(B.pickFaq("너무 예뻐요", s.faqs), null);
assert.ok(!s.faqs.some((f) => /입금\s*확인됐|확인 됐/.test(f.answer)), "입금 확인해 주는 말 없음");
// 설정 읽기·지우기
const s2 = B.parseLiveChatBotSetting(JSON.stringify({ enabled: false, faqs: [{ words: "합배송, 같이", answer: " 오늘은  합배송 안 돼요 " }, { words: "", answer: "x" }] }));
assert.equal(s2.enabled, false); assert.equal(s2.faqs.length, 1); assert.deepEqual(s2.faqs[0].words, ["합배송", "같이"]); assert.equal(s2.faqs[0].answer, "오늘은 합배송 안 돼요");
// 표시
assert.deepEqual(B.parseBotRef(B.botRefOfProduct({ productId: "677", detailName: "PD-509 블랙" })), { productId: "677", detailName: "PD-509 블랙" });
assert.equal(B.parseBotRef("f:계좌"), null);
console.log("test-live-chat-bot OK");
// 알림 글
const rows = [{ youtube_nickname: "불광동장원영", product_name: "PD-509 블랙 원피스", color: "블랙", size: "M", payment_method: "카드결제" }, { youtube_nickname: "불광동장원영", product_name: "니트", color: "없음", size: "" }];
assert.equal(B.orderThanksText(rows), "🛒 불광동장원영님 PD-509 블랙 원피스 블랙/M 외 1종 주문 감사합니다!");
assert.ok(!/원\b|[0-9],[0-9]{3}/.test(B.orderThanksText(rows)), "금액 없음");
assert.equal(B.isCardOrderRow(rows[0]), true); assert.equal(B.isCardOrderRow({ payment_method: "무통장입금" }), false);
assert.equal(B.becamePaid({ admin_order_status_v2: "자동입금확인" }, { admin_order_status_v2: "미설정" }), true);
assert.equal(B.becamePaid({ admin_order_status_v2: "자동입금확인" }, { admin_order_status_v2: "자동입금확인" }), false);
assert.equal(B.becamePaid({ admin_order_status_v2: "카드결제완료" }, { admin_order_status_v2: "주문확인전" }), true);
console.log("test-live-chat-bot events OK");
