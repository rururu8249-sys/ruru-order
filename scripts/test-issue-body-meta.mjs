import assert from "node:assert/strict";
import { splitIssueBody, mergeIssueBody, isIssueMetaLine, fieldFromIssueBody } from "../lib/issueBodyMeta.ts";

// [2026-09-21 데이터 손실 사고] 사장님: 「수정하면 전화번호가 삭제됨」
//   수정 저장이 메타줄을 되살리지 않으면 전화번호가 영구히 지워진다. 여기서 막는다.
const BODY = [
  "자동날짜: 2026. 09. 21. 월요일",
  "이슈유형: 반품(환불)",
  "닉네임: 빛나리",
  "이름: 홍미라",
  "전화번호: 01071609281",
  "주문번호: RURU-MU464IS3",
  "대상상품: 알로 뮬 2컬러(회베이지/240)×1",
  "",
  "반품(환불)",
].join("\n");

{
  const { metaLines, memo } = splitIssueBody(BODY);
  assert.ok(metaLines.some((l) => l.startsWith("전화번호:")), "전화번호가 메타줄에 있어야 한다");
  assert.equal(memo, "반품(환불)", "수정창에는 «사장님 메모»만 담겨야 한다");
  // 주문번호·대상상품도 «자동으로 적힌 사실»이라 메타로 본다(사장님이 지워도 보존)
  assert.ok(metaLines.some((l) => l.startsWith("주문번호:")));
  assert.ok(metaLines.some((l) => l.startsWith("대상상품:")));
}

// 핵심: 메모만 고쳐 저장해도 전화번호가 살아남아야 한다
{
  const { metaLines } = splitIssueBody(BODY);
  const next = mergeIssueBody(metaLines, "반품(환불) 고객 연락함");
  assert.equal(fieldFromIssueBody(next, "전화번호:"), "01071609281", "수정 후 전화번호가 사라졌다");
  assert.equal(fieldFromIssueBody(next, "닉네임:"), "빛나리");
  assert.equal(fieldFromIssueBody(next, "이름:"), "홍미라");
  assert.equal(fieldFromIssueBody(next, "주문번호:"), "RURU-MU464IS3");
  assert.equal(fieldFromIssueBody(next, "대상상품:"), "알로 뮬 2컬러(회베이지/240)×1");
  assert.ok(next.includes("반품(환불) 고객 연락함"), "새 메모가 들어가야 한다");
}

// 예전 버그 재현 — 메모만 저장하면 전화번호가 없어진다(이 전제가 깨지면 테스트가 무의미)
{
  const 예전방식 = "반품(환불) 고객 연락함";
  assert.equal(fieldFromIssueBody(예전방식, "전화번호:"), "", "예전 방식에서 번호가 남으면 전제가 틀린 것");
}

// 두 번 고쳐도 메타줄이 불어나지 않는다
{
  const { metaLines } = splitIssueBody(BODY);
  const once = mergeIssueBody(metaLines, "1차 수정");
  const twice = mergeIssueBody(splitIssueBody(once).metaLines, "2차 수정");
  assert.equal((twice.match(/전화번호:/g) || []).length, 1, "메타줄이 중복으로 쌓였다");
  assert.ok(twice.includes("2차 수정") && !twice.includes("1차 수정"), "메모는 새것으로 대체되어야 한다");
}

// 메타줄이 아예 없는 수동 메모는 그대로
{
  assert.equal(mergeIssueBody([], "손으로 적은 메모"), "손으로 적은 메모");
  assert.equal(isIssueMetaLine("그냥 메모"), false);
  assert.equal(isIssueMetaLine("전화번호: 010"), true);
}

console.log("✅ test-issue-body-meta — 수정해도 전화번호·닉네임·이름이 보존됨");
