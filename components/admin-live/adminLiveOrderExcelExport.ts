import * as XLSX from "xlsx";
import type { LiveOrder, LiveOrderItem } from "./types";

type ExportMeta = {
  filterLabel: string;
};

type WorkbookRow = Array<string | number | null>;

const ROSEN_HEADER_COMBINED = [
  "수하인명",
  null,
  "수하인주소",
  "수하인전화번호",
  "수하인핸드폰번호",
  "택배수량",
  "택배운임",
  "운임구분",
  "품목명",
  null,
  "배송메세지",
  null,
];

const ROSEN_HEADER_SPLIT = [
  "수하인명",
  null,
  "수하인주소1",
  "수하인주소2",
  "수하인전화번호",
  "수하인핸드폰번호",
  "택배수량",
  "택배운임",
  "운임구분",
  "품목명",
  null,
  "배송메세지",
];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeFileDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}

function fullDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function paymentLabel(order: LiveOrder) {
  if (order.paymentStatus === "manual_match_needed") return "입금확인 필요";
  if (order.paymentStatus === "manual_paid") return "수동입금확인";
  if (order.paymentStatus === "auto_paid") return "자동입금확인";
  if (order.paymentStatus === "card_paid") return "카드결제완료";
  if (order.paymentStatus === "card_unpaid") return "카드 미결제";
  if (order.paymentStatus === "unpaid") return "미입금";
  return "입금확인";
}

function itemOption(item: LiveOrderItem) {
  const value = clean(item.optionText);
  return value === "옵션 없음" ? "" : value;
}

function itemName(item: LiveOrderItem) {
  return clean(item.productName) || "상품명없음";
}

function itemQty(item: LiveOrderItem) {
  const qty = Number(item.qty || 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function itemText(item: LiveOrderItem) {
  const option = itemOption(item);
  const name = itemName(item);
  const qty = itemQty(item);

  return option ? `${name}(${option}) x${qty}개` : `${name} x${qty}개`;
}

function totalQty(order: LiveOrder) {
  return (order.items || []).reduce((sum, item) => sum + itemQty(item), 0);
}

function itemSummary(order: LiveOrder) {
  const items = order.items || [];
  if (!items.length) return clean(order.orderSummary) || "상품명없음 x1개";
  return items.map(itemText).join(" / ");
}

function recipientName(order: LiveOrder) {
  return clean(order.nickname || order.name || "");
}

function phoneText(order: LiveOrder) {
  return clean(order.phone);
}

function baseAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    address?: string | null;
    detailAddress?: string | null;
  };

  return [row.address, row.detailAddress].map(clean).filter(Boolean).join(" ");
}

function recipientAddress(order: LiveOrder) {
  const address = baseAddress(order);
  const nickname = recipientName(order);

  if (!address) return nickname ? `/${nickname}` : "";
  if (!nickname) return address;

  return `${address} /${nickname}`;
}

function splitAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    address?: string | null;
    detailAddress?: string | null;
  };

  const nickname = recipientName(order);
  const address1 = clean(row.address);
  const detail = clean(row.detailAddress);
  const address2Base = detail || "";
  const address2 = nickname
    ? [address2Base, `/${nickname}`].filter(Boolean).join(" ")
    : address2Base;

  if (!address1) {
    return {
      address1: recipientAddress(order),
      address2: "",
    };
  }

  return {
    address1,
    address2,
  };
}

function memoText(order: LiveOrder) {
  return clean(order.memo);
}

function rosenRowCombined(order: LiveOrder): WorkbookRow {
  const phone = phoneText(order);

  return [
    recipientName(order),
    null,
    recipientAddress(order),
    phone,
    phone,
    1,
    "",
    "010",
    itemSummary(order),
    null,
    memoText(order),
    null,
  ];
}

function rosenRowSplit(order: LiveOrder): WorkbookRow {
  const phone = phoneText(order);
  const address = splitAddress(order);

  return [
    recipientName(order),
    null,
    address.address1,
    address.address2,
    phone,
    phone,
    1,
    "",
    "010",
    itemSummary(order),
    null,
    memoText(order),
  ];
}

function applyRosenSheetFormat(ws: XLSX.WorkSheet, columnCount: number) {
  ws["!cols"] = Array.from({ length: columnCount }).map((_, index) => {
    if (index === 0) return { wch: 18 };
    if (index === 2) return { wch: 42 };
    if (index === 3) return { wch: 26 };
    if (index === 4 || index === 5) return { wch: 18 };
    if (index === 8 || index === 9) return { wch: 42 };
    if (index === 10 || index === 11) return { wch: 28 };
    return { wch: 12 };
  });
}

function addSheetMetaRows(title: string, meta: ExportMeta, rowCount: number): WorkbookRow[] {
  return [
    [title],
    [`필터조건: ${meta.filterLabel || "전체보기"}`],
    [`생성일시: ${fullDateTime()}`],
    [`대상건수: ${rowCount.toLocaleString("ko-KR")}건`],
    [],
  ];
}

function applyFilterSheetStyle(ws: XLSX.WorkSheet, headerRowIndex: number, totalRows: number, totalCols: number) {
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: Math.max(headerRowIndex, totalRows - 1), c: Math.max(0, totalCols - 1) },
    }),
  };

  ws["!cols"] = Array.from({ length: totalCols }).map((_, index) => {
    if (index === 0) return { wch: 18 };
    if (index === 1) return { wch: 18 };
    if (index === 2) return { wch: 18 };
    if (index === 3) return { wch: 44 };
    if (index === 5) return { wch: 42 };
    if (index === 10) return { wch: 34 };
    return { wch: 18 };
  });
}

function writeWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { bookType: "xlsx" });
}

function appendRosenSheets(wb: XLSX.WorkBook, orders: LiveOrder[]) {
  const combinedRows = orders.map(rosenRowCombined);
  const splitRows = orders.map(rosenRowSplit);

  const noHeaderCombinedWs = XLSX.utils.aoa_to_sheet(combinedRows);
  applyRosenSheetFormat(noHeaderCombinedWs, 12);
  XLSX.utils.book_append_sheet(wb, noHeaderCombinedWs, "엑셀파일 첫행-제목없음");

  const headerCombinedRows: WorkbookRow[] = [ROSEN_HEADER_COMBINED, ...combinedRows];
  const headerCombinedWs = XLSX.utils.aoa_to_sheet(headerCombinedRows);
  applyRosenSheetFormat(headerCombinedWs, 12);
  XLSX.utils.book_append_sheet(wb, headerCombinedWs, "엑셀파일첫행-제목있음");

  const noHeaderSplitWs = XLSX.utils.aoa_to_sheet(splitRows);
  applyRosenSheetFormat(noHeaderSplitWs, 12);
  XLSX.utils.book_append_sheet(wb, noHeaderSplitWs, "엑셀파일첫행-제목없음(주소1,2로분리)");

  const headerSplitRows: WorkbookRow[] = [ROSEN_HEADER_SPLIT, ...splitRows];
  const headerSplitWs = XLSX.utils.aoa_to_sheet(headerSplitRows);
  applyRosenSheetFormat(headerSplitWs, 12);
  XLSX.utils.book_append_sheet(wb, headerSplitWs, "엑셀파일첫행-제목있음(주소1,2로분리)");
}

function appendRosenCheckSheet(wb: XLSX.WorkBook, orders: LiveOrder[], meta: ExportMeta) {
  const headers = [
    "주문번호",
    "닉네임",
    "이름",
    "전화번호",
    "주소",
    "상품명",
    "총수량",
    "결제상태",
    "방송명",
    "메모",
  ];

  const rows: WorkbookRow[] = [
    ...addSheetMetaRows("택배송장 확인용", meta, orders.length),
    headers,
    ...orders.map((order) => [
      clean(order.orderNo || order.groupId || order.id),
      recipientName(order),
      clean(order.name),
      phoneText(order),
      recipientAddress(order),
      itemSummary(order),
      totalQty(order),
      paymentLabel(order),
      clean(order.broadcastName),
      memoText(order),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyFilterSheetStyle(ws, 5, rows.length, headers.length);
  XLSX.utils.book_append_sheet(wb, ws, "관리자확인용");
}

export async function exportLiveOrdersForRosen(orders: LiveOrder[], meta: ExportMeta) {
  if (!orders.length) {
    alert("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  const wb = XLSX.utils.book_new();
  appendRosenSheets(wb, orders);
  appendRosenCheckSheet(wb, orders, meta);

  writeWorkbook(wb, `rozen_${safeFileDate()}.xlsx`);
}

export function exportLiveOrdersForPicking(orders: LiveOrder[], meta: ExportMeta) {
  if (!orders.length) {
    alert("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  const headers = [
    "방송명",
    "주문시간",
    "닉네임",
    "이름",
    "전화번호",
    "상품명",
    "옵션",
    "수량",
    "결제상태",
    "주문번호",
    "메모/특이사항",
  ];

  const itemRows: WorkbookRow[] = [];

  orders.forEach((order) => {
    const items = order.items || [];

    if (!items.length) {
      itemRows.push([
        clean(order.broadcastName),
        clean(order.submittedAt),
        recipientName(order),
        clean(order.name),
        phoneText(order),
        clean(order.orderSummary) || "상품명없음",
        "",
        1,
        paymentLabel(order),
        clean(order.orderNo || order.groupId || order.id),
        memoText(order),
      ]);
      return;
    }

    items.forEach((item) => {
      itemRows.push([
        clean(order.broadcastName),
        clean(order.submittedAt),
        recipientName(order),
        clean(order.name),
        phoneText(order),
        itemName(item),
        itemOption(item),
        itemQty(item),
        paymentLabel(order),
        clean(order.orderNo || order.groupId || order.id),
        memoText(order),
      ]);
    });
  });

  const rows: WorkbookRow[] = [
    ...addSheetMetaRows("물건챙기기 리스트", meta, itemRows.length),
    headers,
    ...itemRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyFilterSheetStyle(ws, 5, rows.length, headers.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "물건챙기기");

  writeWorkbook(wb, `pick_${safeFileDate()}.xlsx`);
}
