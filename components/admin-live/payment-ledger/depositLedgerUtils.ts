import type { LedgerStatus, RawDepositRow, SortDirection, SortKey } from "./depositLedgerTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function readFirst(row: RawDepositRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && cleanText(value) !== "") return value;
  }

  return "";
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = cleanText(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

export function formatMoney(value: unknown) {
  return `${toNumber(value).toLocaleString()}원`;
}

export function formatDepositMoney(value: unknown) {
  const amount = toNumber(value);
  return `${amount >= 0 ? "+" : ""}${amount.toLocaleString()}원`;
}

export function getDepositId(row: RawDepositRow) {
  return cleanText(
    readFirst(row, [
      "id",
      "deposit_id",
      "bankda_id",
      "transaction_id",
      "bkseq",
      "bkid",
      "tid",
    ]),
  );
}

export function getDepositName(row: RawDepositRow) {
  return cleanText(
    readFirst(row, [
      "depositor_name",
      "deposit_name",
      "sender_name",
      "depositor",
      "name",
      "bkjukyo",
      "memo",
    ]),
  );
}

export function getDepositAmount(row: RawDepositRow) {
  return toNumber(
    readFirst(row, [
      "amount",
      "deposit_amount",
      "payment_amount",
      "in_amount",
      "income",
      "bkinput",
      "money",
      "price",
    ]),
  );
}

export function getRawDateText(row: RawDepositRow) {
  const direct = cleanText(
    readFirst(row, [
      "deposited_at",
      "deposit_at",
      "transaction_at",
      "paid_at",
      "created_at",
      "updated_at",
    ]),
  );

  if (direct) return direct;

  const date = cleanText(readFirst(row, ["deposited_date", "deposit_date", "bkdate", "date"]));
  const time = cleanText(readFirst(row, ["deposited_time", "deposit_time", "bktime", "time"]));

  return [date, time].filter(Boolean).join(" ");
}

export function getDepositTime(row: RawDepositRow) {
  const raw = getRawDateText(row);
  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();

  const compact = raw.replace(/[.]/g, "-").replace(/\s+/g, " ");
  const retry = new Date(compact);

  return Number.isNaN(retry.getTime()) ? 0 : retry.getTime();
}

export function formatDepositDateTime(row: RawDepositRow) {
  const raw = getRawDateText(row);
  const time = getDepositTime(row);

  if (!time) return raw || "-";

  const date = new Date(time);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\.\s/g, ".")
    .replace(".", "년 ")
    .replace(".", "월 ")
    .replace(".", "일 ");
}

export function getDepositStatus(row: RawDepositRow): LedgerStatus {
  const name = getDepositName(row);
  const amount = getDepositAmount(row);

  if (!name || amount <= 0) return "주의";

  const statusText = cleanText(
    readFirst(row, [
      "match_status",
      "payment_status",
      "deposit_status",
      "status",
      "state",
    ]),
  );

  if (/주의|오류|중복|실패|취소|환불/.test(statusText)) return "주의";

  const hasConfirmedTime = Boolean(cleanText(readFirst(row, ["confirmed_at", "deposit_confirmed_at"])));
  const hasLinkedOrder = Boolean(
    cleanText(
      readFirst(row, [
        "match_order_group_id",
        "matched_order_group_id",
        "match_order_id",
        "matched_order_id",
        "match_customer_id",
        "matched_customer_id",
      ]),
    ),
  );

  if (
    hasConfirmedTime ||
    hasLinkedOrder ||
    /자동입금확인|수동입금확인|입금확인|매칭완료|처리완료|완료|confirmed|matched/i.test(statusText)
  ) {
    return "확인완료";
  }

  return "미확인";
}

export function getProcessMethod(row: RawDepositRow) {
  const statusText = cleanText(readFirst(row, ["match_status", "confirmed_note", "match_note", "status"]));

  if (/자동입금확인/.test(statusText)) return "자동입금확인";
  if (/수동입금확인/.test(statusText)) return "수동입금확인";
  if (/입금확인|매칭완료|처리완료|완료/.test(statusText)) return statusText;

  return getDepositStatus(row) === "확인완료" ? "확인완료" : "-";
}

export function getSafeOrderConnection(row: RawDepositRow) {
  const raw = cleanText(
    readFirst(row, [
      "match_order_group_id",
      "matched_order_group_id",
      "match_order_id",
      "matched_order_id",
      "order_lookup_code",
      "order_group_id",
    ]),
  );

  if (!raw) return "연결 없음";
  if (UUID_RE.test(raw)) return "주문 연결됨";

  return `주문 연결됨 / ${raw}`;
}

export function getBankMemo(row: RawDepositRow) {
  const memo = cleanText(
    readFirst(row, [
      "bank_memo",
      "memo",
      "note",
      "match_note",
      "confirmed_note",
      "bkjukyo",
      "description",
    ]),
  );

  return memo || "-";
}

export function statusClass(status: LedgerStatus) {
  if (status === "확인완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "주의") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function matchesKeyword(row: RawDepositRow, keyword: string) {
  const word = cleanText(keyword).toLowerCase();
  if (!word) return true;

  const amount = getDepositAmount(row);
  const target = [
    getDepositName(row),
    String(amount),
    amount.toLocaleString(),
    getDepositStatus(row),
    getProcessMethod(row),
    getBankMemo(row),
    getRawDateText(row),
  ]
    .join(" ")
    .toLowerCase();

  return target.includes(word.replace(/,/g, "")) || target.includes(word);
}

export function isWithinDateRange(row: RawDepositRow, fromDate: string, toDate: string) {
  const time = getDepositTime(row);
  if (!time) return true;

  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    if (time < from) return false;
  }

  if (toDate) {
    const to = new Date(`${toDate}T23:59:59`).getTime();
    if (time > to) return false;
  }

  return true;
}

export function sortDeposits(rows: RawDepositRow[], sortKey: SortKey, direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    let av: number | string = "";
    let bv: number | string = "";

    if (sortKey === "time") {
      av = getDepositTime(a);
      bv = getDepositTime(b);
    }

    if (sortKey === "name") {
      av = getDepositName(a);
      bv = getDepositName(b);
    }

    if (sortKey === "amount") {
      av = getDepositAmount(a);
      bv = getDepositAmount(b);
    }

    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return (av - bv) * sign;
    } else {
      const result = String(av).localeCompare(String(bv), "ko-KR");
      if (result !== 0) return result * sign;
    }

    return (Number(getDepositId(a)) - Number(getDepositId(b))) * sign;
  });
}

export function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function daysAgoInputValue(days: number) {
  const now = new Date();
  now.setDate(now.getDate() - days);

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}
