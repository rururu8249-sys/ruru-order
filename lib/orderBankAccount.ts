import type { ShopBankAccountId } from "./shopInfo";

export type CustomerOrderSegment = "first_order" | "existing";

export type OrderBankAccountSnapshot = {
  id: ShopBankAccountId;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

export type OrderBankRoutingResult = {
  customerOrderSegment: CustomerOrderSegment;
  bankAccount: OrderBankAccountSnapshot;
};

export type OrderGroupBankAccountResolution = {
  status: "snapshot" | "legacy" | "conflict";
  bankAccount?: OrderBankAccountSnapshot;
};

const SERVER_BANK_FIELDS = new Set([
  "customer_order_segment",
  "payment_bank_account_id",
  "payment_bank_name",
  "payment_bank_account",
  "payment_bank_holder",
  "payment_bank_assigned_at",
  "bank_account",
  "bankAccount",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function sanitizeOrderRowsForBankRouting(
  rows: readonly unknown[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const source = record(row) || {};
    return Object.fromEntries(
      Object.entries(source).filter(([key]) => !SERVER_BANK_FIELDS.has(key)),
    );
  });
}

export function parseOrderBankRoutingResult(value: unknown): OrderBankRoutingResult {
  const root = record(value);
  const segment = clean(root?.customer_order_segment ?? root?.customerOrderSegment);
  const account = record(root?.bank_account ?? root?.bankAccount);
  const id = clean(account?.id);
  const bankName = clean(account?.bankName ?? account?.bank_name);
  const bankAccount = clean(account?.bankAccount ?? account?.bank_account).replace(/\s+/g, "");
  const bankHolder = clean(account?.bankHolder ?? account?.bank_holder);

  if (segment !== "first_order" && segment !== "existing") {
    throw new Error("주문에 배정된 입금계좌 고객 구분이 올바르지 않습니다.");
  }
  if (id !== "primary" && id !== "secondary") {
    throw new Error("주문에 배정된 입금계좌 구분이 올바르지 않습니다.");
  }
  if (!bankName || !bankHolder || !/^[0-9-]{6,30}$/.test(bankAccount) || bankAccount.replace(/[^0-9]/g, "").length < 6) {
    throw new Error("주문에 배정된 입금계좌 정보가 올바르지 않습니다.");
  }

  return {
    customerOrderSegment: segment,
    bankAccount: { id, bankName, bankAccount, bankHolder },
  };
}

const ORDER_SNAPSHOT_FIELDS = [
  "customer_order_segment",
  "payment_bank_account_id",
  "payment_bank_name",
  "payment_bank_account",
  "payment_bank_holder",
] as const;

export function resolveOrderGroupBankAccount(
  rows: readonly unknown[],
  legacyFallback: OrderBankAccountSnapshot,
): OrderGroupBankAccountResolution {
  const values: OrderBankRoutingResult[] = [];
  let emptyRows = 0;

  for (const value of rows) {
    const row = record(value) || {};
    const presentCount = ORDER_SNAPSHOT_FIELDS.filter((field) => clean(row[field]) !== "").length;
    if (presentCount === 0) {
      emptyRows += 1;
      continue;
    }
    if (presentCount !== ORDER_SNAPSHOT_FIELDS.length) return { status: "conflict" };

    try {
      values.push(parseOrderBankRoutingResult({
        customer_order_segment: row.customer_order_segment,
        bank_account: {
          id: row.payment_bank_account_id,
          bankName: row.payment_bank_name,
          bankAccount: row.payment_bank_account,
          bankHolder: row.payment_bank_holder,
        },
      }));
    } catch {
      return { status: "conflict" };
    }
  }

  if (values.length === 0) return { status: "legacy", bankAccount: { ...legacyFallback } };
  if (emptyRows > 0) return { status: "conflict" };

  const first = values[0];
  const signature = JSON.stringify(first);
  if (values.some((value) => JSON.stringify(value) !== signature)) return { status: "conflict" };
  return { status: "snapshot", bankAccount: { ...first.bankAccount } };
}
