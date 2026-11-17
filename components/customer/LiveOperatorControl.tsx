"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BotCandidate } from "@/lib/liveChatBot";
import { ChatProductThumb } from "./ChatProductThumb";
import { buildBatchAnnouncement, resolveOperatorCodes, type OperatorBatchResult } from "@/lib/liveOperatorBatch";

type Props = {
  broadcastId: string;
  adminMode: boolean;
  onModeChange: (value: boolean) => void;
  busy: boolean;
  desktopDock?: boolean;
  dockRight?: string | number;
  onOpenChange?: (open: boolean) => void;
  onIntroduce: (items: BotCandidate[], options: { mode: "replace" | "append"; replaceIntro: boolean }) => Promise<{ok: boolean; message?: string}>;
};

const ui: Record<string, CSSProperties> = {
  chip: { border: "1px solid #555", borderRadius: 999, background: "#242424", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 13px", cursor: "pointer", minHeight: 38 },
  action: { border: 0, borderRadius: 10, background: "#fff", color: "#151515", fontSize: 13, fontWeight: 800, minHeight: 42, padding: "0 12px", cursor: "pointer" },
};

export default function LiveOperatorControl({ broadcastId, adminMode, onModeChange, busy, onIntroduce, desktopDock = false, dockRight = "0px", onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (desktopDock && adminMode) setOpen(true); }, [desktopDock, adminMode]);
  useEffect(() => { onOpenChange?.(Boolean(open && adminMode && desktopDock)); }, [open, adminMode, desktopDock, onOpenChange]);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<BotCandidate[]>([]);
  const [recent, setRecent] = useState<BotCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [replaceIntro, setReplaceIntro] = useState(false);
  const [preview, setPreview] = useState<BotCandidate | null>(null);
  const [pickedCodes, setPickedCodes] = useState<string[]>([]);
  const [lastNotice, setLastNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setOpen(false); setCatalog([]); setRecent([]); setQuery(""); setMessage(""); setPickedCodes([]); setReplaceIntro(false); setPreview(null); }, [broadcastId]);
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
  const batch: OperatorBatchResult = useMemo(() => resolveOperatorCodes(query, catalog), [query, catalog]);
  const pickedItems = useMemo(() => pickedCodes.flatMap(code => catalog.filter(item => {
    const result = resolveOperatorCodes(code, catalog);
    return result.matched.length === 1 && result.matched[0] === item;
  })), [pickedCodes, catalog]);
  const selected = [...new Map(pickedItems.map(item => [`${item.productId}:${item.detailName}`, item])).values()];
  const canSubmit = !busy && !running && !loading && selected.length > 0 && selected.length <= 20 && selected.every(p => !p.soldOut);
  const addCodes = () => {
    if (!query.trim()) return;
    if (batch.invalid.length || batch.ambiguous.length) {
      setMessage([...batch.invalid.map(code => `${code}: 상품 없음`), ...batch.ambiguous.map(code => `${code}: 중복 코드`)].join(" / "));
      return;
    }
    if (!batch.matched.length) { setMessage("상품코드를 입력해 주세요."); return; }
    const codes = [...new Set([...pickedCodes, ...batch.codes])];
    if (codes.length > 20) { setMessage("한 번에 최대 20개까지 선택할 수 있어요."); return; }
    setPickedCodes(codes); setQuery(""); setMessage("");
  };
  const apply = async (items: BotCandidate[], mode: "replace" | "append") => {
    if (busy || running || loading || !items.length || items.some(p => p.soldOut)) return;
    setRunning(true); setMessage("");
    try {
      const result = await onIntroduce(items, { mode, replaceIntro: mode === "replace" && replaceIntro });
      if (result.ok) {
        setRecent(prev => [...items, ...prev.filter(old => !items.some(p => old.productId === p.productId && old.detailName === p.detailName))].slice(0, 6));
        setQuery(""); setPickedCodes([]); setReplaceIntro(false);
        setLastNotice(result.message || (items.length > 1 ? `${items.length}개 상품 소개 완료` : "상품 소개 완료"));
      } else setMessage(result.message || "상품 소개에 실패했어요. 다시 확인해 주세요.");
    } catch { setMessage("네트워크 오류가 발생했어요. 현재 상품 상태를 확인해 주세요."); }
    finally { setRunning(false); }
  };
  return <div data-live-operator-control="1" data-operator-dock={desktopDock && open && adminMode ? "open" : "closed"} style={{ position: "fixed", zIndex: 75,
    ...(desktopDock && open && adminMode ? { top: 0, bottom: 0, right: dockRight, left: "auto", transform: "none", width: 350, padding: "8px", boxSizing: "border-box", borderLeft: "1px solid #414141", background: "#111", display: "flex", flexDirection: "column" } : { top: adminMode ? "calc(64px + env(safe-area-inset-top))" : "auto", bottom: adminMode ? "auto" : "calc(90px + env(safe-area-inset-bottom))", right: desktopDock && adminMode ? dockRight : 8, left: "auto", transform: "none", width: adminMode ? "min(440px, calc(100vw - 16px))" : "auto" }),
    color: "#fff", fontFamily: "inherit", pointerEvents: "none" }}>
    <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", gap: 6, padding: 4, margin: "0 auto", width: "fit-content", maxWidth: "100%", border: "1px solid #424242", borderRadius: 999, background: "rgba(15,15,15,.95)", boxShadow: "0 2px 16px #0008" }}>
      <button type="button" onClick={() => { onModeChange(true); setOpen(false); }} aria-pressed={adminMode} style={{ ...ui.chip, background: adminMode ? "#fff" : "transparent", color: adminMode ? "#111" : "#ccc", border: "none" }}>{adminMode ? "관리자 모드" : "관리자 복귀"}</button>
      {adminMode ? <button type="button" onClick={() => { onModeChange(false); setOpen(false); }} aria-pressed={!adminMode} style={{ ...ui.chip, background: !adminMode ? "#fff" : "transparent", color: !adminMode ? "#111" : "#ccc", border: "none" }}>시청자 모드</button> : null}
      {adminMode ? <button type="button" style={ui.chip} aria-expanded={open} onClick={() => setOpen(v => !v)}>상품 바로 소개 {open ? "▲" : "▼"}</button> : null}
    </div>
    {lastNotice && !open && adminMode ? <div role="status" style={{ pointerEvents: "auto", background: "#164b34", borderRadius: 10, padding: 9, marginTop: 7, fontSize: 12 }} onClick={() => setLastNotice("")}>{lastNotice} ✕</div> : null}
    {open && adminMode ? <section aria-label="상품 바로 소개" style={{ pointerEvents: "auto", marginTop: 8, background: "#161616", border: "1px solid #555", boxShadow: "0 12px 32px #000b", borderRadius: 14, padding: 12, maxHeight: desktopDock ? "none" : "min(530px, calc(100dvh - 150px))", flex: desktopDock ? 1 : undefined, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><strong style={{ flex: 1, fontSize: 15 }}>상품 검색 → 한 번 눌러 소개</strong><button type="button" onClick={() => setOpen(false)} aria-label="상품 바로 소개 닫기" style={ui.chip}>✕</button></div>
      <input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="상품코드 여러 개: BB-111 BB-112, MC-348" aria-label="바로 소개 상품 검색" onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (batch.codes.length && batch.codes.every(code => /^[A-Z]{1,8}-?\d{2,6}[A-Z]?$/.test(code))) { if (batch.matched.length === 1 && batch.codes.length === 1 && !batch.invalid.length && !batch.ambiguous.length && !selected.length) void apply(batch.matched, "replace"); else addCodes(); } else if (results.length === 1) void apply([results[0]], "replace"); } }} style={{ width: "100%", boxSizing: "border-box", height: 46, border: "1px solid #666", borderRadius: 10, background: "#272727", color: "#fff", padding: "0 12px", fontSize: 15, outlineOffset: 2 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" disabled={!query.trim() || running || busy} onClick={addCodes} style={{ ...ui.action, background: "#cde1ff", color: "#111" }}>코드 한꺼번에 담기</button>
        <span style={{ fontSize: 11, alignSelf: "center", color: "#aaa" }}>띄어쓰기·쉼표·줄바꿈 가능 · Enter로 담기</span>
      </div>
      {selected.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }} aria-label="선택한 상품 코드">{pickedCodes.map(code => <button key={code} type="button" disabled={running || busy} onClick={() => setPickedCodes(prev => prev.filter(value => value !== code))} style={{ ...ui.chip, borderColor: "#7fa3d1", background: "#26384b" }}>{code} ×</button>)}</div> : null}
      <div style={{ color: "#bbb", fontSize: 12, padding: "8px 2px" }}>{selected.length ? `담은 상품 ${selected.length}/20개` : query ? `검색 결과 ${results.length}개` : "최근 소개 상품 · 처음에는 검색해 주세요"}</div>
      {selected.length ? <div style={{ background: "#252525", borderRadius: 8, padding: 10, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.65 }} aria-label="상품 안내문 자동 생성">{buildBatchAnnouncement(selected)}<div style={{ marginTop: 8 }}><button type="button" style={{ ...ui.action, minHeight: 34 }} onClick={() => void navigator.clipboard.writeText(buildBatchAnnouncement(selected)).then(() => setMessage("안내 문구를 복사했어요.")).catch(() => setMessage("복사 권한을 확인해 주세요."))}>안내 문구 복사</button></div></div> : null}
      {selected.length ? <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button type="button" disabled={!canSubmit} onClick={() => void apply(selected, "replace")} style={{ ...ui.action, flex: 1 }}>선택 상품 소개·순환</button><button type="button" disabled={!canSubmit} onClick={() => void apply(selected, "append")} style={{ ...ui.action, flex: 1, background: "#393939", color: "#fff", border: "1px solid #555" }}>기존 순환에 추가</button></div> : null}
      <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 12, marginTop: 9, color: "#eee" }}><input type="checkbox" checked={replaceIntro} onChange={e => setReplaceIntro(e.target.checked)} disabled={running || busy} style={{ width: 17, height: 17 }} />기존 소개영상 위치도 지금 장면으로 변경</label>
      <div style={{ color: "#aaa", fontSize: 11, marginTop: 3 }}>체크하지 않으면 처음 저장한 영상 위치를 유지해요. 영상 시간 확인이 안 되면 변경하지 않아요.</div>
      {loading ? <p role="status">상품을 불러오는 중…</p> : null}
      {message ? <p role="alert" style={{ color: "#ffc7a6", fontSize: 13 }}>{message}</p> : null}
      {lastNotice ? <p role="status" style={{ color: "#a4e4bd", fontSize: 12 }}>{lastNotice}</p> : null}
      <div data-live-scroll="1" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {results.map(p => <button key={`${p.productId}:${p.detailName}`} type="button" disabled={busy || running || p.soldOut} onClick={() => void apply([p], "replace")} style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 62, gap: 10, padding: "6px 8px", border: 0, borderBottom: "1px solid #333", background: "transparent", color: p.soldOut ? "#999" : "#fff", textAlign: "left", cursor: p.soldOut ? "not-allowed" : "pointer" }}>
          <span data-operator-thumbnail="1" role="button" tabIndex={0} aria-label={`${p.texts?.[0] || p.line} 사진 확대`} onClick={e => { e.stopPropagation(); setPreview(p); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setPreview(p); } }}><ChatProductThumb src={p.imageUrl} name={p.texts?.[0] || p.line} size={46} placeholder /></span>
          <span style={{ flex: 1, overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.45 }}>{p.line}</span>
          <span style={{ flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: p.soldOut ? "#444" : "#fff", color: p.soldOut ? "#aaa" : "#111", fontSize: 12, fontWeight: 800 }}>{p.soldOut ? "품절" : (running || busy) ? "적용 중" : "바로 소개"}</span>
        </button>)}
        {!loading && query.trim() && !results.length ? <p style={{ fontSize: 13, color: "#ccc" }}>검색된 방송 상품이 없어요. 상품코드를 확인해 주세요.</p> : null}
      </div>
      {preview ? <div role="dialog" aria-label="등록된 원본 상품사진 확대" style={{ position: "absolute", inset: 0, zIndex: 9, background: "rgba(0,0,0,.97)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" onClick={() => setPreview(null)} style={{ ...ui.chip, alignSelf: "flex-end" }}>사진 닫기 ✕</button>
        {preview.imageUrl ? <img src={preview.imageUrl} alt={preview.texts?.[0] || preview.line} style={{ width: "100%", minHeight: 0, flex: 1, objectFit: "contain", background: "#fff", borderRadius: 9 }} /> : <p>등록된 상품 사진이 없어요.</p>}
        <strong style={{ fontSize: 12 }}>{preview.line}</strong>
      </div> : null}
      <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>사진을 누르면 원본을 확대해요. 소개 버튼은 위젯과 사이트 상품 카드를 함께 바꿔요. 기존 소개영상 위치는 기본 보호됩니다.</div>
    </section> : null}
  </div>;
}
