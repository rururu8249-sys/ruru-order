// [2026-09-29] 고객이슈(admin_tasks) 저장 — 고객이슈 탭 「처리」와 주문상세 처리창이 «같은 함수»를 쓴다.
//   메타줄(전화번호·주문번호…) 보존 + items 주면 「대상상품:」 메타줄 교체·raw_payload.items 갱신(⑭ 규칙 그대로).
//   ⚠ admin_tasks 만 수정 — 돈/포인트/refund-ledger 무관.
import { splitIssueBody, mergeIssueBody } from "./issueBodyMeta";
import { issueProductSummary } from "./issueProductLabel";

type IssueTaskLike = {
  id?: unknown; title?: unknown; body?: unknown; priority?: unknown;
  customer_nickname?: unknown; customer_name?: unknown; raw_payload?: unknown;
};
export type IssueTaskItem = { productId: string; productName: string; color: string; size: string; qty: number };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const cleanMultiline = (v: unknown) =>
  String(v ?? "").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n").trim();

export async function patchIssueTask(
  task: IssueTaskLike,
  { issueTypeKey, memo: memoRaw, items }: { issueTypeKey: string; memo: string; items?: IssueTaskItem[] },
): Promise<{ ok: boolean; message?: string }> {
  const id = clean(task.id);
  if (!id) return { ok: false, message: "고객이슈 ID가 없습니다." };
  const memo = cleanMultiline(memoRaw);
  const issueTypes = [issueTypeKey || "general"];
  const baseMeta = splitIssueBody(cleanMultiline(task.body)).metaLines;
  let metaLines = baseMeta;
  let rawExtra: Record<string, unknown> = {};
  if (items) {
    const summary = items.length
      ? issueProductSummary(items.map((i) => ({ product_name: i.productName, color: i.color, size: i.size, qty: i.qty })))
      : "상품 지정 없음";
    metaLines = baseMeta.filter((l) => !l.startsWith("대상상품:")).concat(`대상상품: ${summary}`);
    rawExtra = { items: items.map((i) => ({ productId: i.productId, productName: i.productName, color: i.color, size: i.size, qty: i.qty })) };
  }
  const nextBody = mergeIssueBody(metaLines, memo);
  const titleFallback = `[고객이슈] ${clean(task.customer_nickname) || clean(task.customer_name) || "고객"}`;
  try {
    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action: "update",
        title: clean(task.title) || titleFallback,
        body: nextBody,
        task_type: issueTypes[0],
        priority: clean(task.priority) || "normal",
        raw_payload: {
          ...((task.raw_payload as Record<string, unknown>) || {}),
          issue_types: issueTypes,
          memo,
          edited_from: "admin-live",
          ...rawExtra,
        },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: payload?.message || "고객이슈 저장 실패" };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
