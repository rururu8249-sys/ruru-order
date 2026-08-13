"use client";

// [2026-08-14] 채팅 주문 대기열 — 3단계(눈으로 검증만).
//   유튜브 라이브 채팅을 읽어 파싱한 결과를 표로 보여준다.
//   ⚠️ 이 화면은 장바구니에 담지 않는다. 주문/재고/돈 로직 무접촉.
//   ⚠️ 유튜브 API는 [읽기] 버튼을 누를 때만 호출된다(쿼터 보호). 자동읽기는 기본 꺼짐.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

type Props = { onClose: () => void };

type QueueRow = {
  id: number;
  display_name: string | null;
  raw_message: string | null;
  published_at: string | null;
  parse_status: string | null;
  parsed_product_id: string | null;
  parsed_product_name: string | null;
  parsed_variant: string | null;
  parsed_qty: number | null;
  parsed_matched_by: string | null;
  parsed_options: string | null;
  parsed_candidates: string | null;
  parsed_reason: string | null;
};

type UsageRow = { method: string; calls: number };
type ProductRow = { id: string; name: string; variants?: string[] };
type CurrentProduct = { productId: string; productName: string; setAt: string } | null;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  parsed: { label: "접수후보", cls: "bg-emerald-100 text-emerald-800" },
  need_product: { label: "상품모름", cls: "bg-amber-100 text-amber-800" },
  ambiguous: { label: "후보여럿", cls: "bg-orange-100 text-orange-800" },
  not_order: { label: "주문아님", cls: "bg-slate-100 text-slate-500" },
  raw: { label: "미파싱", cls: "bg-slate-100 text-slate-500" },
};

const MATCHED_LABEL: Record<string, string> = {
  variant: "세부상품",
  number: "번호",
  name: "상품명",
  current: "지금이거",
};

const timeText = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d);
};

export default function ChatOrderQueuePopup({ onClose }: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [broadcastSource, setBroadcastSource] = useState<string>("none");
  const [current, setCurrent] = useState<CurrentProduct>(null);
  const [testUrl, setTestUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [autoRead, setAutoRead] = useState(false);
  const [onlyOrders, setOnlyOrders] = useState(true);
  const [lastRead, setLastRead] = useState("");
  const autoRef = useRef(false);
  autoRef.current = autoRead;

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-orders?limit=200", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) return;
      setRows((json.rows || []) as QueueRow[]);
      setUsage((json.usage || []) as UsageRow[]);
      setEnabled(Boolean(json.enabled));
    } catch { /* 조회 실패는 화면만 비움 */ }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-orders/parse", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) return;
      setProducts((json.products || []) as ProductRow[]);
      setBroadcastSource(String(json.source || "none"));
    } catch { /* 무시 */ }
  }, []);

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-orders/current", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.ok) setCurrent(json.current ?? null);
    } catch { /* 무시 */ }
  }, []);

  useEffect(() => {
    void loadQueue(); void loadProducts(); void loadCurrent();
  }, [loadQueue, loadProducts, loadCurrent]);

  // 유튜브 채팅 1회 읽기 + 파싱
  const readOnce = useCallback(async () => {
    setBusy("read");
    try {
      const res = await fetch("/api/chat-orders/read", { method: "POST", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json) { showAdminToast("읽기 응답 없음", "error"); return; }
      if (json.skipped) setLastRead(`건너뜀 — ${json.reason || ""}`);
      else if (!json.ok) setLastRead(`실패 — ${json.reason || ""}`);
      else setLastRead(`받음 ${json.fetched ?? 0}건 / 새로저장 ${json.stored ?? 0}건`);
      await loadQueue();
    } finally { setBusy(""); }
  }, [loadQueue]);

  // 자동읽기 — 5초. 유튜브 쿼터를 쓰므로 명시적으로 켤 때만 돈다.
  useEffect(() => {
    if (!autoRead) return;
    const t = setInterval(() => { if (autoRef.current) void readOnce(); }, 5000);
    return () => clearInterval(t);
  }, [autoRead, readOnce]);

  const toggleEnabled = async () => {
    setBusy("enable");
    try {
      await fetch("/api/chat-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      await loadQueue();
    } finally { setBusy(""); }
  };

  const saveTestUrl = async () => {
    setBusy("url");
    try {
      await fetch("/api/chat-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testLiveUrl: testUrl.trim() }),
      });
      showAdminToast(testUrl.trim() ? "테스트 라이브 URL을 저장했습니다." : "테스트 URL을 해제했습니다.");
    } finally { setBusy(""); }
  };

  const pickCurrent = async (p: ProductRow | null) => {
    setBusy("current");
    try {
      const body = p ? { productId: p.id, productName: p.name } : { clear: true };
      const res = await fetch("/api/chat-orders/current", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) { showAdminToast("「지금 이거」 변경 실패", "error"); return; }
      setCurrent(json.current ?? null);
      showAdminToast(p ? `「지금 이거」 → ${p.name}` : "「지금 이거」 해제");
    } finally { setBusy(""); }
  };

  const reparse = async () => {
    setBusy("parse");
    try {
      const res = await fetch("/api/chat-orders/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reparseAll: true, limit: 500 }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) { showAdminToast("파싱 실패 — " + (json?.reason || ""), "error"); return; }
      showAdminToast(`전체 재파싱 ${json.updated}건 (상품 ${json.productCount}개 기준)`);
      await loadQueue();
    } finally { setBusy(""); }
  };

  const todayCalls = useMemo(
    () => usage.reduce((s, u) => s + Number(u.calls || 0), 0),
    [usage]
  );

  const view = useMemo(
    () => (onlyOrders ? rows.filter((r) => r.parse_status !== "not_order") : rows),
    [rows, onlyOrders]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[String(r.parse_status || "raw")] = (c[String(r.parse_status || "raw")] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="text-[15px] font-black text-ink">
            💬 채팅 주문 대기열 <span className="text-ink-mute">(검증 단계 — 담기지 않습니다)</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadQueue()} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2">
              새로고침
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[15px] font-black text-ink-mute hover:text-ink">✕</button>
          </div>
        </div>

        {/* 조작 바 */}
        <div className="border-b border-line bg-surface-2 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
            <button
              type="button" onClick={() => void toggleEnabled()} disabled={busy === "enable"}
              className={`rounded-lg px-3 py-1.5 font-black text-white disabled:opacity-50 ${enabled ? "bg-emerald-600" : "bg-slate-400"}`}
            >
              채팅읽기 {enabled ? "ON" : "OFF"}
            </button>
            <button
              type="button" onClick={() => void readOnce()} disabled={busy === "read"}
              className="rounded-lg bg-rose-deep px-3 py-1.5 font-black text-white disabled:opacity-50"
            >
              {busy === "read" ? "읽는중…" : "지금 1회 읽기 + 파싱"}
            </button>
            <label className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink-soft">
              <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
              자동읽기 5초 <span className="text-ink-mute">(쿼터 소모)</span>
            </label>
            <button
              type="button" onClick={() => void reparse()} disabled={busy === "parse"}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-ink-soft hover:bg-surface-2 disabled:opacity-50"
            >
              전체 재파싱
            </button>
            <label className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink-soft">
              <input type="checkbox" checked={onlyOrders} onChange={(e) => setOnlyOrders(e.target.checked)} />
              주문만 보기
            </label>
            <span className="ml-auto text-ink-mute">
              오늘 API 호출 {todayCalls}회 · 접수후보 {counts.parsed || 0} · 상품모름 {counts.need_product || 0} · 후보여럿 {counts.ambiguous || 0}
            </span>
          </div>

          {lastRead ? <div className="mt-1.5 text-[11px] font-black text-ink-mute">최근 읽기: {lastRead}</div> : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={testUrl} onChange={(e) => setTestUrl(e.target.value)}
              placeholder="테스트 라이브 URL (비우면 해제 — 관리자 「방송시작」 없이 그 방송만 읽음)"
              className="min-w-[320px] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink"
            />
            <button type="button" onClick={() => void saveTestUrl()} disabled={busy === "url"}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">
              저장
            </button>
          </div>
        </div>

        {/* 「지금 이거」 */}
        <div className="border-b border-line px-5 py-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-black text-ink-soft">
            <span>🎯 「지금 이거」</span>
            {current ? (
              <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-rose-800">{current.productName || current.productId}</span>
            ) : (
              <span className="text-ink-mute">해제됨 — 상품을 말하지 않은 「저요」는 접수되지 않습니다</span>
            )}
            {current ? (
              <button type="button" onClick={() => void pickCurrent(null)} disabled={busy === "current"}
                className="rounded-lg border border-line bg-surface px-2 py-0.5 text-ink-soft hover:bg-surface-2 disabled:opacity-50">해제</button>
            ) : null}
            <span className="ml-auto text-ink-mute">
              파싱 기준 상품 {products.length}개 ({broadcastSource === "live" ? "방송중" : broadcastSource === "recent" ? "최근 방송" : "없음"})
            </span>
          </div>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {products.length === 0 ? (
              <span className="text-[11px] font-black text-ink-mute">방송에 담긴 상품이 없습니다.</span>
            ) : products.map((p) => {
              const on = current?.productId === p.id;
              return (
                <button
                  key={p.id} type="button" onClick={() => void pickCurrent(p)} disabled={busy === "current"}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-black disabled:opacity-50 ${on ? "border-rose-400 bg-rose-100 text-rose-800" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}
                  title={p.variants && p.variants.length > 0 ? `세부상품 ${p.variants.length}종` : undefined}
                >
                  {p.name}{p.variants && p.variants.length > 0 ? ` (${p.variants.length}종)` : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* 대기열 */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface-2 text-[11px] font-black text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">시각</th>
                <th className="px-3 py-2 text-left">닉네임</th>
                <th className="px-3 py-2 text-left">채팅 원문</th>
                <th className="px-3 py-2 text-left">판정</th>
                <th className="px-3 py-2 text-left">상품</th>
                <th className="px-3 py-2 text-left">세부상품</th>
                <th className="px-3 py-2 text-right">수량</th>
                <th className="px-3 py-2 text-left">옵션</th>
                <th className="px-3 py-2 text-left">근거</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-[12px] font-black text-ink-mute">읽어온 채팅이 없습니다.</td></tr>
              ) : view.map((r) => {
                const st = STATUS_META[String(r.parse_status || "raw")] || STATUS_META.raw;
                return (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-mute">{timeText(r.published_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-black text-ink">{r.display_name || ""}</td>
                    <td className="px-3 py-2 text-ink">{r.raw_message || ""}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2 font-bold text-ink">{r.parsed_product_name || ""}</td>
                    <td className="px-3 py-2 text-ink">{r.parsed_variant || ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-black text-ink">{r.parse_status === "parsed" ? (r.parsed_qty ?? 1) : ""}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.parsed_options || ""}</td>
                    <td className="px-3 py-2 text-[11px] text-ink-mute">
                      {r.parsed_matched_by ? <b className="text-ink-soft">{MATCHED_LABEL[r.parsed_matched_by] || r.parsed_matched_by}</b> : null}
                      {r.parsed_matched_by && r.parsed_reason ? " · " : ""}
                      {r.parsed_reason || ""}
                      {r.parsed_candidates ? <div className="mt-0.5 text-amber-700">후보: {r.parsed_candidates}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line bg-surface-2 px-5 py-2 text-[11px] font-black text-ink-mute">
          이 화면은 판정 결과만 보여줍니다. 손님 장바구니에 담는 동작은 아직 없습니다.
        </div>
      </div>
    </div>
  );
}
