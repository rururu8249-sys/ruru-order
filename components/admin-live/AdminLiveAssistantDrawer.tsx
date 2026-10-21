"use client";

// [2026-10-22 AI 비서 1단계] 「비서」 창 — 손님·주문·상품 찾기(읽기 전용).
//   대충 입력해도 비슷한 닉네임·이름·상품명을 찾는다(lib/assistantSearch). 돈·주문상태는 보기만.
//   DESIGN-ADMIN: 흰 판 · 주버튼 1개(「찾기」) · 칩 36 full · 상태 배지 §7 · 이모지 없음 · 설명 한 줄.

import { useRef, useState } from "react";
import AdminLiveSideDrawer from "./AdminLiveSideDrawer";

type Mode = "auto" | "customer" | "product";
type Range = "3m" | "all";

type OrderCard = {
  orderNo: string;
  createdAt: string | null;
  summary: string;
  amount: number;
  paymentLabel: string;
  paymentCode: string;
  shippingLabel: string;
  paymentMethod: string;
};

type PersonResult = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  blocked: boolean;
  match: string;
  matchKind: string;
  matchedLabel: string;
  matchedValue: string;
  lastOrderAt: string | null;
  orderCount: number;
  orders: OrderCard[];
};

type ProductResult = {
  id: number;
  name: string;
  detail: string;
  price: number;
  photo: string;
  createdAt: string | null;
  hidden: boolean;
  match: string;
  matchKind: string;
};

type BuyerRow = {
  orderNo: string;
  createdAt: string | null;
  nickname: string;
  name: string;
  productName: string;
  option: string;
  qty: number;
  paymentLabel: string;
  paymentCode: string;
  shippingLabel: string;
};

type Result =
  | { kind: "customer"; via: string; query: string; total: number; people: PersonResult[] }
  | { kind: "product"; via: string; query: string; total: number; products: ProductResult[]; buyerOrderCount: number; buyerQty: number; buyers: BuyerRow[]; buyersTruncated: boolean }
  | { kind: "unknown"; via: string; query: string };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const y = k.getUTCFullYear();
  const md = `${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")}`;
  const nowY = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  return `${y === nowY ? "" : `${y}.`}${md}(${WEEK[k.getUTCDay()]})`;
}
const won = (n: number) => `${(Number(n) || 0).toLocaleString("ko-KR")}원`;

function statusTone(code: string): string {
  if (code === "canceled") return "bg-surface-2 text-ink-soft";
  if (code === "paid" || code === "auto_paid" || code === "manual_paid" || code === "card_paid") return "bg-ok-bg text-ok-tx";
  return "bg-warn-bg text-warn-tx";
}

function StatusBadges({ paymentLabel, paymentCode, shippingLabel }: { paymentLabel: string; paymentCode: string; shippingLabel: string }) {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {paymentLabel ? <span className={`inline-flex h-6 items-center rounded-lg px-2 text-[12px] font-semibold ${statusTone(paymentCode)}`}>{paymentLabel}</span> : null}
      {shippingLabel ? (
        <span className={`inline-flex h-6 items-center rounded-lg px-2 text-[12px] font-semibold ${shippingLabel === "택배출고" ? "bg-ink text-white" : "bg-surface-2 text-ink-soft"}`}>{shippingLabel}</span>
      ) : null}
    </span>
  );
}

const chipClass = (on: boolean) =>
  `inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition focus-visible:outline-2 focus-visible:outline-ink ${
    on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"
  }`;

export default function AdminLiveAssistantDrawer({
  onClose,
  onShowInOrders,
}: {
  onClose: () => void;
  /** 「주문서에서 보기」 — 실시간 주문서 검색칸에 이 글자를 넣고 기간 전체로 */
  onShowInOrders: (keyword: string) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [range, setRange] = useState<Range>("3m");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(nextRange: Range = range, nextMode: Mode = mode) {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin-live/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q, range: nextRange, mode: nextMode === "auto" ? undefined : nextMode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message || "찾지 못했어요. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      const query = data.kind === "product" ? data.intent?.product : data.intent?.name;
      setResult({ ...data, query: String(query || q) });
    } catch {
      setError("연결이 끊겼어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLiveSideDrawer title="비서" width={560} onClose={onClose}>
      <div className="space-y-3 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void run(); }}
        >
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 홍길 주문한 사람 · 폴로자켓 산 사람"
            aria-label="찾을 내용"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[14px]"
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition disabled:opacity-40"
          >
            {loading ? "찾는 중" : "찾기"}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {([["auto", "자동"], ["customer", "손님"], ["product", "상품"]] as [Mode, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={mode === k} className={chipClass(mode === k)}
              onClick={() => { setMode(k); if (result && text.trim()) void run(range, k); }}>{label}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {([["3m", "최근 3개월"], ["all", "전체"]] as [Range, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={range === k} className={chipClass(range === k)}
              onClick={() => { setRange(k); if (result && text.trim()) void run(k, mode); }}>{label}</button>
          ))}
        </div>

        {error ? <p className="text-[13px] font-semibold text-danger-tx">{error}</p> : null}

        {!result && !error ? (
          <p className="text-[12px] text-ink-mute">닉네임 일부·초성·오타도 비슷한 걸 찾아요.</p>
        ) : null}

        {result?.kind === "unknown" ? (
          <p className="text-[13px] text-ink-soft">무엇을 찾을지 모르겠어요. 위에서 「손님」이나 「상품」을 고르고 다시 찾아 주세요.</p>
        ) : null}

        {result?.kind === "customer" ? (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold text-ink">손님 {result.total}명</h3>
              <span className="truncate text-[12px] text-ink-mute">「{result.query}」{result.total > result.people.length ? ` · 위 ${result.people.length}명만 보여요` : ""}</span>
            </div>
            {result.people.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-soft">비슷한 손님이 없어요. 글자를 줄이거나 「전체」 기간으로 찾아 보세요.</p>
            ) : null}
            {result.people.map((p) => (
              <article key={p.key} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-bold text-ink">{p.nickname}</span>
                      {p.name ? <span className="text-[13px] text-ink-soft">{p.name}</span> : null}
                      <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{p.match}</span>
                      {p.blocked ? <span className="inline-flex h-6 items-center rounded-lg bg-danger-bg px-2 text-[12px] font-semibold text-danger-tx">차단</span> : null}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-mute tabular-nums">
                      {[p.phone, p.lastOrderAt ? `마지막 주문 ${dateLabel(p.lastOrderAt)}` : "주문 없음", `주문 ${p.orderCount}건`].filter(Boolean).join(" · ")}
                      {p.matchedValue && p.matchedValue !== p.nickname && p.matchedValue !== p.name ? ` · ${p.matchedLabel} ${p.matchedValue}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => onShowInOrders(p.nickname !== "-" ? p.nickname : p.name)}
                    className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                    주문서에서 보기
                  </button>
                </div>
                {p.orders.length > 0 ? (
                  <ul className="mt-2 divide-y divide-line border-t border-line">
                    {p.orders.map((o) => (
                      <li key={o.orderNo} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 py-2">
                        <span className="text-[12px] text-ink-mute tabular-nums">{dateLabel(o.createdAt)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-ink" title={o.summary}>{o.summary}</span>
                          <span className="block text-[12px] text-ink-mute tabular-nums">{won(o.amount)} · {o.paymentMethod} · {o.orderNo}</span>
                        </span>
                        <StatusBadges paymentLabel={o.paymentLabel} paymentCode={o.paymentCode} shippingLabel={o.shippingLabel} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        {result?.kind === "product" ? (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold text-ink">상품 {result.total}개</h3>
              <span className="truncate text-[12px] text-ink-mute">「{result.query}」</span>
            </div>
            {result.products.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-soft">비슷한 상품이 없어요. 글자를 줄여서 찾아 보세요.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {result.products.map((p) => (
                  <li key={p.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 p-2.5">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-12 w-12 rounded-lg bg-surface-2 object-cover" loading="lazy" />
                    ) : <span className="h-12 w-12 rounded-lg bg-surface-2" aria-hidden />}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink">{p.name}</span>
                      {p.detail ? <span className="block truncate text-[12px] text-ink-soft">{p.detail}</span> : null}
                      <span className="block text-[12px] text-ink-mute tabular-nums">{won(p.price)} · 등록 {dateLabel(p.createdAt)}{p.hidden ? " · 숨김" : ""}</span>
                    </span>
                    <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{p.match}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-baseline justify-between gap-2 pt-1">
              <h3 className="text-[16px] font-bold text-ink">산 손님 <span className="tabular-nums">{result.buyerOrderCount}</span>건</h3>
              <span className="text-[12px] text-ink-mute tabular-nums">수량 {result.buyerQty}개{result.buyersTruncated ? " · 최근 것만 보여요" : ""}</span>
            </div>
            {result.buyers.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-soft">이 기간에 산 손님이 없어요. 「전체」 기간으로 찾아 보세요.</p>
            ) : (
              <>
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {result.buyers.map((b, i) => (
                    <li key={`${b.orderNo}-${i}`} className="grid grid-cols-[72px_1fr_40px_auto] items-center gap-2 px-2.5 py-2">
                      <span className="text-[12px] text-ink-mute tabular-nums">{dateLabel(b.createdAt)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">{b.nickname}{b.name && b.name !== b.nickname ? <span className="font-normal text-ink-soft"> · {b.name}</span> : null}</span>
                        <span className="block truncate text-[12px] text-ink-mute" title={`${b.productName} ${b.option}`}>{b.productName}{b.option ? ` · ${b.option}` : ""}</span>
                      </span>
                      <span className="text-right text-[13px] text-ink tabular-nums">{b.qty}개</span>
                      <StatusBadges paymentLabel={b.paymentLabel} paymentCode={b.paymentCode} shippingLabel={b.shippingLabel} />
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => onShowInOrders(result.query)}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                  주문서에서 보기
                </button>
              </>
            )}
          </section>
        ) : null}
      </div>
    </AdminLiveSideDrawer>
  );
}
