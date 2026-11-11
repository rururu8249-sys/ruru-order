"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BotCandidate } from "@/lib/liveChatBot";
import { brandNameCodePrefixes, brandQueryVariants, detailCodePrefix, normalizeProductSearchText } from "@/lib/productSearch";
import { widgetTargetKey } from "@/lib/widgetProductLibrary";

export function ChatProductPicker({ broadcastId, query, busy, onSelect, onClose }: {
  broadcastId: string; query: string; busy: boolean;
  onSelect: (item: BotCandidate) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<BotCandidate[]>([]);
  const [status, setStatus] = useState("상품을 불러오는 중…");
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setStatus("상품을 불러오는 중…");
    const kid = localStorage.getItem("ruru_kakao_id") || "";
    void fetch(`/api/live-chat/products?${new URLSearchParams({ bc: broadcastId, kakao_id: kid })}`, { cache: "no-store", signal: controller.signal })
      .then(r => r.json()).then(j => {
        if (!j.ok) throw new Error(j.message);
        setItems(j.items); setStatus("");
      }).catch(e => { if (!controller.signal.aborted) setStatus(e.message || "상품을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [broadcastId, attempt]);
  const filtered = useMemo(() => {
    const q = normalizeProductSearchText(query);
    const variants = [q, ...brandQueryVariants(q)];
    const brandCodes = new Set(brandNameCodePrefixes(q));
    return items.filter(p => !q || p.texts.some(t => brandCodes.has(detailCodePrefix(t)))
      || variants.some(v => p.texts.some(t => normalizeProductSearchText(t).includes(v))));
  }, [items, query]);
  useEffect(() => setActive(0), [query, items]);
  useEffect(() => { box.current?.querySelector(`[data-product-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  // Capture the composer keys before its ordinary chat/emoji Enter handler.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLInputElement) || !e.target.hasAttribute("data-live-chat-input") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } return; }
      if (!["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") { if (!busy && !e.repeat && filtered[active] && !filtered[active].soldOut) onSelect(filtered[active]); }
      else setActive(i => Math.max(0, Math.min(filtered.length - 1, i + (e.key === "ArrowUp" ? -1 : 1))));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [filtered, active, busy, onSelect, onClose]);
  return <section aria-label="방송 상품 선택" style={{ color: "#fff", background: "#202020", border: "1px solid #555", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}><strong style={{ flex: 1, fontSize: 14 }}>소개할 상품 선택</strong><button type="button" aria-label="상품 선택 닫기" onClick={onClose} style={{ background: "none", border: 0, color: "#fff", padding: 8 }}>✕</button></div>
    <div style={{ padding: "0 12px 8px", color: "#bbb", fontSize: 12 }}>선택하면 단독 순환 · 사이트 채팅 안내</div>
    {status ? <div role="status" style={{ padding: 12 }}>{status}{!status.includes("중") && <button type="button" onClick={() => setAttempt(n => n + 1)}>다시 시도</button>}</div> : null}
    <div ref={box} data-live-scroll="1" role="listbox" aria-label="방송 상품" style={{ maxHeight: "min(240px, 30dvh)", overflowY: "auto", overscrollBehavior: "contain" }}>
      {filtered.map((p, i) => <button key={widgetTargetKey(p)} data-product-index={i} type="button" role="option" aria-selected={active === i} disabled={busy || p.soldOut} onPointerDown={e => e.preventDefault()} onClick={() => onSelect(p)} onFocus={() => setActive(i)} style={{ width: "100%", textAlign: "left", padding: "12px", border: 0, borderTop: "1px solid #333", background: active === i ? "#344052" : "transparent", color: p.soldOut ? "#999" : "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1.5 }}>
        {p.line}{p.soldOut ? " · 품절" : ""}
      </button>)}
      {!status && !filtered.length && <div style={{ padding: 12 }}>일치하는 방송 상품이 없어요.</div>}
    </div>
  </section>;
}
