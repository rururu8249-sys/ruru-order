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

// [2026-09-11 정정] 이 시험은 원래 «하나라도 남이면 막는다»(true)로 적혀 있었다.
//   실기기에서 그게 틀렸다는 게 드러났다 — 사장님 카톡이 「루루동이」의 주인인데도 막혔다.
//   올바른 규칙: «이미 그 이름의 주인인 사람»은 계속 쓴다. 새로 가져가려는 사람만 막는다.
ok("⑧ 내 줄이 섞여 있으면 «내 이름» — 통과 (실기기에서 뒤집힌 규칙)", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01011112222", kakao_id: "me" },
        { customer_phone: "01099998888", kakao_id: "other" },
      ],
      myPhone: "01011112222",
      myKakaoId: "me",
    }),
    false,
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

// ── [2026-09-11 실기기 사고 재현] 「루루동이」 — 같은 이름 2줄, 그중 1줄이 내 카톡
//    사장님이 카톡 로그인했는데 «본인인데» 막혔다. 줄을 하나하나 따로 보다가
//    «내 줄»을 통과시켜 놓고 «다른 줄» 때문에 some() 이 true 가 됐다.
ok("⑩ 사고 재현 — 내 카톡 줄 + 남의 줄이 같이 있으면 «내 이름»으로 통과해야 한다", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01011112222", kakao_id: "" },      // 카톡 없는 옛 줄
        { customer_phone: "01033334444", kakao_id: "MYKAKAO" }, // 내 줄
      ],
      myPhone: "",            // 새 브라우저라 번호를 아직 모름
      myKakaoId: "MYKAKAO",
    }),
    false,
    "내 카톡 줄이 하나라도 있으면 그 이름은 내 것이다 (순서가 바뀌어도 같아야 한다)",
  );
});

ok("⑪ 줄 순서가 반대여도 같은 결과", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01033334444", kakao_id: "MYKAKAO" },
        { customer_phone: "01011112222", kakao_id: "" },
      ],
      myPhone: "",
      myKakaoId: "MYKAKAO",
    }),
    false,
  );
});

ok("⑫ 내 번호로 된 줄이 있으면, 남의 줄이 같이 있어도 통과", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01011112222", kakao_id: "OTHER" },
        { customer_phone: "01033334444", kakao_id: "" },
      ],
      myPhone: "01033334444",
      myKakaoId: "",
    }),
    false,
  );
});

ok("⑬ 내 줄이 하나도 없으면 예전처럼 막는다 (구멍이 다시 열리지 않게)", () => {
  assert.equal(
    isNicknameTakenByOthers({
      rows: [
        { customer_phone: "01011112222", kakao_id: "OTHER1" },
        { customer_phone: "01055556666", kakao_id: "OTHER2" },
      ],
      myPhone: "",
      myKakaoId: "MYKAKAO",
    }),
    true,
  );
});

console.log(`\n✅ 닉네임 중복 판정 ${n}개 통과`);
