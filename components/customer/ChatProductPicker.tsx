"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotCandidate } from "@/lib/liveChatBot";
import { CHAT_PRODUCT_LIMIT, searchChatProductGroups } from "@/lib/liveChatProductCommand";
import { widgetTargetKey } from "@/lib/widgetProductLibrary";
import { ChatProductThumb } from "./ChatProductThumb";

export function ChatProductPicker({ broadcastId, query, busy, onApply, onIntro, onClose }: {
  broadcastId: string; query: string; busy: boolean; onIntro?: (items: BotCandidate[]) => void;
  onApply: (items: BotCandidate[], mode: "replace" | "append") => void; onClose: () => void;
}) {
  const [items, setItems] = useState<BotCandidate[]>([]);
  const [status, setStatus] = useState("상품을 불러오는 중…");
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<{ query: string; keys: string[] }>({ query: "", keys: [] });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setChosen([]); setStatus("상품을 불러오는 중…");
    const kid = localStorage.getItem("ruru_kakao_id") || "";
    void fetch(`/api/live-chat/products?${new URLSearchParams({ bc: broadcastId, kakao_id: kid })}`, { cache: "no-store", signal: controller.signal })
      .then(r => r.json()).then(j => {
        if (controller.signal.aborted) return;
        if (!j.ok) throw new Error(j.message);
        setItems(j.items); setStatus("");
      }).catch(e => { if (!controller.signal.aborted) setStatus(e.message || "상품을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [broadcastId, attempt]);
  const groups = useMemo(() => searchChatProductGroups(query, items), [items, query]);
  const multi = groups.length > 1;
  const filtered = useMemo(() => [...new Map(groups.filter(g => !multi || g.term).flatMap(g => g.items).map(p => [widgetTargetKey(p), p])).values()], [groups, multi]);
  // Reconcile automatic matches with the CURRENT query, so typing BB-307 cannot retain BB-30.
  // Only explicit checkbox choices survive a different search.
  const autoKeys = multi ? groups.filter(g => g.term && g.items.length === 1 && !g.items[0].soldOut).map(g => widgetTargetKey(g.items[0])) : [];
  const excludedKeys = excluded.query === query ? excluded.keys : [];
  const selectedKeys = [...new Set([...chosen, ...autoKeys.filter(key => !excludedKeys.includes(key))])].slice(0, CHAT_PRODUCT_LIMIT);
  const selected = selectedKeys.flatMap(key => items.filter(p => widgetTargetKey(p) === key));
  useEffect(() => setActive(0), [query, items]);
  useEffect(() => { box.current?.querySelector(`[data-product-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const toggle = useCallback((p: BotCandidate) => {
    if (busy || p.soldOut) return;
    const key = widgetTargetKey(p);
    if (selectedKeys.includes(key)) {
      setChosen(prev => prev.filter(k => k !== key));
      setExcluded(prev => ({ query, keys: [...(prev.query === query ? prev.keys : []), key] }));
    } else if (selectedKeys.length < CHAT_PRODUCT_LIMIT) {
      setChosen(prev => [...prev, key]);
      setExcluded(prev => ({ query, keys: (prev.query === query ? prev.keys : []).filter(k => k !== key) }));
    }
  }, [busy, query, selectedKeys]);
  const unresolved = multi ? groups.filter(g => !g.term || !g.items.some(p => selectedKeys.includes(widgetTargetKey(p)))) : [];
  const missing = groups.filter(g => g.term && !g.items.length);
  const canApply = !busy && !status && selected.length > 0 && !unresolved.length && !missing.length;
  // Capture the composer keys before its ordinary chat/emoji Enter handler.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLInputElement) || !e.target.hasAttribute("data-live-chat-input") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } return; }
      if (!["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (busy) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") { if (!e.repeat && filtered[active]) toggle(filtered[active]); }
      else setActive(i => Math.max(0, Math.min(filtered.length - 1, i + (e.key === "ArrowUp" ? -1 : 1))));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [filtered, active, busy, toggle, onClose]);
  return <section aria-label="방송 상품 선택" style={{ color: "#fff", background: "#202020", border: "1px solid #555", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
    <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 8 }}><strong style={{ flex: 1, fontSize: 14 }}>소개할 상품 선택 · {selected.length}/{CHAT_PRODUCT_LIMIT}</strong><button type="button" disabled={busy} aria-label="상품 선택 닫기" onClick={onClose} style={{ background: "none", border: 0, color: "#fff", minWidth: 44, minHeight: 44 }}>✕</button></div>
    <div style={{ padding: "0 12px 8px", color: "#bbb", fontSize: 12 }}>여러 상품은 쉼표로 검색 · ↑↓ 이동 · Enter 선택/해제</div>
    {selected.length > 0 && <div aria-label="선택한 상품" data-live-scroll="1" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 12px 8px" }}>{selected.map(p => <button type="button" key={widgetTargetKey(p)} disabled={busy} aria-label={`${p.texts[0]} 선택 해제`} onClick={() => toggle(p)} style={{ flexShrink: 0, minHeight: 44, borderRadius: 8, border: "1px solid #6785a9", background: "#2d4059", color: "#fff", padding: "4px 10px", fontSize: 12 }}>{p.texts[0]} ×</button>)}</div>}
    {status ? <div role="status" style={{ padding: 12 }}>{status}{!status.includes("중") && <button type="button" onClick={() => setAttempt(n => n + 1)}>다시 시도</button>}</div> : null}
    {!status && (missing.length > 0 || unresolved.length > 0) && <div role="status" style={{ padding: "4px 12px 8px", color: "#ffd794", fontSize: 12 }}>{missing.length ? `못 찾은 항목: ${missing.map(g => g.term).join(", ")}` : `상품을 선택해 주세요: ${unresolved.map(g => g.term || "쉼표 뒤 상품명").join(", ")}`}</div>}
    {selected.length === CHAT_PRODUCT_LIMIT && <div style={{ padding: "4px 12px", color: "#ffd794", fontSize: 12 }}>한 번에 {CHAT_PRODUCT_LIMIT}개까지 선택할 수 있어요.</div>}
    <div ref={box} data-live-scroll="1" role="listbox" aria-multiselectable="true" aria-label="방송 상품" style={{ maxHeight: "min(240px, 26dvh)", overflowY: "auto", overscrollBehavior: "contain" }}>
      {filtered.map((p, i) => {
        const checked = selectedKeys.includes(widgetTargetKey(p));
        return <button key={widgetTargetKey(p)} data-product-index={i} type="button" role="option" aria-label={p.line} aria-selected={checked} disabled={busy || p.soldOut || (!checked && selected.length >= CHAT_PRODUCT_LIMIT)} onPointerDown={e => e.preventDefault()} onClick={() => toggle(p)} onFocus={() => setActive(i)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 12px", minHeight: 64, border: 0, borderTop: "1px solid #333", background: active === i ? "#344052" : checked ? "#273344" : "transparent", color: p.soldOut ? "#999" : "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1.5 }}>
          <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 20 }}>{checked ? "☑" : "☐"}</span><ChatProductThumb src={p.imageUrl} name={p.texts[0]} size={48} placeholder /><span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{p.line}{p.soldOut ? " · 품절" : ""}</span>
        </button>;
      })}
      {!status && !filtered.length && <div style={{ padding: 12 }}>일치하는 방송 상품이 없어요.</div>}
    </div>
    <div style={{ padding: 10, borderTop: "1px solid #444" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {([['replace', '선택 상품으로 순환'], ['append', '기존 순환에 추가']] as const).map(([mode, label]) => <button key={mode} type="button" data-product-apply={mode} disabled={!canApply} onClick={() => { if (canApply) onApply(selected, mode); }} style={{ flex: 1, minHeight: 44, border: "1px solid #666", borderRadius: 8, padding: "6px 8px", background: mode === "replace" ? "#fff" : "#303030", color: mode === "replace" ? "#111" : "#fff", opacity: canApply ? 1 : 0.45, fontSize: 12, fontWeight: 700 }}>{busy ? "적용 중…" : label}</button>)}
      </div>
      <div style={{ color: "#aaa", fontSize: 11, marginTop: 6 }}>선택 상품이 유튜브 위젯과 사이트 상품 카드에 함께 표시돼요.</div>
      {onIntro && <button type="button" disabled={busy || selected.length === 0} onClick={() => onIntro(selected)} style={{ width: "100%", minHeight: 44, marginTop: 8, border: "1px solid #666", borderRadius: 8, background: "transparent", color: "#fff", opacity: busy || selected.length === 0 ? 0.45 : 1, fontSize: 12, fontWeight: 700 }}>소개영상 위치 다시 정하기 · 지우기</button>}
    </div>
  </section>;
}
