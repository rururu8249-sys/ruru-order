export type RawDepositRow = Record<string, unknown>;

export type LedgerStatus = "확인완료" | "미확인" | "주의";

export type SortKey = "time" | "name" | "amount";

export type SortDirection = "asc" | "desc";

export type DepositSummary = {
  totalAmount: number;
  totalCount: number;
  todayAmount: number;
  lastSyncedLabel: string;
};
