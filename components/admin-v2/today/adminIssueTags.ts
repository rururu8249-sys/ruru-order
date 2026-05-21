// components/admin-v2/today/adminIssueTags.ts
// 목적: 카톡/고객 응대 이슈 다중태그 표시용 유틸
// 주의: UI 표시/메모 저장 보조 전용. 주문/입금/배송/정산 로직 없음.

export const ADMIN_ISSUE_TAGS = [
  "반품",
  "교환",
  "환불/취소",
  "배송",
  "입금",
  "주소확인",
  "상품/추가구매",
  "불만/주의",
  "기타",
] as const;

export type AdminIssueTag = (typeof ADMIN_ISSUE_TAGS)[number];

export function extractIssueTagsFromTaskBody(body: string | null | undefined) {
  const text = String(body || "");
  const line = text
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith("선택태그:"));

  if (!line) return [];

  const raw = line.replace("선택태그:", "").trim();

  if (!raw || raw === "미선택" || raw === "-") return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getIssueTagClass(tag: string) {
  if (tag.includes("환불") || tag.includes("취소")) return "bg-red-50 text-red-700 border-red-100";
  if (tag.includes("반품")) return "bg-rose-50 text-rose-700 border-rose-100";
  if (tag.includes("교환")) return "bg-orange-50 text-orange-700 border-orange-100";
  if (tag.includes("배송")) return "bg-blue-50 text-blue-700 border-blue-100";
  if (tag.includes("입금")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (tag.includes("주소")) return "bg-violet-50 text-violet-700 border-violet-100";
  if (tag.includes("상품") || tag.includes("추가구매")) return "bg-pink-50 text-pink-700 border-pink-100";
  if (tag.includes("불만") || tag.includes("주의")) return "bg-red-50 text-red-700 border-red-100";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}
