const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatMyOrderDateTime(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "-";

  const parsed = new Date(raw.replace(" ", "T"));

  if (!Number.isFinite(parsed.getTime())) {
    return raw;
  }

  const yyyy = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const weekday = KOREAN_WEEKDAYS[parsed.getDay()] || "";
  const hh = pad2(parsed.getHours());
  const mi = pad2(parsed.getMinutes());

  return `${yyyy}년 ${month}월 ${day}일(${weekday}) ${hh}:${mi}`;
}
