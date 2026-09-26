// [2026-09-26] 고객이슈 필터 칩 4개 버킷 — 진상·구매·기타·칩없음이 「기타」로 모이는지
import { issueFilterBucket, matchesIssueFilterChip } from "../lib/issueFilter.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${e} actual=${a}`); pass++; }
function ok(c, m) { if (!c) throw new Error(m); pass++; }

// task_type 단일
eq(issueFilterBucket({ task_type: "exchange" }), "exchange", "교환");
eq(issueFilterBucket({ task_type: "return" }), "return_refund", "반품");
eq(issueFilterBucket({ task_type: "refund" }), "return_refund", "환불");
eq(issueFilterBucket({ task_type: "bad_customer" }), "etc", "진상→기타");
eq(issueFilterBucket({ task_type: "purchase" }), "etc", "구매→기타");
eq(issueFilterBucket({ task_type: "general" }), "etc", "기타→기타");
eq(issueFilterBucket({ task_type: "" }), "etc", "칩없음→기타");
eq(issueFilterBucket({}), "etc", "필드없음→기타");

// taskTypes 배열
eq(issueFilterBucket({ taskTypes: ["exchange"] }), "exchange", "배열 교환");
eq(issueFilterBucket({ taskTypes: ["return"] }), "return_refund", "배열 반품");
eq(issueFilterBucket({ taskTypes: ["exchange", "return"] }), "exchange", "둘 다면 교환 우선");
eq(issueFilterBucket({ taskTypes: ["bad_customer"] }), "etc", "배열 진상→기타");

// 각 건이 정확히 한 버킷(+전체)에만
const cases = [
  { task_type: "exchange" }, { task_type: "return" }, { task_type: "refund" },
  { task_type: "bad_customer" }, { task_type: "purchase" }, { task_type: "general" }, {},
];
for (const t of cases) {
  const buckets = ["exchange", "return_refund", "etc"].filter((c) => matchesIssueFilterChip(t, c));
  eq(buckets.length, 1, `한 버킷에만: ${JSON.stringify(t)}`);
  ok(matchesIssueFilterChip(t, ""), "전체에는 항상 잡힘");
}

// 진상·구매가 「기타」에 확실히 나온다
ok(matchesIssueFilterChip({ task_type: "bad_customer" }, "etc"), "진상은 기타 필터에");
ok(matchesIssueFilterChip({ task_type: "purchase" }, "etc"), "구매는 기타 필터에");
ok(!matchesIssueFilterChip({ task_type: "bad_customer" }, "return_refund"), "진상은 반품·환불에 안 잡힘");

console.log(`✅ issue-filter-chips ${pass}건 통과`);
