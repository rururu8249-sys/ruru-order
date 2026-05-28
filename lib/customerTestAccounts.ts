export type OperatorTestAccountFlags = {
  isOperatorTestAccount: boolean;
  displayLabel: string;
  allowPointTest: boolean;
  allowAmountTest: boolean;
  excludeFromSettlement: boolean;
  excludeFromPaymentMatch: boolean;
  excludeFromShipping: boolean;
  excludeFromPicking: boolean;
};

export type OperatorTestAccountRow = {
  customer_phone?: string | null;
  display_label?: string | null;
  is_active?: boolean | null;
  allow_point_test?: boolean | null;
  allow_amount_test?: boolean | null;
  exclude_from_settlement?: boolean | null;
  exclude_from_payment_match?: boolean | null;
  exclude_from_shipping?: boolean | null;
  exclude_from_picking?: boolean | null;
};

export const EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS: OperatorTestAccountFlags = {
  isOperatorTestAccount: false,
  displayLabel: "",
  allowPointTest: false,
  allowAmountTest: false,
  excludeFromSettlement: false,
  excludeFromPaymentMatch: false,
  excludeFromShipping: false,
  excludeFromPicking: false,
};

export const INITIAL_OPERATOR_TEST_ACCOUNT_PHONES = ["01099992420", "01081912420"] as const;

export function normalizeOperatorTestPhone(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function isValidOperatorTestPhone(value: unknown): boolean {
  return normalizeOperatorTestPhone(value).length >= 10;
}

export function operatorTestFlagsFromRow(row: OperatorTestAccountRow | null | undefined): OperatorTestAccountFlags {
  if (!row || row.is_active !== true) {
    return EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS;
  }

  return {
    isOperatorTestAccount: true,
    displayLabel: String(row.display_label || "관리자").trim() || "관리자",
    allowPointTest: row.allow_point_test !== false,
    allowAmountTest: row.allow_amount_test !== false,
    excludeFromSettlement: row.exclude_from_settlement !== false,
    excludeFromPaymentMatch: row.exclude_from_payment_match !== false,
    excludeFromShipping: row.exclude_from_shipping !== false,
    excludeFromPicking: row.exclude_from_picking !== false,
  };
}
