import { fieldFromIssueBody, splitIssueBody } from "./issueBodyMeta";
import { formatPickingKstDateTime } from "./orderPickingExportRows";
import { issueProductLabel, issueProductSummary } from "./issueProductLabel";

type RecordRow = Record<string, unknown>;
export type PickingExceptionRow = { date: string; customer: string; product: string; action: string; status: string; memo: string };
const text = (value: unknown) => String(value ?? "").trim();
const closedTask = (row: RecordRow) => Boolean(row.resolved_at) || /^(done|resolved|completed|complete|deleted|완료|해결|삭제)$/i.test(text(row.status));
const closedLedger = (row: RecordRow) => Boolean(row.done_at) || ["완료", "거절·취소"].includes(text(row.stage));
const matchesOrder = (ledger: RecordRow, order: RecordRow) =>
  Boolean(text(ledger.order_lookup_code) && text(ledger.order_lookup_code) === text(order.order_lookup_code)) ||
  Boolean(text(ledger.order_group_id) && text(ledger.order_group_id) === text(order.order_group_id));
const productText = (orders: readonly RecordRow[]) => orders.map(row => [text(row.product_name), [text(row.color), text(row.size)].filter(v => v && v !== "없음").join(" / "), `${Number(row.qty || 1)}개`].filter(Boolean).join(" · ")).join("\n");
const actionLabel = (value: unknown) => ({ refund: "환불", exchange: "교환", general: "기타 고객이슈" }[text(value)] || text(value) || "고객이슈 확인");
const financialIssue = (value: unknown) => /refund|환불|반품|취소/i.test(text(value));
const taskTarget = (task: RecordRow) => fieldFromIssueBody(task.body, "대상상품:") || text(task.related_product);
const ledgerTarget = (ledger: RecordRow) => Array.isArray(ledger.product_snapshot) ? issueProductSummary(ledger.product_snapshot.map((item: RecordRow) => ({ ...item, product_name: item.productName }))) : "";
// Photo-label substring matching is not completion evidence: “상의×1” must
// not match “긴상의×1” or “상의×10”. Ambiguous labels leave a check-needed row.
const exactProductRows = (orders: readonly RecordRow[], target: string) => {
  const labels = new Set(target.split(", ").map(label => label.trim()));
  return orders.filter(order => labels.has(issueProductLabel(order)));
};

/** Only explicit order identifiers associate an issue with the selected broadcast. Never match names. */
export function buildPickingExceptions(orders: readonly RecordRow[], tasks: readonly RecordRow[], ledgers: readonly RecordRow[]): PickingExceptionRow[] {
  const rows: PickingExceptionRow[] = [];
  const handled = new Set<string>();
  const exportedLedgers = new Set<string>();
  const appendLedger = (ledger: RecordRow, linked: readonly RecordRow[], task?: RecordRow) => {
    exportedLedgers.add(text(ledger.id));
    const target = ledgerTarget(ledger) || (task ? taskTarget(task) : "");
    if (financialIssue(ledger.kind)) exactProductRows(linked, target).forEach(order => handled.add(text(order.id)));
    if (closedLedger(ledger)) return;
    rows.push({ date: formatPickingKstDateTime(text(ledger.created_at)), customer: text(ledger.nickname || ledger.customer_name || linked[0]?.youtube_nickname || linked[0]?.customer_name), product: target || productText(linked), action: actionLabel(ledger.kind), status: text(ledger.stage) || "처리 확인 필요", memo: [text(ledger.next_action), text(ledger.reason), text(ledger.memo)].filter(Boolean).join("\n") });
  };
  for (const task of tasks) {
    const code = fieldFromIssueBody(task.body, "주문번호:");
    const taskLedgers = ledgers.filter(ledger => text(ledger.admin_task_id) === text(task.id));
    const linked = orders.filter(order => Boolean(code && code === text(order.order_lookup_code)) || taskLedgers.some(ledger => matchesOrder(ledger, order)));
    if (!linked.length) continue;
    let scopedLedger = false;
    for (const ledger of taskLedgers) {
      // Explicit ledger order identifiers take precedence over the task's code.
      const ledgerLinked = text(ledger.order_lookup_code) || text(ledger.order_group_id)
        ? orders.filter(order => matchesOrder(ledger, order)) : linked;
      if (!ledgerLinked.length) continue;
      appendLedger(ledger, ledgerLinked, task);
      scopedLedger = true;
    }
    if (scopedLedger) continue;
    if (closedTask(task)) {
      // A resolved issue is completion evidence; deleting an issue is not.
      if (text(task.status) !== "deleted" && financialIssue(task.task_type)) exactProductRows(linked, taskTarget(task)).forEach(order => handled.add(text(order.id)));
      continue;
    }
    if (financialIssue(task.task_type)) exactProductRows(linked, taskTarget(task)).forEach(order => handled.add(text(order.id)));
    rows.push({ date: formatPickingKstDateTime(text(task.created_at)), customer: text(task.customer_nickname || task.customer_name || linked[0].youtube_nickname || linked[0].customer_name), product: taskTarget(task) || productText(linked), action: actionLabel(task.task_type), status: "미처리", memo: splitIssueBody(task.body).memo });
  }
  for (const ledger of ledgers) {
    if (exportedLedgers.has(text(ledger.id))) continue;
    const linked = orders.filter(order => matchesOrder(ledger, order));
    if (linked.length) appendLedger(ledger, linked);
  }
  for (const order of orders) {
    if (handled.has(text(order.id)) || !order.picked_at || !/취소/.test(text(order.admin_order_status_v2) + text(order.order_manage_status))) continue;
    rows.push({ date: formatPickingKstDateTime(text(order.created_at)), customer: text(order.youtube_nickname || order.customer_name), product: productText([order]), action: "취소 · 환불/회수 확인", status: "처리 기록 확인 필요", memo: "챙김 완료 후 취소된 상품입니다. 출고하지 말고 환불·회수 처리 여부를 확인해주세요." });
  }
  return rows;
}
