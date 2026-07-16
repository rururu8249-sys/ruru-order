import { showAdminToast } from "@/lib/adminToast";
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
  if (order.paymentStatus === "canceled") return "주문서취소";
  if (order.paymentStatus === "manual_match_needed") return "매칭필요";
  if (order.paymentStatus === "manual_paid") return "수동입금확인";
  if (order.paymentStatus === "auto_paid") return "자동입금확인";
  if (order.paymentStatus === "card_paid") return "카드결제완료";
  if (order.paymentStatus === "card_unpaid") return "카드미결제";
  if (order.paymentStatus === "unpaid") return "입금대기";
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
  // 상품 전체 출력, 상품 사이는 #, 맨 끝에 총 개수.
  return `${items.map(itemText).join(" # ")} (총 ${totalQty(order)}개)`;
}

// 수하인명/닉네임 칼럼 + 주소 뒤 "/닉네임" 에 쓰는 표시 이름: 유튜브 닉네임 우선(운영자가 방송 시청자와 매칭하는 기준).
//   없으면 받는사람/주문자명 fallback(옛 주문 호환).
function labelName(order: LiveOrder) {
  return clean(order.nickname || (order as any).recipientName || order.name || "");
}

function phoneText(order: LiveOrder) {
  // 받는사람 연락처 우선, 없으면 주문자 전화 — 옛 주문 호환.
  return clean((order as any).recipientPhone || order.phone);
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
  const nickname = labelName(order);

  if (!address) return nickname ? `/${nickname}` : "";
  if (!nickname) return address;

  return `${address} /${nickname}`;
}

function splitAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    address?: string | null;
    detailAddress?: string | null;
  };

  const nickname = labelName(order);
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
    labelName(order),
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
    labelName(order),
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

      // 전화·핸드폰·운임구분 칸을 @(텍스트강제) 대신 General로 둠.
      // 값이 이미 문자열이라 앞자리 0은 유지되고, 택배 합배송(이름+연락처+주소) 인식이 정상화됨.
      // (원래 @ 형식이라 로젠 프로그램이 차수를 갈라 합포장이 안 묶이던 문제 해결)
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
      labelName(order),
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

function isRosenExportExcluded(order: LiveOrder) {
  return order.excludeFromShipping === true;
}

function isPickingExportExcluded(order: LiveOrder) {
  return order.excludeFromPicking === true;
}

export async function exportLiveOrdersForRosen(orders: LiveOrder[], meta: ExportMeta) {
  const exportOrders = orders.filter((order) => !isRosenExportExcluded(order));

  if (!exportOrders.length) {
    showAdminToast("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  const workbook = createWorkbook();
  appendRosenSheets(workbook, exportOrders);
  appendRosenCheckSheet(workbook, exportOrders, meta);

  await writeWorkbook(workbook, `rozen_${safeFileDate()}.xlsx`);
}

export async function exportLiveOrdersForPicking(orders: LiveOrder[], meta: ExportMeta, pickedIds?: Set<string>) {
  const exportOrders = orders.filter((order) => !isPickingExportExcluded(order));

  if (!exportOrders.length) {
    showAdminToast("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  // [2026-07-16 사장님 지침] 물건챙기기 엑셀에 "챙김" 컬럼 추가 — 팝업에서 체크한 건 "챙김", 안 한 건 "안챙김".
  //   챙김 판정은 팝업과 동일한 picked id 집합(orders.picked_at 기반). pickedIds 없으면(옛 호출) 컬럼 생략.
  //   상품금액은 주문에 저장된 값(item.amount, 상품행 없으면 order.productAmount) 표시 전용 — 재계산 안 함.
  const withPick = pickedIds instanceof Set;
  const headers = withPick
    ? ["닉네임", "상품명", "옵션", "수량", "상품금액", "챙김"]
    : ["닉네임", "상품명", "옵션", "수량", "상품금액"];
  const pickLabel = (id: string) => (pickedIds?.has(id) ? "챙김" : "안챙김");

  const itemRows: WorkbookRow[] = [];

  exportOrders.forEach((order) => {
    const items = order.items || [];

    if (!items.length) {
      const row: WorkbookRow = [
        labelName(order),
        clean(order.orderSummary) || "상품명없음",
        "",
        1,
        Number(order.productAmount || 0),
      ];
      if (withPick) row.push(pickLabel(String(order.id)));
      itemRows.push(row);
      return;
    }

    items.forEach((item) => {
      const row: WorkbookRow = [
        labelName(order),
        itemName(item),
        itemOption(item),
        itemQty(item),
        Number(item.amount || 0),
      ];
      if (withPick) row.push(pickLabel(String(item.id)));
      itemRows.push(row);
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
