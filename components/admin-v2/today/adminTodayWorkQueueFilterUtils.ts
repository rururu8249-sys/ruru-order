// components/admin-v2/today/adminTodayWorkQueueFilterUtils.ts
// 목적: 오늘 입금 빠른처리 목록의 날짜/검색 화면 필터
// 주의: UI 필터 전용. 주문상태 저장, 입금매칭 저장, 자동입금확인, 배송비/수수료/정산 계산 변경 없음.

type WorkQueueFilterItem = {
  id?: string;
  label?: string;
  nickname?: string;
  product?: string;
  amountText?: string;
  timeText?: string;
  createdAt?: string;
};

export type TodayWorkQueueFilters = {
  keyword: string;
  startDate: string;
  endDate: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toLocalDateKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const date = new Date(raw.replace(" ", "T"));
  if (!Number.isFinite(date.getTime())) return "";

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function matchesTodayWorkQueueFilters(
  item: WorkQueueFilterItem,
  filters: TodayWorkQueueFilters
) {
  const itemDateKey = toLocalDateKey(item.createdAt);
  const startDate = String(filters.startDate || "").trim();
  const endDate = String(filters.endDate || "").trim();

  if (startDate && itemDateKey && itemDateKey < startDate) return false;
  if (endDate && itemDateKey && itemDateKey > endDate) return false;

  const keyword = normalize(filters.keyword);
  const numberKeyword = digitsOnly(filters.keyword);

  if (!keyword && !numberKeyword) return true;

  const textTarget = [
    item.id,
    item.label,
    item.nickname,
    item.product,
    item.amountText,
    item.timeText,
    item.createdAt,
  ]
    .map(normalize)
    .join(" ");

  const numberTarget = [item.amountText, item.id, item.timeText, item.createdAt]
    .map(digitsOnly)
    .join(" ");

  return (
    Boolean(keyword && textTarget.includes(keyword)) ||
    Boolean(numberKeyword && numberTarget.includes(numberKeyword))
  );
}
