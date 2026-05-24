import type { DepositRow } from "@/lib/admin-v2/types";

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDateInput(value: string) {
  return value.trim().replace(" ", "T");
}

function parseSafeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;

  const date = new Date(normalizeDateInput(raw));
  return Number.isFinite(date.getTime()) ? date : null;
}

function combineDateAndTime(dateValue: unknown, timeValue: unknown) {
  const dateText = text(dateValue);
  const timeText = text(timeValue);

  if (!dateText || !timeText) return null;

  const normalizedTime = /^\d{2}:\d{2}$/.test(timeText) ? `${timeText}:00` : timeText;
  const date = new Date(normalizeDateInput(`${dateText} ${normalizedTime}`));

  return Number.isFinite(date.getTime()) ? date : null;
}

export function parsePaymentDepositDate(deposit: DepositRow) {
  const row = deposit as any;

  const directCandidates = [
    row.deposited_at,
    row.deposit_at,
    row.deposit_datetime,
    row.transaction_at,
    row.created_at,
  ];

  for (const candidate of directCandidates) {
    const parsed = parseSafeDate(candidate);
    if (parsed) return parsed;
  }

  const combined = combineDateAndTime(
    row.deposited_date || row.deposit_date || row.date || row.created_at,
    row.deposited_time || row.deposit_time || row.time
  );

  if (combined) return combined;

  const timeOnly = text(row.deposited_time || row.deposit_time || row.time);
  const created = parseSafeDate(row.created_at);

  if (created && /^\d{2}:\d{2}(:\d{2})?$/.test(timeOnly)) {
    const [hour, minute, second = "0"] = timeOnly.split(":");
    const next = new Date(created);
    next.setHours(Number(hour), Number(minute), Number(second), 0);
    return next;
  }

  return null;
}

export function formatKoreanDateTime(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return "-";

  const yyyy = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAYS[date.getDay()] || "";
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());

  return `${yyyy}년 ${month}월 ${day}일(${weekday}) ${hh}:${mi}`;
}

export function formatKoreanDateOnly(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return "-";

  const yyyy = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAYS[date.getDay()] || "";

  return `${yyyy}년 ${month}월 ${day}일(${weekday})`;
}

export function formatDepositDateTime(deposit: DepositRow) {
  const parsed = parsePaymentDepositDate(deposit);
  if (parsed) return formatKoreanDateTime(parsed);

  const row = deposit as any;
  return text(row.deposited_time || row.deposit_time || row.created_at || "-") || "-";
}

export function toPaymentDateKey(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());

  return `${yyyy}-${mm}-${dd}`;
}

export function getPaymentDateKeyOffset(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toPaymentDateKey(date);
}
