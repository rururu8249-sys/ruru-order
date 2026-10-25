// [2026-10-22 사장님] 「지난 주문 가져오기」 — 물건이 늦게 들어왔거나 교환으로 «지난 방송 주문 줄»을 오늘 챙겨서 내보낼 때.
//   주문을 복사하거나 날짜를 바꾸지 않는다. 줄(orders 행)에 «가져온 날짜·사유»만 적어 두고,
//   오늘 주문서·송장·물건챙기기가 그 줄을 «가져온 묶음»으로 한 번 더 보여준다.
//   돈·입금·정산·주문상태·포인트 무접촉(챙김·송장 «기록» 칸만 비우고, 빼기 때 원복).
//
//   저장(orders ADD COLUMN only — supabase/sql/orders_pick_pulled.sql):
//     pick_pulled_at timestamptz   가져온 시각
//     pick_pulled_for date         가져온 날짜(KST) — 이 날짜의 주문서에 나타난다
//     pick_pulled_reason text      사유(「고객이슈 교환」·「직접 선택 · 메모」)
//     pick_pulled_prev jsonb       가져오기 전 {picked_at, collected_at, invoice_printed_at} — 「빼기」 원복용

export type PickPullPrev = {
  picked_at?: string | null;
  collected_at?: string | null;
  invoice_printed_at?: string | null;
};

export type PickPullInfo = {
  /** 가져온 날짜 YYYY-MM-DD(KST) */
  pulledFor: string;
  pulledAt: string | null;
  reason: string;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function kstDateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "2026-10-18" → "10.18(토)" · ISO 시각도 받음. 알 수 없으면 "" */
export function shortDateWithWeekday(value: string | null | undefined): string {
  if (!value) return "";
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : kstDateKeyOf(value);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}(${WEEKDAY_KO[dow]})`;
}

// [2026-10-23 사장님 「헷갈려 죽겠어」] 이름을 «출고 넘기기»로 통일.
//   받는 쪽(넘긴 출고의 주문서·송장·챙기기): 「지난 주문 10.11(토) · 늦게 입고」 (10-23 14:32 사장님 — 「넘겨받은」 어색 → 「지난 주문」)
//   보낸 쪽(원래 주문):                       「10.22(목) 남녀공용의류 출고로 넘김」

/** 받는 쪽 한 줄: 「지난 주문 10.11(토) · 사유」 */
export function pickPullBadgeText(originalCreatedAt: string | null | undefined, reason: string | null | undefined): string {
  const when = shortDateWithWeekday(originalCreatedAt);
  const why = String(reason ?? "").trim();
  return ["지난 주문" + (when ? ` ${when}` : ""), why].filter(Boolean).join(" · ");
}

/** 보낸 쪽 한 줄: 「10.22(목) 남녀공용의류 출고로 넘김」 — 대상 이름이 없으면(옛 기록) 날짜로 */
export function pickPullAwayText(pulledFor: string | null | undefined, targetLabel?: string | null): string {
  const label = String(targetLabel ?? "").trim() || shortDateWithWeekday(pulledFor);
  return label ? `${label} 출고로 넘김` : "출고 넘김";
}

/** [2026-10-25 완전 이동] 옮겨 온 쪽: 「10.22(목) 남녀공용의류에서 옮김 · 사유」 */
export function pickPullMovedFromText(fromLabel: string | null | undefined, reason: string | null | undefined): string {
  const from = String(fromLabel ?? "").trim();
  const why = String(reason ?? "").trim();
  return [from ? `${from}에서 옮김` : "옮겨 온 주문", why].filter(Boolean).join(" · ");
}

/** [2026-10-25 완전 이동] 원래 주문(전체보기): 「10.25(일) 남녀공용의류로 옮김」 */
export function pickPullMovedToText(pulledFor: string | null | undefined, targetLabel?: string | null): string {
  const label = String(targetLabel ?? "").trim() || shortDateWithWeekday(pulledFor);
  if (!label) return "옮김";
  // 받침 있으면 「으로」, 없거나 ㄹ 받침이면 「로」(한글 아닌 끝 글자는 「로」)
  const code = label.charCodeAt(label.length - 1) - 0xac00;
  const jong = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${label}${jong && jong !== 8 ? "으로" : "로"} 옮김`;
}

/** 넘길 곳 이름 — 방송: 「10.22(목) 남녀공용의류」 / 쇼핑몰 날짜: 「10.23(금) 쇼핑몰 주문」 */
export function pullTargetLabelForBroadcast(title: string | null | undefined, startedAt: string | null | undefined): string {
  return [shortDateWithWeekday(startedAt), String(title ?? "").trim() || "방송"].filter(Boolean).join(" ");
}
export function pullTargetLabelForDate(dateKey: string): string {
  return `${shortDateWithWeekday(dateKey)} 쇼핑몰 주문`;
}

export type PickPullView = { kind: "broadcast"; broadcastId: string; startedDay: string } | { kind: "date"; day: string } | { kind: "none" };

/** 넘겨받은 묶음이 지금 보는 주문서(방송/쇼핑몰 날짜)에 붙는지.
 *  방송: 그 방송으로 넘긴 것. 쇼핑몰 날짜: 방송 아닌 그 날짜로 넘긴 것.
 *  옛 기록(대상 방송·이름 없음)은 예전처럼 날짜로 — 그 날짜 쇼핑몰 화면과 그날 시작한 방송에 붙는다. */
export function pickPullMatchesView(pull: { pulledFor: string; broadcastId?: string | null; target?: string | null }, view: PickPullView): boolean {
  if (view.kind === "none") return false;
  const bc = String(pull.broadcastId ?? "").trim();
  const legacy = !bc && !String(pull.target ?? "").trim();
  if (view.kind === "broadcast") return bc ? bc === view.broadcastId : legacy && Boolean(view.startedDay) && pull.pulledFor === view.startedDay;
  return !bc && pull.pulledFor === view.day;
}

/** 줄이 «가져온 줄»인지(가져온 날짜가 있으면 참 — 챙겼든 안 챙겼든 그날 주문서에 남는다) */
export function isPulledRow(row: { pick_pulled_for?: string | null; pick_pulled_at?: string | null } | null | undefined): boolean {
  return Boolean(row && (row.pick_pulled_for || row.pick_pulled_at));
}

/** 가져온 날짜(YYYY-MM-DD). pick_pulled_for 없고 pick_pulled_at 만 있으면 그 날짜(KST) */
export function pulledForOf(row: { pick_pulled_for?: string | null; pick_pulled_at?: string | null } | null | undefined): string {
  if (!row) return "";
  const forKey = String(row.pick_pulled_for ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(forKey)) return forKey.slice(0, 10);
  return kstDateKeyOf(row.pick_pulled_at ?? null);
}

/** 가져오기 요청 검사 — 행 id 숫자만, 사유 1~80자(없으면 기본값) */
export type PickPullTarget = { type: "broadcast"; broadcastId: string } | { type: "date"; date: string };

export function parsePickPullRequest(input: unknown): { action: "pull" | "unpull"; rowIds: number[]; reason: string; target: PickPullTarget | null } {
  const value = (input ?? {}) as { action?: unknown; rowIds?: unknown; reason?: unknown; target?: unknown };
  const action = value.action === "unpull" ? "unpull" : value.action === "pull" ? "pull" : null;
  if (!action) throw new Error("요청 종류가 올바르지 않습니다.");
  const rowIds = Array.isArray(value.rowIds)
    ? Array.from(new Set(value.rowIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)))
    : [];
  if (rowIds.length === 0) throw new Error("가져올 상품 줄을 골라 주세요.");
  if (rowIds.length > 200) throw new Error("한 번에 200줄까지만 가져올 수 있습니다.");
  const reason = String(value.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "직접 선택";
  const t = (value.target ?? null) as { type?: unknown; broadcastId?: unknown; date?: unknown } | null;
  let target: PickPullTarget | null = null;
  if (t && t.type === "broadcast" && String(t.broadcastId ?? "").trim()) target = { type: "broadcast", broadcastId: String(t.broadcastId).trim().slice(0, 64) };
  else if (t && t.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(t.date ?? ""))) target = { type: "date", date: String(t.date) };
  else if (t) throw new Error("넘길 곳(방송·날짜)이 올바르지 않습니다.");
  if (action === "pull" && !target) throw new Error("어느 출고로 넘길지 골라 주세요.");
  return { action, rowIds, reason, target };
}

/** 「빼기」 원복 값 — prev 가 없으면 아무것도 되돌리지 않는다(null 유지) */
export function restoreFromPrev(prev: unknown): PickPullPrev {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
  return { picked_at: pick("picked_at"), collected_at: pick("collected_at"), invoice_printed_at: pick("invoice_printed_at") };
}

/** 엑셀 구분 칸 값이 가져오기 표식인지(「지난 주문 …」/「… 로 가져감」) — 물건챙기기 엑셀에서 본 시트에 남긴다 */
export function isPickPullKind(kind: string | null | undefined): boolean {
  const k = String(kind ?? "");
  return k.startsWith("넘겨받은 주문") || k.endsWith("출고로 넘김") || k === "출고 넘김" || k.startsWith("지난 주문") || k.endsWith("로 가져감") || k === "가져감";
}
