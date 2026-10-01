export const PURCHASE_LIMIT_PRODUCT_COLUMNS = [
  "id",
  "product_name",
  "product_note",
] as const;

export function purchaseLimitProductSelect() {
  return PURCHASE_LIMIT_PRODUCT_COLUMNS.join(", ");
}

export type DepositOrderLookupQuery = {
  column: string;
  values: Array<string | number>;
};

export function buildDepositOrderLookupPlan(
  groupKeys: string[],
  orderIdKeys: string[],
): DepositOrderLookupQuery[] {
  const plan: DepositOrderLookupQuery[] = [];

  if (groupKeys.length > 0) {
    for (const column of ["order_group_id", "order_lookup_code"]) {
      plan.push({ column, values: groupKeys });
    }
  }

  const numericIds = orderIdKeys
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numericIds.length > 0) {
    plan.push({ column: "id", values: numericIds });
  }

  return plan;
}
