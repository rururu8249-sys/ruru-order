import ExcelJS from "exceljs";
import type { LiveOrder, LiveOrderItem } from "./types";

type ExportMeta = {
  filterLabel: string;
};

type WorkbookRow = Array<string | number | null>;

const ROSEN_HEADER_COMBINED: WorkbookRow = [
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

const ROSEN_HEADER_SPLIT: WorkbookRow = [
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

function deliveryMemoText(order: LiveOrder) {
  // 로젠 K열 배송메세지는 고객이 주문서에 작성한 배송메모만 사용합니다.
  // 상품명, 관리자메모, 특이사항, 과거 상품메모는 절대 넣지 않습니다.
  return clean((order as LiveOrder & { deliveryMemo?: string | null }).deliveryMemo);
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
    2750,
    "010",
    itemSummary(order),
    null,
    deliveryMemoText(order),
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
    2750,
    "010",
    itemSummary(order),
    null,
    deliveryMemoText(order),
  ];
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

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ruru-order-app";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function setColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function styleRosenSheet(sheet: ExcelJS.Worksheet, rowCount: number, columnCount: number, splitAddress: boolean) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rowCount), column: columnCount },
  };

  setColumnWidths(
    sheet,
    splitAddress
      ? [18, 8, 34, 26, 18, 18, 12, 12, 12, 48, 8, 34]
      : [18, 8, 48, 18, 18, 12, 12, 12, 48, 8, 34, 8]
  );

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.height = rowNumber === 1 ? 22 : 24;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isLongTextColumn = splitAddress
        ? [3, 4, 10, 12].includes(colNumber)
        : [3, 9, 11].includes(colNumber);

      cell.alignment = {
        vertical: "middle",
        horizontal: rowNumber === 1 ? "center" : isLongTextColumn ? "left" : "center",
        wrapText: true,
      };

      if (rowNumber === 1) {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEFF6FF" },
        };
      }

      if (splitAddress) {
        if ([5, 6, 9].includes(colNumber)) cell.numFmt = "@";
      } else if ([4, 5, 8].includes(colNumber)) {
        cell.numFmt = "@";
      }
    });
  });
}

function styleFilterSheet(sheet: ExcelJS.Worksheet, headerRowNumber: number, rowCount: number, columnCount: number) {
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(headerRowNumber, rowCount), column: columnCount },
  };

  setColumnWidths(sheet, [18, 18, 16, 18, 44, 48, 10, 18, 24, 20, 34]);

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: [5, 6, 11].includes(colNumber) ? "left" : "center",
        wrapText: true,
      };

      if (rowNumber === headerRowNumber) {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEFF6FF" },
        };
      }
    });
  });
}

function addRows(sheet: ExcelJS.Worksheet, rows: WorkbookRow[]) {
  rows.forEach((row) => sheet.addRow(row));
}

function appendRosenSheet(workbook: ExcelJS.Workbook, sheetName: string, rows: WorkbookRow[], splitAddress: boolean) {
  const sheet = workbook.addWorksheet(sheetName);
  addRows(sheet, rows);
  styleRosenSheet(sheet, rows.length, 12, splitAddress);
}

function appendRosenSheets(workbook: ExcelJS.Workbook, orders: LiveOrder[]) {
  const combinedRows: WorkbookRow[] = [ROSEN_HEADER_COMBINED, ...orders.map(rosenRowCombined)];
  const splitRows: WorkbookRow[] = [ROSEN_HEADER_SPLIT, ...orders.map(rosenRowSplit)];

  appendRosenSheet(workbook, "주소통합_제목필터", combinedRows, false);
  appendRosenSheet(workbook, "주소분리_제목필터", splitRows, true);
  appendRosenSheet(workbook, "엑셀파일첫행-제목있음", combinedRows, false);
  appendRosenSheet(workbook, "엑셀파일첫행-제목있음(주소1,2로분리)", splitRows, true);
}

function appendRosenCheckSheet(workbook: ExcelJS.Workbook, orders: LiveOrder[], meta: ExportMeta) {
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
    "배송메모",
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
      deliveryMemoText(order),
    ]),
  ];

  const sheet = workbook.addWorksheet("관리자확인용");
  addRows(sheet, rows);
  styleFilterSheet(sheet, 6, rows.length, headers.length);
}

async function writeWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportLiveOrdersForRosen(orders: LiveOrder[], meta: ExportMeta) {
  if (!orders.length) {
    alert("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  const workbook = createWorkbook();
  appendRosenSheets(workbook, orders);
  appendRosenCheckSheet(workbook, orders, meta);

  await writeWorkbook(workbook, `rozen_${safeFileDate()}.xlsx`);
}

export async function exportLiveOrdersForPicking(orders: LiveOrder[], meta: ExportMeta) {
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
    "배송메모",
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
        deliveryMemoText(order),
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
        deliveryMemoText(order),
      ]);
    });
  });

  const rows: WorkbookRow[] = [
    ...addSheetMetaRows("물건챙기기 리스트", meta, itemRows.length),
    headers,
    ...itemRows,
  ];

  const workbook = createWorkbook();
  const sheet = workbook.addWorksheet("물건챙기기");
  addRows(sheet, rows);
  styleFilterSheet(sheet, 6, rows.length, headers.length);

  await writeWorkbook(workbook, `pick_${safeFileDate()}.xlsx`);
}
