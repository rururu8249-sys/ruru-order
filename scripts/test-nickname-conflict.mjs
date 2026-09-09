// scripts/test-nickname-conflict.mjs
// [2026-09-09] 닉네임 중복 판정 — 용서린 사고 재현 + 수정 확인
// 실행: node --experimental-strip-types --loader ./scripts/_ts-resolve.mjs scripts/test-nickname-conflict.mjs

import assert from "node:assert/strict";
import { isNicknameTakenByOthers } from "../lib/nicknameConflict.ts";

let n = 0;
const ok = (label, fn) => { fn(); n += 1; console.log("  ✓", label); };

console.log("[닉네임 중복 판정]");

// ── 실제 사고 재현: 용서린
const 용서린기존 = [{ customer_phone: "01071437473", kakao_id: null }];

ok("① 사고 재현 — 새 카톡 손님(번호 아직 모름)이 남의 닉네임을 가져가지 못한다", () => {
  assert.equal(
    isNicknameTakenByOthers({ rows: 용서린기존, myPhone: "", myKakaoId: "5079103151" }),
    true,
    "번호를 모를 때는 «남»으로 봐야 한다 (예전엔 false 라 그냥 통과했다)",
  );
});

ok("② 내 카톡이 이미 쓰던 이름이면 통과 (폰 바꿔 번호를 몰라도)", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [{ customer_phone: "01071437473", kakao_id: "5079103151" }],
      myPhone: "",
      myKakaoId: "5079103151",
    }),
    false,
  );
});

ok("③ 내 번호와 같은 줄이면 «내 줄» — 통과 (예전 규칙 유지)", () => {
  assert.equal(
    isNicknameTakenByOthers({ rows: 용서린기존, myPhone: "010-7143-7473", myKakaoId: "" }),
    false,
    "하이픈/숫자만 표기가 달라도 같은 번호로 봐야 한다",
  );
});

ok("④ 내 번호와 다른 줄이면 «남» — 막는다 (예전 규칙 유지)", () => {
  assert.equal(
    isNicknameTakenByOthers({ rows: 용서린기존, myPhone: "01086247473", myKakaoId: "" }),
    true,
  );
});

ok("⑤ 그 닉네임을 쓰는 사람이 아무도 없으면 통과", () => {
  assert.equal(isNicknameTakenByOthers({ rows: [], myPhone: "", myKakaoId: "abc" }), false);
});

ok("⑥ 번호가 비어 있는 옛 줄도 «남»으로 본다 (번호를 모를 때)", () => {
  assert.equal(
    isNicknameTakenByOthers({ rows: [{ customer_phone: "", kakao_id: "" }], myPhone: "", myKakaoId: "" }),
    true,
  );
});

ok("⑦ 번호가 비어 있는 옛 줄은 «내 번호를 알 때»는 막지 않는다 (가족 공유 닉네임 보호)", () => {
  assert.equal(
    isNicknameTakenByOthers({ rows: [{ customer_phone: "", kakao_id: "" }], myPhone: "01011112222", myKakaoId: "" }),
    false,
  );
});

ok("⑧ 여러 줄 중 하나라도 남이면 막는다", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01011112222", kakao_id: "me" },
        { customer_phone: "01099998888", kakao_id: "other" },
      ],
      myPhone: "01011112222",
      myKakaoId: "me",
    }),
    true,
  );
});

ok("⑨ 카톡ID가 같으면 번호가 달라도 내 줄 (번호 바꾼 손님)", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [{ customer_phone: "01099998888", kakao_id: "me" }],
      myPhone: "01011112222",
      myKakaoId: "me",
    }),
    false,
  );
});

console.log(`\n✅ 닉네임 중복 판정 ${n}개 통과`);
