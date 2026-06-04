// lib/bankda/fetchBankdaTransactions.ts
// 뱅크다 데이터전송 API(bank_tr.php)에서 입금내역 조회

export type BankdaRawTransaction = Record<string, unknown>;

export type NormalizedBankdaDeposit = {
  depositor_name: string;
  amount: number;
  deposited_time: string;
  confirmed_note: string;
};

const BANKDA_URL = "https://a.bankda.com/dtsvc/bank_tr.php";

function ymdKst(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function getDefaultDateRange() {
  const to = new Date();
  // 뱅크다가 상한일(오늘)을 미포함으로 해석하거나 당일 거래 반영이 늦는 경우를 대비해
  // 조회 상한만 "오늘+1일(KST)"로 잡아 오늘 입금이 항상 창 안에 들어오게 한다.
  // (datefrom·금액·중복판정·저장 로직은 그대로)
  to.setDate(to.getDate() + 1);
  const from = new Date();
  from.setDate(from.getDate() - 30);

  return {
    datefrom: ymdKst(from),
    dateto: ymdKst(to),
  };
}

function pickText(row: BankdaRawTransaction, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function pickNumber(row: BankdaRawTransaction, keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null) continue;

    const num = Number(String(raw).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function parseDateTime(row: BankdaRawTransaction) {
  const direct = pickText(row, [
    "deposited_time",
    "trade_time",
    "transaction_time",
    "tr_time",
    "trdtm",
    "datetime",
    "date_time",
    "거래일시",
    "입금일시",
  ]);

  if (direct) {
    const d = new Date(direct);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }

  const dateText = pickText(row, [
    "bkdate",
    "date",
    "tr_date",
    "trade_date",
    "transaction_date",
    "tr_dt",
    "거래일자",
    "입금일자",
  ]);

  const timeText = pickText(row, [
    "bktime",
    "time",
    "tr_time",
    "trade_time_only",
    "transaction_time_only",
    "tr_tm",
    "거래시간",
    "입금시간",
  ]);

  const digitsDate = dateText.replace(/[^0-9]/g, "");
  const digitsTime = timeText.replace(/[^0-9]/g, "");

  if (digitsDate.length >= 8) {
    const y = digitsDate.slice(0, 4);
    const m = digitsDate.slice(4, 6);
    const d = digitsDate.slice(6, 8);
    const hh = digitsTime.slice(0, 2) || "00";
    const mm = digitsTime.slice(2, 4) || "00";
    const ss = digitsTime.slice(4, 6) || "00";

    const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }

  return new Date().toISOString();
}

function flattenRows(data: unknown): BankdaRawTransaction[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object") as BankdaRawTransaction[];

  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  const response = obj.response && typeof obj.response === "object"
    ? (obj.response as Record<string, unknown>)
    : null;

  const candidates = [
    response?.bank,
    response?.data,
    response?.list,
    obj.data,
    obj.list,
    obj.lists,
    obj.rows,
    obj.result,
    obj.results,
    obj.transactions,
    obj.bank,
    obj.bank_tr,
    obj.banktr,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((x) => x && typeof x === "object") as BankdaRawTransaction[];
    }
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      return value.filter((x) => x && typeof x === "object") as BankdaRawTransaction[];
    }

    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(nested)) {
          return nested.filter((x) => x && typeof x === "object") as BankdaRawTransaction[];
        }
      }
    }
  }

  return [];
}

export async function fetchBankdaTransactions(options?: {
  datefrom?: string;
  dateto?: string;
  accountnum?: string;
}) {
  const token = String(process.env.BANKDA_ACCESS_TOKEN || "").trim();

  if (!token) {
    throw new Error("BANKDA_ACCESS_TOKEN 환경변수가 없습니다.");
  }

  const range = getDefaultDateRange();
  const body = new FormData();

  body.append("datefrom", options?.datefrom || range.datefrom);
  body.append("dateto", options?.dateto || range.dateto);
  const cleanAccountNum = String(options?.accountnum || process.env.BANKDA_ACCOUNT_NUM || "").replace(/[^0-9]/g, "");
  body.append("accountnum", cleanAccountNum);
  body.append("datatype", "json");
  body.append("charset", "utf8");
  body.append("istest", "n");

  const response = await fetch(BANKDA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      access_token: token,
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`뱅크다 API 오류 ${response.status}: ${text.slice(0, 500)}`);
  }

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`뱅크다 응답 JSON 파싱 실패: ${text.slice(0, 500)}`);
  }

  const rows = flattenRows(json);

  // [임시 디버그] 뱅크다 응답 "구조/필드명"만 확인용. 값(계좌·이름·금액)은 절대 안 찍음. 확인 후 즉시 제거 예정.
  try {
    const topObj =
      json && typeof json === "object" && !Array.isArray(json)
        ? (json as Record<string, unknown>)
        : {};
    const topKeys = Object.keys(topObj);
    const responseObj =
      topObj.response && typeof topObj.response === "object"
        ? (topObj.response as Record<string, unknown>)
        : null;
    const pageNumbers: Record<string, unknown> = {};
    const PAGE_KEYS = [
      "total", "totalcount", "totalCount", "total_count", "totcnt", "totalcnt",
      "count", "cnt", "page", "pagecnt", "pageCount", "pages", "totalpage",
      "next", "hasnext", "hasNext", "more",
    ];
    for (const obj of [topObj, responseObj || {}]) {
      for (const key of PAGE_KEYS) {
        const value = (obj as Record<string, unknown>)[key];
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
          pageNumbers[key] = value;
        }
      }
    }
    console.log("[debug-bankda] topKeys=", topKeys);
    console.log("[debug-bankda] responseKeys=", responseObj ? Object.keys(responseObj) : null);
    console.log("[debug-bankda] pageNumberFields=", pageNumbers);
    console.log("[debug-bankda] rowsLength=", rows.length);
    console.log("[debug-bankda] row0Keys=", rows[0] ? Object.keys(rows[0]) : null);
  } catch (debugError) {
    console.warn("[debug-bankda] 구조 로그 실패(무시):", debugError instanceof Error ? debugError.message : String(debugError));
  }

  const deposits: NormalizedBankdaDeposit[] = rows
    .map((row) => {
      const depositor_name =
        pickText(row, [
          "bkjukyo",
          "depositor_name",
          "depositor",
          "sender",
          "sender_name",
          "client_name",
          "customer_name",
          "print_content",
          "content",
          "memo",
          "summary",
          "briefs",
          "remark",
          "trader",
          "입금자명",
          "보낸분",
          "적요",
          "내용",
        ]) || "입금자명 없음";

      const amount = pickNumber(row, [
        "bkinput",
        "amount",
        "deposit_amount",
        "in_amount",
        "input_amount",
        "income_amount",
        "tr_amt",
        "in_amt",
        "deposit",
        "income",
        "입금액",
        "입금금액",
        "거래금액",
      ]);

      return {
        depositor_name,
        amount,
        deposited_time: parseDateTime(row),
        confirmed_note: "뱅크다 입금내역 새로고침",
      };
    })
    .filter((item) => item.amount > 0);

  return {
    raw: json,
    rawCount: rows.length,
    deposits,
  };
}
