import * as XLSX from "xlsx";
import type { LiveOrder, LiveOrderItem } from "./types";

type ExportMeta = {
  filterLabel: string;
};

type WorkbookRow = Array<string | number>;

const FALLBACK_ROZEN_HEADERS = [
  "수하인명",
  "수하인전화",
  "수하인주소",
  "품목명",
  "수량",
  "배송메모",
  "주문번호",
  "결제상태",
  "방송명",
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
  return clean(item.optionText).replace(/^옵션 없음$/u, "");
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

function recipientAddress(order: LiveOrder) {
  const row = order as LiveOrder & {
    zipcode?: string | null;
    address?: string | null;
    detailAddress?: string | null;
  };

  const base = [row.address, row.detailAddress].map(clean).filter(Boolean).join(" ");
  const nickname = recipientName(order);

  if (!base) return nickname ? `/${nickname}` : "";
  if (!nickname) return base;

  return `${base} /${nickname}`;
}

function memoText(order: LiveOrder) {
  return clean(order.memo);
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

function applyBasicSheetStyle(ws: XLSX.WorkSheet, headerRowIndex: number, totalRows: number, totalCols: number) {
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: Math.max(headerRowIndex, totalRows - 1), c: Math.max(0, totalCols - 1) },
    }),
  };

  ws["!cols"] = Array.from({ length: totalCols }).map((_, index) => {
    if (index === 0) return { wch: 18 };
    if (index === 1) return { wch: 18 };
    if (index === 2) return { wch: 48 };
    if (index === 3) return { wch: 44 };
    if (index === 4) return { wch: 10 };
    return { wch: 20 };
  });
}

function writeWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { bookType: "xlsx" });
}

async function getRosenHeadersFromTemplate() {
  try {
    const response = await fetch("/templates/rozen_template.xlsx", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) return FALLBACK_ROZEN_HEADERS;

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) return FALLBACK_ROZEN_HEADERS;

    const rows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, {
      header: 1,
      blankrows: false,
    });

    const headerRow = rows.find((row) => row.map(clean).filter(Boolean).length >= 3);
    const headers = (headerRow || []).map(clean).filter(Boolean);

    return headers.length >= 3 ? headers : FALLBACK_ROZEN_HEADERS;
  } catch {
    return FALLBACK_ROZEN_HEADERS;
  }
}

function rosenValueByHeader(header: string, order: LiveOrder) {
  const h = clean(header).replace(/\s+/g, "").toLowerCase();

  if (/(수하인|받는분|받는사람|수취인|수령인|고객명|성명|이름)/u.test(h)) {
    return recipientName(order);
  }

  if (/(전화|휴대폰|핸드폰|연락처|수하인전화)/u.test(h)) {
    return clean(order.phone);
  }

  if (/(우편|zipcode|zip)/u.test(h)) {
    return clean((order as LiveOrder & { zipcode?: string | null }).zipcode);
  }

  if (/(주소|배송지)/u.test(h)) {
    return recipientAddress(order);
  }

  if (/(품목|상품|상품명|내용품|물품|물건)/u.test(h)) {
    return itemSummary(order);
  }

  if (/(수량|개수)/u.test(h)) {
    return totalQty(order);
  }

  if (/(배송메모|배송요청|요청|메모|비고|특이)/u.test(h)) {
    return memoText(order);
  }

  if (/(주문번호|주문코드|주문id|order)/u.test(h)) {
    return clean(order.orderNo || order.groupId || order.id);
  }

  if (/(결제|입금|상태)/u.test(h)) {
    return paymentLabel(order);
  }

  if (/(방송)/u.test(h)) {
    return clean(order.broadcastName);
  }

  return "";
}

export async function exportLiveOrdersForRosen(orders: LiveOrder[], meta: ExportMeta) {
  if (!orders.length) {
    alert("내보낼 주문이 없습니다. 필터 조건을 확인해주세요.");
    return;
  }

  const headers = await getRosenHeadersFromTemplate();
  const dataRows = orders.map((order) => headers.map((header) => rosenValueByHeader(header, order)));

  const rows: WorkbookRow[] = [
    ...addSheetMetaRows("로젠택배 송장 내보내기", meta, orders.length),
    headers,
    ...dataRows,
  ];

  const headerRowIndex = 5;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyBasicSheetStyle(ws, headerRowIndex, rows.length, headers.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "택배송장");

  const checkHeaders = [
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

  const checkRows: WorkbookRow[] = [
    ...addSheetMetaRows("택배송장 확인용", meta, orders.length),
    checkHeaders,
    ...orders.map((order) => [
      clean(order.orderNo || order.groupId || order.id),
      recipientName(order),
      clean(order.name),
      clean(order.phone),
      recipientAddress(order),
      itemSummary(order),
      totalQty(order),
      paymentLabel(order),
      clean(order.broadcastName),
      memoText(order),
    ]),
  ];

  const checkWs = XLSX.utils.aoa_to_sheet(checkRows);
  applyBasicSheetStyle(checkWs, 5, checkRows.length, checkHeaders.length);
  XLSX.utils.book_append_sheet(wb, checkWs, "확인용");

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
        clean(order.phone),
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
        clean(order.phone),
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
  applyBasicSheetStyle(ws, 5, rows.length, headers.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "물건챙기기");

  writeWorkbook(wb, `pick_${safeFileDate()}.xlsx`);
}
