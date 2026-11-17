"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BotCandidate } from "@/lib/liveChatBot";
import { ChatProductThumb } from "./ChatProductThumb";

type Props = {
  broadcastId: string;
  adminMode: boolean;
  onModeChange: (value: boolean) => void;
  busy: boolean;
  onIntroduce: (item: BotCandidate) => Promise<boolean>;
};

const ui: Record<string, CSSProperties> = {
  chip: { border: "1px solid #555", borderRadius: 999, background: "#242424", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 13px", cursor: "pointer", minHeight: 38 },
  action: { border: 0, borderRadius: 10, background: "#fff", color: "#151515", fontSize: 13, fontWeight: 800, minHeight: 42, padding: "0 12px", cursor: "pointer" },
};

export default function LiveOperatorControl({ broadcastId, adminMode, onModeChange, busy, onIntroduce }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<BotCandidate[]>([]);
  const [recent, setRecent] = useState<BotCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setOpen(false); setCatalog([]); setRecent([]); setQuery(""); setMessage(""); }, [broadcastId]);
  useEffect(() => {
    if (!open || !adminMode || !broadcastId) return;
    const controller = new AbortController();
    setLoading(true); setMessage("");
    const kakaoId = (() => { try { return localStorage.getItem("ruru_kakao_id") || ""; } catch { return ""; } })();
    void fetch(`/api/live-chat/products?${new URLSearchParams({ bc: broadcastId, kakao_id: kakaoId })}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok || !data?.ok || !Array.isArray(data.items)) throw new Error(data?.message || "상품을 불러오지 못했어요."); return data.items as BotCandidate[]; })
      .then(items => { if (!controller.signal.aborted) setCatalog(items); })
      .catch(e => { if (!controller.signal.aborted) setMessage(e?.message || "상품을 불러오지 못했어요."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [broadcastId, open, adminMode]);
  useEffect(() => { if (open && adminMode) requestAnimationFrame(() => input.current?.focus()); }, [open, adminMode]);
  const results = useMemo(() => {
    const terms = query.toLocaleLowerCase("ko-KR").trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return recent;
    return catalog.filter(p => {
      const haystack = [p.line, ...(p.texts || []), p.detailName || ""].join(" ").toLocaleLowerCase("ko-KR");
      return terms.every(t => haystack.includes(t));
    }).slice(0, 12);
  }, [catalog, query, recent]);
  const apply = async (p: BotCandidate) => {
    if (busy || running || loading || p.soldOut) return;
    setRunning(true); setMessage("");
    let success = false;
    try { success = await onIntroduce(p); } catch { success = false; }
    if (success) {
      setRecent(prev => [p, ...prev.filter(old => old.productId !== p.productId || old.detailName !== p.detailName)].slice(0, 6));
      setQuery(""); setOpen(false);
    } else setMessage("소개 적용에 실패했어요. 이전 상품은 그대로 두고 다시 시도해 주세요.");
    setRunning(false);
  };
  return <div data-live-operator-control="1" style={{ position: "fixed", zIndex: 75, top: "calc(6px + env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", width: "min(440px, calc(100vw - 16px))", color: "#fff", fontFamily: "inherit", pointerEvents: "none" }}>
    <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", gap: 6, padding: 4, margin: "0 auto", width: "fit-content", maxWidth: "100%", border: "1px solid #424242", borderRadius: 999, background: "rgba(15,15,15,.95)", boxShadow: "0 2px 16px #0008" }}>
      <button type="button" onClick={() => { onModeChange(true); setOpen(false); }} aria-pressed={adminMode} style={{ ...ui.chip, background: adminMode ? "#fff" : "transparent", color: adminMode ? "#111" : "#ccc", border: "none" }}>관리자 모드</button>
      <button type="button" onClick={() => { onModeChange(false); setOpen(false); }} aria-pressed={!adminMode} style={{ ...ui.chip, background: !adminMode ? "#fff" : "transparent", color: !adminMode ? "#111" : "#ccc", border: "none" }}>시청자 화면</button>
      {adminMode ? <button type="button" style={ui.chip} aria-expanded={open} onClick={() => setOpen(v => !v)}>상품 바로 소개 {open ? "▲" : "▼"}</button> : null}
    </div>
    {open && adminMode ? <section aria-label="상품 바로 소개" style={{ pointerEvents: "auto", marginTop: 8, background: "#161616", border: "1px solid #555", boxShadow: "0 12px 32px #000b", borderRadius: 14, padding: 12, maxHeight: "min(530px, calc(100dvh - 75px))", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><strong style={{ flex: 1, fontSize: 15 }}>상품 검색 → 한 번 눌러 소개</strong><button type="button" onClick={() => setOpen(false)} aria-label="상품 바로 소개 닫기" style={ui.chip}>✕</button></div>
      <input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="예: BB-111 / 상품명 / 브랜드" aria-label="바로 소개 상품 검색" onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && !e.nativeEvent.isComposing && results.length === 1) void apply(results[0]); }} style={{ width: "100%", boxSizing: "border-box", height: 46, border: "1px solid #666", borderRadius: 10, background: "#272727", color: "#fff", padding: "0 12px", fontSize: 15, outlineOffset: 2 }} />
      <div style={{ color: "#bbb", fontSize: 12, padding: "8px 2px" }}>{query ? `검색 결과 ${results.length}개` : "최근 소개 상품 · 처음에는 검색해 주세요"} · 1개일 때 Enter 가능</div>
      {loading ? <p role="status">상품을 불러오는 중…</p> : null}
      {message ? <p role="alert" style={{ color: "#ffc7a6", fontSize: 13 }}>{message}</p> : null}
      <div data-live-scroll="1" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {results.map(p => <button key={`${p.productId}:${p.detailName}`} type="button" disabled={busy || running || p.soldOut} onClick={() => void apply(p)} style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 62, gap: 10, padding: "6px 8px", border: 0, borderBottom: "1px solid #333", background: "transparent", color: p.soldOut ? "#999" : "#fff", textAlign: "left", cursor: p.soldOut ? "not-allowed" : "pointer" }}>
          <ChatProductThumb src={p.imageUrl} name={p.texts?.[0] || p.line} size={46} placeholder />
          <span style={{ flex: 1, overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.45 }}>{p.line}</span>
          <span style={{ flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: p.soldOut ? "#444" : "#fff", color: p.soldOut ? "#aaa" : "#111", fontSize: 12, fontWeight: 800 }}>{p.soldOut ? "품절" : (running || busy) ? "적용 중" : "바로 소개"}</span>
        </button>)}
        {!loading && query.trim() && !results.length ? <p style={{ fontSize: 13, color: "#ccc" }}>검색된 방송 상품이 없어요. 상품코드를 확인해 주세요.</p> : null}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>기존 관리자 상품 명령을 재사용해 유튜브 위젯과 사이트 상품 카드를 함께 변경합니다. 영상 위치는 유효한 재생 정보가 있을 때만 기록하며, 기존 위치는 유지합니다.</div>
    </section> : null}
  </div>;
}
