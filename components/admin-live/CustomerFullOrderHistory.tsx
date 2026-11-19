"use client";

// components/admin-live/CustomerFullOrderHistory.tsx
// [2026-09-05 사장님 요청] 회원 상세 「주문 이력」을 전 기간으로 — 관리자는 옛 주문까지 다 봐야 한다.
//   기존엔 대시보드가 이미 불러온 최근 500건에서 잘라 보여줘 옛 주문이 안 보였다.
//   정체성 = 카카오ID(8/31 원칙, 9/5 재확정): kakao_id 가 같은 주문만 "이 사람" 주문.
//   전화번호는 kakao_id 가 안 찍힌 옛 주문을 찾을 때만 폴백. 다른 카카오 계정 주문은 전화가 같아도 제외.
//   읽기 전용 — DB에 아무것도 쓰지 않는다. 주문/입금/정산/포인트 로직 무접촉.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { koreanPhoneVariants } from "@/lib/order/phone";
import {classifyLifetimeOrder,lifetimeLineAmount,lifetimeGroupKey,calculateLifetimeStats} from "@/lib/customerLifetimeStats";
import AdminSelect from "./AdminSelect";

type Row = Record<string, any>;
type Kind = "paid" | "unpaid" | "canceled";
type Filter = "all" | Kind;
type Sort = "latest" | "oldest" | "amount";

type OrderGroup = {
  key: string;
  code: string;
  createdAt: string;
  rows: Row[];
  amount: number;
  shipping: number;
  points: number;
  kind: Kind;
  statusLabel: string;
  address: string;
  broadcast: string;
  paymentMethod: string;
  summary: string;
  kakaoLinked: boolean;
};

const PAGE_SIZE = 10;

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

// 회원 목록·상세가 공통으로 사용하는 상태 분류(취소 > 미결제 > 결제완료).
const classify=classifyLifetimeOrder;

export function fmtDate(v: unknown) {
  const d = new Date(String(v || ""));
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rowAmount(r: Row) { return lifetimeLineAmount(r); }

export function rowItemLabel(r: Row) {
  const opt = [clean(r.color), clean(r.size)].filter(Boolean).join("/");
  const qty = num(r.qty) || 1;
  return `${clean(r.product_name) || clean(r.memo) || "상품"}${opt ? ` (${opt})` : ""} ×${qty}`;
}

function badgeStyle(kind: Kind): React.CSSProperties {
  if (kind === "paid") return { background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" };
  if (kind === "canceled") return { background: "var(--color-surface-3)", color: "var(--color-ink-soft)" };
  return { background: "var(--color-warn-bg)", color: "var(--color-warn-tx)" };
}

export type CustomerFullOrderStats = { all: number; paid: number; unpaid: number; canceled: number; paidAmount: number; latestOrderAt?: string };

export default function CustomerFullOrderHistory({ kakaoId, phone, onStats, onLoadState, refreshKey = 0 }: { kakaoId: string; phone: string; onStats?: (stats: CustomerFullOrderStats | null) => void; onLoadState?: (state: 'loading' | 'ready' | 'error') => void; refreshKey?: number }) {
  const historyId = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const safeKakao = String(kakaoId || "").trim().replace(/[^0-9A-Za-z_-]/g, "");
  const phoneDigits = String(phone || "").replace(/[^0-9]/g, "");

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError("");
    setPage(1);
    setOpenKey("");

    const run = async () => {
      const phoneValues = koreanPhoneVariants(phoneDigits);
      if (!safeKakao && phoneValues.length === 0) { setRows([]); return; }

      let q = supabase
        .from("orders")
        .select(
          "id, order_group_id, order_lookup_code, created_at, kakao_id, customer_phone, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, adjusted_shipping_fee, total_price, adjusted_total_price, final_amount, point_used_amount, payment_method, order_manage_status, shipping_status, admin_order_status_v2, zipcode, address, detail_address, broadcast_name, memo, is_deleted",
        );
      if (safeKakao && phoneValues.length > 0) {
        q = q.or(`kakao_id.eq.${safeKakao},customer_phone.in.(${phoneValues.join(",")})`);
      } else if (safeKakao) {
        q = q.eq("kakao_id", safeKakao);
      } else {
        q = q.in("customer_phone", phoneValues);
      }
      // Paginate the entire member history. A hard 2,000-row cap silently lied about lifetime totals.
      const allRows: Row[] = [];
      let fetchError = '';
      let complete = false;
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
      for(let from=0;from<100000;from+=1000){
        const page=await q.range(from,from+999);
        if(page.error){fetchError=page.error.message;break;}
        const chunk=(page.data||[]) as Row[];
        allRows.push(...chunk);
        if(chunk.length<1000){complete=true;break;}
      }
      if (!alive) return;
      if (fetchError || !complete) { setError(fetchError || '전체 이력을 읽지 못했습니다.'); setRows([]); return; }

      const list = allRows.filter((r: Row) => {
        if (r.is_deleted === true) return false;
        // 카카오 손님: 내 kakao_id 주문 또는 kakao_id 없는(옛) 주문만. 다른 카카오 계정 주문은 제외.
        if (safeKakao) {
          const rk = clean(r.kakao_id);
          if (rk && rk !== safeKakao) return false;
        }
        return true;
      });
      setRows(list);
    };
    run().catch((e) => { if (alive) { setError(e instanceof Error ? e.message : String(e)); setRows([]); } });
    return () => { alive = false; };
  }, [safeKakao, phoneDigits, retryKey, refreshKey]);

  const groups = useMemo<OrderGroup[]>(() => {
    if (!rows) return [];
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = lifetimeGroupKey(r);
      const arr = map.get(key);
      if (arr) arr.push(r); else map.set(key, [r]);
    }
    const out: OrderGroup[] = [];
    map.forEach((grpRows, key) => {
      const first = grpRows[0];
      const statusText = grpRows.map((r) => [r.order_manage_status, r.shipping_status, r.admin_order_status_v2].map(clean).filter(Boolean).join(" ")).join(" ");
      const c = classify(statusText);
      out.push({
        key,
        code: clean(first.order_lookup_code),
        createdAt: clean(first.created_at),
        rows: grpRows,
        amount: grpRows.reduce((s, r) => s + rowAmount(r), 0),
        shipping: grpRows.reduce((s, r) => s + num(r.adjusted_shipping_fee ?? r.shipping_fee ?? 0), 0),
        points: grpRows.reduce((s, r) => s + num(r.point_used_amount), 0),
        kind: c.kind,
        statusLabel: c.label,
        address: [clean(first.address), clean(first.detail_address)].filter(Boolean).join(" "),
        broadcast: clean(first.broadcast_name),
        paymentMethod: clean(first.payment_method) === "카드결제" ? "카드" : clean(first.payment_method) ? "무통장" : "",
        summary: grpRows.map(rowItemLabel).join(", "),
        kakaoLinked: grpRows.some((r) => Boolean(clean(r.kakao_id))),
      });
    });
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const list = groups.filter((g) => (filter === "all" ? true : g.kind === filter));
    list.sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [groups, filter, sort]);

  const counts = useMemo(() => calculateLifetimeStats(rows || []), [rows]);

  // [2026-09-09 사장님 지적] 회원 상세 위쪽 「누적 주문·누적 결제」가 0으로 보였다.
  //   원인: 그 3칸은 «주문서 화면에 로드된 주문»만 세는데, 옛 주문(예: 5~7월)은 거기 없다.
  //   → 여기서 «전 기간 DB 조회»로 이미 센 값을 부모에게 그대로 올려준다. 아래 「주문 이력」과 항상 같은 숫자가 된다.
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onLoadStateRef = useRef(onLoadState);
  onLoadStateRef.current = onLoadState;
  useEffect(() => {
    onLoadStateRef.current?.(error ? 'error' : rows === null ? 'loading' : 'ready');
    if (rows === null || error) { onStatsRef.current?.(null); return; }
    onStatsRef.current?.(counts);
  }, [rows, counts, error]);
  const ready = rows !== null && !error;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chip = (value: Filter, label: string, count: number) => (
    <button type="button" key={value} disabled={!ready} aria-pressed={filter === value}
      onClick={() => { setFilter(value); setPage(1); }}
      className={`min-h-11 rounded-full border px-3 text-[13px] tabular-nums disabled:opacity-50 sm:min-h-9 ${filter === value ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>
      {label} {ready ? count : '…'}
    </button>
  );

  return (
    <section aria-label="회원 주문 이력" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-bold text-ink">주문 이력</h3>
          <span className="text-xs text-ink-mute">전체 기간</span>
        </div>
        <AdminSelect label="주문 이력 정렬" value={sort} disabled={!ready}
          options={[{ value: "latest", label: "최신순" }, { value: "oldest", label: "오래된순" }, { value: "amount", label: "금액순" }]}
          onChange={value => { setSort(value); setPage(1); }} className="w-[128px]" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {chip("all", "전체", counts.all)}
        {chip("paid", "결제완료", counts.paid)}
        {chip("unpaid", "미입금", counts.unpaid)}
        {chip("canceled", "취소", counts.canceled)}
      </div>

      {rows === null ? (
        <p role="status" className="py-6 text-center text-[13px] text-ink-mute">주문 이력 불러오는 중…</p>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 py-4 text-[13px] text-danger-tx">
          <span>주문 이력을 불러오지 못했습니다.</span>
          <button type="button" onClick={() => setRetryKey(value => value + 1)} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink">다시 조회</button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-mute">{filter === "all" ? "등록된 주문 이력이 없습니다." : "해당 주문이 없습니다. 전체 필터를 확인해 주세요."}</p>
      ) : (
        <div className="space-y-4">
          {visible.map(group => {
            const open = openKey === group.key;
            const contentId = `${historyId}-${encodeURIComponent(group.key)}`;
            return <article key={group.key} aria-label={group.code ? `주문 ${group.code}` : `${fmtDate(group.createdAt)} 주문`}
              className="rounded-xl border border-line bg-surface">
              <button type="button" aria-expanded={open} aria-controls={open ? contentId : undefined} onClick={() => setOpenKey(open ? "" : group.key)}
                className={`block min-h-11 w-full min-w-0 bg-surface-2 p-3 text-left hover:opacity-80 ${open ? "rounded-t-xl" : "rounded-xl"}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13px] font-semibold text-ink [overflow-wrap:anywhere]">{group.code ? `주문 ${group.code}` : "주문번호 없는 과거 주문"}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums text-ink-mute">
                      <time>{fmtDate(group.createdAt)}</time>
                      <span>상품 {group.rows.length}줄</span>
                      {!group.kakaoLinked ? <span title="카카오 ID가 없는 과거 주문을 전화번호로 연결했습니다." className="text-warn-tx">전화 연결</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg px-2 py-1 text-right text-xs font-semibold" style={badgeStyle(group.kind)}>{group.statusLabel}</span>
                </span>
                {!open ? <span className="mt-3 line-clamp-2 break-words text-[13px] text-ink-soft [overflow-wrap:anywhere]">{group.summary}</span> : null}
                <span className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-ink-mute">{open ? "접기" : "상품 내역"}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className={`shrink-0 ${open ? "rotate-180" : ""}`}><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span className="text-right text-base font-bold tabular-nums text-ink">{money(group.amount)}</span>
                </span>
              </button>
              {open ? <div id={contentId} className="space-y-3 border-t border-line p-3 text-[13px] leading-5 text-ink-soft">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink-mute"><span>상품</span><span>금액</span></div>
                <ul aria-label="주문 상품" className="divide-y divide-line">
                  {group.rows.map(row => <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{rowItemLabel(row)}</span>
                    <span className="shrink-0 text-right font-semibold tabular-nums text-ink">{money(num(row.adjusted_product_price ?? (num(row.product_price) * (num(row.qty) || 1))))}</span>
                  </li>)}
                </ul>
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-2 border-t border-line pt-3 text-right text-xs tabular-nums">
                  <span>배송비 {money(group.shipping)}</span>
                  {group.points > 0 ? <span>포인트 사용 {Math.round(group.points).toLocaleString("ko-KR")}P</span> : null}
                  {group.paymentMethod ? <span>{group.paymentMethod}</span> : null}
                  <strong className="font-semibold text-ink">최종 {money(group.amount)}</strong>
                </div>
                {group.address ? <div className="border-t border-line pt-3"><p className="text-xs font-semibold text-ink-mute">배송지</p><p className="mt-1 break-words [overflow-wrap:anywhere]">{group.address}</p></div> : null}
                {group.broadcast ? <p className="break-words text-xs text-ink-mute">{group.broadcast}</p> : null}
              </div> : null}
            </article>;
          })}
        </div>
      )}

      {totalPages > 1 ? <nav aria-label="주문 이력 페이지" className="mt-4 flex items-center justify-between gap-2">
        <button type="button" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))} className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft disabled:opacity-40">이전</button>
        <span className="text-xs tabular-nums text-ink-mute">{safePage} / {totalPages}</span>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft disabled:opacity-40">다음</button>
      </nav> : null}
    </section>
  );
}
