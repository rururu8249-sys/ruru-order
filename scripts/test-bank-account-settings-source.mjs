// 관리자 계좌 편집 상태 전이 회귀 테스트
// 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-bank-account-settings-source.mjs
import assert from "node:assert/strict";

const editor = await import("../lib/bankAccountEditor.ts").catch(() => ({}));
assert.equal(typeof editor.addSecondaryBankAccount, "function", "추가 계좌 생성 함수가 필요하다");
assert.equal(typeof editor.removeSecondaryBankAccount, "function", "추가 계좌 삭제 함수가 필요하다");
assert.equal(typeof editor.bankRoutingSummary, "function", "저장 확인 요약 함수가 필요하다");

const primary = {
  id: "primary",
  enabled: true,
  label: "기존 계좌",
  bankName: "국민은행",
  bankAccount: "111-222-333333",
  bankHolder: "홍길동",
};
const secondary = {
  id: "secondary",
  enabled: true,
  label: "추가 계좌",
  bankName: "신한은행",
  bankAccount: "444-555-666666",
  bankHolder: "김루루",
};
const split = {
  mode: "split",
  allAccountId: "primary",
  existingAccountId: "primary",
  firstOrderAccountId: "secondary",
  firstOrderWindow: { enabled: true, startDate: "2026-10-01", endDate: "2026-10-07" },
};

// 생산 코드에서 추가 버튼을 잘못 여러 번 눌러도 세 번째 계좌가 생기면 안 된다.
{
  const once = editor.addSecondaryBankAccount([primary]);
  assert.equal(once.length, 2);
  assert.equal(once[1].id, "secondary");
  const twice = editor.addSecondaryBankAccount(once);
  assert.equal(twice.length, 2, "추가 계좌는 한 개를 초과할 수 없다");
}

// secondary 삭제 뒤 라우팅이 사라진 ID를 계속 참조하면 저장/주문이 깨진다.
{
  const removed = editor.removeSecondaryBankAccount([primary, secondary], split);
  assert.deepEqual(removed.accounts, [primary]);
  assert.equal(removed.routing.firstOrderAccountId, "primary");
  assert.equal(removed.routing.existingAccountId, "primary");
  assert.equal(removed.routing.allAccountId, "primary");
  assert.equal(removed.routing.mode, "split", "같은 계좌를 고른 split 모드는 허용한다");
}

// 저장 확인창은 누구에게 어느 계좌가 보이는지와 Bankda 위험을 함께 알려야 한다.
{
  const lines = editor.bankRoutingSummary([primary, secondary], split);
  assert.equal(lines.includes("기존회원: 기존 계좌 — 국민은행 111-222-333333 (홍길동)"), true);
  assert.equal(lines.includes("첫 주문 신규회원: 추가 계좌 — 신한은행 444-555-666666 (김루루)"), true);
  assert.equal(lines.includes("2026-10-01 ~ 2026-10-07"), true, "신규회원 계좌 유지기간을 확인창에 보여준다");
  assert.equal(lines.includes("방송·쇼핑몰 공통"), true, "방송과 쇼핑몰이 같은 규칙임을 확인창에 보여준다");
  assert.equal(lines.includes("뱅크다"), true);
}

{
  const lines = editor.bankRoutingSummary([primary], {
    mode: "all",
    allAccountId: "primary",
    existingAccountId: "primary",
    firstOrderAccountId: "primary",
    firstOrderWindow: { enabled: false, startDate: "", endDate: "" },
  });
  assert.equal(lines.includes("전체 고객: 기존 계좌 — 국민은행 111-222-333333 (홍길동)"), true);
}

{
  const lines = editor.bankRoutingSummary([primary, secondary], {
    ...split,
    firstOrderWindow: { enabled: false, startDate: "", endDate: "" },
  });
  assert.equal(lines.includes("유지기간 미사용"), true);
  assert.equal(lines.includes("새 방송·방송 종료 후 쇼핑몰 주문"), true, "기간 미사용 재판정 규칙을 확인창에 보여준다");
}

console.log("bank account settings behavior tests passed");
