// components/admin-v2/today/adminTodayPeriodUtils.ts
// 목적: 오늘할일 페이지 전체 기간 필터용 날짜 유틸
// 주의: 화면 필터 전용. 주문상태, 입금확인, 돈계산, 배송/정산 로직 변경 없음.

type OrderGroupLike = {
  first?: {
    created_at?: string | null;
  };
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function toLocalDateKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const date = new Date(raw.replace(" ", "T"));
  if (!Number.isFinite(date.getTime())) return "";

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function filterOrderGroupsByPeriod<T extends OrderGroupLike>(
  groups: T[],
  period: {
    startDate: string;
    endDate: string;
  }
) {
  const startDate = String(period.startDate || "").trim();
  const endDate = String(period.endDate || "").trim();

  if (!startDate && !endDate) return groups;

  return groups.filter((group) => {
    const dateKey = toLocalDateKey(group.first?.created_at);

    if (!dateKey) return false;
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;

    return true;
  });
}

export function formatPeriodLabel(startDate: string, endDate: string) {
  if (startDate && endDate && startDate === endDate) return startDate;
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} 이후`;
  if (endDate) return `${endDate} 이전`;
  return "전체 기간";
}
