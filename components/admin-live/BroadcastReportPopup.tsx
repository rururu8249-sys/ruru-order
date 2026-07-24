"use client";

// [2026-07-24 사장님 지침] 방송 판매 리포트 팝업 — 라이브 현황 패널 "더보기"로 열림.
//   해당 방송 기준: ①KPI(총매출/구매자 수/주문 건수/판매수량/객단가) ②🏆 베스트 품목(수량·매출 토글)
//   ③👤 구매자별 구매 내역(누가 뭘 얼마에 샀는지, 상품금액 표시) + 📋 리포트 복사.
//   집계 기준은 라이브 현황 패널·매출바와 동일(결제완료 = paid/auto_paid/manual_paid/card_paid, 취소 제외).
//   ★ 읽기 전용 — orders SELECT만. 돈/입금/정산/배송/재고 로직 무관. 대시보드 어댑터 재사용으로 숫자 일치 보장.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OrderRow } from "@/lib/admin-v2/types";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "./liveOrderAdapter";
import type { LiveOrder } from "./types";
import { showAdminToast } from "@/lib/adminToast";

const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;
const PAID = new Set(["paid", "auto_paid", "manual_paid", "card_paid"]);

type BroadcastEntry = { id: string; title: string; started_at: string };

type Props = {
  open: boolean;
  onClose: () => void;
  initialBroadcastId: string | null;
};

export default function BroadcastReportPopup({ open, onClose, initialBroadcastId }: Props) {
  const [broadcasts, setBroadcasts] = useState<BroadcastEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [bestSort, setBestSort] = useState<"qty" | "sales">("qty");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerExpand, setBuyerExpand] = useState<string>("");

  // 방송 목록 로드(팝업 열릴 때 1회)
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id, public_title, started_at")
        .neq("is_deleted", true)
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(40);
      const list = ((data as Array<Record<string, unknown>>) || []).map((b) => ({
        id: String(b.id),
        title: String(b.public_title || "제목 없음"),
        started_at: String(b.started_at || ""),
      }));
      setBroadcasts(list);
      setSelectedId((cur) => cur || (initialBroadcastId && list.some((b) => b.id === initialBroadcastId) ? initialBroadcastId : list[0]?.id || ""));
    })();
  }, [open, initialBroadcastId]);

  // 선택 방송 주문 로드 — 대시보드와 동일한 어댑터로 변환(숫자 일치)
  useEffect(() => {
    if (!open || !selectedId) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      const pageSize = 1000;
      let from = 0;
      const all: OrderRow[] = [];
      while (true) {
        const page = await supabase
          .from("orders")
          .select("*")
          .eq("broadcast_id", selectedId)
          .neq("is_deleted", true)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (page.error) {
          if (alive) showAdminToast("리포트 주문 조회 실패\n\n" + page.error.message, "error");
          break;
        }
        const rows = (page.data || []) as OrderRow[];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      if (!alive) return;
      setOrders(buildAdminLiveOrderGroups(all).map(toAdminLiveOrder));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, selectedId]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const report = useMemo(() => {
    // 취소 제외 → 결제완료(paid 계열)만 집계. 라이브 현황 패널과 동일 기준.
    const valid = orders.filter((o) => o.paymentStatus !== "canceled");
    const paid = valid.filter((o) => PAID.has(o.paymentStatus));

    const sales = paid.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const productSales = paid.reduce((s, o) => s + Number(o.productAmount || 0), 0);
    const qtyTotal = paid.reduce((s, o) => s + (o.items || []).reduce((q, it) => q + Number(it.qty || 0), 0), 0);
    const bankCount = paid.filter((o) => o.paymentStatus === "paid" || o.paymentStatus === "auto_paid" || o.paymentStatus === "manual_paid").length;
    const cardCount = paid.filter((o) => o.paymentStatus === "card_paid").length;

    // 베스트 품목: 품목 = 상품명 + 옵션(조합형 세부상품명 포함)
    const itemMap = new Map<string, { name: string; option: string; qty: number; sales: number }>();
    for (const o of paid) {
      for (const it of o.items || []) {
        const option = it.optionText && it.optionText !== "옵션 없음" ? it.optionText : "";
        const key = `${it.productName}|${option}`;
        const cur = itemMap.get(key) || { name: it.productName, option, qty: 0, sales: 0 };
        cur.qty += Number(it.qty || 0);
        cur.sales += Number(it.amount || 0);
        itemMap.set(key, cur);
      }
    }
    const bestAll = Array.from(itemMap.values());

    // 구매자별: 전화번호(없으면 닉네임+이름) 기준 묶음, 금액 큰 순
    const buyerMap = new Map<
      string,
      { nickname: string; name: string; orderCount: number; productSum: number; paySum: number; items: Array<{ label: string; qty: number; amount: number }> }
    >();
    for (const o of paid) {
      const key = o.phone && o.phone !== "-" ? o.phone : `${o.nickname}|${o.name}`;
      const cur = buyerMap.get(key) || { nickname: o.nickname, name: o.name, orderCount: 0, productSum: 0, paySum: 0, items: [] };
      cur.orderCount += 1;
      cur.productSum += Number(o.productAmount || 0);
      cur.paySum += Number(o.totalAmount || 0);
      for (const it of o.items || []) {
        const option = it.optionText && it.optionText !== "옵션 없음" ? ` (${it.optionText})` : "";
        cur.items.push({ label: `${it.productName}${option}`, qty: Number(it.qty || 0), amount: Number(it.amount || 0) });
      }
      buyerMap.set(key, cur);
    }
    const buyers = Array.from(buyerMap.entries())
      .map(([key, b]) => ({ key, ...b }))
      .sort((a, b) => b.paySum - a.paySum);

    return {
      totalCount: valid.length,
      paidCount: paid.length,
      unpaidCount: valid.length - paid.length,
      sales,
      productSales,
      qtyTotal,
      bankCount,
      cardCount,
      avg: paid.length > 0 ? Math.round(sales / paid.length) : 0,
      bestAll,
      buyers,
    };
  }, [orders]);

  const best = useMemo(() => {
    const sorted = [...report.bestAll].sort((a, b) => (bestSort === "qty" ? b.qty - a.qty : b.sales - a.sales));
    return sorted.slice(0, 10);
  }, [report.bestAll, bestSort]);

  const bestMax = useMemo(() => Math.max(1, ...best.map((b) => (bestSort === "qty" ? b.qty : b.sales))), [best, bestSort]);

  const buyersFiltered = useMemo(() => {
    const q = buyerSearch.trim().toLowerCase();
    if (!q) return report.buyers;
    return report.buyers.filter((b) => b.nickname.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
  }, [report.buyers, buyerSearch]);

  const selectedBroadcast = broadcasts.find((b) => b.id === selectedId) || null;
  const dateLabel = (() => {
    const d = new Date(selectedBroadcast?.started_at || "");
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  })();

  // 카톡/메모 복붙용 텍스트 리포트
  const copyReport = async () => {
    const lines: string[] = [];
    lines.push(`[방송 판매 리포트] ${selectedBroadcast?.title || ""} ${dateLabel}`);
    lines.push(`결제완료 기준 · 취소 제외`);
    lines.push("");
    lines.push(`총 매출: ${won(report.sales)}`);
    lines.push(`구매자: ${report.buyers.length}명 · 주문 ${report.paidCount}건 · 판매 ${report.qtyTotal}개`);
    lines.push(`객단가: ${won(report.avg)} · 무통장 ${report.bankCount} · 카드 ${report.cardCount}`);
    lines.push("");
    lines.push(`🏆 베스트 TOP${Math.min(5, best.length)} (${bestSort === "qty" ? "수량순" : "매출순"})`);
    best.slice(0, 5).forEach((b, i) => {
      lines.push(`${i + 1}. ${b.name}${b.option ? ` (${b.option})` : ""} — ${b.qty}개 · ${won(b.sales)}`);
    });
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showAdminToast("리포트가 복사됐습니다.", "success");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showAdminToast("리포트가 복사됐습니다.", "success");
      } catch {
        showAdminToast("복사에 실패했습니다.", "error");
      }
    }
  };

  if (!open) return null;

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(30,20,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(780px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "16px", border: "1px solid var(--color-line)", boxShadow: "0 18px 50px rgba(0,0,0,0.22)", overflow: "hidden" }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid var(--color-line)", flexShrink: 0 }}>
          <span style={{ fontSize: "16px", fontWeight: 900, color: "var(--color-ink)" }}>📊 방송 판매 리포트</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setBuyerExpand("");
            }}
            style={{ flex: 1, minWidth: 0, height: "36px", borderRadius: "9px", border: "1px solid var(--color-line)", padding: "0 10px", fontSize: "13px", fontWeight: 700, background: "var(--color-surface)", color: "var(--color-ink)", cursor: "pointer" }}
          >
            {broadcasts.map((b) => {
              const d = new Date(b.started_at);
              const dl = Number.isNaN(d.getTime()) ? "" : ` · ${d.getMonth() + 1}/${d.getDate()}`;
              return (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {dl}
                </option>
              );
            })}
          </select>
          <button type="button" onClick={copyReport} style={{ flexShrink: 0, height: "34px", padding: "0 12px", borderRadius: "9px", border: "1px solid var(--color-rose-line)", background: "var(--color-rose-soft)", color: "var(--color-rose-deep)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
            📋 복사
          </button>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ flexShrink: 0, width: "34px", height: "34px", borderRadius: "9px", border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        {/* 본문 스크롤 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ok-tx)", background: "var(--color-ok-bg)", borderRadius: "999px", padding: "3px 10px" }}>결제완료 기준 · 취소 제외</span>
            {dateLabel ? <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>{dateLabel} 방송</span> : null}
            {report.unpaidCount > 0 ? <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)" }}>미결제 대기 {report.unpaidCount}건은 집계 제외</span> : null}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-ink-mute)", fontSize: "13px", fontWeight: 700 }}>불러오는 중…</div>
          ) : (
            <>
              {/* KPI 카드 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
                <div style={{ gridColumn: "1 / -1", borderRadius: "12px", padding: "14px 16px", background: "linear-gradient(135deg, var(--color-rose-soft), var(--color-surface-2))", border: "1px solid var(--color-rose-line)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)" }}>총 매출 (결제완료)</div>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "var(--color-rose-deep)", lineHeight: 1.2 }}>{won(report.sales)}</div>
                  <div style={{ marginTop: "3px", fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>
                    상품금액 {won(report.productSales)} · 무통장 {report.bankCount} · 카드 {report.cardCount}
                  </div>
                </div>
                {(
                  [
                    ["구매자", `${report.buyers.length}명`],
                    ["주문", `${report.paidCount}건`],
                    ["판매수량", `${report.qtyTotal.toLocaleString("ko-KR")}개`],
                    ["객단가", won(report.avg)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} style={{ borderRadius: "12px", padding: "12px 10px", textAlign: "center", background: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-ink-mute)", marginBottom: "3px" }}>{label}</div>
                    <div style={{ fontSize: "17px", fontWeight: 900, color: "var(--color-ink)" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* 🏆 베스트 품목 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "7px" }}>
                <span style={{ fontSize: "13px", fontWeight: 900, color: "var(--color-ink)" }}>🏆 베스트 품목 TOP {best.length}</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(
                    [
                      ["qty", "수량순"],
                      ["sales", "매출순"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setBestSort(k)} style={{ height: "26px", padding: "0 10px", borderRadius: "999px", border: "1px solid " + (bestSort === k ? "var(--color-rose-line)" : "var(--color-line)"), background: bestSort === k ? "var(--color-rose-soft)" : "var(--color-surface)", color: bestSort === k ? "var(--color-rose-deep)" : "var(--color-ink-soft)", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ border: "1px solid var(--color-line)", borderRadius: "12px", padding: "6px 12px", marginBottom: "14px", background: "var(--color-surface)" }}>
                {best.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "18px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>결제완료 주문이 없습니다.</div>
                ) : (
                  best.map((b, i) => {
                    const value = bestSort === "qty" ? b.qty : b.sales;
                    const ratio = Math.max(0.04, value / bestMax);
                    return (
                      <div key={`${b.name}|${b.option}`} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", borderBottom: i < best.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <span style={{ width: "26px", flexShrink: 0, textAlign: "center", fontSize: i < 3 ? "15px" : "12px", fontWeight: 900, color: "var(--color-ink-mute)" }}>{medal(i)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", minWidth: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                            {b.option ? <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.option}</span> : null}
                          </div>
                          <div style={{ marginTop: "3px", height: "6px", borderRadius: "999px", background: "var(--color-surface-2)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", borderRadius: "999px", background: i === 0 ? "var(--color-rose-deep)" : "var(--color-rose-line)" }} />
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontSize: "12px", fontWeight: 900, color: "var(--color-rose-deep)" }}>{b.qty.toLocaleString("ko-KR")}개</div>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-ink-soft)" }}>{won(b.sales)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 👤 구매자별 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "7px" }}>
                <span style={{ fontSize: "13px", fontWeight: 900, color: "var(--color-ink)" }}>👤 구매자별 구매 내역 ({report.buyers.length}명)</span>
                <input value={buyerSearch} onChange={(e) => setBuyerSearch(e.target.value)} placeholder="🔍 닉네임·이름" style={{ width: "150px", height: "30px", borderRadius: "8px", border: "1px solid var(--color-line)", padding: "0 9px", fontSize: "12px", outline: "none", color: "var(--color-ink)" }} />
              </div>
              <div style={{ border: "1px solid var(--color-line)", borderRadius: "12px", overflow: "hidden", background: "var(--color-surface)" }}>
                {buyersFiltered.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "18px 0", color: "var(--color-ink-mute)", fontSize: "12px", fontWeight: 700 }}>{buyerSearch ? "검색 결과가 없습니다." : "결제완료 구매자가 없습니다."}</div>
                ) : (
                  buyersFiltered.map((b, i) => {
                    const expanded = buyerExpand === b.key;
                    return (
                      <div key={b.key} style={{ borderBottom: i < buyersFiltered.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <div onClick={() => setBuyerExpand(expanded ? "" : b.key)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", cursor: "pointer", background: expanded ? "var(--color-rose-soft)" : "transparent" }}>
                          <span style={{ width: "24px", flexShrink: 0, textAlign: "center", fontSize: "11px", fontWeight: 900, color: i < 3 ? "var(--color-rose-deep)" : "var(--color-ink-mute)" }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {b.nickname}
                              {b.name && b.name !== "-" && b.name !== b.nickname ? <span style={{ fontWeight: 700, color: "var(--color-ink-soft)" }}> ({b.name})</span> : null}
                            </div>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-ink-soft)", marginTop: "1px" }}>
                              주문 {b.orderCount}건 · {b.items.reduce((s, it) => s + it.qty, 0)}개
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            <div style={{ fontSize: "13px", fontWeight: 900, color: "var(--color-rose-deep)" }}>{won(b.paySum)}</div>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-ink-soft)" }}>상품 {won(b.productSum)}</div>
                          </div>
                          <span style={{ flexShrink: 0, color: "var(--color-ink-soft)", fontSize: "11px" }}>{expanded ? "▴" : "▾"}</span>
                        </div>
                        {expanded ? (
                          <div style={{ padding: "4px 12px 10px 44px", background: "var(--color-surface-2)" }}>
                            {b.items.map((it, j) => (
                              <div key={j} style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "4px 0", borderBottom: j < b.items.length - 1 ? "1px dashed var(--color-line)" : "none" }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: "11px", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                                <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 700, color: "var(--color-ink-soft)" }}>×{it.qty}</span>
                                <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "var(--color-ink)" }}>{won(it.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
