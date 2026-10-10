// Shared read-only classification for the customer-issue list and its badge.
type IssueStatus = {
  title?: unknown; body?: unknown; task_type?: unknown; customer_id?: unknown;
  status?: unknown; is_resolved?: unknown; resolved_at?: unknown; completed_at?: unknown;
};
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

export function isCustomerIssueTask(task: IssueStatus) {
  const text = [task.title, task.body, task.task_type].map(clean).join(" ");
  return text.includes("고객이슈") || text.includes("issue") || Boolean(task.customer_id);
}

export function isCustomerIssueResolved(task: IssueStatus) {
  const status = clean(task.status).toLowerCase();
  return Boolean(task.is_resolved || task.resolved_at || task.completed_at ||
    status.includes("resolved") || status.includes("done") || status.includes("complete") ||
    status.includes("해결") || status.includes("완료"));
}

export function isCustomerIssueDeleted(task: IssueStatus) {
  return clean(task.status).toLowerCase() === "deleted";
}
