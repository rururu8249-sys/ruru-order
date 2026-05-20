"use client";

// components/admin-v2/AdminV2Client.tsx
// admin-v2 실제 화면 클라이언트 컴포넌트
// 리팩토링 1단계: 기존 기능 유지, page.tsx 몰빵 제거, 돈/상태/포맷 유틸 lib 분리.

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ManualPaymentMatchDrawer from "@/components/admin-v2/payment/ManualPaymentMatchDrawer";
import PaymentMatchPanel from "@/components/admin-v2/payment/PaymentMatchPanel";
import RosenExportOnlyNotice from "@/components/admin-v2/shipping/RosenExportOnlyNotice";
import AdminOrderPaymentCell from "@/components/admin-v2/orders/AdminOrderPaymentCell";
import AdminOrderTableHeader from "@/components/admin-v2/orders/AdminOrderTableHeader";
import AdminOrderTopSummary from "@/components/admin-v2/orders/AdminOrderTopSummary";
import AdminOrderFilterBar from "@/components/admin-v2/orders/AdminOrderFilterBar";
import AdminOrderMainRow from "@/components/admin-v2/orders/AdminOrderMainRow";
import AdminOrderBulkActionBar from "@/components/admin-v2/orders/AdminOrderBulkActionBar";
import AdminOrderAmountCell from "@/components/admin-v2/orders/AdminOrderAmountCell";
import AdminOrderStatusCell from "@/components/admin-v2/orders/AdminOrderStatusCell";
import AdminOrderDetailButton from "@/components/admin-v2/orders/AdminOrderDetailButton";
import AdminOrderDetailBlock from "@/components/admin-v2/orders/AdminOrderDetailBlock";

import type {
  AdminTab,
  BroadcastRow,
  CustomerRow,
  DepositRow,
  MoneyEditLogRow,
  OrderGroup,
  OrderRow,
  RosenShippingPreviewRow,
  SettingRow,
  StatusChangeLogRow,
} from "@/lib/admin-v2/types";
import { ORDER_STATUS_OPTIONS, PAGE_SIZE, PAYMENT_FILTERS, TABS } from "@/lib/admin-v2/constants";
import {
  buildRosenItemTextFromOrderRow,
  buildRosenRecipientAddress,
  getRosenBaseAddress,
  getRosenRecipientNickname,
} from "@/lib/admin-v2/rosenExportRules";
import {
  displayOrderPhone,
  formatDateLabel,
  formatKoreanPhone,
  digitsOnly,
  money,
  moneyInput,
  moneyNumber,
  orderPhoneDigits,
  toDateKey,
} from "@/lib/admin-v2/formatters";
import {
  buildItemSummary,
  buildProductSummaryFromRow,
  getAdminMemo,
  getLegacyProductMemo,
  getOrderStatusLabel,
  getOrderStatusValue,
  getShippingExcelMemo,
  getShippingRequestMemo,
  getSpecialNote,
  groupActualCardFeeAmount,
  groupCanceledAmount,
  groupCustomerCardExtraAmount,
  groupGrossBaseAmount,
  groupNetSalesAmount,
  groupRefundAmount,
  isBankPaid,
  isBankPayment,
  isBankUnpaid,
  isCardPaid,
  isCardPayment,
  isCardUnpaid,
  isOrderCanceled,
  isOrderPaid,
  isPaymentUnpaid,
  orderBaseAmount,
  orderNetSalesAmount,
  paymentStatusMeta,
  readSettingNumber,
  selectClass,
  shortOrderCode,
} from "@/lib/admin-v2/orderHelpers";

const ROSEN_SHIPPING_KEY_PREFIX = "R";
const ROSEN_LEGACY_SHIPPING_KEY_PREFIX = "RURU|";
const ROSEN_TEMPLATE_PATH = "/templates/rozen_template.xlsx";
const ROSEN_FIXED_FARE = 2750;

const ROSEN_UPLOAD_HEADERS = [
  "수하인명",
  "",
  "수하인주소",
  "수하인전화번호",
  "수하인핸드폰번호",
  "택배수량",
  "택배운임",
  "운임구분",
  "품목명",
  "",
  "배송메세지",
];

type RosenUploadExcelRow = {
  recipientName: string;
  internalKey: string;
  address: string;
  phone: string;
  mobilePhone: string;
  parcelQty: string;
  shippingFee: string;
  feeType: string;
  itemName: string;
  backup: string;
  requestMemo: string;
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLooseText(value: unknown) {
  return cleanText(value).replace(/[\s\-_.]/g, "").toLowerCase();
}

function normalizeAddressForCompare(value: unknown) {
  return cleanText(value).replace(/[\s,()\[\]{}\-_.]/g, "").toLowerCase();
}

function combineOrderAddress(row: Pick<OrderRow, "address" | "detail_address">) {
  return getRosenBaseAddress(row);
}

function getGroupRecipientName(group: OrderGroup) {
  return getRosenRecipientNickname(group.first);
}

function buildRosenShippingKey(group: OrderGroup) {
  const ids = Array.from(new Set(group.rows.map((row) => Number(row.id)).filter(Boolean))).sort((a, b) => a - b);
  return `${ROSEN_SHIPPING_KEY_PREFIX}${ids.join(",")}`;
}

function buildRosenOrderFormGroups(rows: OrderRow[]): OrderGroup[] {
  // 송장관리에서는 절대 묶지 않습니다.
  // order_group_id, order_lookup_code, 고객명, 전화번호, 주소가 같아도 합치지 않습니다.
  // DB 주문행 1개 = 로젠 엑셀 1줄입니다.
  // 여러 줄 합배송/묶음처리는 로젠 프로그램에 맡깁니다.
  return [...rows]
    .sort((a, b) => {
      const aTime = new Date(a.created_at || "").getTime() || 0;
      const bTime = new Date(b.created_at || "").getTime() || 0;
      if (aTime !== bTime) return bTime - aTime;
      return Number(b.id || 0) - Number(a.id || 0);
    })
    .map((row) => ({
      groupId: `row:${row.id}`,
      first: row,
      rows: [row],
      totalAmount: orderNetSalesAmount(row),
      totalQty: Number(row.qty || 0),
    }));
}

function buildRosenItemTextFromRow(row: OrderRow) {
  return buildRosenItemTextFromOrderRow(row);
}

function getRosenItemName(group: OrderGroup) {
  // DB 주문행 1개를 그대로 I열 품목명에 넣습니다.
  // 송장관리에서는 order_lookup_code 기준으로도 합치지 않습니다.
  // 상품과 상품 사이 구분자는 합쳐질 때만 " , "를 쓰지만, 1차 원칙상 rows는 항상 1개입니다.
  // 배송메세지 K열에는 절대 상품정보를 섞지 않고 request_memo만 넣습니다.
  const items = group.rows
    .map((row) => buildRosenItemTextFromRow(row))
    .filter((item) => Boolean(cleanText(item)));

  if (items.length === 0) return "의류";

  return items.join(" , ");
}

function parseRosenShippingKey(value: unknown) {
  const text = cleanText(value).replace(/\s+/g, "");
  let rawIds = "";

  // 신규 형식: R92 / R1050
  // 이전에 내려받은 파일도 실수 없이 읽을 수 있도록 기존 형식 RURU|92도 같이 허용합니다.
  if (/^R[0-9,]+$/.test(text)) {
    rawIds = text.slice(ROSEN_SHIPPING_KEY_PREFIX.length);
  } else if (text.startsWith(ROSEN_LEGACY_SHIPPING_KEY_PREFIX)) {
    rawIds = text.slice(ROSEN_LEGACY_SHIPPING_KEY_PREFIX.length);
  }

  if (!rawIds) return [];

  return rawIds
    .split(",")
    .map((item) => Number(String(item).replace(/[^0-9]/g, "")))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function isRosenShippingKey(value: unknown) {
  return parseRosenShippingKey(value).length > 0;
}

function getShippingDownloadBlockReason(group: OrderGroup) {
  const status = getOrderStatusValue(group.first);
  const recipientName = getGroupRecipientName(group);
  const phoneDigits = orderPhoneDigits(group.first);
  const address = combineOrderAddress(group.first);

  if (isOrderCanceled(group.first)) return "주문취소";
  if (group.rows.some((row) => getOrderStatusValue(row) === "출고완료" || row.shipped_at)) return "이미 출고완료";
  if (status !== "출고대기") return `현재 상태: ${getOrderStatusLabel(status)}`;
  if (!recipientName) return "수하인명 없음";
  if (!phoneDigits) return "전화번호 없음";
  if (!address) return "주소 없음";

  return "";
}

function buildRosenUploadRow(group: OrderGroup): RosenUploadExcelRow {
  const phone = displayOrderPhone(group.first);

  return {
    recipientName: getGroupRecipientName(group),
    internalKey: buildRosenShippingKey(group),
    address: buildRosenRecipientAddress(group.first),
    phone,
    mobilePhone: phone,
    parcelQty: "1",
    shippingFee: String(ROSEN_FIXED_FARE),
    feeType: "010",
    itemName: getRosenItemName(group),
    backup: "",
    requestMemo: getShippingExcelMemo(group.first),
  };
}

function escapeTsvCell(value: unknown) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

function buildRosenUploadMatrix(rows: RosenUploadExcelRow[]) {
  return rows.map((row) => [
    row.recipientName,
    row.internalKey,
    row.address,
    row.phone,
    row.mobilePhone,
    Number(row.parcelQty || 1),
    ROSEN_FIXED_FARE,
    row.feeType,
    row.itemName,
    row.backup,
    row.requestMemo,
  ]);
}

function buildRosenCopyTsv(rows: RosenUploadExcelRow[]) {
  return buildRosenUploadMatrix(rows)
    .map((row) => row.map((cell) => escapeTsvCell(cell)).join("\t"))
    .join("\r\n");
}

function downloadBlobFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  downloadBlobFile(fileName, new Blob(["\ufeff", content], { type: mimeType }));
}

async function buildRosenTemplateWorkbookBlob(rows: RosenUploadExcelRow[]) {
  const XLSX = await import("xlsx");
  const response = await fetch(ROSEN_TEMPLATE_PATH, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`로젠 템플릿 파일을 찾을 수 없습니다. public/templates/rozen_template.xlsx 위치를 확인해주세요. (${response.status})`);
  }

  const templateBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(templateBuffer, { type: "array", cellStyles: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  if (!firstSheetName || !worksheet) {
    throw new Error("로젠 템플릿 첫 번째 시트를 읽을 수 없습니다.");
  }

  const matrix = buildRosenUploadMatrix(rows);
  const clearRowCount = Math.max(matrix.length + 20, 200);

  for (let rowIndex = 0; rowIndex < clearRowCount; rowIndex += 1) {
    for (let colIndex = 0; colIndex < ROSEN_UPLOAD_HEADERS.length; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const prevCell = worksheet[address] || {};

      if (rowIndex < matrix.length) {
        const value = matrix[rowIndex][colIndex] ?? "";
        const isNumberColumn = colIndex === 5 || colIndex === 6;

        worksheet[address] = {
          ...prevCell,
          t: isNumberColumn ? "n" : "s",
          v: isNumberColumn ? Number(value || 0) : String(value),
          z: isNumberColumn ? "0" : "@",
        };
      } else if (worksheet[address]) {
        worksheet[address] = {
          ...prevCell,
          t: "s",
          v: "",
          w: "",
          z: "@",
        };
      }
    }
  }

  worksheet["!ref"] = `A1:K${Math.max(1, matrix.length)}`;

  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });

  return new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function extractRowsFromUploadedText(text: string) {
  const clean = text.replace(/^\ufeff/, "");

  if (/<table[\s>]/i.test(clean)) {
    const doc = new DOMParser().parseFromString(clean, "text/html");
    return Array.from(doc.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((cell) => cleanText(cell.textContent || ""))
    );
  }

  return clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((cell) => cleanText(cell)));
}

async function extractRowsFromUploadedFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".xlsx")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    if (!firstSheetName || !worksheet) {
      throw new Error("첫 번째 시트를 읽을 수 없습니다.");
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    return rows.map((row) => row.map((cell) => cleanText(cell)));
  }

  const text = await file.text();
  return extractRowsFromUploadedText(text);
}

function buildRosenShippingPreviewRows(rawRows: string[][], orders: OrderRow[]): RosenShippingPreviewRow[] {
  const orderMap = new Map<number, OrderRow>();
  orders.forEach((order) => orderMap.set(Number(order.id), order));

  const candidates = rawRows.flatMap((cells, index) => {
    const rowNumber = index + 1;
    const hasAnyData = cells.some((cell) => cleanText(cell));
    const key = cleanText(cells[1] || "");

    if (!hasAnyData) return [];
    if (rowNumber === 1 && !isRosenShippingKey(key)) return [];

    const orderIds = parseRosenShippingKey(key);

    return [{ rowNumber, cells, key, orderIds }];
  });

  const idCounts = new Map<number, number>();
  candidates.forEach((candidate) => {
    candidate.orderIds.forEach((id) => idCounts.set(id, (idCounts.get(id) || 0) + 1));
  });

  return candidates.map((candidate) => {
    const customerName = cleanText(candidate.cells[0] || "");
    const address = cleanText(candidate.cells[2] || "");
    const phone = cleanText(candidate.cells[4] || candidate.cells[3] || "");
    const itemSummary = cleanText(candidate.cells[8] || "");
    const requestMemo = cleanText(candidate.cells[10] || "");
    const blockingReasons: string[] = [];
    const checkReasons: string[] = [];

    if (!candidate.key) blockingReasons.push("B열 주문키 없음");
    if (candidate.key && !isRosenShippingKey(candidate.key)) blockingReasons.push("B열 R키 형식 아님");
    if (isRosenShippingKey(candidate.key) && candidate.orderIds.length === 0) blockingReasons.push("B열 주문ID 없음");

    const foundRows = candidate.orderIds.map((id) => orderMap.get(id)).filter(Boolean) as OrderRow[];
    const missingIds = candidate.orderIds.filter((id) => !orderMap.has(id));

    if (missingIds.length > 0) blockingReasons.push(`사이트 주문 없음: ${missingIds.join(",")}`);

    const first = foundRows[0];

    if (first) {
      const expectedName = cleanText(first.customer_name || first.youtube_nickname || "");
      const expectedPhone = orderPhoneDigits(first);
      const expectedAddress = combineOrderAddress(first);
      const uploadedPhone = digitsOnly(phone);

      if (foundRows.some((row) => isOrderCanceled(row))) checkReasons.push("주문취소 포함");
      if (foundRows.some((row) => getOrderStatusValue(row) === "출고완료" || row.shipped_at)) checkReasons.push("이미 출고완료 포함");
      if (foundRows.some((row) => getOrderStatusValue(row) !== "출고대기")) checkReasons.push("출고대기 아닌 주문 포함");
      if (candidate.orderIds.some((id) => (idCounts.get(id) || 0) > 1)) checkReasons.push("같은 주문ID가 엑셀에 중복됨");
      if (foundRows.some((row) => normalizeLooseText(row.customer_name || row.youtube_nickname || "") !== normalizeLooseText(expectedName))) checkReasons.push("주문ID끼리 수하인명 다름");
      if (foundRows.some((row) => orderPhoneDigits(row) !== expectedPhone)) checkReasons.push("주문ID끼리 전화번호 다름");
      if (foundRows.some((row) => normalizeAddressForCompare(combineOrderAddress(row)) !== normalizeAddressForCompare(expectedAddress))) checkReasons.push("주문ID끼리 주소 다름");

      if (customerName && expectedName && normalizeLooseText(customerName) !== normalizeLooseText(expectedName)) checkReasons.push("엑셀 수하인명과 주문 수하인명 불일치");
      if (uploadedPhone && expectedPhone && uploadedPhone !== expectedPhone) checkReasons.push("엑셀 전화번호와 주문 전화번호 불일치");
      if (address && expectedAddress && normalizeAddressForCompare(address) !== normalizeAddressForCompare(expectedAddress)) checkReasons.push("엑셀 주소와 주문 주소 불일치");
    }

    const status = blockingReasons.length > 0 ? "blocked" : checkReasons.length > 0 ? "check" : "ready";
    const message = [...blockingReasons, ...checkReasons].join(" / ") || "출고완료 일괄반영 사용안함 가능";

    return {
      rowNumber: candidate.rowNumber,
      key: candidate.key || "-",
      orderIds: candidate.orderIds,
      customerName,
      phone,
      address,
      itemSummary,
      requestMemo,
      status,
      message,
    };
  });
}

function getShippingPreviewLabel(status: RosenShippingPreviewRow["status"]) {
  if (status === "ready") return "다운로드가능";
  if (status === "check") return "확인필요";
  return "다운로드제외";
}

function getShippingPreviewClass(status: RosenShippingPreviewRow["status"]) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "check") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

export function AdminV2Client() {
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [moneyEditLogs, setMoneyEditLogs] = useState<MoneyEditLogRow[]>([]);
  const [statusChangeLogs, setStatusChangeLogs] = useState<StatusChangeLogRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [pendingKeyword, setPendingKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [openedOrderGroupIds, setOpenedOrderGroupIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [manualMatchGroup, setManualMatchGroup] = useState<OrderGroup | null>(null);

  const loadData = async () => {
    setLoading(true);

    const [ordersResult, customersResult, depositsResult, moneyLogsResult, statusLogsResult, broadcastsResult, settingsResult] = await Promise.all([
      supabase.from("orders").select("*").neq("is_deleted", true).order("created_at", { ascending: false }).limit(500),
      supabase.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.rpc("get_order_money_edit_logs_for_admin_v2"),
      supabase.rpc("get_order_status_change_logs_for_admin_v2"),
      supabase.from("broadcasts").select("*").order("started_at", { ascending: false }).limit(120),
      supabase.from("settings").select("key,value").order("key"),
    ]);

    if (ordersResult.error) alert("주문 불러오기 실패\n\n" + ordersResult.error.message);
    else setOrders((ordersResult.data || []) as OrderRow[]);

    if (customersResult.error) alert("고객 불러오기 실패\n\n" + customersResult.error.message);
    else setCustomers((customersResult.data || []) as CustomerRow[]);

    setDeposits((depositsResult.data || []) as DepositRow[]);

    if (moneyLogsResult.error) {
      alert("금액수정이력 불러오기 실패\n\n" + moneyLogsResult.error.message);
      setMoneyEditLogs([]);
    } else {
      setMoneyEditLogs((moneyLogsResult.data || []) as MoneyEditLogRow[]);
    }

    if (statusLogsResult.error) {
      alert("상태변경이력 불러오기 실패\n\n" + statusLogsResult.error.message);
      setStatusChangeLogs([]);
    } else {
      setStatusChangeLogs((statusLogsResult.data || []) as StatusChangeLogRow[]);
    }

    setBroadcasts((broadcastsResult.data || []) as BroadcastRow[]);
    setSettings((settingsResult.data || []) as SettingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, paymentFilter, dateFilter, activeTab]);

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderRow[]>();

    orders.forEach((order) => {
      const groupId = String(order.order_group_id || order.order_lookup_code || order.id || "");
      if (!map.has(groupId)) map.set(groupId, []);
      map.get(groupId)?.push(order);
    });

    return Array.from(map.entries()).map(([groupId, rows]) => {
      const group = {
        groupId,
        first: rows[0],
        rows,
        totalAmount: 0,
        totalQty: rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      };

      return {
        ...group,
        totalAmount: groupNetSalesAmount(group),
      };
    });
  }, [orders]);

  const dateOptions = useMemo(() => {
    const map = new Map<string, string>();

    broadcasts.forEach((broadcast) => {
      const sourceDate = broadcast.started_at || broadcast.created_at;
      const key = toDateKey(sourceDate);
      if (!key) return;

      const title = broadcast.public_title || broadcast.admin_subtitle || "방송제목 없음";
      map.set(key, `${formatDateLabel(sourceDate)} ${title}`);
    });

    orderGroups.forEach((group) => {
      const key = toDateKey(group.first.created_at);
      if (!key || map.has(key)) return;
      map.set(key, `${formatDateLabel(group.first.created_at)} 방송없음`);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [broadcasts, orderGroups]);

  useEffect(() => {
    if (!dateFilter && dateOptions.length > 0) {
      setDateFilter(dateOptions[0].value);
    }
  }, [dateOptions, dateFilter]);

  const filteredOrderGroups = useMemo(() => {
    const word = keyword.trim().toLowerCase();

    return orderGroups.filter((group) => {
      const status = getOrderStatusValue(group.first);
      const payment = group.first.payment_method || "미설정";
      const selectedStatusFilters = statusFilter
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);
      const selectedPaymentFilters = paymentFilter
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);

      const normalizeFilterText = (value: unknown) =>
        String(value || "")
          .replace(/\\s+/g, "")
          .replace(/[()]/g, "")
          .toLowerCase();

      const includesAnyText = (actualValue: unknown, words: string[]) => {
        const normalizedActual = normalizeFilterText(actualValue);
        return words.some((word) => normalizedActual.includes(normalizeFilterText(word)));
      };

      const getSimpleStatusBucket = () => {
        if (includesAnyText(status, ["취소", "환불", "주문취소", "주문서취소"])) return "canceled";
        if (includesAnyText(status, ["출고완료", "배송완료"])) return "shipped";
        if (includesAnyText(status, ["출고준비", "출고대기", "포장전", "포장완료", "미설정", "-"])) return "ready";
        if (includesAnyText(status, ["미결제", "미입금", "입금대기", "확인대기"])) return "unpaid";
        if (includesAnyText(status, ["결제완료", "입금확인"])) return "paid";
        if (includesAnyText(payment, ["미결제", "미입금", "입금대기", "링크대기"])) return "unpaid";
        if (includesAnyText(payment, ["결제완료", "입금확인"])) return "paid";
        return "ready";
      };

      const getSimplePaymentBucket = () => {
        const methodText = `${group.first.payment_method || ""} ${payment || ""}`;
        if (includesAnyText(methodText, ["카드", "링크"])) return "card";
        if (includesAnyText(methodText, ["무통장", "입금", "계좌"])) return "bank";
        return "bank";
      };

      const statusBucket = getSimpleStatusBucket();
      const paymentBucket = getSimplePaymentBucket();

      const matchStatus =
        selectedStatusFilters.length === 0 ||
        selectedStatusFilters.includes("all") ||
        selectedStatusFilters.includes("전체") ||
        selectedStatusFilters.includes(statusBucket);

      const matchPayment =
        selectedPaymentFilters.length === 0 ||
        selectedPaymentFilters.includes("all") ||
        selectedPaymentFilters.includes("전체") ||
        selectedPaymentFilters.includes(paymentBucket);
      const isAllDateFilter =
        !dateFilter ||
        dateFilter === "all" ||
        dateFilter === "전체" ||
        dateFilter === "방송 전체보기";
      const matchDate = isAllDateFilter || (!dateFilter || toDateKey(group.first.created_at) === dateFilter);

      const target = [
        group.groupId,
        group.first.order_lookup_code,
        group.first.youtube_nickname,
        group.first.customer_name,
        displayOrderPhone(group.first),
        orderPhoneDigits(group.first),
        group.first.phone,
        group.first.customer_phone,
        group.first.payment_method,
        ...group.rows.map((row) => `${row.product_name} ${row.color} ${row.size} ${displayOrderPhone(row)} ${orderPhoneDigits(row)}`),
      ].filter(Boolean).join(" ").toLowerCase();

      return matchStatus && matchPayment && matchDate && (!word || target.includes(word));
    });
  }, [orderGroups, keyword, statusFilter, paymentFilter, dateFilter]);

  const rosenShippingOrderGroups = useMemo(() => {
    const dateRows = orders.filter((order) => !dateFilter || toDateKey(order.created_at) === dateFilter);

    // 송장관리 전용: 어떤 기준으로도 합치지 않습니다.
    // DB 주문행 1개 = 로젠 엑셀 1줄입니다.
    // 같은 고객/전화/주소/order_group_id/order_lookup_code여도 그대로 각각 출력합니다.
    return buildRosenOrderFormGroups(dateRows);
  }, [orders, dateFilter]);

  const settingsSummary = useMemo(() => ({
    customerCardRate: readSettingNumber(settings, "customer_card_extra_rate", 10),
    actualCardRate: readSettingNumber(settings, "actual_card_fee_rate", 7),
    defaultShippingFee: readSettingNumber(settings, "default_shipping_fee", 4000),
    remoteAreaShippingFee: readSettingNumber(settings, "remote_area_shipping_fee", 6000),
  }), [settings]);

  const summaryCards = useMemo(() => {
    const notCanceled = filteredOrderGroups.filter((group) => !isOrderCanceled(group.first));

    const totalOrderProductQty = filteredOrderGroups.reduce((sum, group) => sum + group.totalQty, 0);
    const totalOrderCount = filteredOrderGroups.length;
    const totalOrderAmount = notCanceled.reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

    const bankPaid = filteredOrderGroups.filter((group) => isBankPaid(group.first)).length;
    const bankUnpaid = filteredOrderGroups.filter((group) => isBankUnpaid(group.first)).length;
    const cardPaid = filteredOrderGroups.filter((group) => isCardPaid(group.first)).length;
    const cardUnpaid = filteredOrderGroups.filter((group) => isCardUnpaid(group.first)).length;
    const canceledAmount = filteredOrderGroups.reduce((sum, group) => sum + groupCanceledAmount(group), 0);

    return {
      totalOrderProductQty,
      totalOrderCount,
      totalOrderAmount,
      bankPaid,
      bankUnpaid,
      cardPaid,
      cardUnpaid,
      canceledAmount,
    };
  }, [filteredOrderGroups]);

  const sideSummary = useMemo(() => {
    const buyerMap = new Map<string, { name: string; amount: number; count: number }>();
    const productMap = new Map<string, { name: string; qty: number; amount: number }>();

    filteredOrderGroups.forEach((group) => {
      if (isOrderCanceled(group.first)) return;

      const nickname = group.first.youtube_nickname || group.first.customer_name || "이름없음";
      const currentBuyer = buyerMap.get(nickname) || { name: nickname, amount: 0, count: 0 };
      currentBuyer.amount += group.totalAmount;
      currentBuyer.count += 1;
      buyerMap.set(nickname, currentBuyer);

      group.rows.forEach((row) => {
        const productName = row.product_name || "상품명 없음";
        const currentProduct = productMap.get(productName) || { name: productName, qty: 0, amount: 0 };
        currentProduct.qty += Number(row.qty || 0);
        currentProduct.amount += orderNetSalesAmount(row);
        productMap.set(productName, currentProduct);
      });
    });

    return {
      buyerRanking: Array.from(buyerMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 7),
      productRanking: Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 7),
    };
  }, [filteredOrderGroups]);

  const totalPages = Math.max(1, Math.ceil(filteredOrderGroups.length / PAGE_SIZE));
  const pagedGroups = filteredOrderGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleOrderDetail = (groupId: string) => {
    setOpenedOrderGroupIds((prev) => prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  };

  const loadDepositsFromServer = async () => {
    const response = await fetch("/api/admin-v2/deposits", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      alert("입금내역 불러오기 실패\n\n" + (result?.message || "알 수 없는 오류"));
      return;
    }

    setDeposits((result.deposits || []) as DepositRow[]);
  };

  const syncBankdaDeposits = async () => {
    const response = await fetch("/api/bankda/sync-deposits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      alert("뱅크다 입금내역 새로고침 실패\n\n" + (result?.message || "알 수 없는 오류"));
      return;
    }

    await loadData();
    await loadDepositsFromServer();

    alert(
      [
        "뱅크다 입금내역 새로고침 완료",
        "",
        `조회: ${result.fetchedCount || 0}건`,
        `신규저장: ${result.insertedCount || 0}건`,
        `중복제외: ${result.skippedCount || 0}건`,
        ...(result.bankdaDescription ? ["", `뱅크다 안내: ${result.bankdaDescription}`] : []),
      ].join("\n")
    );
  };

  const handleManualPaymentConfirm = async (group: OrderGroup, deposit: DepositRow) => {
    const ids = group.rows.map((row) => row.id).filter(Boolean);
    const nowIso = new Date().toISOString();

    if (ids.length === 0) {
      alert("입금확인 처리할 주문 ID가 없습니다.");
      return;
    }

    const changedRows = group.rows.filter((row) => getOrderStatusValue(row) !== "입금확인");

    const statusLogPayloads = changedRows.map((row) => {
      const beforeStatus = getOrderStatusValue(row);

      return {
        order_id: row.id,
        order_group_id: row.order_group_id,
        order_lookup_code: row.order_lookup_code,
        changed_by: "admin-v2",
        change_source: "admin-v2-manual-payment-match",
        before_status: beforeStatus,
        after_status: "입금확인",
        before_order_manage_status: row.order_manage_status || beforeStatus,
        after_order_manage_status: "입금확인",
        payment_method: row.payment_method || "",
        deposit_confirmed_at_before: row.deposit_confirmed_at || "",
        deposit_confirmed_at_after: row.deposit_confirmed_at || nowIso,
        snapshot_before: {
          id: row.id,
          admin_order_status_v2: row.admin_order_status_v2,
          order_manage_status: row.order_manage_status,
          payment_method: row.payment_method,
          deposit_confirmed_at: row.deposit_confirmed_at,
          matched_deposit_id: deposit.id,
        },
        snapshot_after: {
          id: row.id,
          admin_order_status_v2: "입금확인",
          order_manage_status: "입금확인",
          payment_method: row.payment_method,
          deposit_confirmed_at: row.deposit_confirmed_at || nowIso,
          matched_deposit_id: deposit.id,
        },
      };
    });

    setOrders((prev) =>
      prev.map((order) =>
        ids.includes(order.id)
          ? {
              ...order,
              admin_order_status_v2: "입금확인",
              order_manage_status: "입금확인",
              deposit_confirmed_at: order.deposit_confirmed_at || nowIso,
            }
          : order
      )
    );

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        admin_order_status_v2: "입금확인",
        order_manage_status: "입금확인",
        deposit_confirmed_at: nowIso,
      })
      .in("id", ids);

    if (orderError) {
      alert("수동 입금확인 처리 실패\n\n" + orderError.message);
      await loadData();
      return;
    }

    const { error: depositError } = await supabase
      .from("deposits")
      .update({
        match_order_group_id: group.groupId,
        match_customer_id: group.first.customer_id,
        match_status: "수동입금확인",
        confirmed_at: nowIso,
        confirmed_note: `관리자 수동매칭 / 주문 ${group.groupId}`,
      })
      .eq("id", deposit.id);

    if (depositError) {
      alert("주문은 입금확인 처리됐지만 입금내역 연결 저장에 실패했습니다.\n\n" + depositError.message);
      await loadData();
      return;
    }

    if (statusLogPayloads.length > 0) {
      const { error: logError } = await supabase.rpc("insert_order_status_change_logs_for_admin_v2", {
        p_logs: statusLogPayloads,
      });

      if (logError) {
        alert("입금확인은 처리됐지만 상태변경이력 저장에 실패했습니다.\n\n" + logError.message);
        await loadData();
        return;
      }
    }

    await loadData();
    alert("수동 입금확인 처리가 완료되었습니다.");
  };

  const updateOrderStatus = async (group: OrderGroup, nextStatus: string) => {
    const ids = group.rows.map((row) => row.id).filter(Boolean);
    const nowIso = new Date().toISOString();

    const changedRows = group.rows.filter((row) => getOrderStatusValue(row) !== nextStatus);

    if (changedRows.length === 0) {
      return;
    }

    const shouldSaveDepositConfirmedAt = nextStatus === "입금확인";
    const shouldSaveShippedAt = nextStatus === "출고완료";

    if (shouldSaveShippedAt) {
      const hasTrackingNumber = group.rows.some((row) => String(row.tracking_number || "").trim());
      if (!hasTrackingNumber) {
        const ok = confirm(
          "송장번호가 아직 없습니다.\n\n그래도 출고완료로 변경할까요?\n출고시간은 저장되고, 송장번호는 나중에 상세보기에서 입력할 수 있습니다."
        );
        if (!ok) return;
      }
    }

    const updatePayload: Partial<OrderRow> = {
      admin_order_status_v2: nextStatus,
      order_manage_status: nextStatus,
    };

    // 입금확인 시간을 처음 처리한 시점으로 보존하기 위해,
    // 이미 deposit_confirmed_at 이 있는 주문은 덮어쓰지 않습니다.
    if (shouldSaveDepositConfirmedAt) {
      const needsDepositTime = group.rows.some((row) => !row.deposit_confirmed_at);
      if (needsDepositTime) {
        updatePayload.deposit_confirmed_at = nowIso;
      }
    }

    // 출고완료 시간을 처음 처리한 시점으로 보존하기 위해,
    // 이미 shipped_at 이 있는 주문은 덮어쓰지 않습니다.
    if (shouldSaveShippedAt) {
      const needsShippedTime = group.rows.some((row) => !row.shipped_at);
      if (needsShippedTime) {
        updatePayload.shipped_at = nowIso;
      }
    }

    const statusLogPayloads = changedRows.map((row) => {
      const beforeStatus = getOrderStatusValue(row);
      const depositConfirmedAtAfter =
        shouldSaveDepositConfirmedAt && !row.deposit_confirmed_at
          ? nowIso
          : row.deposit_confirmed_at;
      const shippedAtAfter =
        shouldSaveShippedAt && !row.shipped_at
          ? nowIso
          : row.shipped_at;

      return {
        order_id: row.id,
        order_group_id: row.order_group_id,
        order_lookup_code: row.order_lookup_code,
        changed_by: "admin-v2",
        change_source: "admin-v2-status-change",
        before_status: beforeStatus,
        after_status: nextStatus,
        before_order_manage_status: row.order_manage_status || beforeStatus,
        after_order_manage_status: nextStatus,
        payment_method: row.payment_method || "",
        deposit_confirmed_at_before: row.deposit_confirmed_at || "",
        deposit_confirmed_at_after: depositConfirmedAtAfter || "",
        snapshot_before: {
          id: row.id,
          admin_order_status_v2: row.admin_order_status_v2,
          order_manage_status: row.order_manage_status,
          payment_method: row.payment_method,
          deposit_confirmed_at: row.deposit_confirmed_at,
          shipped_at: row.shipped_at,
          tracking_company: row.tracking_company,
          tracking_number: row.tracking_number,
        },
        snapshot_after: {
          id: row.id,
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
          payment_method: row.payment_method,
          deposit_confirmed_at: depositConfirmedAtAfter,
          shipped_at: shippedAtAfter,
          tracking_company: row.tracking_company,
          tracking_number: row.tracking_number,
        },
      };
    });

    setOrders((prev) =>
      prev.map((order) => {
        if (!ids.includes(order.id)) return order;

        return {
          ...order,
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
          deposit_confirmed_at:
            shouldSaveDepositConfirmedAt && !order.deposit_confirmed_at
              ? nowIso
              : order.deposit_confirmed_at,
          shipped_at:
            shouldSaveShippedAt && !order.shipped_at
              ? nowIso
              : order.shipped_at,
        };
      })
    );

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .in("id", ids);

    if (error) {
      alert("상태 변경 실패\n\n" + error.message);
      await loadData();
      return;
    }

    const { error: logError } = await supabase.rpc("insert_order_status_change_logs_for_admin_v2", {
      p_logs: statusLogPayloads,
    });

    if (logError) {
      alert("상태는 변경됐지만 상태변경이력 저장에 실패했습니다.\n\n" + logError.message);
      await loadData();
      return;
    }

    const { data: latestStatusLogs, error: latestStatusLogsError } = await supabase
      .rpc("get_order_status_change_logs_for_admin_v2");

    if (latestStatusLogsError) {
      alert("상태변경이력 재조회에 실패했습니다.\n\n" + latestStatusLogsError.message);
    } else {
      setStatusChangeLogs((latestStatusLogs || []) as StatusChangeLogRow[]);
    }
  };

  const bulkMarkShippingDoneFromExcel = async (_previewRows: RosenShippingPreviewRow[]) => {
    alert(
      "송장 업로드/재업로드/사이트 출고반영 기능은 사용하지 않습니다.\n\n로젠 송장은 사이트에서 다운로드만 하고, 실제 합배송/송장처리는 로젠 프로그램에서 진행해주세요."
    );
  };

  const updateOrderTracking = async (group: OrderGroup, trackingCompany: string, trackingNumber: string) => {
    const cleanCompany = String(trackingCompany || "").trim() || "로젠";
    const cleanNumber = String(trackingNumber || "").trim().replace(/\s+/g, "");

    if (!cleanCompany) {
      alert("택배사를 입력해주세요.");
      return;
    }

    if (cleanNumber.length < 4) {
      alert("송장번호를 정확히 입력해주세요.");
      return;
    }

    const ids = group.rows.map((row) => row.id).filter(Boolean);
    const ok = confirm(
      `송장정보를 저장할까요?\n\n택배사: ${cleanCompany}\n송장번호: ${cleanNumber}\n\n같은 주문묶음 ${ids.length}개 행에 동일하게 저장됩니다.`
    );

    if (!ok) return;

    setOrders((prev) =>
      prev.map((order) =>
        ids.includes(order.id)
          ? {
              ...order,
              tracking_company: cleanCompany,
              tracking_number: cleanNumber,
            }
          : order
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({
        tracking_company: cleanCompany,
        tracking_number: cleanNumber,
      })
      .in("id", ids);

    if (error) {
      alert("송장정보 저장 실패\n\n" + error.message);
      await loadData();
      return;
    }

    alert("송장정보가 저장되었습니다.");
  };

  const updateOrderFinalAmount = async (row: OrderRow, nextAmount: number, reason: string) => {
    const cleanReason = reason.trim();
    const beforeAmount = orderBaseAmount(row);

    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      alert("최종정산금액을 정확히 입력해주세요.");
      return;
    }

    if (!cleanReason || cleanReason.length < 2) {
      alert("금액 수정 사유를 2글자 이상 입력해주세요.\n예: 부분환불, 금액오입력, 배송비조정");
      return;
    }

    if (beforeAmount === nextAmount) {
      alert("현재 기준금액과 동일합니다. 수정할 금액을 다시 확인해주세요.");
      return;
    }

    const ok = confirm(
      `최종정산금액을 수정할까요?

이전: ${beforeAmount.toLocaleString()}원
변경: ${nextAmount.toLocaleString()}원
사유: ${cleanReason}

수정이력에 기록됩니다.`
    );

    if (!ok) return;

    const { data, error } = await supabase.rpc("update_order_final_amount_with_log", {
      p_order_id: row.id,
      p_final_amount: nextAmount,
      p_reason: cleanReason,
      p_editor: "admin-v2",
    });

    if (error) {
      alert(
        "금액 수정 실패\n\n" +
          error.message +
          "\n\n먼저 Supabase SQL Editor에서 money_log_sql_setup.sql을 실행했는지 확인해주세요."
      );
      return;
    }

    const updatedRow = Array.isArray(data) ? data[0] : data;

    setOrders((prev) =>
      prev.map((order) =>
        order.id === row.id
          ? {
              ...order,
              final_amount: Number(updatedRow?.final_amount ?? nextAmount),
              admin_price_memo: String(updatedRow?.admin_price_memo ?? cleanReason),
            }
          : order
      )
    );

    const { data: latestLogs, error: latestLogsError } = await supabase
      .rpc("get_order_money_edit_logs_for_admin_v2");

    if (latestLogsError) {
      alert("금액수정은 저장됐지만 이력 재조회에 실패했습니다.\n\n" + latestLogsError.message);
    } else {
      setMoneyEditLogs((latestLogs || []) as MoneyEditLogRow[]);
    }

    alert("최종정산금액 수정 및 이력 저장이 완료되었습니다.");
  };

  const saveSetting = async (key: string, value: string) => {
    const { data, error: selectError } = await supabase.from("settings").select("id").eq("key", key).limit(1);
    if (selectError) return alert("설정 확인 실패\n\n" + selectError.message);

    const existing = data?.[0];
    const result = existing?.id
      ? await supabase.from("settings").update({ value }).eq("id", existing.id)
      : await supabase.from("settings").insert({ key, value });

    if (result.error) return alert("설정 저장 실패\n\n" + result.error.message);
    await loadData();
  };

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 bg-neutral-950 p-4 text-white md:flex md:flex-col">
          <div className="mb-5">
<div className="mt-2 text-xl font-black">루루동이 운영센터</div>
            <div className="mt-1 text-xs font-semibold text-neutral-400">실무형 주문 작업판</div>
          </div>

          <nav className="grid gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-3 py-2 text-left transition ${
                  activeTab === tab.key ? "bg-white text-neutral-950" : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="text-[15px] font-black">{tab.label}</div>
                <div className="text-[10px] font-semibold text-neutral-500">{tab.desc}</div>
              </button>
            ))}
          </nav>

          <div className="mt-auto grid gap-2 text-xs font-bold">
            <Link href="/admin" className="rounded-xl bg-white/10 p-2 text-neutral-300">기존 관리자</Link>
            <Link href="/" className="rounded-xl bg-white/10 p-2 text-neutral-300">고객페이지</Link>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-3">
          <div className="w-full rounded-xl border border-neutral-200 bg-white">
            <div>
<div className="text-lg font-black">{TABS.find((tab) => tab.key === activeTab)?.label}</div>
            </div>
            
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1.5 md:hidden">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-2 py-2 text-xs font-black ${activeTab === tab.key ? "bg-neutral-950 text-white" : "bg-white text-neutral-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center font-black text-neutral-500">불러오는 중...</div>
          ) : (
            <>
              <SummaryCards summaryCards={summaryCards} />

              {activeTab === "shipping" ? (
                <ShippingPanel
                  orderGroups={rosenShippingOrderGroups}
                  orders={orders}
                  dateOptions={dateOptions}
                  dateFilter={dateFilter}
                  setDateFilter={setDateFilter}
                  onApplyShippingDone={bulkMarkShippingDoneFromExcel}
                />
              ) : activeTab === "customers" ? (
                <CustomerPanel customers={customers} />
              ) : activeTab === "deposits" ? (
                <PaymentMatchPanel
                  deposits={deposits}
                  orderGroups={filteredOrderGroups}
                  onOpenManualMatch={setManualMatchGroup}
                  onSyncBankdaDeposits={syncBankdaDeposits}
                />
              ) : activeTab === "settlement" ? (
                <SettlementPanel
                  orderGroups={filteredOrderGroups}
                  deposits={deposits}
                  actualCardRate={settingsSummary.actualCardRate}
                  selectedDateKey={dateFilter}
                  dateLabel={dateOptions.find((item) => item.value === dateFilter)?.label || "최근 기준"}
                  buyerRanking={sideSummary.buyerRanking}
                  productRanking={sideSummary.productRanking}
                />
              ) : activeTab === "settings" ? (
                <SettingsPanel settingsSummary={settingsSummary} saveSetting={saveSetting} />
              ) : (
                <>
                  <FilterBar
                    pendingKeyword={pendingKeyword}
                    setPendingKeyword={setPendingKeyword}
                    onSearch={() => setKeyword(pendingKeyword)}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    paymentFilter={paymentFilter}
                    setPaymentFilter={setPaymentFilter}
                    dateFilter={dateFilter}
                    setDateFilter={setDateFilter}
                    dateOptions={dateOptions}
                  />

                  <div className="grid gap-3 xl:grid-cols-[minmax(780px,1fr)_340px]">
                    <div className="min-w-0">
                      <OrderWorkTable groups={pagedGroups} openedOrderGroupIds={openedOrderGroupIds} moneyEditLogs={moneyEditLogs} statusChangeLogs={statusChangeLogs} onToggle={toggleOrderDetail} onStatusChange={updateOrderStatus} onTrackingChange={updateOrderTracking} onFinalAmountChange={updateOrderFinalAmount} onOpenManualMatch={setManualMatchGroup} />
                      <Pagination page={page} totalPages={totalPages} setPage={setPage} totalCount={filteredOrderGroups.length} />
                    </div>
                    {false ? <OperationSummary buyerRanking={sideSummary.buyerRanking} productRanking={sideSummary.productRanking} onMore={() => setActiveTab("settlement")} /> : null}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <ManualPaymentMatchDrawer
        group={manualMatchGroup}
        deposits={deposits}
        onClose={() => setManualMatchGroup(null)}
        onConfirm={handleManualPaymentConfirm}
      />
    </main>
  );
}

function ShippingPanel({
  orderGroups,
  orders,
  dateOptions,
  dateFilter,
  setDateFilter,
  onApplyShippingDone,
}: {
  orderGroups: OrderGroup[];
  orders: OrderRow[];
  dateOptions: Array<{ value: string; label: string }>;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  onApplyShippingDone: (previewRows: RosenShippingPreviewRow[]) => Promise<void>;
}) {
  const [previewRows, setPreviewRows] = useState<RosenShippingPreviewRow[]>([]);
  const [previewFileName, setPreviewFileName] = useState("");
  const [applying, setApplying] = useState(false);

  const downloadTargets = useMemo(() => {
    return orderGroups.filter((group) => !getShippingDownloadBlockReason(group));
  }, [orderGroups]);

  const blockedDownloadGroups = useMemo(() => {
    return orderGroups
      .map((group) => ({ group, reason: getShippingDownloadBlockReason(group) }))
      .filter((item) => item.reason);
  }, [orderGroups]);

  const previewSummary = useMemo(() => ({
    ready: previewRows.filter((row) => row.status === "ready").length,
    check: previewRows.filter((row) => row.status === "check").length,
    blocked: previewRows.filter((row) => row.status === "blocked").length,
  }), [previewRows]);

  const getRosenDownloadRows = () => {
    if (downloadTargets.length === 0) {
      alert("다운로드할 출고대기 주문이 없습니다.\n\n출고대기 상태, 수하인명, 전화번호, 주소를 확인해주세요.");
      return null;
    }

    return downloadTargets.map((group) => buildRosenUploadRow(group));
  };

  const downloadRosenExcel = async () => {
    const excelRows = getRosenDownloadRows();
    if (!excelRows) return;

    const dateStamp = (dateFilter || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, "");

    try {
      const blob = await buildRosenTemplateWorkbookBlob(excelRows);
      downloadBlobFile(`ruru_rosen_upload_${dateStamp}.xlsx`, blob);
    } catch (error) {
      alert(
        "로젠 템플릿 xlsx 생성에 실패했습니다.\n\n" +
          (error instanceof Error ? error.message : String(error)) +
          "\n\n우선 복사용 TSV 파일로 내려받습니다. 로젠 템플릿을 열고 A1부터 붙여넣어주세요."
      );

      downloadTextFile(
        `ruru_rosen_copy_${dateStamp}.tsv`,
        buildRosenCopyTsv(excelRows),
        "text/tab-separated-values;charset=utf-8"
      );
    }
  };

  const downloadRosenCopyTsv = () => {
    const excelRows = getRosenDownloadRows();
    if (!excelRows) return;

    const dateStamp = (dateFilter || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, "");
    downloadTextFile(
      `ruru_rosen_copy_${dateStamp}.tsv`,
      buildRosenCopyTsv(excelRows),
      "text/tab-separated-values;charset=utf-8"
    );
  };

  const handleUploadOriginalExcel = async (file: File | null) => {
    if (!file) return;

    try {
      const rows = await extractRowsFromUploadedFile(file);
      const nextPreviewRows = buildRosenShippingPreviewRows(rows, orders);

      if (nextPreviewRows.length === 0) {
        alert("읽을 수 있는 R 주문키가 없습니다.\n\n사이트에서 다운로드했던 로젠 송장 다운로드용 원본 xlsx/tsv 파일을 다시 올렸는지 확인해주세요.");
        return;
      }

      setPreviewRows(nextPreviewRows);
      setPreviewFileName(file.name);
    } catch (error) {
      alert("엑셀 읽기 실패\n\n" + (error instanceof Error ? error.message : String(error)));
    }
  };

  const applyReadyRows = async () => {
    setApplying(true);
    try {
      await onApplyShippingDone(previewRows);
      setPreviewRows([]);
      setPreviewFileName("");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid w-full gap-3">
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[17px] font-black">🚚 송장관리 1차</div>
            <div className="mt-1 text-[12px] font-bold text-neutral-500">
              public/templates/rozen_template.xlsx 원본 양식에 맞춰 로젠 송장 다운로드용 xlsx를 생성합니다. 송장관리에서는 어떤 기준으로도 합치지 않습니다. DB 주문행 1개를 로젠 엑셀 1줄로 그대로 내보냅니다. 같은 고객/전화/주소/order_lookup_code여도 사이트에서 합치지 않습니다. 사이트에서는 DB 주문행 1개를 로젠 엑셀 1줄로 그대로 내보내며, 로젠 프로그램이 동일 수하인 자동합배송을 처리합니다.
            </div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
            I열 상품 사이 쉼표 · 총수량 없음 · K열 배송메모 전용
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(240px,360px)_1fr_220px] lg:items-end">
          <div>
            <div className="mb-1 text-[12px] font-black text-neutral-500">다운로드 기준 날짜</div>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-neutral-950"
            >
              {dateOptions.length === 0 ? <option value="">방송/날짜 없음</option> : null}
              {dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SummaryCard label="다운로드 가능 주문서" value={`${downloadTargets.length}건`} />
            <SummaryCard label="제외/확인" value={`${blockedDownloadGroups.length}건`} strong={blockedDownloadGroups.length > 0} />
            <SummaryCard label="현재 날짜 주문" value={`${orderGroups.length}건`} />
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={downloadRosenExcel}
              className="h-10 rounded-lg bg-neutral-950 px-3 text-[14px] font-black text-white hover:bg-neutral-800"
            >
              로젠 템플릿 xlsx 다운로드
            </button>
            <button
              type="button"
              onClick={downloadRosenCopyTsv}
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-[13px] font-black text-neutral-800 hover:bg-neutral-50"
            >
              복붙용 TSV 다운로드
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-900">
          <RosenExportOnlyNotice />

          ⚠️ 사이트에서는 송장을 절대 합치지 않습니다. 같은 고객/전화/주소/order_lookup_code라도 DB 주문행마다 각각 한 줄로 내려갑니다. 다운로드한 파일은 로젠 프로그램에서 송장 출력용으로만 사용하세요. 사이트에는 다시 업로드하지 않습니다. 동일 수하인 자동합배송은 로젠 프로그램이 처리합니다. TSV는 템플릿 A1부터 붙여넣기용입니다.
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">1차 출고완료 반영</div>
            <div className="mt-1 text-[12px] font-bold text-neutral-500">
              처음 다운로드했던 로젠 송장 다운로드용 xlsx/tsv 파일을 다시 올리면 B열 R 주문키를 읽어 미리보기합니다.
            </div>
          </div>
          <label className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] font-black text-neutral-800 hover:bg-neutral-50">
            원본 엑셀 업로드
            <input
              type="file"
              accept=".xlsx,.xls,.html,.txt,.csv,.tsv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                event.currentTarget.value = "";
                handleUploadOriginalExcel(file);
              }}
            />
          </label>
        </div>

        {previewRows.length === 0 ? (
          <div className="rounded-xl bg-neutral-50 p-5 text-center text-[13px] font-bold text-neutral-500">
            아직 업로드된 원본 엑셀이 없습니다.
          </div>
        ) : (
          <div className="grid w-full gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 p-3">
              <div className="text-[13px] font-black text-neutral-700">파일: {previewFileName || "-"}</div>
              <div className="flex flex-wrap gap-1.5 text-[12px] font-black">
                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">다운로드가능 {previewSummary.ready}건</span>
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">확인필요 {previewSummary.check}건</span>
                <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700">다운로드제외 {previewSummary.blocked}건</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <div className="hidden grid-cols-[54px_110px_120px_126px_minmax(220px,1fr)_106px_minmax(220px,1.2fr)] bg-neutral-950 px-3 py-2 text-[12px] font-black text-white lg:grid">
                <div>행</div>
                <div>결과</div>
                <div>고객</div>
                <div>전화</div>
                <div>상품</div>
                <div>주문ID</div>
                <div>메시지</div>
              </div>

              {previewRows.map((row) => (
                <div key={`${row.rowNumber}-${row.key}`} className="grid gap-1 border-t border-neutral-100 px-3 py-2 text-[12px] font-bold first:border-t-0 lg:grid-cols-[54px_110px_120px_126px_minmax(220px,1fr)_106px_minmax(220px,1.2fr)] lg:items-center">
                  <div className="font-black text-neutral-500">{row.rowNumber}</div>
                  <div>
                    <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-black ${getShippingPreviewClass(row.status)}`}>
                      {getShippingPreviewLabel(row.status)}
                    </span>
                  </div>
                  <div className="truncate font-black">{row.customerName || "-"}</div>
                  <div className="truncate text-neutral-600">{row.phone || "-"}</div>
                  <div className="truncate text-neutral-700">{row.itemSummary || "-"}</div>
                  <div className="truncate text-neutral-500">{row.orderIds.join(",") || "-"}</div>
                  <div className="text-neutral-600">{row.message}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-[12px] font-bold text-neutral-500">
                다운로드가능 항목만 출고완료 처리합니다. 확인필요/다운로드제외은 자동처리하지 않습니다.
              </div>
              <button
                type="button"
                onClick={applyReadyRows}
                disabled={applying || previewSummary.ready === 0}
                className="rounded-lg bg-neutral-950 px-4 py-2 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {applying ? "반영중" : `다운로드가능 ${previewSummary.ready}건 출고완료 처리`}
              </button>
            </div>
          </div>
        )}
      </div>

      {blockedDownloadGroups.length > 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="mb-2 text-[15px] font-black">다운로드 제외/확인 필요</div>
          <div className="grid gap-1.5">
            {blockedDownloadGroups.slice(0, 30).map(({ group, reason }) => (
              <div key={group.groupId} className="grid gap-1 rounded-lg bg-neutral-50 px-3 py-2 text-[12px] font-bold text-neutral-600 md:grid-cols-[90px_120px_1fr_160px] md:items-center">
                <div className="font-black text-neutral-500">{shortOrderCode(group)}</div>
                <div>{group.first.youtube_nickname || group.first.customer_name || "-"}</div>
                <div className="truncate">{buildItemSummary(group)}</div>
                <div className="font-black text-red-700">{reason}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCards({
  summaryCards,
}: {
  summaryCards: {
    totalOrderProductQty: number;
    totalOrderCount: number;
    totalOrderAmount: number;
    bankPaid: number;
    bankUnpaid: number;
    cardPaid: number;
    cardUnpaid: number;
    canceledAmount: number;
  };
}) {
  return <AdminOrderTopSummary summaryCards={summaryCards} />;
}

function SummaryCard({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 text-center ${strong ? "border-neutral-950" : "border-neutral-200"}`}>
      <div className="text-[12px] font-black text-neutral-500">{label}</div>
      <div className="mt-1 text-[16px] font-black tracking-tight text-neutral-950">{value}</div>
    </div>
  );
}

function FilterBar({
  pendingKeyword,
  setPendingKeyword,
  onSearch,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  dateFilter,
  setDateFilter,
  dateOptions,
}: {
  pendingKeyword: string;
  setPendingKeyword: (value: string) => void;
  onSearch: () => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  paymentFilter: string;
  setPaymentFilter: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  dateOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <AdminOrderFilterBar
      pendingKeyword={pendingKeyword}
      setPendingKeyword={setPendingKeyword}
      onSearch={onSearch}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      paymentFilter={paymentFilter}
      setPaymentFilter={setPaymentFilter}
      dateFilter={dateFilter}
      setDateFilter={setDateFilter}
      dateOptions={dateOptions}
    />
  );
}
function OperationSummary({
  buyerRanking,
  productRanking,
  onMore,
}: {
  buyerRanking: Array<{ name: string; amount: number; count: number }>;
  productRanking: Array<{ name: string; qty: number; amount: number }>;
  onMore: () => void;
}) {
  return (
    <aside className="grid content-start gap-2">
      <SidePanel title="👑 최대구매자 랭킹" onMore={onMore}>
        <RankingList items={buyerRanking.map((item) => ({ title: item.name, sub: `${item.count}건`, right: money(item.amount) }))} />
      </SidePanel>

      <SidePanel title="👍 많이 팔린 상품" onMore={onMore}>
        <RankingList items={productRanking.map((item) => ({ title: item.name, sub: "", right: `${item.qty}개` }))} />
      </SidePanel>
    </aside>
  );
}

function OrderWorkTable({
  groups,
  openedOrderGroupIds,
  moneyEditLogs,
  statusChangeLogs,
  onToggle,
  onStatusChange,
  onTrackingChange,
  onFinalAmountChange,
  onOpenManualMatch,
}: {
  groups: OrderGroup[];
  openedOrderGroupIds: string[];
  moneyEditLogs: MoneyEditLogRow[];
  statusChangeLogs: StatusChangeLogRow[];
  onToggle: (groupId: string) => void;
  onStatusChange: (group: OrderGroup, status: string) => void;
  onTrackingChange: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
  onFinalAmountChange: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
  onOpenManualMatch: (group: OrderGroup) => void;
}) {

  const [selectedOrderGroupIds, setSelectedOrderGroupIds] = useState<string[]>([]);

  const visibleGroupIds = groups.map((group) => group.groupId);
  const selectedGroups = groups.filter((group) => selectedOrderGroupIds.includes(group.groupId));
  const isAllVisibleSelected =
    visibleGroupIds.length > 0 &&
    visibleGroupIds.every((groupId) => selectedOrderGroupIds.includes(groupId));

  const toggleSelectGroup = (groupId: string) => {
    setSelectedOrderGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId]
    );
  };

  const toggleSelectAllVisible = () => {
    setSelectedOrderGroupIds((current) => {
      if (isAllVisibleSelected) {
        return current.filter((groupId) => !visibleGroupIds.includes(groupId));
      }

      return Array.from(new Set([...current, ...visibleGroupIds]));
    });
  };

  const clearSelectedGroups = () => {
    setSelectedOrderGroupIds([]);
  };

  const applyBulkStatus = (nextStatus: string) => {
    if (!nextStatus) return;
    selectedGroups.forEach((group) => onStatusChange(group, nextStatus));
    clearSelectedGroups();
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <AdminOrderBulkActionBar
        selectedCount={selectedOrderGroupIds.length}
        isAllSelected={isAllVisibleSelected}
        onToggleAll={toggleSelectAllVisible}
        onClear={clearSelectedGroups}
        statusOptions={ORDER_STATUS_OPTIONS}
        onApplyStatus={applyBulkStatus}
      />

      <AdminOrderTableHeader
        selectNode={
          <input
            type="checkbox"
            checked={isAllVisibleSelected}
            onChange={toggleSelectAllVisible}
            className="h-4 w-4 accent-blue-600"
            aria-label="현재 목록 전체 선택"
          />
        }
      />

      {groups.map((group) => {
        const isOpen = openedOrderGroupIds.includes(group.groupId);
        const status = getOrderStatusValue(group.first);
        const paymentMeta = paymentStatusMeta(group.first);
        const rowIds = new Set(group.rows.map((row) => row.id));
        const groupMoneyLogs = moneyEditLogs.filter((log) => rowIds.has(Number(log.order_id)));
        const groupStatusLogs = statusChangeLogs.filter((log) => rowIds.has(Number(log.order_id)));
        const isShippedDone = getOrderStatusValue(group.first) === "출고완료";
        const hasTrackingNumber = group.rows.some((row) => String(row.tracking_number || "").trim());
        const hasShippedAt = group.rows.some((row) => row.shipped_at);

        return (
          <div key={group.groupId} className="border-t border-neutral-100 first:border-t-0">
            <AdminOrderMainRow
              selectNode={
                <input
                  type="checkbox"
                  checked={selectedOrderGroupIds.includes(group.groupId)}
                  onChange={() => toggleSelectGroup(group.groupId)}
                  className="h-4 w-4 accent-blue-600"
                  aria-label={`${shortOrderCode(group)} 선택`}
                />
              }
              orderCode={shortOrderCode(group)}
              createdAtLabel={formatDateLabel(group.first.created_at)}
              nickname={group.first.youtube_nickname || "-"}
              customerLine={`${group.first.customer_name || "-"} · ${displayOrderPhone(group.first)}`}
              itemSummary={buildItemSummary(group)}
              amountNode={
                <AdminOrderAmountCell
                  amountText={money(group.totalAmount)}
                  warningText={groupMoneyLogs.length > 0 ? `금액수정 ${groupMoneyLogs.length}건` : ""}
                />
              }
              paymentNode={
                <AdminOrderPaymentCell
                  paymentMethod={group.first.payment_method || "-"}
                  paymentLabel={paymentMeta.label}
                  paymentClassName={paymentMeta.className}
                  isBankUnpaid={isBankUnpaid(group.first)}
                  isBankPaid={isBankPaid(group.first)}
                  onOpenManualMatch={() => onOpenManualMatch(group)}
                />
              }
              statusNode={
                <AdminOrderStatusCell
                  status={status}
                  options={ORDER_STATUS_OPTIONS}
                  className={selectClass(status)}
                  statusLogCount={groupStatusLogs.length}
                  showTrackingMissing={isShippedDone && !hasTrackingNumber}
                  showShippedTimeMissing={isShippedDone && !hasShippedAt}
                  onChange={(nextStatus) => onStatusChange(group, nextStatus)}
                />
              }
              detailNode={
                <AdminOrderDetailButton
                  isOpen={isOpen}
                  onClick={() => onToggle(group.groupId)}
                />
              }
            />

            {isOpen ? <AdminOrderDetailBlock group={group} moneyEditLogs={groupMoneyLogs} statusChangeLogs={groupStatusLogs} onTrackingChange={onTrackingChange} onFinalAmountChange={onFinalAmountChange} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function DetailBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-3 text-xs font-bold text-neutral-700">
      <div className="mb-2 text-[11px] font-black text-neutral-400">{title}</div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Pagination({ page, totalPages, setPage, totalCount }: { page: number; totalPages: number; setPage: (page: number) => void; totalCount: number }) {
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => index + 1);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <div className="text-[13px] font-bold text-neutral-500">총 {totalCount}건 / {page}페이지</div>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-black">이전</button>
        {pages.map((pageNumber) => (
          <button key={pageNumber} onClick={() => setPage(pageNumber)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${page === pageNumber ? "bg-neutral-950 text-white" : "border border-neutral-200 bg-white"}`}>
            {pageNumber}
          </button>
        ))}
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-black">다음</button>
      </div>
    </div>
  );
}

function SidePanel({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-black">{title}</div>
        {onMore ? (
          <button type="button" onClick={onMore} className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px] font-black text-neutral-600">
            더보기
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg bg-neutral-50 p-3 text-center text-xs font-bold text-neutral-400">{text}</div>;
}

function CustomerPanel({ customers }: { customers: CustomerRow[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {customers.map((customer) => {
        const blocked = customer.is_blocked === true || customer.is_blocked === "true" || customer.is_blocked === "Y";
        return (
          <div key={customer.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black">{customer.youtube_nickname || "-"}</div>
                <div className="mt-1 text-[13px] font-bold text-neutral-500">{customer.customer_name || "-"} · {formatKoreanPhone(customer.customer_phone)}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${blocked ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>{blocked ? "차단" : "정상"}</span>
            </div>
            <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-xs font-semibold text-neutral-600">{customer.customer_memo || "메모 없음"}</div>
          </div>
        );
      })}
    </div>
  );
}

function DepositPanel({ deposits }: { deposits: DepositRow[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      {deposits.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-sm font-bold text-neutral-500">아직 deposits 테이블에 저장된 입금내역이 없습니다.</div>
      ) : (
        <div className="grid gap-1">
          {deposits.map((deposit) => (
            <div key={deposit.id} className="grid grid-cols-[1fr_110px_100px] rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <div className="font-black">{deposit.depositor_name}</div>
              <div className="text-right font-black">{money(deposit.amount)}</div>
              <div className="text-center font-bold text-neutral-500">{deposit.match_status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettlementPanel({
  orderGroups,
  deposits,
  actualCardRate,
  selectedDateKey,
  dateLabel,
  buyerRanking,
  productRanking,
}: {
  orderGroups: OrderGroup[];
  deposits: DepositRow[];
  actualCardRate: number;
  selectedDateKey: string;
  dateLabel: string;
  buyerRanking: Array<{ name: string; amount: number; count: number }>;
  productRanking: Array<{ name: string; qty: number; amount: number }>;
}) {
  const activeGroups = orderGroups.filter((group) => !isOrderCanceled(group.first));

  const depositsForDate = deposits.filter((item) => {
    if (!selectedDateKey) return true;
    return toDateKey(item.deposited_time || item.created_at) === selectedDateKey;
  });

  const orderSales = activeGroups.reduce((sum, group) => sum + groupNetSalesAmount(group), 0);
  const grossBaseSales = activeGroups.reduce((sum, group) => sum + groupGrossBaseAmount(group), 0);
  const refundAmount = activeGroups.reduce((sum, group) => sum + groupRefundAmount(group), 0);
  const canceledAmount = orderGroups.reduce((sum, group) => sum + groupCanceledAmount(group), 0);

  const bankConfirmedOrderSales = activeGroups
    .filter((group) => isBankPaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const cardConfirmedOrderSales = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const bankUnpaidOrderSales = activeGroups
    .filter((group) => isBankUnpaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const cardUnpaidOrderSales = activeGroups
    .filter((group) => isCardUnpaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const confirmedBankDeposits = depositsForDate
    .filter((item) => item.match_status === "확인완료")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const actualCardFee = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupActualCardFeeAmount(group, actualCardRate), 0);

  const customerCardExtra = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupCustomerCardExtraAmount(group), 0);

  const cardFeeMargin = customerCardExtra - actualCardFee;
  const expectedConfirmedSales = bankConfirmedOrderSales + cardConfirmedOrderSales;
  const unpaidOrderSales = bankUnpaidOrderSales + cardUnpaidOrderSales;
  const bankDepositDiff = bankConfirmedOrderSales - confirmedBankDeposits;

  return (
    <div className="grid w-full gap-3">
      <div className="rounded-xl border border-neutral-200 bg-white p-3 text-[15px] font-black">
        기준: {dateLabel}
        <div className="mt-1 text-[12px] font-bold text-neutral-500">
          최종 주문매출은 취소 제외 + 환불 차감 후 금액입니다. 환불전 정산금액은 final_amount → adjusted_total_price → total_price 순서로 잡습니다. 카드수수료는 주문 당시 저장된 actual_card_fee_rate_applied를 우선 사용합니다.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryCard label="최종 주문매출" value={money(orderSales)} />
        <SummaryCard label="환불전 정산금액" value={money(grossBaseSales)} />
        <SummaryCard label="무통장 확인" value={money(bankConfirmedOrderSales)} />
        <SummaryCard label="카드 확인" value={money(cardConfirmedOrderSales)} />
        <SummaryCard label="미결제 합계" value={money(unpaidOrderSales)} strong />
        <SummaryCard label="확인입금자료" value={money(confirmedBankDeposits)} />
        <SummaryCard label="무통장 차액" value={money(bankDepositDiff)} strong={bankDepositDiff !== 0} />
        <SummaryCard label="카드 실수수료" value={money(actualCardFee)} />
        <SummaryCard label="카드 추가금" value={money(customerCardExtra)} />
        <SummaryCard label="카드 수수료차익" value={money(cardFeeMargin)} strong={cardFeeMargin < 0} />
        <SummaryCard label="환불금액" value={money(refundAmount)} />
        <SummaryCard label="취소금액" value={money(canceledAmount)} />
        <SummaryCard label="확정매출" value={money(expectedConfirmedSales)} />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-900">
        ⚠️ 환불금액(refund_amount)이 따로 입력되어 있으면 최종정산금액에서 차감합니다. 이미 최종정산금액(final_amount)을 환불 반영 금액으로 낮춘 경우에는 refund_amount를 중복 입력하면 매출이 이중 차감됩니다.
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SidePanel title="👑 최대구매자 전체">
          <RankingList items={buyerRanking.map((item) => ({ title: item.name, sub: `${item.count}건`, right: money(item.amount) }))} />
        </SidePanel>
        <SidePanel title="👍 상품 판매 전체">
          <RankingList items={productRanking.map((item) => ({ title: item.name, sub: "", right: `${item.qty}개` }))} />
        </SidePanel>
      </div>
    </div>
  );
}

function RankingList({ items }: { items: Array<{ title: string; sub: string; right: string }> }) {
  return (
    <div className="grid gap-1.5">
      {items.length === 0 ? (
        <EmptyLine text="내역 없음" />
      ) : (
        items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid grid-cols-[28px_1fr_auto] items-center rounded-lg bg-neutral-50 px-2 py-2 text-[13px]">
            <div className="font-black text-neutral-400">{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate font-black">{item.title}</div>
              {item.sub ? <div className="text-[11px] font-bold text-neutral-400">{item.sub}</div> : null}
            </div>
            <div className="font-black">{item.right}</div>
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel({
  settingsSummary,
  saveSetting,
}: {
  settingsSummary: {
    customerCardRate: number;
    actualCardRate: number;
    defaultShippingFee: number;
    remoteAreaShippingFee: number;
  };
  saveSetting: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SettingInput label="고객 카드추가 수수료율" desc="0~10% 사이 / 새 주문부터 적용" value={settingsSummary.customerCardRate} suffix="%" min={0} max={10} onSave={(value) => saveSetting("customer_card_extra_rate", String(value))} />
      <LockedSettingCard label="실제 카드업체 수수료율" desc="정산 사고 방지를 위해 7% 고정 / 관리자 수정 불가" value={7} suffix="%" />
      <SettingInput label="기본 배송비" desc="일반 주소 기본 배송비" value={settingsSummary.defaultShippingFee} suffix="원" min={0} max={50000} onSave={(value) => saveSetting("default_shipping_fee", String(value))} />
      <SettingInput label="제주/산간 배송비" desc="주소 자동감지 대상 배송비" value={settingsSummary.remoteAreaShippingFee} suffix="원" min={0} max={50000} onSave={(value) => saveSetting("remote_area_shipping_fee", String(value))} />
    </div>
  );
}

function LockedSettingCard({
  label,
  desc,
  value,
  suffix,
}: {
  label: string;
  desc: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-4">
      <div className="text-[15px] font-black text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value.toLocaleString()}<span className="ml-1 text-lg text-neutral-500">{suffix}</span></div>
      <div className="mt-1 text-xs font-semibold text-neutral-500">{desc}</div>
      <div className="mt-3 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[13px] font-black text-neutral-500">
        고정값입니다. 과거/현재 주문 정산 보호를 위해 화면에서 수정하지 않습니다.
      </div>
    </div>
  );
}

function SettingInput({
  label,
  desc,
  value,
  suffix,
  min,
  max,
  onSave,
}: {
  label: string;
  desc: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onSave: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  useEffect(() => setLocalValue(String(value)), [value]);

  const save = () => {
    const parsed = Number(localValue);
    if (!Number.isFinite(parsed)) return alert("숫자로 입력해주세요.");
    if (parsed < min || parsed > max) return alert(`${min}~${max} 범위 안에서 입력해주세요.`);
    onSave(parsed);
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-[15px] font-black text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value.toLocaleString()}<span className="ml-1 text-lg text-neutral-500">{suffix}</span></div>
      <div className="mt-1 text-xs font-semibold text-neutral-500">{desc}</div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <input value={localValue} onChange={(event) => setLocalValue(event.target.value.replace(/[^0-9.]/g, ""))} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-neutral-950" />
        <button type="button" onClick={save} className="rounded-xl bg-neutral-950 px-4 py-2 text-[15px] font-black text-white">저장</button>
      </div>
    </div>
  );
}

export default AdminV2Client;
