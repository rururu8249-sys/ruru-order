import { showAdminToast } from "@/lib/adminToast";
import { formatOrderOptionText, stripNoneOptionParts } from "@/lib/orderOptionText";
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
  // [2026-08-31 사장님 지시] 송장에도 "없음" 그대로 안 나가게 — 없음 숨기고 「사이즈 6」 표기
  return formatOrderOptionText(item.color, item.size) || stripNoneOptionParts(item.optionText);
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

  // 상품금액은 주문에 저장된 값(item.amount, 상품행 없으면 order.productAmount) 표시 전용 — 재계산 안 함.
  //   (2026-07-16의 「챙김」 칸은 2026-09-01 사장님 지시로 삭제 — 팝업 체크로 충분)
  // [2026-08-31 사장님 지시]
  //   ① 상품금액에 쉼표(199,000) — 엑셀 표시형식만, 값은 숫자 그대로.
  //   ② 「미결제 포함」으로 뽑을 때 미입금 줄은 진한 핑크 배경 + 「결제」 칸에 '미입금' 표기.
  //      판정은 물건챙기기 팝업과 같은 기준(PAID_STATUSES). 화면 표시·엑셀 스타일만, 돈 데이터 무접촉.
  const PICKING_PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];
  const isUnpaidOrder = (order: LiveOrder) => !PICKING_PAID_STATUSES.includes(clean(order.paymentStatus));
  // [2026-08-31 사장님 피드백] 처음엔 미입금이 있을 때만 「결제」 칸을 만들었는데,
  //   칸이 파일마다 있다 없다 하니 "카드결제가 누락됐나?" 하는 불안만 낳았다.
  //   → 항상 넣는다. 전부 완료면 전부 '완료'로 보일 뿐이다.
  const hasUnpaid = true;

  // [2026-09-01 사장님 지시] 「챙김/안챙김」 칸 삭제(팝업 체크로 충분), 맨 끝에 빈 「비고」 칸 추가.
  void pickedIds; // 호출부 서명 유지용 — 챙김 칸이 빠져 더는 안 쓴다
  // [2026-09-01 사장님 지시] 첫 칸에 「날짜」(주문일 MM.DD) — 헤더 아래 데이터 줄부터 채움
  const headers: WorkbookRow = ["날짜", "닉네임", "상품명", "옵션", "수량", "상품금액", "결제", "비고"];
  const orderDateLabel = (order: LiveOrder) => {
    const src = order.createdAt || order.submittedAt;
    if (!src) return "";
    const d = new Date(src);
    if (isNaN(d.getTime())) return "";
    // 시간까지 포함 — 같은 날 여러 방송·주문 구분용 (예: 08.27 01:44)
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const itemRows: WorkbookRow[] = [];
  const unpaidRowFlags: boolean[] = []; // itemRows 와 같은 순서 — 스타일용

  exportOrders.forEach((order) => {
    const unpaid = isUnpaidOrder(order);
    const items = order.items || [];

    if (!items.length) {
      const row: WorkbookRow = [
        orderDateLabel(order),
        labelName(order),
        clean(order.orderSummary) || "상품명없음",
        "",
        1,
        Number(order.productAmount || 0),
      ];
      if (hasUnpaid) row.push(unpaid ? "미입금" : "완료");
      row.push(""); // 비고 — 사장님이 손으로 적는 빈칸
      itemRows.push(row);
      unpaidRowFlags.push(unpaid);
      return;
    }

    items.forEach((item) => {
      const row: WorkbookRow = [
        orderDateLabel(order),
        labelName(order),
        itemName(item),
        itemOption(item),
        itemQty(item),
        Number(item.amount || 0),
      ];
      if (hasUnpaid) row.push(unpaid ? "미입금" : "완료");
      row.push(""); // 비고 — 사장님이 손으로 적는 빈칸
      itemRows.push(row);
      unpaidRowFlags.push(unpaid);
    });
  });

  // [2026-08-31 사장님 요청] 맨 아래 합계·설명 — 상품값 합계와 "실제 받은 돈"을 같이 적어
  //   화면 매출 바와 왜 다른지 사장님이 계산할 필요 없게 한다 (표시 전용, 재계산 없음).
  const goodsSum = itemRows.reduce((sum, row) => sum + (Number(row[5]) || 0), 0); // 6번째 칸 = 상품금액
  const receivedSum = exportOrders.reduce(
    (sum, order) => sum + (PICKING_PAID_STATUSES.includes(clean(order.paymentStatus)) ? Number(order.totalAmount || 0) : 0),
    0,
  );
  // [2026-09-01 사장님 지시]
  //   ① 맨 위 안내 글씨(제목·필터조건·생성일시·대상건수) 삭제
  //   ② 합계·설명은 맨 아래가 아니라 **헤더 위(1~3행)** — 필터·정렬은 헤더 아래 데이터만
  //      움직이므로 합계가 절대 섞이지 않는다. 틀고정으로 스크롤해도 항상 보인다.
  const summaryRows: WorkbookRow[] = [
    ["📦 상품값 합계(상품금액)", "", "", "", "", goodsSum],
    ["💳 실제 받은 돈(결제완료 · 카드수수료 포함·포인트 차감)", "", "", "", "", receivedSum],
    ["※ 두 금액은 다른 게 정상 — 상품값에 카드수수료가 더해지고 포인트가 빠진 금액이 실제 받은 돈(화면 매출 바 기준)이에요."],
    [],
  ];
  const headerRowNumber = summaryRows.length + 1; // 5행
  void addSheetMetaRows; // 다른 엑셀(택배송장 확인용)에서 계속 사용 — 물건챙기기만 안 씀

  const rows: WorkbookRow[] = [
    ...summaryRows,
    headers,
    ...itemRows,
  ];

  const workbook = createWorkbook();
  const sheet = workbook.addWorksheet("물건챙기기");
  addRows(sheet, rows);
  // 필터 범위 = 헤더~마지막 데이터 줄까지만 (위 합계 3줄은 범위 밖 = 고정)
  styleFilterSheet(sheet, headerRowNumber, headerRowNumber + itemRows.length, headers.length);

  // 합계 줄 스타일 — 굵게 + 쉼표 (styleFilterSheet 이후에 덮어써야 유지된다)
  [1, 2].forEach((rowNumber) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true };
    row.getCell(6).font = { bold: true };
    row.getCell(6).numFmt = "#,##0";
  });

  // 데이터 줄 스타일 — 헤더 다음부터.
  const firstDataRow = headerRowNumber + 1;
  itemRows.forEach((_, index) => {
    const row = sheet.getRow(firstDataRow + index);
    row.getCell(6).numFmt = "#,##0"; // 상품금액 쉼표
    if (unpaidRowFlags[index]) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > headers.length) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF48FB1" } }; // 진한 핑크
        cell.font = { bold: true, color: { argb: "FF7A1E2E" } };
      });
    }
  });

  // [2026-09-01 사장님 지시] 파일명 = 방송이름+날짜+루루
  //   방송 필터: "0827(목) 해외원정방송 1부" → 해외원정방송1부0827루루.xlsx
  //   쇼핑몰 모드(방송 외 주문): "0901(화) 공구·상시주문" → 방송외주문0901루루.xlsx
  //   방송 전체보기: 날짜 없음 → 전체주문{오늘MMDD}루루.xlsx
  const broadcastPart = String(meta.filterLabel || "").split(" · ")[0].replace(/^방송:\s*/, "").trim();
  const dateMatch = broadcastPart.match(/^(\d{4})\([월화수목금토일]\)\s*/);
  const now = new Date();
  const todayMmdd = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const fileDate = dateMatch ? dateMatch[1] : todayMmdd;
  let fileBase = broadcastPart.replace(/^(\d{4})\([월화수목금토일]\)\s*/, "").trim();
  if (fileBase.includes("공구·상시주문")) fileBase = "방송외주문";
  if (!fileBase || fileBase === "전체보기") fileBase = "전체주문";
  fileBase = fileBase.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "");

  await writeWorkbook(workbook, `${fileBase}${fileDate}루루.xlsx`);
}
