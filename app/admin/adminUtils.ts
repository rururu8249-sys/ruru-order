// lib/adminUtils.ts
// 관리자 ERP 공통 계산/표시 함수 모음
// 새 파일 생성용
// 위치: lib/adminUtils.ts

export const STATUS_OPTIONS = [
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "주문서취소",
  "환불",
];

export const STATUS_FILTER_OPTIONS = [
  "전체상태",
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "주문서취소",
  "환불",
  "부분환불",
];

export const PAYMENT_FILTER_OPTIONS = [
  "전체결제",
  "무통장입금",
  "카드결제",
  "기타결제",
];

export const EXPENSE_OPTIONS = [
  "생활비",
  "주유비",
  "택배비",
  "알바비",
  "환불",
  "기타",
];

export const onlyNumber = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

export const toNumber = (value: any) =>
  Number(onlyNumber(String(value || "")) || 0);

export const moneyText = (value: any) =>
  toNumber(value).toLocaleString();

export const won = (value: any) =>
  `${Number(value || 0).toLocaleString()}원`;

export const getOrderTotal = (order: any) =>
  Number(order.adjusted_total_price || order.total_price || 0);

export const getOrderShipping = (order: any) =>
  Number(
    order.final_shipping_fee ??
      order.adjusted_shipping_fee ??
      order.shipping_fee ??
      0
  );

export const getAddress = (order: any) =>
  String(
    order.address ||
      order.customer_address ||
      order.shipping_address ||
      order.receiver_address ||
      ""
  ).trim();

export const getDetailAddress = (order: any) =>
  String(
    order.detail_address ||
      order.address_detail ||
      order.customer_detail_address ||
      ""
  ).trim();

export const getFullAddress = (order: any) =>
  `${getAddress(order)} ${getDetailAddress(order)}`.trim();

export const getPaymentLabel = (order: any) => {
  const raw = String(
    order.payment_method ||
      order.pay_method ||
      order.payment_type ||
      order.payment ||
      ""
  ).toLowerCase();

  if (
    raw.includes("카드") ||
    raw.includes("card") ||
    raw.includes("페이스터") ||
    raw.includes("payster")
  ) {
    return "카드결제";
  }

  if (
    raw.includes("무통장") ||
    raw.includes("입금") ||
    raw.includes("bank") ||
    raw.includes("cash")
  ) {
    return "무통장입금";
  }

  return raw
    ? String(order.payment_method || order.pay_method || order.payment_type)
    : "무통장입금";
};

export const isPaysterPayment = (order: any) => {
  const label = getPaymentLabel(order);

  const raw = String(
    order.payment_method ||
      order.pay_method ||
      order.payment_type ||
      order.payment ||
      ""
  ).toLowerCase();

  return (
    label === "카드결제" ||
    raw.includes("페이스터") ||
    raw.includes("payster")
  );
};

export const getRefundAmount = (order: any) => {
  if (order.order_manage_status !== "환불") return 0;

  const savedRefund = Number(order.refund_amount || 0);

  if (savedRefund > 0) return savedRefund;

  return getOrderTotal(order);
};

export const getNetOrderTotal = (order: any) => {
  if (order.order_manage_status === "주문서취소") return 0;

  const gross = getOrderTotal(order);
  const refund = getRefundAmount(order);

  return Math.max(0, gross - refund);
};

export const getDisplayStatus = (order: any) => {
  if (order.order_manage_status === "주문서취소") return "주문서취소";

  if (
    order.order_manage_status === "환불" &&
    order.refund_type === "부분환불"
  ) {
    return "부분환불";
  }

  if (order.order_manage_status === "환불") return "환불";

  return order.order_manage_status || "주문확인전";
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case "주문확인완료":
      return "bg-blue-100 text-blue-700 border-blue-200";

    case "출고대기":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";

    case "출고완료":
      return "bg-green-100 text-green-700 border-green-200";

    case "부분환불":
      return "bg-orange-100 text-orange-700 border-orange-200";

    case "환불":
      return "bg-red-100 text-red-700 border-red-200";

    case "주문서취소":
      return "bg-red-100 text-red-700 border-red-200";

    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export const calculateSettlement = (orders: any[], expenses: any[], warehouseCost: number, extraIncome: number) => {
  const validOrders = orders || [];

  const grossSales = validOrders
    .filter((order) => order.order_manage_status !== "주문서취소")
    .reduce((sum, order) => sum + getOrderTotal(order), 0);

  const totalRefundAmount = validOrders.reduce(
    (sum, order) => sum + getRefundAmount(order),
    0
  );

  const totalSales = validOrders.reduce(
    (sum, order) => sum + getNetOrderTotal(order),
    0
  );

  const cardSales = validOrders
    .filter((order) => isPaysterPayment(order))
    .reduce((sum, order) => sum + getNetOrderTotal(order), 0);

  const cardFeeSettlement = Math.round(cardSales * 0.07);

  const totalExpense = (expenses || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const finalProfit =
    totalSales - Number(warehouseCost || 0) - cardFeeSettlement - totalExpense + Number(extraIncome || 0);

  return {
    grossSales,
    totalRefundAmount,
    totalSales,
    cardSales,
    cardFeeSettlement,
    totalExpense,
    finalProfit,
  };
};

export const cleanCell = (value: any) =>
  String(value ?? "").replace(/\t/g, " ").replace(/\n/g, " ");

export const buildRozenRows = (orders: any[]) => {
  return (orders || []).map((order) => {
    const nickname = String(order.youtube_nickname || "").trim();
    const phone = String(order.customer_phone || "").replace(/[^0-9]/g, "");
    const address = `${getFullAddress(order)} /${nickname}`.trim();

    const itemText = `${order.product_name || "상품"}${
      order.color ? `(${order.color}` : ""
    }${order.size ? ` / ${order.size}` : ""}${
      order.color ? ")" : ""
    } x${order.qty || 1} / 총 ${order.qty || 1}개`;

    return [
      nickname,
      "",
      address,
      phone,
      phone,
      "1",
      "2750",
      "010",
      itemText,
      "",
      "친절배송부탁드립니다.",
    ];
  });
};

export const downloadTsvAsExcel = (rows: any[][], filename: string) => {
  const tsv = rows
    .map((row) => row.map((cell) => cleanCell(cell)).join("\t"))
    .join("\n");

  const blob = new Blob(["\ufeff" + tsv], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
};
