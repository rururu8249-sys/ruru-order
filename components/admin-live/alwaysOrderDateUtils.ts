export type AlwaysOrderOption = {
  value: string;
  label: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function getAlwaysOrderDateKey(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function formatAlwaysOrderLabelFromDateKey(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `${dateKey} 공구·상시 주문`;

  const month = match[2];
  const day = match[3];
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = Number.isNaN(date.getTime()) ? "" : weekdays[date.getDay()];

  return `${month}${day}${weekday ? `(${weekday})` : ""} 공구·상시 주문`;
}

export function alwaysOrderFilterValue(dateKey: string) {
  return `always:${dateKey}`;
}

export function getAlwaysOrderDateFromFilter(value: string) {
  return value.startsWith("always:") ? value.replace("always:", "") : "";
}

export function isAlwaysOrderLike(order: Record<string, any>) {
  const text = [
    order.broadcastName,
    order.broadcastTitle,
    order.broadcastPublicTitle,
    order.broadcastAdminSubtitle,
    order.broadcast_name,
    order.broadcast_title,
    order.broadcast_public_title,
    order.broadcast_admin_subtitle,
    order.productType,
    order.product_type,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  return !clean(order.broadcastId) || /공구|상시/i.test(text);
}

export function buildAlwaysOrderOptions(orders: Record<string, any>[], todayDateKey: string): AlwaysOrderOption[] {
  return Array.from(
    new Map(
      orders
        .filter((order) => isAlwaysOrderLike(order))
        .map((order) => getAlwaysOrderDateKey(order.createdAt))
        .filter((dateKey) => Boolean(dateKey) && dateKey !== todayDateKey)
        .sort()
        .reverse()
        .map((dateKey) => [
          alwaysOrderFilterValue(dateKey),
          {
            value: alwaysOrderFilterValue(dateKey),
            label: formatAlwaysOrderLabelFromDateKey(dateKey),
          },
        ])
    ).values()
  );
}
