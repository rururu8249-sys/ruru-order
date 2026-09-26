// [2026-09-26] 교환·환불 장부 1단계 순수 로직 테스트
import {
  computeAmountFinal,
  normalizeAdjustments,
  accountLast4,
  digitsOnly,
  shouldHideAccountNumber,
  stageFromIssueStatus,
  kindFromTaskType,
  productSnapshotFromItems,
  mapIssueToLedgerDraft,
  isValidStage,
  isValidKind,
  isValidMethod,
} from "../lib/refundLedger.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`); pass++; }
function ok(c, m) { if (!c) throw new Error(m); pass++; }

// ── amount_final = base + 조정줄 합(차감 음수), 0 하한 ──
eq(computeAmountFinal(30000, []), 30000, "조정 없음");
eq(computeAmountFinal(30000, [{ label: "배송비 차감", amount: -3000 }]), 27000, "차감 1줄");
eq(computeAmountFinal(30000, [{ label: "추가", amount: 5000 }, { label: "차감", amount: -8000 }]), 27000, "추가+차감");
eq(computeAmountFinal(10000, [{ label: "큰 차감", amount: -50000 }]), 0, "음수는 0으로 막음");
eq(computeAmountFinal("33000", [{ label: "x", amount: "-3000" }]), 30000, "문자 숫자도 처리");
eq(computeAmountFinal(null, null), 0, "널 안전");
eq(computeAmountFinal(30000, [{ label: "무금액줄", amount: 0 }]), 30000, "0원 조정은 합에 영향 없음");

// ── 조정줄 정규화 ──
eq(normalizeAdjustments([{ label: "a", amount: -1000 }, { amount: 2000 }, "쓰레기", null]).length, 2, "깨진 항목 제거(label·amount 둘 다 없는 건 버림)");
eq(normalizeAdjustments("nope").length, 0, "배열 아니면 빈 배열");

// ── 계좌 뒷4자리 / 숫자만 ──
eq(accountLast4("110-234-567890"), "7890", "하이픈 계좌 뒷4");
eq(accountLast4("123"), "123", "4자리 미만은 그대로");
eq(digitsOnly("110-234 567890"), "110234567890", "숫자만");

// ── 계좌 만료 가림(done_at + 30일) ──
const now = new Date("2026-09-26T00:00:00").getTime();
ok(shouldHideAccountNumber("2026-08-01T00:00:00", now) === true, "56일 전 완료 → 가림");
ok(shouldHideAccountNumber("2026-09-20T00:00:00", now) === false, "6일 전 완료 → 아직 안 가림");
ok(shouldHideAccountNumber("", now) === false, "완료 안 됨(done_at 없음) → 안 가림");
ok(shouldHideAccountNumber("2026-08-27T00:00:00", now) === false, "정확히 30일 경계(30일)는 안 가림");
ok(shouldHideAccountNumber("2026-08-26T00:00:00", now) === true, "31일 → 가림");

// ── 이전 매핑: status → stage ──
eq(stageFromIssueStatus("open"), "접수", "open→접수");
eq(stageFromIssueStatus("done"), "완료", "done→완료");
eq(stageFromIssueStatus("deleted"), "거절·취소", "deleted→거절·취소");

// ── 이전 매핑: task_type → kind ──
eq(kindFromTaskType("exchange"), "교환", "exchange→교환");
eq(kindFromTaskType("refund"), "반품", "refund→반품");
eq(kindFromTaskType("return"), "반품", "return→반품");
eq(kindFromTaskType("general"), "반품", "기타→반품(기본)");

// ── product_snapshot ──
const snap = productSnapshotFromItems([{ productId: "p1", productName: "셔츠", color: "블랙", size: "M", qty: 2 }, { product_id: "p2", qty: 0 }]);
eq(snap.length, 2, "스냅샷 2건");
eq(snap[0].productName, "셔츠", "이름 매핑");
eq(snap[1].qty, 1, "qty 0 은 1로 보정");
eq(snap[1].productId, "p2", "snake_case product_id 도 인식");

// ── 재실행 안전: 같은 admin_task 는 항상 같은 admin_task_id(=UNIQUE 키) 로 매핑 ──
const task = { id: "task-123", task_type: "refund", status: "open", body: "환불 사유", raw_payload: { items: [{ productId: "p1", qty: 1 }] } };
const d1 = mapIssueToLedgerDraft(task, 33000);
const d2 = mapIssueToLedgerDraft(task, 33000);
eq(d1.admin_task_id, "task-123", "admin_task_id = task.id");
eq(d1.admin_task_id, d2.admin_task_id, "재실행해도 같은 키(중복 방지)");
eq(d1.kind, "반품", "draft kind");
eq(d1.stage, "접수", "draft stage");
eq(d1.amount_base, 33000, "draft amount_base = 주문금액 인자");

// ── enum 검증 ──
ok(isValidStage("완료") && !isValidStage("아무거나"), "stage 검증");
ok(isValidKind("교환") && !isValidKind("환불"), "kind 검증(환불은 kind 아님 — 반품/교환/재발송)");
ok(isValidMethod("계좌이체") && !isValidMethod("현금"), "method 검증");

console.log(`✅ refund-ledger 순수 로직 ${pass}건 통과`);
