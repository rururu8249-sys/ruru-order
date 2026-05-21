// components/admin-v2/today/adminTodayWorkQueueFilterUtils.ts
// 목적: 오늘 입금 빠른처리 검색 필터
// 주의: UI 검색 전용. 날짜 필터는 상단 기간설정에서 전체 적용.

type WorkQueueFilterItem = {
  id?: string;
  label?: string;
  nickname?: string;
  product?: string;
  amountText?: string;
  timeText?: string;
  createdAt?: string;
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

export function matchesTodayWorkQueueSearch(item: WorkQueueFilterItem, keyword: string) {
  const word = normalize(keyword);
  const numberKeyword = digitsOnly(keyword);

  if (!word && !numberKeyword) return true;

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
    Boolean(word && textTarget.includes(word)) ||
    Boolean(numberKeyword && numberTarget.includes(numberKeyword))
  );
}
