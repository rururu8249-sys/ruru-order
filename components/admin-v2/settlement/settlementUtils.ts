import type {
  AnyRow,
  PaymentFilter,
  SettlementBroadcastOption,
  SettlementBroadcastRow,
  SettlementManualEntry,
  SettlementStats,
} from "./settlementTypes";

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cleanText(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

export function won(value: unknown) {
  return `${Math.round(toNumber(value)).toLocaleString()}원`;
}

export function percentText(value: unknown) {
  return `${toNumber(value).toLocaleString()}%`;
}

export function onlyDigits(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function formatMoneyInput(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString();
}

export function toDateKey(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return "";

  const date = new Date(raw);

  if (!Number.isFinite(date.getTime())) {
    return raw.slice(0, 10);
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateLabel(value: unknown) {
  const key = toDateKey(value);
  if (!key) return "날짜없음";

  const [year, month, day] = key.split("-").map((part) => Number(part));
  const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const date = new Date(year, month - 1, day);
  const weekday = Number.isFinite(date.getTime()) ? weekdayNames[date.getDay()] : "";

  return `${month}월 ${day}일${weekday ? `(${weekday})` : ""}`;
}

export function rowStatusText(row: AnyRow) {
  return [
    row.admin_order_status_v2,
    row.order_manage_status,
    row.payment_status,
    row.deposit_status,
    row.status,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

export function isCanceled(row: AnyRow) {
  return /주문서취소|주문취소|취소|환불|cancel|refund/i.test(rowStatusText(row));
}

export function isPaymentDone(row: AnyRow) {
  const text = rowStatusText(row);

  return (
    /자동입금확인|수동입금확인|입금확인|카드결제완료|카드완료|결제완료|paid|confirmed|complete/i.test(text) ||
    Boolean(row.deposit_confirmed_at)
  );
}

export function paymentMethod(row: AnyRow): PaymentFilter {
  const raw = cleanText(row.payment_method || row.paymentMethod || row.pay_method);

  if (/카드|card/i.test(raw)) return "카드결제";
  if (/무통장|입금|bank/i.test(raw)) return "무통장입금";

  return "기타";
}

export function orderGrossAmount(row: AnyRow) {
  return (
    toNumber(row.adjusted_total_price) ||
    toNumber(row.total_price) ||
    toNumber(row.final_amount) ||
    toNumber(row.total_amount) ||
    toNumber(row.order_amount) ||
    toNumber(row.payment_amount) ||
    toNumber(row.amount)
  );
}

export function orderNetAmount(row: AnyRow) {
  if (toNumber(row.final_amount) > 0) return toNumber(row.final_amount);

  const gross = orderGrossAmount(row);
  const refund = toNumber(row.refund_amount);

  return Math.max(0, gross - refund);
}

export function orderRefundAmount(row: AnyRow) {
  return toNumber(row.refund_amount);
}

export function orderActualCardFee(row: AnyRow, fallbackRate: number) {
  if (paymentMethod(row) !== "카드결제") return 0;

  const storedFee =
    toNumber(row.actual_card_fee_amount) ||
    toNumber(row.card_fee_amount) ||
    toNumber(row.actual_card_fee);

  if (storedFee > 0) return storedFee;

  const appliedRate = toNumber(row.actual_card_fee_rate_applied) || fallbackRate;

  return Math.round(orderNetAmount(row) * (appliedRate / 100));
}

export function orderWarehouseOtherExpense(row: AnyRow) {
  return (
    toNumber(row.warehouse_other_expense) ||
    toNumber(row.manual_expense_amount) ||
    toNumber(row.extra_expense_amount) ||
    0
  );
}

export function isManualEntryActive(entry: SettlementManualEntry) {
  return entry.is_active !== false && !entry.deleted_at;
}

export function manualEntryAmount(entry: SettlementManualEntry) {
  return Math.max(0, toNumber(entry.amount));
}

export function manualEntryDateKey(entry: SettlementManualEntry) {
  return toDateKey(entry.entry_date);
}

export function manualEntryBroadcastKey(entry: SettlementManualEntry) {
  const explicit = cleanText(entry.broadcast_key);
  if (explicit) return explicit;

  const dateKey = manualEntryDateKey(entry);
  return `date:${dateKey || "unknown"}`;
}

export function manualEntryLabel(entry: SettlementManualEntry) {
  return cleanText(entry.broadcast_label) || `${formatDateLabel(entry.entry_date)} · 수동입력`;
}

export function filterManualEntries({
  entries,
  startDate,
  endDate,
  selectedBroadcastKeys,
  paymentFilter,
}: {
  entries: SettlementManualEntry[];
  startDate: string;
  endDate: string;
  selectedBroadcastKeys: string[];
  paymentFilter: PaymentFilter;
}) {
  if (paymentFilter !== "전체") return [];

  const selected = new Set(selectedBroadcastKeys);

  return entries.filter((entry) => {
    if (!isManualEntryActive(entry)) return false;

    const dateKey = manualEntryDateKey(entry);

    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    if (selected.size > 0 && !selected.has(manualEntryBroadcastKey(entry))) return false;

    return true;
  });
}

export function flattenOrders(orderGroups?: AnyRow[], orders?: AnyRow[]) {
  const list: AnyRow[] = [];
  const seen = new Set<string>();

  if (Array.isArray(orderGroups)) {
    orderGroups.forEach((group) => {
      const rows = Array.isArray(group?.rows) ? group.rows : [group?.first].filter(Boolean);

      rows.forEach((row: AnyRow) => {
        const key = cleanText(row?.id || row?.order_id || `${row?.order_lookup_code}-${row?.product_name}`);

        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        if (row) list.push(row);
      });
    });
  }

  if (Array.isArray(orders)) {
    orders.forEach((row) => {
      const key = cleanText(row?.id || row?.order_id || `${row?.order_lookup_code}-${row?.product_name}`);

      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      if (row) list.push(row);
    });
  }

  return list;
}

export function orderDateKey(row: AnyRow) {
  return toDateKey(row.created_at || row.order_date || row.date);
}

export function orderBroadcastKey(row: AnyRow) {
  return `date:${orderDateKey(row) || "unknown"}`;
}

export function buildBroadcastOptions(rows: AnyRow[], broadcasts?: AnyRow[]): SettlementBroadcastOption[] {
  const map = new Map<string, SettlementBroadcastOption>();

  if (Array.isArray(broadcasts)) {
    broadcasts.forEach((broadcast) => {
      const dateKey = toDateKey(broadcast.started_at || broadcast.created_at || broadcast.date);
      if (!dateKey) return;

      const title = cleanText(broadcast.public_title || broadcast.admin_subtitle || broadcast.title || broadcast.name || "방송제목 없음");
      const key = `date:${dateKey}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          dateKey,
          label: `${formatDateLabel(dateKey)} · ${title}`,
          subLabel: "방송리스트",
          count: 0,
        });
      }
    });
  }

  rows.forEach((row) => {
    const dateKey = orderDateKey(row);
    if (!dateKey) return;

    const key = `date:${dateKey}`;
    const current =
      map.get(key) ||
      {
        key,
        dateKey,
        label: `${formatDateLabel(dateKey)} · 방송없음`,
        subLabel: "주문 날짜 기준",
        count: 0,
      };

    current.count += 1;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function filterRows({
  rows,
  startDate,
  endDate,
  selectedBroadcastKeys,
  paymentFilter,
}: {
  rows: AnyRow[];
  startDate: string;
  endDate: string;
  selectedBroadcastKeys: string[];
  paymentFilter: PaymentFilter;
}) {
  const selected = new Set(selectedBroadcastKeys);

  return rows.filter((row) => {
    const dateKey = orderDateKey(row);

    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    if (selected.size > 0 && !selected.has(orderBroadcastKey(row))) return false;
    if (paymentFilter !== "전체" && paymentMethod(row) !== paymentFilter) return false;

    return true;
  });
}

export function calculateStats(
  rows: AnyRow[],
  actualCardRate: number,
  manualEntries: SettlementManualEntry[] = [],
): SettlementStats {
  const activeRows = rows.filter((row) => !isCanceled(row));
  const canceledRows = rows.filter(isCanceled);
  const paidRows = activeRows.filter(isPaymentDone);
  const unpaidRows = activeRows.filter((row) => !isPaymentDone(row));

  const activeManualEntries = manualEntries.filter(isManualEntryActive);
  const manualIncomeEntries = activeManualEntries.filter((entry) => entry.entry_type === "income");
  const manualExpenseEntries = activeManualEntries.filter((entry) => entry.entry_type === "expense");

  const bankRows = paidRows.filter((row) => paymentMethod(row) === "무통장입금");
  const cardRows = paidRows.filter((row) => paymentMethod(row) === "카드결제");
  const otherRows = paidRows.filter((row) => paymentMethod(row) === "기타");

  const orderTotalAmount = activeRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const orderPaidAmount = paidRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const manualIncomeAmount = manualIncomeEntries.reduce((sum, entry) => sum + manualEntryAmount(entry), 0);
  const manualExpenseAmount = manualExpenseEntries.reduce((sum, entry) => sum + manualEntryAmount(entry), 0);

  const totalOrderAmount = orderTotalAmount + manualIncomeAmount;
  const paidAmount = orderPaidAmount + manualIncomeAmount;
  const unpaidAmount = unpaidRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const bankAmount = bankRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const cardAmount = cardRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const otherAmount = otherRows.reduce((sum, row) => sum + orderNetAmount(row), 0);
  const actualCardFee = cardRows.reduce((sum, row) => sum + orderActualCardFee(row, actualCardRate), 0);
  const warehouseOtherExpense = paidRows.reduce((sum, row) => sum + orderWarehouseOtherExpense(row), 0) + manualExpenseAmount;
  const totalExpense = actualCardFee + warehouseOtherExpense;
  const refundAmount = activeRows.reduce((sum, row) => sum + orderRefundAmount(row), 0);
  const canceledAmount = canceledRows.reduce((sum, row) => sum + orderGrossAmount(row), 0);

  return {
    totalOrderAmount,
    paidAmount,
    unpaidAmount,
    bankAmount,
    cardAmount,
    otherAmount,
    manualIncomeAmount,
    actualCardFee,
    warehouseOtherExpense,
    totalExpense,
    netAmount: paidAmount - totalExpense,
    refundAmount,
    canceledAmount,
    orderCount: activeRows.length,
    paidCount: paidRows.length,
    bankCount: bankRows.length,
    cardCount: cardRows.length,
    otherCount: otherRows.length,
    manualIncomeCount: manualIncomeEntries.length,
    manualExpenseCount: manualExpenseEntries.length,
  };
}

export function buildDailyTrend(
  rows: AnyRow[],
  actualCardRate: number,
  manualEntries: SettlementManualEntry[] = [],
) {
  const map = new Map<string, { dateKey: string; sales: number; fee: number; expense: number; net: number }>();

  rows
    .filter((row) => !isCanceled(row) && isPaymentDone(row))
    .forEach((row) => {
      const dateKey = orderDateKey(row) || "unknown";
      const current = map.get(dateKey) || { dateKey, sales: 0, fee: 0, expense: 0, net: 0 };
      const amount = orderNetAmount(row);
      const fee = orderActualCardFee(row, actualCardRate);
      const expense = orderWarehouseOtherExpense(row);

      current.sales += amount;
      current.fee += fee;
      current.expense += expense;
      current.net += amount - fee - expense;

      map.set(dateKey, current);
    });

  manualEntries
    .filter(isManualEntryActive)
    .forEach((entry) => {
      const dateKey = manualEntryDateKey(entry) || "unknown";
      const current = map.get(dateKey) || { dateKey, sales: 0, fee: 0, expense: 0, net: 0 };
      const amount = manualEntryAmount(entry);

      if (entry.entry_type === "income") {
        current.sales += amount;
        current.net += amount;
      } else {
        current.expense += amount;
        current.net -= amount;
      }

      map.set(dateKey, current);
    });

  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey)).slice(-14);
}

export function buildBroadcastRows(
  rows: AnyRow[],
  options: SettlementBroadcastOption[],
  actualCardRate: number,
  manualEntries: SettlementManualEntry[] = [],
): SettlementBroadcastRow[] {
  const optionMap = new Map(options.map((option) => [option.key, option]));
  const orderGrouped = new Map<string, AnyRow[]>();
  const manualGrouped = new Map<string, SettlementManualEntry[]>();

  rows.forEach((row) => {
    const key = orderBroadcastKey(row);
    const current = orderGrouped.get(key) || [];
    current.push(row);
    orderGrouped.set(key, current);
  });

  manualEntries.filter(isManualEntryActive).forEach((entry) => {
    const key = manualEntryBroadcastKey(entry);
    const current = manualGrouped.get(key) || [];
    current.push(entry);
    manualGrouped.set(key, current);
  });

  const keys = Array.from(new Set([...orderGrouped.keys(), ...manualGrouped.keys()]));

  return keys
    .map((key) => {
      const groupRows = orderGrouped.get(key) || [];
      const groupManualEntries = manualGrouped.get(key) || [];
      const option = optionMap.get(key);
      const stats = calculateStats(groupRows, actualCardRate, groupManualEntries);
      const firstManualEntry = groupManualEntries[0];

      return {
        key,
        label:
          option?.label ||
          firstManualEntry?.broadcast_label ||
          (firstManualEntry ? manualEntryLabel(firstManualEntry) : `${formatDateLabel(groupRows[0]?.created_at)} · 방송없음`),
        dateKey: option?.dateKey || orderDateKey(groupRows[0]) || manualEntryDateKey(firstManualEntry || ({} as SettlementManualEntry)) || "",
        count: groupRows.length,
        totalOrderAmount: stats.totalOrderAmount,
        paidAmount: stats.paidAmount,
        bankAmount: stats.bankAmount,
        cardAmount: stats.cardAmount,
        manualIncomeAmount: stats.manualIncomeAmount,
        actualCardFee: stats.actualCardFee,
        warehouseOtherExpense: stats.warehouseOtherExpense,
        totalExpense: stats.totalExpense,
        netAmount: stats.netAmount,
        unpaidAmount: stats.unpaidAmount,
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}
