// [2026-09-26] 고객이슈 필터 칩 4개(전체·교환·반품·환불·기타) 버킷 규칙 — 순수 로직(표시/필터 전용).
//   ⚠️ 저장값을 바꾸지 않는다. 진상·구매·기타·칩없음은 전부 「기타」 버킷으로 «보이기»만 한다.

/** 이슈의 원본 유형들(taskTypes 배열 우선, 없으면 task_type). 소문자. 비면 general. */
export function issueRawTypes(task: { task_type?: unknown; taskTypes?: unknown }): string[] {
  const arr = Array.isArray(task?.taskTypes) ? (task.taskTypes as unknown[]) : [];
  const all = [...arr, (task as { task_type?: unknown })?.task_type]
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);
  return all.length > 0 ? all : ["general"];
}

export type IssueFilterBucket = "exchange" | "return_refund" | "etc";

/** 이슈 → 필터 버킷. 교환 > 반품·환불 > 기타 순으로 판정(둘 다면 교환). */
export function issueFilterBucket(task: { task_type?: unknown; taskTypes?: unknown }): IssueFilterBucket {
  const t = issueRawTypes(task);
  if (t.includes("exchange")) return "exchange";
  if (t.some((x) => x === "return" || x === "refund")) return "return_refund";
  return "etc"; // 진상(bad_customer)·구매(purchase)·기타(general)·그 외 전부
}

/** 선택 칩과 매칭. chip 이 "" 면 전체. */
export function matchesIssueFilterChip(task: { task_type?: unknown; taskTypes?: unknown }, chip: string): boolean {
  if (!chip) return true;
  return issueFilterBucket(task) === chip;
}

/** 필터 칩 정의 — 화면·테스트 공용 */
export const ISSUE_FILTER_CHIPS: Array<[string, string]> = [
  ["", "전체"],
  ["exchange", "교환"],
  ["return_refund", "반품·환불"],
  ["etc", "기타"],
];
