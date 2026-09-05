"use client";

// components/admin-live/CustomerFullOrderHistory.tsx
// [2026-09-05 사장님 요청] 회원 상세 「주문 이력」을 전 기간으로 — 관리자는 옛 주문까지 다 봐야 한다.
//   기존엔 대시보드가 이미 불러온 최근 500건에서 잘라 보여줘 옛 주문이 안 보였다.
//   정체성 = 카카오ID(8/31 원칙, 9/5 재확정): kakao_id 가 같은 주문만 "이 사람" 주문.
//   전화번호는 kakao_id 가 안 찍힌 옛 주문을 찾을 때만 폴백. 다른 카카오 계정 주문은 전화가 같아도 제외.
//   읽기 전용 — DB에 아무것도 쓰지 않는다. 주문/입금/정산/포인트 로직 무접촉.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { koreanPhoneVariants } from "@/lib/order/phone";

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

// 입금상태 분류 — AdminLiveCustomersPanel.isPaid/isUnpaid 와 같은 낱말 기준(표시 전용)
function classify(text: string): { kind: Kind; label: string } {
  const t = text.toLowerCase();
  if (/주문서취소|주문취소|취소|환불|cancel|refund/.test(t)) return { kind: "canceled", label: "주문서취소" };
  if (/manual_match_needed|입금확인 필요|입금매칭 필요|수동확인/.test(t)) return { kind: "unpaid", label: "입금매칭 필요" };
  if (/card_unpaid|카드 미결제|카드미결제/.test(t)) return { kind: "unpaid", label: "카드 미결제" };
  if (/카드결제완료|card_paid/.test(t)) return { kind: "paid", label: "카드결제완료" };
  if (/자동입금확인|auto_paid/.test(t)) return { kind: "paid", label: "자동입금확인" };
  if (/수동입금확인|manual_paid/.test(t)) return { kind: "paid", label: "수동입금확인" };
  if (/입금확인|결제완료|출고|paid/.test(t)) return { kind: "paid", label: "입금확인" };
  return { kind: "unpaid", label: "미입금" };
}

function fmtDate(v: unknown) {
  const d = new Date(String(v || ""));
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rowAmount(r: Row) {
  const f = r.final_amount;
  if (f !== null && f !== undefined && Number.isFinite(Number(f))) return num(f);
  return num(r.adjusted_total_price ?? r.total_price ?? 0);
}

function rowItemLabel(r: Row) {
  const opt = [clean(r.color), clean(r.size)].filter(Boolean).join("/");
  const qty = num(r.qty) || 1;
  return `${clean(r.product_name) || clean(r.memo) || "상품"}${opt ? ` (${opt})` : ""} ×${qty}`;
}

function badgeStyle(kind: Kind): React.CSSProperties {
  if (kind === "paid") return { background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" };
  if (kind === "canceled") return { background: "var(--color-surface-3)", color: "var(--color-ink-soft)" };
  return { background: "var(--color-warn-bg)", color: "var(--color-warn-tx)" };
}

export default function CustomerFullOrderHistory({ kakaoId, phone }: { kakaoId: string; phone: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState("");

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
      const { data, error: qError } = await q.order("created_at", { ascending: false }).limit(2000);
      if (!alive) return;
      if (qError) { setError(qError.message); setRows([]); return; }

      const list = (data || []).filter((r: Row) => {
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
  }, [safeKakao, phoneDigits]);

  const groups = useMemo<OrderGroup[]>(() => {
    if (!rows) return [];
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = clean(r.order_group_id) || `id:${r.id}`;
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

  const counts = useMemo(() => ({
    all: groups.length,
    paid: groups.filter((g) => g.kind === "paid").length,
    unpaid: groups.filter((g) => g.kind === "unpaid").length,
    canceled: groups.filter((g) => g.kind === "canceled").length,
    paidAmount: groups.filter((g) => g.kind === "paid").reduce((s, g) => s + g.amount, 0),
  }), [groups]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chip = (value: Filter, label: string, n: number) => (
    <button
      type="button"
      key={value}
      onClick={() => { setFilter(value); setPage(1); }}
      style={{ border: "1px solid", borderColor: filter === value ? "var(--color-rose-deep)" : "var(--color-line)", background: filter === value ? "var(--color-rose-deep)" : "var(--color-surface)", color: filter === value ? "#fff" : "var(--color-ink-soft)", borderRadius: "999px", padding: "3px 9px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
    >
      {label} {n}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)" }}>
          주문 이력 <span style={{ color: "var(--color-ink-mute)", fontWeight: 700 }}>· 전 기간 {counts.all}건 · 입금완료 {money(counts.paidAmount)}</span>
        </span>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }}
          style={{ height: "26px", borderRadius: "8px", border: "1px solid var(--color-line)", background: "var(--color-surface)", padding: "0 6px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink)" }}
        >
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="amount">금액순</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" }}>
        {chip("all", "전체", counts.all)}
        {chip("paid", "입금확인", counts.paid)}
        {chip("unpaid", "미입금", counts.unpaid)}
        {chip("canceled", "취소", counts.canceled)}
      </div>

      {rows === null ? (
        <div style={{ textAlign: "center", padding: "18px 0", fontSize: "12px", color: "var(--color-ink-mute)" }}>주문 이력 불러오는 중…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "18px 0", fontSize: "12px", color: "var(--color-danger-tx)" }}>주문 이력 조회 실패: {error}</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", fontSize: "12px", color: "var(--color-ink-mute)" }}>주문 내역이 없습니다.</div>
      ) : (
        visible.map((g) => {
          const open = openKey === g.key;
          return (
            <div key={g.key} style={{ borderBottom: "1px solid var(--color-surface-2)" }}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? "" : g.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ width: "86px", flexShrink: 0, fontSize: "11px", color: "var(--color-ink-mute)" }}>{fmtDate(g.createdAt)}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", color: "var(--color-ink-soft)" }} title={g.summary}>
                  {g.summary}
                  {!g.kakaoLinked ? <span style={{ marginLeft: "5px", fontSize: "10px", fontWeight: 800, color: "var(--color-warn-tx)" }}>전화만</span> : null}
                </span>
                <b style={{ fontSize: "12px", color: "var(--color-ink)", flexShrink: 0 }}>{money(g.amount)}</b>
                <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", ...badgeStyle(g.kind) }}>{g.statusLabel}</span>
                <span style={{ flexShrink: 0, fontSize: "11px", color: "var(--color-ink-mute)" }}>{open ? "▲" : "▼"}</span>
              </button>
              {open ? (
                <div style={{ margin: "0 0 10px 0", padding: "8px 10px", borderRadius: "10px", background: "var(--color-surface-2)", fontSize: "11px", color: "var(--color-ink-soft)", lineHeight: 1.6 }}>
                  {g.rows.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{rowItemLabel(r)}</span>
                      <span style={{ flexShrink: 0, fontWeight: 700, color: "var(--color-ink)" }}>{money(num(r.adjusted_product_price ?? (num(r.product_price) * (num(r.qty) || 1))))}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: "4px", paddingTop: "4px", borderTop: "1px dashed var(--color-line)" }}>
                    배송비 {money(g.shipping)}{g.points > 0 ? ` · 포인트 사용 ${money(g.points)}` : ""}{g.paymentMethod ? ` · ${g.paymentMethod}` : ""} · <b style={{ color: "var(--color-ink)" }}>최종 {money(g.amount)}</b>
                  </div>
                  {g.address ? <div>📦 {g.address}</div> : null}
                  <div style={{ color: "var(--color-ink-mute)" }}>
                    {g.broadcast ? `${g.broadcast} · ` : ""}{g.code ? `주문번호 ${g.code} · ` : ""}{g.rows.length}줄{g.kakaoLinked ? "" : " · 카카오 미연동(전화번호로 찾음)"}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {totalPages > 1 ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "12px" }}>
          <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} style={{ border: "1px solid var(--color-line)", borderRadius: "8px", background: "var(--color-surface)", padding: "5px 12px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", cursor: "pointer" }}>이전</button>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)" }}>{safePage} / {totalPages}</span>
          <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} style={{ border: "1px solid var(--color-line)", borderRadius: "8px", background: "var(--color-surface)", padding: "5px 12px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", cursor: "pointer" }}>다음</button>
        </div>
      ) : null}
    </div>
  );
}
